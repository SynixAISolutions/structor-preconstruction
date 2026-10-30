"use client";

import { Upload } from "lucide-react";
import { uploadProgressText, useUploads } from "../../lib/project-files-client";
import "./ai-run-card.css";

/**
 * Uploads going on in the background (Danial, 28 Oct: "it should let me close the popup window ... continue upload
 * in bg and should show banner"): a card at the bottom of every page, above the AI run card, until each file is stored.
 */
export function UploadBanner({ onOpenFiles }: { onOpenFiles: () => void }) {
  const uploads = useUploads();
  if (!uploads.length) return null;
  const now = uploads[0];
  const percent = now.progress ? Math.round((now.progress.done / Math.max(1, now.progress.total)) * 100) : 0;
  return <section className="ai-run-card upload-banner" role="status" aria-live="polite" aria-label="Files uploading">
    <span className="ai-run-icon"><Upload size={16}/></span>
    <div className="ai-run-copy">
      <strong>Uploading {uploads.length === 1 ? now.name : `${uploads.length} files`}</strong>
      <small>{uploads.map(u => `${uploads.length > 1 ? `${u.name}: ` : ""}${u.progress ? uploadProgressText(u.progress) : "Starting…"}`).join(" · ")}</small>
      <span className="ai-run-bar" aria-hidden><i style={{ width: `${Math.max(4, percent)}%` }}/></span>
      <small className="ai-run-keep">Keep this tab open until it finishes. <button type="button" className="upload-banner-link" onClick={onOpenFiles}>Open Project files</button></small>
    </div>
  </section>;
}
