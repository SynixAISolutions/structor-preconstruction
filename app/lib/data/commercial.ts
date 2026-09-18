// Sample data and record shapes for the bid & award and coordination screens
// (bidders, packages, portal scope, budget, allowances, schedule, conversations, turnover).
//
// This is illustrative preview content, not data from a live system of record.

import type { Screen } from "../screens";

export const trades = ["Demolition", "Concrete", "Structural steel", "Carpentry", "Mechanical", "Electrical", "Site work"];

export type Bidder = { id: string; company: string; name: string; email: string; trade: string; location: string; status: string };
export const initialBidders: Bidder[] = [
  { id: "b1", company: "Capital Demolition", name: "Michael Brooks", email: "michael@example.com", trade: "Demolition", location: "Washington, DC", status: "Qualified" },
  { id: "b2", company: "District Concrete", name: "Sarah Chen", email: "sarah@example.com", trade: "Concrete", location: "Arlington, VA", status: "Qualified" },
  { id: "b3", company: "Summit Steel", name: "James Wilson", email: "james@example.com", trade: "Structural steel", location: "Rockville, MD", status: "Review required" },
  { id: "b4", company: "Metro Mechanical", name: "Alex Rivera", email: "alex@example.com", trade: "Mechanical", location: "Washington, DC", status: "Qualified" },
  { id: "b5", company: "Precision Electric", name: "Taylor Reed", email: "taylor@example.com", trade: "Electrical", location: "Bethesda, MD", status: "Invited" },
  { id: "b6", company: "Greenline Civil", name: "Jordan Davis", email: "jordan@example.com", trade: "Site work", location: "Fairfax, VA", status: "Qualified" },
];

export type Package = { id: string; code: string; trade: string; estimator: string; due: string; scope: number; invited: number; received: number; status: string };
export const initialPackages: Package[] = [
  { id: "p1", code: "02 41 00", trade: "Demolition", estimator: "Safi", due: "2026-10-02", scope: 34, invited: 6, received: 4, status: "Leveling" },
  { id: "p2", code: "03 30 00", trade: "Concrete", estimator: "Vijay", due: "2026-10-06", scope: 28, invited: 5, received: 2, status: "Bidding" },
  { id: "p3", code: "05 12 00", trade: "Structural steel", estimator: "Naija", due: "2026-10-08", scope: 22, invited: 4, received: 1, status: "Bidding" },
  { id: "p4", code: "06 10 00", trade: "Carpentry", estimator: "Safi", due: "2026-10-09", scope: 19, invited: 3, received: 0, status: "Draft" },
  { id: "p5", code: "23 00 00", trade: "Mechanical", estimator: "Vijay", due: "2026-10-13", scope: 41, invited: 4, received: 0, status: "Draft" },
  { id: "p6", code: "26 00 00", trade: "Electrical", estimator: "Naija", due: "2026-10-13", scope: 36, invited: 5, received: 0, status: "Draft" },
];

export const portalScope=["Site protection and dust control","Selective demolition per demolition plans","Debris removal and disposal","Existing utilities coordination","Include required permits and inspections","Include all addenda through September 8"];

export type CostRow={id:string;code:string;trade:string;center:string;budget:number;forecast:number;status:string};
export const initialCosts:CostRow[]=[
  {id:"c1",code:"02",trade:"Demolition",center:"Modernization",budget:520000,forecast:498000,status:"Provisional"},{id:"c2",code:"03",trade:"Concrete",center:"Modernization",budget:780000,forecast:762000,status:"Approved"},{id:"c3",code:"05",trade:"Structural steel",center:"Modernization",budget:1120000,forecast:1155000,status:"Provisional"},{id:"c4",code:"23",trade:"Mechanical",center:"Modernization",budget:2350000,forecast:2275000,status:"Provisional"},{id:"c5",code:"26",trade:"Electrical",center:"Modernization",budget:1650000,forecast:1590000,status:"Approved"},{id:"c6",code:"03",trade:"Concrete",center:"New addition",budget:980000,forecast:945000,status:"Provisional"},{id:"c7",code:"05",trade:"Structural steel",center:"New addition",budget:1800000,forecast:1740000,status:"Provisional"},{id:"c8",code:"07",trade:"Roofing & envelope",center:"New addition",budget:1300000,forecast:1280000,status:"Provisional"},{id:"c9",code:"31",trade:"Earthwork",center:"Site work",budget:640000,forecast:622000,status:"Approved"},{id:"c10",code:"32",trade:"Exterior improvements",center:"Site work",budget:820000,forecast:850000,status:"Provisional"},{id:"c11",code:"33",trade:"Site utilities",center:"Site work",budget:460000,forecast:447000,status:"Provisional"}
];

