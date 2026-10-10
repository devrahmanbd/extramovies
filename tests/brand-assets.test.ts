import { describe, expect, it } from 'vitest';
import { asRootPath } from '../src/lib/seo/brand';
import { organizationJsonLd } from '../src/lib/seo/jsonld';
import type { Brand } from '../src/lib/seo/brand';

function brandWith(logo: string | null, origin: string): Brand {
  return {
    name: 'Test Brand',
    tagline: 'tag',
    domain: 'example.test',
    origin,
    logo,
    favicon: '/favicon.svg',
    icon: '/icon.svg',
    fonts: { display: 'Anton', body: 'Lato', fontUrl: null },
    colors: { accent: '#fff', accentInk: '#000', gold: '#fc0' },
    locale: 'en_US',
    description: 'desc',
    defaultOgImage: null,
    themeColor: '#000',
  };
}

describe('brand assets: multi-site safe paths', () => {
  it('asRootPath keeps root paths relative, normalizes bare paths, passes absolute through', () => {
    expect(asRootPath('/uploads/logo.svg')).toBe('/uploads/logo.svg');
    expect(asRootPath('uploads/logo.svg')).toBe('/uploads/logo.svg');
    expect(asRootPath('https://cdn.example.com/l.svg')).toBe('https://cdn.example.com/l.svg');
    expect(asRootPath(null)).toBeNull();
    expect(asRootPath('  ')).toBeNull();
  });

  it('organization JSON-LD logo resolves against the requesting origin', () => {
    const ld = organizationJsonLd(
      brandWith('/uploads/logo.svg', 'https://cinemavilla.in'),
    ) as { logo?: string };
    expect(ld.logo).toBe('https://cinemavilla.in/uploads/logo.svg');
  });

  it('organization JSON-LD passes absolute logo URLs through untouched', () => {
    const ld = organizationJsonLd(
      brandWith('https://cdn.example.com/l.svg', 'https://cinemavilla.in'),
    ) as { logo?: string };
    expect(ld.logo).toBe('https://cdn.example.com/l.svg');
  });
});
