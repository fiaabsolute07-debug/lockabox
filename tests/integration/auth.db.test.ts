import bs58 from 'bs58';
import nacl from 'tweetnacl';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from '@/lib/db';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { createNonce, signInCore } from '@/modules/auth/session';

const run = process.env.RUN_DB_INTEGRATION ? describe : describe.skip;

run('wallet sign-in (LAB-AC-003/005)', () => {
  beforeEach(async () => { await sql.unsafe('truncate sessions, wallets, auth_nonces, users restart identity cascade'); });

  const kp = nacl.sign.keyPair();
  const address = bs58.encode(kp.publicKey);
  const sign = (m: string) => bs58.encode(nacl.sign.detached(new TextEncoder().encode(m), kp.secretKey));

  it('a valid signature signs in; the same wallet maps to the same user; a nonce works once', async () => {
    const n1 = await createNonce(address);
    const a = await signInCore({ address, nonce: n1.nonce, issuedAt: n1.issuedAt, signature: sign(n1.message) });
    await expect(signInCore({ address, nonce: n1.nonce, issuedAt: n1.issuedAt, signature: sign(n1.message) })).rejects.toThrow(/already used|expired/);
    const n2 = await createNonce(address);
    const b = await signInCore({ address, nonce: n2.nonce, issuedAt: n2.issuedAt, signature: sign(n2.message) });
    expect(b.userId).toBe(a.userId);
  });

  it('rejects a wrong signer, a tampered message and an expired nonce', async () => {
    const other = nacl.sign.keyPair();
    const n = await createNonce(address);
    const wrong = bs58.encode(nacl.sign.detached(new TextEncoder().encode(n.message), other.secretKey));
    await expect(signInCore({ address, nonce: n.nonce, issuedAt: n.issuedAt, signature: wrong })).rejects.toThrow(/bad signature/);
    const n2 = await createNonce(address);
    await expect(signInCore({ address, nonce: n2.nonce, issuedAt: new Date(Date.now() - 1000).toISOString(), signature: sign(n2.message) })).rejects.toThrow();
    const n3 = await createNonce(address);
    await sql`update auth_nonces set expires_at = now() - interval '1 second' where nonce = ${n3.nonce}`;
    await expect(signInCore({ address, nonce: n3.nonce, issuedAt: n3.issuedAt, signature: sign(n3.message) })).rejects.toThrow(/expired/);
  });
});

run('EVM sign-in, EIP-4361 (LAB-AC-004)', () => {
  beforeEach(async () => { await sql.unsafe('truncate sessions, wallets, auth_nonces, users restart identity cascade'); });

  // A throwaway key made for this test only.
  const account = privateKeyToAccount(generatePrivateKey());
  const other = privateKeyToAccount(generatePrivateKey());

  it('signs in with a SIWE message; case of the address does not matter; a nonce works once', async () => {
    const n = await createNonce(account.address, undefined, { family: 'evm', chainId: 8453 });
    expect(n.message).toContain(`${account.address}\n`); // checksummed in the message
    expect(n.message).toContain('Chain ID: 8453');
    const signature = await account.signMessage({ message: n.message });
    const a = await signInCore({ address: account.address.toLowerCase(), nonce: n.nonce, issuedAt: n.issuedAt, signature, family: 'evm', chainId: 8453 });
    await expect(signInCore({ address: account.address, nonce: n.nonce, issuedAt: n.issuedAt, signature, family: 'evm', chainId: 8453 })).rejects.toThrow(/already used|expired/);
    const n2 = await createNonce(account.address.toLowerCase(), undefined, { family: 'evm', chainId: 4663 });
    const b = await signInCore({ address: account.address, nonce: n2.nonce, issuedAt: n2.issuedAt, signature: await account.signMessage({ message: n2.message }), family: 'evm', chainId: 4663 });
    expect(b.userId).toBe(a.userId); // same wallet, any chain → same account
    const [w] = await sql<{ chain_family: string; address: string }[]>`select chain_family, address from wallets where user_id = ${a.userId}`;
    expect(w).toEqual({ chain_family: 'evm', address: account.address.toLowerCase() });
  });

  it('rejects another signer, a different chain id, the wrong family and unknown chains', async () => {
    const n = await createNonce(account.address, undefined, { family: 'evm', chainId: 8453 });
    const wrong = await other.signMessage({ message: n.message });
    await expect(signInCore({ address: account.address, nonce: n.nonce, issuedAt: n.issuedAt, signature: wrong, family: 'evm', chainId: 8453 })).rejects.toThrow(/bad signature/);
    const good = await account.signMessage({ message: n.message });
    await expect(signInCore({ address: account.address, nonce: n.nonce, issuedAt: n.issuedAt, signature: good, family: 'evm', chainId: 1 })).rejects.toThrow(/bad signature/);
    await expect(signInCore({ address: account.address, nonce: n.nonce, issuedAt: n.issuedAt, signature: good, family: 'solana' })).rejects.toThrow();
    await expect(createNonce(account.address, undefined, { family: 'evm', chainId: 999_999 })).rejects.toThrow(/unsupported chain/);
    expect((await signInCore({ address: account.address, nonce: n.nonce, issuedAt: n.issuedAt, signature: good, family: 'evm', chainId: 8453 })).userId).toBeTruthy();
  });
});

afterAll(async () => { await sql.end(); });
