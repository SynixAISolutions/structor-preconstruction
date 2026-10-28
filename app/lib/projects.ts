// Project records: shape, sample data, browser persistence, form parsing and list filtering.
// These are illustrative sample projects, not data from a real system of record.
//
// Marcel (20 Sep review) wants the project record rich enough to find comparable past
// jobs later: location, type, size, renovation/addition split, tax status, certification
// programs and year. `null` means "not recorded" — used for records saved before these
// fields existed, never for a newly created project (the form requires them).

export type WorkType = "new" | "renovation" | "addition" | "both";
export type TaxStatus = "taxable" | "non-taxable";
/**
 * How the job is bought (Marcel's write-up, 24 Oct meeting): a hard bid prices complete drawings and has no
 * RFP; CM at-risk works to a GMP whose stage the owner sets in the RFP; design-build starts from the RFP response.
 */
export type DeliveryMethod = "hard-bid" | "cmar" | "design-build";
export const ESTIMATE_STAGES = [{ value: "concept", label: "Concept" }, { value: "schematic", label: "Schematic design" }, { value: "dd", label: "Design development" }] as const;
export type EstimateStage = typeof ESTIMATE_STAGES[number]["value"];
export const estimateStageLabel = (stage: EstimateStage | null) => ESTIMATE_STAGES.find(item => item.value === stage)?.label ?? "Not recorded";
export type TeamMember = { name: string; role: string };

/**
 * The bid captain's kickoff (Marcel's write-up, step 3, and his 22 Oct note: "putting the project information,
 * when the RFI deadlines are due"): the dates and rules the team works to beyond bid due, RFI deadline, start
 * and finish. Dates are yyyy-mm-dd or "" until entered.
 */
export type Kickoff = {
  /** Scopes go to subcontractors (about a week before their numbers are due). */
  scopesDue: string;
  /** The architect's answers to the pre-bid RFIs are expected. */
  rfiResponses: string;
  /** Drawing flip: each division leader walks the drawings with the bid captain. */
  drawingFlip: string;
  demolitionStart: string;
  /** Job walk arrangements, in words ("N/A unless requested by your subcontractors"). */
  jobWalk: string;
  /** "Three subs at least required for every trade." */
  minBidders: number;
  wageScale: boolean | null;
};
export const EMPTY_KICKOFF: Kickoff = { scopesDue: "", rfiResponses: "", drawingFlip: "", demolitionStart: "", jobWalk: "", minBidders: 3, wageScale: null };
const KICKOFF_DATES = ["scopesDue", "rfiResponses", "drawingFlip", "demolitionStart"] as const;

/** A project record. Every stored or created project has this shape. */
export type Project = {
  id: string; name: string; location: string; type: string; status: string;
  value: number; architect: string; description: string;
  due: string; rfi: string; start: string; finish: string;
  /** Total building area. For renovation/addition/both it equals renovationSquareFeet + additionSquareFeet; new construction has no split. */
  squareFeet: number;
  workType: WorkType | null;
  renovationSquareFeet: number;
  additionSquareFeet: number;
  taxStatus: TaxStatus | null;
  estimateStage: EstimateStage | null;
  deliveryMethod: DeliveryMethod | null;
  /** Local participation / certification programs, e.g. "CBE", "MBE", "First Source". */
  certifications: string[];
  team: TeamMember[];
  kickoff: Kickoff;
  /** Name of the RFP file chosen at creation. The file itself is not stored yet. */
  rfpFileName: string;
  createdAt: string;
};

export const PROJECTS_STORAGE_KEY = "structor-ui-projects";

