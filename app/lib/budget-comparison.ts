import { BudgetRuleError, editBudgetLine, type BudgetLine, type BudgetState, type LevelingCandidate } from "./budget";
import { budgetLinesForTrade, type TradeEstimate } from "./estimate";
import type { Procurement, TradePackage } from "./procurement";
import { latestRevision, type Submission } from "./submissions";

export type LowBid = { packageId: string; bidderId: string | null; submissionId: string | null; name: string; value: number; basis: "reviewed" | "base" };
const cents=(value:number)=>Math.round(value*100);
const validMoney=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=1e12&&Math.abs(value*100-Math.round(value*100))<1e-6;

/** Compare reviewed totals together; otherwise show the lowest current submitted base, clearly unreviewed. */
export function lowestTradeBid(procurement:Procurement,submissions:Submission[],packageId:string,candidates:LevelingCandidate[],directory:{id:string;company:string}[]):LowBid|null {
 const pkg=procurement.packages.find(p=>p.id===packageId);
 if(!pkg?.published)return null;
 const current=submissions.filter(s=>s.packageId===packageId&&s.status!=='draft'&&latestRevision(s)?.formVersion===pkg.published!.version&&procurement.invitations.some(i=>i.id===s.invitationId&&i.packageId===packageId&&i.bidderId===s.bidderId&&i.status!=='declined'));
 const reviewed=candidates.filter(c=>c.packageId===packageId&&!c.stale&&c.eligible&&validMoney(c.reviewedTotal)&&(!c.submissionId||current.some(s=>s.id===c.submissionId&&latestRevision(s)?.number===c.revisionNumber))).sort((a,b)=>a.reviewedTotal!-b.reviewedTotal!)[0];
 if(reviewed)return {packageId,bidderId:reviewed.bidderId,submissionId:reviewed.submissionId,name:reviewed.bidderName,value:reviewed.reviewedTotal!,basis:'reviewed'};
 const lowest=current.filter(s=>validMoney(latestRevision(s)?.baseBid)).sort((a,b)=>latestRevision(a)!.baseBid!-latestRevision(b)!.baseBid!)[0];
 return lowest?{packageId,bidderId:lowest.bidderId,submissionId:lowest.id,name:directory.find(d=>d.id===lowest.bidderId)?.company||lowest.bidderId,value:latestRevision(lowest)!.baseBid!,basis:'base'}:null;
}

export function tradeForBudgetLine(budget:BudgetState,procurement:Procurement,line:BudgetLine):TradePackage|null {
 if(line.byOwner||line.classification!=='direct')return null;
 const matches=procurement.packages.filter(p=>budgetLinesForTrade(budget,p).lines.some(l=>l.id===line.id));
 return matches.length===1?matches[0]:null;
}

/** Shares are explicitly entered by the estimator; no inferred cost-center split. */
export function setLowestSubSplit(budget:BudgetState,pkg:TradePackage,amounts:Record<string,number>,bid:number):BudgetState {
 const lines=budgetLinesForTrade(budget,pkg).lines;
 const values=lines.map(l=>amounts[l.id]);
 if(!validMoney(bid)||!lines.length||values.some(v=>!validMoney(v))||Object.keys(amounts).length!==lines.length||values.reduce((s,v)=>s+cents(v),0)!==cents(bid))throw new BudgetRuleError({line:'Split the entire trade bid between these cost lines. The amounts must equal the trade total.'});
 return {...budget,lowestSubSplits:{...budget.lowestSubSplits,[pkg.id]:Object.fromEntries(lines.map(l=>[l.id,cents(amounts[l.id])]))}};
}

export function lowestSubLineValue(budget:BudgetState,pkg:TradePackage,lineId:string,tradeValue:number):number|null {
 const lines=budgetLinesForTrade(budget,pkg).lines;
 if(!validMoney(tradeValue)||!lines.some(l=>l.id===lineId))return null;
 if(lines.length===1)return tradeValue;
 const weights=budget.lowestSubSplits?.[pkg.id];
 if(!weights||Object.keys(weights).length!==lines.length||lines.some(l=>!Number.isSafeInteger(weights[l.id])||weights[l.id]<0))return null;
 const total=lines.reduce((s,l)=>s+weights[l.id],0);
 if(total===0)return tradeValue===0?0:null;
 const allocations=lines.map(l=>({id:l.id,raw:cents(tradeValue)*weights[l.id]/total,value:Math.floor(cents(tradeValue)*weights[l.id]/total)}));
 let remainder=cents(tradeValue)-allocations.reduce((s,a)=>s+a.value,0);
 for(const a of [...allocations].sort((a,b)=>(b.raw-b.value)-(a.raw-a.value))){if(remainder--<=0)break;a.value++;}
 return allocations.find(a=>a.id===lineId)!.value/100;
}

export function inHouseFromEstimate(budget:BudgetState,lineId:string,pkg:TradePackage,trade:TradeEstimate,by:string,at=new Date().toISOString()):BudgetState {
 const match=budgetLinesForTrade(budget,pkg);
 if(trade.packageId!==pkg.id||match.lines.length!==1||match.lines[0].id!==lineId||!trade.items.length||trade.unpriced)throw new BudgetRuleError({budget:'Use a fully priced estimate linked to one budget line, or enter this cost line’s amount manually.'});
 const next=editBudgetLine(budget,lineId,{budget:trade.total},by,at);
 return {...next,lines:next.lines.map(l=>l.id===lineId?{...l,inHouseEstimate:{kind:'estimate',packageId:pkg.id,value:trade.total,lines:trade.items.length,unreviewed:trade.unreviewed,appliedBy:by,appliedAt:at}}:l)};
}
