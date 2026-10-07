import React from "react";

export interface SeoState {
  seoTitle: string;
  metaDesc: string;
  slug: string;
  primaryTopic: string;
  searchIntent: string;
}

interface Props {
  seo: SeoState;
  onChange: (s: SeoState) => void;
  title: string;
  markdown: string;
  internalLinks: string;
  onInternalLinks: (v: string) => void;
}

export interface SeoWarning {
  id: string;
  message: string;
  fix: string;
}

const OPINION_RE = /(i (think|felt|found|loved|hated)|my (take|verdict)|in my opinion|verdict|★|☆|\d\s?\/\s?10|\d\s?\/\s?5)/i;
const SUPERLATIVE_RE = /(best ever|worst ever|masterpiece|perfect film|unmissable|must-see|greatest of all time)/i;
const SPOILER_RE = /(spoiler|ending explained|dies at the end|killer is|twist is)/i;

export function computeSeoWarnings(input: { title: string; seo: SeoState; markdown: string }): SeoWarning[] {
  const w: SeoWarning[] = [];
  const displayTitle = input.seo.seoTitle.trim() || input.title.trim();
  if (displayTitle.length === 0) w.push({ id: "title-missing", message: "Missing title.", fix: "Add a review title (Movie + Year + verdict angle)." });
  else if (displayTitle.length > 60) w.push({ id: "title-long", message: `SEO title is ${displayTitle.length} chars (over 60).`, fix: "Trim to ≤ 60 chars; move extras to the meta description." });
  if (!input.seo.metaDesc.trim()) w.push({ id: "desc-missing", message: "Missing meta description.", fix: "Write 120–160 chars with movie, year, and verdict." });
  else if (input.seo.metaDesc.trim().length > 160) w.push({ id: "desc-long", message: "Meta description over 160 chars.", fix: "Cut to ~155 chars so it isn't truncated." });

  const opening = input.markdown.replace(/[#>*_\-\[\]()!]/g, " ").slice(0, 400);
  if (input.markdown.trim() && !OPINION_RE.test(opening)) {
    w.push({ id: "no-opinion", message: "No opinion in the opening.", fix: "State your verdict in the first 2 sentences (I think… / Verdict: …)." });
  }
  if (SUPERLATIVE_RE.test(input.markdown) && !/(because|since|for example|scene|performance|script)/i.test(input.markdown.slice(0, 1200))) {
    w.push({ id: "unsupported-claim", message: "Strong claim without early evidence.", fix: "Back superlatives with a scene, performance, or craft detail in the opening." });
  }
  const words = displayTitle.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const dup = words.find((x, i) => words.indexOf(x) !== i && x.length > 3);
  if (dup) w.push({ id: "title-stuffing", message: `Title repeats “${dup}”.`, fix: "Remove the repeat — title stuffing hurts click-through." });
  if (!input.seo.slug.trim()) w.push({ id: "slug-missing", message: "Missing slug.", fix: "Use lowercase movie-year-review format." });
  else if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(input.seo.slug.trim())) w.push({ id: "slug-format", message: "Slug has invalid characters.", fix: "Use only lowercase letters, numbers, and hyphens." });
  const imgs = [...input.markdown.matchAll(/!\[([^\]]*)\]\([^)]+\)/g)];
  if (imgs.some((m) => !m[1].trim())) w.push({ id: "missing-alt", message: "Image missing alt text.", fix: "Describe the image: ![Anya Taylor-Joy as Furiosa in the desert](…)." });
  if (SPOILER_RE.test(input.markdown) && !/spoiler warning/i.test(input.markdown)) {
    w.push({ id: "spoiler", message: "Possible spoiler without a warning.", fix: "Add a “Spoiler warning” line before the spoiler section." });
  }
  return w;
}

/** SEO side panel: editable fields + actionable warnings. No scores. */
export function SeoPanel({ seo, onChange, title, markdown, internalLinks, onInternalLinks }: Props) {
  const warnings = React.useMemo(() => computeSeoWarnings({ title, seo, markdown }), [title, seo, markdown]);
  const schemaReady = Boolean(title.trim() && seo.metaDesc.trim() && seo.slug.trim());
  const set = (k: keyof SeoState) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    onChange({ ...seo, [k]: e.target.value });

  return (
    <aside className="card seo-panel" aria-label="SEO panel">
      <h2>SEO</h2>
      <label>SEO title<input value={seo.seoTitle} onChange={set("seoTitle")} maxLength={80} placeholder="Movie (Year) Review — verdict angle" /></label>
      <label>Meta description<textarea value={seo.metaDesc} onChange={set("metaDesc")} rows={3} maxLength={200} /></label>
      <label>Slug<input value={seo.slug} onChange={set("slug")} placeholder="movie-year-review" /></label>
      <label>Primary topic<input value={seo.primaryTopic} onChange={set("primaryTopic")} placeholder="e.g. Dune Part Two review" /></label>
      <label>Search intent
        <select value={seo.searchIntent} onChange={set("searchIntent")}>
          <option value="">Select…</option>
          <option value="review">Review / verdict (should I watch?)</option>
          <option value="where-to-watch">Where to watch</option>
          <option value="explained">Ending explained</option>
          <option value="comparison">Comparison / vs</option>
        </select>
      </label>
      <label>Related internal links (one slug per line)<textarea value={internalLinks} onChange={(e) => onInternalLinks(e.target.value)} rows={3} placeholder="dune-2021-review&#10;best-sci-fi-2024" /></label>
      <p className="muted">Schema: {schemaReady ? "Ready — title + description + slug present (Movie + Review markup eligible)." : "Incomplete — fill title, description, and slug."}</p>
      <h3>Warnings ({warnings.length})</h3>
      {warnings.length === 0 ? <p className="ok">No issues found.</p> : (
        <ul className="warnings">
          {warnings.map((x) => (
            <li key={x.id}><strong>{x.message}</strong><br /><span className="muted">{x.fix}</span></li>
          ))}
        </ul>
      )}
    </aside>
  );
}
