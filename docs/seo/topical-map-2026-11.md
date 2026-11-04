# Topical Map: extramovies.org (November 2026)

Status: ACTIVE topical authority roadmap.
Methodology: Semantic SEO / Holistic SEO entity-attribute-value modeling.
Companion documents: `docs/seo/holisticseo-harness.md`, `docs/seo/traffic-diagnosis-2026-11-02.md`, `docs/seo/keywords-extramovies.csv`.

Two corpora are named separately in this document:

- **Published** — the 53 review URLs, 7 series hubs, and 34 taxonomy hubs in the live `https://extramovies.org/sitemap.xml` on 2026-11-05.
- **Draft** — seed reviews that exist in `seeds/extramovies/` but are not in the live sitemap yet. Drafts are marked and never presented as live URLs.

---

## 1. Source Context & Brand Identity

- **Publication entity:** Extramovies (`https://extramovies.org`)
- **Core perspective:** Independent, verdict-first cinematic criticism magazine.
- **Differentiator:** One editorial rating out of ten, argued from the film itself; no critic average passed off as our own; dated legal where-to-watch availability; TMDB entity grounding; member scores kept visibly separate from the editorial rating.
- **Topical boundary:** Feature films, prestige television, and documentary cinema. Out of scope: gossip, celebrity personal lives, piracy downloads, and box-office speculation without critical context.

---

## 2. Cluster Architecture: Core vs Outer Topics

```
[Extramovies Journal Root (/)]
  ├── 1. Genre & Mood Pillars (/category/*)
  │     ├── Action & Adventure
  │     ├── Thriller & Crime
  │     ├── Sci-Fi & Speculative Fiction
  │     ├── Drama & Human Interest
  │     ├── Comedy & Satire
  │     ├── Horror & Macabre
  │     ├── Animation & Family
  │     └── Romance
  ├── 2. Industry & Language Cinemas
  │     ├── Indian Cinema (Hindi, Telugu, Tamil, Kannada, Malayalam)
  │     ├── Filipino Television
  │     ├── Hollywood (Prestige Studio & Indie)
  │     └── International Cinema (Japanese Animation, European, Global Streaming)
  ├── 3. Auteur & Filmmaker Deep Dives (/director/*)
  │     ├── Denis Villeneuve (Sicario, Dune: Part Two)
  │     ├── Christopher Nolan (The Odyssey)
  │     ├── Anthony & Joe Russo (Avengers: Endgame)
  │     ├── S. S. Rajamouli (Magadheera — draft)
  │     └── Steven Spielberg, Aaron Sorkin, Michael Sarnoski
  ├── 4. Franchise & High-Intent Series Hubs (/series/*)
  │     ├── Marvel Cinematic Universe (Avengers: Endgame, Spider-Man, Deadpool)
  │     ├── DC (The Batman, Joker)
  │     ├── Prestige Spy & Cold War Thrillers (Slow Horses, The Americans, Homeland, The Night Manager, Jack Ryan, Condor, The Night Agent)
  │     ├── High-Octane Action Sagas (Mission: Impossible, Top Gun: Maverick, Sicario)
  │     └── Animation Studios (Toy Story / Pixar, Studio Ghibli)
  └── 5. Supporting Information & Explainer Intent
        ├── Ending Explained & Narrative Meaning
        ├── Legal Streaming & Availability Guides
        └── Thematic Curations & Comparisons
```

---

## 3. Published Corpus Mapping

The live sitemap on 2026-11-05 lists 53 review URLs, 7 series hubs, 14 category hubs, 19 cast hubs, and 1 director hub. Every published review below belongs to one cluster; the few one-review hubs are intentionally `noindex` until a second review lands.

### Cluster 1: Espionage, Tactical Thrillers & Geopolitics
- **Live hubs:** `/category/thriller`, `/category/crime`, `/category/action-adventure`
- **Live series hubs:** `/series/95480` (Slow Horses), `/series/46533` (The Americans), `/series/129552` (The Night Agent), `/series/61859` (The Night Manager), `/series/46976` (Hitler: The Rise of Evil)
- **Published reviews:**
  - `/reviews/sicario-2015-review` (Denis Villeneuve, Emily Blunt, Benicio del Toro)
  - `/reviews/the-bourne-identity-2002-review` (Doug Liman, Matt Damon)
  - `/reviews/mission-impossible-the-final-reckoning-2025-review` (Christopher McQuarrie, Tom Cruise)
  - `/reviews/the-night-agent-2023-review` (Shawn Ryan)
  - `/reviews/the-night-manager-2016-review` (David Farr)
  - `/reviews/the-americans-2013-review` (Joe Weisberg)
  - `/reviews/slow-horses-2022-review` (Mick Herron, Gary Oldman)
  - `/reviews/hitler-the-rise-of-evil-2003-review` (Christian Duguay)
  - `/reviews/masterplan-2026-review` (Thomas Vincent)
  - `/reviews/the-fix-2026-review` (Guy Moshe)
  - `/reviews/whalefall-2026-review` (Brian Duffield)
  - `/reviews/fall-2-deadpoint-2026-review` (Peter and Michael Spierig)
