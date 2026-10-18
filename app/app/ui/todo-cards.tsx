import { AlertCircle, ArrowUpRight, CheckCircle2, Clock3, CircleHelp } from "lucide-react";
import type { DoneTask, TodoTask } from "../../lib/todo";
import { screenLabel, type Screen } from "../../lib/screens";
import { Badge } from "./shared";

export function TodoTaskCard({ task, group, navigate }: { task: TodoTask; group: string; navigate: (screen: Screen) => void }) {
  const Icon = task.status === "waiting" ? Clock3 : task.flag?.tone === "yellow" ? CircleHelp : AlertCircle;
  return <li className={`todo-task-card ${task.flag?.tone ?? task.status}`}>
    <span className="todo-task-icon"><Icon size={18} aria-hidden="true"/></span>
    <div className="todo-task-copy"><div className="todo-task-labels"><span>{group}</span>{task.flag && <Badge tone={task.flag.tone}>{task.flag.label}</Badge>}{task.status === "waiting" && <Badge tone="blue">Waiting</Badge>}{!task.flag && task.priority === "high" && <Badge tone="orange">High priority</Badge>}</div><h3>{task.title}</h3><p>{task.detail}</p></div>
    <button className="todo-task-action" onClick={() => navigate(task.screen)} aria-label={`Open ${screenLabel(task.screen)} for ${task.title}`}>Open {screenLabel(task.screen)}<ArrowUpRight size={15}/></button>
  </li>;
}

export function DoneTaskCard({ task, group }: { task: DoneTask; group: string }) {
  return <li className="todo-task-card done"><span className="todo-task-icon"><CheckCircle2 size={18} aria-hidden="true"/></span><div className="todo-task-copy"><div className="todo-task-labels"><span>{group}</span><Badge tone="green">Done</Badge></div><h3>{task.title}</h3><p>Completed <time dateTime={task.at}>{new Date(task.at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</time></p></div><span className="todo-complete-word">Completed</span></li>;
}
