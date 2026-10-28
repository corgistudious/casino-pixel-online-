import {
  GIFT_PRICE_PROPOSAL,
  GIFT_RULES,
  type CharmBoardEntry,
  type CharmEventView,
  type GiftCategory,
  type GiftCurrency,
  type GiftItemView,
  type GiftRarity,
  type GiftSendInput,
  type GiftShopView,
  type GiftShowcaseView,
  type GiftTxView,
  type GiftUpsertInput,
  type StaffGiftTxView,
  type StaffGiftView,
} from '@casino/shared';
import { sql } from 'drizzle-orm';
import type { Db, DbOrTx, Tx } from '../db/client';
import { fail } from '../errors';
import type { RealtimeHub } from '../realtime/hub';
import { runOnce } from './adminOps';
import { assetUrl } from './assets';
import { audit } from './audit';
import { blockedBetween, visiblePlayer } from './social';
import { assertStaffTarget } from './vip';
import { applyDelta, getWallet } from './wallet';

// ---------------------------------------------------------------- catalogue

type GiftRow = {
  id: string;
  category: GiftCategory;
  name_vi: string;
  name_en: string;
  desc_vi: string;
  desc_en: string;
  icon: string;
  icon_asset: string | null;
  rarity: GiftRarity;
  price: string;
  currency: GiftCurrency;
  charm: number;
  on_sale: boolean;
  daily_limit: number | null;
  starts_at: string | null;
  ends_at: string | null;
  sort: number;
  updated_at: string;
  available: boolean;
};

const GIFT_COLUMNS = sql`g.id, g.category, g.name_vi, g.name_en, g.desc_vi, g.desc_en, g.icon, g.icon_asset, g.rarity, g.price, g.currency, g.charm,
  g.on_sale, g.daily_limit, g.starts_at, g.ends_at, g.sort, g.updated_at,
  (g.on_sale AND (g.starts_at IS NULL OR g.starts_at <= now()) AND (g.ends_at IS NULL OR g.ends_at > now())) AS available`;

const iso = (v: string | Date | null) => (v === null ? null : new Date(v).toISOString());

function toGift(r: GiftRow): GiftItemView {
  return {
    id: r.id,
    category: r.category,
    name: { vi: r.name_vi, en: r.name_en },
    description: { vi: r.desc_vi, en: r.desc_en },
    icon: r.icon,
    iconUrl: r.icon_asset ? assetUrl(r.icon_asset) : null,
    rarity: r.rarity,
    price: Number(r.price),
    currency: r.currency,
    charm: Number(r.charm),
    dailyLimit: r.daily_limit === null ? null : Number(r.daily_limit),
    startsAt: iso(r.starts_at),
    endsAt: iso(r.ends_at),
    available: r.available,
  };
}

const giftRef = (g: GiftItemView): GiftTxView['gift'] => ({ id: g.id, name: g.name, icon: g.icon, iconUrl: g.iconUrl, rarity: g.rarity, category: g.category });

/** Start of the current server day (UTC): every daily gift limit resets here. */
const TODAY = sql`date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'`;

async function sentToday(db: DbOrTx, userId: string) {
  const [r] = await db.execute<{ silver: string; gold: string; count: number }>(sql`
    SELECT coalesce(sum(total_price) FILTER (WHERE currency = 'silver'), 0) AS silver,
           coalesce(sum(total_price) FILTER (WHERE currency = 'gold'), 0) AS gold,
           coalesce(sum(quantity), 0)::int AS count
    FROM gift_transactions WHERE sender_id = ${userId}::uuid AND status = 'completed' AND created_at >= ${TODAY}`);
  return { silver: Number(r!.silver), gold: Number(r!.gold), count: Number(r!.count) };
}

/** Why an account may not send charm gifts at all (anti-farming), or null. */
async function senderBlock(db: DbOrTx, userId: string): Promise<GiftShopView['blocked']> {
  const [u] = await db.execute<{ young: boolean; verified: boolean }>(sql`
    SELECT created_at > now() - make_interval(hours => ${GIFT_RULES.minAccountHours}) AS young, email_verified_at IS NOT NULL AS verified
    FROM users WHERE id = ${userId}::uuid`);
  if (!u) throw fail('unauthorized');
  if (GIFT_RULES.requireVerifiedEmail && !u.verified) return 'email_not_verified';
  if (u.young) return 'account_too_new';
  return null;
}

