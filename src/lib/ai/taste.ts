/**
 * taste.ts — persistent "My Taste" profile + prompt-block builder.
 * Storage itself lives with the DB owner; this module owns the schema,
 * validation, and the TASTE+SAMPLES block injected into the final prompt.
 *
 * Final prompt order (authoritative):
 *   SYSTEM RULES + TASTE + SAMPLES + MOVIE FACTS + RESEARCH NOTES
 *   + RATING (authoritative) + USER PROMPT
 */

export interface CategoryJudgments {
  acting: string;
  screenplay: string;
  direction: string;
  cinematography: string;
  pacing: string;
  atmosphere: string;
}

export interface TasteProfile {
  version: 1;
  values: string[];            // e.g. ["practical craft over CGI", "earned endings"]
  dislikes: string[];          // e.g. ["quippy Marvel dialogue", "third-act CGI battles"]
  genrePrefs: Record<string, number>; // genre -> affinity -5..+5
  highRatingTriggers: string[]; // what earns 8+
  lowRatingTriggers: string[];  // what drags to <=4
  judgments: CategoryJudgments;  // per-category taste lines
  tone: string;                  // e.g. "dry, direct, no hype"
  sentenceStyle: string;         // e.g. "short declarative, fragments ok"
  bannedPhrases: string[];
  overusedWords: string[];
  sampleReviews: Array<{ title: string; rating: number; text: string }>;
  updatedAt: string;
}

export const DEFAULT_TASTE: TasteProfile = {
  version: 1,
  values: [],
  dislikes: [],
  genrePrefs: {},
  highRatingTriggers: [],
  lowRatingTriggers: [],
  judgments: {
    acting: "",
    screenplay: "",
    direction: "",
    cinematography: "",
    pacing: "",
    atmosphere: "",
  },
  tone: "Direct, personal, no hype. Write like a friend with strong opinions.",
  sentenceStyle: "Varied lengths. Short punches allowed. No formulaic openers.",
  bannedPhrases: [
    "this movie is not just",
    "at its core",
    "in today's world",
    "a rollercoaster ride",
    "a love letter to",
    "tour de force",
  ],
  overusedWords: ["delve", "tapestry", "captivating", "masterful", "stunning"],
  sampleReviews: [],
  updatedAt: new Date(0).toISOString(),
};

export function validateTaste(input: unknown): TasteProfile {
  const t = { ...DEFAULT_TASTE, ...(input as Partial<TasteProfile>) };
  if (!Array.isArray(t.values)) throw new Error("taste.values must be an array");
  if (!Array.isArray(t.sampleReviews)) throw new Error("taste.sampleReviews must be an array");
  if (t.sampleReviews.length > 5) {
    // Cap samples: cost control — 3 best is ideal.
    t.sampleReviews = t.sampleReviews.slice(0, 5);
  }
  for (const [genre, score] of Object.entries(t.genrePrefs ?? {})) {
    if (typeof score !== "number" || score < -5 || score > 5) {
      throw new Error(`taste.genrePrefs[${genre}] must be a number -5..+5`);
    }
  }
  return t as TasteProfile;
}

/** Render the TASTE block for prompt injection. */
export function buildTasteBlock(t: TasteProfile): string {
  const lines = [
    `VALUES: ${t.values.join("; ") || "(none set)"}`,
    `DISLIKES: ${t.dislikes.join("; ") || "(none set)"}`,
    `GENRE AFFINITIES (-5..+5): ${
      Object.entries(t.genrePrefs).map(([g, s]) => `${g}:${s}`).join(", ") || "(none set)"
    }`,
    `HIGH-RATING TRIGGERS (8+): ${t.highRatingTriggers.join("; ") || "(none)"}`,
    `LOW-RATING TRIGGERS (<=4): ${t.lowRatingTriggers.join("; ") || "(none)"}`,
    `JUDGMENTS: acting[${t.judgments.acting}] screenplay[${t.judgments.screenplay}] direction[${t.judgments.direction}] cinematography[${t.judgments.cinematography}] pacing[${t.judgments.pacing}] atmosphere[${t.judgments.atmosphere}]`,
    `TONE: ${t.tone}`,
    `SENTENCE STYLE: ${t.sentenceStyle}`,
    `BANNED PHRASES (never output): ${t.bannedPhrases.join(" | ")}`,
    `OVERUSED WORDS (avoid): ${t.overusedWords.join(", ")}`,
  ];
  return `--- MY TASTE (author voice config) ---\n${lines.join("\n")}`;
}

/** Render up to 3 sample reviews for style anchoring. */
export function buildSamplesBlock(t: TasteProfile): string {
  const samples = t.sampleReviews.slice(0, 3);
  if (samples.length === 0) return "--- VOICE SAMPLES ---\n(none provided)";
  return (
    "--- VOICE SAMPLES (match this voice, not the content) ---\n" +
    samples
      .map((s, i) => `[Sample ${i + 1}: ${s.title}, rated ${s.rating}/10]\n${s.text.slice(0, 2000)}`)
      .join("\n\n")
  );
}

/**
 * Rating-alignment guard: a 4/10 must NOT read glowing.
 * Called post-generation (cheap heuristic) and as prompt instruction pre-generation.
 */
export function ratingAlignmentNote(rating: number): string {
  if (rating <= 4) {
    return `RATING IS ${rating}/10 — AUTHORITATIVE. This is a negative review. Lead with what failed, be specific about flaws, no glowing adjectives, no "despite its flaws" rescue paragraph, no 8/10 energy. Score and tone must agree.`;
  }
  if (rating >= 8) {
    return `RATING IS ${rating}/10 — AUTHORITATIVE. This is a strong recommendation. Be specific about what earned it; enthusiasm must be earned with particulars, never generic hype.`;
  }
  return `RATING IS ${rating}/10 — AUTHORITATIVE. Mixed review. Give real credit and real criticism in proportion to the score. No fence-sitting clichés.`;
}
