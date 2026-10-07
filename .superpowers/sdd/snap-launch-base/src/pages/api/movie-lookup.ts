/**
 * GET /api/movie-lookup?tmdbId=&imdbId=&title=&region=
 *
 * Resolution order: tmdbId → imdbId (TMDB /find) → title (TMDB /search, first hit).
 * Cache-first: serve cache when fresh (MOVIE_TTL_MS); stale-while-revalidate
 * on TMDB failure. Optional OMDb enrichment when IMDb ID known.
 *
 * NOTE: typed against a minimal req/res port (no framework import) so this
 * handler survives the Astro-vs-Next routing decision now in flight —
 * foundation agent can wrap it as an Astro APIRoute or Next handler.
 *
 * Response:
 * {
 *   movie: MovieMeta,
 *   cache: { hit: boolean; stale: boolean; fetchedAt: string },
 *   attribution: string,
 *   manualEntryAllowed?: boolean,
 *   error?: string   // present when TMDB failed → client offers manual entry form
 * }
 */
import {
  findTmdbIdByImdbId,
  getMovieMetaSafe,
  searchMoviesByTitle,
} from "../../lib/tmdb/client";
import { attributionText, ATTRIBUTION_TEXT } from "../../lib/streaming";
import { getOmdbEnrichment } from "../../lib/omdb";
import {
  getCacheStore,
  isFresh,
  MOVIE_TTL_MS,
  resolveRegion,
} from "../../lib/cache";
import type { APIRoute } from "astro";
import { wrapLegacy } from "../../lib/api-adapter";

export const prerender = false;

export interface LookupRequest {
  method?: string;
  query: Record<string, string | string[] | undefined>;
}

export interface LookupResponse {
  setHeader(name: string, value: string): void;
  status(code: number): { json(body: unknown): unknown };
}

export default async function handler(req: LookupRequest, res: LookupResponse) {
  if (req.method && req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const q = (name: string): string | undefined => {
    const v = req.query[name];
    return Array.isArray(v) ? v[0] : v;
  };

  const region = resolveRegion(q("region"));
  const tmdbParam = q("tmdbId");
  const imdbParam = q("imdbId")?.trim();
  const titleParam = q("title")?.trim();

  let tmdbId: number | null = tmdbParam ? Number(tmdbParam) : null;
  if (tmdbParam && !Number.isFinite(tmdbId)) {
    return res.status(400).json({ error: "Invalid tmdbId" });
  }

  try {
    // Resolve tmdbId from imdbId / title when not supplied directly.
    if (!tmdbId && imdbParam) {
      tmdbId = await findTmdbIdByImdbId(imdbParam);
      if (!tmdbId) {
        return res.status(404).json({
          error: `No TMDB match for IMDb ID ${imdbParam}. Use manual metadata entry.`,
          manualEntryAllowed: true,
          attribution: ATTRIBUTION_TEXT,
        });
      }
    }
    if (!tmdbId && titleParam) {
      const hits = await searchMoviesByTitle(titleParam);
      const first = hits[0];
      if (!first || !first.id) {
        return res.status(404).json({
          error: `No TMDB match for title "${titleParam}". Use manual metadata entry.`,
          manualEntryAllowed: true,
          attribution: ATTRIBUTION_TEXT,
        });
      }
      tmdbId = first.id;
    }
    if (!tmdbId) {
      return res.status(400).json({
        error: "Provide one of: tmdbId, imdbId, title.",
        attribution: ATTRIBUTION_TEXT,
      });
    }

    const store = getCacheStore();
    const cached = await store.getMovie(tmdbId, region).catch(() => null);
    if (cached && isFresh(cached.fetchedAt, MOVIE_TTL_MS)) {
      return res.status(200).json({
        movie: cached.value,
        cache: { hit: true, stale: false, fetchedAt: cached.fetchedAt },
        attribution: attributionText(region, cached.fetchedAt),
      });
    }

    const { movie, ok, error } = await getMovieMetaSafe(tmdbId, region);

    if (!ok) {
      // TMDB fail → stale-while-revalidate, else manual-entry shape.
      if (cached) {
        return res.status(200).json({
          movie: cached.value,
          cache: { hit: true, stale: true, fetchedAt: cached.fetchedAt },
          attribution: attributionText(region, cached.fetchedAt),
          error: `TMDB unavailable, serving cached copy: ${error}`,
        });
      }
      return res.status(502).json({
        movie,
        cache: { hit: false, stale: false, fetchedAt: movie.fetchedAt },
        manualEntryAllowed: true,
        attribution: ATTRIBUTION_TEXT,
        error: error ?? "TMDB request failed. Submit manual metadata.",
      });
    }

    // Optional OMDb enrichment when IMDb ID known.
    const imdbId = movie.imdbId ?? imdbParam;
    if (imdbId) {
      const omdb = await getOmdbEnrichment(imdbId);
      if (omdb) movie.omdb = omdb;
    }

    await store.setMovie(movie).catch(() => undefined);
    return res.status(200).json({
      movie,
      cache: { hit: false, stale: false, fetchedAt: movie.fetchedAt },
      attribution: attributionText(region, movie.fetchedAt),
    });
  } catch (err) {
    return res.status(500).json({
      error: err instanceof Error ? err.message : "movie-lookup failed",
      manualEntryAllowed: true,
      attribution: ATTRIBUTION_TEXT,
    });
  }
}

export const GET: APIRoute = wrapLegacy(handler as never);