export async function giftShop(db: Db, userId: string): Promise<GiftShopView> {
  const rows = await db.execute<GiftRow>(sql`
    SELECT ${GIFT_COLUMNS} FROM gift_catalog g
    WHERE g.on_sale AND (g.starts_at IS NULL OR g.starts_at <= now()) AND (g.ends_at IS NULL OR g.ends_at > now())
    ORDER BY g.sort, g.price, g.id`);
  return { gifts: rows.map(toGift), today: await sentToday(db, userId), blocked: await senderBlock(db, userId) };
}

// ---------------------------------------------------------------- sending

export interface SentGift {
  tx: GiftTxView;
  replayed: boolean;
  receiverId: string | null;
  senderWallet: { balance: number; gold: number };
  receiverCharm: number;
}

/**
 * Buys a gift and delivers it in one transaction: the sender's Cxu leave through the ledger, the
 * gift row is written, and the receiver's Charm Points rise with a matching charm ledger row — all
 * of it or none of it. The client's id makes retries safe (same id + same request = the stored
 * result, never a second charge); a different request under the same id is refused.
 */
export async function sendCharmGift(db: Db, me: { id: string; uid: number }, input: GiftSendInput): Promise<SentGift> {
  if (input.uid === me.uid) throw fail('self_social');
  return db.transaction(async (tx) => {
    // Serialises everything this sender does (limits, balance) without blocking other senders.
    await tx.execute(sql`SELECT id FROM users WHERE id = ${me.id}::uuid FOR UPDATE`);
    const prior = await tx.execute<{ sender_id: string; receiver_uid: number; gift_id: string; quantity: number; anonymous: boolean; unit_price: string; message: string }>(sql`
      SELECT t.sender_id, r.uid AS receiver_uid, t.gift_id, t.quantity, t.anonymous, t.unit_price, t.message
      FROM gift_transactions t JOIN users r ON r.id = t.receiver_id WHERE t.id = ${input.id}::uuid`);
    if (prior.length) {
      const p = prior[0]!;
      // Compare every normalized request field against the original purchase snapshot.
      // Never compare with the live catalogue price: staff may have changed it since purchase.
      const same =
        p.sender_id === me.id &&
        Number(p.receiver_uid) === input.uid &&
        p.gift_id === input.giftId &&
        Number(p.quantity) === input.quantity &&
        p.anonymous === input.anonymous &&
        Number(p.unit_price) === input.expectedPrice &&
        p.message === input.message;
      if (!same) throw fail('idempotency_conflict');
      return {
        tx: (await historyRows(tx, me.id, sql`t.id = ${input.id}::uuid`))[0]!,
        replayed: true,
        receiverId: null,
        senderWallet: await getWallet(tx, me.id),
        receiverCharm: 0,
      };
    }
    const block = await senderBlock(tx, me.id);
    if (block === 'email_not_verified') throw fail('email_not_verified');
    if (block === 'account_too_new') throw fail('account_too_new');

    const receiver = await visiblePlayer(tx, input.uid);
    if (receiver.status !== 'active') throw fail('not_found');
    if (await blockedBetween(tx, me.id, receiver.user_id)) throw fail('blocked');

    const [row] = await tx.execute<GiftRow>(sql`SELECT ${GIFT_COLUMNS} FROM gift_catalog g WHERE g.id = ${input.giftId} FOR SHARE`);
    if (!row || !row.available) throw fail('gift_unavailable');
    const gift = toGift(row);
    if (gift.price !== input.expectedPrice) throw fail('gift_price_changed');
    const total = gift.price * input.quantity;
    const charm = gift.charm * input.quantity;
    if (!Number.isSafeInteger(total) || !Number.isSafeInteger(charm)) throw fail('bad_request');

    const today = await sentToday(tx, me.id);
    if (today.count + input.quantity > GIFT_RULES.dailyCount) throw fail('gift_limit');
    if (gift.currency === 'silver' && today.silver + total > GIFT_RULES.dailySilver) throw fail('gift_limit');
    if (gift.currency === 'gold' && today.gold + total > GIFT_RULES.dailyGold) throw fail('gift_limit');
    if (gift.dailyLimit !== null) {
      const [g] = await tx.execute<{ n: number }>(sql`
        SELECT coalesce(sum(quantity), 0)::int AS n FROM gift_transactions
        WHERE sender_id = ${me.id}::uuid AND gift_id = ${gift.id} AND status = 'completed' AND created_at >= ${TODAY}`);
      if (g!.n + input.quantity > gift.dailyLimit) throw fail('gift_daily_limit');
    }
    const [pair] = await tx.execute<{ charm: string }>(sql`
      SELECT coalesce(sum(charm), 0) AS charm FROM gift_transactions
      WHERE sender_id = ${me.id}::uuid AND receiver_id = ${receiver.user_id}::uuid AND status = 'completed' AND created_at >= ${TODAY}`);
    if (Number(pair!.charm) + charm > GIFT_RULES.pairDailyCharm) throw fail('gift_limit');

    // Debit first: a short balance aborts everything before anything else is written.
    await applyDelta(tx, me.id, -total, 'gift_shop', null, gift.currency, `giftshop:${input.id}`);
    await tx.execute(sql`
      INSERT INTO gift_transactions (id, sender_id, receiver_id, gift_id, quantity, unit_price, total_price, currency, charm, anonymous, message)
      VALUES (${input.id}::uuid, ${me.id}::uuid, ${receiver.user_id}::uuid, ${gift.id}, ${input.quantity}, ${gift.price}, ${total}, ${gift.currency}, ${charm}, ${input.anonymous}, ${input.message})`);
    const receiverCharm = await addCharm(tx, receiver.user_id, charm, 'gift', { giftTxId: input.id });
    return {
      tx: (await historyRows(tx, me.id, sql`t.id = ${input.id}::uuid`))[0]!,
      replayed: false,
      receiverId: receiver.user_id,
      senderWallet: await getWallet(tx, me.id),
      receiverCharm,
    };
  });
}

