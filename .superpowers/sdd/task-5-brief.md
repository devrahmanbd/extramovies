## Task 5 — Full verification (evidence required)

1. **Unit + build**
   ```bash
   npm test        # baseline 183 + 5 new = 188+ green
   npm run build   # green
   ```

2. **Visual QA (chrome-devtools MCP)** — start server first:
   ```bash
   pkill -f "astro dev"; set -a; source .env; export SITE_THEME=discovery
   npm run dev -- --port 4321 --host 127.0.0.1 > /tmp/astro-dev.log &
   ```
   - `http://127.0.0.1:4321/` — Dune tile(s) show **both** pills; Batman/Joker
     tiles show **Reviewed** only; no badges on unreviewed titles.
   - `http://127.0.0.1:4321/movies/693134` — heading reads **From The
     Platform**; Dune review card shows the amber **Platform Pick** pill.
   - `http://127.0.0.1:4321/reviews` — Dune card pill; unflagged cards clean.
   - Widths 1200 / 692 / 400 (`resize_page` or `emulate "400x900x1"`): pill
     must not overflow — `document.documentElement.scrollWidth ===
     innerWidth` on each page; `take_screenshot` at 400 as proof.
   - `list_console_messages` → no new errors.

3. **Admin round-trip (manual)** — login `editor@example.com` / `preview1234`
   at `/admin`, open a draft, tick **Platform Pick**, Save Draft, confirm
   `"platformPick": true` in `data/reviews.json`; untick + save → field absent.

4. **Subagent QA pass** — dispatch a `general` subagent with this plan +
   spec path, read-only brief: verify each "Verify Task" block, re-run
   `npm test` + `npm run build`, spot-check the CSS append point is at file
   tail, confirm no `schema.ts`/`migrations` diff.

5. **ROADMAP.md** — mark sub-project A (two-badge system) complete.

No evidence → not done. Record test output + screenshots in the final report.
