import { describe, expect, it } from 'vitest';
import { renderMarkdown } from '../src/lib/markdown';
import { renderMarkdown as renderAdminPreview } from '../src/components/admin/markdown';
import { DEFAULT_SPOILER_SUMMARY, resolveSpoilerSummary } from '../src/lib/spoiler';

// Spoiler gate — `::: spoiler` blocks in the public renderer
// (src/lib/markdown.ts) and in the admin live preview
// (src/components/admin/markdown.ts).

describe('spoiler gate (public renderer)', () => {
  it('renders a ::: spoiler block as a details/summary gate', () => {
    const html = renderMarkdown(
      [
        '::: spoiler',
        '## Spoiler warning: the ending of Masaan',
        'Everything below describes the final act.',
        ':::',
      ].join('\n'),
    );
    expect(html).toContain('<details>');
    expect(html).toContain('<summary>Spoiler warning: the ending of Masaan</summary>');
    expect(html).toContain('Everything below describes the final act.');
    // the gated passage lives inside the details element
    const details = html.slice(html.indexOf('<details>'), html.indexOf('</details>'));
    expect(details).toContain('Everything below describes the final act.');
    expect(html.indexOf('</details>')).toBeGreaterThan(html.indexOf('Everything below'));
  });

  it('long form takes the summary from the first heading and drops it from the body', () => {
    const html = renderMarkdown(
      [
        '::: spoiler',
        '## Spoiler warning: the ending of Masaan',
        '',
        'Piyush does not survive the night.',
        ':::',
      ].join('\n'),
    );
    expect(html).toContain('<summary>Spoiler warning: the ending of Masaan</summary>');
    // the heading is the summary, not repeated in the body
    expect(html).not.toContain('<h2>Spoiler warning: the ending of Masaan</h2>');
    expect(html.match(/Spoiler warning: the ending of Masaan/g)).toHaveLength(1);
  });

  it('shorthand form uses the text after spoiler as the summary', () => {
    const html = renderMarkdown(
      ['::: spoiler The ending of Masaan', 'Everything below describes the final act.', ':::'].join('\n'),
    );
    expect(html).toContain('<details>');
    expect(html).toContain('<summary>The ending of Masaan</summary>');
    expect(html).toContain('Everything below describes the final act.');
  });

  it('raw HTML inside the block is still escaped', () => {
    const html = renderMarkdown(
      [
        '::: spoiler',
        '## Gate',
        '<script>alert(1)</script>',
        '<img src=x onerror="alert(2)">',
        ':::',
      ].join('\n'),
    );
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('onerror="alert(2)"');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('&lt;img src=x');
  });

  it('an unclosed fence degrades to literal text and the rest still renders', () => {
    const html = renderMarkdown(
      [
        'Before the block.',
        '',
        '::: spoiler',
        '## Spoiler warning',
        'Everything below describes the final act.',
        '',
        'After the block.',
      ].join('\n'),
    );
    expect(html).not.toContain('<details>');
    expect(html).toContain('::: spoiler');
    // the document is not swallowed: the text after the fence still renders
    expect(html).toContain('Before the block.');
    expect(html).toContain('Everything below describes the final act.');
    expect(html).toContain('After the block.');
    expect(html).toContain('<h2>Spoiler warning</h2>');
  });

  it('a stray ::: with no open block is literal text', () => {
    const html = renderMarkdown(['Before.', '', ':::', '', 'After.'].join('\n'));
    expect(html).not.toContain('<details>');
    expect(html).toContain('<p>:::</p>');
    expect(html).toContain('Before.');
    expect(html).toContain('After.');
  });

  it('a nested ::: spoiler inside an open block is literal text (one level only)', () => {
    const html = renderMarkdown(
      [
        '::: spoiler',
        '## Outer gate',
        '::: spoiler',
        'Inner text.',
        ':::',
      ].join('\n'),
    );
    expect(html).toContain('<summary>Outer gate</summary>');
    // exactly one gate
    expect(html.match(/<details>/g)).toHaveLength(1);
    // the nested opener is literal text inside the body
    expect(html).toContain('::: spoiler');
    expect(html).toContain('Inner text.');
  });

  it('keeps lists, quotes, links, headings and emphasis inside the gate', () => {
    const html = renderMarkdown(
      [
        '::: spoiler',
        '## Gate',
        '',
        'A [link](/movies/336203) and **bold** text.',
        '',
        '- one',
        '- two',
        '',
        '> A quoted line.',
        '',
        '### Subheading',
        ':::',
      ].join('\n'),
    );
    const details = html.slice(html.indexOf('<details>'), html.indexOf('</details>'));
    expect(details).toContain('<a href="/movies/336203">link</a>');
    expect(details).toContain('<strong>bold</strong>');
    expect(details).toContain('<ul><li>one</li><li>two</li></ul>');
    expect(details).toContain('<blockquote><p>A quoted line.</p></blockquote>');
    expect(details).toContain('<h3>Subheading</h3>');
  });

  it('a gate before other content does not swallow the following sections', () => {
    const html = renderMarkdown(
      [
        '::: spoiler The ending',
        'Gated text.',
        ':::',
        '',
        '## Where to watch Masaan',
        '',
        'It streams on Amazon Prime Video.',
      ].join('\n'),
    );
    expect(html).toContain('<details>');
    expect(html).toContain('</details>');
    expect(html).toContain('<h2>Where to watch Masaan</h2>');
    expect(html).toContain('It streams on Amazon Prime Video.');
    expect(html.indexOf('</details>')).toBeLessThan(html.indexOf('<h2>Where to watch Masaan</h2>'));
  });
});

