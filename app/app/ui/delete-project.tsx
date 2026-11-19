"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { DELETE_WORD, deleteConfirmed, type Project } from "../../lib/projects";
import { deleteProject } from "../../lib/project-delete";
import { Button, Modal } from "./shared";

/**
 * Asks before a project is deleted (Danial, 19 Nov: "ask to confirm before i delete like ask the user to write "delete"
 * to delete"): it says what goes, for whom, and that it can't be undone, and deletes only once "delete" is typed.
 */
export function DeleteProjectModal({ project, by, onClose, onDeleted }: { project: Project; by: string; onClose: () => void; onDeleted: (project: Project) => void }) {
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const confirmed = deleteConfirmed(typed);
  async function remove() {
    if (!confirmed || busy) return;
    setBusy(true); setError("");
    try { await deleteProject(project, by); onDeleted(project); }
    catch (e) { setError(e instanceof Error ? e.message : "The project couldn't be deleted."); setBusy(false); }
  }
  return <Modal title={`Delete ${project.name}?`} subtitle="This can't be undone." onClose={() => { if (!busy) onClose(); }}>
    <form className="delete-project" onSubmit={e => { e.preventDefault(); void remove(); }}>
      <p>Deleting the project removes it for everyone on the team, completely: its scopes and bid forms, bid packages, invitations, budget, schedule, Drawing Flip and every other saved page; its files, their text and the AI's readings; subcontractors' uploaded bids and clarification requests. A drawing set or manual another project also uses stays with that project.</p>
      <label className="ui-field"><span>Type <strong>{DELETE_WORD}</strong> to confirm</span>
        <input value={typed} onChange={e => setTyped(e.target.value)} autoComplete="off" spellCheck={false} disabled={busy} aria-describedby="delete-project-help" placeholder={DELETE_WORD}/>
      </label>
      <small id="delete-project-help">The Delete button turns on once the word is typed.</small>
      {error && <p role="alert" className="delete-project-error">{error}</p>}
      <div className="proc-form-actions"><Button onClick={onClose} disabled={busy}>Cancel</Button><Button type="submit" variant="danger" disabled={!confirmed || busy}><Trash2 size={15}/>{busy ? "Deleting…" : "Delete project"}</Button></div>
    </form>
  </Modal>;
}
