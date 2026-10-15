"use client";
import { useEffect, useState } from "react";
import { Check, Pencil, Plus, Trash2 } from "lucide-react";
import { addGeneralScopes, parseGeneralScopes, type GeneralScope } from "../../lib/scope-review";
import { approveScope, reopenScope, type ScopeItem } from "../../lib/procurement";
import type { useExtraction } from "../../lib/use-extraction";
import { Badge, Button, Empty, Panel } from "./shared";

export function GeneralScopes({ review, by, notify, onEdit, onAdd }: {
  review: ReturnType<typeof useExtraction>; by: string; notify: (text: string) => void; onEdit: (item: ScopeItem) => void; onAdd: () => void;
}) {
  const [standard, setStandard] = useState<GeneralScope[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError("");
    void fetch("/api/general-scopes", { signal: controller.signal }).then(async response => {
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Standard scopes could not be loaded.");
      setStandard(parseGeneralScopes(result.items));
    }).catch(problem => { if (!controller.signal.aborted) setError(problem.message || "Standard scopes could not be loaded."); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [attempt]);
  const items = review.procurement.scopes.filter(item => item.allTrades);
  return <Panel className="proc-general-panel" title="General" subtitle="Common requirements carried once in every trade's bid form." action={<Button onClick={onAdd}><Plus size={14}/>Add general item</Button>}>
    <div className="proc-general-intro"><p>Standard requirements from the supplied bid forms. Review them for this project before publishing.</p><Button variant="primary" disabled={loading || !standard.length} onClick={() => notify(review.runProcurement(s => addGeneralScopes(s,standard,by)) || "Standard scope items added to every trade for review.")}>{loading ? "Loading standard items…" : "Add standard items to every trade"}</Button>{error && <p className="proc-source-error" role="alert">{error} <button type="button" onClick={() => setAttempt(n => n+1)}>Retry</button></p>}
      {!items.length && !loading && standard.length > 0 && <details><summary>Preview {standard.length} standard items</summary><ul>{standard.map(item => <li key={item.id}>{item.title}<small>{item.source}</small></li>)}</ul></details>}
    </div>
    {items.map(item => <article className="proc-scope-row" key={item.id}><button className={`proc-approval ${item.status}`} aria-label={`${item.status === "approved" ? "Reopen" : "Approve"} ${item.title}`} onClick={() => notify(review.runProcurement(s => item.status === "approved" ? reopenScope(s,item.id,by) : approveScope(s,item.id,by)) || "General item reviewed for all trades.")}>{item.status === "approved" ? <Check size={14}/> : <span/>}</button><div className="proc-scope-copy"><Badge tone="blue">Every trade</Badge><strong>{item.title}</strong><small>{item.source}</small></div><button className="ui-icon-btn" aria-label={`Edit ${item.title}`} onClick={() => onEdit(item)}><Pencil size={15}/></button><button className="ui-icon-btn" aria-label={`Delete ${item.title} from every trade`} onClick={() => notify(review.removeScope(item.id,by) || "General item removed from every trade.")}><Trash2 size={15}/></button></article>)}
    {!items.length && <Empty title="No general items added yet" description="Use the standard list or add your own requirement."/>}
  </Panel>;
}
