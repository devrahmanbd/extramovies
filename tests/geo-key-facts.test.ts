import { describe, it, expect, afterEach } from 'vitest';
import { experimental_AstroContainer } from 'astro/container';
import KeyFacts from '../src/components/public/KeyFacts.astro';
import QuickAnswer from '../src/components/public/QuickAnswer.astro';
import { GET } from '../src/pages/llms.txt';
import { keyFactRows, quickAnswers, watchSummary } from '../src/lib/seo/key-facts';
import { renderLlmsTxt, llmsSummary } from '../src/lib/seo/llms-txt';
import type { PublicReview } from '../src/lib/seo/content';

/**
 * GEO/AEO layer — the fact card, the quick-answer block, and /llms.txt.
 *
 * The fact card and the quick answers are rendered through Astro's container
 * API, so the assertions run against the real markup a reader (and a
 * language model) gets, not a re-implementation of it.
 */

async function render(Component: unknown, props: Record<string, unknown>): Promise<string> {
  const container = await experimental_AstroContainer.create();
  return container.renderToString(Component as never, { props });
}

/** Every rendered label/value pair, in order. */
function rows(html: string): { label: string; value: string }[] {
  const out: { label: string; value: string }[] = [];
  const re = /<dt[^>]*>([\s\S]*?)<\/dt>\s*<dd[^>]*>([\s\S]*?)<\/dd>/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    out.push({ label: match[1]!.trim(), value: match[2]!.trim() });
  }
  return out;
}

const FULL_REVIEW: PublicReview = {
  slug: "dune-part-two",
  reviewTitle: "Dune: Part Two Earns Every Minute of Its Desert",
  movieTitle: "Dune: Part Two",
  year: 2024,
  genres: ["Science Fiction", "Adventure"],
  runtimeMinutes: 167,
  rating: 8.8,
  verdict: "The rare blockbuster that earns its scale. See it on the biggest screen available.",
  excerpt: "Villeneuve's sequel finds weight in myth and spectacle.",
  bodyMarkdown: "Body copy.",
  posterUrl: null,
  backdropUrl: null,
  director: "Denis Villeneuve",
  cast: ["Timothée Chalamet", "Zendaya", "Rebecca Ferguson", "Austin Butler"],
  runtimeLabel: null,
  releaseDate: null,
  publishedAt: "2026-09-28T10:00:00.000Z",
  updatedAt: "2026-10-07T10:00:00.000Z",
  authorName: "The Editor",
  providers: {
    streaming: [
      { name: "HBO Max", logoUrl: null },
      { name: "TNT", logoUrl: null },
    ],
    rent: [{ name: "Amazon Video", logoUrl: null }],
    buy: [],
    free: [],
    fetchedAt: "2026-10-06T00:00:00.000Z",
    hideSection: false,
    link: null,
  },
  customWatch: null,
  tmdbId: 693134,
};

const savedSiteUrl = process.env.SITE_URL;

afterEach(() => {
  if (savedSiteUrl === undefined) delete process.env.SITE_URL;
  else process.env.SITE_URL = savedSiteUrl;
});

describe('key facts card', () => {
  it('renders every row the review actually carries', async () => {
    const html = await render(KeyFacts, { review: FULL_REVIEW });

    expect(html).toContain('Key facts');
    const labels = rows(html).map((r) => r.label);
    expect(labels).toEqual([
      'Title',
      'Year',
      'Runtime',
      'Director',
      'Cast',
      'Genres',
      'Our rating',
      'Our verdict',
      'Where to watch',
      'Checked on',
      'Reviewed on',
      'Reviewed by',
    ]);

    const byLabel = new Map(rows(html).map((r) => [r.label, r.value]));
    expect(byLabel.get('Title')).toBe('Dune: Part Two');
    expect(byLabel.get('Year')).toBe('2024');
    expect(byLabel.get('Runtime')).toBe('2h 47m');
    expect(byLabel.get('Director')).toBe('Denis Villeneuve');
    expect(byLabel.get('Cast')).toBe('Timothée Chalamet, Zendaya, Rebecca Ferguson');
    expect(byLabel.get('Genres')).toBe('Science Fiction, Adventure');
    expect(byLabel.get('Our rating')).toBe('8.8/10');
    expect(byLabel.get('Our verdict')).toBe(FULL_REVIEW.verdict);
    expect(byLabel.get('Where to watch')).toContain('HBO Max');
    expect(byLabel.get('Checked on')).toBe('October 6, 2026');
    expect(byLabel.get('Reviewed on')).toBe('September 28, 2026');
    expect(byLabel.get('Reviewed by')).toBe('The Editor');
  });

  it('drops the rows a thin review does not carry, and never prints an empty label', async () => {
    const thin: PublicReview = {
      ...FULL_REVIEW,
      runtimeMinutes: null,
      runtimeLabel: null,
      cast: [],
      providers: null,
      customWatch: null,
    };
    const html = await render(KeyFacts, { review: thin });

    const labels = rows(html).map((r) => r.label);
    expect(labels).not.toContain('Runtime');
    expect(labels).not.toContain('Cast');
    expect(labels).not.toContain('Where to watch');
    expect(labels).not.toContain('Checked on');
    expect(labels).toEqual([
      'Title',
      'Year',
      'Director',
      'Genres',
      'Our rating',
      'Our verdict',
      'Reviewed on',
      'Reviewed by',
    ]);
    expect(html).not.toContain('<dt></dt>');
    expect(html).not.toContain('<dd></dd>');
    for (const row of rows(html)) {
      expect(row.value.length).toBeGreaterThan(0);
    }
  });

  it('prints the runtime the store row carries when there are no minutes', () => {
    const labelled: PublicReview = {
      ...FULL_REVIEW,
      runtimeMinutes: null,
      runtimeLabel: '109 min',
    };
    const runtime = keyFactRows(labelled).find((r) => r.label === 'Runtime');
    expect(runtime?.value).toBe('1h 49m');
  });

  it('omits the rating when the review carries none', () => {
    const unrated: PublicReview = { ...FULL_REVIEW, rating: 0 };
    const labels = keyFactRows(unrated).map((r) => r.label);
    expect(labels).not.toContain('Our rating');
  });
});

