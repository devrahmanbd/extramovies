/**
 * Optional OMDb enrichment (http://www.omdbapi.com).
 * Only called when an IMDb ID is known. Fail-soft: returns null on any error.
 * Server-side only — uses OMDB_API_KEY from env.
 */
import type { OmdbEnrichment } from "./tmdb/types";

interface OmdbRaw {
  Response?: string;
  Error?: string;
  imdbRating?: string;
  Ratings?: Array<{ Source: string; Value: string }>;
  Metascore?: string;
  Awards?: string;
}

import { effectiveWithoutDb } from "./settings";

let omdbKeyOverride: string | null = null;

/** Dashboard value injection (takes precedence over env fallback). */
export function setOmdbKeyOverride(key: string | null): void {
  omdbKeyOverride = key && key.trim() ? key.trim() : null;
}

export async function getOmdbEnrichment(
  imdbId: string
): Promise<OmdbEnrichment | null> {
  const key = omdbKeyOverride ?? effectiveWithoutDb('omdb.api_key');
  const clean = imdbId.trim();
  if (!key || !/^tt\d+$/.test(clean)) return null;
  try {
    const url = new URL("https://www.omdbapi.com/");
    url.searchParams.set("apikey", key);
    url.searchParams.set("i", clean);
    const res = await fetch(url.toString(), { headers: { Accept: "application/json" } });
    if (!res.ok) return null;
    const raw = (await res.json()) as OmdbRaw;
    if (raw.Response === "False") return null;
    const rt = raw.Ratings?.find((r) => r.Source === "Rotten Tomatoes")?.Value;
    return {
      imdbId: clean,
      imdbRating: raw.imdbRating && raw.imdbRating !== "N/A" ? raw.imdbRating : undefined,
      rottenTomatoes: rt,
      metacritic:
        raw.Metascore && raw.Metascore !== "N/A" ? raw.Metascore : undefined,
      awards: raw.Awards && raw.Awards !== "N/A" ? raw.Awards : undefined,
      fetchedAt: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}
