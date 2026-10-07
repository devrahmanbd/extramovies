#!/usr/bin/env bash
# prune-prod.sh — strip everything the production server doesn't run.
# Release flow: git checkout prod-v1 && git merge main && ./scripts/prune-prod.sh
#   && git add -A && git commit -m "Release YYYY-MM-DD" && git push origin prod-v1
# Idempotent: safe to rerun (rm -rf of absent paths is a no-op).
set -euo pipefail
cd "$(dirname "$0")/.."

# Docs / planning (live in main + GitHub web UI, never served)
rm -rf docs ROADMAP.md design.md
# Test suites (run on main/CI, never on the server)
rm -rf tests vitest.config.ts
# Agent workspace + editor tooling (dev-time only, not runtime)
rm -rf .agents .opencode skills-lock.json
# Stale local caches / editor droppings
rm -rf .astro .wrangler

# Guardrails: fail loudly if the prune ever touches runtime paths
for keep in src public migrations scripts prompts package.json astro.config.mjs; do
  test -e "$keep" || { echo "PRUNE ERROR: runtime path missing: $keep"; exit 1; }
done
echo "prune-prod OK: $(git status --short | wc -l) changed paths"
