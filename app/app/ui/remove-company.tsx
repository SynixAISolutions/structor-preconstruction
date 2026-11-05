"use client";

import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { Trash2 } from "lucide-react";
import type { BidMessage } from "../../lib/bid-portal";
import type { Bidder } from "../../lib/data/commercial";
import type { BidProvenance } from "../../lib/leveling-import";
import type { SavedTradeComparison } from "../../lib/leveling-sync";
import type { Invitation, Procurement } from "../../lib/procurement";
import { removalBlocker, removeInvitation, withoutBid, withoutComparisonBid, withoutProvenance, withoutThread } from "../../lib/remove-company";
import { projectsUsingCompany } from "../../lib/remove-company-client";
import type { Submission } from "../../lib/submissions";
import { useAward } from "../../lib/use-award";
import { useLocalDraft } from "../../lib/use-local-draft";
import { Button, Modal } from "./shared";
import "./procurement.css";

/**
 * Takes an invited company off a trade, with its bid and messages. The caller passes the setters its own screen reads
 * from, so the screen updates straight away. Removing the invitation is also what shuts the company's private link.
 */
export function RemoveInvitationDialog({ invitation, company, trade, submissions, runProcurement, runSubmissions, setMessages, notify, onClose }: {
  invitation: Invitation; company: string; trade: string; submissions: Submission[];
  runProcurement: (action: (current: Procurement) => Procurement) => unknown;
  runSubmissions: (action: (current: Submission[]) => Submission[]) => unknown;
  setMessages: Dispatch<SetStateAction<BidMessage[]>>;
  notify: (message: string) => void; onClose: () => void;
}) {
  const { state: awards } = useAward();
  const [comparisons, setComparisons] = useLocalDraft<Record<string, SavedTradeComparison>>("leveling-trades", {});
  const [provenance, setProvenance] = useLocalDraft<Record<string, BidProvenance>>("leveling-submission-provenance", {});
  const bid = submissions.find(s => s.invitationId === invitation.id);
  const versions = bid?.revisions.length ?? 0;
  const blocker = removalBlocker(invitation, awards.awards);

  function remove() {
    if (bid) {
      const nextComparisons = withoutComparisonBid(comparisons, invitation.packageId, bid.id);
      if (nextComparisons !== comparisons) setComparisons(nextComparisons);
      const nextProvenance = withoutProvenance(provenance, bid.id);
      if (nextProvenance !== provenance) setProvenance(nextProvenance);
    }
    runSubmissions(current => withoutBid(current, invitation.id));
    setMessages(current => withoutThread(current, invitation.id));
    runProcurement(current => removeInvitation(current, invitation.id));
    notify(`${company} removed from ${trade}.`);
    onClose();
  }

  return <Modal title={`Remove ${company}?`} subtitle={trade} onClose={onClose}>
    {blocker
      ? <><p className="proc-modal-note" role="alert">{blocker}</p><div className="proc-form-actions"><Button onClick={onClose}>Close</Button></div></>
      : <><p className="proc-modal-note">This takes {company} off {trade}{versions ? `, and deletes its bid (${versions === 1 ? "1 version" : `${versions} versions`})` : ""}, its messages and its notes. Its private link stops working. This can&apos;t be undone.</p>
        <div className="proc-form-actions"><Button onClick={onClose}>Cancel</Button><Button variant="danger" onClick={remove}><Trash2 size={14}/>Remove company</Button></div></>}
  </Modal>;
}

/** Takes a company out of the directory, once no project still invites it. */
export function RemoveCompanyDialog({ company, onRemove, onClose }: { company: Bidder; onRemove: () => void; onClose: () => void }) {
  const [usedOn, setUsedOn] = useState<string[] | null>(null);
  useEffect(() => {
    let live = true;
    void projectsUsingCompany(company.id).then(names => { if (live) setUsedOn(names); });
    return () => { live = false; };
  }, [company.id]);
  return <Modal title={`Remove ${company.company}?`} subtitle="Company directory" onClose={onClose}>
    {usedOn === null && <p className="proc-modal-note" role="status">Checking your projects…</p>}
    {usedOn?.length
      ? <><p className="proc-modal-note" role="alert">{company.company} is still invited on {usedOn.join(", ")}. Open Bid packages there and remove it from the Invitations tab first.</p><div className="proc-form-actions"><Button onClick={onClose}>Close</Button></div></>
      : usedOn && <><p className="proc-modal-note">This takes {company.company} out of your team&apos;s directory. This can&apos;t be undone.</p>
        <div className="proc-form-actions"><Button onClick={onClose}>Cancel</Button><Button variant="danger" onClick={onRemove}><Trash2 size={14}/>Remove company</Button></div></>}
  </Modal>;
}
