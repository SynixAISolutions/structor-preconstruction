// The company directory after its starting list: a browser that already saved a directory never sees new
// starting companies by itself, and an estimator adds real companies while inviting them to bid.

import { initialBidders, type Bidder } from "./data/commercial";

/**
 * A saved directory plus any starting company it doesn't have, at the end. Companies already there stay exactly as
 * they were edited, and one the team took out (`removed`) stays out. The same array comes back when nothing is missing,
 * so callers can skip saving.
 */
export function withStartingCompanies(saved: Bidder[], removed: string[] = []): Bidder[] {
  const have = new Set([...saved.map(company => company.id), ...removed]);
  const missing = initialBidders.filter(company => !have.has(company.id));
  return missing.length ? [...saved, ...missing] : saved;
}

/** Where the starting companies the team took out are kept, so opening the app doesn't bring them back. */
export const REMOVED_COMPANIES_KEY = "directory-removed";
/** What to remember when a company leaves the directory: only a starting company could come back. */
export const removedCompanies = (removed: string[], companyId: string): string[] =>
  initialBidders.some(company => company.id === companyId) && !removed.includes(companyId) ? [...removed, companyId] : removed;

export type NewCompany = { company: string; name: string; email: string; location: string };

/** A company typed in while inviting bidders, listed under that package's trade. Throws with a message to show. */
export function newDirectoryCompany(directory: Bidder[], input: NewCompany, trade: string, id: string = crypto.randomUUID()): Bidder {
  const company = input.company.trim(), name = input.name.trim(), email = input.email.trim();
  if (!company) throw new Error("Enter the company name.");
  if (!name) throw new Error("Enter a contact name.");
  if (!email) throw new Error("Enter an email address.");
  const taken = directory.find(c => c.company.trim().toLowerCase() === company.toLowerCase());
  if (taken) throw new Error(`${taken.company} is already in your directory, under ${taken.trade}. Search for it above.`);
  return { id, company, name, email, trade, location: input.location.trim(), status: "Review required" };
}

/** A placeholder company (the starting list's, or a test's): its contact email is on example.com, which no real company uses. */
export const isPlaceholderCompany = (company: Pick<Bidder, "email">): boolean => /@example\.(?:com|org|net)$/i.test(company.email.trim());

/**
 * The companies a project offers to pick from (inviting bidders, requesting VE pricing, assigning submittals): all of them
 * on the sample project (`sample`); on any other project only real ones, so a placeholder with an example.com address
 * isn't invited to real work (Danial, 25 Nov: "clean up the misleading pages"). `chosen`: companies the project already
 * works with, offered whatever their address. Every screen still finds a company by its id in the whole directory.
 */
export const companiesToOffer = <C extends Pick<Bidder, "id" | "email">>(directory: C[], sample: boolean, chosen: string[] = []): C[] =>
  sample ? directory : directory.filter(company => !isPlaceholderCompany(company) || chosen.includes(company.id));
