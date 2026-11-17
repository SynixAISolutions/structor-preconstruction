"use client";

import { AlertTriangle, CheckCircle2, Upload, X } from "lucide-react";
import { uploadProgressText, useUploads } from "../../lib/project-files-client";
import { dismissUploadNotice, requestUploadCheck, uploadNoticeText, useUploadNotices } from "../../lib/upload-notices";
import "./ai-run-card.css";

/**
 * Uploads going on in the background (Danial, 28 Oct: "it should let me close the popup window ... continue upload
 * in bg and should show banner"): a card at the bottom of every page, above the AI run card, until each file is stored.
 * When an upload ends, a notice says so on whatever screen is open (Marcel's feedback log, 7 Nov: "tell us when it is
 * complete so that I can continue to use the software"), with the sheet-number review one click away.
 */
export function UploadBanner({ onOpenFiles }: { onOpenFiles: (projectId?: string) => void }) {
  const uploads = useUploads();
  const notices = useUploadNotices();
  if (!uploads.length && !notices.length) return null;
  const now = uploads[0];
  const percent = now?.progress ? Math.round((now.progress.done / Math.max(1, now.progress.total)) * 100) : 0;
  return <>
    {notices.map(n => <section key={n.id} className={`ai-run-card upload-notice${n.failed.length ? " failed" : ""}`} role="status" aria-live="polite" aria-label="Upload finished">
      <span className="ai-run-icon">{n.failed.length ? <AlertTriangle size={16}/> : <CheckCircle2 size={16}/>}</span>
      <div className="ai-run-copy">
        <strong>{n.failed.length ? n.stored.length ? "Upload finished, with a problem" : "Upload didn't finish" : "Upload finished"}</strong>
        <small>{uploadNoticeText(n)}</small>
        <small className="ai-run-keep">
          {n.checkIds.length > 0 && <><button type="button" className="upload-banner-link" onClick={() => { requestUploadCheck(n.projectId, n.checkIds); onOpenFiles(n.projectId); dismissUploadNotice(n.id); }}>Review sheet numbers</button>{" · "}</>}
          <button type="button" className="upload-banner-link" onClick={() => { onOpenFiles(n.projectId); dismissUploadNotice(n.id); }}>Open Project files</button>
        </small>
      </div>
      <button type="button" className="upload-notice-close" aria-label="Dismiss" onClick={() => dismissUploadNotice(n.id)}><X size={14}/></button>
    </section>)}
    {now && <section className="ai-run-card upload-banner" role="status" aria-live="polite" aria-label="Files uploading">
      <span className="ai-run-icon"><Upload size={16}/></span>
      <div className="ai-run-copy">
        <strong>Uploading {uploads.length === 1 ? now.name : `${uploads.length} files`}</strong>
        <small>{uploads.map(u => `${uploads.length > 1 ? `${u.name}: ` : ""}${u.progress ? uploadProgressText(u.progress) : "Starting…"}`).join(" · ")}</small>
        <span className="ai-run-bar" aria-hidden><i style={{ width: `${Math.max(4, percent)}%` }}/></span>
        <small className="ai-run-keep">You can keep working while it uploads; we'll tell you when it's done. Keep this browser tab open. <button type="button" className="upload-banner-link" onClick={() => onOpenFiles()}>Open Project files</button></small>
      </div>
    </section>}
  </>;
}