/** Changes Charm Points and writes the matching ledger row. Never below zero. Returns the new total. */
async function addCharm(tx: Tx | DbOrTx, userId: string, delta: number, reason: CharmEventView['reason'], ref: { giftTxId?: string; actorId?: string; note?: string }): Promise<number> {
  const [r] =
    delta > 0
      ? await tx.execute<{ total: string }>(sql`
          INSERT INTO charm_points (user_id, total) VALUES (${userId}::uuid, ${delta})
          ON CONFLICT (user_id) DO UPDATE SET total = charm_points.total + ${delta}, updated_at = now() RETURNING total`)
      : await tx.execute<{ total: string }>(sql`
          UPDATE charm_points SET total = total + ${delta}, updated_at = now() WHERE user_id = ${userId}::uuid AND total + ${delta} >= 0 RETURNING total`);
  if (!r) throw fail('bad_request', 'charm would go below zero');
  await tx.execute(sql`
    INSERT INTO charm_ledger (user_id, delta, total_after, reason, gift_tx_id, actor_id, note)
    VALUES (${userId}::uuid, ${delta}, ${Number(r.total)}, ${reason}, ${ref.giftTxId ?? null}::uuid, ${ref.actorId ?? null}::uuid, ${ref.note ?? null})`);
  return Number(r.total);
}

export async function charmOf(db: DbOrTx, userId: string): Promise<number> {
  const [r] = await db.execute<{ total: string }>(sql`SELECT total FROM charm_points WHERE user_id = ${userId}::uuid`);
  return Number(r?.total ?? 0);
}

// ---------------------------------------------------------------- history and showcase

type HistoryRow = GiftRow & {
  tx_id: string;
  sender_id: string;
  quantity: number;
  tx_charm: number;
  total_price: string;
  tx_currency: GiftCurrency;
  anonymous: boolean;
  message: string;
  status: 'completed' | 'reversed';
  created_at: string;
  other_uid: number;
  other_name: string;
};

async function historyRows(db: DbOrTx, viewerId: string, where: ReturnType<typeof sql>, limit = 50, order = sql`t.created_at DESC`): Promise<GiftTxView[]> {
  const rows = await db.execute<HistoryRow>(sql`
    SELECT ${GIFT_COLUMNS}, t.id AS tx_id, t.sender_id, t.quantity, t.charm AS tx_charm, t.total_price, t.currency AS tx_currency, t.anonymous, t.message,
      t.status, t.created_at, o.uid AS other_uid, o.display_name AS other_name
    FROM gift_transactions t JOIN gift_catalog g ON g.id = t.gift_id
    JOIN users o ON o.id = CASE WHEN t.sender_id = ${viewerId}::uuid THEN t.receiver_id ELSE t.sender_id END
    WHERE ${where} ORDER BY ${order} LIMIT ${limit}`);
  return rows.map((r) => {
    const sent = r.sender_id === viewerId;
    return {
      id: r.tx_id,
      direction: sent ? 'sent' : 'received',
      // An anonymous sender is never revealed to the receiver (staff see it in the admin panel).
      other: !sent && r.anonymous ? null : { uid: Number(r.other_uid), displayName: r.other_name },
      gift: giftRef(toGift(r)),
      quantity: Number(r.quantity),
      charm: Number(r.tx_charm),
      price: sent ? { total: Number(r.total_price), currency: r.tx_currency } : null,
      anonymous: r.anonymous,
      message: r.message,
      status: r.status,
      createdAt: new Date(r.created_at).toISOString(),
    };
  });
}

