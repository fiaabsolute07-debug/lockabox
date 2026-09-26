import { createHash, randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import bs58 from 'bs58';
import nacl from 'tweetnacl';
import type postgres from 'postgres';
import { sql as defaultSql } from '@/lib/db';

export const DEVICE_COOKIE = 'lab_device';
export const SESSION_COOKIE = 'lab_session';
const SESSION_DAYS = 30;
const NONCE_MINUTES = 5;
const secure = process.env.NODE_ENV === 'production';

const hashToken = (t: string) => createHash('sha256').update(t).digest('hex');

/** Anonymous device id (guests can roll and verify; LAB-AC-028). */
export async function deviceId(): Promise<string> {
  const jar = await cookies();
  const existing = jar.get(DEVICE_COOKIE)?.value;
  if (existing && /^[A-Za-z0-9_-]{16,64}$/.test(existing)) return existing;
  const id = randomBytes(18).toString('base64url');
  jar.set(DEVICE_COOKIE, id, { httpOnly: true, sameSite: 'lax', secure, path: '/', maxAge: 60 * 60 * 24 * 365 });
  return id;
}

export async function currentUserId(sql: postgres.Sql = defaultSql): Promise<string | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const [row] = await sql<{ user_id: string }[]>`select user_id from sessions where token_hash = ${hashToken(token)} and expires_at > now()`;
  return row?.user_id ?? null;
}

export function signInMessage(address: string, nonce: string, issuedAt: string, domain = 'lockabox.fun') {
  return `${domain} wants you to sign in with your Solana account:\n${address}\n\nSign in to Lockabox. This does not send a transaction or cost anything.\n\nNonce: ${nonce}\nIssued At: ${issuedAt}`;
}

export async function createNonce(address: string, sql: postgres.Sql = defaultSql) {
  if (!isSolanaAddress(address)) throw new Error('invalid address');
  const nonce = randomBytes(16).toString('hex');
  const issuedAt = new Date().toISOString();
  await sql`insert into auth_nonces (nonce, address, chain_family, expires_at, issued_at) values (${nonce}, ${address}, 'solana', now() + make_interval(mins => ${NONCE_MINUTES}), ${issuedAt})`;
  return { nonce, issuedAt, message: signInMessage(address, nonce, issuedAt) };
}

export function isSolanaAddress(a: string) {
  try { return bs58.decode(a).length === 32; } catch { return false; }
}

/** LAB-AC-005: a nonce works once and expires after 5 minutes. Returns the user id and sets the session cookie. */
export async function verifySignIn(p: { address: string; nonce: string; issuedAt: string; signature: string }, sql: postgres.Sql = defaultSql): Promise<string> {
  const { userId, token } = await signInCore(p, sql);
  (await cookies()).set(SESSION_COOKIE, token, { httpOnly: true, sameSite: 'lax', secure, path: '/', maxAge: 60 * 60 * 24 * SESSION_DAYS });
  return userId;
}

/** Cookie-free core (testable): checks the signature, consumes the nonce once, creates/looks up the user, opens a session. */
export async function signInCore(p: { address: string; nonce: string; issuedAt: string; signature: string }, sql: postgres.Sql = defaultSql): Promise<{ userId: string; token: string }> {
  const message = signInMessage(p.address, p.nonce, p.issuedAt);
  const ok = nacl.sign.detached.verify(new TextEncoder().encode(message), bs58.decode(p.signature), bs58.decode(p.address));
  if (!ok) throw new Error('bad signature');
  if (Math.abs(Date.now() - Date.parse(p.issuedAt)) > NONCE_MINUTES * 60_000) throw new Error('sign-in message expired');
  const userId = await sql.begin(async (tx) => {
    const [n] = await tx`update auth_nonces set used_at = now() where nonce = ${p.nonce} and address = ${p.address} and issued_at = ${p.issuedAt} and used_at is null and expires_at > now() returning nonce`;
    if (!n) throw new Error('nonce expired or already used');
    const [w] = await tx<{ user_id: string }[]>`select user_id from wallets where chain_family = 'solana' and address = ${p.address}`;
    if (w) return w.user_id;
    const [u] = await tx<{ id: string }[]>`insert into users default values returning id`;
    await tx`insert into wallets (user_id, chain_family, address) values (${u.id}, 'solana', ${p.address})`;
    return u.id;
  });
  const token = randomBytes(32).toString('base64url');
  await sql`insert into sessions (token_hash, user_id, expires_at) values (${hashToken(token)}, ${userId}, now() + make_interval(days => ${SESSION_DAYS}))`;
  return { userId, token };
}

export async function signOut(sql: postgres.Sql = defaultSql) {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await sql`delete from sessions where token_hash = ${hashToken(token)}`;
  jar.delete(SESSION_COOKIE);
}
