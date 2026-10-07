# Taste Profile — schema reference for the settings UI

The "My Taste" settings form edits a `TasteProfile` (see `src/lib/ai/taste.ts`). Field guide:

- **values**: what you reward (e.g. "earned endings", "practical craft", "strong ensembles").
- **dislikes**: what bores/annoys you (e.g. "quippy dialogue", "third-act CGI battles").
- **genrePrefs**: affinity per genre, -5 (avoid) to +5 (seek out).
- **highRatingTriggers**: what earns 8+ (e.g. "ending recontextualizes everything").
- **lowRatingTriggers**: what drags to ≤4 (e.g. "contempt for its own characters").
- **judgments**: one line each for acting / screenplay / direction / cinematography / pacing / atmosphere (e.g. pacing: "slow is fine if every scene earns its runtime").
- **tone**: e.g. "dry, direct, no hype".
- **sentenceStyle**: e.g. "varied lengths, fragments ok, no formulaic openers".
- **bannedPhrases**: hard-never list. Seed: "this movie is not just", "at its core", "in today's world", "a rollercoaster ride", "a love letter to", "tour de force".
- **overusedWords**: soft-avoid list. Seed: "delve, tapestry, captivating, masterful, stunning".
- **sampleReviews**: 1–3 past reviews `{ title, rating, text }` — voice anchors. Keep 3 max for cost.

## Prompt injection order
SYSTEM RULES + TASTE + SAMPLES + MOVIE FACTS + RESEARCH NOTES + RATING (authoritative) + USER PROMPT.
