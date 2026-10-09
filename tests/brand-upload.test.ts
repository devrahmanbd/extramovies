import { describe, expect, it } from 'vitest';
import {
  ALLOWED_EXTS,
  MAX_UPLOAD_BYTES,
  extOf,
  sanitizeBasename,
  sniffMatches,
  suffixedName,
  validateUpload,
} from '../src/pages/api/admin/upload';

function pngBytes(): Uint8Array {
  return Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
}

function jpgBytes(): Uint8Array {
  return Uint8Array.from([
    ...Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
    ...Buffer.from('xxJFIFxx', 'latin1'),
  ]);
}

function webpBytes(): Uint8Array {
  return Uint8Array.from(Buffer.from('RIFF\x01\x02\x03\x04WEBP', 'latin1'));
}

function icoBytes(): Uint8Array {
  return Uint8Array.from([0x00, 0x00, 0x01, 0x00, 0x10, 0x10]);
}

function svgBytes(): Uint8Array {
  return Uint8Array.from(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>', 'utf8'));
}

describe('brand uploads: sanitizeBasename', () => {
  it('lowercases and maps spaces/specials to dashes', () => {
    expect(sanitizeBasename('My Logo FILE.PNG')).toBe('my-logo-file.png');
  });

  it('strips directory traversal segments', () => {
    const out = sanitizeBasename('../../etc/passwd.svg');
    expect(out).not.toContain('/');
    expect(out).not.toContain('..');
    expect(out.endsWith('.svg')).toBe(true);
  });

  it('strips backslash paths and leading dots (never a dotfile)', () => {
    expect(sanitizeBasename('..\\..\\a\\favicon.ico')).toBe('favicon.ico');
    expect(sanitizeBasename('.htaccess')).not.toMatch(/^\./);
  });

  it('never returns empty', () => {
    expect(sanitizeBasename('')).toBe('upload');
    expect(sanitizeBasename('...')).toBe('upload');
  });

  it('suffixedName never overwrites (appends -n before ext)', () => {
    expect(suffixedName('logo.svg', 0)).toBe('logo.svg');
    expect(suffixedName('logo.svg', 1)).toBe('logo-1.svg');
    expect(suffixedName('noext', 2)).toBe('noext-2');
  });
});

describe('brand uploads: sniffMatches (magic bytes)', () => {
  it('accepts each allowlisted type with correct magic', () => {
    expect(sniffMatches('svg', svgBytes())).toBe(true);
    expect(sniffMatches('png', pngBytes())).toBe(true);
    expect(sniffMatches('jpg', jpgBytes())).toBe(true);
    expect(sniffMatches('jpeg', jpgBytes())).toBe(true);
    expect(sniffMatches('webp', webpBytes())).toBe(true);
    expect(sniffMatches('ico', icoBytes())).toBe(true);
  });

  it('rejects mismatched content (png bytes claimed as jpg, text as svg)', () => {
    expect(sniffMatches('jpg', pngBytes())).toBe(false);
    expect(sniffMatches('svg', Uint8Array.from(Buffer.from('hello world', 'utf8')))).toBe(false);
    expect(sniffMatches('webp', pngBytes())).toBe(false);
    expect(sniffMatches('ico', pngBytes())).toBe(false);
  });

  it('covers every extension in the allowlist', () => {
    for (const ext of ALLOWED_EXTS) {
      expect(typeof ext).toBe('string');
    }
    expect([...ALLOWED_EXTS].sort()).toEqual(['ico', 'jpeg', 'jpg', 'png', 'svg', 'webp']);
  });
});

describe('brand uploads: validateUpload', () => {
  it('accepts a valid logo png and favicon svg', () => {
    expect(validateUpload({ filename: 'logo.png', data: pngBytes(), kind: 'logo' })).toBeNull();
    expect(validateUpload({ filename: 'favicon.svg', data: svgBytes(), kind: 'favicon' })).toBeNull();
  });

  it('rejects unknown kind', () => {
    expect(validateUpload({ filename: 'logo.png', data: pngBytes(), kind: 'avatar' })).toMatch(/kind/);
  });

  it('rejects disallowed extensions', () => {
    expect(validateUpload({ filename: 'run.exe', data: pngBytes(), kind: 'logo' })).toMatch(/unsupported/);
    expect(validateUpload({ filename: 'noext', data: pngBytes(), kind: 'logo' })).toMatch(/unsupported/);
  });

  it('rejects empty files and enforces the 512KB cap', () => {
    expect(MAX_UPLOAD_BYTES).toBe(512 * 1024);
    expect(validateUpload({ filename: 'a.png', data: new Uint8Array(0), kind: 'logo' })).toMatch(/empty/);
    const big = new Uint8Array(MAX_UPLOAD_BYTES + 1);
    big[1] = 0x50; big[2] = 0x4e; big[3] = 0x47;
    expect(validateUpload({ filename: 'big.png', data: big, kind: 'logo' })).toMatch(/too large/);
  });

  it('rejects content/extension mismatch', () => {
    expect(validateUpload({ filename: 'evil.svg', data: pngBytes(), kind: 'favicon' })).toMatch(/does not match/);
  });

  it('extOf is case-insensitive and traversal-safe', () => {
    expect(extOf('PHOTO.JPG')).toBe('jpg');
    expect(extOf('../../x/favicon.Svg')).toBe('svg');
    expect(extOf('noext')).toBe('');
  });
});
