import {
  ASSET_MAX_BYTES,
  ASSET_MIME,
  frameRenderSchema,
  itemStyleSchema,
  idempotencyKeySchema,
  ITEM_KINDS,
  STAFF_ITEM_SOURCES,
  ITEM_STATUSES,
  itemIdSchema,
  MAIL_KINDS,
  MAIL_MAX_ATTACHMENTS,
  MAIL_MAX_UIDS,
  mailAttachmentSchema,
  RARITIES,
} from '@casino/shared';
import { eq, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Db } from '../db/client';
import { catalogItems } from '../db/schema';
import { fail } from '../errors';
import type { RealtimeHub } from '../realtime/hub';
import { findByUid } from '../services/accounts';
import { runOnce } from '../services/adminOps';
import { loadAsset, storeAsset } from '../services/assets';
import { audit } from '../services/audit';
import { adminCatalog, getCatalogRow, grantItem, ownersOf, revokeInstance } from '../services/catalog';
import { listBatches, sendMail, unreadCount } from '../services/mailbox';
import { userPermissions } from '../services/rbac';
import { makeGuards } from './guards';

const assetIdSchema = z.string().regex(/^[a-f0-9]{64}\.(png|webp|gif)$/);

const itemFields = {
  nameVi: z.string().trim().min(1).max(60),
  nameEn: z.string().trim().min(1).max(60),
  descVi: z.string().trim().max(300).nullable().optional(),
  descEn: z.string().trim().max(300).nullable().optional(),
  rarity: z.enum(RARITIES),
  source: z.enum(STAFF_ITEM_SOURCES),
  tradable: z.boolean(),
  status: z.enum(ITEM_STATUSES),
  assetId: assetIdSchema.optional(),
  render: frameRenderSchema.nullable().optional(),
  /** Drawn look (colours, animation) for frames, titles, chat bubbles and card backs without an image. */
  style: itemStyleSchema.nullable().optional(),
  priceSilver: z.number().int().min(0).max(100_000_000).nullable().optional(),
  sort: z.number().int().min(-1000).max(100_000).optional(),
};
/** Images are required for avatars and collectibles; the other kinds may be drawn from a style instead. */
const DRAWABLE_KINDS = ['frame', 'title', 'chat_bubble', 'card_back'];
const createItemSchema = z
  .object({ id: itemIdSchema, kind: z.enum(ITEM_KINDS), ...itemFields })
  .refine((v) => !!v.assetId || (!!v.style && DRAWABLE_KINDS.includes(v.kind)), { message: 'an image (or, for frames, titles, bubbles and card backs, a style) is required', path: ['assetId'] });
const updateItemSchema = z.object(itemFields).partial();

const sendMailSchema = z.object({
  target: z.union([z.object({ uids: z.array(z.number().int().positive()).min(1).max(MAIL_MAX_UIDS) }), z.object({ all: z.literal(true) })]),
  kind: z.enum(MAIL_KINDS),
  subject: z.string().trim().min(1).max(120),
  body: z.string().trim().max(4000).default(''),
  attachments: z.array(mailAttachmentSchema).max(MAIL_MAX_ATTACHMENTS).default([]),
  expiresInDays: z.number().int().min(1).max(365).nullable().default(30),
  idempotencyKey: idempotencyKeySchema,
});

