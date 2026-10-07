# Design — Movie Review CMS

Locked design system. Future Hallmark runs read this file first; pages defer
to it. Amend intentionally — the file is the rule.

/* Hallmark · macrostructure: Photographic hero + catalogue rails · theme: studied-DNA (source: url) · studied: yes */

## System
- Genre · editorial
- Macrostructure · 08 Photographic (publication heroes: image dominates, text as overlay/annotation, asymmetric overlaps) + 20 Ecosystem Index (discovery: featured/latest/genre/people surfaces) — amended 2026-10-06 for the glamour pass; catalogue rails retired as a descriptor
- Theme · studied-DNA (source: https://www.justwatch.com/) · paper #060d17 · accent #fbc500 gold
- Axes · dark / heavy-condensed-sans / yellow
- Nav · N1-fixed utility bar (logo left, dominant search, muted links + bold active, sign-in right)
- Footer · Ft-standard index (link columns + fine print)
- Magazine preset · stays editorial (cover + grid, no showcase DNA) — see Variants

## Provenance
- Source mode · url — https://www.justwatch.com/ (homepage + /us/movie/dune-part-two-2023 title page)
- Date · 2026-10-05. Attestation · (b) public reference for own brand.
- Confidence · Tokens exact (source CSS custom props + preloaded fonts). Fonts exact (anton-regular.woff2, lato-400/700/900.woff2). Rhythm unknown — HTML can't judge density.

## Tokens (canonical · `src/styles/tokens.css` is the source of truth)
```css
:root {
  --color-paper:      #060d17;   /* near-black navy */
  --color-paper-2:    #141d29;   /* raised surface */
  --color-ink:        #eaebee;   /* warm-white headings */
  --color-ink-2:      #999c9f;   /* muted labels/links */
  --color-rule:       #1c252f;
  --color-accent:     #fbc500;   /* gold, ≤5% footprint */
  --color-accent-ink: #060d17;
  --color-focus:      #fbc500;

  --font-display: "Anton", "Arial Narrow", sans-serif;   /* heavy condensed */
  --font-body:    "Lato", system-ui, sans-serif;
  --font-mono:    ui-monospace, monospace;

  /* 4-pt spacing scale, named: --space-1 … --space-24. See tokens.css. */
  /* Verified complete 2026-10-06: --space-10 (2.5rem) added; all steps multiples of 0.25rem. */

  /* Type scale (text-xs → display) + rhythm — see Typography below. */
  /* --text-xs … --text-display, --text-hero-long, --leading-display/body/lede, --tracking-display. */

  /* Layout — --measure-wide 80rem verified; --gutter-rail 3vw; --section-pad-sm/md/lg. */

  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
  --dur-fast: 180ms;  --dur-base: 240ms;  --dur-slow: 320ms;

  --radius-card: 8px;  --radius-pill: 999px;  --radius-input: 4px;
}
```

## Typography (amended 2026-10-06 — DNA kept, layout/fonts improved)
- Faces · Anton display + Lato body unchanged (studied-DNA). Roman display only, no italic headers.
- Scale · `--text-xs: 0.75rem` · `--text-sm: 0.85rem` · `--text-base: 1.0625rem` · `--text-lg: clamp(1.1rem, 2vw, 1.35rem)` · `--text-xl: clamp(1.25rem, 2.6vw, 1.6rem)` · `--text-2xl: clamp(1.5rem, 3vw, 2.2rem)` · `--text-3xl: clamp(2rem, 4.5vw, 3rem)` · `--text-display: clamp(2.4rem, 6vw, 4.5rem)` · `--text-hero-long: clamp(1.9rem, 4.5vw, 3rem)`.
- Display tracking · `--tracking-display: -0.02em` on h1/h2/h3/`.display` (tightened from -0.015em).
- Leading rhythm · display `1.0` (`--leading-display`), body `1.65` (`--leading-body`), lede/dek `1.5` (`--leading-lede`).
- Hero size-by-length · titles over ~40 chars (or `.is-long` / `.display--long`) step down to `--text-hero-long`. Template sets `.is-long` when `title.length > 40`.
- Tabular numerals · `.tnum` + automatic on `.rating-mark`, `.rating-value`, `.index-meta`, `.showcase-year`: `font-variant-numeric: tabular-nums`.

## Macrostructure / Layout (amended 2026-10-06 — discovery rails + publication bands)
- Family · 08 Photographic (publication heroes + review title blocks) + 20 Ecosystem Index (discovery surfaces). Discovery = surfaces primary; publication = photographic editorial secondary. Both share theme/nav/footer/type.
- Content cap · `--measure-wide: 80rem` verified (`--content-max` aliases it). `--measure: 68ch` for prose. No change.
- Discovery rails · full-bleed via `.rail-bleed` (`margin-inline: calc(-1 * var(--gutter-rail))`, `--gutter-rail: 3vw`). Rail content stays inside `.wrap` rhythm; rail itself bleeds to viewport with 3vw gutters.
- Section rhythm variety · alternate `.band` (paper) / `.band--alt` (paper-2); vary padding per section (`.section--sm/md/lg` → `--section-pad-sm/md/lg`); never equal-everywhere. Publication journal uses same bands at editorial cadence (cover lg → grid md → shelf sm).
- Ranked rows · ghost numerals retained (global `.index-num`, Anton, ink-2, clamp 2.25–3.25rem). No card-ification.
- Mobile rails · `.rail-snap` (`overflow-x: auto`, `scroll-snap-type: x proximity`) + `.rail-snap--fade` edge-fade mask under 48rem. No horizontal page scroll (`overflow-x: clip` on html/body retained).

## Stream support (product rule, not just paint)
- Automatic · TMDB watch-providers per region → Stream / Rent / Buy / Free tiles with logos, timestamp, JustWatch attribution. Never invented; section hides when empty.
- Custom override · per-review editor links: Free sites (nofollow) + Paid watch (nofollow sponsored + commission note), badged "Added by the editor", rendered after auto tiles. Editor may suppress individual auto providers per review.
- Tabs · All / Stream / Free / Rent / Buy / Free sites / Paid watch — CSS-only, no JS.

## CTA voice
- Primary · gold fill (#fbc500 on #060d17) · radius-card · 48px min-height
- Secondary · ghost (white 8–16% overlay) · same radius

## Motion stance
- motion-cut · no library; CSS transitions ≤300ms ease-out only.
- Reduced-motion fallback · ≤150 ms opacity crossfade.

## Variants
- Magazine preset (`reel-magazine`) · editorial system, journal rhythm (cover + grid). Showcase/buybox DNA does not apply.
- Glamour pass (2026-10-06) · publication adds manifesto voice to verdict moments (giant verdict-led type), split-diptych latest entries, outlined ghost numerals (`--text-mega`, -webkit-text-stroke ink-3), photographic scrims only. Motion: single load mask-reveal on hero title + hover scrim/color shifts; reduced-motion kills all. Mobile keeps overlaps (poster-top, art bands), never plain stacks.
- Calm pass (2026-10-06) · muted accent (low-chroma amber; gold reserved for kicker bars, active states, primary buttons, focus rings — ratings/tiles render in ink). Posters always full-frame 2:3 contain; cropping reserved for backdrops. Watch groups in plain language (Watch free / Stream / Rent / Buy / Free sites); manual paid links merge into Buy with per-row "Editor's pick". Hero carries poster + title + year + rating + verdict only; credits live in details. Magazine uses band rhythm at editorial cadence (cover lg → grid md → shelf sm); ghost numerals do not apply to magazine cards.
- Nav · N1 masthead is sticky top-0 on paper with z-nav; skip-link sits above on z-skip with scroll-margin for anchors. Magazine preset unaffected. N1 kept — no nav archetype change in this amendment.
- Footer · Ft statement footer kept — no change in this amendment.
- Discovery rails note · `SITE_THEME=discovery` rails are full-bleed with 3vw gutters (`.rail-bleed`); snap + edge-fade on mobile (`.rail-snap` / `.rail-snap--fade`).
- Themes (deploy-time `SITE_THEME`, no switcher — shared backend, independent frontends)
  - Discovery (`SITE_THEME=discovery`) · showcase + buybox + rails as primary. Streaming-first discovery surface; editorial journal is secondary.
  - Publication (`SITE_THEME=publication` or unset = default) · editorial journal / magazine with streaming secondary. Journal home, magazine preset layout (`reel-magazine` cover + grid), reviews archive/search, review pages with showcase + buybox (streaming secondary). Current behavior is publication; nothing about the publication experience changes when theme is publication or unset. Do not restyle.
- Publication refinement (2026-10-06) · review page order is hero → rating → watch → article; the watchbox is unified watchbox without tabs (auto tiles + editor links in one box, timestamp + attribution shown, section hides when empty); voice is MyRating (author's own 0–10 score, never an aggregate); author identity rule is configured `seo.author` wins via displayAuthor, legacy 'Staff Review'/empty falls back to 'The Editor'.

## Notes (do NOT carry over)
- `transition: all` (source uses it twice) — always transition named properties.
- Opacity-dip press states on posters.
- Hover-scale on tiles/buttons.

## Exports
`tokens.css` (in this project) is the source of truth. For Tailwind v4
`@theme`, DTCG `tokens.json`, or shadcn/ui CSS variables, ask *"extend
design.md with Tailwind exports"* (or the format you want).
