import { describe, expect, it } from 'vitest';
import { getClientIp } from '../src/lib/auth/rate-limit';

function reqWithXff(xff: string | null): Request {
  const headers = new Headers();
  if (xff !== null) headers.set('x-forwarded-for', xff);
  return new Request('http://localhost/api/admin/login', { headers });
}

describe('getClientIp behind proxies', () => {
  it('uses the single forwarded IP', () => {
    expect(getClientIp(reqWithXff('203.0.113.7'))).toBe('203.0.113.7');
  });

  it('ignores attacker-controlled prefixes, trusts the last observed hop', () => {
    expect(getClientIp(reqWithXff('1.2.3.4, 203.0.113.7'))).toBe('203.0.113.7');
  });

  it('strips private hops added by our own edge/proxies', () => {
    expect(getClientIp(reqWithXff('203.0.113.7, 127.0.0.1'))).toBe('203.0.113.7');
    expect(getClientIp(reqWithXff('10.0.0.5, 192.168.1.9'))).toBe('unknown');
  });

  it('falls back to unknown without headers', () => {
    expect(getClientIp(reqWithXff(null))).toBe('unknown');
  });

  it('legacy shape still prefers locals/clientAddress', () => {
    expect(getClientIp({ clientAddress: '9.9.9.9' } as never)).toBe('9.9.9.9');
  });
});
