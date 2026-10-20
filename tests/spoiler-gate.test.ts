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

  it('a malformed block (a second ## heading inside) renders literally with no gate', () => {
    const html = renderMarkdown(
      [
        '::: spoiler',
        '## Spoiler warning: the ending of Masaan',
        '',
        'Piyush does not survive the night.',
        '',
        '## Where to watch Masaan',
        '',
        'It streams on Amazon Prime Video.',
        ':::',
      ].join('\n'),
    );
    // a gate may never span two sections: nothing is hidden
    expect(html).not.toContain('<details>');
    expect(html).not.toContain('<summary>');
    // every line is visible
    expect(html).toContain('Piyush does not survive the night.');
    expect(html).toContain('<h2>Where to watch Masaan</h2>');
    expect(html).toContain('It streams on Amazon Prime Video.');
    // the fence lines stay literal text
    expect(html).toContain('<p>::: spoiler</p>');
    expect(html).toContain('<p>:::</p>');
  });

  it('a malformed block in the shorthand form also renders literally', () => {
    const html = renderMarkdown(
      ['::: spoiler The ending', 'Gated text.', '', '## Where to watch', ':::'].join('\n'),
    );
    expect(html).not.toContain('<details>');
    expect(html).toContain('Gated text.');
    expect(html).toContain('<h2>Where to watch</h2>');
  });

  it('a ::: inside a code fence does not close the gate', () => {
    const html = renderMarkdown(
      [
        '::: spoiler',
        '## Gate',
        '',
        '```text',
        ':::',
        '```',
        '',
        'The ending stays inside the gate.',
        ':::',
      ].join('\n'),
    );
    expect(html).toContain('<details>');
    expect(html).toContain('<summary>Gate</summary>');
    const details = html.slice(html.indexOf('<details>'), html.indexOf('</details>'));
    expect(details).toContain('The ending stays inside the gate.');
    // the closing fence is the last one, not the ::: inside the code fence
    expect(html.indexOf('</details>')).toBeGreaterThan(
      html.indexOf('The ending stays inside the gate.'),
    );
  });

  it('a ### or quoted heading is not a summary source and falls back to "Spoilers"', () => {
    const h3 = renderMarkdown(
      ['::: spoiler', '### Subheading', 'The ending.', ':::'].join('\n'),
    );
    expect(h3).toContain('<summary>Spoilers</summary>');
    expect(h3).toContain('<h3>Subheading</h3>');

    const quoted = renderMarkdown(
      ['::: spoiler', '> ## Quoted heading', 'The ending.', ':::'].join('\n'),
    );
    expect(quoted).toContain('<summary>Spoilers</summary>');
    expect(quoted).toContain('Quoted heading');

    const indented = renderMarkdown(
      ['::: spoiler', '  ## Indented heading', 'The ending.', ':::'].join('\n'),
    );
    expect(indented).toContain('<summary>Spoilers</summary>');
  });

  it('a blank first line inside the block still finds the summary heading', () => {
    const html = renderMarkdown(
      ['::: spoiler', '', '## Spoiler warning: the ending of Masaan', 'The ending.', ':::'].join('\n'),
    );
    expect(html).toContain('<summary>Spoiler warning: the ending of Masaan</summary>');
    expect(html).not.toContain('<h2>Spoiler warning: the ending of Masaan</h2>');
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

describe('spoiler gate (public renderer and admin preview agree)', () => {
  // The two renderers share the gate logic through src/lib/spoiler.ts, so
  // the preview can never drift from the published page. The fixture sticks
  // to the constructs both renderers mark up identically (paragraphs,
  // `##`/`###` headings, **bold**, *italic*): the renderers differ by
  // design on lists, blockquotes, images and `#` headings.
  const gate = [
    '::: spoiler',
    '## Spoiler warning: the ending of Masaan',
    '',
    '**Spoilers:** Everything below gives away the ending.',
    '',
    '*Piyush* does not survive the night.',
    '',
    '### The last scene',
    '',
    'Then they get on a boat together.',
    ':::',
  ].join('\n');

  it('produces the SAME output for the same input', () => {
    const preview = renderAdminPreview(gate);
    const publicPage = renderMarkdown(gate);
    expect(preview).toBe(publicPage);
    expect(preview).toContain('<details><summary>Spoiler warning: the ending of Masaan</summary>');
    expect(preview).toContain('<p><strong>Spoilers:</strong> Everything below gives away the ending.</p>');
  });

  it('agrees on a malformed block (no gate on either side)', () => {
    const malformed = [
      '::: spoiler',
      '## Spoiler warning: the ending of Masaan',
      '',
      'Piyush does not survive the night.',
      '',
      '## Where to watch Masaan',
      ':::',
    ].join('\n');
    const preview = renderAdminPreview(malformed);
    expect(preview).toBe(renderMarkdown(malformed));
    expect(preview).not.toContain('<details>');
    expect(preview).toContain('Piyush does not survive the night.');
  });

  it('agrees on an unclosed fence (fail soft on either side)', () => {
    const unclosed = '::: spoiler\nThe ending.';
    const preview = renderAdminPreview(unclosed);
    expect(preview).toBe(renderMarkdown(unclosed));
    expect(preview).not.toContain('<details>');
    expect(preview).toContain('The ending.');
  });
});
