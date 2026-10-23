import { randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from 'node:crypto';
import { hash as argonHash, verify as argonVerify } from '@node-rs/argon2';

/** OWASP-recommended Argon2id parameters (19 MiB, 2 iterations). */
const ARGON = { memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

export function hashPassword(password: string): Promise<string> {
  return argonHash(password.normalize('NFKC'), ARGON);
}

const scrypt = (password: string, salt: Buffer, keylen: number, opts: ScryptOptions) =>
  new Promise<Buffer>((resolve, reject) => scryptCb(password, salt, keylen, opts, (err, key) => (err ? reject(err) : resolve(key))));

/** Verifies Argon2id hashes and the legacy scrypt format (scrypt$N$r$p$salt$hash). */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const pw = password.normalize('NFKC');
  if (stored.startsWith('$argon2')) {
    try {
      return await argonVerify(stored, pw);
    } catch {
      return false;
    }
  }
  const [algo, n, r, p, saltB64, hashB64] = stored.split('$');
  if (algo !== 'scrypt' || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, 'base64');
  const key = await scrypt(pw, Buffer.from(saltB64, 'base64'), expected.length, { N: Number(n), r: Number(r), p: Number(p) });
  return key.length === expected.length && timingSafeEqual(key, expected);
}

/** Legacy hashes are upgraded to Argon2id after a successful login. */
export function needsRehash(stored: string): boolean {
  return !stored.startsWith('$argon2id$');
}

/** Hash that no password can match (system accounts, accounts awaiting activation). */
export const UNUSABLE_PASSWORD = '!disabled';

let dummyHash: Promise<string> | undefined;
/** Keeps login timing constant for unknown accounts. */
export function dummyPasswordHash(): Promise<string> {
  dummyHash ??= hashPassword(randomBytes(16).toString('hex'));
  return dummyHash;
}
