# Responsive matrix audit — brief (discovery + publication)

## Target (per agent — see dispatch prompt for YOUR server + theme)
- Widths: 1440, 1024, 768, 400. Set once per width via emulate
  (`"1440x900"` etc. — emulation persists across navigates in the same page).
- Pages: `/`, `/reviews`, `/movies`, `/movies/693134`,
  `/reviews/dune-part-two`, `/search`, `/search?q=dune`, `/login`,
  `/signup`, `/u/rakib`.
- `take_snapshot` requires a numeric pageId — call `list_pages` first.

## Per page × width — run this exact audit script
```js
() => {
  const W = window.innerWidth;
  const out = { url: location.pathname + location.search, w: W,
    overflow: document.documentElement.scrollWidth > W,
    sw: document.documentElement.scrollWidth,
    theme: document.querySelector('.d-hero-slider,.d-guide-hero,.d-guide-section') ? 'discovery'
      : (document.querySelector('.glam-latest,.pub-hero,.pub-shelf,.glam-archive-head') ? 'publication' : 'unknown') };
  const els = [...document.querySelectorAll('main p, main h1, main h2, main h3, main h4, main li, main blockquote')];
  const bad = [];
  for (const el of els.slice(0, 500)) {
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.right < 0 || r.left > W) continue;
    const cs = getComputedStyle(el);
    if ((r.left < 8 && parseFloat(cs.paddingLeft) < 8) ||
        (W - r.right < 8 && parseFloat(cs.paddingRight) < 8)) {
      let p = el, path = el.tagName;
      for (let i = 0; i < 3 && p.parentElement; i++) { p = p.parentElement; path = p.tagName + '.' + String(p.className||'').split(' ')[0].slice(0,24) + ' > ' + path; }
      bad.push({ path: path.slice(0,110), left: Math.round(r.left),
        right: Math.round(W - r.right), text: (el.innerText||'').slice(0,45) });
      if (bad.length >= 8) break;
    }
  }
  out.edgeTouch = bad;
  out.sections = [...document.querySelectorAll('main section')].slice(0,14).map(s => {
    const cs = getComputedStyle(s);
    return { cls: String(s.className||'').slice(0,44),
      pad: cs.paddingTop + ' ' + cs.paddingRight + ' ' + cs.paddingBottom + ' ' + cs.paddingLeft,
      bg: cs.backgroundColor };
  });
  return out;
}
```

## Rules
- FAIL = overflow true, OR edgeTouch non-empty (text touching viewport/panel
  edge), OR sections with visibly inconsistent rhythm vs siblings (note exact
  values). Carousel off-screen slides are already excluded by the script.
- If a page renders the WRONG theme (theme field), note it and keep auditing.
- `list_console_messages` (error+warn) per page — record new errors only.
- Screenshots at 400 only: `/`, `/reviews`, `/movies` →
  `.superpowers/sdd/matrix-<theme>-400-<page>.png` (theme = dis|pub).
- Do NOT edit files. Do NOT restart servers. Read-only + screenshots.

## Report
Write `.superpowers/sdd/matrix-<theme>-report.md` (full table) and report back
under 25 lines: per-page verdicts (PASS/FAIL + width), every violation with
selector path + computed values, console errors, wrong-theme notes.