export const PROJECT_TABS = ["All projects", "Preconstruction", "Design development", "Bidding"];
export const PROJECT_TYPES = ["Community & recreation", "Education", "Commercial", "Mixed-use", "Residential", "Healthcare", "Civic", "Industrial"];
export const WORK_TYPES: { value: WorkType; label: string }[] = [
  { value: "new", label: "New construction" },
  { value: "renovation", label: "Renovation" },
  { value: "addition", label: "Addition" },
  { value: "both", label: "Renovation and addition" },
];
export const DELIVERY_METHODS: { value: DeliveryMethod; label: string }[] = [
  { value: "hard-bid", label: "Hard bid" },
  { value: "cmar", label: "CM at-risk (GMP)" },
  { value: "design-build", label: "Design-build" },
];
export const deliveryMethodLabel = (method: DeliveryMethod | null) => DELIVERY_METHODS.find(item => item.value === method)?.label ?? "Not recorded";
export const TAX_STATUSES: { value: TaxStatus; label: string }[] = [
  { value: "taxable", label: "Taxable" },
  { value: "non-taxable", label: "Non-taxable" },
];
/** Suggestions only; the form may submit any program name. */
export const CERTIFICATION_PROGRAMS = ["CBE", "MBE", "WBE", "SBE", "First Source"];

/** Names the create/edit form must use for its inputs. Repeated fields use FormData.getAll. */
export const PROJECT_FORM_FIELDS = {
  name: "name", location: "location", type: "type", value: "value", description: "description",
  squareFeet: "squareFeet", workType: "workType", renovationSquareFeet: "renovationSquareFeet", additionSquareFeet: "additionSquareFeet",
  taxStatus: "taxStatus", estimateStage: "estimateStage", deliveryMethod: "deliveryMethod", certifications: "certifications", rfp: "rfp", architect: "architect",
  due: "due", rfi: "rfi", start: "start", finish: "finish", teamName: "teamName", teamRole: "teamRole",
  scopesDue: "scopesDue", rfiResponses: "rfiResponses", drawingFlip: "drawingFlip", demolitionStart: "demolitionStart",
  jobWalk: "jobWalk", minBidders: "minBidders", wageScale: "wageScale",
} as const;

export type ProjectFormField = keyof typeof PROJECT_FORM_FIELDS;
export type ProjectFormErrors = Partial<Record<ProjectFormField, string>>;

export const squareFeetLabel = (squareFeet: number): string => squareFeet > 0 ? `${squareFeet.toLocaleString("en-US")} SF` : "Not recorded";

const sample = (p: Omit<Project, "renovationSquareFeet" | "additionSquareFeet" | "workType" | "taxStatus" | "estimateStage" | "deliveryMethod" | "certifications" | "team" | "kickoff" | "rfpFileName" | "createdAt">, extra: Partial<Project> = {}): Project =>
  ({ ...p, workType: null, renovationSquareFeet: 0, additionSquareFeet: 0, taxStatus: null, estimateStage: null, deliveryMethod: null, certifications: [], team: [], kickoff: EMPTY_KICKOFF, rfpFileName: "", createdAt: "2026-09-01", ...extra });

