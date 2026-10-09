/**
 * Streaming availability layer (TMDB watch/providers).
 * - Never invent availability: only what TMDB returns for the region.
 * - Normalizes to Streaming/Rent/Buy/Free categories.
 * - Filters to top useful providers per region (priority + cap).
 * - Failure → empty lists + hideSection=true (UI hides the section).
 */
import type {
  ProviderEntry,
  ProvidersNormalized,
  RegionCode,
  TmdbProviderOption,
  TmdbWatchProviders,
} from "./tmdb/types";
import { DEFAULT_REGION } from "./tmdb/types";

const TMDB_BASE = "https://api.themoviedb.org/3";
const LOGO_BASE = "https://image.tmdb.org/t/p/w92";

/** Max providers kept per category after priority sort. */
export const MAX_PROVIDERS_PER_CATEGORY = 12;

function toEntry(p: TmdbProviderOption): ProviderEntry {
  return {
    providerId: p.provider_id,
    providerName: p.provider_name,
    logoUrl: p.logo_path ? `${LOGO_BASE}${p.logo_path}` : null,
    displayPriority: p.display_priority ?? 999,
  };
}

function clean(list: TmdbProviderOption[] | undefined): ProviderEntry[] {
  if (!list) return [];
  const seen = new Set<number>();
  return list
    .map(toEntry)
    .filter((e) => {
      if (seen.has(e.providerId)) return false;
      seen.add(e.providerId);
      return true;
    })
    .sort((a, b) => a.displayPriority - b.displayPriority)
    .slice(0, MAX_PROVIDERS_PER_CATEGORY);
}

/** Normalize raw TMDB watch/providers payload for one region. Pure function (testable). */
export function normalizeWatchProviders(
  raw: TmdbWatchProviders,
  tmdbId: number,
  region: RegionCode
): ProvidersNormalized {
  const r = region.toUpperCase();
  const entry = raw.results?.[r];
  const fetchedAt = new Date().toISOString();
  if (!entry) {
    // No data for region — NOT an error, just hide section.
    return {
      tmdbId,
      region: r,
      link: null,
      streaming: [],
      rent: [],
      buy: [],
      free: [],
      fetchedAt,
      hideSection: true,
    };
  }
  // Merge `ads` into free (ad-supported free streaming).
  const free = clean([...(entry.free ?? []), ...(entry.ads ?? [])]);
  const streaming = clean(entry.flatrate);
  const rent = clean(entry.rent);
  const buy = clean(entry.buy);
  const hasAny =
    streaming.length + rent.length + buy.length + free.length > 0;
  return {
    tmdbId,
    region: r,
    link: entry.link ?? null,
    streaming,
    rent,
    buy,
    free,
    fetchedAt,
    hideSection: !hasAny,
  };
}

export function emptyProviders(
  tmdbId: number,
  region: RegionCode = DEFAULT_REGION
): ProvidersNormalized {
  return {
    tmdbId,
    region: region.toUpperCase(),
    link: null,
    streaming: [],
    rent: [],
    buy: [],
    free: [],
    fetchedAt: new Date().toISOString(),
    hideSection: true,
  };
}

/** Live fetch from TMDB. Fail-soft → emptyProviders with hideSection=true. */
export async function getStreamingAvailability(
  tmdbId: number,
  region: RegionCode = DEFAULT_REGION
): Promise<{ providers: ProvidersNormalized; ok: boolean; error?: string }> {
  const r = region.toUpperCase();
  const key = process.env.TMDB_API_KEY;
  if (!key) {
    return {
      providers: emptyProviders(tmdbId, r),
      ok: false,
      error: "TMDB_API_KEY not configured",
    };
  }
  try {
    const url = new URL(`${TMDB_BASE}/movie/${tmdbId}/watch/providers`);
    url.searchParams.set("api_key", key);
    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(`TMDB providers failed: ${res.status}`);
    const raw = (await res.json()) as TmdbWatchProviders;
    return { providers: normalizeWatchProviders(raw, tmdbId, r), ok: true };
  } catch (err) {
    return {
      providers: emptyProviders(tmdbId, r),
      ok: false,
      error: err instanceof Error ? err.message : "providers fetch failed",
    };
  }
}

// ---------- Attribution ----------

export const ATTRIBUTION_TEXT =
  "Streaming data powered by TMDB. Availability varies by region and changes over time.";

export function attributionText(region: RegionCode, fetchedAt: string): string {
  return `${ATTRIBUTION_TEXT} Region: ${region.toUpperCase()} · Updated: ${fetchedAt}`;
}