/** Admin management of the item catalog, uploads, ownership and mailbox sends. */
export function registerAdminContentRoutes(app: FastifyInstance, db: Db, hub: RealtimeHub): void {
  const { can, canReauth } = makeGuards(app, db);

  // Raw image uploads (the bytes are inspected; the declared type is only used to route the body here).
  app.addContentTypeParser([...ASSET_MIME], { parseAs: 'buffer', bodyLimit: ASSET_MAX_BYTES + 1024 }, (_req, body, done) => done(null, body));

  app.put('/api/admin/assets', { preHandler: can('items.manage'), bodyLimit: ASSET_MAX_BYTES + 1024 }, async (req) => {
    if (!Buffer.isBuffer(req.body)) throw fail('invalid_asset');
    const asset = await storeAsset(db, req.body, req.account!.id);
    await audit(db, { actorId: req.account!.id, action: 'asset.upload', targetType: 'asset', targetId: asset.id, details: { mime: asset.mime, width: asset.width, height: asset.height, size: asset.size }, ip: req.ip });
    return { asset };
  });

  app.get('/api/admin/items', { preHandler: can('items.read') }, async () => ({ items: await adminCatalog(db) }));

  app.post('/api/admin/items', { preHandler: can('items.manage') }, async (req) => {
    const input = createItemSchema.parse(req.body);
    if (input.assetId && !(await loadAsset(db, input.assetId))) throw fail('invalid_asset', 'unknown asset');
    if (await getCatalogRow(db, input.id)) throw fail('bad_request', 'id already exists');
    const [row] = await db
      .insert(catalogItems)
      .values({
        id: input.id,
        kind: input.kind,
        nameVi: input.nameVi,
        nameEn: input.nameEn,
        descVi: input.descVi ?? null,
        descEn: input.descEn ?? null,
        rarity: input.rarity,
        source: input.source,
        tradable: input.tradable,
        status: input.status,
        assetId: input.assetId ?? null,
        style: input.style ?? null,
        render: input.kind === 'frame' ? (input.render ?? frameRenderSchema.parse({})) : null,
        priceSilver: input.priceSilver ?? null,
        sort: input.sort ?? 0,
        createdBy: req.account!.id,
      })
      .returning();
    await audit(db, { actorId: req.account!.id, action: 'item.create', targetType: 'item', targetId: input.id, details: { kind: input.kind, status: input.status, rarity: input.rarity }, ip: req.ip });
    return { item: row };
  });

  /** Edit an item. Retiring means status "hidden": owners keep it; an owned item can never go back to draft. */
  app.patch('/api/admin/items/:id', { preHandler: can('items.manage') }, async (req) => {
    const { id } = z.object({ id: itemIdSchema }).parse(req.params);
    const input = updateItemSchema.parse(req.body);
    const current = await getCatalogRow(db, id);
    if (!current) throw fail('item_not_found');
    if (input.assetId && !(await loadAsset(db, input.assetId))) throw fail('invalid_asset', 'unknown asset');
    // Role frames (Owner / Super Admin / Admin / Moderator) are privileges, not goods: never priced,
    // tradable or turned into another kind of item.
    if (current.source === 'role' && (input.priceSilver != null || input.tradable === true || input.source !== undefined)) {
      throw fail('forbidden', 'role frames cannot be sold, traded or re-sourced');
    }
    if (input.status === 'draft' && current.status !== 'draft') {
      const [{ n }] = (await db.execute(sql`SELECT count(*) AS n FROM inventory_items WHERE item_id = ${id}`)) as unknown as [{ n: string }];
      if (Number(n) > 0) throw fail('bad_request', 'owned items cannot return to draft; use hidden');
    }
    const [row] = await db
      .update(catalogItems)
      .set({ ...input, render: current.kind === 'frame' ? (input.render ?? undefined) : null, updatedAt: new Date() })
      .where(eq(catalogItems.id, id))
      .returning();
    await audit(db, { actorId: req.account!.id, action: 'item.update', targetType: 'item', targetId: id, details: input, ip: req.ip });
    return { item: row };
  });

  app.get('/api/admin/items/:id/owners', { preHandler: can('items.read') }, async (req) => {
    const { id } = z.object({ id: itemIdSchema }).parse(req.params);
    const { limit, offset } = z.object({ limit: z.coerce.number().int().min(1).max(100).default(50), offset: z.coerce.number().int().min(0).default(0) }).parse(req.query);
    return { owners: await ownersOf(db, id, limit, offset) };
  });

  /** Give an item directly (Owner/Super Admin, re-authenticated, once per idempotency key). */
  app.post('/api/admin/items/:id/grant', { preHandler: canReauth('items.grant') }, async (req) => {
    const { id } = z.object({ id: itemIdSchema }).parse(req.params);
    const { uid, reason, idempotencyKey } = z.object({ uid: z.number().int().positive(), reason: z.string().trim().min(3).max(500), idempotencyKey: idempotencyKeySchema }).parse(req.body);
    const target = await findByUid(db, uid);
    if (!target || target.accountType !== 'player' || target.status === 'deleted') throw fail('not_found');
    const actorId = req.account!.id;
    const { result } = await runOnce(db, idempotencyKey, actorId, 'items.grant', { id, uid, reason }, async (tx) => {
      const outcome = await grantItem(tx, target.id, id, 'admin', `op:${idempotencyKey}`);
      await audit(tx, { actorId, action: 'item.grant', targetType: 'user', targetId: uid, details: { itemId: id, outcome, reason }, ip: req.ip });
      return { outcome };
    });
    return result;
  });

  /** Remove one owned instance (a mistaken grant). Unequips it if needed. */
  app.post('/api/admin/inventory/:instanceId/revoke', { preHandler: canReauth('items.grant') }, async (req) => {
    const { instanceId } = z.object({ instanceId: z.string().uuid() }).parse(req.params);
    const { reason } = z.object({ reason: z.string().trim().min(3).max(500) }).parse(req.body);
    const row = await revokeInstance(db, instanceId);
    await audit(db, { actorId: req.account!.id, action: 'item.revoke', targetType: 'inventory', targetId: instanceId, details: { itemId: row.itemId, userId: row.userId, reason }, ip: req.ip });
    return { revoked: true };
  });

  // ---------------------------------------------------------------- mailbox
  /**
   * Send mail to listed UIDs or every player. Currency attachments need economy.grant and item
   * attachments need items.grant on top of mail.send; always re-authenticated and idempotent.
   */
  app.post('/api/admin/mail', { preHandler: canReauth('mail.send') }, async (req) => {
    const input = sendMailSchema.parse(req.body);
    const perms = await userPermissions(db, req.account!.id);
    if (input.attachments.some((a) => a.type !== 'item') && !perms.includes('economy.grant')) throw fail('forbidden');
    if (input.attachments.some((a) => a.type === 'item') && !perms.includes('items.grant')) throw fail('forbidden');
    const actorId = req.account!.id;
    const { idempotencyKey, ...payload } = input;
    const { result, replayed } = await runOnce(db, idempotencyKey, actorId, 'mail.send', payload, (tx) => sendMail(tx, actorId, payload, req.ip));
    if (!replayed) {
      if (result.recipientIds) {
        for (const userId of result.recipientIds) hub.sendToUser(userId, { type: 'event', event: 'mail', data: { unread: await unreadCount(db, userId) } });
      } else {
        hub.broadcast({ type: 'event', event: 'mail', data: {} });
      }
    }
    return { batchId: result.batchId, recipients: result.recipients, replayed };
  });

  app.get('/api/admin/mail/batches', { preHandler: can('mail.read') }, async () => ({ batches: await listBatches(db) }));
}
