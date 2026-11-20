import type { Screen } from "./shared";

// Suggested questions per screen in Ask Structor (NEW_LOOK_DEMO.md §3.4): what someone on that page is likely to ask
// next. Every list ends with "What is this page for?"; screens not listed get the general ones.
const GENERAL = ["Who is the apparent low bidder on each trade?", "Which budget lines are over budget?", "What RFIs are still open?"];
const BY_SCREEN: Partial<Record<Screen, string[]>> = {
  turnover: ["What's left before bids go out?", "Which trades have no bidders invited yet?", "What files or details are still missing?"],
  documents: ["Which drawings and specifications are uploaded?", "Has the AI read every trade yet?"],
  scopes: ["Which trades have the fewest scope items?", "What's in the general scope for concrete?"],
  packages: ["Which packages have no bids yet?", "Which bid packages are due this week?"],
  leveling: ["Who is the apparent low bidder on each trade?", "Which bids are missing scope items?"],
  budget: ["Which budget lines are over budget?", "How does the total compare with the owner's budget?"],
  checks: ["What RFIs are still open?", "Which Structor Check issues are most important?"],
};

export const startersFor = (screen: Screen) => [...(BY_SCREEN[screen] ?? GENERAL), "What is this page for?"];
