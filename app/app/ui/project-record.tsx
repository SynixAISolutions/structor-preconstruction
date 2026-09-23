"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { ArrowRight, ArrowUpRight, Box, FileStack, FileText, HardHat, MapPin, Plus, ShieldCheck, Trash2 } from "lucide-react";
import {
  CERTIFICATION_PROGRAMS, PROJECT_FORM_FIELDS, PROJECT_TYPES, TAX_STATUSES, WORK_TYPES,
  parseProjectForm, squareFeetLabel, type Project, type ProjectFormErrors, type WorkType,
} from "../../lib/projects";
import { displayDate } from "../../lib/format";
import { screenLabel, type Screen } from "../../lib/screens";
import { Badge, Button, Modal, PageHeader, Panel, usd } from "./shared";

function FieldError({ errors, field }: { errors: ProjectFormErrors; field: keyof typeof PROJECT_FORM_FIELDS }) {
  return errors[field] ? <small className="project-field-error" role="alert">{errors[field]}</small> : null;
}

export function ProjectForm({ project, onSave, onCancel }: { project?: Project; onSave: (project: Project) => void; onCancel: () => void }) {
  const f = PROJECT_FORM_FIELDS;
  const [workType, setWorkType] = useState<WorkType | "">(project?.workType ?? "");
  const [squareFeet, setSquareFeet] = useState(project?.squareFeet ? String(project.squareFeet) : "");
  const [renovationArea, setRenovationArea] = useState(project?.renovationSquareFeet ? String(project.renovationSquareFeet) : "");
  const [additionArea, setAdditionArea] = useState(project?.additionSquareFeet ? String(project.additionSquareFeet) : "");
  const [certifications, setCertifications] = useState(project?.certifications.length ? project.certifications : [""]);
  const [team, setTeam] = useState(project?.team.length ? project.team : [{ name: "", role: "" }]);
  const [errors, setErrors] = useState<ProjectFormErrors>({});
  const combinedArea = (Number(renovationArea) || 0) + (Number(additionArea) || 0);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = parseProjectForm(new FormData(event.currentTarget), project);
    setErrors(result.errors);
    if (result.project) onSave(result.project);
  }

  return <form className="project-form" noValidate onSubmit={submit}>
    <section className="project-form-section">
      <h3>Project basics</h3><p>The details used to identify and compare this project.</p>
      <div className="ui-form-grid">
        <label className="ui-field full">Project name<input name={f.name} defaultValue={project?.name} aria-invalid={!!errors.name} placeholder="e.g. Westside Community Center"/><FieldError errors={errors} field="name"/></label>
        <label className="ui-field">Location<input name={f.location} defaultValue={project?.location} aria-invalid={!!errors.location} placeholder="City, state"/><FieldError errors={errors} field="location"/></label>
        <label className="ui-field">Project type<select name={f.type} defaultValue={project?.type ?? ""} aria-invalid={!!errors.type}><option value="">Select a project type</option>{PROJECT_TYPES.map(type => <option key={type}>{type}</option>)}</select><FieldError errors={errors} field="type"/></label>
        <label className="ui-field">Architect<input name={f.architect} defaultValue={project?.architect} placeholder="Architect or design team"/></label>
        <label className="ui-field">Internal project value<input name={f.value} type="number" min="0" step="1" defaultValue={project?.value || ""} aria-invalid={!!errors.value} placeholder="USD"/><FieldError errors={errors} field="value"/></label>
        <label className="ui-field full">Project brief<textarea name={f.description} rows={3} defaultValue={project?.description} placeholder="What are we building?"/></label>
      </div>
    </section>

    <section className="project-form-section">
      <h3>Construction profile</h3><p>Use the area split when the project combines renovation and addition work.</p>
      <div className="ui-form-grid">
        <label className="ui-field">Work type<select name={f.workType} value={workType} onChange={e => setWorkType(e.target.value as WorkType | "")} aria-invalid={!!errors.workType}><option value="">{project?.workType === null ? "Not recorded — select a value" : "Select work type"}</option>{WORK_TYPES.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select><FieldError errors={errors} field="workType"/></label>
        <label className="ui-field">Tax status<select name={f.taxStatus} defaultValue={project?.taxStatus ?? ""} aria-invalid={!!errors.taxStatus}><option value="">{project?.taxStatus === null ? "Not recorded — select a value" : "Select tax status"}</option>{TAX_STATUSES.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select><FieldError errors={errors} field="taxStatus"/></label>
        {workType === "both" ? <>
          <label className="ui-field">Renovation area · SF<input name={f.renovationSquareFeet} type="number" min="1" step="1" value={renovationArea} onChange={e => setRenovationArea(e.target.value)} aria-invalid={!!errors.renovationSquareFeet}/><FieldError errors={errors} field="renovationSquareFeet"/></label>
          <label className="ui-field">Addition area · SF<input name={f.additionSquareFeet} type="number" min="1" step="1" value={additionArea} onChange={e => setAdditionArea(e.target.value)} aria-invalid={!!errors.additionSquareFeet}/><FieldError errors={errors} field="additionSquareFeet"/></label>
          <div className="project-computed full"><span>Total project area</span><strong>{combinedArea ? combinedArea.toLocaleString("en-US") + " SF" : "Calculated from both areas"}</strong></div>
        </> : <label className="ui-field full">Project area · SF<input name={f.squareFeet} type="number" min="1" step="1" value={squareFeet} onChange={e => setSquareFeet(e.target.value)} aria-invalid={!!errors.squareFeet}/><FieldError errors={errors} field="squareFeet"/></label>}
      </div>
    </section>

    <section className="project-form-section">
      <h3>Key dates</h3><p>Leave dates blank when they have not been confirmed.</p>
      <div className="ui-form-grid">
        <label className="ui-field">Bid deadline<input name={f.due} type="date" defaultValue={project?.due} aria-invalid={!!errors.due}/><FieldError errors={errors} field="due"/></label>
        <label className="ui-field">Pre-bid RFI deadline<input name={f.rfi} type="date" defaultValue={project?.rfi} aria-invalid={!!errors.rfi}/><FieldError errors={errors} field="rfi"/></label>
        <label className="ui-field">Expected construction start<input name={f.start} type="date" defaultValue={project?.start} aria-invalid={!!errors.start}/><FieldError errors={errors} field="start"/></label>
        <label className="ui-field">Expected completion<input name={f.finish} type="date" defaultValue={project?.finish} aria-invalid={!!errors.finish}/><FieldError errors={errors} field="finish"/></label>
      </div>
    </section>

    <section className="project-form-section">
      <div className="project-form-section-head"><div><h3>Certifications</h3><p>Add local participation and certification programs.</p></div><Button onClick={() => setCertifications(values => [...values, ""])}><Plus size={14}/>Add program</Button></div>
      <datalist id="certification-programs">{CERTIFICATION_PROGRAMS.map(program => <option value={program} key={program}/>)}</datalist>
      <div className="project-repeat-list">{certifications.map((value, index) => <div className="project-repeat-row" key={index}><label className="ui-field">Program {index + 1}<input name={f.certifications} list="certification-programs" value={value} onChange={e => setCertifications(values => values.map((item, i) => i === index ? e.target.value : item))} placeholder="e.g. CBE"/></label><button type="button" className="ui-icon-btn" aria-label={"Remove certification " + (index + 1)} onClick={() => setCertifications(values => values.filter((_, i) => i !== index))}><Trash2 size={15}/></button></div>)}</div>
    </section>

    <section className="project-form-section">
      <div className="project-form-section-head"><div><h3>Project team</h3><p>Record each team member and their project role.</p></div><Button onClick={() => setTeam(rows => [...rows, { name: "", role: "" }])}><Plus size={14}/>Add person</Button></div>
      <div className="project-repeat-list">{team.map((member, index) => <div className="project-repeat-row team" key={index}><label className="ui-field">Name<input name={f.teamName} value={member.name} onChange={e => setTeam(rows => rows.map((row, i) => i === index ? { ...row, name: e.target.value } : row))}/></label><label className="ui-field">Role<input name={f.teamRole} value={member.role} onChange={e => setTeam(rows => rows.map((row, i) => i === index ? { ...row, role: e.target.value } : row))}/></label><button type="button" className="ui-icon-btn" aria-label={"Remove team member " + (index + 1)} onClick={() => setTeam(rows => rows.filter((_, i) => i !== index))}><Trash2 size={15}/></button></div>)}</div>
    </section>

    <section className="project-form-section">
      <h3>RFP document</h3>
      <label className="ui-field full">RFP file<input name={f.rfp} type="file" accept=".pdf,.doc,.docx,.xls,.xlsx"/><small>{project?.rfpFileName ? "Current file: " + project.rfpFileName : "The selected filename is recorded; server-side file storage is not connected yet."}</small></label>
    </section>
    <div className="ui-form-actions"><Button onClick={onCancel}>Cancel</Button><Button type="submit" variant="primary">{project ? "Save project" : "Create project"}<ArrowRight size={16}/></Button></div>
  </form>;
}

export function ProjectInformation({ project, onSave, navigate, cover }: { project: Project; onSave: (project: Project) => void; navigate: (screen: Screen) => void; cover: ReactNode }) {
  const [editing, setEditing] = useState(false);
  const workType = WORK_TYPES.find(option => option.value === project.workType)?.label ?? "Not recorded";
  const taxStatus = TAX_STATUSES.find(option => option.value === project.taxStatus)?.label ?? "Not recorded";
  const details = [
    ["Project type", project.type || "Not recorded"], ["Work type", workType], ["Total area", squareFeetLabel(project.squareFeet)],
    ...(project.workType === "both" ? [["Renovation area", squareFeetLabel(project.renovationSquareFeet)], ["Addition area", squareFeetLabel(project.additionSquareFeet)]] : []),
    ["Architect", project.architect || "Not recorded"], ["Tax status", taxStatus], ["Bid deadline", displayDate(project.due)], ["Pre-bid RFI deadline", displayDate(project.rfi)],
    ["Construction start", displayDate(project.start)], ["Expected completion", displayDate(project.finish)], ["Certifications", project.certifications.join(", ") || "Not recorded"], ["RFP document", project.rfpFileName || "Not recorded"],
  ];

  return <><PageHeader eyebrow="PROJECT INFORMATION" title={project.name} description="The shared source of project context for your team and trade partners." actions={<><Button onClick={() => navigate("portal")}><HardHat size={16}/>Subcontractor view</Button><Button variant="primary" onClick={() => setEditing(true)}>Edit information</Button></>}/>
    <div className="info-cover">{cover}<div><Badge tone="green">{project.status}</Badge><h2>{project.type}</h2><p><MapPin size={16}/>{project.location}</p></div></div>
    <div className="ui-two-col"><Panel title="Project brief" subtitle="Visible to the project team and invited partners"><div className="info-body"><p>{project.description || "No project brief has been recorded."}</p><dl className="info-grid">{details.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></div></Panel>
      <div className="info-side"><Panel title="Project team"><div className="team-list">{project.team.length ? project.team.map(member => <div key={member.name + "-" + member.role}><span className="user-avatar">{member.name.split(/\s+/).map(part => part[0]).join("").slice(0, 2).toUpperCase()}</span><div><strong>{member.name}</strong><small>{member.role || "Role not recorded"}</small></div></div>) : <p className="project-empty-note">No project team recorded.</p>}</div></Panel>
        <Panel title="Internal estimate"><div className="internal-value"><span><ShieldCheck size={15}/>TEAM VIEW</span><strong>{usd(project.value)}</strong><p>Planning value for this project.</p><Button onClick={() => navigate("budget")}>Budget breakdown<ArrowRight size={15}/></Button></div></Panel></div>
    </div>
    <div className="info-links">{[[screenLabel("documents"), "Drawings, manuals and reports", "documents", FileStack], ["RFP & bid requirements", "Owner requirements and key dates", "documents", FileText], [screenLabel("packages"), "Trade scopes and assigned owners", "packages", Box]].map(([title, description, destination, Icon]) => { const LinkIcon = Icon as typeof Box; return <button key={String(title)} onClick={() => navigate(destination as Screen)}><LinkIcon size={24}/><div><strong>{String(title)}</strong><small>{String(description)}</small></div><ArrowUpRight size={18}/></button>; })}</div>
    {editing && <Modal title="Edit project information" subtitle="Update the project record used across the workspace." wide onClose={() => setEditing(false)}><ProjectForm project={project} onCancel={() => setEditing(false)} onSave={updated => { onSave(updated); setEditing(false); }}/></Modal>}
  </>;
}