describe('quick answer block', () => {
  it('answers the two highest-value questions from the review own data', async () => {
    const html = await render(QuickAnswer, { review: FULL_REVIEW });

    expect(html).toContain('Is Dune: Part Two worth watching?');
    expect(html).toContain('Where can I watch Dune: Part Two?');
    expect(html).toContain('The rare blockbuster that earns its scale');
    expect(html).toContain('(our rating: 8.8/10)');
    expect(html).toContain('Stream on HBO Max and TNT');
    expect(html).toContain('rent on Amazon Video');
    expect(html).toContain('(checked on October 6, 2026)');
    // The answer is not the verdict copied verbatim.
    expect(html).not.toContain('See it on the biggest screen available.');
  });

  it('renders nothing at all for a review with no verdict', async () => {
    const noVerdict: PublicReview = { ...FULL_REVIEW, verdict: "" };
    expect(quickAnswers(noVerdict)).toEqual([]);
    const html = await render(QuickAnswer, { review: noVerdict });
    expect(html).not.toContain('quickanswer');
    expect(html).not.toContain('worth watching');
    expect(html.trim()).toBe('');
  });

  it('keeps the worth-watching answer and drops the watch answer when there is no watch data', () => {
    const noWatch: PublicReview = { ...FULL_REVIEW, providers: null, customWatch: null };
    const answers = quickAnswers(noWatch);
    expect(answers).toHaveLength(1);
    expect(answers[0]!.question).toBe('Is Dune: Part Two worth watching?');
    expect(watchSummary(noWatch)).toBeNull();
  });
});

describe('GET /llms.txt', () => {
  function call(url: string): Promise<Response> {
    return (GET as Function)({ url: new URL(url) }) as Promise<Response>;
  }

  it('serves 200 as text/plain', async () => {
    delete process.env.SITE_URL;
    const res = await call('https://extramovies.test/llms.txt');
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/plain');
  });

  it('carries the review URLs, the content-type patterns and the sitemap pointer', async () => {
    delete process.env.SITE_URL;
    const body = await (await call('https://extramovies.test/llms.txt')).text();

    expect(body).toContain('https://extramovies.test/reviews/dune-part-two');
    expect(body).toContain('https://extramovies.test/reviews/the-batman');
    expect(body).toContain('/reviews/<slug>');
    expect(body).toContain('/movies/<tmdbId>');
    expect(body).toContain('https://extramovies.test/reviews');
    expect(body).toMatch(
      /^Generated \d{4}-\d{2}-\d{2}\. Sitemap: https:\/\/extramovies\.test\/sitemap\.xml$/m,
    );
  });

  it('stays inside the line budget', async () => {
    delete process.env.SITE_URL;
    const body = await (await call('https://extramovies.test/llms.txt')).text();
    const lines = body.trimEnd().split('\n');
    expect(lines.length).toBeLessThanOrEqual(60);
    // Header, one summary line, generation line, three content types, then
    // at most twenty reviews.
    expect(lines.filter((l) => l.startsWith('- [')).length).toBeLessThanOrEqual(23);
  });

  it('is deterministic for a fixed store', async () => {
    delete process.env.SITE_URL;
    const first = await (await call('https://extramovies.test/llms.txt')).text();
    const second = await (await call('https://extramovies.test/llms.txt')).text();
    expect(second).toBe(first);
  });

  it('renders the same bytes for the same input', () => {
    const input = {
      siteName: 'Extramovies',
      summary: llmsSummary('Extramovies'),
      origin: 'https://extramovies.org',
      generatedAt: '2026-10-21',
      reviews: [
        {
          title: 'Dune: Part Two Earns Every Minute of Its Desert',
          url: 'https://extramovies.org/reviews/dune-part-two',
          verdict: 'The rare blockbuster that earns its scale.',
        },
      ],
    };
    const body = renderLlmsTxt(input);
    expect(body).toBe(renderLlmsTxt(input));
    expect(body).toBe(
      [
        '# Extramovies',
        '',
        '> Extramovies is an independent film-review magazine. Every published review carries our own rating, a one-line verdict, the runtime, the credits, and where to watch, with the date the availability was checked.',
        '',
        'Generated 2026-10-21. Sitemap: https://extramovies.org/sitemap.xml',
        '',
        '## Content types',
        '',
        '- [Review](https://extramovies.org/reviews/<slug>): one long-form review with our rating, our verdict, the runtime, the credits, and where to watch.',
        '- [Title hub](https://extramovies.org/movies/<tmdbId>): streaming options, full credits, and member reviews for one film.',
        '- [Review archive](https://extramovies.org/reviews): every published review, newest first.',
        '',
        '## Latest reviews',
        '',
        '- [Dune: Part Two Earns Every Minute of Its Desert](https://extramovies.org/reviews/dune-part-two): The rare blockbuster that earns its scale.',
        '',
      ].join('\n'),
    );
  });

  it('uses the request origin, never a hardcoded host', async () => {
    delete process.env.SITE_URL;
    const body = await (await call('https://brand-two.test/llms.txt')).text();
    expect(body).toContain('https://brand-two.test/reviews/dune-part-two');
    expect(body).not.toContain('extramovies.test');
  });
});
