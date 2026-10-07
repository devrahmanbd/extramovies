import React from "react";

/**
 * My Taste — canonical TasteProfile schema (owned by generation team,
 * see src/lib/ai/taste.ts) + site/brand preset, default region, SEO defaults.
 * Staged in this browser (single admin); sent as `taste` to
 * POST /api/generate/generate-review on every generation.
 */

interface Sample { title: string; rating: number | ""; text: string; }
interface Judgments { acting: string; screenplay: string; direction: string; cinematography: string; pacing: string; atmosphere: string; }

interface TasteState {
  values: string;
  dislikes: string;
  genrePrefs: string;
  highRatingTriggers: string;
  lowRatingTriggers: string;
  judgments: Judgments;
  tone: string;
  sentenceStyle: string;
  bannedPhrases: string;
  overusedWords: string;
  samples: [Sample, Sample, Sample];
  sitePreset: string;
  defaultRegion: string;
  seoTitleSuffix: string;
  seoDescTemplate: string;
  seoAuthor: string;
}

export interface ServerDefaults {
  defaultRegion: string;
  sitePreset: string;
  seoTitleSuffix: string;
  seoAuthor: string;
}

interface DashboardSettings {
  tmdbApiKey: string;
  omdbApiKey: string;
  openrouterApiKey: string;
  openrouterModel: string;
  openrouterCheapModel: string;
  openrouterBaseUrl: string;
  siteUrl: string;
  siteName: string;
}

const EMPTY_DASHBOARD: DashboardSettings = {
  tmdbApiKey: "",
  omdbApiKey: "",
  openrouterApiKey: "",
  openrouterModel: "",
  openrouterCheapModel: "",
  openrouterBaseUrl: "",
  siteUrl: "",
  siteName: "",
};

const BLANK_SAMPLE: Sample = { title: "", rating: "", text: "" };

function emptyTaste(serverDefaults: ServerDefaults): TasteState {
  return {
    values: "", dislikes: "", genrePrefs: "", highRatingTriggers: "", lowRatingTriggers: "",
    judgments: { acting: "", screenplay: "", direction: "", cinematography: "", pacing: "", atmosphere: "" },
    tone: "Direct, personal, no hype. Write like a friend with strong opinions.",
    sentenceStyle: "Varied lengths. Short punches allowed. No formulaic openers.",
    bannedPhrases: "a rollercoaster ride\ntour de force\na love letter to\nat its core",
    overusedWords: "delve\ntapestry\ncaptivating\nmasterful\nstunning",
    samples: [{ ...BLANK_SAMPLE }, { ...BLANK_SAMPLE }, { ...BLANK_SAMPLE }],
    sitePreset: serverDefaults.sitePreset,
    defaultRegion: serverDefaults.defaultRegion,
    seoTitleSuffix: serverDefaults.seoTitleSuffix,
    seoDescTemplate: "{title} ({year}) review: verdict, performances, and where to watch.",
    seoAuthor: serverDefaults.seoAuthor,
  };
}

const lines = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);

/** Build the canonical TasteProfile payload for the generate API. */
export function toTasteProfile(t: TasteState) {
  const genrePrefs: Record<string, number> = {};
  for (const line of lines(t.genrePrefs)) {
    const m = line.match(/^(.+?)\s*:\s*(-?\d+)$/);
    if (m) genrePrefs[m[1]!.trim()] = Math.max(-5, Math.min(5, Number(m[2])));
  }
  return {
    version: 1 as const,
    values: lines(t.values),
    dislikes: lines(t.dislikes),
    genrePrefs,
    highRatingTriggers: lines(t.highRatingTriggers),
    lowRatingTriggers: lines(t.lowRatingTriggers),
    judgments: t.judgments,
    tone: t.tone,
    sentenceStyle: t.sentenceStyle,
    bannedPhrases: lines(t.bannedPhrases),
    overusedWords: lines(t.overusedWords),
    sampleReviews: t.samples.filter((s) => s.text.trim()).map((s) => ({
      title: s.title.trim() || "Untitled",
      rating: typeof s.rating === "number" ? s.rating : 0,
      text: s.text,
    })),
    updatedAt: new Date().toISOString(),
  };
}

const PRESETS = ["noir-cinema", "golden-hour", "midnight-festival", "reel-magazine"] as const;
const JUDGMENT_KEYS: Array<keyof Judgments> = ["acting", "screenplay", "direction", "cinematography", "pacing", "atmosphere"];