- **Contextual bridge:** Geopolitical realism, surveillance procedure, moral ambiguity of intelligence tradecraft, and the tension between field operatives and agency bureaucracy.

### Cluster 2: Asian Regional & Diaspora Cinema
- **Live hubs:** `/category/drama`, `/category/action`, `/category/comedy`, `/category/romance`, `/category/crime`
- **Live series hub:** `/series/66515` (Ang Probinsyano)
- **Published reviews:**
  - `/reviews/dhruva-2016-review` (Surender Reddy, Ram Charan)
  - `/reviews/gandhi-talks-2026-review` (Kishor Pandurang Belekar, Vijay Sethupathi)
  - `/reviews/jailer-2-2026-review` (Nelson Dilipkumar, Rajinikanth)
  - `/reviews/peddi-2026-review` (Buchi Babu Sana)
  - `/reviews/pati-patni-aur-woh-do-2026-review` (Mudassar Aziz)
  - `/reviews/a-nice-indian-boy-2025-review` (Roshan Sethi)
  - `/reviews/ang-probinsyano-2015-review` (Malu L. Sevilla, Avel E. Sunpongco, Toto Natividad)
  - `/reviews/masaan-2015-review` (Neeraj Ghaywan)
  - `/reviews/unfreedom-2015-review` (Raj Amit Kumar)
- **Draft reviews in this cluster:** `777-charlie-2022-review` (Kiranraj K.), `magadheera-2009-review` (S. S. Rajamouli), `premam-2015-review` (Alphonse Puthren), `the-lunchbox-2013-review` (Ritesh Batra).
- **Contextual bridge:** Cultural texture, regional narrative structures, box-office and critical reception in South Asian versus global markets, and ending analyses.

### Cluster 3: Sci-Fi, Speculative Worlds & Transhumanism
- **Live hubs:** `/category/science-fiction`, `/category/fantasy`, `/category/adventure`
- **Published reviews:**
  - `/reviews/dune-part-two` (Denis Villeneuve, Frank Herbert adaptation)
  - `/reviews/the-odyssey-2026-review` (Christopher Nolan)
  - `/reviews/disclosure-day-2026-review` (Steven Spielberg)
  - `/reviews/jupiter-ascending-2015-review` (Lana and Lilly Wachowski)
  - `/reviews/transcendence-2014-review` (Wally Pfister)
  - `/reviews/the-death-of-robin-hood-2026-review` (Michael Sarnoski)
- **Contextual bridge:** Technological anxiety, post-human morality, ecological ruin, and the scale of cinematic visualization.

### Cluster 4: Comic Book, Blockbuster & Action Comedy
- **Live hubs:** `/category/action`, `/category/action-adventure`, `/category/comedy`, `/category/adventure`
- **Published reviews:**
  - `/reviews/avengers-endgame-2019-review` (Anthony and Joe Russo)
  - `/reviews/deadpool-2016-review` (Tim Miller)
  - `/reviews/spider-man-brand-new-day-2026-review` (Destin Daniel Cretton)
  - `/reviews/the-batman` (Matt Reeves)
  - `/reviews/joker` (Todd Phillips)
  - `/reviews/top-gun-maverick-2022-review` (Joseph Kosinski)
  - `/reviews/coyote-vs-acme-2026-review` (Dave Green)
  - `/reviews/matchbox-the-movie-2026-review` (Sam Hargrave)
  - `/reviews/street-fighter-2026-review` (Kitao Sakurai)
  - `/reviews/mayday-2026-review` (Jonathan Goldstein, John Francis Daley)
  - `/reviews/runner-2026-review` (Scott Waugh)
- **Contextual bridge:** Craft of modern blockbuster choreography, meta-humor versus sincerity, and practical stunts versus CGI fatigue.

### Cluster 5: Horror, Psychological Dread & Folklore
- **Live hubs:** `/category/horror`, `/category/mystery`, `/category/thriller`
- **Published reviews:**
  - `/reviews/hope-2026-review` (Na Hong-jin)
  - `/reviews/resident-evil-2026-review` (Zach Cregger)
  - `/reviews/insidious-out-of-the-further-2026-review` (Jacob Chase)
  - `/reviews/other-mommy-2026-review` (Rob Savage)
  - `/reviews/buddy-2026-review` (Casper Kelly)
