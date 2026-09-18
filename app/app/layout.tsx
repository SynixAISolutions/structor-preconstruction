import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Structor — Preconstruction Workspace",
  description: "A connected workspace for documents, scopes, takeoffs, bids, budgets, and award.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
