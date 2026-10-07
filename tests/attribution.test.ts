import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const root = join(__dirname, '..');

describe('TMDB attribution (logos-attribution terms)', () => {
  it('ships the official self-hosted logo mark', () => {
    const p = join(root, 'public', 'vendor', 'tmdb-logo.svg');
    expect(existsSync(p)).toBe(true);
    const svg = readFileSync(p, 'utf8');
    expect(svg).toContain('<svg');
  });

  it('renders logo + notice on every data surface', () => {
    for (const f of [
      'src/components/public/SiteFooter.astro',
      'src/components/public/MovieShowcase.astro',
      'src/components/public/WhereToWatch.astro',
    ]) {
      const src = readFileSync(join(root, f), 'utf8');
      expect(src).toContain('TmdbAttribution');
    }
    const lockup = readFileSync(
      join(root, 'src/components/public/TmdbAttribution.astro'),
      'utf8'
    );
    expect(lockup).toContain('not endorsed or certified');
    expect(lockup).toContain('https://www.themoviedb.org/');
  });
});
