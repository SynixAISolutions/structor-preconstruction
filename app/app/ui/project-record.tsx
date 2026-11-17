"use client";

import { useLayoutEffect, useRef, useState, type FormEvent, type InputHTMLAttributes, type ReactNode } from "react";
import { ArrowRight, ArrowUpRight, Box, CloudUpload, FileStack, FileText, HardHat, MapPin, Plus, ShieldCheck, Trash2, X } from "lucide-react";
import {
  CERTIFICATION_PROGRAMS, DELIVERY_METHODS, ESTIMATE_STAGES, deliveryMethodLabel, estimateStageLabel, PROJECT_FORM_FIELDS, PROJECT_TYPES, TAX_STATUSES, WORK_TYPES,
  parseProjectForm, squareFeetLabel, standardMilestones, type Milestone, type Project, type ProjectFormErrors, type WorkType,
} from "../../lib/projects";
import { caretAfterDigits, displayDate, groupDigits } from "../../lib/format";
import { screenLabel, type Screen } from "../../lib/screens";
import { addProjectMember, CONSTRUCTION_ROLES } from "../../lib/project-team";
import { Badge, Button, Modal, PageHeader, Panel, usd } from "./shared";
import { useProjectDocuments } from "../../lib/project-files-client";
import { uploadInBackground } from "../../lib/upload-notices";
import { SetupContinueCard } from "./project-health";

function FieldError({ errors, field }: { errors: ProjectFormErrors; field: keyof typeof PROJECT_FORM_FIELDS }) {
  return errors[field] ? <small className="project-field-error" role="alert">{errors[field]}</small> : null;
}

const digitsOf = (text: string) => Number(text.replace(/\D/g, "")) || 0;

/**
 * A whole-number input that puts in the thousands commas as you type (Marcel's feedback log, 7 Nov), keeping the caret
 * after the digit it followed. The form reads the value with the commas removed (parseProjectForm).
 */
