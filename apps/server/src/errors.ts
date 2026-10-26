import type { ErrorCode } from '@casino/shared';

/** Expected, user-facing failure. The code is translated on the client. */
export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    public readonly status = 400,
    message?: string,
  ) {
    super(message ?? code);
  }
}

export function statusFor(code: ErrorCode): number {
  switch (code) {
    case 'unauthorized':
    case 'invalid_credentials':
      return 401;
    case 'banned':
    case 'forbidden':
    case 'email_not_verified':
    case 'system_account':
    case 'protected_account':
    case 'self_action_forbidden':
    case 'muted':
    case 'not_friends':
    case 'reauth_required':
      return 403;
    case 'round_not_found':
    case 'not_found':
    case 'item_not_found':
      return 404;
    case 'username_taken':
    case 'round_active':
    case 'round_finished':
    case 'already_owned':
    case 'email_taken':
    case 'uid_taken':
    case 'uid_reserved':
    case 'deletion_pending':
    case 'idempotency_conflict':
    case 'last_super_admin':
    case 'already_in_guild':
    case 'guild_name_taken':
    case 'already_claimed':
      return 409;
    case 'too_soon':
    case 'too_many_attempts':
      return 429;
    case 'rate_limited':
      return 429;
    case 'internal':
      return 500;
    default:
      return 400;
  }
}

export const fail = (code: ErrorCode, message?: string) => new AppError(code, statusFor(code), message);