export type Allowance={id:string;name:string;amount:number;center:string;source:string;status:string;owner:string};
export const initialAllowances:Allowance[]=[{id:"a1",name:"Public art allowance",amount:500000,center:"Site work",source:"Owner requirements · Public art",status:"Review required",owner:"Safi"},{id:"a2",name:"Unforeseen existing conditions",amount:175000,center:"Modernization",source:"General requirements · Existing conditions",status:"Included",owner:"Vijay"},{id:"a3",name:"AV equipment selection",amount:85000,center:"Modernization",source:"Division 27 · Communications",status:"Review required",owner:"Naija"},{id:"a4",name:"Landscape establishment",amount:45000,center:"Site work",source:"Division 32 · Exterior improvements",status:"Included",owner:"Safi"}];

export type Milestone={id:string;name:string;phase:string;start:string;end:string;owner:string;progress:number};
export const initialMilestones:Milestone[]=[{id:"m1",name:"Design development review",phase:"Design",start:"2026-09-01",end:"2026-09-25",owner:"Safi",progress:80},{id:"m2",name:"Scope packages & bid invitations",phase:"Preconstruction",start:"2026-09-15",end:"2026-10-02",owner:"Vijay",progress:55},{id:"m3",name:"Bid leveling & owner approval",phase:"Preconstruction",start:"2026-10-02",end:"2026-10-23",owner:"Safi",progress:15},{id:"m4",name:"Long-lead procurement",phase:"Procurement",start:"2026-10-19",end:"2026-12-18",owner:"Naija",progress:0},{id:"m5",name:"Mobilization & selective demolition",phase:"Construction",start:"2026-11-02",end:"2026-12-11",owner:"Vijay",progress:0},{id:"m6",name:"Foundations & structure",phase:"Construction",start:"2026-12-07",end:"2027-02-26",owner:"Naija",progress:0},{id:"m7",name:"Enclosure & interior buildout",phase:"Construction",start:"2027-02-01",end:"2027-06-18",owner:"Safi",progress:0},{id:"m8",name:"Commissioning & turnover",phase:"Construction",start:"2027-06-01",end:"2027-07-30",owner:"Vijay",progress:0}];

export const conversations=[{id:"demolition",trade:"Demolition",company:"Capital Demolition",initial:"M",name:"Michael Brooks",text:"Can you confirm whether the existing slab removal is included in our package?",time:"9:42 AM"},{id:"concrete",trade:"Concrete",company:"District Concrete",initial:"S",name:"Sarah Chen",text:"We have received the latest scope. Our revised proposal is being prepared.",time:"Yesterday"},{id:"steel",trade:"Structural steel",company:"Summit Steel",initial:"J",name:"James Wilson",text:"Please confirm the delegated design requirements for the steel connections.",time:"Yesterday"}];

export const initialChecklist=[{id:"t1",title:"Final bid leveling sheets",description:"Reviewed responses, allowances, and final comparison for each trade.",group:"Commercial",done:true,screen:"leveling" as Screen},{id:"t2",title:"Approved project budget",description:"Cost centers, approved trade values, and provisional amounts.",group:"Commercial",done:false,screen:"budget" as Screen},{id:"t3",title:"Subcontracts & scope exhibits",description:"Prepared agreements and Exhibit A documents for selected bidders.",group:"Commercial",done:false,screen:"contracts" as Screen},{id:"t4",title:"Current drawings & specifications",description:"Latest revisions, drawing register, and project specifications.",group:"Technical",done:true,screen:"drawings" as Screen},{id:"t5",title:"Open questions & scope gaps",description:"Outstanding clarifications, conflicts, and decisions for the field team.",group:"Technical",done:false,screen:"checks" as Screen},{id:"t6",title:"Master schedule & procurement",description:"First construction milestones and long-lead procurement items.",group:"Planning",done:false,screen:"schedule" as Screen},{id:"t7",title:"Project team & trade contacts",description:"Estimator ownership and subcontractor points of contact.",group:"Planning",done:true,screen:"bidders" as Screen},{id:"t8",title:"Allowances & owner decisions",description:"Required allowances and unresolved owner selections.",group:"Commercial",done:false,screen:"allowances" as Screen}];
