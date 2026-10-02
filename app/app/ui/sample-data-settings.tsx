"use client";

import { useState } from "react";
import { ArchiveRestore, Download, RefreshCw, Trash2 } from "lucide-react";
import { SAMPLE_CHANGES } from "../../lib/sample-refresh";
import { downloadText } from "../../lib/format";
import type { useSampleRefresh } from "../../lib/use-sample-refresh";
import { Badge, Button, Empty, Modal, Panel } from "./shared";
import "./sample-data-settings.css";

type Refresh = ReturnType<typeof useSampleRefresh>;

export function SampleRefreshBanner({ refresh }: { refresh: Refresh }) {
  const [error, setError] = useState("");
  if (!refresh.status?.needsChoice) return null;
  return <section className="sample-refresh-banner" aria-label="Updated Jelleff sample">
    <div><strong>The Jelleff sample was updated.</strong><p>{SAMPLE_CHANGES} You can load it now; your saved Jelleff data will be backed up first, ready to restore or download in Settings.</p>{error && <p className="sample-data-error" role="alert">{error}</p>}</div>
    <div className="sample-refresh-actions"><Button variant="primary" onClick={() => setError(refresh.loadUpdatedSample() ?? "")}>Load updated sample</Button><Button onClick={() => setError(refresh.keepMyData() ?? "")}>Keep my data</Button></div>
  </section>;
}

export function SampleDataSettings({ refresh }: { refresh: Refresh }) {
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState<{ kind: "load" | "restore" | "delete"; key?: string } | null>(null);
  const status = refresh.status;
  const selected = refresh.backups.find(item => item.key === confirm?.key);
  function perform() {
    if (!confirm) return;
    const message = confirm.kind === "load" ? refresh.loadUpdatedSample() : confirm.kind === "restore" ? refresh.restore(confirm.key!) : refresh.remove(confirm.key!);
    setError(message ?? "");
    if (!message) setConfirm(null);
  }
  function download(key: string) {
    const file = refresh.file(key);
    if (!file) { setError("This backup is no longer available."); return; }
    downloadText(file.name, file.text, "application/json");
    setError("");
  }
  return <div className="sample-data-settings">
    <Panel title="Jelleff sample data" subtitle="Only the Jelleff demo in this browser is affected. Other projects and shared directory details stay as they are.">
      <div className="sample-data-intro"><div><small>Current sample</small><strong>{status?.current ?? "Unavailable"}</strong><p>{SAMPLE_CHANGES}</p><small>{status ? `${status.savedKeys.length} saved Jelleff section${status.savedKeys.length === 1 ? "" : "s"} in this browser` : "Browser storage is unavailable"}</small></div><Button variant="primary" disabled={!status} onClick={() => { setError(""); setConfirm({ kind: "load" }); }}><RefreshCw size={15}/>Load updated sample</Button></div>
    </Panel>
    <Panel title="Saved backups" subtitle="Loading a sample or restoring a backup keeps another copy of the data it replaces.">
      {!refresh.backups.length ? <Empty title="No backups yet" description="A backup appears here when you choose to load a newer Jelleff sample."/> : <div className="sample-backup-list">{refresh.backups.map(item => <article key={item.key}><span><strong>{item.at ? item.at.replace("T", " ").slice(0, 19) : "Undated backup"}</strong><small>{item.keys.length} saved section{item.keys.length === 1 ? "" : "s"} · {Math.ceil(item.bytes / 1024)} KB · Sample {item.version ?? "before versioning"}</small></span><div><Button onClick={() => { setError(""); setConfirm({ kind: "restore", key: item.key }); }}><ArchiveRestore size={14}/>Restore</Button><Button onClick={() => download(item.key)}><Download size={14}/>Download</Button><Button onClick={() => { setError(""); setConfirm({ kind: "delete", key: item.key }); }}><Trash2 size={14}/>Delete</Button></div></article>)}</div>}
    </Panel>
    {error && <p className="sample-data-error" role="alert">{error}</p>}
    {confirm && <Modal title={confirm.kind === "delete" ? "Delete this backup?" : confirm.kind === "restore" ? "Restore this Jelleff backup?" : "Load the updated Jelleff sample?"} onClose={() => setConfirm(null)}>
      <div className="sample-confirm"><p>{confirm.kind === "delete" ? "This backup will be removed from this browser. Download it first if you want to keep a separate copy." : confirm.kind === "restore" ? `Your current Jelleff data will be backed up first, then ${selected?.keys.length ?? 0} saved sections from this backup will be restored. The page will reload.` : "Your current Jelleff data will be backed up first. The page will reload with the latest sample; you can restore or download the backup here later."}</p>{error && <p className="sample-data-error" role="alert">{error}</p>}<div><Button onClick={() => setConfirm(null)}>Cancel</Button><Button variant={confirm.kind === "delete" ? "secondary" : "primary"} onClick={perform}>{confirm.kind === "delete" ? "Delete backup" : confirm.kind === "restore" ? "Restore backup" : "Load updated sample"}</Button></div></div>
    </Modal>}
  </div>;
}