- **Draft reviews in this cluster:** `tumbbad-2018-review` (Rahi Anil Barve), `ratsasan-2018-review` (Ram Kumar).
- **Contextual bridge:** Psychological breakdown, atmospheric sound design, folklore monster archetypes, and jump scares versus slow-burn existential dread.

### Cluster 6: Animation, Family, Romance & Literary Adaptation
- **Live hubs:** `/category/animation`, `/category/family`, `/category/fantasy`, `/category/romance`, `/category/drama`
- **Live series hub:** `/series/43720` (Neverland)
- **Published reviews:**
  - `/reviews/toy-story-5-2026-review` (Andrew Stanton)
  - `/reviews/light-of-the-world-2025-review` (Tom Bancroft, John J. Schafer)
  - `/reviews/fire-and-ice-1983-review` (Ralph Bakshi)
  - `/reviews/sense-and-sensibility-2026-review` (Georgia Oakley)
  - `/reviews/practical-magic-2-2026-review` (Susanne Bier)
  - `/reviews/neverland-2011-review` (Nick Willing)
- **Draft review in this cluster:** `grave-of-the-fireflies-1988-review` (Isao Takahata).
- **Contextual bridge:** Handcrafted visual craft, enduring literary themes, grief, and historical memory.

### Cluster 7: Drama, Technology, Documentary & True Story
- **Live hubs:** `/category/drama`, `/category/thriller`; a documentary hub does not exist yet because only one published review carries that genre.
- **Published reviews:**
  - `/reviews/the-social-reckoning-2026-review` (Aaron Sorkin)
  - `/reviews/digger-2026-review` (Alejandro González Iñárritu)
  - `/reviews/animals-2026-review` (Ben Affleck)
  - `/reviews/you-can-see-everything-2026-review` (Nathan Fielder, Lance Oppenheim)
- **Draft reviews in this cluster:** `13-hours-the-secret-soldiers-of-benghazi-2016-review` (Michael Bay), `tenzing-2026-review` (Jennifer Peedom).
- **Contextual bridge:** Institutional power, labour and class, the documentary record, and the line between true story and dramatization.

### Series Hubs (Live)

The series page is `/series/<tmdbId>`; the editorial review is `/reviews/<slug>`. Both are in the sitemap, and both need to link to each other (see §6, gap 2).

| Series hub | Title | Review |
|---|---|---|
| `/series/95480` | Slow Horses | `/reviews/slow-horses-2022-review` |
| `/series/46533` | The Americans | `/reviews/the-americans-2013-review` |
| `/series/129552` | The Night Agent | `/reviews/the-night-agent-2023-review` |
| `/series/61859` | The Night Manager | `/reviews/the-night-manager-2016-review` |
| `/series/66515` | Ang Probinsyano | `/reviews/ang-probinsyano-2015-review` |
| `/series/46976` | Hitler: The Rise of Evil | `/reviews/hitler-the-rise-of-evil-2003-review` |
| `/series/43720` | Neverland | `/reviews/neverland-2011-review` |

### Draft Corpus (12)

These seeds exist but are not in the live sitemap. Publishing them is an owner action; the map assigns each one a cluster now so the internal links can be added on publication.

| Draft review | Cluster | Director / creator |
|---|---|---|
| `777-charlie-2022-review` | Asian Regional | Kiranraj K. |
| `13-hours-the-secret-soldiers-of-benghazi-2016-review` | Espionage / Tactical | Michael Bay |
| `condor-2018-review` | Espionage / Series | Jason Smilovic, Todd Katzberg, Ken Robinson |
| `grave-of-the-fireflies-1988-review` | Animation / Family | Isao Takahata |
| `homeland-2011-review` | Espionage / Series | Alex Gansa, Howard Gordon |
| `jack-ryan-2018-review` | Espionage / Series | Graham Roland, Carlton Cuse |
| `magadheera-2009-review` | Asian Regional | S. S. Rajamouli |
| `premam-2015-review` | Asian Regional | Alphonse Puthren |
| `ratsasan-2018-review` | Horror / Thriller | Ram Kumar |
| `tenzing-2026-review` | Drama / True Story | Jennifer Peedom |
| `the-lunchbox-2013-review` | Asian Regional / Romance | Ritesh Batra |
| `tumbbad-2018-review` | Horror / Folklore | Rahi Anil Barve |

---

## 4. Supporting Content Types (Intent Architecture)

1. **Ending Explained & Narrative Deconstruction** (informational, post-watch).
   - The `777-charlie-2022-review` draft already targets this intent in its title and body. Treat the pattern as a draft capability, not a live section on every review.
   - Target queries: `"{film} ending explained"`, `"{film} ending meaning"`.

