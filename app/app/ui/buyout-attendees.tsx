"use client";

import { useRef } from "react";
import { Plus } from "lucide-react";

/**
 * The scope review's attendees (Marcel, 24 Oct: "attendees come from the sub directory"): the list as typed, with the
 * suggested people (lib/buyout reviewAttendees) one click away. A click adds "Name, Company" on its own line.
 */
export function AttendeesField({ defaultValue, suggestions }: { defaultValue?: string; suggestions: { label: string; why: string }[] }) {
  const box = useRef<HTMLTextAreaElement>(null);
  function add(label: string) {
    const el = box.current;
    if (!el) return;
    const lines = el.value.split("\n").map(l => l.trim()).filter(Boolean);
    if (!lines.some(l => l.toLowerCase() === label.toLowerCase())) el.value = [...lines, label].join("\n");
    el.focus();
  }
  return <div className="ui-field buyout-attendees">
    <label htmlFor="scope-review-attendees">Attendees</label>
    <textarea ref={box} id="scope-review-attendees" name="attendees" rows={4} defaultValue={defaultValue}/>
    {suggestions.length > 0 && <div className="buyout-attendee-options" aria-label="Add from the subcontractor directory">
      <small>Add from the subcontractor directory and the team</small>
      <div>{suggestions.map(s => <button type="button" key={s.label} onClick={() => add(s.label)} title={s.why}><Plus size={12}/>{s.label}<em>{s.why}</em></button>)}</div>
    </div>}
  </div>;
}
