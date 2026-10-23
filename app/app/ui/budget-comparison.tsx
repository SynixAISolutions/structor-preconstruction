"use client";
import { useState } from "react";
import { budgetLinesForTrade } from "../../lib/estimate";
import { inHouseFromLowestSub, lowestSubLineValue, setLowestSubSplit, type LowBid } from "../../lib/budget-comparison";
import { editBudgetLine, parseAmount, type BudgetLine } from "../../lib/budget";
import type { useBudget } from "../../lib/use-budget";
import type { TradePackage } from "../../lib/procurement";
import { Badge, Button, Modal, usd } from "./shared";

export function InHouseBudgetEditor({line,budget,pkg,low,notify,onClose}:{line:BudgetLine;budget:ReturnType<typeof useBudget>;pkg:TradePackage|null;low:LowBid|null;notify:(text:string)=>void;onClose:()=>void}){
 const [value,setValue]=useState(String(line.budget));const [error,setError]=useState('');
 function apply(pull=false){
  const number=parseAmount(value);
  if(!pull&&number===null){setError('Enter a valid dollar amount.');return;}
  const errors=budget.run(s=>pull&&pkg&&low?inHouseFromLowestSub(s,line.id,pkg,low,'Marcel Khoury'):editBudgetLine(s,line.id,{budget:number!},'Marcel Khoury'));
  if(errors)setError(Object.values(errors).join(' '));else{notify(pull?'In-house budget pulled from lowest sub.':'In-house budget saved.');onClose();}
 }
 return <Modal title="Set in-house budget" subtitle={line.description} onClose={onClose}><form onSubmit={e=>{e.preventDefault();apply();}}><label className="ui-field">In-house budget · USD<input required inputMode="decimal" value={value} onChange={e=>setValue(e.target.value)}/></label><p>Type the amount, or pull the lowest subcontractor price.</p><Button disabled={!pkg||!low} onClick={()=>apply(true)}>Pull lowest sub</Button>{low&&<p>{low.name} · {usd(low.value)}</p>}{!low&&<p>No current bid for this line.</p>}{error&&<p role="alert" className="cm-form-error">{error}</p>}<div className="cm-form-footer"><Button onClick={onClose}>Cancel</Button><Button type="submit" variant="primary">Save in-house budget</Button></div></form></Modal>;
}

export function LowBidCell({bid,budget,pkg,lineId,onSplit}:{bid:LowBid|null;budget:ReturnType<typeof useBudget>['state'];pkg:TradePackage|null;lineId:string;onSplit:(pkg:TradePackage,bid:LowBid)=>void}){
 if(!pkg)return <>—<small className="cm-cell-note">No unique trade match</small></>;
 if(!bid)return <>No current bid</>;
 const value=lowestSubLineValue(budget,pkg,lineId,bid.value);
 return <>{value===null?<button className="cm-text-button" onClick={()=>onSplit(pkg,bid)}>Allocate {usd(bid.value)} trade bid</button>:<strong>{usd(value)}</strong>}<small className="cm-cell-note">{bid.name}</small><Badge tone={bid.basis==='reviewed'?'green':'amber'}>{bid.basis==='reviewed'?'Reviewed bidders':'Base bid · Needs leveling'}</Badge>{budgetLinesForTrade(budget,pkg).lines.length>1&&value!==null&&<button className="cm-text-button" onClick={()=>onSplit(pkg,bid)}>Cost-center split</button>}</>;
}

export function LowBidSplitEditor({budget,pkg,bid,onClose,notify}:{budget:ReturnType<typeof useBudget>;pkg:TradePackage;bid:LowBid;onClose:()=>void;notify:(text:string)=>void}){
 const lines=budgetLinesForTrade(budget.state,pkg).lines;
 const [values,setValues]=useState<Record<string,string>>(Object.fromEntries(lines.map(l=>[l.id,String(lowestSubLineValue(budget.state,pkg,l.id,bid.value)??'')])));
 const [error,setError]=useState('');
 return <Modal title="Allocate lowest subcontractor bid" subtitle={`${pkg.name} · ${bid.name} · ${usd(bid.value)}`} onClose={onClose}><p>Enter the share for each cost center. These shares will also split later changes to the lowest trade price.</p><form onSubmit={e=>{e.preventDefault();const amounts=Object.fromEntries(Object.entries(values).map(([id,v])=>[id,parseAmount(v)??NaN]));const errors=budget.run(s=>setLowestSubSplit(s,pkg,amounts,bid.value));if(errors)setError(Object.values(errors).join(' '));else{notify('Trade price allocated without double-counting.');onClose();}}}>{lines.map(l=><label className="ui-field" key={l.id}>{l.description} · {l.costCenter}<input required inputMode="decimal" value={values[l.id]} onChange={e=>setValues({...values,[l.id]:e.target.value})}/></label>)}{error&&<p role="alert" className="cm-form-error">{error}</p>}<div className="cm-form-footer"><Button onClick={onClose}>Cancel</Button><Button type="submit" variant="primary">Save allocation</Button></div></form></Modal>;
}