export const sampleProjectRecords: Project[] = [
  // Jelleff facts from Marcel's shared drive: the DD Budget (26,500 SF gross, DLR Group, DD total
  // $33,328,991; a "1st Source" wage premium row) and his step-by-step precon write-up (bid dates,
  // construction start). Tax status is not stated in the Jelleff documents, so it stays unrecorded.
  sample({ id: "jelleff", name: "Project 1", location: "Washington, DC", type: "Community & recreation", status: "Preconstruction", value: 33328991, squareFeet: 26500, architect: "Architect of record", description: "Modernization of a recreation center for a public owner: a new building, pool renovation, and sitework, delivered by Contractor as CM at-risk.", due: "2026-02-02", rfi: "2026-01-20", start: "2026-06-01", finish: "" },
    { deliveryMethod: "cmar", certifications: ["First Source"], team: [{ name: "Marcel Khoury", role: "Estimator" }, { name: "Chris Taylor", role: "Project executive" }],
      // From Marcel's Jelleff kickoff email (his precon write-up). Raze start was "between March and April 2026", so no date.
      kickoff: { ...EMPTY_KICKOFF, scopesDue: "2026-01-26", rfiResponses: "2026-01-27", drawingFlip: "2026-01-20", jobWalk: "N/A unless requested by your subcontractors", wageScale: true } }),
  sample({ id: "whittier", name: "Project 2", location: "Washington, DC", type: "Education", status: "Design development", value: 26800000, squareFeet: 68200, architect: "Campus design team", description: "A school modernization, classroom addition, and associated site work.", due: "2026-11-06", rfi: "2026-10-23", start: "2027-03-01", finish: "2028-08-18" }, { deliveryMethod: "cmar" }),
  sample({ id: "riverside", name: "Project 3", location: "Arlington, VA", type: "Mixed-use", status: "Bidding", value: 12300000, squareFeet: 31800, architect: "Project architect", description: "A mixed-use community space with new retail and public gathering areas.", due: "2026-10-16", rfi: "2026-10-02", start: "2027-02-01", finish: "2028-02-25" }, { deliveryMethod: "hard-bid" }),
];

const isWorkType = (v: unknown): v is WorkType => v === "new" || v === "renovation" || v === "addition" || v === "both";
const isTaxStatus = (v: unknown): v is TaxStatus => v === "taxable" || v === "non-taxable";
const isDeliveryMethod = (v: unknown): v is DeliveryMethod => DELIVERY_METHODS.some(item => item.value === v);
const text = (v: unknown) => typeof v === "string" ? v : "";
const count = (v: unknown) => typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.round(v) : 0;

/** Brings any stored record — including ones saved before the 20 Sep fields — to the current shape. */
/** A saved kickoff, or the empty one for records saved before kickoffs existed. */
export function normalizeKickoff(raw: unknown): Kickoff {
  const k = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const date = (v: unknown) => typeof v === "string" && ISO_DATE.test(v) ? v : "";
  const min = Number(k.minBidders);
  return {
    scopesDue: date(k.scopesDue), rfiResponses: date(k.rfiResponses), drawingFlip: date(k.drawingFlip), demolitionStart: date(k.demolitionStart),
    jobWalk: typeof k.jobWalk === "string" ? k.jobWalk.trim().slice(0, 300) : "",
    minBidders: Number.isInteger(min) && min >= 1 && min <= 10 ? min : EMPTY_KICKOFF.minBidders,
    wageScale: typeof k.wageScale === "boolean" ? k.wageScale : null,
  };
}

export function normalizeProject(raw: Record<string, unknown>): Project {
  // Records saved before squareFeet existed held the area as display text in `size`, e.g. "42,500 SF".
  const legacyArea = Number(text(raw.size).replace(/[^\d.]/g, "")) || 0;
  const squareFeet = count(raw.squareFeet) || count(legacyArea);
  const workType = isWorkType(raw.workType) ? raw.workType : null;
  const split = areaSplit(workType, squareFeet, count(raw.renovationSquareFeet), count(raw.additionSquareFeet));
  return {
    id: text(raw.id), name: text(raw.name), location: text(raw.location), type: text(raw.type), status: text(raw.status) || "Preconstruction",
    value: typeof raw.value === "number" && raw.value >= 0 ? raw.value : 0,
    architect: text(raw.architect), description: text(raw.description),
    due: text(raw.due), rfi: text(raw.rfi), start: text(raw.start), finish: text(raw.finish),
    ...split, workType,
    taxStatus: isTaxStatus(raw.taxStatus) ? raw.taxStatus : null,
    estimateStage: ESTIMATE_STAGES.some(stage => stage.value === raw.estimateStage) ? raw.estimateStage as EstimateStage : null,
    // A sample project saved before delivery methods existed gets the sample's; any other old record stays unrecorded.
    deliveryMethod: isDeliveryMethod(raw.deliveryMethod) ? raw.deliveryMethod : raw.deliveryMethod === undefined ? sampleProjectRecords.find(p => p.id === raw.id)?.deliveryMethod ?? null : null,
    certifications: Array.isArray(raw.certifications) ? raw.certifications.filter((c): c is string => typeof c === "string" && !!c.trim()) : [],
    team: Array.isArray(raw.team) ? raw.team.filter((m): m is TeamMember => !!m && typeof m.name === "string" && typeof m.role === "string") : [],
    // A Jelleff record saved before kickoffs existed gets the sample's (Marcel's kickoff email); the sample refresh never touches project records.
    kickoff: raw.kickoff === undefined && raw.id === "jelleff" ? sampleProjectRecords[0].kickoff : normalizeKickoff(raw.kickoff),
    rfpFileName: text(raw.rfpFileName), createdAt: text(raw.createdAt),
  };
}

