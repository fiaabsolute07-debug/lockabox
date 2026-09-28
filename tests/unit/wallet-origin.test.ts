import { afterEach, describe, expect, it, vi } from 'vitest';
import { authOrigin } from '@/modules/auth/session';

afterEach(() => vi.unstubAllEnvs());
describe('wallet sign-in origin', () => {
  it('uses the exact local origin, including port, and rejects foreign origins', () => {
    vi.stubEnv('AUTH_ORIGIN',''); vi.stubEnv('NODE_ENV','development');
    expect(authOrigin(new Request('http://127.0.0.1:4310/api/auth/nonce'))).toBe('http://127.0.0.1:4310');
    expect(() => authOrigin(new Request('http://127.0.0.1:4310/api/auth/nonce',{headers:{Origin:'https://evil.test'}}))).toThrow(/mismatch/);
    expect(() => authOrigin(new Request('https://evil.test/api/auth/nonce'))).toThrow(/AUTH_ORIGIN/);
  });
  it('accepts the 127.0.0.1 page when next dev reports the request as localhost', () => {
    vi.stubEnv('AUTH_ORIGIN',''); vi.stubEnv('NODE_ENV','development');
    expect(authOrigin(new Request('http://localhost:4310/api/auth/nonce',{headers:{Origin:'http://127.0.0.1:4310'}}))).toBe('http://127.0.0.1:4310');
    expect(() => authOrigin(new Request('http://localhost:4310/api/auth/nonce',{headers:{Origin:'null'}}))).toThrow(/mismatch/);
  });
  it('does not trust the request host for production sign-in', () => {
    vi.stubEnv('AUTH_ORIGIN',''); vi.stubEnv('NODE_ENV','production');
    expect(authOrigin(new Request('https://evil.test/api/auth/nonce'))).toBe('https://lockabox.fun');
    vi.stubEnv('AUTH_ORIGIN','https://preview.lockabox.fun');
    expect(authOrigin(new Request('http://internal:3000/api/auth/nonce',{headers:{Origin:'https://preview.lockabox.fun'}}))).toBe('https://preview.lockabox.fun');
    vi.stubEnv('AUTH_ORIGIN','http://insecure.example');
    expect(() => authOrigin(new Request('http://insecure.example/'))).toThrow(/invalid/);
  });
});
