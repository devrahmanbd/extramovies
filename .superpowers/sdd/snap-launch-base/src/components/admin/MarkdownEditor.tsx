import React from "react";
import { renderMarkdown } from "./markdown";

interface Props {
  value: string;
  onChange: (v: string) => void;
  previewDefault?: boolean;
}

/** Textarea + live preview. Split on desktop, stacked on mobile (see admin.css). */
export function MarkdownEditor({ value, onChange, previewDefault = true }: Props) {
  const [showPreview, setShowPreview] = React.useState(previewDefault);
  const html = React.useMemo(() => renderMarkdown(value), [value]);

  return (
    <div className="md-editor">
      <div className="md-editor-bar">
        <span className="md-editor-hint">Markdown: # heading, **bold**, *italic*, [link](url), ![alt](src), - list, &gt; quote, --- hr</span>
        <label className="md-toggle">
          <input type="checkbox" checked={showPreview} onChange={(e) => setShowPreview(e.target.checked)} />
          Preview
        </label>
      </div>
      <div className={`md-editor-grid${showPreview ? "" : " no-preview"}`}>
        <textarea
          className="md-input"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={"# Movie Title (Year) — Review\n\nYour opening verdict in the first 2 sentences…\n\n## What works\n\n- …\n\n> A memorable line…\n\n---\n"}
          rows={22}
          aria-label="Review markdown"
        />
        {showPreview && (
          <div className="md-preview" aria-label="Live preview" dangerouslySetInnerHTML={{ __html: html }} />
        )}
      </div>
    </div>
  );
}