/** Keeps total = renovation + addition. For a single work type the whole area belongs to it; new construction has no split. */
function areaSplit(workType: WorkType | null, total: number, renovation: number, addition: number) {
  if (workType === "both") return { squareFeet: renovation + addition, renovationSquareFeet: renovation, additionSquareFeet: addition };
  if (workType === "renovation") return { squareFeet: total, renovationSquareFeet: total, additionSquareFeet: 0 };
  if (workType === "addition") return { squareFeet: total, renovationSquareFeet: 0, additionSquareFeet: total };
  return { squareFeet: total, renovationSquareFeet: 0, additionSquareFeet: 0 };
}

/**
 * A saved Jelleff record whose architect is still the old placeholder ("Project design team",
 * never a real value) predates the real project facts: it is replaced with them. A record whose
 * architect was edited is left exactly as saved.
 */
function upgradeUntouchedSample(raw: Record<string, unknown>): Record<string, unknown> {
  return raw.id === "jelleff" && raw.architect === "Project design team" ? sampleProjectRecords[0] : raw;
}

/** Saved projects for this browser, or null when there is nothing usable stored. */
export function loadProjects(): Project[] | null {
  try {
    const saved = JSON.parse(localStorage.getItem(PROJECTS_STORAGE_KEY) || "null");
    if (Array.isArray(saved) && saved.length && saved.every(p => p && p.id && p.name)) return saved.map(upgradeUntouchedSample).map(normalizeProject);
  } catch { /* An unreadable store falls back to the sample projects. */ }
  return null;
}

export function saveProjects(projects: Project[]): void {
  try {
    localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(projects));
  } catch { /* Keep the session editable when storage is full. */ }
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Reads the create/edit form (inputs named per PROJECT_FORM_FIELDS) and validates it.
 * Returns `project` only when `errors` is empty. Pass `existing` when editing so the id,
 * status and creation date are kept.
 */
