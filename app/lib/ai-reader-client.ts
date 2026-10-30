"use client";

// Which AI the server reads with (GET /api/ai), asked once per tab: screens show a large reading's estimated cost
// before it starts when it is Claude, and the run after an upload reads scopes by itself only when `autoScopes`.

import { useEffect, useState } from "react";

export type AiReader = { reader: "claude" | "deepseek"; model: string; autoScopes: boolean };
let asked: Promise<AiReader> | null = null;

export function aiReader(): Promise<AiReader> {
  asked ??= fetch("/api/ai").then(r => r.ok ? r.json() as Promise<AiReader> : Promise.reject(new Error(`The AI setup couldn't be read (${r.status}).`)));
  asked.catch(() => { asked = null; });
  return asked;
}

/** The server's AI, or null while it is asked (or when it couldn't be). */
export function useAiReader(): AiReader | null {
  const [reader, setReader] = useState<AiReader | null>(null);
  useEffect(() => { let live = true; aiReader().then(r => { if (live) setReader(r); }, () => {}); return () => { live = false; }; }, []);
  return reader;
}
