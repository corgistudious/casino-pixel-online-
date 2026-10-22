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
      return 403;
    case 'round_not_found':
      return 404;
    case 'username_taken':
    case 'round_active':
    case 'round_finished':
      return 409;
    case 'rate_limited':
      return 429;
    case 'internal':
      return 500;
    default:
      return 400;
  }
}

export const fail = (code: ErrorCode, message?: string) => new AppError(code, statusFor(code), message);