export async function myGiftHistory(db: Db, userId: string, direction: 'sent' | 'received', before?: string): Promise<GiftTxView[]> {
  const mine = direction === 'sent' ? sql`t.sender_id = ${userId}::uuid` : sql`t.receiver_id = ${userId}::uuid`;
  return historyRows(db, userId, sql`${mine} ${before ? sql`AND t.created_at < ${before}::timestamptz` : sql``}`, 50);
}

/**
 * The public showcase on a profile: received gifts grouped by gift plus the most recent ones.
 * Seen by others, anonymous senders stay hidden and prices are never shown.
 */
export async function giftShowcase(db: DbOrTx, ownerId: string, sort: 'recent' | 'value' = 'recent', category?: GiftCategory): Promise<GiftShowcaseView> {
  const cat = category ? sql`AND g.category = ${category}` : sql``;
  const grouped = await db.execute<GiftRow & { n: number; charm_sum: string }>(sql`
    SELECT ${GIFT_COLUMNS}, sum(t.quantity)::int AS n, sum(t.charm) AS charm_sum
    FROM gift_transactions t JOIN gift_catalog g ON g.id = t.gift_id
    WHERE t.receiver_id = ${ownerId}::uuid AND t.status = 'completed' ${cat}
    GROUP BY g.id ORDER BY sum(t.charm) DESC, g.id LIMIT 24`);
  // Viewed as "received" by a third party: pass an id that is never the sender so prices stay hidden.
  const recent = await historyRows(
    db,
    ownerId,
    sql`t.receiver_id = ${ownerId}::uuid AND t.status = 'completed' ${cat}`,
    12,
    sort === 'value' ? sql`t.charm DESC, t.created_at DESC` : sql`t.created_at DESC`,
  );
  return {
    charm: await charmOf(db, ownerId),
    receivedCount: grouped.reduce((a, g) => a + Number(g.n), 0),
    byGift: grouped.map((g) => ({ gift: giftRef(toGift(g)), count: Number(g.n), charm: Number(g.charm_sum) })),
    recent: recent.map((r) => ({ ...r, price: null })),
  };
}

/** Optional Charm leaderboard. The wealth leaderboard is unchanged and separate. */
export async function charmBoard(db: Db, limit = 50): Promise<CharmBoardEntry[]> {
  const rows = await db.execute<{ uid: number; display_name: string; total: string }>(sql`
    SELECT u.uid, u.display_name, c.total FROM charm_points c JOIN users u ON u.id = c.user_id
    WHERE c.total > 0 AND u.account_type = 'player' AND u.status = 'active' AND u.uid <> 1000
      AND NOT EXISTS (SELECT 1 FROM bans b WHERE b.user_id = u.id AND b.revoked_at IS NULL AND b.starts_at <= now() AND (b.ends_at IS NULL OR b.ends_at > now()))
    ORDER BY c.total DESC, c.updated_at ASC LIMIT ${limit}`);
  return rows.map((r, i) => ({ position: i + 1, uid: Number(r.uid), displayName: r.display_name, charm: Number(r.total) }));
}

// ---------------------------------------------------------------- staff: catalogue (gifts.manage)

export async function staffGifts(db: Db): Promise<StaffGiftView[]> {
  const rows = await db.execute<GiftRow & { sent: number }>(sql`
    SELECT ${GIFT_COLUMNS}, (SELECT coalesce(sum(quantity), 0)::int FROM gift_transactions t WHERE t.gift_id = g.id AND t.status = 'completed') AS sent
    FROM gift_catalog g ORDER BY g.sort, g.id`);
  return rows.map((r) => ({ ...toGift(r), onSale: r.on_sale, sort: Number(r.sort), sent: Number(r.sent), updatedAt: new Date(r.updated_at).toISOString() }));
}

