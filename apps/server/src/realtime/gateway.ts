import { randomUUID } from 'node:crypto';
import { clientMessageSchema, type ClientMessage, type ServerMessage } from '@casino/shared';
import type { FastifyInstance } from 'fastify';
import type { WebSocket } from 'ws';
import { accountFromToken, requireActive } from '../auth/session';
import type { Db } from '../db/client';
import { AppError } from '../errors';
import {
  blackjackAct,
  blackjackResume,
  blackjackStart,
  isBigWin,
  playRoulette,
  playSicBo,
  playSlots,
  type PlayOutcome,
} from '../services/games';
import { badgesOf, toPublicUser, type UserRow } from '../services/users';
import type { RealtimeHub } from './hub';
import { notifyProgress } from '../services/progression';
import { tableRoom, type RoundTableEngine } from '../services/roundTables';
import { cardRoom, type CardTableEngine } from '../services/cardTables';

const AUTH_TIMEOUT_MS = 10_000;

export function registerGateway(app: FastifyInstance, db: Db, hub: RealtimeHub, tables: RoundTableEngine, cards: CardTableEngine, limits: { rate: number; burst: number }): void {
  const { rate: RATE, burst: BURST } = limits;
  app.get('/ws', { websocket: true }, (socket: WebSocket) => {
    let account: UserRow | null = null;
    let tokens = BURST;
    let last = Date.now();
    let queue = Promise.resolve();

    const send = (msg: ServerMessage) => {
      if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(msg));
    };
    const conn = { userId: '', send, close: (reason: string) => socket.close(4001, reason) };

    const authTimer = setTimeout(() => {
      if (!account) socket.close(4001, 'auth timeout');
    }, AUTH_TIMEOUT_MS);

    const handle = async (msg: ClientMessage): Promise<unknown> => {
      if (msg.type === 'auth') {
        if (account) return { user: await toPublicUser(db, account) };
        account = await accountFromToken(app, db, msg.token);
        clearTimeout(authTimer);
        conn.userId = account.id;
        hub.add(conn);
        return { user: await toPublicUser(db, account) };
      }
      if (msg.type === 'ping') return { now: Date.now() };
      if (!account) throw new AppError('unauthorized', 401);
      requireActive(account);
      const userId = account.id;

      let outcome: PlayOutcome<unknown> | null = null;
      switch (msg.type) {
        case 'slots.spin':
          outcome = await playSlots(db, userId, msg.id, msg.bet);
          break;
        case 'roulette.spin':
          outcome = await playRoulette(db, userId, msg.id, msg.bets);
          break;
        case 'sicbo.roll':
          outcome = await playSicBo(db, userId, msg.id, msg.bets);
          break;
        case 'blackjack.start':
          outcome = await blackjackStart(db, userId, msg.id, msg.bet);
          break;
        case 'blackjack.action':
          outcome = await blackjackAct(db, userId, msg.id, msg.roundId, msg.action);
          break;
        case 'blackjack.resume':
          return blackjackResume(db, userId);
        case 'table.join': {
          const view = await tables.view(msg.tableId, userId);
          hub.join(tableRoom(msg.tableId), conn);
          return view;
        }
        case 'table.leave':
          hub.leave(tableRoom(msg.tableId), conn);
          return { ok: true };
        case 'card.join': {
          const view = await cards.view(msg.tableId, userId);
          hub.join(cardRoom(msg.tableId), conn);
          return view;
        }
        case 'card.leave':
          hub.leave(cardRoom(msg.tableId), conn);
          return { ok: true };
        case 'card.sit':
          await cards.sit(userId, msg.tableId, msg.seat, msg.buyIn);
          return cards.view(msg.tableId, userId);
        case 'card.stand':
          return cards.stand(userId, msg.tableId);
        case 'card.back':
          await cards.back(userId, msg.tableId);
          return cards.view(msg.tableId, userId);
        case 'card.act':
          await cards.act(userId, msg.tableId, msg.handId, { type: msg.action, amount: msg.amount });
          return { ok: true };
        case 'card.queue':
          await cards.queue(userId, msg.game);
          return { queued: true, game: msg.game };
        case 'card.unqueue':
          await cards.unqueue(userId);
          return { ok: true };
        case 'table.bet': {
          const res = await tables.placeBets(userId, msg.tableId, msg.roundId, msg.bets, msg.id);
          hub.sendToUser(userId, { type: 'event', event: 'wallet', data: { balance: res.balance } });
          return res;
        }
      }
      if (!outcome) return null;
      // Keep the player's other tabs/devices in sync.
      hub.sendToUser(userId, { type: 'event', event: 'wallet', data: { balance: outcome.envelope.balance } });
      if (outcome.progress) notifyProgress(hub, userId, outcome.progress);
      if (outcome.settled && isBigWin(outcome.settled)) {
        void hub.recordBigWin({
          displayName: account.displayName,
          badges: badgesOf(account),
          game: outcome.game,
          bet: outcome.settled.bet,
          payout: outcome.settled.payout,
          at: new Date().toISOString(),
        });
      }
      return outcome.envelope;
    };

    socket.on('message', (raw) => {
      const now = Date.now();
      tokens = Math.min(BURST, tokens + ((now - last) / 1000) * RATE);
      last = now;

      let parsed: unknown;
      try {
        parsed = JSON.parse(raw.toString());
      } catch {
        socket.close(4000, 'invalid json');
        return;
      }
      const id = typeof (parsed as { id?: unknown })?.id === 'string' ? (parsed as { id: string }).id : randomUUID();
      if (tokens < 1) {
        send({ type: 'res', id, ok: false, error: { code: 'rate_limited' } });
        return;
      }
      tokens -= 1;

      const result = clientMessageSchema.safeParse(parsed);
      if (!result.success) {
        send({ type: 'res', id, ok: false, error: { code: 'bad_request' } });
        return;
      }
      // Process one message at a time per socket so game actions keep their order.
      queue = queue.then(async () => {
        try {
          const data = await handle(result.data);
          send({ type: 'res', id, ok: true, data });
        } catch (err) {
          if (err instanceof AppError) {
            send({ type: 'res', id, ok: false, error: { code: err.code } });
            if (err.code === 'unauthorized' || err.code === 'banned') socket.close(4001, err.code);
          } else {
            app.log.error({ err, type: result.data.type }, 'ws handler failed');
            send({ type: 'res', id, ok: false, error: { code: 'internal' } });
          }
        }
      });
    });

    socket.on('close', () => {
      clearTimeout(authTimer);
      if (account) hub.remove(conn);
    });
    socket.on('error', (err) => app.log.warn({ err }, 'ws error'));
  });
}
