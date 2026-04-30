import { describe, it, expect } from 'vitest';
import { decodeJwt } from './auth.js';

// Build a fake JWT (signature isn't checked in decodeJwt — it just reads the body).
function makeJwt(payload: Record<string, unknown>): string {
  const b64 = (s: string) => Buffer.from(s).toString('base64').replace(/=+$/, '');
  const header = b64(JSON.stringify({ alg: 'none', typ: 'JWT' }));
  const body = b64(JSON.stringify(payload));
  return `${header}.${body}.signature`;
}

describe('decodeJwt', () => {
  it('returns icompany / nameid / g for a standard quinbook token', () => {
    const token = makeJwt({
      icompany: '3',
      g: 'a',
      session: 'abc-123',
      'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier': '2',
      exp: 1779995195,
      nbf: 1777403195,
    });
    const claims = decodeJwt(token);
    expect(claims.icompany).toBe('3');
    expect(claims.g).toBe('a');
    expect(claims.session).toBe('abc-123');
    expect(claims.exp).toBe(1779995195);
  });

  it('returns empty object for malformed tokens', () => {
    expect(decodeJwt('garbage')).toEqual({});
    expect(decodeJwt('only.two')).toEqual({});
    expect(decodeJwt('')).toEqual({});
  });

  it('returns empty object when body is not valid JSON', () => {
    const broken = 'aaa.bm90LWpzb24.sig'; // base64("not-json") — not valid JSON
    expect(decodeJwt(broken)).toEqual({});
  });
});
