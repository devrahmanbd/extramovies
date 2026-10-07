/**
 * Domain + TMDB raw types for movie data layer.
 * Server-side only — never expose TMDB_API_KEY to client.
 */

export type RegionCode = string; // ISO 3166-1 alpha-2, e.g. "US", "GB"

export const DEFAULT_REGION: RegionCode = (
  process.env.DEFAULT_REGION || "US"
).toUpperCase();

export interface Genre {
  id: number;
  name: string;
}

export interface PersonCredit {
  id: number;
  name: string;
  character?: string;
  job?: string;
  profileUrl: string | null;
}

export interface Credits {
  /** All directors found in crew (usually 1). */
  directors: PersonCredit[];
  /** Top-billed cast, capped at 10. */
  topCast: PersonCredit[];
}

export interface ProviderEntry {
  providerId: number;
  providerName: string;
  /** Full TMDB logo URL (w92) or null. */
  logoUrl: string | null;
  displayPriority: number;
}

export type ProviderCategory = "streaming" | "rent" | "buy" | "free";

export interface ProvidersNormalized {
  tmdbId: number;
  region: RegionCode;
  /** TMDB deep link to watch page, if provided. */
  link: string | null;
  streaming: ProviderEntry[];
  rent: ProviderEntry[];
  buy: ProviderEntry[];
  free: ProviderEntry[];
  fetchedAt: string; // ISO timestamp
  /** When true, UI must hide the streaming section. */
  hideSection: boolean;
}

export interface OmdbEnrichment {
  imdbId: string;
  imdbRating?: string;
  rottenTomatoes?: string;
  metacritic?: string;
  awards?: string;
  fetchedAt: string;
}

export interface MovieMeta {
  tmdbId: number;
  imdbId: string | null;
  title: string;
  originalTitle: string;
  overview: string;
  tagline: string | null;
  releaseDate: string | null; // YYYY-MM-DD
  year: number | null;
  runtimeMinutes: number | null;
  genres: Genre[];
  posterUrl: string | null;
  backdropUrl: string | null;
  voteAverage: number | null;
  voteCount: number | null;
  popularity: number | null;
  credits: Credits;
  omdb: OmdbEnrichment | null;
  /** True when TMDB failed and editor supplied metadata manually. */
  manualEntry: boolean;
  fetchedAt: string; // ISO timestamp
  region: RegionCode;
}

/** Shape editors submit when TMDB is unavailable. */
export interface ManualMovieInput {
  title: string;
  overview?: string;
  releaseDate?: string | null;
  runtimeMinutes?: number | null;
  genres?: Genre[];
  posterUrl?: string | null;
  backdropUrl?: string | null;
  imdbId?: string | null;
  tmdbId?: number | null;
  directorName?: string | null;
}

export function toManualMovieMeta(
  input: ManualMovieInput,
  region: RegionCode = DEFAULT_REGION
): MovieMeta {
  const year = input.releaseDate
    ? Number(input.releaseDate.slice(0, 4)) || null
    : null;
  return {
    tmdbId: input.tmdbId ?? -1,
    imdbId: input.imdbId ?? null,
    title: input.title,
    originalTitle: input.title,
    overview: input.overview ?? "",
    tagline: null,
    releaseDate: input.releaseDate ?? null,
    year: Number.isFinite(year) ? year : null,
    runtimeMinutes: input.runtimeMinutes ?? null,
    genres: input.genres ?? [],
    posterUrl: input.posterUrl ?? null,
    backdropUrl: input.backdropUrl ?? null,
    voteAverage: null,
    voteCount: null,
    popularity: null,
    credits: {
      directors: input.directorName
        ? [
            {
              id: -1,
              name: input.directorName,
              job: "Director",
              profileUrl: null,
            },
          ]
        : [],
      topCast: [],
    },
    omdb: null,
    manualEntry: true,
    fetchedAt: new Date().toISOString(),
    region: region.toUpperCase(),
  };
}

export function safeMovieDefaults(
  tmdbId: number,
  region: RegionCode
): MovieMeta {
  return {
    tmdbId,
    imdbId: null,
    title: "Untitled",
    originalTitle: "Untitled",
    overview: "",
    tagline: null,
    releaseDate: null,
    year: null,
    runtimeMinutes: null,
    genres: [],
    posterUrl: null,
    backdropUrl: null,
    voteAverage: null,
    voteCount: null,
    popularity: null,
    credits: { directors: [], topCast: [] },
    omdb: null,
    manualEntry: false,
    fetchedAt: new Date().toISOString(),
    region: region.toUpperCase(),
  };
}

// ---------- Raw TMDB shapes (minimal, only fields we use) ----------

export interface TmdbMovieDetails {
  id: number;
  imdb_id?: string | null;
  title?: string;
  original_title?: string;
  overview?: string;
  tagline?: string | null;
  release_date?: string;
  runtime?: number | null;
  genres?: Genre[];
  poster_path?: string | null;
  backdrop_path?: string | null;
  vote_average?: number;
  vote_count?: number;
  popularity?: number;
}

export interface TmdbCredits {
  cast?: Array<{
    id: number;
    name: string;
    character?: string;
    profile_path?: string | null;
    order?: number;
  }>;
  crew?: Array<{
    id: number;
    name: string;
    job?: string;
    profile_path?: string | null;
  }>;
}

export interface TmdbProviderOption {
  provider_id: number;
  provider_name: string;
  logo_path?: string | null;
  display_priority?: number;
}

export interface TmdbWatchProviders {
  id: number;
  results?: Record<
    string,
    {
      link?: string;
      flatrate?: TmdbProviderOption[];
      rent?: TmdbProviderOption[];
      buy?: TmdbProviderOption[];
      free?: TmdbProviderOption[];
      ads?: TmdbProviderOption[];
    }
  >;
}

export interface TmdbFindResult {
  movie_results?: Array<TmdbMovieDetails>;
}