2. **Where to Watch Legal Streaming Guides** (transactional, pre-watch).
   - Review pages render the dated provider block at `#watch-<slug>`.
   - Film hubs render it at `/movies/<tmdbId>#watch-movie-<tmdbId>`.
   - The block names legal services and the date availability was checked; it never links to piracy.
   - Target queries: `"where to watch {film}"`, `"is {film} streaming on netflix"`.

3. **Critical Comparisons & Film Versus Film** (evaluation).
   - Planned, not yet a live page type. Interlink thematic twins inside review bodies first (for example, *Sicario* and *The Bourne Identity*; *Slow Horses* and *The Night Manager*).
   - Target queries: `"{film} vs {film2} which is better"`.

4. **Curated Editorial Hubs & Best-Of Lists** (navigational curation).
   - Category archives (`/category/<slug>`) are live and review-driven.
   - The author profile (`/author/the-editor`) is live and carries `authorProfileJsonLd`.
   - The editorial policy (`/editorial-policy`) is live and linked from the footer and About page.

---

## 5. Contextual Bridges & Internal Linking Matrix

| From page | To target page | Anchor / context | Status |
|---|---|---|---|
| Review page | `/category/<genre>` | "In our [Action film reviews](/category/action)..." | Live: genre rows in the review's Movie info |
| Review page | `/director/<slug>` | "Directed by [Denis Villeneuve](/director/denis-villeneuve)..." | Live: director row |
| Review page | `/cast/<slug>` | "Starring [Emily Blunt](/cast/emily-blunt)..." | Live: cast row |
| Review page | Related review | "Readers looking for tactical intelligence realism should see [The Bourne Identity review](/reviews/the-bourne-identity-2002-review)..." | Live: RelatedReviews |
| Category hub | Canonical review | Title + rating + year link directly to `/reviews/<slug>` | Live: `TaxonomyReviewItem` |
| Author page | Published review | Chronological list of signed criticism | Live: `/author/the-editor` |
| Site chrome | `/editorial-policy` | "Editorial policy" in the footer and About page | Live |
| Homepage | Canonical review | Review shelf and hero CTA point at `/reviews/<slug>` | Live: `reviewHref` |
| `/reviews` archive | Canonical review | Every tile points at `/reviews/<slug>` | Live |
| Film hub | Canonical review | "Read the full review" | Live on `/movies/<tmdbId>` |
| Series hub | Canonical review | Series page should surface its review | **Gap** |
| Review page | Series hub | Series review should link to `/series/<tmdbId>` | **Gap** |
| Taxonomy hub | Sibling taxonomy hub | Shared-film cross-links (cast ↔ director ↔ category) | **Gap** |

---

## 6. Review Cadence & Gap Analysis

**Live counts (2026-11-05 sitemap):** 53 reviews, 7 series hubs, 14 category hubs, 19 cast hubs, 1 director hub, 5 static pages (home, reviews, about, contact, upcoming) plus `/movies` and `/series` indexes. Google had indexed roughly 7 of 101 URLs at the 2026-11-01 audit.

**Immediate priorities:**

1. **Publish the 12 drafts** (owner action in `/admin`), starting with `tenzing-2026-review`. The map already assigns each draft a cluster; publishing turns a draft row into a live URL and a new internal-link target.
2. **Close the series link gap.** `/series/<tmdbId>` currently says "No review yet" even when a review exists, and the review does not link back. Add a "Read the review" link on the series hub and a "Series guide" link on the review when `mediaType` is `tv`.
3. **Add sibling taxonomy links.** Cast, director, and category pages list reviews but do not cross-link on shared films. One contextual link per shared credit is enough; no link farm.
4. **Build second reviews for one-review hubs.** `TAXONOMY_MIN_INDEXABLE = 2` is correct. Do not index a cast or director page with one review; give it a second credit first.
5. **Keep the author entity honest.** `/author/the-editor` is a desk byline, not a named human. A named critic, real `sameAs` profiles, and any AI-assistance disclosure remain owner decisions.
6. **Request indexing manually.** The CDP route was refused server-side five times; the remaining channel is the owner's manual Request Indexing clicks (about 10/day) plus the sitemap. Do not re-run the CDP harness without a fresh instruction.

**Deliberately deferred:**

- **Local SEO:** no Google Business Profile, no NAP, no service area; the publication is global.
- **Programmatic SEO:** do not scale template pages until at least half of the current 101 URLs are indexed.
- **Backlink rescue:** pending a Semrush referring-domain export; the legacy archive recovery is a redirect map, not a content plan.
