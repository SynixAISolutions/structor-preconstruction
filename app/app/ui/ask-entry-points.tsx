"use client";

import { ArrowRight, MessageSquare } from "lucide-react";
import { openAsk } from "./open-ask";

export function AskAboutTrade({ trade, code }: { trade: string; code: string }) {
  const subject = code ? `${trade} (${code})` : trade;
  return <button className="trade-ask" type="button"
    onClick={() => openAsk(`What should I review for ${subject} before publishing its bid form?`)}>
    <MessageSquare size={15} aria-hidden="true"/>
    Ask Structor about this trade
  </button>;
}

export function QuickFindAskResult({ query, onChoose }: { query: string; onChoose: () => void }) {
  const question = query.trim();
  if (!question) return null;

  return <button className="quick-find-ask" type="button" onClick={() => { onChoose(); openAsk(question); }}>
    <MessageSquare size={19} aria-hidden="true"/>
    <span>Ask Structor: {question}</span>
    <ArrowRight size={15} aria-hidden="true"/>
  </button>;
}
