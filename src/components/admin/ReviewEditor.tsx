import React from "react";
import { MarkdownEditor } from "./MarkdownEditor";
import { MovieLookup } from "./MovieLookup";
import type { MovieResult } from "./MovieLookup";
import { SeoPanel } from "./SeoPanel";
import type { SeoState } from "./SeoPanel";
import { StageProgress } from "./StageProgress";
import { renderMarkdown } from "./markdown";
import type { Review } from "../../pages/api/admin/_store";
import type { CustomWatch, CustomWatchKind } from "../../lib/watch-links";

interface Props {
  csrfToken: string;
  initial?: Review | null;
  defaultRegion?: string;
}

const GENERATE_API = "/api/generate/generate-review"; // generation-team owned; template fallback keeps editor usable standalone

/** Read the canonical TasteProfile saved by Settings (back-compat with older shapes). */
function readStoredTaste(): Record<string, unknown> {
  try {
    const raw = localStorage.getItem("admin_taste");
    if (!raw) return {};
    const parsed = JSON.parse(raw) as { taste?: Record<string, unknown> } & Record<string, unknown>;
    return parsed.taste ?? parsed;
  } catch {
    return {};
  }
}

function buildFallbackDraft(movie: MovieResult | null, notes: string, rating: number, title: string): string {
  const name = movie?.title ?? title ?? "This film";
  const year = movie?.year ? ` (${movie.year})` : "";
  const dir = movie?.director ? ` Directed by ${movie.director}.` : "";
  return [
    `# ${name}${year} — Review`,
    ``,
    `Verdict: ${rating ? `${rating}/10 — ` : ""}first impressions below; edit this opening into a clear opinion in 2 sentences.${dir}`,
    ``,
    notes.trim() ? `> Notes: ${notes.trim()}` : `> Replace this with your personal take — what stuck with you?`,
    ``,
    `## What works`,
    ``,
    `- Performance / craft detail from ${name}…`,
    `- A scene that earns its ambition…`,
    ``,
    `## What doesn't`,
    ``,
    `- One honest reservation…`,
    ``,
    `## Verdict`,
    ``,
    `${rating ? `${rating}/10. ` : ""}Who should watch it, and where (${movie?.streaming?.join(", ") || "streaming TBC"}).`,
    ``,
    `---`,
    ``,
    `_Draft generated from movie lookup — never auto-published. Edit, then Save Draft._`,
  ].join("\n");
}

function humanizePass(md: string): string {
  // Minimal, transparent pass: soften robotic openers, vary transitions. No AI call.
  return md
    .replace(/^In conclusion,/gim, "Verdict:")
    .replace(/\bMoreover,/g, "Also,")
    .replace(/\bFurthermore,/g, "And")
    .replace(/\bIt is worth noting that /g, "")
    .replace(/\bDelve into /g, "Dig into ");
}

