/**
 * Member input validation — pure functions, no I/O.
 * Contract: sibling crews (auth API + pages) rely on these exact rules.
 */

export const RESERVED_HANDLES = [
  'admin',
  'api',
  'movies',
  'reviews',
  'setup',
  'static',
  'search',
  'login',
  'signup',
  'u',
] as const;

export type ValidationResult = { ok: true } | { ok: false; error: string };

const HANDLE_RE = /^[a-z0-9_]+$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** 3-20 chars, lowercase alnum + underscore, not reserved. */
export function validateHandle(handle: string): ValidationResult {
  if (typeof handle !== 'string') return { ok: false, error: 'invalid handle' };
  const v = handle.trim();
  if (v.length < 3 || v.length > 20) return { ok: false, error: 'handle must be 3-20 characters' };
  if (!HANDLE_RE.test(v)) {
    return { ok: false, error: 'handle must be lowercase letters, numbers, or underscore' };
  }
  if ((RESERVED_HANDLES as readonly string[]).includes(v)) {
    return { ok: false, error: 'handle is reserved' };
  }
  return { ok: true };
}

/** Simple RFC-style check, total length ≤ 254. */
export function validateEmail(email: string): ValidationResult {
  if (typeof email !== 'string') return { ok: false, error: 'invalid email' };
  const v = email.trim();
  if (v.length === 0 || v.length > 254) return { ok: false, error: 'invalid email' };
  if (!EMAIL_RE.test(v)) return { ok: false, error: 'invalid email' };
  return { ok: true };
}

/** Minimum 10 characters. */
export function validatePassword(password: string): ValidationResult {
  if (typeof password !== 'string' || password.length < 10) {
    return { ok: false, error: 'password must be at least 10 characters' };
  }
  return { ok: true };
}

/** 1-40 characters after trimming. */
export function validateDisplayName(name: string): ValidationResult {
  if (typeof name !== 'string') return { ok: false, error: 'invalid display name' };
  const v = name.trim();
  if (v.length < 1 || v.length > 40) {
    return { ok: false, error: 'display name must be 1-40 characters' };
  }
  return { ok: true };
}