describe('spoiler gate (existing rendering unchanged)', () => {
  it('renders headings, paragraphs, emphasis, links, quotes and lists as before', () => {
    const html = renderMarkdown(
      [
        '## What works',
        '',
        'A paragraph with **bold**, *italic* and `code`.',
        '',
        '- one',
        '- two',
        '',
        '1. first',
        '2. second',
        '',
        '> A quote.',
        '',
        '---',
        '',
        'A [safe link](https://example.com/x) and an [unsafe one](javascript:alert(1)).',
      ].join('\n'),
    );
    expect(html).toContain('<h2>What works</h2>');
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('<em>italic</em>');
    expect(html).toContain('<code>code</code>');
    expect(html).toContain('<ul><li>one</li><li>two</li></ul>');
    expect(html).toContain('<ol><li>first</li><li>second</li></ol>');
    expect(html).toContain('<blockquote><p>A quote.</p></blockquote>');
    expect(html).toContain('<hr />');
    expect(html).toContain('<a href="https://example.com/x">safe link</a>');
    expect(html).not.toContain('javascript:');
  });

  it('escapes raw HTML outside a gate too', () => {
    const html = renderMarkdown('# Hi\n<script>alert(1)</script>\n**bold**');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('<strong>bold</strong>');
  });
});

describe('spoiler gate (shared syntax helper)', () => {
  it('resolveSpoilerSummary prefers the fence hint, then the first heading', () => {
    const withHint = resolveSpoilerSummary("The ending", ['## Inside heading', 'text']);
    expect(withHint.summary).toBe('The ending');
    expect(withHint.body).toEqual(['## Inside heading', 'text']);

    const withHeading = resolveSpoilerSummary('', ['intro', '## Inside heading', 'text']);
    expect(withHeading.summary).toBe('Inside heading');
    expect(withHeading.body).toEqual(['intro', 'text']);
  });

  it('resolveSpoilerSummary falls back to a default summary', () => {
    const none = resolveSpoilerSummary('', ['just text']);
    expect(none.summary).toBe(DEFAULT_SPOILER_SUMMARY);
    expect(none.body).toEqual(['just text']);
  });
});

describe('spoiler gate (admin live preview)', () => {
  it('previews the same gate as the public site', () => {
    const md = [
      '::: spoiler',
      '## Spoiler warning: the ending of Masaan',
      'Everything below describes the final act.',
      ':::',
    ].join('\n');
    const preview = renderAdminPreview(md);
    expect(preview).toContain('<details>');
    expect(preview).toContain('<summary>Spoiler warning: the ending of Masaan</summary>');
    expect(preview).toContain('Everything below describes the final act.');
    expect(preview).not.toContain('<h2>Spoiler warning: the ending of Masaan</h2>');
  });

  it('previews the shorthand form and escapes raw HTML', () => {
    const preview = renderAdminPreview('::: spoiler The ending\n<script>alert(1)</script>\n:::');
    expect(preview).toContain('<summary>The ending</summary>');
    expect(preview).not.toContain('<script>');
  });

  it('degrades an unclosed fence to literal text in the preview too', () => {
    const preview = renderAdminPreview('::: spoiler\nGated text.');
    expect(preview).not.toContain('<details>');
    expect(preview).toContain('::: spoiler');
    expect(preview).toContain('Gated text.');
  });
});
