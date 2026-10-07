import React from "react";

export const GENERATION_STAGES = [
  "Fetching movie",
  "Researching context",
  "Writing draft",
  "Fact-check + SEO",
  "Humanizing",
  "Draft ready",
] as const;

/** Staged progress for GENERATE REVIEW (Fetching… Researching… Writing… etc). */
export function StageProgress({ active, done }: { active: number; done: boolean }) {
  return (
    <ol className="stages" aria-live="polite">
      {GENERATION_STAGES.map((s, i) => {
        const cls = done || i < active ? "stage done" : i === active ? "stage active" : "stage";
        return (
          <li key={s} className={cls}>
            <span className="stage-dot" aria-hidden />
            {s}{i === active && !done ? "…" : ""}
          </li>
        );
      })}
    </ol>
  );
}