function GroupedInput({ value, onValue, ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type"> & { value: string; onValue: (value: string) => void }) {
  const ref = useRef<HTMLInputElement>(null), caret = useRef<number | null>(null);
  useLayoutEffect(() => {
    if (caret.current !== null && ref.current && document.activeElement === ref.current) ref.current.setSelectionRange(caret.current, caret.current);
    caret.current = null;
  });
  return <input {...props} ref={ref} type="text" inputMode="numeric" autoComplete="off" value={value} onChange={e => {
    const raw = e.target.value, at = e.target.selectionStart ?? raw.length;
    const next = groupDigits(raw);
    caret.current = caretAfterDigits(next, raw.slice(0, at).replace(/\D/g, "").length);
    onValue(next);
  }}/>;
}

/**
 * A PDF file input you can also drop a file onto (feedback log, 7 Nov: "have an option for user to drag the attachment
 * and place it on the RFP document"). Dropped files are put into the input itself, so the form submits them as chosen.
 */
function FileDrop({ name, label, hint, multiple = false, disabled }: { name: string; label: string; hint: string; multiple?: boolean; disabled?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]), [over, setOver] = useState(false), [note, setNote] = useState("");
  const take = (list: File[]) => {
    const pdfs = list.filter(file => /\.pdf$/i.test(file.name));
    const chosen = multiple ? pdfs : pdfs.slice(0, 1);
    if (input.current) { const transfer = new DataTransfer(); chosen.forEach(file => transfer.items.add(file)); input.current.files = transfer.files; }
    setFiles(chosen);
    setNote(pdfs.length < list.length ? "Only PDF files can be added here." : !multiple && pdfs.length > 1 ? "One file here: the first PDF was kept." : "");
  };
  const remove = (index: number) => take(files.filter((_, i) => i !== index));
  return <div className={`project-file-drop${over ? " over" : ""}${disabled ? " disabled" : ""}`}
    onDragOver={e => { if (disabled) return; e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
    onDrop={e => { e.preventDefault(); setOver(false); if (!disabled) take(Array.from(e.dataTransfer.files)); }}>
    <CloudUpload size={20} aria-hidden/>
    <div className="project-file-drop-copy">
      <strong>{label}</strong>
      <small>{hint}</small>
      {files.length > 0 && <ul>{files.map((file, i) => <li key={`${file.name}-${i}`}><FileText size={13} aria-hidden/>{file.name}<button type="button" className="ui-icon-btn" aria-label={`Remove ${file.name}`} disabled={disabled} onClick={() => remove(i)}><X size={13}/></button></li>)}</ul>}
      {note && <small className="project-field-error" role="alert">{note}</small>}
    </div>
    <Button disabled={disabled} onClick={() => input.current?.click()}>{files.length ? "Change" : "Choose"} {multiple ? "files" : "file"}</Button>
    <input ref={input} className="project-file-input" name={name} type="file" accept="application/pdf,.pdf" multiple={multiple} disabled={disabled} aria-label={label} onChange={e => take(Array.from(e.target.files || []))}/>
  </div>;
}

type CertificationRow = { program: string; percent: string };

/** `onSave` gets the saved project and how many files went on uploading in the background. */
export function ProjectForm({ project, onSave, onCancel, onBusyChange }: { project?: Project; onSave: (project: Project, uploading: number) => void; onCancel: () => void; onBusyChange?: (busy: boolean) => void }) {
  const f = PROJECT_FORM_FIELDS;
  const [workType, setWorkType] = useState<WorkType | "">(project?.workType ?? "");
  const [value, setValue] = useState(project?.value ? groupDigits(String(Math.round(project.value))) : "");
  const [squareFeet, setSquareFeet] = useState(project?.squareFeet ? groupDigits(String(project.squareFeet)) : "");
  const [renovationArea, setRenovationArea] = useState(project?.renovationSquareFeet ? groupDigits(String(project.renovationSquareFeet)) : "");
  const [additionArea, setAdditionArea] = useState(project?.additionSquareFeet ? groupDigits(String(project.additionSquareFeet)) : "");
  const [dates, setDates] = useState({ due: project?.due ?? "", rfi: project?.rfi ?? "", start: project?.start ?? "" });
  const [wageScale, setWageScale] = useState(project?.kickoff?.wageScale === true ? "yes" : project?.kickoff?.wageScale === false ? "no" : "");
  const [certifications, setCertifications] = useState<CertificationRow[]>(project?.certifications.length
    ? project.certifications.map(program => ({ program, percent: project.certificationTargets?.[program] !== undefined ? String(project.certificationTargets[program]) : "" }))
    : [{ program: "", percent: "" }]);
  const [milestones, setMilestones] = useState<Milestone[]>(project?.milestones ?? standardMilestones());
  const [team, setTeam] = useState(project?.team.length ? project.team : [{ name: "", role: "" }]);
  const [errors, setErrors] = useState<ProjectFormErrors>({});
  const [saving, setSaving] = useState(false);
  const { documents } = useProjectDocuments(project?.id);
  const combinedArea = digitsOf(renovationArea) + digitsOf(additionArea);
  const setDate = (key: keyof typeof dates) => (e: { target: { value: string } }) => setDates(d => ({ ...d, [key]: e.target.value }));

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const result = parseProjectForm(data, project);
    setErrors(result.errors);
    if (!result.project) {
      // Show the first problem: the form is long, and it may be well above or below what's on screen.
      requestAnimationFrame(() => form.querySelector<HTMLElement>("[aria-invalid=true], .project-field-error")?.scrollIntoView({ block: "center", behavior: "smooth" }));
      return;
    }
    setSaving(true);
    onBusyChange?.(true);
    // The RFP, drawings and specifications upload in the background once the project is saved (feedback log, 7 Nov:
    // "I would have this work in the background and tell us when it is complete"); the AI starts on the scopes when
    // the drawings and specifications have been read.
    const chosen = (name: string) => data.getAll(name).filter((v): v is File => v instanceof File && v.size > 0);
    const rfp = chosen(f.rfp)[0];
    const revisionOf = (file: File, category: string) => project ? [...documents].filter(d => d.category === category && d.name === file.name).sort((a, b) => b.revision - a.revision)[0] : undefined;
    const uploads = [
      ...(rfp ? [{ file: rfp, category: "RFP", revisionOf: revisionOf(rfp, "RFP") }] : []),
      ...chosen(f.drawings).map(file => ({ file, category: "Drawings" })),
      ...chosen(f.specifications).map(file => ({ file, category: "Specifications" })),
    ];
    onSave(result.project, uploads.length);
    if (uploads.length) void uploadInBackground(result.project.id, uploads);
    setSaving(false);
    onBusyChange?.(false);
  }

  return <form className="project-form" noValidate onSubmit={submit}>
    <section className="project-form-section">
      <h3>Project basics</h3><p>The details used to identify and compare this project.</p>
      <div className="ui-form-grid">
        <label className="ui-field full">Project name<input name={f.name} defaultValue={project?.name} aria-invalid={!!errors.name} placeholder="e.g. Westside Community Center"/><FieldError errors={errors} field="name"/></label>
        <label className="ui-field">Location<input name={f.location} defaultValue={project?.location} aria-invalid={!!errors.location} placeholder="City, state"/><FieldError errors={errors} field="location"/></label>
        <label className="ui-field">Project type<select name={f.type} defaultValue={project?.type ?? ""} aria-invalid={!!errors.type}><option value="">Select a project type</option>{PROJECT_TYPES.map(type => <option key={type}>{type}</option>)}</select><FieldError errors={errors} field="type"/></label>
        <label className="ui-field">Estimate stage<select name={f.estimateStage} defaultValue={project?.estimateStage ?? ""} aria-invalid={!!errors.estimateStage}><option value="">Select estimate stage</option>{ESTIMATE_STAGES.map(stage => <option key={stage.value} value={stage.value}>{stage.label}</option>)}</select><FieldError errors={errors} field="estimateStage"/></label>
        <label className="ui-field">Delivery method<select name={f.deliveryMethod} defaultValue={project?.deliveryMethod ?? ""} aria-invalid={!!errors.deliveryMethod}><option value="">{project?.deliveryMethod === null ? "Not recorded — select a value" : "Select delivery method"}</option>{DELIVERY_METHODS.map(method => <option key={method.value} value={method.value}>{method.label}</option>)}</select><FieldError errors={errors} field="deliveryMethod"/></label>
        <label className="ui-field">Architect<input name={f.architect} defaultValue={project?.architect} placeholder="Architect or design team"/></label>
        <label className="ui-field">Internal project value · USD<GroupedInput name={f.value} value={value} onValue={setValue} aria-invalid={!!errors.value} placeholder="e.g. 25,000,000"/><FieldError errors={errors} field="value"/></label>
        <label className="ui-field full">Project brief<textarea name={f.description} rows={3} defaultValue={project?.description} placeholder="What are we building?"/></label>
      </div>
    </section>

    <section className="project-form-section">
      <h3>Construction profile</h3><p>Use the area split when the project combines renovation and addition work.</p>
      <div className="ui-form-grid">
        <label className="ui-field">Work type<select name={f.workType} value={workType} onChange={e => setWorkType(e.target.value as WorkType | "")} aria-invalid={!!errors.workType}><option value="">{project?.workType === null ? "Not recorded — select a value" : "Select work type"}</option>{WORK_TYPES.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select><FieldError errors={errors} field="workType"/></label>
        <label className="ui-field">Tax status<select name={f.taxStatus} defaultValue={project?.taxStatus ?? ""} aria-invalid={!!errors.taxStatus}><option value="">{project?.taxStatus === null ? "Not recorded — select a value" : "Select tax status"}</option>{TAX_STATUSES.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select><FieldError errors={errors} field="taxStatus"/></label>
        {workType === "both" ? <>
          <label className="ui-field">Renovation area · SF<GroupedInput name={f.renovationSquareFeet} value={renovationArea} onValue={setRenovationArea} aria-invalid={!!errors.renovationSquareFeet}/><FieldError errors={errors} field="renovationSquareFeet"/></label>
          <label className="ui-field">Addition area · SF<GroupedInput name={f.additionSquareFeet} value={additionArea} onValue={setAdditionArea} aria-invalid={!!errors.additionSquareFeet}/><FieldError errors={errors} field="additionSquareFeet"/></label>
          <div className="project-computed full"><span>Total project area</span><strong>{combinedArea ? combinedArea.toLocaleString("en-US") + " SF" : "Calculated from both areas"}</strong></div>
        </> : <label className="ui-field full">Project area · SF<GroupedInput name={f.squareFeet} value={squareFeet} onValue={setSquareFeet} aria-invalid={!!errors.squareFeet} placeholder="e.g. 68,200"/><FieldError errors={errors} field="squareFeet"/></label>}
      </div>
    </section>

    <section className="project-form-section">
      <h3>Key dates</h3><p>Leave dates blank when they have not been confirmed.</p>
      <div className="ui-form-grid">
        <label className="ui-field">Bid deadline<input name={f.due} type="date" value={dates.due} onChange={setDate("due")} aria-invalid={!!errors.due}/><FieldError errors={errors} field="due"/></label>
        <label className="ui-field">Pre-bid RFI deadline<input name={f.rfi} type="date" value={dates.rfi} max={dates.due || undefined} onChange={setDate("rfi")} aria-invalid={!!errors.rfi}/><FieldError errors={errors} field="rfi"/></label>
        <label className="ui-field">Expected construction start<input name={f.start} type="date" value={dates.start} onChange={setDate("start")} aria-invalid={!!errors.start}/><FieldError errors={errors} field="start"/></label>
        <label className="ui-field">Expected completion<input name={f.finish} type="date" defaultValue={project?.finish} min={dates.start || undefined} aria-invalid={!!errors.finish}/><FieldError errors={errors} field="finish"/></label>
      </div>
    </section>

    <section className="project-form-section">
      <h3>Kickoff</h3><p>Dates and bid requirements for the subcontractor kickoff.</p>
      <div className="ui-form-grid">
        <label className="ui-field">Scopes to subcontractors<input type="date" name={f.scopesDue} defaultValue={project?.kickoff?.scopesDue ?? ""} max={dates.due || undefined} aria-invalid={!!errors.scopesDue}/><FieldError errors={errors} field="scopesDue"/></label>
        <label className="ui-field">RFI responses<input type="date" name={f.rfiResponses} defaultValue={project?.kickoff?.rfiResponses ?? ""} min={dates.rfi || undefined} aria-invalid={!!errors.rfiResponses}/>{dates.rfi && !errors.rfiResponses && <small>On or after the RFI deadline, {displayDate(dates.rfi)}</small>}<FieldError errors={errors} field="rfiResponses"/></label>
        <label className="ui-field">Drawing Flip<input type="date" name={f.drawingFlip} defaultValue={project?.kickoff?.drawingFlip ?? ""} aria-invalid={!!errors.drawingFlip}/><FieldError errors={errors} field="drawingFlip"/></label>
        <label className="ui-field">Job walk<input type="date" name={f.jobWalk} defaultValue={project?.kickoff?.jobWalk ?? ""} max={dates.due || undefined} aria-invalid={!!errors.jobWalk}/><FieldError errors={errors} field="jobWalk"/></label>
        <label className="ui-field full">Job walk notes<input name={f.jobWalkNote} defaultValue={project?.kickoff?.jobWalkNote ?? ""} maxLength={300} placeholder="e.g. N/A unless requested by your subcontractors"/></label>
        <label className="ui-field">Minimum bidders per trade<input type="number" min="1" max="10" step="1" name={f.minBidders} defaultValue={project?.kickoff?.minBidders ?? 3} aria-invalid={!!errors.minBidders}/><FieldError errors={errors} field="minBidders"/></label>
        <label className="ui-field">Wage scale<select name={f.wageScale} value={wageScale} onChange={e => setWageScale(e.target.value)} aria-invalid={!!errors.wageScale}><option value="">Not confirmed</option><option value="yes">Yes</option><option value="no">No</option></select><FieldError errors={errors} field="wageScale"/></label>
        {wageScale === "yes" && <label className="ui-field full">Which wage scale?<input name={f.wageScaleType} defaultValue={project?.kickoff?.wageScaleType ?? ""} maxLength={120} placeholder="e.g. Davis Bacon Wages" autoFocus={project?.kickoff?.wageScale !== true}/></label>}
      </div>
    </section>

    <section className="project-form-section">
      <div className="project-form-section-head"><div><h3>Project milestones</h3><p>When each part of the work starts. Leave a date blank until it's known and fill it in later from Project information; remove what doesn't apply. The AI uses these to build the schedule.</p></div><Button onClick={() => setMilestones(rows => [...rows, { name: "", start: "" }])}><Plus size={14}/>Add milestone</Button></div>
      <div className="project-milestones" role="group" aria-label="Project milestones">
        {milestones.length > 0 && <div className="project-milestone-head" aria-hidden><span>Milestone</span><span>Starts</span></div>}
        {milestones.map((milestone, index) => <div className="project-repeat-row milestone" key={index}>
          <label className="ui-field"><input name={f.milestoneName} value={milestone.name} maxLength={120} placeholder="e.g. Steel erection" aria-label={`Milestone ${index + 1}`} onChange={e => setMilestones(rows => rows.map((row, i) => i === index ? { ...row, name: e.target.value } : row))}/></label>
          <label className="ui-field"><input type="date" name={f.milestoneStart} value={milestone.start} min={dates.start || undefined} aria-label={`${milestone.name || `Milestone ${index + 1}`} starts`} aria-invalid={!!errors.milestones && !!dates.start && !!milestone.start && milestone.start < dates.start} onChange={e => setMilestones(rows => rows.map((row, i) => i === index ? { ...row, start: e.target.value } : row))}/></label>
          <button type="button" className="ui-icon-btn" aria-label={`Remove ${milestone.name || `milestone ${index + 1}`}`} onClick={() => setMilestones(rows => rows.filter((_, i) => i !== index))}><Trash2 size={15}/></button>
        </div>)}
      </div>
      {dates.start && <small className="project-form-note">Milestones can't start before the construction start, {displayDate(dates.start)}.</small>}
      <FieldError errors={errors} field="milestones"/>
    </section>

    <section className="project-form-section">
      <div className="project-form-section-head"><div><h3>Certifications</h3><p>Local participation and certification programs, and the share of the project each requires (35% CBE means firms certified CBE must hold 35% of the project's value).</p></div><Button onClick={() => setCertifications(rows => [...rows, { program: "", percent: "" }])}><Plus size={14}/>Add program</Button></div>
      <datalist id="certification-programs">{CERTIFICATION_PROGRAMS.map(program => <option value={program} key={program}/>)}</datalist>
      <div className="project-repeat-list">{certifications.map((row, index) => <div className="project-repeat-row certification" key={index}>
        <label className="ui-field">Program {index + 1}<input name={f.certifications} list="certification-programs" value={row.program} onChange={e => setCertifications(rows => rows.map((item, i) => i === index ? { ...item, program: e.target.value } : item))} placeholder="e.g. CBE"/></label>
        <label className="ui-field">% required<span className="project-percent"><input name={f.certificationPercent} inputMode="decimal" value={row.percent} disabled={!row.program.trim()} onChange={e => setCertifications(rows => rows.map((item, i) => i === index ? { ...item, percent: e.target.value.replace(/[^\d.]/g, "") } : item))} placeholder="e.g. 35" aria-invalid={!!errors.certificationPercent}/><span aria-hidden>%</span></span></label>
        <button type="button" className="ui-icon-btn" aria-label={"Remove certification " + (index + 1)} onClick={() => setCertifications(rows => rows.filter((_, i) => i !== index))}><Trash2 size={15}/></button>
      </div>)}</div>
      <FieldError errors={errors} field="certificationPercent"/>
    </section>

    <section className="project-form-section">
      <div className="project-form-section-head"><div><h3>Project team</h3><p>Record each team member and their project role.</p></div><Button onClick={() => setTeam(rows => [...rows, { name: "", role: "" }])}><Plus size={14}/>Add person</Button></div>
      <div className="project-repeat-list">{team.map((member, index) => <div className="project-repeat-row team" key={index}><label className="ui-field">Name<input name={f.teamName} value={member.name} onChange={e => setTeam(rows => rows.map((row, i) => i === index ? { ...row, name: e.target.value } : row))}/></label><label className="ui-field">Role<select name={f.teamRole} value={member.role} onChange={e => setTeam(rows => rows.map((row, i) => i === index ? { ...row, role: e.target.value } : row))}><option value="">Choose a role</option>{member.role && !CONSTRUCTION_ROLES.some(r=>r===member.role) && <option value={member.role}>{member.role}</option>}{CONSTRUCTION_ROLES.map(r=><option key={r}>{r}</option>)}</select></label><button type="button" className="ui-icon-btn" aria-label={"Remove team member " + (index + 1)} onClick={() => setTeam(rows => rows.filter((_, i) => i !== index))}><Trash2 size={15}/></button></div>)}</div>
    </section>

    <section className="project-form-section">
      <h3>Bid documents</h3><p>Drop the files on a box, or choose them. They upload in the background after you {project ? "save" : "create the project"}, so you can keep working, and the AI starts writing the scopes once the drawings and specifications are read.</p>
      <div className="project-file-drops">
        <FileDrop name={f.rfp} label="RFP document" hint={project?.rfpFileName ? `Current file: ${project.rfpFileName}. A new one replaces it.` : "One PDF. Its key details are offered for review in the Preconstruction to-do."} disabled={saving}/>
        <FileDrop name={f.drawings} label="Project drawings" hint="Drawing sets as PDFs, one or more volumes." multiple disabled={saving}/>
        <FileDrop name={f.specifications} label="Project specifications" hint="The project manual as PDFs." multiple disabled={saving}/>
      </div>
      <FieldError errors={errors} field="rfp"/>
    </section>
    <div className="ui-form-actions"><Button disabled={saving} onClick={onCancel}>Cancel</Button><Button disabled={saving} type="submit" variant="primary">{saving ? "Saving…" : project ? "Save project" : "Create project"}<ArrowRight size={16}/></Button></div>
  </form>;
}

const certificationText = (project: Project) => project.certifications.length
  ? project.certifications.map(program => project.certificationTargets?.[program] !== undefined ? `${program} (${project.certificationTargets[program]}% required)` : program).join(", ")
  : "Not recorded";

export function ProjectInformation({ project, onSave, navigate, cover }: { project: Project; onSave: (project: Project) => void; navigate: (screen: Screen) => void; cover: ReactNode }) {
  const [editing, setEditing] = useState(false);
  const [formBusy, setFormBusy] = useState(false);
  const [addingMember, setAddingMember] = useState(false), [memberError, setMemberError] = useState("");
  const workType = WORK_TYPES.find(option => option.value === project.workType)?.label ?? "Not recorded";
  const taxStatus = TAX_STATUSES.find(option => option.value === project.taxStatus)?.label ?? "Not recorded";
  const kickoff = project.kickoff;
  const milestones = project.milestones ?? [];
  const dated = milestones.filter(m => m.start);
  const details = [
    ["Project type", project.type || "Not recorded"], ["Delivery method", deliveryMethodLabel(project.deliveryMethod)], ["Estimate stage", estimateStageLabel(project.estimateStage)], ["Work type", workType], ["Total area", squareFeetLabel(project.squareFeet)],
    ...(project.workType === "both" ? [["Renovation area", squareFeetLabel(project.renovationSquareFeet)], ["Addition area", squareFeetLabel(project.additionSquareFeet)]] : []),
    ["Architect", project.architect || "Not recorded"], ["Tax status", taxStatus], ["Bid deadline", displayDate(project.due)], ["Pre-bid RFI deadline", displayDate(project.rfi)],
    ["Construction start", displayDate(project.start)], ["Expected completion", displayDate(project.finish)], ["Certifications", certificationText(project)], ["RFP document", project.rfpFileName || "Not recorded"],
  ];
  const jobWalk = kickoff?.jobWalk ? `${displayDate(kickoff.jobWalk)}${kickoff.jobWalkNote ? ` · ${kickoff.jobWalkNote}` : ""}` : kickoff?.jobWalkNote || "Not set";
  const wage = kickoff?.wageScale === true ? `Yes${kickoff.wageScaleType ? ` · ${kickoff.wageScaleType}` : " · type not recorded"}` : kickoff?.wageScale === false ? "No" : "Not confirmed";

  return <><PageHeader eyebrow="PROJECT INFORMATION" title={project.name} description="The shared source of project context for your team and trade partners." actions={<><Button onClick={() => navigate("portal")}><HardHat size={16}/>Subcontractor view</Button><Button onClick={()=>navigate("architect")}>Architect view</Button><Button variant="primary" onClick={() => setEditing(true)}>Edit information</Button></>}/>
    <div className="info-cover">{cover}<div><Badge tone="green">{project.status}</Badge><h2>{project.type}</h2><p><MapPin size={16}/>{project.location}</p></div></div>
    <SetupContinueCard project={project} navigate={navigate}/>
    <div className="ui-two-col"><div className="info-main"><Panel title="Project brief" subtitle="Visible to the project team and invited partners"><div className="info-body"><p>{project.description || "No project brief has been recorded."}</p><dl className="info-grid">{details.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></div></Panel>
      <Panel title="Project milestones" subtitle={milestones.length ? `${dated.length} of ${milestones.length} dated · used to build the schedule` : "None recorded"} action={<Button onClick={() => setEditing(true)}>{dated.length < milestones.length ? "Add dates" : "Edit"}</Button>}><div className="info-body">{milestones.length ? <dl className="info-grid info-milestones">{milestones.map((m, i) => <div key={`${m.name}-${i}`}><dt>{m.name}</dt><dd>{m.start ? displayDate(m.start) : "Not set"}</dd></div>)}</dl> : <p className="project-empty-note">No milestones recorded. Edit the project information to add them.</p>}</div></Panel></div>
      <div className="info-side"><Panel title="Kickoff"><div className="info-body"><dl className="info-grid">{[
        ["Bid deadline",displayDate(project.due)],["Pre-bid RFI deadline",displayDate(project.rfi)],
        ["Scopes to subcontractors",displayDate(kickoff?.scopesDue||"")],["RFI responses",displayDate(kickoff?.rfiResponses||"")],
        ["Drawing Flip",displayDate(kickoff?.drawingFlip||"")],["Job walk",jobWalk],
        ["Minimum bidders per trade",String(kickoff?.minBidders??3)],["Wage scale",wage]
      ].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></div></Panel><Panel title="Project team" action={<Button onClick={() => {setAddingMember(true);setMemberError("");}}><Plus size={14}/>Add member</Button>}><div className="team-list">{project.team.length ? project.team.map(member => <div key={member.name + "-" + member.role}><span className="user-avatar">{member.name.split(/\s+/).map(part => part[0]).join("").slice(0, 2).toUpperCase()}</span><div><strong>{member.name}</strong><small>{member.role || "Role not recorded"}</small></div></div>) : <p className="project-empty-note">No project team recorded.</p>}</div></Panel>
        <Panel title="Internal estimate"><div className="internal-value"><span><ShieldCheck size={15}/>TEAM VIEW</span><strong>{usd(project.value)}</strong><p>Planning value for this project.</p><Button onClick={() => navigate("budget")}>Budget breakdown<ArrowRight size={15}/></Button></div></Panel></div>
    </div>
    <div className="info-links">{[[screenLabel("documents"), "Drawings, manuals and reports", "documents", FileStack], ["RFP & bid requirements", "Owner requirements and key dates", "documents", FileText], [screenLabel("packages"), "Trade scopes and assigned owners", "packages", Box]].map(([title, description, destination, Icon]) => { const LinkIcon = Icon as typeof Box; return <button key={String(title)} onClick={() => navigate(destination as Screen)}><LinkIcon size={24}/><div><strong>{String(title)}</strong><small>{String(description)}</small></div><ArrowUpRight size={18}/></button>; })}</div>
    {addingMember && <Modal title="Add project member" subtitle="Add a person to the project record." onClose={()=>setAddingMember(false)}><form onSubmit={e=>{e.preventDefault();const data=new FormData(e.currentTarget);try{onSave(addProjectMember(project,String(data.get("name")||""),String(data.get("role")||"")));setAddingMember(false);}catch(error){setMemberError(error instanceof Error?error.message:"Member could not be added.");}}}><label className="ui-field"><span>Name</span><input name="name" required maxLength={150}/></label><label className="ui-field"><span>Construction role</span><select name="role" required>{CONSTRUCTION_ROLES.map(r=><option key={r}>{r}</option>)}</select></label>{memberError&&<p role="alert">{memberError}</p>}<Button type="submit" variant="primary">Add member</Button></form></Modal>}
    {editing && <Modal title="Edit project information" subtitle="Update the project record used across the workspace." wide onClose={() => { if (!formBusy) setEditing(false); }}><ProjectForm project={project} onBusyChange={setFormBusy} onCancel={() => setEditing(false)} onSave={updated => { onSave(updated); setEditing(false); }}/></Modal>}
  </>;
}
