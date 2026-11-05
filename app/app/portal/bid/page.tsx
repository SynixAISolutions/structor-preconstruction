import type { Metadata } from "next";
import { BidPortal } from "../../ui/bid-portal";

// The link is the key, so the page is kept out of search engines and never passes it on to another site.
export const metadata: Metadata = { title: "Bid invitation", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default function BidPage() {
  return <BidPortal/>;
}
