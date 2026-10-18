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
- Weight roles (amended 2026-10-18) · Lato 400 = body, tile meta, bylines; Lato 700 = tile titles, buttons, kickers, bold link CTAs; Anton ships one weight — hierarchy comes from the scale, never from faux-bolding or italics.
- Face roles (amended 2026-10-18) · Anton reserved for the display family: h1–h3, `.display`, ghost numerals, poster-slot fallbacks at display sizes. Everything under `--text-lg` (tile titles ~0.85–0.95rem, controls, chips) is Lato 700 with `--tracking-display`, never tiny Anton. `--font-mono` (ui-monospace) = bylines/meta-strip uppercase only.
- Scale · `--text-xs: 0.75rem` · `--text-sm: 0.85rem` · `--text-base: 1.0625rem` · `--text-lg: clamp(1.1rem, 2vw, 1.35rem)` · `--text-xl: clamp(1.25rem, 2.6vw, 1.6rem)` · `--text-2xl: clamp(1.5rem, 3vw, 2.2rem)` · `--text-3xl: clamp(2rem, 4.5vw, 3rem)` · `--text-display: clamp(2rem, 4.5vw, 3.25rem)` · `--text-hero-long: clamp(1.75rem, 4vw, 2.5rem)` · `--text-mega: clamp(2.75rem, 7vw, 5rem)` (glamour/ghost only). tokens.css wins on any drift.
- Display tracking · `--tracking-display: -0.02em` on h1/h2/h3/`.display` (tightened from -0.015em).
- Leading rhythm · display `1.0` (`--leading-display`), body `1.65` (`--leading-body`), lede/dek `1.5` (`--leading-lede`).
- Hero size-by-length · titles over ~40 chars (or `.is-long` / `.display--long`) step down to `--text-hero-long`. Template sets `.is-long` when `title.length > 40`.
- Tabular numerals · `.tnum` + automatic on `.rating-mark`, `.rating-value`, `.index-meta`, `.showcase-year`: `font-variant-numeric: tabular-nums`.

## Spacing & rhythm (amended 2026-10-18 — cadence locked to tokens.css)
- Scale · `--space-1` .25rem · 2 .5 · 3 .75 · 4 1 · 5 1.25 · 6 1.5 · 8 2 · 10 2.5 · 12 3 · 16 4 · 24 6. Strict 4-pt grid with one deliberate exception: fixed-px touch-target heights (44px) sit above it.
- Ladder · intra-component gaps `--space-1/2` (tile title↔meta, dots) · component internals `--space-3/4` (rail heads, grid gaps) · block/section margins `--space-5/6` · stand-alone inset `--space-8+`.
- Page gutters · `.wrap` padding-inline `clamp(1rem, 4vw, 2rem)`; poster rails bleed outward `--gutter-rail: 3vw` (`.rail-bleed`, margin −3vw / padding +3vw) so snaps sit flush to viewport edge.
- Section cadence · `.section--sm/md/lg` → `--section-pad-sm/md/lg` (clamps 1.75–2.5 / 2.5–3.5 / 3–4.5rem). Never equal-everywhere: alternate `.band` / `.band--alt` and vary pad per section on both themes. Carousel `padding-block: sm…md`; covers lead at lg.
- Heading rhythm (locked) · h1 `space-8 0 space-4` · h2 `space-12 0 space-3` · h3 space-3 top. No extra margins on `.dek`/`.meta-strip` (they inherit single-gap rhythm).

## Macrostructure / Layout (amended 2026-10-06 — discovery rails + publication bands)
- Family · 08 Photographic (publication heroes + review title blocks) + 20 Ecosystem Index (discovery surfaces). Discovery = surfaces primary; publication = photographic editorial secondary. Both share theme/nav/footer/type.
- Content cap · `--measure-wide: 80rem` verified (`--content-max` aliases it). `--measure: 68ch` for prose. No change.
- Discovery rails · full-bleed via `.rail-bleed` (`margin-inline: calc(-1 * var(--gutter-rail))`, `--gutter-rail: 3vw`). Rail content stays inside `.wrap` rhythm; rail itself bleeds to viewport with 3vw gutters.
- Section rhythm variety · alternate `.band` (paper) / `.band--alt` (paper-2); vary padding per section (`.section--sm/md/lg` → `--section-pad-sm/md/lg`); never equal-everywhere. Publication journal uses same bands at editorial cadence (cover lg → grid md → shelf sm).
- Ranked rows · ghost numerals retained (global `.index-num`, Anton, ink-2, clamp 2.25–3.25rem). No card-ification.
- Mobile rails · `.rail-snap` (`overflow-x: auto`, `scroll-snap-type: x proximity`) + `.rail-snap--fade` edge-fade mask under 48rem. No horizontal page scroll (`overflow-x: clip` on html/body retained).