/** Creates or edits a gift. New prices apply to new purchases only: past transactions keep theirs. */
export async function saveGift(db: Db, actorId: string, input: GiftUpsertInput, ip?: string): Promise<StaffGiftView[]> {
  await db.transaction(async (tx) => {
    const [before] = await tx.execute<GiftRow>(sql`SELECT ${GIFT_COLUMNS} FROM gift_catalog g WHERE g.id = ${input.id} FOR UPDATE`);
    if (input.iconAsset) {
      const [a] = await tx.execute(sql`SELECT 1 FROM assets WHERE id = ${input.iconAsset}`);
      if (!a) throw fail('invalid_asset');
    }
    await tx.execute(sql`
      INSERT INTO gift_catalog (id, category, name_vi, name_en, desc_vi, desc_en, icon, icon_asset, rarity, price, currency, charm, on_sale, daily_limit, starts_at, ends_at, sort, updated_by)
      VALUES (${input.id}, ${input.category}, ${input.name.vi}, ${input.name.en}, ${input.description.vi}, ${input.description.en}, ${input.icon}, ${input.iconAsset},
        ${input.rarity}, ${input.price}, ${input.currency}, ${input.charm}, ${input.onSale}, ${input.dailyLimit}, ${input.startsAt}::timestamptz, ${input.endsAt}::timestamptz, ${input.sort}, ${actorId}::uuid)
      ON CONFLICT (id) DO UPDATE SET category = EXCLUDED.category, name_vi = EXCLUDED.name_vi, name_en = EXCLUDED.name_en, desc_vi = EXCLUDED.desc_vi,
        desc_en = EXCLUDED.desc_en, icon = EXCLUDED.icon, icon_asset = EXCLUDED.icon_asset, rarity = EXCLUDED.rarity, price = EXCLUDED.price,
        currency = EXCLUDED.currency, charm = EXCLUDED.charm, on_sale = EXCLUDED.on_sale, daily_limit = EXCLUDED.daily_limit, starts_at = EXCLUDED.starts_at,
        ends_at = EXCLUDED.ends_at, sort = EXCLUDED.sort, updated_by = EXCLUDED.updated_by, updated_at = now()`);
    await audit(tx, { actorId, action: before ? 'gift.update' : 'gift.create', targetType: 'gift', targetId: input.id, details: { before: before ? toGift(before) : null, after: input }, ip });
  });
  return staffGifts(db);
}

/** Loads the suggested catalogue as drafts (not on sale). Existing gifts are never overwritten. */
export async function importGiftProposal(db: Db, actorId: string, ip?: string): Promise<{ added: number; gifts: StaffGiftView[] }> {
  const added = await db.transaction(async (tx) => {
    let n = 0;
    for (const g of GIFT_PRICE_PROPOSAL) {
      const r = await tx.execute(sql`
        INSERT INTO gift_catalog (id, category, name_vi, name_en, desc_vi, desc_en, icon, rarity, price, currency, charm, on_sale, daily_limit, sort, updated_by)
        VALUES (${g.id}, ${g.category}, ${g.name.vi}, ${g.name.en}, ${g.description.vi}, ${g.description.en}, ${g.icon}, ${g.rarity}, ${g.price}, ${g.currency}, ${g.charm}, false, ${g.dailyLimit}, ${g.sort}, ${actorId}::uuid)
        ON CONFLICT (id) DO NOTHING RETURNING id`);
      n += r.length;
    }
    await audit(tx, { actorId, action: 'gift.import_proposal', targetType: 'gift', details: { added: n }, ip });
    return n;
  });
  return { added, gifts: await staffGifts(db) };
}

// ---------------------------------------------------------------- staff: transactions

type StaffTxRow = {
  id: string;
  quantity: number;
  unit_price: string;
  total_price: string;
  currency: GiftCurrency;
  charm: number;
  anonymous: boolean;
  message: string;
  status: 'completed' | 'reversed';
  created_at: string;
  reversed_at: string | null;
  reverse_reason: string | null;
  refunded: boolean;
  s_uid: number;
  s_name: string;
  r_uid: number;
  r_name: string;
} & GiftRow;

