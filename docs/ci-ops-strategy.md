# CI/CD + agent operations strategy (all sites, all domains)

Status: PROPOSED 2026-10-10 — single biggest change from today is per-site
environments + a sites registry; everything else already runs.

## 1. Platform verdict: GitHub Actions, not CircleCI

Actions is proven (green deploys, backups, health, releases) with secrets
in place. CircleCI would need: new account, secret migration, config
rewrite, and re-proving every pipeline — for zero capability we lack.
Revisit only if we outgrow Actions minutes or need macOS/GPU runners.

## 2. Branch + release model

- `main`: development. Every push runs tests + build (already true).
- `prod-v1`: clean release snapshots via the Release workflow (already true).
- Deploy targets track branches, never commits-by-hand: extramovies follows
  `main` (continuous), other sites pin releases or follow `main` per appetite.
- Protect `main`: require PR + green tests before merge (repo Settings →
  Branches). The agent opens PRs; the human merge IS the deploy approval.

## 3. Sites registry (the scaling move)

Today each site is hardcoded in workflow YAML. At N≥3 that rots. Move to
`.github/sites/<site>.json`, one file per property:

```json
{
  "site": "cinemavilla",
  "domain": "https://cinemavilla.in",
  "app_dir": "/home/cinemavilla.in/public_html",
  "app_port": 3200,
  "pm2_name": "cinemavilla",
  "db_file": "/home/cinemavilla.in/private/prod.sqlite",
  "ecosystem": "/home/cinemavilla.in/ecosystem.config.js",
  "track": "main"
}
```

Workflows read the registry (matrix from file list) instead of inline
stanzas. Adding domain N+1 = one JSON file + DNS + server prep. No workflow
edits, no YAML risk. `track` allows per-site pinning (`main` vs `prod-v1`).

## 4. Environments + approvals (per-site secrets)

One shared SSH keypair today = blast radius across all boxes. Migrate to
GitHub Environments (`production-extramovies`, `production-cinemavilla`,
…): each holds its own `SSH_HOST/USER/PORT/KEY`, optional required
reviewers (human tap-to-deploy per site), and separate secrets for future
per-site API keys. Deploy jobs reference `environment:` so runs are
auditable per property.

## 5. Secrets map (what lives where, forever)

| Secret | Home | Never in |
|---|---|---|
| SSH deploy keys | GH environment secrets | chat, repo, shell history |
| App env (DB creds, API keys, hashes) | server ecosystem files | repo, CI logs (masking on) |
| Admin passwords | human memory + `/admin` change flow | chat, shell history |
| Analytics/API tokens (Semrush etc.) | local use only, rotated after sharing | repo, chat history |

## 6. Agent lane map (what I do vs what needs you)

AUTO (me, anytime): code, tests, docs, brand/SEO/content work, failing-run
diagnosis from pasted logs, opening PRs with deploy notes, routine
verification (curl probes, sitemap checks, baseline diffs).
APPROVAL (you): merging to `main` (deploys — that merge IS the button),
any secret value, DNS/billing/account changes, brand/domain decisions,
data-destructive ops (DB restores, mass deletes), brand-new prod domains.
I never `push --force`, never skip tests, never print secrets.

## 7. Runbooks (already live, keep linked)

- Deploy/health/backup/release workflows in `.github/workflows/`
- `docs/DEPLOY.md` (host procedures), `docs/domain-merger-runbook.md`
  (consolidations), `docs/content-strategy-multi-brand.md` (upon approval),
  `docs/seo/*` (keyword CSV, baselines, sprint)

## 8. Costs & limits to watch

- Actions minutes (private repo free tier): our runs are ~40s; even daily
  deploys + schedules stay far under limits. Monitor at repo Insights.
- Artifact retention already short (14d backups — credential hashes inside).
- Free-model OpenRouter caps (20 req/min, 50/day) are per-key, unaffected
  by CI. CI never calls AI APIs today — keep it that way (deterministic ops).
