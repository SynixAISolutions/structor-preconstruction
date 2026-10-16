import type { Project } from "./projects";
export const CONSTRUCTION_ROLES = ["Project manager", "Preconstruction manager", "Estimator", "Project engineer", "Superintendent", "Architect", "Structural engineer", "MEP engineer", "Owner representative", "Contracts administrator", "Procurement manager", "Subcontractor"] as const;
export function addProjectMember(project: Project, name: string, role: string): Project {
  const clean = name.trim();
  if (!clean || clean.length > 150 || !CONSTRUCTION_ROLES.some(r => r === role)) throw new Error("Enter a name and choose a construction role.");
  if (project.team.some(m => m.name.trim().toLowerCase() === clean.toLowerCase() && m.role === role)) throw new Error("This member and role are already on the project.");
  return { ...project, team: [...project.team, { name: clean, role }] };
}
