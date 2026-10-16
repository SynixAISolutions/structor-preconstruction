import type { SubmittalState } from "./submittals";
/** Only revisions actually sent to this architect appear, never contractor drafts or private reviews. */
export function architectSubmittals(state: SubmittalState, email: string) {
  if (!email.trim()) return [];
  return state.submittals.flatMap(s => {
    const revisions = s.revisions.filter(r => r.sent?.to.email.toLowerCase() === email.toLowerCase());
    const latest = revisions.at(-1);
    return latest ? [{ id:s.id, number:s.number, title:s.title, specSection:s.specSection, due:latest.sent!.due, revisions, latest, reviewable:s.status === "with-architect" && s.revisions.at(-1)?.number === latest.number && !latest.response }] : [];
  });
}