## Poster rails & carousels (amended 2026-10-18 — the "list of movies" spec)
- Poster rail · grid `auto-flow: column`, auto-columns `minmax(9rem, 11rem)` (featured 10–13rem, guide rails 8.5–12rem, top-ten 6.5–7.5rem), gap `--space-4`, snap `start`/`x proximity`, thin scrollbar; `.d-grid` counterpart = `auto-fill minmax(9rem, 1fr)`, gap `--space-4`.
- Tile anatomy · 2/3 poster, full-frame `contain` on `paper-2` bed (cropping reserved for backdrops), 1px `--color-line` border, `--radius-card`; title Lato 700 at `--text-sm` (line-height 1.35, display tracking); meta Lato 400 `--text-xs`, ink-2, digits tnum `space-2` gap. Hover = border/color shift only — never scale (see Notes).
- Ranked rows · ghost numerals (`.index-num`, `--text-3xl`, ink-2) on text-ranked rows only; never on poster rails.
- Featured per-slide carousel · 100% columns, snap `x mandatory`, slide min-height `min(68vh, 34rem)`, dual scrims (bottom 6–55% + left 8–60% paper fade), copy anchored bottom-left (label gold, title `--text-2xl` ≤20ch, verdict ≤68ch ink-2), prev/next = 44px icon pills (see Buttons), scrollbar hidden, `overscroll-behavior-x: contain`.
- Trending hero · slide min-height 78vh, 12px dot pagination, gold-filled active dot.
- Mobile · rails keep snap + 88% edge-fade mask; carousels keep full slides (no plain stacks); every interactive control ≥44px.

## Stream support (product rule, not just paint)
- Automatic · TMDB watch-providers per region → Stream / Rent / Buy / Free tiles with logos, timestamp, JustWatch attribution. Never invented; section hides when empty.
- Custom override · per-review editor links: Free sites (nofollow) + Paid watch (nofollow sponsored + commission note), badged "Added by the editor", rendered after auto tiles. Editor may suppress individual auto providers per review.
- Tabs · All / Stream / Free / Rent / Buy / Free sites / Paid watch — CSS-only, no JS.

## Buttons (amended 2026-10-18 — typology matches shipped control CSS)
- Fill (primary form action) · gold `--color-accent` fill, `--color-accent-ink` text · Lato 700 `--text-base` · min-height 44px (search submit 48px) · padding `space-3 space-5` (search submit `0 space-6`) · `--radius-input` (search submit `--radius-card`) · cursor pointer.
- Ghost chip · 1px `--color-line` border, `--radius-pill`, 44px min, `space-2 space-4` padding, Lato .95rem; hover = gold border+text; active/selected state = full gold fill (`genre-nav[aria-current]`, filter chips).
- Icon round · 44×44px `--radius-pill`, 1px `--color-line-strong`, paper bed, 1.4rem glyph (carousel prev/next); hover = gold border+glyph only.
- Text CTA · standalone gold Lato 700 link (carousel/footer CTAs, cover CTAs, "browse" links) — no fill from these; gold fill stays reserved for submit-type actions and selected states.
- Focus ring · 2px `--color-focus` outline, offset 3px, on every interactive element; `focus-visible` gets `transition: none`.
- Dots · 12px pills, rule border; current = gold fill. Size by role, not by developer mood: fill for submits, chips for filters, pills for navigation.

## Motion (amended 2026-10-18 — primitives, not vibes)
- Assets · zero animation libraries, zero JS animation — CSS transitions + native scroll only; `scroll-behavior: smooth` on html.
- Duration ladder · `--dur-fast` 180ms = color/border shifts on links, chips, buttons · `--dur-base` 240ms = scrim opacity, image opacity/border hovers · `--dur-slow` 320ms = hero title mask-reveal (`glam-mask-reveal`: clip-path + translateY `--space-4` + opacity, one-shot on load). All on `--ease-out`.
- Allowed mechanics, exhaustively · named-property transitions (opacity / color / background-color / border-color) · the single load mask-reveal on hero titles · scrim opacity 240ms on photo hovers (~0.55 max) · art-hover opacity dip to 0.86 + gold border · link color 180ms · native carousel snap. Nothing else moves.
- Never · hover-scale on tiles/buttons, opacity-dip press states, `transition: all`, autoplay, parallax, staggered reveals.
- Reduced motion · non-essential fades/masks `transition: none !important`; hero title fallback ≤150ms opacity crossfade; carousel drops to free scroll (`scroll-snap-type: none`); `html` smooth-scroll off; focus-visible never animates.

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
