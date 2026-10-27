"use client";

import { ChevronRight, Sparkles } from "lucide-react";
import { Badge, type Screen } from "./shared";
import type { Project } from "../../lib/projects";
import { useTodoSummary } from "../../lib/use-todo-summary";
import { useLocalDraft } from "../../lib/use-local-draft";
import { RUNS_KEY } from "../../lib/auto-scopes";
import { NO_RUNS, runFiles, runProgress, runSummary, type SavedRuns } from "../../lib/auto-scope-plan";

/**
 * The top bar's reminders (15 Oct: reminders inside the app rather than connecting anyone's email):
 * the open project's most urgent actions from its to-do list, each opening the page where it is done.
 * Above them, the AI's runs on uploaded files (26 Oct): in progress, then completed with what they added.
 */
export function ActivityInbox({ project, onOpen }: { project: Project | null; onOpen: (screen: Screen) => void }) {
  const summary = useTodoSummary(project);
  const [saved] = useLocalDraft<SavedRuns>(RUNS_KEY, NO_RUNS);
  const runs = saved.runs.slice(0, 3);
  const todo = summary.tasks.filter(task => task.status === "todo");
  const waiting = summary.tasks.length - todo.length;
  return <div className="notification-popover">
    {runs.length > 0 && <>
      <h3>AI runs</h3>
      {runs.map(run => { const { done, total } = runProgress(run); return <button key={run.id} onClick={() => onOpen("scopes")}><span className="activity-point ai"><Sparkles size={11}/></span><div><strong>{run.status === "running" ? `AI is reading ${runFiles(run)}` : `Completed AI run on ${runFiles(run)}`}</strong><small>{run.status === "running" ? `${done} of ${total} trades · ${run.added} scope items added so far` : `${runSummary(run)} · ${new Date(run.finishedAt ?? run.startedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`}</small></div><ChevronRight size={15}/></button>; })}
    </>}
    <h3>Reminders {todo.length > 0 && <Badge tone="orange">{todo.length} to do</Badge>}</h3>
    {todo.slice(0, 6).map(task => <button key={task.id} onClick={() => onOpen(task.screen)}><span className="activity-point"/><div><strong>{task.title}</strong><small>{task.detail}</small></div><ChevronRight size={15}/></button>)}
    {!todo.length && <p>Nothing needs your action on {project?.name ?? "this project"}.</p>}
    <button onClick={() => onOpen("turnover")}><div><strong>Open the preconstruction to-do</strong><small>{todo.length > 6 ? `${todo.length - 6} more actions` : "Every action"}{waiting ? ` · ${waiting} waiting on others` : ""}</small></div><ChevronRight size={15}/></button>
  </div>;
}