const toStaffTx = (r: StaffTxRow): StaffGiftTxView => ({
  id: r.id,
  sender: { uid: Number(r.s_uid), displayName: r.s_name },
  receiver: { uid: Number(r.r_uid), displayName: r.r_name },
  gift: giftRef(toGift(r)),
  quantity: Number(r.quantity),
  unitPrice: Number(r.unit_price),
  total: Number(r.total_price),
  currency: r.currency,
  charm: Number(r.charm),
  anonymous: r.anonymous,
  message: r.message,
  status: r.status,
  createdAt: new Date(r.created_at).toISOString(),
  reversedAt: iso(r.reversed_at),
  reverseReason: r.reverse_reason,
  refunded: r.refunded,
});

/**
 * Gift transactions for staff, newest first. `abnormal` keeps the ones worth a look: a sender
 * account younger than 7 days, 10 or more at once, or a pair that moved half the daily pair
 * charm limit or more within 24 hours.
 */
export async function staffGiftTransactions(db: Db, f: { uid?: number; giftId?: string; abnormal?: boolean; before?: string }): Promise<StaffGiftTxView[]> {
  const conds = [sql`true`];
  if (f.uid) conds.push(sql`(s.uid = ${f.uid} OR r.uid = ${f.uid})`);
  if (f.giftId) conds.push(sql`t.gift_id = ${f.giftId}`);
  if (f.before) conds.push(sql`t.created_at < ${f.before}::timestamptz`);
  if (f.abnormal) {
    conds.push(sql`(s.created_at > t.created_at - interval '7 days' OR t.quantity >= 10 OR (
      SELECT coalesce(sum(x.charm), 0) FROM gift_transactions x WHERE x.sender_id = t.sender_id AND x.receiver_id = t.receiver_id
        AND x.status = 'completed' AND x.created_at BETWEEN t.created_at - interval '24 hours' AND t.created_at) >= ${GIFT_RULES.pairDailyCharm / 2})`);
  }
  const rows = await db.execute<StaffTxRow>(sql`
    SELECT ${GIFT_COLUMNS}, t.id, t.quantity, t.unit_price, t.total_price, t.currency, t.charm, t.anonymous, t.message, t.status, t.created_at,
      t.reversed_at, t.reverse_reason, t.refunded, s.uid AS s_uid, s.display_name AS s_name, r.uid AS r_uid, r.display_name AS r_name
    FROM gift_transactions t JOIN gift_catalog g ON g.id = t.gift_id JOIN users s ON s.id = t.sender_id JOIN users r ON r.id = t.receiver_id
    WHERE ${sql.join(conds, sql` AND `)} ORDER BY t.created_at DESC LIMIT 100`);
  return rows.map(toStaffTx);
}

/**
 * Reverses a gift: the receiver loses its charm (never below zero) and, if `refund`, the sender
 * gets the exact amount back through the ledger. History is kept (status 'reversed'). Audited.
 */
export async function reverseGift(db: Db, actorId: string, txId: string, input: { reason: string; refund: boolean; idempotencyKey: string }, ip?: string) {
  const { result, replayed } = await runOnce(db, input.idempotencyKey, actorId, 'gift.reverse', { txId, reason: input.reason, refund: input.refund }, async (tx) => {
    const [t] = await tx.execute<{ sender_id: string; receiver_id: string; total_price: string; currency: GiftCurrency; charm: number; status: string; r_uid: number }>(sql`
      SELECT t.sender_id, t.receiver_id, t.total_price, t.currency, t.charm, t.status, r.uid AS r_uid
      FROM gift_transactions t JOIN users r ON r.id = t.receiver_id WHERE t.id = ${txId}::uuid FOR UPDATE OF t`);
    if (!t) throw fail('not_found');
    if (t.status === 'reversed') throw fail('already_reversed');
    await tx.execute(sql`SELECT id FROM users WHERE id = ${t.receiver_id}::uuid FOR UPDATE`);
    const current = await charmOf(tx, t.receiver_id);
    const removed = Math.min(current, Number(t.charm));
    let receiverCharm = current;
    if (removed > 0) receiverCharm = await addCharm(tx, t.receiver_id, -removed, 'gift_reversal', { giftTxId: txId, actorId, note: input.reason });
    if (input.refund) await applyDelta(tx, t.sender_id, Number(t.total_price), 'gift_refund', null, t.currency, `giftshop:refund:${txId}`);
    await tx.execute(sql`
      UPDATE gift_transactions SET status = 'reversed', reversed_at = now(), reversed_by = ${actorId}::uuid, reverse_reason = ${input.reason}, refunded = ${input.refund}
      WHERE id = ${txId}::uuid`);
    await audit(tx, { actorId, action: 'gift.reverse', targetType: 'gift_tx', targetId: txId, details: { charmRemoved: removed, refund: input.refund, total: Number(t.total_price), currency: t.currency, reason: input.reason }, ip });
    return { senderId: t.sender_id, receiverId: t.receiver_id, receiverCharm, refunded: input.refund };
  });
  return { ...result, replayed };
}

