import type { StaffTicketView, SupportMessageView, SupportTicketView } from '@casino/shared';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createStaff, randomIp, register, startTestApp, TestSocket, type TestApp } from './helpers';

let t: TestApp;
beforeAll(async () => {
  t = await startTestApp();
});
afterAll(async () => {
  await t.app.close();
});

type Who = { token: string } & Partial<{ headers: Record<string, string> }>;
const call = (who: Who, method: 'GET' | 'POST', url: string, payload?: unknown) =>
  t.app.inject({ method, url, headers: { authorization: `Bearer ${who.token}` }, payload: payload as object, remoteAddress: randomIp() });
const newTicket = { category: 'account', subject: 'Không đăng nhập được', message: 'Tôi quên mật khẩu và không nhận được email khôi phục.' };

describe('support center', () => {
  it('player ↔ support conversation: private, staff names hidden, unread notifications', async () => {
    const player = await register(t);
    const other = await register(t);
    const agent = await createStaff(t, 'support');
    const { id } = (await call(player, 'POST', '/api/support/tickets', newTicket)).json();
    // Another player cannot even learn that the ticket exists.
    expect((await call(other, 'GET', `/api/support/tickets/${id}`)).statusCode).toBe(404);
    expect((await call(other, 'POST', `/api/support/tickets/${id}/replies`, { message: 'hi' })).statusCode).toBe(404);

    const queue = (await call(agent, 'GET', '/api/admin/support/tickets?status=open')).json().tickets as StaffTicketView[];
    expect(queue.find((q) => q.id === id)).toMatchObject({ player: { uid: player.user.uid }, awaitingStaff: true });

    const socket = await TestSocket.connect(t.port, player.token);
    expect((await call(agent, 'POST', `/api/support/tickets/${id}/replies`, { message: 'Chào bạn, chúng tôi đã kiểm tra tài khoản.' })).statusCode).toBe(200);
    await new Promise((r) => setTimeout(r, 100));
    expect(socket.events.some((e) => e.type === 'event' && e.event === 'support')).toBe(true);
    socket.close();
    expect((await call(player, 'GET', '/api/support/unread')).json().count).toBe(1);
    const mine = (await call(player, 'GET', '/api/support/tickets')).json().tickets as SupportTicketView[];
    expect(mine[0]).toMatchObject({ id, status: 'in_progress', unread: true });

    const detail = (await call(player, 'GET', `/api/support/tickets/${id}`)).json() as { messages: SupportMessageView[] };
    expect(detail.messages.map((m) => [m.fromStaff, m.author])).toEqual([
      [false, expect.any(String)],
      [true, 'Keyo Support'],
    ]);
    expect(JSON.stringify(detail)).not.toContain(agent.user.id);
    expect((await call(player, 'GET', '/api/support/unread')).json().count).toBe(0);
    // Staff see who answered.
    const staffView = (await call(agent, 'GET', `/api/support/tickets/${id}`)).json() as { messages: SupportMessageView[] };
    expect(staffView.messages[1]!.author).toContain(`#${agent.user.uid}`);
  });

  it('close and reopen; no replies while closed; staff changes are audited', async () => {
    const player = await register(t);
    const agent = await createStaff(t, 'support');
    const { id } = (await call(player, 'POST', '/api/support/tickets', newTicket)).json();
    await call(player, 'POST', `/api/support/tickets/${id}/close`);
    expect((await call(player, 'POST', `/api/support/tickets/${id}/replies`, { message: 'still there?' })).json().error.code).toBe('ticket_closed');
    await call(player, 'POST', `/api/support/tickets/${id}/reopen`);
    expect((await call(player, 'POST', `/api/support/tickets/${id}/replies`, { message: 'still there?' })).statusCode).toBe(200);
    await call(agent, 'POST', `/api/admin/support/tickets/${id}/assign`);
    await call(agent, 'POST', `/api/support/tickets/${id}/close`);
    const [log] = await t.db.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM audit_logs WHERE target_id = ${id} AND action IN ('support.assign', 'support.close')`);
    expect(log!.n).toBe(2);
    // After the reopen window a player opens a new ticket instead.
    await t.db.execute(sql`UPDATE support_tickets SET closed_at = now() - interval '30 days' WHERE id = ${id}`);
    expect((await call(player, 'POST', `/api/support/tickets/${id}/reopen`)).json().error.code).toBe('ticket_closed');
  });

  it('only staff with support permissions see the queue; moderators and players do not', async () => {
    const moderator = await createStaff(t, 'moderator');
    const player = await register(t);
    const { id } = (await call(player, 'POST', '/api/support/tickets', newTicket)).json();
    expect((await call(moderator, 'GET', '/api/admin/support/tickets')).statusCode).toBe(403);
    expect((await call(moderator, 'GET', `/api/support/tickets/${id}`)).statusCode).toBe(404);
    expect((await call(player, 'GET', '/api/admin/support/tickets')).statusCode).toBe(403);
    const admin = await createStaff(t, 'admin');
    expect((await call(admin, 'GET', `/api/support/tickets/${id}`)).statusCode).toBe(200);
  });
});
