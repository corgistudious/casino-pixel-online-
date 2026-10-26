import { eq, sql } from 'drizzle-orm';
import type { FastifyBaseLogger } from 'fastify';
import nodemailer from 'nodemailer';
import type { Db, DbOrTx } from '../db/client';
import { emailOutbox } from '../db/schema';
import { renderMail, type MailLocale, type MailTemplate } from './templates';

/** Queues an email in the outbox (inside the caller's transaction). */
export async function enqueueMail(
  db: DbOrTx,
  to: string,
  template: MailTemplate,
  locale: string,
  vars: Record<string, string>,
  link?: string,
): Promise<void> {
  const loc: MailLocale = locale === 'en' ? 'en' : 'vi';
  const m = renderMail(template, loc, vars, link);
  await db.insert(emailOutbox).values({ toAddress: to, subject: m.subject, bodyText: m.text, bodyHtml: m.html, template });
}

/**
 * Delivers pending outbox mail through SMTP. Without SMTP_URL the worker does not
 * run and mail stays queued (visible to admins); nothing is silently dropped.
 */
export function startMailWorker(db: Db, log: FastifyBaseLogger, smtpUrl: string | undefined, from: string) {
  if (!smtpUrl) {
    log.warn('SMTP_URL not set: emails are queued in email_outbox but not delivered');
    return () => {};
  }
  const transport = nodemailer.createTransport(smtpUrl);
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const batch = await db.execute<{ id: number; to_address: string; subject: string; body_text: string; body_html: string; attempts: number }>(sql`
        UPDATE email_outbox SET status = 'sending', attempts = attempts + 1
        WHERE id IN (SELECT id FROM email_outbox WHERE status = 'pending' ORDER BY id LIMIT 20 FOR UPDATE SKIP LOCKED)
        RETURNING id, to_address, subject, body_text, body_html, attempts
      `);
      for (const m of batch) {
        try {
          await transport.sendMail({ from, to: m.to_address, subject: m.subject, text: m.body_text, html: m.body_html });
          await db.update(emailOutbox).set({ status: 'sent', sentAt: new Date(), lastError: null }).where(eq(emailOutbox.id, m.id));
        } catch (err) {
          const status = m.attempts >= 5 ? 'failed' : 'pending';
          await db.update(emailOutbox).set({ status, lastError: String(err).slice(0, 500) }).where(eq(emailOutbox.id, m.id));
          log.warn({ err, id: m.id }, 'mail delivery failed');
        }
      }
    } finally {
      running = false;
    }
  };
  const timer = setInterval(() => void tick(), 5_000);
  timer.unref();
  return () => clearInterval(timer);
}