export function SettingsForm({ serverDefaults, csrfToken }: { serverDefaults: ServerDefaults; csrfToken: string }) {
  const [taste, setTaste] = React.useState<TasteState>(() => emptyTaste(serverDefaults));
  const [saved, setSaved] = React.useState("");
  const [tasteError, setTasteError] = React.useState("");
  const [dash, setDash] = React.useState<DashboardSettings>(EMPTY_DASHBOARD);
  const [configured, setConfigured] = React.useState<Record<string, boolean>>({});
  const [dashMsg, setDashMsg] = React.useState("");
  const [dashError, setDashError] = React.useState("");

  const setD = (k: keyof DashboardSettings) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setDash((d) => ({ ...d, [k]: e.target.value }));

  // Dashboard-backed settings (DB/file + env fallback). Secrets arrive masked.
  React.useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/settings", { headers: { "x-csrf-token": csrfToken } })
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (cancelled || !json?.values) return;
        const v = json.values as Record<string, string>;
        setDash({
          tmdbApiKey: v["tmdb.api_key"] ?? "",
          omdbApiKey: v["omdb.api_key"] ?? "",
          openrouterApiKey: v["openrouter.api_key"] ?? "",
          openrouterModel: v["openrouter.model"] ?? "",
          openrouterCheapModel: v["openrouter.cheap_model"] ?? "",
          openrouterBaseUrl: v["openrouter.base_url"] ?? "",
          siteUrl: v["site.url"] ?? "",
          siteName: v["site.name"] ?? "",
        });
        setConfigured((json.configured ?? {}) as Record<string, boolean>);
        setTaste((t) => ({
          ...t,
          sitePreset: v["brand.preset"] || t.sitePreset,
          defaultRegion: v["region.default"] || t.defaultRegion,
          seoTitleSuffix: v["seo.title_suffix"] || t.seoTitleSuffix,
          seoAuthor: v["seo.author"] || t.seoAuthor,
          seoDescTemplate: v["seo.desc_template"] || t.seoDescTemplate,
        }));
      })
      .catch(() => { /* offline — local taste cache below still loads */ });
    return () => { cancelled = true; };
  }, [csrfToken]);

  async function saveDashboard(): Promise<boolean> {
    setDashError("");
    setDashMsg("");
    const payload: Record<string, string> = {
      "tmdb.api_key": dash.tmdbApiKey,
      "omdb.api_key": dash.omdbApiKey,
      "openrouter.api_key": dash.openrouterApiKey,
      "openrouter.model": dash.openrouterModel.trim(),
      "openrouter.cheap_model": dash.openrouterCheapModel.trim(),
      "openrouter.base_url": dash.openrouterBaseUrl.trim(),
      "site.url": dash.siteUrl.trim(),
      "site.name": dash.siteName.trim(),
      "brand.preset": taste.sitePreset,
      "region.default": taste.defaultRegion.trim(),
      "seo.title_suffix": taste.seoTitleSuffix,
      "seo.author": taste.seoAuthor,
      "seo.desc_template": taste.seoDescTemplate,
      "taste.profile": JSON.stringify(toTasteProfile(taste)),
    };
    // Omit untouched masked secrets so the server keeps existing values.
    for (const k of ["tmdb.api_key", "omdb.api_key", "openrouter.api_key"]) {
      const v = payload[k] ?? "";
      if (v === "" || v.startsWith("••••")) delete payload[k];
    }
    // Omit empty optionals the server treats as "never set".
    for (const [k, v] of Object.entries({ ...payload })) {
      if (v === "" && !["brand.preset", "region.default"].includes(k)) delete payload[k];
    }
    try {
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        setDashError(json?.error || `Save failed (${res.status}).`);
        return false;
      }
      setDashMsg("Site, APIs & taste saved to dashboard. .env is no longer needed for these.");
      return true;
    } catch {
      setDashError("Could not reach the settings API.");
      return false;
    }
  }

  React.useEffect(() => {
    try {
      const raw = localStorage.getItem("admin_taste");
      if (!raw) return;
      const parsed = JSON.parse(raw) as { taste?: Record<string, unknown>; site?: Partial<TasteState> } & Partial<TasteState>;
      const profile = (parsed.taste ?? parsed) as Record<string, unknown>;
      const site = (parsed.site ?? {}) as Partial<TasteState>;
      const arr = (v: unknown) => Array.isArray(v) ? (v as string[]).join("\n") : "";
      setTaste((t) => ({
        ...t,
        values: arr(profile.values),
        dislikes: arr(profile.dislikes),
        genrePrefs: Object.entries((profile.genrePrefs ?? {}) as Record<string, number>).map(([k, v]) => `${k}:${v}`).join("\n"),
        highRatingTriggers: arr(profile.highRatingTriggers),
        lowRatingTriggers: arr(profile.lowRatingTriggers),
        judgments: { ...t.judgments, ...((profile.judgments ?? {}) as Judgments) },
        tone: (profile.tone as string) ?? t.tone,
        sentenceStyle: (profile.sentenceStyle as string) ?? t.sentenceStyle,
        bannedPhrases: arr(profile.bannedPhrases),
        overusedWords: arr(profile.overusedWords),
        samples: [0, 1, 2].map((i) => {
          const s = ((profile.sampleReviews ?? []) as Array<{ title?: string; rating?: number; text?: string }>)[i];
          return s ? { title: s.title ?? "", rating: s.rating ?? "", text: s.text ?? "" } : { ...BLANK_SAMPLE };
        }) as [Sample, Sample, Sample],
        sitePreset: site.sitePreset ?? t.sitePreset,
        defaultRegion: site.defaultRegion ?? t.defaultRegion,
        seoTitleSuffix: site.seoTitleSuffix ?? t.seoTitleSuffix,
        seoDescTemplate: site.seoDescTemplate ?? t.seoDescTemplate,
        seoAuthor: site.seoAuthor ?? t.seoAuthor,
      }));
    } catch { /* fresh form */ }
  }, []);

  const set = (k: keyof TasteState) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setTaste((t) => ({ ...t, [k]: e.target.value }));
  const setJ = (k: keyof Judgments) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setTaste((t) => ({ ...t, judgments: { ...t.judgments, [k]: e.target.value } }));
  const setSample = (i: number, k: keyof Sample) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setTaste((t) => {
      const samples = [...t.samples] as [Sample, Sample, Sample];
      samples[i] = { ...samples[i]!, [k]: k === "rating" ? (e.target.value === "" ? "" : Number(e.target.value)) : e.target.value };
      return { ...t, samples };
    });

  async function save() {
    setTasteError("");
    const bad = lines(taste.genrePrefs).filter((l) => !/^(.+?)\s*:\s*-?\d+$/.test(l));
    if (bad.length) {
      setTasteError(`Genre prefs must be genre:score lines (e.g. sci-fi:4). Fix: ${bad.slice(0, 2).join("; ")}`);
      return;
    }
    // Dashboard is source of truth; localStorage stays as offline cache.
    const ok = await saveDashboard();
    localStorage.setItem("admin_taste", JSON.stringify({
      taste: toTasteProfile(taste),
      site: {
        sitePreset: taste.sitePreset, defaultRegion: taste.defaultRegion,
        seoTitleSuffix: taste.seoTitleSuffix, seoDescTemplate: taste.seoDescTemplate, seoAuthor: taste.seoAuthor,
      },
    }));
    if (ok) setSaved("Saved to dashboard (DB). .env is no longer needed for these.");
    else setSaved("Saved in this browser only — dashboard save failed, see above.");
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify({ taste: toTasteProfile(taste) }, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "my-taste.json";
    a.click();
  }

  const secretHint = (key: string) =>
    configured[key] ? "Saved in dashboard." : "Not set yet.";

  return (
    <>
      <h1>Settings</h1>
      <p className="muted">Dashboard is the source of truth. .env keeps only system bootstrap (admin login, DB file, session secret).</p>

      <section className="card">
        <h2>APIs — movie data</h2>
        <div className="row">
          <label>TMDB API key (server-only)<input type="password" value={dash.tmdbApiKey} onChange={setD("tmdbApiKey")} placeholder={configured["tmdb.api_key"] ? "•••••••• (saved — leave blank to keep)" : "set at dashboard"} autoComplete="off" /></label>
          <label>OMDb API key — optional (server-only)<input type="password" value={dash.omdbApiKey} onChange={setD("omdbApiKey")} placeholder={configured["omdb.api_key"] ? "•••••••• (saved — leave blank to keep)" : "optional"} autoComplete="off" /></label>
        </div>
        <p className="muted">TMDB: {secretHint("tmdb.api_key")} OMDb: {configured["omdb.api_key"] ? "saved." : "optional."}</p>
      </section>

      <section className="card">
        <h2>APIs — AI writer (OpenRouter, server-only)</h2>
        <div className="row">
          <label>OpenRouter API key<input type="password" value={dash.openrouterApiKey} onChange={setD("openrouterApiKey")} placeholder={configured["openrouter.api_key"] ? "•••••••• (saved — leave blank to keep)" : "sk-or-…"} autoComplete="off" /></label>
          <label>Base URL<input value={dash.openrouterBaseUrl} onChange={setD("openrouterBaseUrl")} placeholder="https://openrouter.ai/api/v1" /></label>
        </div>
        <div className="row">
          <label>Primary model (draft / voice)<input value={dash.openrouterModel} onChange={setD("openrouterModel")} placeholder="anthropic/claude-sonnet-4" /></label>
          <label>Cheap model (metadata / SEO)<input value={dash.openrouterCheapModel} onChange={setD("openrouterCheapModel")} placeholder="anthropic/claude-haiku-4" /></label>
        </div>
        <p className="muted">OpenRouter: {secretHint("openrouter.api_key")}</p>
      </section>

      <section className="card">
        <h2>Site & brand</h2>
        <div className="row">
          <label>Site name<input value={dash.siteName} onChange={setD("siteName")} placeholder="The Long Take" /></label>
          <label>Site URL<input value={dash.siteUrl} onChange={setD("siteUrl")} placeholder="https://reviews.example.com" inputMode="url" /></label>
        </div>
      </section>

      <h1>My Taste</h1>
      <p className="muted">Your voice drives every generated draft. Three sample reviews matter more than any slider.</p>

      <section className="card">
        <h2>Values & dislikes</h2>
        <div className="row">
          <label>Values — what you reward (one per line)<textarea value={taste.values} onChange={set("values")} rows={4} placeholder={"practical craft over CGI\nearned endings"} /></label>
          <label>Dislikes (one per line)<textarea value={taste.dislikes} onChange={set("dislikes")} rows={4} placeholder={"quippy exposition\nthird-act CGI battles"} /></label>
        </div>
        <label>Genre prefs — lines like sci-fi:4, horror:-2 (-5..+5)<textarea value={taste.genrePrefs} onChange={set("genrePrefs")} rows={3} /></label>
        {tasteError && <p className="error">{tasteError}</p>}
        <div className="row">
          <label>What earns 8+ (one per line)<textarea value={taste.highRatingTriggers} onChange={set("highRatingTriggers")} rows={3} /></label>
          <label>What drags to ≤4 (one per line)<textarea value={taste.lowRatingTriggers} onChange={set("lowRatingTriggers")} rows={3} /></label>
        </div>
      </section>

      <section className="card">
        <h2>Per-category judgments</h2>
        <div className="row">
          {JUDGMENT_KEYS.map((k) => (
            <label key={k}>{k}<input value={taste.judgments[k]} onChange={setJ(k)} placeholder={`Your ${k} lens…`} /></label>
          ))}
        </div>
        <div className="row">
          <label>Tone<input value={taste.tone} onChange={set("tone")} /></label>
          <label>Sentence style<input value={taste.sentenceStyle} onChange={set("sentenceStyle")} /></label>
        </div>
        <div className="row">
          <label>Banned phrases (one per line)<textarea value={taste.bannedPhrases} onChange={set("bannedPhrases")} rows={4} /></label>
          <label>Overused words (one per line)<textarea value={taste.overusedWords} onChange={set("overusedWords")} rows={4} /></label>
        </div>
      </section>

      <section className="card">
        <h2>Sample reviews (your actual writing)</h2>
        {taste.samples.map((s, i) => (
          <div key={i} className="sample">
            <div className="row">
              <label>Sample {i + 1} — title<input value={s.title} onChange={setSample(i, "title")} /></label>
              <label>Sample {i + 1} — your rating (0–10)<input type="number" min={0} max={10} step={0.5} value={s.rating} onChange={setSample(i, "rating")} /></label>
            </div>
            <label>Sample {i + 1} — body<textarea value={s.text} onChange={setSample(i, "text")} rows={5} /></label>
          </div>
        ))}
      </section>

      <section className="card">
        <h2>Site, region & SEO defaults</h2>
        <div className="row">
          <label>Site / brand preset
            <select value={taste.sitePreset} onChange={set("sitePreset")}>
              {PRESETS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
          <label>Default region<input value={taste.defaultRegion} onChange={set("defaultRegion")} placeholder="US" /></label>
        </div>
        <div className="row">
          <label>SEO title suffix<input value={taste.seoTitleSuffix} onChange={set("seoTitleSuffix")} /></label>
          <label>Default author<input value={taste.seoAuthor} onChange={set("seoAuthor")} /></label>
        </div>
        <label>Meta description template<textarea value={taste.seoDescTemplate} onChange={set("seoDescTemplate")} rows={2} /></label>
        <div className="toolbar">
          <button type="button" className="btn primary" onClick={save}>Save all settings</button>
          <button type="button" className="btn ghost" onClick={exportJson}>Export taste JSON</button>
        </div>
        {dashError && <p className="error" role="alert">{dashError}</p>}
        {dashMsg && <p className="ok" role="status">{dashMsg}</p>}
        {saved && <p className="ok" role="status">{saved}</p>}
      </section>
    </>
  );
}
