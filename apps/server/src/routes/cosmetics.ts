import { equipSchema, equipSetSchema } from '@casino/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAccount, requireActive } from '../auth/session';
import type { Db } from '../db/client';
import { fail } from '../errors';
import type { RealtimeHub } from '../realtime/hub';
import { publishIdentity } from '../services/identity';
import { loadAsset } from '../services/assets';
import { equipCollectionSet, publicCollections } from '../services/collections';
import { allowedRoleFrames, effectiveEquipment, equip, inventoryOf, publicCatalog } from '../services/catalog';
import { claimAll, claimMail, deleteMail, listMail, markRead, unreadCount } from '../services/mailbox';
import { toPublicUser } from '../services/users';
import { makeGuards } from './guards';

const mailId = z.object({ id: z.string().uuid() });

/** Player-facing cosmetics (catalog, inventory, equipping) and the personal mailbox. */
export function registerCosmeticsRoutes(app: FastifyInstance, db: Db, hub: RealtimeHub): void {
  const { authed } = makeGuards(app, db);

  /** Public: every item a player can see (released and hidden), with render data and asset URLs. */
  app.get('/api/catalog', async (_req, reply) => {
    // Always revalidated: a newly released item must show up right away (the query is cheap).
    reply.header('cache-control', 'no-cache');
    return { items: await publicCatalog(db) };
  });

  /**
   * Uploaded images. Content-addressed ids never change, so they are cached forever. The type is
   * the one detected from the bytes at upload; nosniff and a deny-all CSP stop any script use.
   */
  app.get('/api/assets/:id', async (req, reply) => {
    const { id } = z.object({ id: z.string().regex(/^[a-f0-9]{64}\.(png|webp|gif|jpg)$/) }).parse(req.params);
    const asset = await loadAsset(db, id);
    if (!asset) throw fail('not_found');
    return reply
      .header('content-type', asset.mime)
      .header('cache-control', 'public, max-age=31536000, immutable')
      .header('x-content-type-options', 'nosniff')
      .header('content-security-policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox")
      // Loaded cross-origin by the Android/Windows apps.
      .header('cross-origin-resource-policy', 'cross-origin')
      .send(asset.bytes);
  });

  app.get('/api/me/inventory', { preHandler: authed }, async (req) => {
    const user = requireAccount(req);
    return { items: await inventoryOf(db, user.id), equipped: await effectiveEquipment(db, user), roleFrames: await allowedRoleFrames(db, user.id) };
  });

  /** Equip or remove (itemId null) a frame or special avatar. */
  app.post('/api/me/equip', { preHandler: authed }, async (req) => {
    const { slot, itemId } = equipSchema.parse(req.body);
    const user = await equip(db, requireAccount(req).id, slot, itemId);
    void publishIdentity(db, hub, user.id);
    return { user: await toPublicUser(db, user) };
  });

  /** Seasonal collections players can see (approved: scheduled, on sale or ended). */
  app.get('/api/collections', { preHandler: authed }, async () => ({ collections: await publicCollections(db) }));

  /** Equips every owned item of a collection, one per slot; never buys anything. */
  app.post('/api/me/equip-set', { preHandler: authed }, async (req) => {
    const { collectionId, replaceRoleFrame } = equipSetSchema.parse(req.body);
    const r = await equipCollectionSet(db, requireAccount(req).id, collectionId, replaceRoleFrame);
    void publishIdentity(db, hub, r.user.id);
    return { user: await toPublicUser(db, r.user), equipped: r.equipped, missing: r.missing, keptRoleFrame: r.keptRoleFrame };
  });

  // ---------------------------------------------------------------- mailbox
  app.get('/api/mail', { preHandler: authed }, async (req) => {
    const user = requireAccount(req);
    const [mail, unread] = await Promise.all([listMail(db, user.id), unreadCount(db, user.id)]);
    return { mail, unread };
  });

  app.post('/api/mail/:id/read', { preHandler: authed }, async (req) => {
    const user = requireAccount(req);
    const mail = await markRead(db, user.id, mailId.parse(req.params).id);
    return { mail, unread: await unreadCount(db, user.id) };
  });

  /** Claim attachments. Needs an active (email-verified) account, like every other reward. */
  app.post('/api/mail/:id/claim', { preHandler: authed }, async (req) => {
    const user = requireActive(requireAccount(req));
    const { mail, wallet } = await claimMail(db, user.id, mailId.parse(req.params).id);
    hub.sendToUser(user.id, { type: 'event', event: 'wallet', data: wallet });
    return { mail, wallet, unread: await unreadCount(db, user.id) };
  });

  app.post('/api/mail/claim-all', { preHandler: authed }, async (req) => {
    const user = requireActive(requireAccount(req));
    const { claimed, wallet } = await claimAll(db, user.id);
    if (claimed.length) hub.sendToUser(user.id, { type: 'event', event: 'wallet', data: wallet });
    return { claimed, wallet, unread: await unreadCount(db, user.id) };
  });

  app.delete('/api/mail/:id', { preHandler: authed }, async (req) => {
    const user = requireAccount(req);
    await deleteMail(db, user.id, mailId.parse(req.params).id);
    return { unread: await unreadCount(db, user.id) };
  });
}