// ---------------------------------------------------------------- staff: charm (charm.read / charm.manage)

export async function staffCharm(db: Db, uid: number) {
  const [u] = await db.execute<{ id: string; uid: number; display_name: string }>(sql`SELECT id, uid, display_name FROM users WHERE uid = ${uid} AND status <> 'deleted'`);
  if (!u) throw fail('not_found');
  const events = await db.execute<{ id: string; delta: string; total_after: string; reason: CharmEventView['reason']; gift_tx_id: string | null; note: string | null; created_at: string; a_uid: number | null; a_name: string | null }>(sql`
    SELECT l.id, l.delta, l.total_after, l.reason, l.gift_tx_id, l.note, l.created_at, a.uid AS a_uid, a.display_name AS a_name
    FROM charm_ledger l LEFT JOIN users a ON a.id = l.actor_id WHERE l.user_id = ${u.id}::uuid ORDER BY l.id DESC LIMIT 100`);
  return {
    uid: Number(u.uid),
    displayName: u.display_name,
    charm: await charmOf(db, u.id),
    events: events.map(
      (e): CharmEventView => ({
        id: Number(e.id),
        delta: Number(e.delta),
        totalAfter: Number(e.total_after),
        reason: e.reason,
        giftTxId: e.gift_tx_id,
        note: e.note,
        actor: e.a_uid === null ? null : { uid: Number(e.a_uid), displayName: e.a_name! },
        createdAt: new Date(e.created_at).toISOString(),
      }),
    ),
    transactions: await staffGiftTransactions(db, { uid }),
  };
}

export async function adjustCharm(db: Db, actorId: string, uid: number, input: { delta: number; reason: string; idempotencyKey: string }, ip?: string) {
  const target = await assertStaffTarget(db, actorId, uid);
  const { result, replayed } = await runOnce(db, input.idempotencyKey, actorId, 'charm.adjust', { uid, delta: input.delta, reason: input.reason }, async (tx) => {
    await tx.execute(sql`SELECT id FROM users WHERE id = ${target.id}::uuid FOR UPDATE`);
    const before = await charmOf(tx, target.id);
    if (before + input.delta < 0) throw fail('bad_request', 'charm would go below zero');
    const after = await addCharm(tx, target.id, input.delta, 'admin_adjust', { actorId, note: input.reason });
    await audit(tx, { actorId, action: 'charm.adjust', targetType: 'user', targetId: uid, details: { before, after, delta: input.delta, reason: input.reason, idempotencyKey: input.idempotencyKey }, ip });
    return { charm: after };
  });
  return { ...result, userId: target.id, replayed };
}

// ---------------------------------------------------------------- realtime (after commit, best effort)

/** Public counters of a profile, pushed to every client after a follow, like or gift. */
export async function publishCounts(db: DbOrTx, hub: RealtimeHub, userId: string): Promise<void> {
  try {
    const [r] = await db.execute<{ uid: number; followers: number; likes: number; charm: string | null }>(sql`
      SELECT u.uid,
        (SELECT count(*)::int FROM player_follows f JOIN users x ON x.id = f.follower_id WHERE f.followee_id = u.id AND x.account_type = 'player' AND x.status <> 'deleted') AS followers,
        (SELECT count(*)::int FROM profile_likes l JOIN users x ON x.id = l.liker_id WHERE l.profile_id = u.id AND x.account_type = 'player' AND x.status <> 'deleted') AS likes,
        (SELECT total FROM charm_points c WHERE c.user_id = u.id) AS charm
      FROM users u WHERE u.id = ${userId}::uuid`);
    if (r) hub.broadcast({ type: 'event', event: 'counts', data: { uid: Number(r.uid), followers: r.followers, likes: r.likes, charm: Number(r.charm ?? 0) } });
  } catch {
    /* clients refetch on their next load or reconnect */
  }
}