export function ReviewEditor({ csrfToken, initial = null, defaultRegion = "US" }: Props) {
  const [id, setId] = React.useState(initial?.id ?? "");
  const [movieName, setMovieName] = React.useState(initial?.movie?.title ?? "");
  const [imdbId, setImdbId] = React.useState(initial?.movie?.imdbId ?? "");
  const [movie, setMovie] = React.useState<MovieResult | null>(initial?.movie ? { ...(initial.movie as MovieResult), imdbId: initial.movie.imdbId ?? "" } : null);
  const [rating, setRating] = React.useState<number>(initial?.rating ?? 0);
  const [region, setRegion] = React.useState(initial?.region ?? defaultRegion);
  const [platformPick, setPlatformPick] = React.useState(initial?.platformPick ?? false);
  const [notes, setNotes] = React.useState("");
  const [title, setTitle] = React.useState(initial?.title ?? "");
  const [slug, setSlug] = React.useState(initial?.slug ?? "");
  const [excerpt, setExcerpt] = React.useState(initial?.excerpt ?? "");
  const [markdown, setMarkdown] = React.useState(initial?.markdown ?? "");
  const [seo, setSeo] = React.useState<SeoState>({
    seoTitle: initial?.seo?.seoTitle ?? "",
    metaDesc: initial?.seo?.metaDesc ?? "",
    slug: initial?.slug ?? "",
    primaryTopic: initial?.seo?.primaryTopic ?? "",
    searchIntent: initial?.seo?.searchIntent ?? "",
  });
  const [internalLinks, setInternalLinks] = React.useState("");
  const [customWatch, setCustomWatch] = React.useState<CustomWatch>({
    free: [...(initial?.customWatch?.free ?? [])],
    paid: [...(initial?.customWatch?.paid ?? [])],
  });
  const [stage, setStage] = React.useState(-1);
  const [generating, setGenerating] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [fullPreview, setFullPreview] = React.useState(false);
  const [message, setMessage] = React.useState("");

  React.useEffect(() => {
    setSeo((s) => ({ ...s, slug }));
  }, [slug]);

  async function collectPayload(status: "draft" = "draft") {
    void status;
    return {
      id: id || undefined,
      title: title.trim(),
      slug: slug.trim(),
      excerpt: excerpt.trim(),
      markdown,
      rating: rating || undefined,
      region: region.trim(),
      platformPick: platformPick || undefined,
      movie: movie ?? undefined,
      customWatch: {
        free: customWatch.free.filter((l) => l.label.trim() && l.url.trim()),
        paid: customWatch.paid.filter((l) => l.label.trim() && l.url.trim()),
      },
      seo: { seoTitle: seo.seoTitle, metaDesc: seo.metaDesc, primaryTopic: seo.primaryTopic, searchIntent: seo.searchIntent },
    };
  }

  async function saveDraft() {
    setSaving(true);
    setMessage("");
    try {
      const res = await fetch("/api/admin/save-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify(await collectPayload()),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error ?? "save failed");
      setId(data.id);
      setMessage(`Draft saved (${data.slug}).`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "save failed");
    } finally {
      setSaving(false);
    }
  }

  async function publish() {
    if (!id) {
      setMessage("Save as draft first, then publish.");
      return;
    }
    if (!window.confirm("Publish this review now? It will become public.")) return;
    setSaving(true);
    try {
      // Ensure latest edits are saved before publish.
      await saveDraft();
      const res = await fetch("/api/admin/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error ?? "publish failed");
      setMessage("Published.");
      window.location.href = "/admin/reviews";
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "publish failed");
    } finally {
      setSaving(false);
    }
  }

  async function generate() {
    setGenerating(true);
    setMessage("");
    setStage(0);
    const timers: ReturnType<typeof setTimeout>[] = [];
    // Stage animation: advance while the synchronous pipeline run works.
    // Pipeline UX order: fetching -> researching -> angle -> writing -> fact-check -> seo -> humanizing -> ready.
    for (let i = 1; i <= 4; i++) timers.push(setTimeout(() => setStage(i), i * 900));
    try {
      const res = await fetch(GENERATE_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          movie: {
            title: movie?.title || movieName.trim() || title.trim(),
            year: movie?.year ? Number(movie.year) || undefined : undefined,
            director: movie?.director || undefined,
            genres: movie?.genres?.length ? movie.genres : undefined,
            cast: movie?.cast?.length ? movie.cast.slice(0, 5) : undefined,
          },
          rating,
          userPrompt: notes.trim(),
          taste: readStoredTaste(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data?.error === "string" ? data.error : "generator unavailable");
      const outputs = (data?.outputs ?? {}) as {
        finalMarkdown?: string; humanized?: string; draft?: string; voiced?: string;
        seo?: { title?: string; metaDescription?: string; slug?: string };
      };
      const md = outputs.finalMarkdown ?? outputs.humanized ?? outputs.draft ?? outputs.voiced ?? "";
      if (!md.trim()) throw new Error("empty draft");
      timers.forEach(clearTimeout);
      setStage(5);
      setMarkdown(md); // draft only — never published here
      if (outputs.seo?.title) setSeo((s) => ({ ...s, seoTitle: outputs.seo!.title! }));
      if (outputs.seo?.metaDescription) setSeo((s) => ({ ...s, metaDesc: outputs.seo!.metaDescription! }));
      if (outputs.seo?.slug && !slug.trim()) setSlug(outputs.seo.slug);
      setMessage("Draft generated — review, then Save Draft.");
    } catch (e) {
      timers.forEach(clearTimeout);
      setStage(5);
      // Standalone fallback so the editor works before the generation API lands.
      setMarkdown((m) => m.trim() ? m : buildFallbackDraft(movie, notes, rating, movieName || title));
      setMessage(e instanceof Error && e.message !== "generator unavailable" && e.message !== "empty draft"
        ? e.message
        : "Generator API not reachable — inserted editable template draft instead.");
    } finally {
      setGenerating(false);
      setTimeout(() => setStage(-1), 2500);
    }
  }

  const seoPanelRef = React.useRef<HTMLDivElement>(null);

  return (
    <div className="editor-page">
      <MovieLookup
        initialImdbId={imdbId}
        initialTitle={movieName}
        onFetched={(m, meta) => {
          setMovie(m);
          setMovieName(m.title);
          setImdbId(m.imdbId);
          if (!title.trim()) setTitle(meta.title);
          if (!slug.trim()) setSlug(meta.slug);
          if (!excerpt.trim()) setExcerpt(meta.excerpt);
          setSeo((s) => ({
            ...s,
            seoTitle: s.seoTitle || meta.seoTitle,
            metaDesc: s.metaDesc || meta.metaDesc,
            slug: slug || meta.slug,
          }));
        }}
      />

      <section className="card" aria-label="Review inputs">
        <h2>2 · Review inputs</h2>
        <div className="row">
          <label>Movie name<input value={movieName} onChange={(e) => setMovieName(e.target.value)} placeholder="Dune: Part Two" /></label>
          <label>Rating (0–10)<input type="number" min={0} max={10} step={0.5} value={rating || ""} onChange={(e) => setRating(Number(e.target.value))} /></label>
          <label>Region<input value={region} onChange={(e) => setRegion(e.target.value)} /></label>
        </div>
        <label>Prompt / notes<textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Angle, context, what to focus on…" /></label>
        <button type="button" className="btn primary" onClick={generate} disabled={generating}>
          {generating ? "Generating…" : "Generate review"}
        </button>
        {(generating || stage >= 0) && <StageProgress active={Math.max(0, stage)} done={stage >= 5 && !generating} />}
      </section>

      <section className="card" aria-label="Metadata">
        <h2>3 · Metadata (auto-filled, editable)</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          Where-to-watch extras live in section 4 below — custom free sites plus paid watch links.
        </p>
        <label>Title<input value={title} onChange={(e) => setTitle(e.target.value)} /></label>
        <div className="row">
          <label>Slug<input value={slug} onChange={(e) => setSlug(e.target.value)} /></label>
          <label>Excerpt<input value={excerpt} onChange={(e) => setExcerpt(e.target.value)} /></label>
        </div>
        <label className="check-row" style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "0.75rem" }}>
          <input type="checkbox" checked={platformPick} onChange={(e) => setPlatformPick(e.target.checked)} />
          <span>Platform Pick — show badge on title cards</span>
        </label>
      </section>

      <WatchLinksEditor value={customWatch} onChange={setCustomWatch} />

      <div className="editor-layout">
        <section className="card grow" aria-label="Editor">
          <h2>5 · Editor</h2>
          {fullPreview ? (
            <div className="md-preview full" dangerouslySetInnerHTML={{ __html: renderMarkdown(markdown) }} />
          ) : (
            <MarkdownEditor value={markdown} onChange={setMarkdown} />
          )}
          <div className="toolbar">
            <button type="button" className="btn" onClick={saveDraft} disabled={saving}>{saving ? "Saving…" : "Save Draft"}</button>
            <button type="button" className="btn ghost" onClick={() => setFullPreview((v) => !v)}>{fullPreview ? "Back to edit" : "Preview"}</button>
            <button type="button" className="btn primary" onClick={publish} disabled={saving}>Publish</button>
            <button type="button" className="btn ghost" onClick={generate} disabled={generating}>Regenerate</button>
            <button type="button" className="btn ghost" onClick={() => setMarkdown(humanizePass(markdown))}>Humanize</button>
            <button type="button" className="btn ghost" onClick={() => seoPanelRef.current?.scrollIntoView({ behavior: "smooth" })}>SEO Check</button>
          </div>
          {message && <p className="muted" role="status">{message}</p>}
        </section>
        <div ref={seoPanelRef}>
          <SeoPanel seo={seo} onChange={setSeo} title={title} markdown={markdown} internalLinks={internalLinks} onInternalLinks={setInternalLinks} />
        </div>
      </div>
    </div>
  );
}

