import type { Procurement, DirectoryCompany } from "../../lib/procurement";
import type { Submission } from "../../lib/submissions";
import { displayDate, usd } from "../../lib/format";
import { Button, Modal } from "./shared";
import "./workflow-features.css";

type BidListProps = { procurement: Procurement; submissions: Submission[]; directory: DirectoryCompany[]; onReview: (packageId: string, bidderId: string) => void };
export function PortalBidList({ procurement, submissions, directory, onReview }: BidListProps) {
  const bids = submissions.filter(s => s.revisions.length && procurement.invitations.some(i => i.id === s.invitationId && i.packageId === s.packageId && i.bidderId === s.bidderId));
  return <>
    {!bids.length && <p>No submitted bids yet. Submit a bid from Preview as subcontractor to compare it here.</p>}
    <div className="ui-table-wrap portal-bid-inbox"><table className="ui-table"><thead><tr><th>Trade / company</th><th>Base bid</th><th>Revision</th><th>Scope exceptions</th><th/></tr></thead><tbody>{bids.map(s => {
      const revision = s.revisions.at(-1)!, pkg = procurement.packages.find(p => p.id === s.packageId), stale = revision.formVersion !== pkg?.published?.version;
      return <tr key={s.id}><td><strong>{directory.find(b => b.id === s.bidderId)?.company ?? s.bidderId}</strong><small>{pkg?.name}{s.illustrative ? " · Illustrative sample bid" : ""}</small></td><td>{revision.baseBid === null ? "Unpriced" : usd(revision.baseBid)}</td><td>V{revision.number}<small>{displayDate(revision.submittedAt.slice(0, 10))}{stale ? " · Older bid form" : ""}</small></td><td>{revision.responses.filter(r => r.answer !== "Y").length}</td><td><Button onClick={() => onReview(s.packageId, `submission-${s.id}`)}>Review in leveling</Button></td></tr>;
    })}</tbody></table></div>
  </>;
}
export function PortalBidInbox({ onEmail, onClose, ...props }: BidListProps & { onEmail: () => void; onClose: () => void }) {
  return <Modal title="Proposal inbox" subtitle="Submitted portal bids. Drafts stay with the subcontractor until submitted." wide onClose={onClose}>
    <PortalBidList {...props}/>
    <div className="proc-form-actions"><Button onClick={onEmail}>Open optional email inbox</Button><Button onClick={onClose}>Close</Button></div>
  </Modal>;
}