export function parseProjectForm(form: FormData, existing?: Project): { project?: Project; errors: ProjectFormErrors } {
  const f = PROJECT_FORM_FIELDS;
  const get = (name: string) => String(form.get(name) ?? "").trim();
  const num = (name: string) => { const v = get(name).replace(/[,\s$]/g, ""); return v === "" ? NaN : Number(v); };
  const errors: ProjectFormErrors = {};

  const name = get(f.name), location = get(f.location), type = get(f.type);
  if (!name) errors.name = "Enter a project name.";
  if (!location) errors.location = "Enter the project location.";
  if (!type) errors.type = "Choose a project type.";

  const value = get(f.value) === "" ? 0 : num(f.value);
  if (!(value >= 0)) errors.value = "Enter the internal project value as a number, or leave it blank.";

  const workTypeRaw = get(f.workType);
  const workType = isWorkType(workTypeRaw) ? workTypeRaw : null;
  if (!workType) errors.workType = "Choose new construction, renovation, addition, or both.";

  const positive = (field: ProjectFormField, message: string) => {
    const v = num(PROJECT_FORM_FIELDS[field]);
    if (!(v > 0)) { errors[field] = message; return 0; }
    return Math.round(v);
  };
  let renovation = 0, addition = 0, total = 0;
  if (workType === "both") {
    renovation = positive("renovationSquareFeet", "Enter the renovation area in square feet.");
    addition = positive("additionSquareFeet", "Enter the addition area in square feet.");
  } else {
    total = positive("squareFeet", "Enter the project size in square feet.");
  }

  const taxRaw = get(f.taxStatus);
  const taxStatus = isTaxStatus(taxRaw) ? taxRaw : null;
  if (!taxStatus) errors.taxStatus = "Choose taxable or non-taxable.";
  const stageRaw = get(f.estimateStage);
  const estimateStage = ESTIMATE_STAGES.some(stage => stage.value === stageRaw) ? stageRaw as EstimateStage : null;
  if (!estimateStage) errors.estimateStage = "Choose the estimate stage.";
  const methodRaw = get(f.deliveryMethod);
  const deliveryMethod = isDeliveryMethod(methodRaw) ? methodRaw : null;
  if (!deliveryMethod) errors.deliveryMethod = "Choose hard bid, CM at-risk or design-build.";

  const dates = { due: get(f.due), rfi: get(f.rfi), start: get(f.start), finish: get(f.finish) };
  for (const key of ["due", "rfi", "start", "finish"] as const) {
    if (dates[key] && !ISO_DATE.test(dates[key])) errors[key] = "Use a valid date.";
  }
  if (!errors.rfi && !errors.due && dates.rfi && dates.due && dates.rfi > dates.due) errors.rfi = "The pre-bid RFI deadline must be on or before the bid deadline.";
  if (!errors.start && !errors.finish && dates.start && dates.finish && dates.start > dates.finish) errors.finish = "Completion must be on or after the construction start.";

  // Kickoff fields the form leaves out keep their saved value, so an older form never wipes them.
  const kept = existing?.kickoff ?? EMPTY_KICKOFF;
  const kickoff: Kickoff = { ...kept };
  for (const key of KICKOFF_DATES) if (form.has(f[key])) {
    const v = get(f[key]);
    if (v && !ISO_DATE.test(v)) errors[key] = "Use a valid date."; else kickoff[key] = v;
  }
  if (!errors.scopesDue && kickoff.scopesDue && dates.due && kickoff.scopesDue > dates.due) errors.scopesDue = "Scopes go to subcontractors before the bid due date.";
  if (form.has(f.jobWalk)) kickoff.jobWalk = get(f.jobWalk).slice(0, 300);
  if (form.has(f.minBidders)) {
    const min = get(f.minBidders) === "" ? EMPTY_KICKOFF.minBidders : num(f.minBidders);
    if (!Number.isInteger(min) || min < 1 || min > 10) errors.minBidders = "Enter how many bids each trade needs, from 1 to 10."; else kickoff.minBidders = min;
  }
  if (form.has(f.wageScale)) { const w = get(f.wageScale); kickoff.wageScale = w === "yes" ? true : w === "no" ? false : null; }

  const certifications = [...new Set(form.getAll(f.certifications).map(c => String(c).trim()).filter(Boolean))];
  const names = form.getAll(f.teamName).map(v => String(v).trim());
  const roles = form.getAll(f.teamRole).map(v => String(v).trim());
  const team = names.map((memberName, i) => ({ name: memberName, role: roles[i] ?? "" })).filter(m => m.name);
  const rfp = form.get(f.rfp);
  const rfpFileName = rfp && typeof rfp === "object" && "name" in rfp ? String(rfp.name) : existing?.rfpFileName ?? "";

  if (Object.keys(errors).length) return { errors };
  const split = areaSplit(workType, total, renovation, addition);
  return {
    errors,
    project: {
      id: existing?.id ?? crypto.randomUUID(),
      status: existing?.status ?? "Preconstruction",
      createdAt: existing?.createdAt ?? new Date().toISOString().slice(0, 10),
      name, location, type, value, description: get(f.description), architect: get(f.architect),
      ...dates, ...split, workType, taxStatus, estimateStage, deliveryMethod, certifications, team, kickoff, rfpFileName,
    },
  };
}

