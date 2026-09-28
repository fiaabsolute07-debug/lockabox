import { createHash, randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import bs58 from 'bs58';
import nacl from 'tweetnacl';
import { createPublicClient, getAddress, http, verifyMessage } from 'viem';
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

export type Family = 'solana' | 'evm';
const STATEMENT = 'Sign in to Lockabox. This does not send a transaction or cost anything.';

/** Production uses a configured origin, never an arbitrary Host/header supplied by a client. */
export function authOrigin(req: Request) {
  const configured = process.env.AUTH_ORIGIN;
  const requested = req.headers.get('origin');
  const isLoopback = (u: URL) => ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname);
  let origin: URL;
  if (configured || process.env.NODE_ENV === 'production') origin = new URL(configured || 'https://lockabox.fun');
  else {
    // Local dev only: `next dev` reports req.url as localhost even when the page is open on 127.0.0.1,
    // so a loopback Origin header decides which of the two the message is bound to.
    origin = new URL(req.url);
    if (!isLoopback(origin)) throw new Error('set AUTH_ORIGIN for this host');
    if (requested) {
      let r: URL;
      try { r = new URL(requested); } catch { throw new Error('sign-in origin mismatch'); }
      if (!isLoopback(r)) throw new Error('sign-in origin mismatch');
      origin = r;
    }
  }
  if (origin.username || origin.password || (origin.protocol !== 'https:' && !(origin.protocol === 'http:' && isLoopback(origin)))) throw new Error('invalid sign-in origin');
  if (requested && requested !== origin.origin) throw new Error('sign-in origin mismatch');
  return origin.origin;
}

const messageDomain = (origin: string) => { const u = new URL(origin); return u.protocol === 'https:' ? u.host : u.origin; };

export function signInMessage(address: string, nonce: string, issuedAt: string, domain = 'lockabox.fun') {
  return `${domain} wants you to sign in with your Solana account:\n${address}\n\n${STATEMENT}\n\nNonce: ${nonce}\nIssued At: ${issuedAt}`;
}

/** EIP-4361 (Sign-In with Ethereum). `address` must be the EIP-55 checksummed form. */
export function siweMessage(address: string, chainId: number, nonce: string, issuedAt: string, domain = 'lockabox.fun', uri = `https://${domain}`) {
  return `${domain} wants you to sign in with your Ethereum account:\n${address}\n\n${STATEMENT}\n\nURI: ${uri}\nVersion: 1\nChain ID: ${chainId}\nNonce: ${nonce}\nIssued At: ${issuedAt}`;
}

export function isSolanaAddress(a: string) {
  try { return bs58.decode(a).length === 32; } catch { return false; }
}

export function isEvmAddress(a: string) {
  return /^0x[0-9a-fA-F]{40}$/.test(a);
}

/** Chains a SIWE message may name: the enabled EVM chains we know. */
async function evmChain(chainId: number, sql: postgres.Sql) {
  const [c] = await sql<{ rpc_url: string | null }[]>`select rpc_url from chains where family = 'evm' and enabled and evm_chain_id = ${chainId}`;
  return c;
}

export async function createNonce(address: string, sql: postgres.Sql = defaultSql, opts: { family?: Family; chainId?: number; origin?: string } = {}) {
  const family = opts.family ?? 'solana';
  if (family === 'solana' ? !isSolanaAddress(address) : !isEvmAddress(address)) throw new Error('invalid address');
  if (family === 'evm' && !(opts.chainId && (await evmChain(opts.chainId, sql)))) throw new Error('unsupported chain');
  const nonce = randomBytes(16).toString('hex');
  const issuedAt = new Date().toISOString();
  const key = family === 'evm' ? address.toLowerCase() : address;
  await sql`insert into auth_nonces (nonce, address, chain_family, expires_at, issued_at) values (${nonce}, ${key}, ${family}, now() + make_interval(mins => ${NONCE_MINUTES}), ${issuedAt})`;
  const origin = opts.origin ?? 'https://lockabox.fun';
  const message = family === 'evm' ? siweMessage(getAddress(address), opts.chainId!, nonce, issuedAt, messageDomain(origin), origin) : signInMessage(address, nonce, issuedAt, messageDomain(origin));
  return { nonce, issuedAt, message };
}

