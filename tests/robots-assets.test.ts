import { describe, it, expect, afterEach } from 'vitest';
import { GET } from '../src/pages/robots.txt';

/**
 * GET /robots.txt — the crawl policy for this brand.
 * GSC reported "robots.txt — Not Fetched" because the legacy archive router
 * answered 410 for the archived robots.txt; the endpoint must serve a real
 * file with an origin-derived sitemap URL.
 */
const saved = process.env.SITE_URL;

afterEach(() => {
  if (saved === undefined) delete process.env.SITE_URL;
  else process.env.SITE_URL = saved;
});

function call(url: string): Promise<Response> {
  return (GET as Function)({ url: new URL(url) }) as Promise<Response>;
}

describe('GET /robots.txt', () => {
  it('serves 200 as text/plain', async () => {
    delete process.env.SITE_URL;
    const res = await call('https://brand-one.test/robots.txt');
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/plain');
  });

  it('emits the crawler policy and a sitemap line from the request origin', async () => {
    delete process.env.SITE_URL;
    const body = await (await call('https://brand-one.test/robots.txt')).text();
    expect(body).toContain('User-agent: *');
    expect(body).toContain('Allow: /');
    expect(body).toMatch(/^Sitemap: https:\/\/brand-one\.test\/sitemap\.xml$/m);
  });

  it('trims crawl waste (/api/, /search) but never disallows /admin', async () => {
    delete process.env.SITE_URL;
    const body = await (await call('https://brand-one.test/robots.txt')).text();
    expect(body).toMatch(/^Disallow: \/api\/$/m);
    expect(body).toMatch(/^Disallow: \/search$/m);
    expect(body).not.toMatch(/^Disallow: \/admin/m);
  });

  it('uses the request origin, not a hardcoded host', async () => {
    delete process.env.SITE_URL;
    const body = await (await call('https://brand-two.test/robots.txt')).text();
    expect(body).toContain('Sitemap: https://brand-two.test/sitemap.xml');
    expect(body).not.toContain('brand-one.test');
  });

  it('resolves the per-brand origin through siteOrigin() (SITE_URL wins)', async () => {
    process.env.SITE_URL = 'https://brand-three.test/';
    const body = await (await call('http://127.0.0.1:3100/robots.txt')).text();
    expect(body).toContain('Sitemap: https://brand-three.test/sitemap.xml');
  });

  it('never leaks a query string into the sitemap URL', async () => {
    delete process.env.SITE_URL;
    const body = await (await call('https://brand-one.test/robots.txt?utm_source=probe')).text();
    expect(body).toContain('Sitemap: https://brand-one.test/sitemap.xml');
    expect(body).not.toContain('utm_source');
  });
});
