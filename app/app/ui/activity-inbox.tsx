"use client";

import { ChevronRight } from "lucide-react";
import { Badge, type Screen } from "./shared";
import type { Project } from "../../lib/projects";
import { useTodoSummary } from "../../lib/use-todo-summary";

/**
 * The top bar's reminders (15 Oct: reminders inside the app rather than connecting anyone's email):
 * the open project's most urgent actions from its to-do list, each opening the page where it is done.
 */
export function ActivityInbox({ project, onOpen }: { project: Project | null; onOpen: (screen: Screen) => void }) {
  const summary = useTodoSummary(project);
  const todo = summary.tasks.filter(task => task.status === "todo");
  const waiting = summary.tasks.length - todo.length;
  return <div className="notification-popover">
    <h3>Reminders {todo.length > 0 && <Badge tone="orange">{todo.length} to do</Badge>}</h3>
    {todo.slice(0, 6).map(task => <button key={task.id} onClick={() => onOpen(task.screen)}><span className="activity-point"/><div><strong>{task.title}</strong><small>{task.detail}</small></div><ChevronRight size={15}/></button>)}
    {!todo.length && <p>Nothing needs your action on {project?.name ?? "this project"}.</p>}
    <button onClick={() => onOpen("turnover")}><div><strong>Open the preconstruction to-do</strong><small>{todo.length > 6 ? `${todo.length - 6} more actions` : "Every action"}{waiting ? ` · ${waiting} waiting on others` : ""}</small></div><ChevronRight size={15}/></button>
  </div>;
}