/** EOA signatures are checked locally; smart-contract wallets (ERC-1271 / ERC-6492) through the chain's RPC. */
async function evmSignatureValid(address: string, chainId: number, message: string, signature: string, sql: postgres.Sql) {
  if (!/^0x[0-9a-fA-F]+$/.test(signature)) return false;
  const addr = getAddress(address);
  try { if (await verifyMessage({ address: addr, message, signature: signature as `0x${string}` })) return true; } catch { /* not an EOA signature */ }
  // A 65-byte signature is a plain EOA one; if it didn't recover to the address, it's wrong. Longer ones are smart wallets.
  if (signature.length === 2 + 65 * 2) return false;
  const c = await evmChain(chainId, sql);
  if (!c?.rpc_url) return false;
  const client = createPublicClient({ transport: http(c.rpc_url, { timeout: 10_000 }) });
  return client.verifyMessage({ address: addr, message, signature: signature as `0x${string}` }).catch(() => false);
}

/** LAB-AC-005: a nonce works once and expires after 5 minutes. Returns the user id and sets the session cookie. */
type SignIn = { address: string; nonce: string; issuedAt: string; signature: string; family?: Family; chainId?: number; origin?: string };

export async function verifySignIn(p: SignIn, sql: postgres.Sql = defaultSql): Promise<string> {
  const { userId, token } = await signInCore(p, sql);
  (await cookies()).set(SESSION_COOKIE, token, { httpOnly: true, sameSite: 'lax', secure, path: '/', maxAge: 60 * 60 * 24 * SESSION_DAYS });
  return userId;
}

/** Cookie-free core (testable): checks the signature, consumes the nonce once, creates/looks up the user, opens a session. */
export async function signInCore(p: SignIn, sql: postgres.Sql = defaultSql): Promise<{ userId: string; token: string }> {
  const family = p.family ?? 'solana';
  const origin = p.origin ?? 'https://lockabox.fun';
  let ok: boolean;
  let key: string;
  if (family === 'evm') {
    if (!isEvmAddress(p.address) || !p.chainId) throw new Error('bad address or chain');
    key = p.address.toLowerCase();
    if (!(await evmChain(p.chainId, sql))) throw new Error('unsupported chain');
    ok = await evmSignatureValid(p.address, p.chainId, siweMessage(getAddress(p.address), p.chainId, p.nonce, p.issuedAt, messageDomain(origin), origin), p.signature, sql);
  } else {
    key = p.address;
    try {
      ok = nacl.sign.detached.verify(new TextEncoder().encode(signInMessage(p.address, p.nonce, p.issuedAt, messageDomain(origin))), bs58.decode(p.signature), bs58.decode(p.address));
    } catch { ok = false; }
  }
  if (!ok) throw new Error('bad signature');
  if (!Number.isFinite(Date.parse(p.issuedAt)) || Math.abs(Date.now() - Date.parse(p.issuedAt)) > NONCE_MINUTES * 60_000) throw new Error('sign-in message expired');
  const userId = await sql.begin(async (tx) => {
    const [n] = await tx`update auth_nonces set used_at = now()
      where nonce = ${p.nonce} and address = ${key} and chain_family = ${family} and issued_at = ${p.issuedAt} and used_at is null and expires_at > now() returning nonce`;
    if (!n) throw new Error('nonce expired or already used');
    const [w] = await tx<{ user_id: string }[]>`select user_id from wallets where chain_family = ${family} and address = ${key}`;
    if (w) return w.user_id;
    const [u] = await tx<{ id: string }[]>`insert into users default values returning id`;
    await tx`insert into wallets (user_id, chain_family, address) values (${u.id}, ${family}, ${key})`;
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
