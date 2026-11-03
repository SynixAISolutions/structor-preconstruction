"use client";

import { useSharedStatus, type SharedState } from "../../lib/shared-sync";
import "./shared-status.css";

const SAY: Record<Exclude<SharedState, "unknown">, { label: string; title: string }> = {
  saved: { label: "Saved for your team", title: "Everyone who opens Structor sees the same projects, scopes and bid forms." },
  saving: { label: "Saving…", title: "Your latest changes are on their way to the team's shared copy." },
  offline: { label: "Saved in this browser", title: "The team's shared copy can't be reached right now. Your changes are kept here and sent when it's back." },
  off: { label: "Saved in this browser only", title: "Shared saving isn't connected yet, so changes stay in this browser." },
};

/** Where the open project's changes are saved, in the top bar (lib/shared-sync). */
export function SharedStatus() {
  const { state } = useSharedStatus();
  if (state === "unknown") return null;
  const say = SAY[state];
  return <span className={`shared-status ${state}`} title={say.title} role="status"><span aria-hidden/>{say.label}</span>;
}
