/**
 * GET /api/streaming?tmdbId=&region=
 *
 * Cache-first (STREAMING_TTL_MS, default 7d). On upstream failure:
 * return empty lists + hideSection=true so the UI hides the section.
 * Never invent availability.
 *
 * NOTE: minimal req/res port — see movie-lookup.ts.
 */
import {
  attributionText,
  ATTRIBUTION_TEXT,
  emptyProviders,
  getStreamingAvailability,
} from "../../lib/streaming";
import {
  getCacheStore,
  isFresh,
  resolveRegion,
  STREAMING_TTL_MS,
} from "../../lib/cache";
import type { APIRoute } from "astro";
import { wrapLegacy } from "../../lib/api-adapter";

export const prerender = false;

export interface StreamingRequest {
  method?: string;
  query: Record<string, string | string[] | undefined>;
}

export interface StreamingResponse {
  setHeader(name: string, value: string): void;
  status(code: number): { json(body: unknown): unknown };
}

export default async function handler(req: StreamingRequest, res: StreamingResponse) {
  if (req.method && req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const raw = req.query.tmdbId;
  const tmdbId = Number(Array.isArray(raw) ? raw[0] : raw);
  if (!Number.isFinite(tmdbId)) {
    return res.status(400).json({ error: "Provide ?tmdbId=" });
  }
  const regionValue = req.query.region;
  const region = resolveRegion(
    Array.isArray(regionValue) ? regionValue[0] : regionValue
  );
  const store = getCacheStore();

  try {
    const cached = await store.getProviders(tmdbId, region).catch(() => null);
    if (cached && isFresh(cached.fetchedAt, STREAMING_TTL_MS)) {
      return res.status(200).json({
        providers: cached.value,
        cache: { hit: true, stale: false, fetchedAt: cached.fetchedAt },
        attribution: attributionText(region, cached.fetchedAt),
      });
    }

    const { providers, ok, error } = await getStreamingAvailability(tmdbId, region);
    if (!ok) {
      if (cached) {
        // Stale-while-revalidate for streaming too.
        return res.status(200).json({
          providers: cached.value,
          cache: { hit: true, stale: true, fetchedAt: cached.fetchedAt },
          attribution: attributionText(region, cached.fetchedAt),
          error,
        });
      }
      return res.status(200).json({
        providers,
        cache: { hit: false, stale: false, fetchedAt: providers.fetchedAt },
        attribution: attributionText(region, providers.fetchedAt),
        error: error ?? "streaming unavailable",
      });
    }

    await store.setProviders(providers).catch(() => undefined);
    return res.status(200).json({
      providers,
      cache: { hit: false, stale: false, fetchedAt: providers.fetchedAt },
      attribution: attributionText(region, providers.fetchedAt),
    });
  } catch (err) {
    const fallback = emptyProviders(tmdbId, region);
    return res.status(200).json({
      providers: fallback,
      cache: { hit: false, stale: false, fetchedAt: fallback.fetchedAt },
      attribution: ATTRIBUTION_TEXT,
      error: err instanceof Error ? err.message : "streaming failed",
    });
  }
}

export const GET: APIRoute = wrapLegacy(handler as never);
