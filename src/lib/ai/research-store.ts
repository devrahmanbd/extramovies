/**
 * research-store.ts — research philosophy + research_sources helpers.
 *
 * Philosophy (spec): research ONLY when needed —
 *   production context, director background, adaptation source,
 *   release/box-office context. Never to pad. Never fabricate quotes/facts.
 *
 * Claim discipline: every extracted claim is tagged
 *   FACT (verifiable) / MY OPINION (reviewer's) / INFERENCE (reasoned guess)
 *   / UNCERTAIN (do not publish as fact).
 *
 * Canonical table (owned by migration 0001_init — DO NOT redeclare):
 *   research_sources(id, movie_id, review_id, kind, url, snippet, fetched_at)
 * Rich fields (title, notes, claims) travel as JSON inside `snippet`.
 * `kind` is one of: 'tmdb' | 'omdb' | 'openrouter' | 'manual'.
 */

export type ClaimKind = "FACT" | "MY OPINION" | "INFERENCE" | "UNCERTAIN";

export type ResearchKind = "tmdb" | "omdb" | "openrouter" | "manual";

export interface ResearchClaim {
  kind: ClaimKind;
  text: string;
  sourceUrl?: string;
}

/** Domain type — mapped to/from the canonical row by toRow/fromRow. */
export interface ResearchSource {
  id?: string;
  movieId?: string;
  reviewId: string;
  kind: ResearchKind;
  url: string;
  title: string;
  source: string;
  retrievedAt: string;
  notes: string;
  claims: ResearchClaim[];
}

export interface ResearchSourceRow {
  id: string;
  movie_id: string | null;
  review_id: string | null;
  kind: string;
  url: string | null;
  snippet: string | null;
  fetched_at: string;
}

interface SnippetPayload {
  title: string;
  source: string;
  notes: string;
  claims: ResearchClaim[];
}

function encodeSnippet(s: ResearchSource): string {
  const payload: SnippetPayload = {
    title: s.title,
    source: s.source,
    notes: s.notes,
    claims: s.claims,
  };
  return JSON.stringify(payload);
}

function decodeSnippet(row: ResearchSourceRow): Omit<ResearchSource, "id" | "movieId" | "reviewId" | "kind" | "url" | "retrievedAt"> {
  try {
    const p = JSON.parse(row.snippet ?? "{}") as Partial<SnippetPayload>;
    return {
      title: typeof p.title === "string" ? p.title : row.url ?? "(untitled)",
      source: typeof p.source === "string" ? p.source : "web",
      notes: typeof p.notes === "string" ? p.notes : "",
      claims: Array.isArray(p.claims) ? p.claims : [],
    };
  } catch {
    return { title: row.url ?? "(untitled)", source: "web", notes: row.snippet ?? "", claims: [] };
  }
}

export function toRow(s: ResearchSource): ResearchSourceRow {
  return {
    id: s.id ?? `rs_${Date.now()}`,
    movie_id: s.movieId ?? null,
    review_id: s.reviewId,
    kind: s.kind,
    url: s.url,
    snippet: encodeSnippet(s),
    fetched_at: s.retrievedAt ?? new Date().toISOString(),
  };
}

export function fromRow(row: ResearchSourceRow): ResearchSource {
  return {
    id: row.id,
    movieId: row.movie_id ?? undefined,
    reviewId: row.review_id ?? "",
    kind: (row.kind as ResearchKind) ?? "manual",
    url: row.url ?? "",
    retrievedAt: row.fetched_at,
    ...decodeSnippet(row),
  };
}

export interface ResearchStore {
  saveSource(s: ResearchSource): Promise<ResearchSource>;
  listSources(reviewId: string): Promise<ResearchSource[]>;
}

/** In-memory fallback so the pipeline runs before the DB adapter is wired. */
export function createMemoryResearchStore(): ResearchStore & { all(): ResearchSource[] } {
  const rows: ResearchSource[] = [];
  return {
    async saveSource(s) {
      const saved = { ...s, id: s.id ?? `rs_${Date.now()}_${rows.length}` };
      rows.push(saved);
      return saved;
    },
    async listSources(reviewId) {
      return rows.filter((r) => r.reviewId === reviewId);
    },
    all: () => rows,
  };
}

/**
 * Gate: do we need web research at all?
 * Returns false for pure-opinion reviews where the user supplied everything.
 */
export function shouldResearch(input: {
  userPrompt: string;
  movieFacts?: { director?: string; isAdaptation?: boolean; releaseYear?: number };
  explicitRequest?: boolean;
}): { needed: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (input.explicitRequest) reasons.push("user explicitly asked for context");
  if (input.movieFacts?.director) reasons.push("director context may matter");
  if (input.movieFacts?.isAdaptation) reasons.push("adaptation source check");
  const wantsContext =
    /director|based on|true story|remake|production|controversy|box office|festival|cannes|oscar/i.test(
      input.userPrompt
    );
  if (wantsContext) reasons.push("user prompt references external context");
  return { needed: reasons.length > 0, reasons };
}

/** Render stored research as the RESEARCH NOTES prompt block. */
export function buildResearchNotesBlock(sources: ResearchSource[]): string {
  if (sources.length === 0) return "--- RESEARCH NOTES ---\n(none — opinion-only review)";
  const parts = sources.map((s, i) => {
    const claims = s.claims
      .map((c) => `- [${c.kind}] ${c.text}`)
      .join("\n");
    return `[${i + 1}] ${s.title} (${s.source}, retrieved ${s.retrievedAt})\n${s.url}\nNotes: ${s.notes}\nClaims:\n${claims || "- (no claims extracted)"}`;
  });
  return (
    "--- RESEARCH NOTES (use FACT claims only as facts; never invent quotes) ---\n" +
    parts.join("\n\n")
  );
}
