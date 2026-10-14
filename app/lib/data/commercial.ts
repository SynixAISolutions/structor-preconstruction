// Sample data and record shapes for the commercial and operations screens (the
// organization-wide bidder directory, portal scope, schedule, conversations, to-do).
// Trade packages live in lib/procurement.ts; budget and allowances in lib/budget.ts.
//
// This is illustrative preview content, not data from a live system of record.

import type { Screen } from "../screens";

export const trades = ["Demolition", "Concrete", "Structural steel", "Carpentry", "Drywall", "Mechanical", "Electrical", "Site work"];

export type Bidder = { id: string; company: string; name: string; email: string; trade: string; location: string; status: string };
export const initialBidders: Bidder[] = [
  { id: "b1", company: "Capital Demolition", name: "Michael Brooks", email: "michael@example.com", trade: "Demolition", location: "Washington, DC", status: "Qualified" },
  { id: "b2", company: "District Concrete", name: "Sarah Chen", email: "sarah@example.com", trade: "Concrete", location: "Arlington, VA", status: "Qualified" },
  { id: "b3", company: "Summit Steel", name: "James Wilson", email: "james@example.com", trade: "Structural steel", location: "Rockville, MD", status: "Review required" },
  { id: "b4", company: "Metro Mechanical", name: "Alex Rivera", email: "alex@example.com", trade: "Mechanical", location: "Washington, DC", status: "Qualified" },
  { id: "b5", company: "Precision Electric", name: "Taylor Reed", email: "taylor@example.com", trade: "Electrical", location: "Bethesda, MD", status: "Invited" },
  { id: "b6", company: "Greenline Civil", name: "Jordan Davis", email: "jordan@example.com", trade: "Site work", location: "Fairfax, VA", status: "Qualified" },
  { id: "b7", company: "Capitol Wall Systems", name: "Avery Morgan", email: "avery@example.com", trade: "Drywall", location: "Washington, DC", status: "Qualified" },
  { id: "b8", company: "Rock Creek Interiors", name: "Dana Brooks", email: "dana@example.com", trade: "Drywall", location: "Silver Spring, MD", status: "Qualified" },
  { id: "b9", company: "Anacostia Partitions", name: "Riley Shaw", email: "riley@example.com", trade: "Drywall", location: "Hyattsville, MD", status: "Qualified" },
];

export const portalScope=["Site protection and dust control","Selective demolition per demolition plans","Debris removal and disposal","Existing utilities coordination","Include required permits and inspections","Include all addenda through September 8"];

/** @deprecated The schedule screen's original milestone list. Replaced by lib/schedule.ts (useSchedule, sampleSchedule); removed once the screen moves over. */
export type Milestone={id:string;name:string;phase:string;start:string;end:string;owner:string;progress:number};
export const initialMilestones:Milestone[]=[{id:"m1",name:"Design development review",phase:"Design",start:"2026-09-01",end:"2026-09-25",owner:"Safi",progress:80},{id:"m2",name:"Scope packages & bid invitations",phase:"Preconstruction",start:"2026-09-15",end:"2026-10-02",owner:"Vijay",progress:55},{id:"m3",name:"Bid leveling & owner approval",phase:"Preconstruction",start:"2026-10-02",end:"2026-10-23",owner:"Safi",progress:15},{id:"m4",name:"Long-lead procurement",phase:"Procurement",start:"2026-10-19",end:"2026-12-18",owner:"Naija",progress:0},{id:"m5",name:"Mobilization & selective demolition",phase:"Construction",start:"2026-11-02",end:"2026-12-11",owner:"Vijay",progress:0},{id:"m6",name:"Foundations & structure",phase:"Construction",start:"2026-12-07",end:"2027-02-26",owner:"Naija",progress:0},{id:"m7",name:"Enclosure & interior buildout",phase:"Construction",start:"2027-02-01",end:"2027-06-18",owner:"Safi",progress:0},{id:"m8",name:"Commissioning & turnover",phase:"Construction",start:"2027-06-01",end:"2027-07-30",owner:"Vijay",progress:0}];

export const conversations=[{id:"demolition",trade:"Demolition",company:"Capital Demolition",initial:"M",name:"Michael Brooks",text:"Can you confirm whether the existing slab removal is included in our package?",time:"9:42 AM"},{id:"concrete",trade:"Concrete",company:"District Concrete",initial:"S",name:"Sarah Chen",text:"We have received the latest scope. Our revised proposal is being prepared.",time:"Yesterday"},{id:"steel",trade:"Structural steel",company:"Summit Steel",initial:"J",name:"James Wilson",text:"Please confirm the delegated design requirements for the steel connections.",time:"Yesterday"}];
