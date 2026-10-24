import type { TFunction } from 'i18next';
import { ApiError } from '../net/api';

/** Human-readable message for any thrown value; suspensions include their end date and reason. */
export function errorText(t: TFunction, err: unknown, lang: string): string {
  if (!(err instanceof ApiError)) return t('errors.internal');
  if (err.code === 'banned' && err.details.endsAt !== undefined) {
    const head = err.details.endsAt
      ? t('auth.bannedUntil', { date: new Date(err.details.endsAt).toLocaleString(lang) })
      : t('auth.bannedForever');
    return err.details.reason ? `${head} ${t('auth.bannedReason', { reason: err.details.reason })}` : head;
  }
  return t(`errors.${err.code}`);
}
