import React from "react";
import type { ReviewMovie } from "../../pages/api/admin/_store";

export interface MovieResult extends ReviewMovie {
  imdbId: string;
}

interface Props {
  initialImdbId?: string;
  initialTitle?: string;
  onFetched: (movie: MovieResult, autoMeta: { title: string; slug: string; excerpt: string; seoTitle: string; metaDesc: string }) => void;
}

/**
 * Movie lookup card. Calls GET /api/movie-lookup?imdbId=&title=&region=
 * (movie-team owned). Response is wrapped: { movie: MovieMeta, attribution, … }
 * where MovieMeta uses posterUrl / runtimeMinutes / credits / Genre objects.
 * This component normalizes to a flat snapshot for the editor + draft store.
 * Auto-generates editable title/slug/excerpt/SEO candidates on fetch.
 */
export function MovieLookup({ initialImdbId = "", initialTitle = "", onFetched }: Props) {
  const [imdbId, setImdbId] = React.useState(initialImdbId);
  const [title, setTitle] = React.useState(initialTitle);
  const [region, setRegion] = React.useState(
    (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_DEFAULT_REGION) || "US",
  );
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");
  const [movie, setMovie] = React.useState<MovieResult | null>(null);
  const [attribution, setAttribution] = React.useState("");

  /** Normalize wrapped MovieMeta (or legacy flat) into the editor snapshot. */
  function normalize(raw: unknown, fallbackTitle: string, fallbackImdb: string): MovieResult {
    const m = (raw as { movie?: Record<string, unknown> })?.movie ?? (raw as Record<string, unknown>);
    const g = (k: string) => (m as Record<string, unknown>)[k];
    const genresRaw = g("genres");
    const genres = Array.isArray(genresRaw)
      ? (genresRaw as Array<string | { name?: string }>).map((x) => (typeof x === "string" ? x : x.name ?? "")).filter(Boolean)
      : [];
    const yearRaw = g("year");
    const year = yearRaw != null && yearRaw !== "" ? String(yearRaw) : ((g("releaseDate") as string | undefined)?.slice(0, 4) ?? "");
    const credits = (g("credits") as { directors?: Array<{ name?: string }>; topCast?: Array<{ name?: string }> } | undefined) ?? {};
    const director = credits.directors?.[0]?.name ?? ((g("director") as string | undefined) ?? "");
    const cast = credits.topCast?.map((c) => c.name ?? "").filter(Boolean) ?? ((g("cast") as string[] | undefined) ?? []);
    const runtimeMin = g("runtimeMinutes");
    const runtime = typeof runtimeMin === "number" ? `${runtimeMin} min` : ((g("runtime") as string | undefined) ?? "");
    const poster = (g("posterUrl") as string | undefined) ?? ((g("poster") as string | undefined) ?? "");
    const tmdbId = g("tmdbId");
    const streamRaw = (g("streaming") as string[] | undefined) ?? [];
    return {
      imdbId: ((g("imdbId") as string | undefined) ?? fallbackImdb).trim(),
      movieId: tmdbId != null ? String(tmdbId) : undefined,
      title: ((g("title") as string | undefined) ?? fallbackTitle).trim() || fallbackTitle,
      year,
      genres,
      runtime,
      director,
      cast,
      overview: (g("overview") as string | undefined) ?? "",
      poster,
      streaming: streamRaw,
    };
  }

  async function fetchMovie() {
    setLoading(true);
    setError("");
    try {
      const q = new URLSearchParams({ imdbId: imdbId.trim(), title: title.trim(), region: region.trim() });
      const res = await fetch(`/api/movie-lookup?${q.toString()}`);
      if (!res.ok) throw new Error(`lookup failed (${res.status})`);
      const data = await res.json();
      if (typeof data?.error === "string" && !data.movie) throw new Error(data.error);
      setAttribution(typeof data?.attribution === "string" ? data.attribution : "");
      const m = normalize(data, title.trim(), imdbId.trim());
      if (!m.title) throw new Error("no movie found — try another title or ID");
      setMovie(m);
      const year = m.year ? ` (${m.year})` : "";
      const slugBase = `${m.title} ${m.year ?? ""} review`.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
      onFetched(m, {
        title: `${m.title}${year} Review`,
        slug: slugBase.slice(0, 80),
        excerpt: (m.overview ?? "").slice(0, 160),
        seoTitle: `${m.title}${year} Review — Verdict, Cast & Where to Watch`,
        metaDesc: `${m.title}${year ? ` (${m.year})` : ""} review: verdict, performances, and where to watch. ${(m.overview ?? "").slice(0, 110)}`,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "lookup failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="card" aria-label="Movie lookup">
      <h2>1 · Fetch movie</h2>
      <div className="row">
        <label>Movie ID / IMDb ID<input value={imdbId} onChange={(e) => setImdbId(e.target.value)} placeholder="tt15398776" /></label>
        <label>Movie name<input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Oppenheimer" /></label>
        <label>Region<input value={region} onChange={(e) => setRegion(e.target.value)} placeholder="US" /></label>
        <button type="button" className="btn" onClick={fetchMovie} disabled={loading || (!imdbId.trim() && !title.trim())}>
          {loading ? "Fetching…" : "Fetch movie"}
        </button>
      </div>
      {error && <p className="error">{error}</p>}
      {movie && (
        <article className="movie-card">
          {movie.poster && <img src={movie.poster} alt={`${movie.title} poster`} width={96} />}
          <div>
            <h3>{movie.title} {movie.year && <span>({movie.year})</span>}</h3>
            <p className="muted">{(movie.genres ?? []).join(" · ")}{movie.runtime ? ` · ${movie.runtime}` : ""}</p>
            {movie.director && <p><strong>Director:</strong> {movie.director}</p>}
            {movie.cast && movie.cast.length > 0 && <p><strong>Cast:</strong> {movie.cast.slice(0, 5).join(", ")}</p>}
            {movie.overview && <p>{movie.overview}</p>}
            {movie.streaming && movie.streaming.length > 0 && <p><strong>Streaming:</strong> {movie.streaming.join(", ")}</p>}
          </div>
        </article>
      )}
      {attribution && <p className="muted small">{attribution}</p>}
    </section>
  );
}
