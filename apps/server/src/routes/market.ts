import { sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAccount, requireActive } from '../auth/session';
import type { Db } from '../db/client';
import { fail } from '../errors';
import { applyDelta } from '../services/wallet';
import { makeGuards } from './guards';

const listingId = z.object({ id: z.string().uuid() });
const createInput = z.object({ instanceId: z.string().uuid(), priceSilver: z.number().int().min(1).max(1_000_000_000) });
const operation = z.object({ idempotencyKey: z.string().uuid() });

export function registerMarketRoutes(app: FastifyInstance, db: Db): void {
  const { authed } = makeGuards(app, db);
  app.get('/api/market', async () => {
    const listings = await db.execute(sql`
      SELECT m.id, m.item_id, m.price_silver, m.created_at, u.uid AS seller_uid
      FROM market_listings m JOIN users u ON u.id = m.seller_id
      WHERE m.status = 'active' ORDER BY m.created_at DESC LIMIT 100
    `);
    return { listings };
  });
  app.post('/api/market', { preHandler: authed }, async (req) => {
    const user = requireActive(requireAccount(req));
    const { instanceId, priceSilver } = createInput.parse(req.body);
    return db.transaction(async (tx) => {
      const items = await tx.execute<{ item_id: string }>(sql`
        SELECT i.item_id FROM inventory_items i JOIN catalog_items c ON c.id = i.item_id
        WHERE i.id = ${instanceId}::uuid AND i.user_id = ${user.id}::uuid
          AND c.tradable = true AND c.status = 'released' AND i.kind = 'collectible'
          AND (i.expires_at IS NULL OR i.expires_at > now())
          AND NOT EXISTS (SELECT 1 FROM market_listings ml WHERE ml.instance_id = i.id AND ml.status = 'active')
        FOR UPDATE OF i
      `);
      if (!items.length) throw fail('forbidden');
      const rows = await tx.execute<{ id: string }>(sql`
        INSERT INTO market_listings(seller_id, instance_id, item_id, price_silver)
        VALUES (${user.id}::uuid, ${instanceId}::uuid, ${items[0]!.item_id}, ${priceSilver})
        RETURNING id
      `);
      return { id: rows[0]!.id };
    });
  });
  app.post('/api/market/:id/buy', { preHandler: authed }, async (req) => {
    const user = requireActive(requireAccount(req));
    const { id } = listingId.parse(req.params);
    const { idempotencyKey } = operation.parse(req.body);
    return db.transaction(async (tx) => {
      // Lock listing before balances; seller and buyer wallets are serialized by wallet updates.
      const existing = await tx.execute<{ user_id: string; listing_id: string; kind: string }>(sql`
        SELECT user_id, listing_id, kind FROM market_operations WHERE id = ${idempotencyKey}::uuid
      `);
      if (existing.length) {
        if (existing[0]!.user_id !== user.id || existing[0]!.listing_id !== id || existing[0]!.kind !== 'buy') throw fail('idempotency_conflict');
        return { id, replayed: true };
      }
      const listings = await tx.execute<{ seller_id: string; instance_id: string; price_silver: string }>(sql`
        SELECT seller_id, instance_id, price_silver FROM market_listings
        WHERE id = ${id}::uuid AND status = 'active' FOR UPDATE
      `);
      if (!listings.length) throw fail('not_found');
      const listing = listings[0]!;
      if (listing.seller_id === user.id) throw fail('forbidden');
      const owned = await tx.execute(sql`SELECT 1 FROM inventory_items WHERE id = ${listing.instance_id}::uuid AND user_id = ${listing.seller_id}::uuid AND (expires_at IS NULL OR expires_at > now()) FOR UPDATE`);
      if (!owned.length) throw fail('not_found');
      const price = Number(listing.price_silver);
      if (!Number.isSafeInteger(price)) throw fail('bad_request');
      await applyDelta(tx, user.id, -price, 'shop', null, 'silver', `market:buy:${id}`);
      await applyDelta(tx, listing.seller_id, price, 'payout', null, 'silver', `market:sell:${id}`);
      await tx.execute(sql`UPDATE inventory_items SET user_id = ${user.id}::uuid WHERE id = ${listing.instance_id}::uuid`);
      await tx.execute(sql`UPDATE market_listings SET status = 'sold', buyer_id = ${user.id}::uuid, completed_at = now() WHERE id = ${id}::uuid`);
      await tx.execute(sql`INSERT INTO market_operations(id, user_id, listing_id, kind) VALUES (${idempotencyKey}::uuid, ${user.id}::uuid, ${id}::uuid, 'buy')`);
      return { id, replayed: false };
    });
  });
  app.post('/api/market/:id/cancel', { preHandler: authed }, async (req) => {
    const user = requireActive(requireAccount(req));
    const { id } = listingId.parse(req.params);
    const { idempotencyKey } = operation.parse(req.body);
    return db.transaction(async (tx) => {
      const old = await tx.execute<{ user_id: string; listing_id: string; kind: string }>(sql`SELECT user_id, listing_id, kind FROM market_operations WHERE id = ${idempotencyKey}::uuid`);
      if (old.length) {
        if (old[0]!.user_id !== user.id || old[0]!.listing_id !== id || old[0]!.kind !== 'cancel') throw fail('idempotency_conflict');
        return { id, replayed: true };
      }
      const updated = await tx.execute(sql`
        UPDATE market_listings SET status = 'cancelled', completed_at = now()
        WHERE id = ${id}::uuid AND seller_id = ${user.id}::uuid AND status = 'active' RETURNING id
      `);
      if (!updated.length) throw fail('not_found');
      await tx.execute(sql`INSERT INTO market_operations(id, user_id, listing_id, kind) VALUES (${idempotencyKey}::uuid, ${user.id}::uuid, ${id}::uuid, 'cancel')`);
      return { id, replayed: false };
    });
  });
}