// ── Demo projects ───────────────────────────────────────────────────────────
// "Create a demo project" (Danial, 28 Oct: a button that fills in random info, for testing uploads and the AI
// without typing the form). Made-up details of the kind the form asks for, read through parseProjectForm so a
// demo project is exactly what the form would have created.
const DEMO_PLACES = ["Maple Street", "Riverside", "Oak Hill", "Harbor View", "Cedar Park", "Brookside", "Summit", "Lakeview"];
const DEMO_CITIES = ["Washington, DC", "Arlington, VA", "Alexandria, VA", "Silver Spring, MD", "Baltimore, MD", "Richmond, VA"];
const DEMO_BUILDINGS: Record<string, string> = {
  "Community & recreation": "Recreation Center", Education: "Elementary School", Commercial: "Office Building", "Mixed-use": "Mixed-Use Building",
  Residential: "Apartments", Healthcare: "Health Clinic", Civic: "Public Library", Industrial: "Distribution Warehouse",
};

/** A project with random, realistic details, as the New project form would create it. `random` returns [0, 1). */
export function demoProject(random: () => number = Math.random, today = new Date()): Project {
  const pick = <T,>(list: readonly T[]): T => list[Math.floor(random() * list.length) % list.length];
  const between = (low: number, high: number, step = 1) => Math.round((low + random() * (high - low)) / step) * step;
  const day = (offset: number) => new Date(today.getTime() + offset * 86_400_000).toISOString().slice(0, 10);
  const type = pick(PROJECT_TYPES), workType = pick(WORK_TYPES).value;
  const area = between(12_000, 90_000, 100), due = between(21, 60), start = due + between(60, 120);
  const f = PROJECT_FORM_FIELDS, form = new FormData();
  const set = (name: string, value: string | number) => form.set(name, String(value));
  set(f.name, `Demo · ${pick(DEMO_PLACES)} ${DEMO_BUILDINGS[type] ?? "Building"}`);
  set(f.location, pick(DEMO_CITIES));
  set(f.type, type);
  set(f.workType, workType);
  if (workType === "both") { const renovation = between(0.3 * area, 0.7 * area, 100); set(f.renovationSquareFeet, renovation); set(f.additionSquareFeet, area - renovation); }
  else set(f.squareFeet, area);
  set(f.value, area * between(350, 650, 5));
  set(f.taxStatus, pick(TAX_STATUSES).value);
  set(f.estimateStage, pick(ESTIMATE_STAGES).value);
  set(f.deliveryMethod, pick(DELIVERY_METHODS).value);
  set(f.architect, "Demo Design Studio");
  set(f.description, `A demo ${pick(WORK_TYPES).label.toLowerCase()} project for trying Structor: upload a drawing set and a project manual and the AI sets the bid packages.`);
  set(f.due, day(due)); set(f.rfi, day(due - 10)); set(f.start, day(start)); set(f.finish, day(start + between(420, 720)));
  if (random() < 0.5) form.append(f.certifications, pick(CERTIFICATION_PROGRAMS));
  form.append(f.teamName, "Marcel Khoury"); form.append(f.teamRole, "Estimator");
  const { project, errors } = parseProjectForm(form);
  if (!project) throw new Error(`The demo project didn't pass the form's checks: ${Object.values(errors).join(" ")}`);
  return project;
}

export function filterProjects(projects: Project[], query: string, tab: string): Project[] {
  const q = query.trim().toLowerCase();
  return projects.filter(p =>
    p.name.toLowerCase().includes(q) && (tab === PROJECT_TABS[0] || p.status === tab));
}