/** Section 4 — manual watch links. Custom free sites + paid watch, per review. */
function WatchLinksEditor({
  value,
  onChange,
}: {
  value: CustomWatch;
  onChange: (next: CustomWatch) => void;
}) {
  const setKind = (kind: CustomWatchKind, i: number, patch: Partial<{ label: string; url: string }>) => {
    const list = value[kind].map((l, j) => (j === i ? { ...l, ...patch } : l));
    onChange({ ...value, [kind]: list });
  };
  const add = (kind: CustomWatchKind) => {
    if (value[kind].length >= 12) return;
    onChange({ ...value, [kind]: [...value[kind], { label: "", url: "", kind }] });
  };
  const remove = (kind: CustomWatchKind, i: number) => {
    onChange({ ...value, [kind]: value[kind].filter((_, j) => j !== i) });
  };

  const group = (
    kind: CustomWatchKind,
    title: string,
    hint: string,
  ) => (
    <div>
      <h3 style={{ margin: "0.75rem 0 0.25rem" }}>{title}</h3>
      <p className="muted" style={{ margin: "0 0 0.5rem" }}>{hint}</p>
      {value[kind].map((l, i) => (
        <div className="row" key={`${kind}-${i}`}>
          <label>Site label<input value={l.label} maxLength={60} onChange={(e) => setKind(kind, i, { label: e.target.value })} placeholder={kind === "free" ? "Archive Stream" : "Ticket Partner"} /></label>
          <label>URL (https://…)<input value={l.url} inputMode="url" onChange={(e) => setKind(kind, i, { url: e.target.value })} placeholder="https://example.com/watch" /></label>
          <button type="button" className="btn ghost" onClick={() => remove(kind, i)} aria-label={`Remove ${l.label || "link"}`}>✕</button>
        </div>
      ))}
      <button type="button" className="btn ghost" onClick={() => add(kind)}>
        + Add {kind === "free" ? "free site" : "paid link"}
      </button>
    </div>
  );

  return (
    <section className="card" aria-label="Where to watch extras">
      <h2>4 · Where to watch — manual links</h2>
      <p className="muted" style={{ marginTop: 0 }}>
        Shown after the automatic provider tiles, badged “Added by the editor”. Invalid URLs are dropped on save.
      </p>
      {group("free", "Custom free sites", "Free streaming sites you vouch for — shown under “Free sites”.")}
      {group("paid", "Paid watch", "Ticket, rental or sponsor links — shown under “Buy” with sponsored disclosure.")}
    </section>
  );
}
