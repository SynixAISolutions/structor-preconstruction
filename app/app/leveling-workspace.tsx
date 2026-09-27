"use client";

import {
  ArrowRight,
  AlertTriangle,
  BookOpen,
  Calculator,
  Check,
  ChevronDown,
  CircleHelp,
  ClipboardList,
  Download,
  FileSearch,
  FileText,
  FolderKanban,
  Library,
  Mail,
  Paperclip,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Settings,
  SlidersHorizontal,
  Upload,
  UserPlus,
  X,
} from "lucide-react";
import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { initialBidders } from "../lib/data/commercial";
import { buildLevelingImport, type BidProvenance, type LevelingImportIssue } from "../lib/leveling-import";
import { bidderTotals, rankedBidders, responseNeedsReview } from "../lib/leveling.mjs";
import { useLocalDraft } from "../lib/use-local-draft";
import { useSubmissions } from "../lib/use-submissions";
import { clearWorkspace, loadWorkspace, saveWorkspace } from "../lib/workspace-storage";
import "./ui/leveling-extras.css";

type ScopeStatus = "" | "Y" | "N" | "P" | "N/A";
type Response = {
  status: ScopeStatus;
  note: string;
  adjustment: number;
  resolved?: boolean;
  adjustmentApproved?: boolean;
  sourceStatus?: string;
  sourceNote?: string;
  sourceRawValue?: unknown;
};
type ScopeItem = {
  id: string;
  number: string;
  description: string;
  section: string;
  required: boolean;
  source: string;
  estimatorNote: string;
  sourceRow?: number;
  rowKind?: string;
  scopeMarker?: string;
  includeInTotal?: boolean;
  sourceSection?: string;
  sourceDescription?: string;
  sourceEstimatorNote?: string;
};
type Bidder = {
  id: string;
  name: string;
  contact: string;
  baseBid: number | null;
  bondRate?: number;
  sourceSlot?: number;
  sourceStatus?: string;
  sourceEligibility?: string;
  sourceRank?: number | string | null;
  zeroPriceApproved?: boolean;
  responses: Record<string, Response>;
};
type Project = {
  name: string;
  trade: string;
  budget: number;
  sheetName?: string;
  mappingId?: string;
  isDemo?: boolean;
  sourceName?: string;
  sourceTrade?: string;
  sourceBudget?: number;
  sourceNameFormula?: boolean;
  sourceTradeFormula?: boolean;
  sourceBudgetFormula?: boolean;
};
type RankedBidder = {
  bidder: Bidder;
  adjustment: number;
  subtotal: number;
  bond: number;
  total: number;
  provisionalTotal: number | null;
  reviewedTotal: number;
  exceptions: number;
  rank: number;
};
type GmailAttachment = { id: string; name: string; mimeType: string };
type GmailMessage = {
  id: string;
  sender: string;
  subject: string;
  date: string;
  snippet: string;
  attachments: GmailAttachment[];
};

type WorkbookImport = {
  fileName?: string;
  originalBytes: Uint8Array;
  project: Project;
  items: ScopeItem[];
  bidders: Bidder[];
  source: { sheetName: string; mappingId?: string; availableBidderSlots?: number[] };
  summary: { scopeItemCount?: number; bidderCount?: number };
  warnings: { code: string; message: string }[];
};

type WorkbookExport = {
  ok: boolean;
  bytes?: Uint8Array;
  warnings: { code: string; message: string }[];
  errors: { code: string; field: string; message: string }[];
  changes: { sheetName: string; address: string }[];
};

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

const BIDDER_SLOT_COUNT = 7;
const demoProject: Project = { name: "Jelleff Recreation Center", trade: "02 40 00 — Demolition", budget: 320000, sheetName: "Demo", isDemo: true };

const glossaryTerms = [
  ["Scope sheet", "The trade checklist used to make every bidder price the same required work."],
  ["Scope item", "One requirement a bidder must include, exclude, or clarify in its proposal."],
  ["Trade / CSI division", "A construction work category, such as demolition, drywall, electrical, or plumbing."],
  ["Bidder", "A subcontractor or supplier submitting a price for the selected trade."],
  ["Proposal", "The bidder's priced offer, usually received as an email attachment or PDF."],
  ["Base bid", "The bidder's submitted price before leveling adjustments, bond, or accepted alternates."],
  ["Y — Yes", "The bidder clearly includes the scope item."],
  ["N — No", "The bidder excludes the item. The reviewer must resolve the gap and may add an adjustment."],
  ["P — Partial", "The bidder includes only part of the item or adds a condition. The reviewer must clarify it."],
  ["N/A", "The item does not apply to that bidder, with a reviewer note explaining why."],
  ["Blank / unknown", "The proposal does not provide enough evidence. It remains an open exception."],
  ["Exception", "Any unanswered, excluded, partial, or otherwise unresolved scope item needing review."],
  ["Adjustment", "An estimated amount added or deducted to compare bidders on equivalent scope."],
  ["Approved adjustment", "An adjustment a reviewer has checked and allowed into the reviewed total."],
  ["Bond", "A bid or performance/payment bond cost calculated using the bidder's stated rate."],
  ["Provisional total", "Base bid plus entered adjustments and bond, even while review items remain open."],
  ["Reviewed leveled total", "The comparable total shown in ranking only after every required check is complete."],
  ["FULL SCOPE", "A workbook-level indication that the bid is intended to be considered for leveling."],
  ["NO — do not level", "A workbook-level instruction that the bid must not enter the ranked comparison."],
  ["Low submitted bid", "The lowest raw base bid before adjustments or scope review."],
  ["Variance to budget", "How far the reviewed leveled low bid is above or below the project budget."],
  ["RFI", "Request for Information: a formal question raised when drawings or specifications are unclear."],
  ["Takeoff", "Measured quantities from the drawings, such as area, length, count, or volume."],
] as const;

const seedItems: ScopeItem[] = [
  { id: "general-1", number: "1", description: "Acknowledge all drawings, specifications, RFIs, bid notices and logistics requirements", section: "Section 1 — General", required: true, source: "Not linked yet", estimatorNote: "", sourceRow: 15 },
  { id: "scope-1", number: "3", description: "Demolition of existing building structure in its entirety", section: "Section 3 — Scope of Work", required: true, source: "Not linked yet", estimatorNote: "", sourceRow: 37 },
  { id: "scope-2", number: "4", description: "Conduct structural demolition including exterior walls, roof, floor structure, slabs and footings", section: "Section 3 — Scope of Work", required: true, source: "Not linked yet", estimatorNote: "", sourceRow: 38 },
  { id: "scope-3", number: "8", description: "Remove existing roof drains, rooftop equipment, curbs and flashing", section: "Section 3 — Scope of Work", required: true, source: "Not linked yet", estimatorNote: "", sourceRow: 42 },
  { id: "scope-4", number: "14", description: "Protect historic tree areas and all existing portions designated to remain", section: "Section 3 — Scope of Work", required: true, source: "Not linked yet", estimatorNote: "", sourceRow: 48 },
  { id: "scope-5", number: "19", description: "Coordinate removal of foundation walls with excavation, layback and backfill", section: "Section 3 — Scope of Work", required: true, source: "Not linked yet", estimatorNote: "", sourceRow: 53 },
  { id: "scope-6", number: "25", description: "Include multiple mobilizations required for the work", section: "Standard / General Scope", required: true, source: "Not linked yet", estimatorNote: "", sourceRow: 59 },
  { id: "scope-7", number: "26", description: "Provide traffic control required for the work", section: "Standard / General Scope", required: true, source: "Not linked yet", estimatorNote: "", sourceRow: 60 },
];

function response(status: ScopeStatus = "Y", note = "", adjustment = 0, reviewed = adjustment === 0): Response {
  return {
    status,
    note,
    adjustment,
    resolved: status === "Y" || reviewed,
    adjustmentApproved: adjustment === 0 || reviewed,
  };
}

function seedResponses(changes: Record<string, Response> = {}) {
  return Object.fromEntries(seedItems.map((item) => [item.id, changes[item.id] ?? response()]));
}

function emptyResponses(items: ScopeItem[]) {
  return Object.fromEntries(items.map((item) => [item.id, response("")]));
}

function attachmentHref(messageId: string, attachment: GmailAttachment) {
  return `/api/gmail/attachment?${new URLSearchParams({
    messageId,
    attachmentId: attachment.id,
    filename: attachment.name,
    mimeType: attachment.mimeType,
  })}`;
}

const seedBidders: Bidder[] = [
  { id: "celtic", name: "Celtic Demo", contact: "Alex Bruns", baseBid: 290000, bondRate: 0.02, responses: seedResponses() },
  { id: "marcs", name: "Marc's Demo", contact: "Marc Dardaghani", baseBid: 240000, bondRate: 0.02, responses: seedResponses({ "scope-3": response("P", "Make safe by others", 12000, true), "scope-4": response("P", "Tree protection by others", 4500, true) }) },
  { id: "aceco", name: "ACECO", contact: "", baseBid: 358597, bondRate: 0.02, responses: seedResponses({ "scope-5": response("P", "Excavation by others", 8500, true) }) },
  { id: "berg", name: "Berg Demo", contact: "Shawn Wells", baseBid: 154826, bondRate: 0.02, responses: seedResponses({ "scope-6": response("N", "Single mobilization", 18000, true), "scope-7": response("P", "Flagger only", 7200, true) }) },
];

function normalizeImportedBidder(bidder: Bidder): Bidder {
  const sourceEligible = String(bidder.sourceEligibility ?? bidder.sourceStatus ?? "").trim().toUpperCase() === "FULL SCOPE";
  return {
    ...bidder,
    baseBid: typeof bidder.baseBid === "number" && Number.isFinite(bidder.baseBid) ? bidder.baseBid : null,
    bondRate: typeof bidder.bondRate === "number" ? bidder.bondRate : 0.02,
    sourceEligibility: bidder.sourceEligibility ?? bidder.sourceStatus,
    responses: Object.fromEntries(Object.entries(bidder.responses ?? {}).map(([itemId, answer]) => [itemId, {
      ...answer,
      status: answer.status ?? "",
      note: answer.note ?? "",
      adjustment: Number.isFinite(answer.adjustment) ? answer.adjustment : 0,
      resolved: answer.resolved ?? (answer.status === "Y" || (sourceEligible && Boolean(answer.status))),
      adjustmentApproved: answer.adjustmentApproved ?? true,
    }])),
  };
}

function bytesToArrayBuffer(bytes: Uint8Array) {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

export default function BidLevelingPage({ projectName }: { projectName: string }) {
  const { projectId, procurement, submissions } = useSubmissions();
  const [directory] = useLocalDraft("directory", initialBidders);
  const [submissionProvenance, setSubmissionProvenance] = useLocalDraft<Record<string, BidProvenance>>("leveling-submission-provenance", {});
  const [loadedPackageId, setLoadedPackageId] = useLocalDraft("leveling-submission-package", "");
  const [project, setProject] = useState<Project>(demoProject);
  const [items, setItems] = useState(seedItems);
  const [bidders, setBidders] = useState(seedBidders);
  const [selectedId, setSelectedId] = useState(seedItems[2].id);
  const [exceptionsOnly, setExceptionsOnly] = useState(false);
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("Loading saved workspace…");
  const [saveState, setSaveState] = useState("Loading…");
  const [storageReady, setStorageReady] = useState(false);
  const [storageEnabled, setStorageEnabled] = useState(true);
  const [pendingImport, setPendingImport] = useState<WorkbookImport | null>(null);
  const [glossaryOpen, setGlossaryOpen] = useState(false);
  const [walkthroughOpen, setWalkthroughOpen] = useState(false);
  const [costSuggestionsOpen, setCostSuggestionsOpen] = useState(false);
  const [editingBidderId, setEditingBidderId] = useState<string | "new" | null>(null);
  const [reviewBidderId, setReviewBidderId] = useState<string | null>(null);
  const [sourcePackageId, setSourcePackageId] = useState("");
  const [submissionIssues, setSubmissionIssues] = useState<LevelingImportIssue[]>([]);
  const [mailOpen, setMailOpen] = useState(false);
  const [mailLoading, setMailLoading] = useState(false);
  const [mailNeedsConnection, setMailNeedsConnection] = useState(false);
  const [mailError, setMailError] = useState("");
  const [mailMessages, setMailMessages] = useState<GmailMessage[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const workbookRef = useRef<ArrayBuffer | null>(null);
  const saveSequenceRef = useRef(0);

  useEffect(() => {
    if (sourcePackageId && procurement.packages.some((pkg) => pkg.id === sourcePackageId)) return;
    const submittedPackage = procurement.packages.find((pkg) => submissions.some((submission) => submission.packageId === pkg.id && submission.revisions.length));
    setSourcePackageId(submittedPackage?.id ?? procurement.packages.find((pkg) => pkg.published)?.id ?? procurement.packages[0]?.id ?? "");
  }, [procurement.packages, sourcePackageId, submissions]);

  useEffect(() => {
    let active = true;
    void loadWorkspace<Project, ScopeItem, Bidder>().then((saved) => {
      if (!active) return;
      if (saved) {
        setProject(saved.project);
        setItems(saved.items);
        setBidders(saved.bidders.map(normalizeImportedBidder));
        setSelectedId(saved.items[0]?.id ?? "");
        workbookRef.current = saved.originalWorkbook ?? null;
        setMessage(`Restored your workspace from ${new Date(saved.savedAt).toLocaleString()}`);
        setSaveState("Saved locally");
      } else {
        setMessage("Demo data loaded. Import Marcel's workbook to start real work.");
        setSaveState("Not saved yet");
      }
      setStorageReady(true);
    }).catch((error) => {
      if (!active) return;
      setStorageEnabled(false);
      setStorageReady(true);
      setSaveState("Save unavailable");
      setMessage(error instanceof Error ? error.message : "Saved work could not be loaded.");
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!storageReady || !storageEnabled) return;
    const sequence = ++saveSequenceRef.current;
    setSaveState("Saving…");
    const timer = window.setTimeout(() => {
      void saveWorkspace({ project, items, bidders }).then(({ savedAt }) => {
        if (sequence === saveSequenceRef.current) setSaveState(`Saved ${new Date(savedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`);
      }).catch((error) => {
        if (sequence !== saveSequenceRef.current) return;
        setStorageEnabled(false);
        setSaveState("Save failed");
        setMessage(error instanceof Error ? error.message : "The workspace could not be saved. Download a JSON backup before leaving.");
      });
    }, 350);
    return () => window.clearTimeout(timer);
  }, [bidders, items, project, storageEnabled, storageReady]);

  useEffect(() => {
    const gmailResult = new URLSearchParams(window.location.search).get("gmail");
    if (gmailResult === "connected") setMessage("Gmail connected. Your bid workspace was restored.");
    if (gmailResult === "failed") setMessage("Gmail could not be connected. Your bid workspace is still available.");
  }, []);

  const selected = items.find((item) => item.id === selectedId);
  const ranked = useMemo<RankedBidder[]>(() => rankedBidders(bidders, items) as RankedBidder[], [bidders, items]);
  const lowBid = ranked[0];
  const totalsByBidder = useMemo(() => new Map(bidders.map((bidder) => [bidder.id, bidderTotals(bidder, items)])), [bidders, items]);
  const reviewBidders = bidders.filter((bidder) => totalsByBidder.get(bidder.id)?.sourceEligibility !== "ineligible");
  const requiredItems = items.filter((item) => item.required);
  const requiredCheckCount = requiredItems.length * reviewBidders.length;
  const openReviewCount = requiredItems.reduce((count, item) => count + reviewBidders.filter((bidder) => responseNeedsReview(item, bidder.responses[item.id])).length, 0);
  const reviewPercent = requiredCheckCount ? Math.round(((requiredCheckCount - openReviewCount) / requiredCheckCount) * 100) : 0;
  const reviewedBidderCount = [...totalsByBidder.values()].filter((total) => total.eligible).length;
  const openItemIds = items.filter((item) => reviewBidders.some((bidder) => responseNeedsReview(item, bidder.responses[item.id]))).map((item) => item.id);
  const submittedBids = bidders
    .map((bidder) => bidder.baseBid)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0);
  const lowSubmittedBid = submittedBids.length ? Math.min(...submittedBids) : null;
  const visibleItems = items.filter((item) => {
    const matchesQuery = !query || `${item.number} ${item.description} ${item.section}`.toLowerCase().includes(query.toLowerCase());
    const matchesExceptions = !exceptionsOnly || reviewBidders.some((bidder) => responseNeedsReview(item, bidder.responses[item.id]));
    return matchesQuery && matchesExceptions;
  });
  const sections = [...new Set(visibleItems.map((item) => item.section))];
  const submissionCounts = useMemo(() => new Map(procurement.packages.map((pkg) => [
    pkg.id,
    submissions.filter((submission) => submission.packageId === pkg.id && submission.revisions.length).length,
  ])), [procurement.packages, submissions]);
  const loadedPackage = procurement.packages.find((pkg) => pkg.id === loadedPackageId);

  function loadSubmittedBids(revisions?: Record<string, number>, packageId = sourcePackageId) {
    if (!packageId) {
      setSubmissionIssues([{ code: "package-missing", message: "Choose a trade package before loading submitted bids." }]);
      return;
    }
    const result = buildLevelingImport({
      projectId,
      projectName,
      packageId,
      procurement,
      submissions,
      directory,
      budget: project.name === projectName && !project.isDemo ? project.budget : 0,
      revisions,
    });
    setSubmissionIssues(result.issues);
    if (!result.items.length || !result.bidders.length) {
      setMessage(result.issues.map((issue) => issue.message).join(" ") || "No submitted bids are ready for leveling.");
      return;
    }
    workbookRef.current = null;
    setProject(result.project);
    setItems(result.items);
    setBidders(result.bidders.map((bidder) => normalizeImportedBidder(bidder as Bidder)));
    setSelectedId(result.items[0]?.id ?? "");
    setSubmissionProvenance(result.provenance);
    setLoadedPackageId(packageId);
    setStorageEnabled(true);
    setStorageReady(true);
    setSaveState("Saving…");
    const staleCount = result.issues.filter((issue) => issue.code === "stale-form").length;
    setMessage(`Loaded ${result.bidders.length} submitted bid${result.bidders.length === 1 ? "" : "s"} for ${result.project.trade}.${staleCount ? ` ${staleCount} older-form bid${staleCount === 1 ? " is" : "s are"} shown but cannot be ranked.` : " Review every exception before ranking."}`);
  }

  function loadSubmissionRevision(provenance: BidProvenance, revisionNumber: number) {
    const revisions = Object.fromEntries(Object.values(submissionProvenance).map((item) => [item.submissionId, item.revisionNumber]));
    revisions[provenance.submissionId] = revisionNumber;
    setReviewBidderId(null);
    setSourcePackageId(provenance.packageId);
    loadSubmittedBids(revisions, provenance.packageId);
  }

  function goToNextException() {
    if (!openItemIds.length) {
      setMessage("Every scope response is reviewed.");
      return;
    }
    const currentIndex = openItemIds.indexOf(selectedId);
    const nextId = openItemIds[(currentIndex + 1) % openItemIds.length];
    setQuery("");
    setExceptionsOnly(true);
    setSelectedId(nextId);
    setMessage(`Showing the next open scope item. Review the highlighted bidder cells (${openItemIds.length} items remain).`);
    window.requestAnimationFrame(() => document.getElementById(`scope-row-${nextId}`)?.scrollIntoView({ behavior: "smooth", block: "center" }));
  }

  function updateResponse(bidderId: string, itemId: string, patch: Partial<Response>) {
    setBidders((current) => current.map((bidder) => bidder.id !== bidderId ? bidder : {
      ...bidder,
      responses: {
        ...bidder.responses,
        [itemId]: {
          ...response(""),
          ...bidder.responses[itemId],
          ...patch,
          ...("status" in patch ? { resolved: false } : {}),
          ...("adjustment" in patch ? { adjustmentApproved: Number(patch.adjustment) === 0 } : {}),
        },
      },
    }));
  }

  function updateSelected(patch: Partial<ScopeItem>) {
    if (!selected) return;
    const selectedItemId = selected.id;
    setItems((current) => current.map((item) => item.id === selectedItemId ? { ...item, ...patch } : item));
  }

  function saveBidder(details: Pick<Bidder, "name" | "contact" | "baseBid" | "bondRate" | "zeroPriceApproved" | "sourceStatus">) {
    if (editingBidderId === "new") {
      if (bidders.length >= BIDDER_SLOT_COUNT) {
        setMessage(`The current workbook template supports ${BIDDER_SLOT_COUNT} bidder slots.`);
        return;
      }
      const usedSlots = new Set(bidders.map((bidder) => bidder.sourceSlot).filter((slot): slot is number => typeof slot === "number"));
      const sourceSlot = Array.from({ length: BIDDER_SLOT_COUNT }, (_, index) => index).find((slot) => !usedSlots.has(slot));
      setBidders((current) => [...current, {
        id: `bidder-${crypto.randomUUID()}`,
        ...details,
        sourceSlot,
        sourceEligibility: details.sourceStatus,
        responses: emptyResponses(items),
      }]);
      setMessage(`Added ${details.name}`);
    } else if (editingBidderId) {
      setBidders((current) => current.map((bidder) => bidder.id === editingBidderId ? { ...bidder, ...details, sourceEligibility: details.sourceStatus } : bidder));
      setMessage(`Updated ${details.name}`);
    }
    setEditingBidderId(null);
  }

  async function loadMailbox() {
    setMailLoading(true);
    setMailError("");
    setMailNeedsConnection(false);
    try {
      const response = await fetch("/api/gmail/messages", { cache: "no-store" });
      const payload = await response.json() as { messages?: GmailMessage[]; error?: string };
      if (!response.ok) {
        setMailNeedsConnection(response.status === 401);
        throw new Error(payload.error || "Gmail could not be loaded.");
      }
      setMailMessages(payload.messages || []);
    } catch (error) {
      setMailError(error instanceof Error ? error.message : "Gmail could not be loaded.");
    } finally {
      setMailLoading(false);
    }
  }

  function openMailbox() {
    setMailOpen(true);
    void loadMailbox();
  }

  async function importWorkbook(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      setMessage(`Reading ${file.name}…`);
      const { importBidWorkbook } = await import("../lib/workbook.mjs");
      const imported = importBidWorkbook(new Uint8Array(await file.arrayBuffer())) as unknown as WorkbookImport;
      setPendingImport({ ...imported, fileName: file.name });
      setMessage(`Review the detected ${imported.source.sheetName} trade before replacing your workspace.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not read this workbook.");
    } finally {
      event.target.value = "";
    }
  }

  async function confirmImport() {
    if (!pendingImport) return;
    const originalWorkbook = bytesToArrayBuffer(pendingImport.originalBytes);
    const importedProject: Project = {
      ...pendingImport.project,
      sheetName: pendingImport.source.sheetName,
      mappingId: pendingImport.source.mappingId,
      isDemo: false,
    };
    const importedBidders = pendingImport.bidders.map(normalizeImportedBidder);
    try {
      const saved = await saveWorkspace({ project: importedProject, items: pendingImport.items, bidders: importedBidders }, originalWorkbook);
      workbookRef.current = originalWorkbook;
      setProject(importedProject);
      setItems(pendingImport.items);
      setBidders(importedBidders);
      setSelectedId(pendingImport.items[0]?.id ?? "");
      setSubmissionProvenance({});
      setLoadedPackageId("");
      setSubmissionIssues([]);
      setStorageEnabled(true);
      setStorageReady(true);
      setSaveState(`Saved ${new Date(saved.savedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`);
      const warning = pendingImport.warnings.length ? ` ${pendingImport.warnings.length} import warning${pendingImport.warnings.length === 1 ? "" : "s"} need review.` : "";
      setMessage(`Imported ${pendingImport.items.length} scope requirements and ${importedBidders.length} bidders from ${pendingImport.source.sheetName}.${warning}`);
      setPendingImport(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The imported workbook could not be saved safely.");
      setSaveState("Save failed");
    }
  }

  async function exportWorkbook() {
    if (!workbookRef.current) {
      setMessage("Import the approved source workbook before exporting Excel. Your local demo and new rows can still be downloaded as a JSON backup.");
      return;
    }
    try {
      const { exportBidWorkbook } = await import("../lib/workbook.mjs");
      const exported = exportBidWorkbook(new Uint8Array(workbookRef.current), { project, items, bidders }) as unknown as WorkbookExport;
      if (!exported.ok || !exported.bytes) {
        throw new Error(exported.errors.map((error) => error.message).join(" ") || "The workbook export was blocked to prevent data loss.");
      }
      const download = document.createElement("a");
      download.href = URL.createObjectURL(new Blob([bytesToArrayBuffer(exported.bytes)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
      download.download = `${project.name.replaceAll(/[^a-z0-9]+/gi, "-")}-${project.trade.split("—")[0].trim()}-reviewed.xlsx`;
      download.click();
      URL.revokeObjectURL(download.href);
      const warning = exported.warnings.length ? ` ${exported.warnings.map((item) => item.message).join(" ")}` : " Open it in Excel to recalculate formulas.";
      setMessage(`Exported ${exported.changes.length} mapped changes into a preserved copy of the source workbook.${warning}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The workbook could not be exported safely.");
    }
  }

  function downloadBackup() {
    const blob = new Blob([JSON.stringify({ schemaVersion: 1, project, items, bidders }, null, 2)], { type: "application/json" });
    const download = document.createElement("a");
    download.href = URL.createObjectURL(blob);
    download.download = `${project.name.replaceAll(/[^a-z0-9]+/gi, "-") || "structor"}-workspace.json`;
    download.click();
    URL.revokeObjectURL(download.href);
    setMessage("Downloaded a JSON workspace backup.");
  }

  async function resetDemo() {
    if (!window.confirm("Replace the current saved workspace with demo data? Download a JSON backup first if you need to keep any unsaved handoff copy.")) return;
    try {
      await clearWorkspace();
      workbookRef.current = null;
      setProject(demoProject);
      setItems(seedItems);
      setBidders(seedBidders);
      setSelectedId(seedItems[2].id);
      setSubmissionProvenance({});
      setLoadedPackageId("");
      setSubmissionIssues([]);
      setMessage("Demo data reset. Import a workbook before doing real project work.");
      setStorageEnabled(true);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The saved workspace could not be cleared.");
    }
  }

  async function connectGmail() {
    try {
      setSaveState("Saving…");
      await saveWorkspace({ project, items, bidders });
      window.location.assign("/api/gmail/connect");
    } catch (error) {
      setSaveState("Save failed");
      setMessage(error instanceof Error ? error.message : "Save the workspace before connecting Gmail.");
    }
  }

  function addScopeItem() {
    const item: ScopeItem = {
      id: `new-${Date.now()}`,
      number: String(items.length + 1),
      description: "New scope item",
      section: selected?.section || "Section 3 — Scope of Work",
      required: true,
      source: "Not linked yet",
      estimatorNote: "",
      rowKind: "coverage",
    };
    setItems((current) => [...current, item]);
    setBidders((current) => current.map((bidder) => ({ ...bidder, responses: { ...bidder.responses, [item.id]: response("") } })));
    setSelectedId(item.id);
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark"><i /><i /><i /></span><span>Structor</span></div>
        <nav aria-label="Primary navigation">
          <span><FolderKanban />Projects</span>
          <span><Library />Scope Library</span>
          <span className="active"><ClipboardList />Bid Leveling</span>
          <span><FileSearch />Documents</span>
        </nav>
        <span className="settings-link"><Settings />Settings</span>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div><div className="project-title"><h1>{project.name}</h1>{project.isDemo && <span>Demo data</span>}</div><p>{message}<small className={`save-state ${saveState.includes("failed") || saveState.includes("unavailable") ? "error" : ""}`}>{saveState}</small></p></div>
          <div className="submission-load-controls">
            <label className="trade-select"><span>Leveling trade</span><select value={project.trade} disabled title="Load another portal package or import a workbook to change the active trade"><option>{project.trade}</option></select><ChevronDown /></label>
            <label className="trade-select"><span>Portal submissions</span><select aria-label="Portal submission package" value={sourcePackageId} disabled={!procurement.packages.length} onChange={(event) => setSourcePackageId(event.target.value)}>{!procurement.packages.length && <option value="">No packages</option>}{procurement.packages.map((pkg) => <option key={pkg.id} value={pkg.id}>{pkg.name} · {submissionCounts.get(pkg.id) ?? 0} submitted</option>)}</select><ChevronDown /></label>
            <button className="button primary submission-load-button" disabled={!sourcePackageId} onClick={() => loadSubmittedBids()}><RefreshCw />{loadedPackageId === sourcePackageId ? "Refresh bids" : "Load bids"}</button>
          </div>
        </header>

        {loadedPackage && <div className="submission-source-bar"><FileText/><span><strong>Portal submissions loaded</strong><small>{loadedPackage.code} · {loadedPackage.name} · {Object.keys(submissionProvenance).length} bidder revision{Object.keys(submissionProvenance).length === 1 ? "" : "s"} · browser-only demo</small></span><button onClick={() => loadSubmittedBids(undefined, loadedPackage.id)}><RefreshCw/>Refresh from portal</button></div>}
        {!!submissionIssues.length && <div className="submission-issue-bar" role="status"><AlertTriangle/><div><strong>{submissionIssues.length} submission notice{submissionIssues.length === 1 ? "" : "s"}</strong>{submissionIssues.map((issue, index) => <span key={`${issue.code}-${issue.submissionId ?? index}`}>{issue.message}</span>)}</div><button aria-label="Dismiss submission notices" onClick={() => setSubmissionIssues([])}><X/></button></div>}

        <section className="summary" aria-label="Bid summary">
          <div><span>Budget</span><input aria-label="Project budget" type="number" value={project.budget} onChange={(event) => setProject({ ...project, budget: Number(event.target.value) })} /></div>
          <div><span>Low submitted bid</span><strong>{lowSubmittedBid == null ? "—" : money.format(lowSubmittedBid)}</strong><small>Before adjustments</small></div>
          <div><span>Reviewed leveled low</span><strong>{lowBid ? money.format(lowBid.reviewedTotal) : "—"}</strong><small>{lowBid?.bidder.name ?? "No reviewed bids yet"}</small></div>
          <div><span>Variance to budget</span><strong className={lowBid && lowBid.reviewedTotal > project.budget ? "over" : "under"}>{lowBid ? money.format(lowBid.reviewedTotal - project.budget) : "—"}</strong><small>{lowBid && project.budget ? `${(((lowBid.reviewedTotal - project.budget) / project.budget) * 100).toFixed(1)}%` : ""}</small></div>
          <div className="progress-summary"><span>Review progress</span><strong>{reviewPercent}%</strong><div className="progress-track" aria-label={`${reviewPercent}% of required bidder responses reviewed`}><i style={{ width: `${reviewPercent}%` }} /></div><small>{openReviewCount} open checks · {reviewedBidderCount}/{reviewBidders.length} active bidders rank-ready</small></div>
        </section>

        <div className="toolbar">
          <input ref={inputRef} className="visually-hidden" type="file" accept=".xlsx" onChange={importWorkbook} />
          <button className="button secondary" onClick={() => inputRef.current?.click()}><Upload />Import Excel</button>
          <button className="button primary" onClick={addScopeItem}><Plus />Add scope item</button>
          <button className="button secondary" disabled={bidders.length >= BIDDER_SLOT_COUNT} onClick={() => setEditingBidderId("new")}><UserPlus />Add bidder</button>
          <button className="button secondary" onClick={openMailbox}><Mail />Proposal inbox</button>
          <button className="button secondary" onClick={() => setCostSuggestionsOpen(true)}><Calculator />Cost suggestions</button>
          <button className="button secondary" onClick={() => setGlossaryOpen(true)}><BookOpen />Glossary</button>
          <button className="button secondary" onClick={() => setWalkthroughOpen(true)}><CircleHelp />How it works</button>
          <button className={`button ghost ${exceptionsOnly ? "pressed" : ""}`} aria-pressed={exceptionsOnly} onClick={() => setExceptionsOnly((value) => !value)}><SlidersHorizontal />{exceptionsOnly ? "Showing exceptions" : "Exceptions only"}</button>
          <button className="button ghost" disabled={!openItemIds.length} onClick={goToNextException}><ArrowRight />Next exception ({openItemIds.length})</button>
          <label className="search"><Search /><input aria-label="Search scope items" placeholder="Search scope" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
          <button className="button ghost" onClick={() => void resetDemo()}><RotateCcw />Load demo</button>
          <button className="button ghost" onClick={downloadBackup}><Download />Backup JSON</button>
          <button className="button secondary export" onClick={exportWorkbook}><Download />Export Excel</button>
        </div>

        <div className={`content-grid ${selected ? "" : "inspector-closed"}`}>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th rowSpan={2} className="number-col">#</th><th rowSpan={2} className="scope-col">Scope item</th><th rowSpan={2} className="source-col">Source</th>{bidders.map((bidder) => { const total = totalsByBidder.get(bidder.id); const provenance = submissionProvenance[bidder.id]; const reviewState = total?.sourceEligibility === "ineligible" ? "not leveled" : total?.eligible ? "reviewed" : "pending"; return <th key={bidder.id} colSpan={3} className="bidder-name"><button className="bidder-heading-button" onClick={() => provenance ? setReviewBidderId(bidder.id) : setEditingBidderId(bidder.id)} aria-label={provenance ? `Review ${bidder.name} submission` : `Edit ${bidder.name}`}><span>{bidder.name}</span>{provenance ? <FileText/> : <Pencil/>}</button><small>{bidder.baseBid == null ? "No price" : `${money.format(bidder.baseBid)} base`} · {provenance ? `rev ${provenance.revisionNumber} · ` : ""}{reviewState}</small></th>; })}</tr>
                <tr>{bidders.flatMap((bidder) => [<th key={`${bidder.id}-status`}>Y/N/P</th>, <th key={`${bidder.id}-note`}>Note</th>, <th key={`${bidder.id}-adj`}>Adjustment</th>])}</tr>
              </thead>
              <tbody>
                {sections.map((section) => (
                  <SectionRows key={section} section={section} items={visibleItems.filter((item) => item.section === section)} bidders={bidders} selectedId={selected?.id} onSelect={setSelectedId} onResponse={updateResponse} />
                ))}
              </tbody>
              <tfoot>
                <tr><th colSpan={3}>Provisional total</th>{bidders.flatMap((bidder) => { const total = totalsByBidder.get(bidder.id)!; const rank = ranked.find((entry) => entry.bidder.id === bidder.id)?.rank; const notLeveled = total.sourceEligibility === "ineligible"; return [<td key={`${bidder.id}-exceptions`} className={notLeveled ? "inactive-total" : total.eligible ? "complete-total" : "exception-total"}>{notLeveled ? "Not leveled" : total.eligible ? <><Check />Reviewed</> : total.exceptions ? `${total.exceptions} open` : "Pending"}</td>, <td key={`${bidder.id}-rank`}>{rank ? `#${rank}` : "—"}</td>, <td key={`${bidder.id}-total`} className="money-total">{total.provisionalTotal == null ? "—" : money.format(total.provisionalTotal)}</td>]; })}</tr>
              </tfoot>
            </table>
          </div>

          {selected && <aside className="inspector">
            <div className="inspector-heading"><div><span>Selected scope item</span><strong>{selected.number || "Scope"}</strong></div><button aria-label="Close inspector" onClick={() => setSelectedId("")}><X /></button></div>
            <label>Scope description<textarea value={selected.description} onChange={(event) => updateSelected({ description: event.target.value })} rows={5} /></label>
            <label>Section<input value={selected.section} onChange={(event) => updateSelected({ section: event.target.value })} /></label>
            <div className="source-block"><span>Source reference</span><strong>{selected.source}</strong><p>Drawing and specification citations will attach here in the document-reader phase.</p></div>
            <label>Estimator note<textarea value={selected.estimatorNote} onChange={(event) => updateSelected({ estimatorNote: event.target.value })} rows={4} placeholder="Add a leveling decision or clarification…" /></label>
            <label className="required-check"><input type="checkbox" checked={selected.required} onChange={(event) => updateSelected({ required: event.target.checked })} />Required for complete scope</label>
            <div className="review-state"><span><Check />Saved in this browser</span><small>{selected.sourceRow == null ? "This new row is included in JSON backups. Excel export will stop until it has a verified template row." : "This mapped source row is included in a safe Excel export."}</small></div>
          </aside>}
        </div>
      </section>
      {reviewBidderId && submissionProvenance[reviewBidderId] && bidders.find((bidder) => bidder.id === reviewBidderId) && <SubmissionLevelingReview
        bidder={bidders.find((bidder) => bidder.id === reviewBidderId)!}
        items={items}
        provenance={submissionProvenance[reviewBidderId]}
        revisionNumbers={submissions.find((submission) => submission.id === submissionProvenance[reviewBidderId].submissionId)?.revisions.map((revision) => revision.number) ?? [submissionProvenance[reviewBidderId].revisionNumber]}
        onRevision={(revision) => loadSubmissionRevision(submissionProvenance[reviewBidderId], revision)}
        onEdit={() => { setReviewBidderId(null); setEditingBidderId(reviewBidderId); }}
        onClose={() => setReviewBidderId(null)}
      />}
      {editingBidderId && <BidderEditor
        key={editingBidderId}
        bidder={editingBidderId === "new" ? undefined : bidders.find((bidder) => bidder.id === editingBidderId)}
        onClose={() => setEditingBidderId(null)}
        onSave={saveBidder}
      />}
      {mailOpen && <MailboxDialog
        loading={mailLoading}
        needsConnection={mailNeedsConnection}
        error={mailError}
        messages={mailMessages}
        onClose={() => setMailOpen(false)}
        onRefresh={() => void loadMailbox()}
        onConnect={() => void connectGmail()}
      />}
      {pendingImport && <ImportPreview
        imported={pendingImport}
        onCancel={() => setPendingImport(null)}
        onConfirm={() => void confirmImport()}
      />}
      {glossaryOpen && <GlossaryDialog onClose={() => setGlossaryOpen(false)} />}
      {walkthroughOpen && <HowItWorksDialog onClose={() => setWalkthroughOpen(false)} />}
      {costSuggestionsOpen && <CostSuggestionsDialog onClose={() => setCostSuggestionsOpen(false)} />}
    </main>
  );
}

function SectionRows({ section, items, bidders, selectedId, onSelect, onResponse }: {
  section: string;
  items: ScopeItem[];
  bidders: Bidder[];
  selectedId?: string;
  onSelect: (id: string) => void;
  onResponse: (bidderId: string, itemId: string, patch: Partial<Response>) => void;
}) {
  return <>
    <tr className="section-row"><th colSpan={3 + bidders.length * 3}>{section}</th></tr>
    {items.map((item) => <tr id={`scope-row-${item.id}`} key={item.id} className={selectedId === item.id ? "selected-row" : ""} onClick={() => onSelect(item.id)}>
      <td className="number-col">{item.number}</td>
      <td className="scope-col">{item.description}</td>
      <td className="source-col">{item.source}</td>
      {bidders.flatMap((bidder) => {
        const answer = bidder.responses[item.id] ?? response("");
        const needsResolution = answer.status === "N" || answer.status === "P" || answer.status === "N/A";
        return [
          <td key={`${bidder.id}-status`} className={responseNeedsReview(item, answer) ? "review-cell open" : "review-cell"}><select aria-label={`${bidder.name} status for ${item.description}`} value={answer.status} className={`status status-${answer.status.replace("/", "") || "empty"}`} onClick={(event) => event.stopPropagation()} onChange={(event) => onResponse(bidder.id, item.id, { status: event.target.value as ScopeStatus })}><option value="">—</option><option value="Y">Y</option><option value="N">N</option><option value="P">P</option><option value="N/A">N/A</option></select>{needsResolution && <label className="mini-review" onClick={(event) => event.stopPropagation()}><input type="checkbox" checked={answer.resolved === true} onChange={(event) => onResponse(bidder.id, item.id, { resolved: event.target.checked })} />Resolved</label>}</td>,
          <td key={`${bidder.id}-note`}><input aria-label={`${bidder.name} note for ${item.description}`} value={answer.note} placeholder="—" onClick={(event) => event.stopPropagation()} onChange={(event) => onResponse(bidder.id, item.id, { note: event.target.value })} /></td>,
          <td key={`${bidder.id}-adjustment`} className="review-cell"><input aria-label={`${bidder.name} adjustment for ${item.description}`} className="money-input" type="number" step="0.01" value={answer.adjustment || ""} placeholder="$0" onClick={(event) => event.stopPropagation()} onChange={(event) => onResponse(bidder.id, item.id, { adjustment: event.target.value === "" ? 0 : Number(event.target.value) })} />{answer.adjustment !== 0 && <label className="mini-review" onClick={(event) => event.stopPropagation()}><input type="checkbox" checked={answer.adjustmentApproved === true} onChange={(event) => onResponse(bidder.id, item.id, { adjustmentApproved: event.target.checked })} />Approved</label>}</td>,
        ];
      })}
    </tr>)}
  </>;
}

function SubmissionLevelingReview({ bidder, items, provenance, revisionNumbers, onRevision, onEdit, onClose }: {
  bidder: Bidder;
  items: ScopeItem[];
  provenance: BidProvenance;
  revisionNumbers: number[];
  onRevision: (revision: number) => void;
  onEdit: () => void;
  onClose: () => void;
}) {
  const exceptions = items.flatMap((item) => {
    const answer = bidder.responses[item.id];
    return answer?.status && answer.status !== "Y" ? [{ item, answer }] : [];
  });
  const submitted = new Date(provenance.submittedAt);
  const submittedLabel = Number.isNaN(submitted.getTime()) ? provenance.submittedAt : submitted.toLocaleString();
  const modal = <div className="modal-backdrop submission-review-backdrop">
    <section className="modal submission-review-modal" role="dialog" aria-modal="true" aria-labelledby="submission-review-title">
      <header><div><span>Portal submission</span><h2 id="submission-review-title">{bidder.name}</h2></div><button aria-label="Close submission review" onClick={onClose}><X/></button></header>
      <div className="submission-review-body">
        {provenance.stale && <div className="submission-review-warning"><AlertTriangle/><span><strong>Older bid form</strong><small>This revision answered version {provenance.formVersion}; version {provenance.currentFormVersion} is current. It remains visible but cannot be ranked.</small></span></div>}
        <div className="submission-review-summary">
          <div><small>BASE BID</small><strong>{bidder.baseBid == null ? "—" : money.format(bidder.baseBid)}</strong></div>
          <div><small>REVISION</small><label><select aria-label="Submission revision" value={provenance.revisionNumber} onChange={(event) => onRevision(Number(event.target.value))}>{revisionNumbers.map((number) => <option key={number} value={number}>Revision {number}{number === provenance.revisionNumber ? " · loaded" : ""}</option>)}</select><ChevronDown/></label></div>
          <div><small>SUBMITTED</small><strong>{submittedLabel}</strong></div>
          <div><small>SUBMITTER</small><strong>{provenance.submitter.name}</strong><span>{provenance.submitter.email}</span></div>
        </div>
        <div className="submission-review-columns">
          <section><div className="submission-review-heading"><span><strong>Scope exceptions</strong><small>{exceptions.length ? `${exceptions.length} answer${exceptions.length === 1 ? "" : "s"} need estimator review` : "Full scope confirmed"}</small></span></div><div className="submission-exception-list">{exceptions.map(({ item, answer }) => <article key={item.id}><b>{answer.status}</b><span><strong>{item.description}</strong><small>{answer.note || "No bidder note"}</small></span></article>)}{!exceptions.length && <p className="submission-empty-note"><Check/>Every published scope item was answered Y.</p>}</div></section>
          <aside>
            <SubmissionReviewList title="Exclusions" values={provenance.exclusions}/>
            <SubmissionReviewList title="Clarifications" values={provenance.clarifications}/>
            <div className="submission-review-card"><strong>Alternates</strong>{provenance.alternates.length ? provenance.alternates.map((alternate) => <p key={alternate.id}><span>{alternate.kind === "deduct" ? "Deduct" : "Add"} {money.format(alternate.amount)}</span>{alternate.description}</p>) : <small>None recorded</small>}</div>
            <div className="submission-review-card"><strong>Attachments</strong>{provenance.attachments.length ? provenance.attachments.map((attachment) => <p key={attachment.id} className="submission-attachment"><Paperclip/><span>{attachment.name}<small>{Math.max(1, Math.ceil(attachment.size / 1024))} KB · metadata only</small></span></p>) : <small>None recorded</small>}</div>
            {!!provenance.droppedResponses.length && <div className="submission-review-card warning"><strong>Removed scope answers</strong>{provenance.droppedResponses.map((answer) => <p key={answer.scopeItemId}><span>{answer.answer || "Blank"}</span>{answer.scopeItemId}{answer.note ? ` · ${answer.note}` : ""}</p>)}</div>}
          </aside>
        </div>
      </div>
      <footer className="submission-review-actions"><span>Revision {provenance.revisionNumber} of {provenance.revisionCount} · saved in this browser</span>{!provenance.stale && <button className="button secondary" onClick={onEdit}><Pencil/>Edit leveling settings</button>}<button className="button primary" onClick={onClose}>Review scope grid<ArrowRight/></button></footer>
    </section>
  </div>;
  return typeof document === "undefined" ? null : createPortal(modal, document.body);
}

function SubmissionReviewList({ title, values }: { title: string; values: string[] }) {
  return <div className="submission-review-card"><strong>{title}</strong>{values.length ? values.map((value, index) => <p key={`${value}-${index}`}>{value}</p>) : <small>None recorded</small>}</div>;
}

function BidderEditor({ bidder, onClose, onSave }: {
  bidder?: Bidder;
  onClose: () => void;
  onSave: (details: Pick<Bidder, "name" | "contact" | "baseBid" | "bondRate" | "zeroPriceApproved" | "sourceStatus">) => void;
}) {
  const [name, setName] = useState(bidder?.name || "");
  const [contact, setContact] = useState(bidder?.contact || "");
  const [baseBid, setBaseBid] = useState(bidder?.baseBid == null ? "" : String(bidder.baseBid));
  const [bondPercent, setBondPercent] = useState(String((bidder?.bondRate ?? 0.02) * 100));
  const [zeroPriceApproved, setZeroPriceApproved] = useState(bidder?.zeroPriceApproved === true);
  const [sourceStatus, setSourceStatus] = useState(bidder?.sourceStatus ?? "");
  const [error, setError] = useState("");
  return <div className="modal-backdrop">
    <section className="modal bidder-modal" role="dialog" aria-modal="true" aria-labelledby="bidder-dialog-title">
      <header><div><span>Bidder</span><h2 id="bidder-dialog-title">{bidder ? "Edit bidder" : "Add bidder"}</h2></div><button aria-label="Close bidder editor" onClick={onClose}><X /></button></header>
      <form onSubmit={(event) => {
        event.preventDefault();
        const cleanName = name.trim();
        const parsedBid = baseBid === "" ? null : Number(baseBid);
        const parsedBond = Number(bondPercent) / 100;
        if (!cleanName) return setError("Company name is required.");
        if (parsedBid != null && (!Number.isFinite(parsedBid) || parsedBid < 0)) return setError("Base bid must be blank or a valid non-negative amount.");
        if (!Number.isFinite(parsedBond) || parsedBond < 0) return setError("Bond rate must be a valid non-negative percentage.");
        onSave({ name: cleanName, contact: contact.trim(), baseBid: parsedBid, bondRate: parsedBond, zeroPriceApproved, sourceStatus });
      }}>
        <label>Company name<input autoFocus required value={name} onChange={(event) => setName(event.target.value)} /></label>
        <label>Contact<input value={contact} onChange={(event) => setContact(event.target.value)} placeholder="Name or email" /></label>
        <label>Base bid<input min="0" step="0.01" type="number" value={baseBid} onChange={(event) => { setBaseBid(event.target.value); setZeroPriceApproved(false); }} placeholder="No price submitted" /></label>
        {baseBid !== "" && Number(baseBid) === 0 && <label className="required-check"><input type="checkbox" checked={zeroPriceApproved} onChange={(event) => setZeroPriceApproved(event.target.checked)} />Confirm this is an intentional $0 quote</label>}
        <label>Bond rate (%)<input min="0" step="0.01" type="number" value={bondPercent} onChange={(event) => setBondPercent(event.target.value)} /></label>
        <label>Workbook level status<select value={sourceStatus} onChange={(event) => setSourceStatus(event.target.value)}><option value="">Not specified</option><option value="FULL SCOPE">FULL SCOPE</option><option value="NO">NO — do not level</option></select></label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <footer><button className="button secondary" type="button" onClick={onClose}>Cancel</button><button className="button primary" type="submit">Save bidder</button></footer>
      </form>
    </section>
  </div>;
}

function MailboxDialog({ loading, needsConnection, error, messages, onClose, onRefresh, onConnect }: {
  loading: boolean;
  needsConnection: boolean;
  error: string;
  messages: GmailMessage[];
  onClose: () => void;
  onRefresh: () => void;
  onConnect: () => void;
}) {
  return <div className="modal-backdrop">
    <section className="modal mailbox-modal" role="dialog" aria-modal="true" aria-labelledby="mailbox-dialog-title">
      <header><div><span>Last 30 days · messages with attachments</span><h2 id="mailbox-dialog-title">Proposal email</h2></div><div className="modal-actions"><button aria-label="Refresh Gmail" onClick={onRefresh}><RefreshCw /></button><button aria-label="Close mailbox" onClick={onClose}><X /></button></div></header>
      <p className="mailbox-notice"><strong>Current milestone:</strong> this securely lists proposal emails and attachments for human review. Automatic proposal reading and Y/N/P population are not enabled yet.</p>
      {loading ? <p className="modal-status">Loading Gmail…</p> : error ? <div className="modal-status error"><p>{error}</p>{needsConnection && <button className="button primary" onClick={onConnect}>Connect Gmail</button>}</div> : messages.length ? <div className="mail-list">
        {messages.map((message) => <article key={message.id}>
          <div className="mail-summary"><strong>{message.subject}</strong><span>{message.sender}</span><small>{message.date}</small><p>{message.snippet}</p></div>
          <div className="attachments">{message.attachments.map((attachment) => <a key={attachment.id} href={attachmentHref(message.id, attachment)}><Paperclip />{attachment.name}</a>)}</div>
        </article>)}
      </div> : <p className="modal-status">No messages with attachments were found in the last 30 days.</p>}
    </section>
  </div>;
}

function ImportPreview({ imported, onCancel, onConfirm }: {
  imported: WorkbookImport;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return <div className="modal-backdrop">
    <section className="modal import-modal" role="dialog" aria-modal="true" aria-labelledby="import-dialog-title">
      <header><div><span>Import preview</span><h2 id="import-dialog-title">Replace the active workspace?</h2></div><button aria-label="Cancel workbook import" onClick={onCancel}><X /></button></header>
      <div className="import-summary">
        <dl>
          <div><dt>File</dt><dd>{imported.fileName}</dd></div>
          <div><dt>Project</dt><dd>{imported.project.name}</dd></div>
          <div><dt>Trade sheet</dt><dd>{imported.source.sheetName}</dd></div>
          <div><dt>Requirements</dt><dd>{imported.items.length}</dd></div>
          <div><dt>Bidders</dt><dd>{imported.bidders.length}</dd></div>
        </dl>
        {imported.warnings.length > 0 && <div className="import-warnings"><strong>Review before continuing</strong><ul>{imported.warnings.map((warning) => <li key={`${warning.code}-${warning.message}`}>{warning.message}</li>)}</ul></div>}
        <p>Your current workspace stays unchanged until you confirm. The original workbook will be stored with the local workspace for source-preserving export.</p>
      </div>
      <footer className="modal-footer"><button className="button secondary" onClick={onCancel}>Cancel</button><button className="button primary" onClick={onConfirm}>Import this trade</button></footer>
    </section>
  </div>;
}

function GlossaryDialog({ onClose }: { onClose: () => void }) {
  return <div className="modal-backdrop">
    <section className="modal glossary-modal" role="dialog" aria-modal="true" aria-labelledby="glossary-dialog-title">
      <header><div><span>Construction bid leveling</span><h2 id="glossary-dialog-title">Glossary</h2></div><button aria-label="Close glossary" onClick={onClose}><X /></button></header>
      <dl className="glossary-list">
        {glossaryTerms.map(([term, definition]) => <div key={term}><dt>{term}</dt><dd>{definition}</dd></div>)}
      </dl>
    </section>
  </div>;
}

function HowItWorksDialog({ onClose }: { onClose: () => void }) {
  const steps = [
    ["1", "Set up the project", "Add project information, the RFP, deadlines, cost centers, and estimator assignments. Upload drawings, specifications, and reports.", "UI preview"],
    ["2", "Build scopes by trade", "Review draft scope items and their drawing or specification references. Use the scope as the bid form shared with subcontractors.", "UI preview"],
    ["3", "Check the documents", "Review drawing issues, the specification matrix, the drawing register, and changes between drawing revisions.", "UI preview"],
    ["4", "Measure and plan", "Review quantities by division, required owner allowances, and the project schedule before requesting bids.", "UI preview"],
    ["5", "Invite and collect bids", "Use bid packages, trade messages, and the subcontractor portal to collect prices, scope answers, and proposal attachments. Gmail remains an additional intake channel.", "UI preview"],
    ["6", "Review and level", "Import the supported Excel trade sheet or edit bidder responses. Resolve scope gaps, approve adjustments, and compare reviewed totals. Cost suggestions illustrate the unit-price review flow.", "Working now"],
    ["7", "Build the budget", "Roll selected trade values into a detailed budget by cost center, including project allowances.", "UI preview"],
    ["8", "Award and hand over", "Review the subcontract agreement, Exhibit A scope, drawing-list exhibit, and turnover package.", "UI preview"],
    ["9", "Export the reviewed workbook", "Export mapped, reviewed values into a preserved copy of the source Excel workbook, or download a JSON workspace backup.", "Working now"],
  ] as const;
  return <div className="modal-backdrop">
    <section className="modal workflow-modal" role="dialog" aria-modal="true" aria-labelledby="workflow-dialog-title">
      <header><div><span>Workflow</span><h2 id="workflow-dialog-title">How Structor works</h2></div><button aria-label="Close how it works" onClick={onClose}><X /></button></header>
      <ol className="workflow-list">
        {steps.map(([number, title, description, status]) => <li key={number}><b>{number}</b><div><div className="workflow-title"><strong>{title}</strong><span className={status === "UI preview" ? "next" : "live"}>{status}</span></div><p>{description}</p></div></li>)}
      </ol>
    </section>
  </div>;
}

function CostSuggestionsDialog({ onClose }: { onClose: () => void }) {
  const [quantity, setQuantity] = useState("30");
  const [unitCost, setUnitCost] = useState("3000");
  const [source, setSource] = useState("example");
  const [reviewed, setReviewed] = useState(false);
  const [approved, setApproved] = useState(false);
  const amount = Number(quantity) * Number(unitCost);
  const valid = quantity !== "" && unitCost !== "" && Number(quantity) > 0 && Number(unitCost) >= 0 && Number.isFinite(amount);
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);
  const resetReview = () => { setReviewed(false); setApproved(false); };

  return <div className="modal-backdrop">
    <section className="modal bidder-modal cost-suggestions-modal" role="dialog" aria-modal="true" aria-labelledby="cost-suggestions-title">
      <header><div><span>Illustrative review · structural steel</span><h2 id="cost-suggestions-title">Cost suggestions</h2></div><button autoFocus aria-label="Close cost suggestions" onClick={onClose}><X /></button></header>
      <form onSubmit={(event) => { event.preventDefault(); if (valid && reviewed) setApproved(true); }}>
        <div className="cost-example-notice">Example from the workflow discussion. This is separate from your active workbook and does not change its bids.</div>
        <div className="cost-scope-gap"><span className="cost-status excluded">Excluded scope</span><h3>Fall-restraint roof anchors</h3><p>The steel proposal excludes anchors required by the scope. Review the missing quantity and unit rate to estimate a leveling adjustment.</p></div>
        <div className="cost-inputs">
          <label>Quantity · each<input required min="1" step="1" type="number" value={quantity} onChange={(event) => { setQuantity(event.target.value); resetReview(); }} /></label>
          <span aria-hidden="true">×</span>
          <label>Unit cost · USD<input required min="0" step="0.01" type="number" value={unitCost} onChange={(event) => { setUnitCost(event.target.value); resetReview(); }} /></label>
        </div>
        <div className="cost-calculated"><div><span>Suggested addition</span><strong>{valid ? money.format(amount) : "—"}</strong></div><span className={`cost-status ${approved ? "approved" : "pending"}`}>{approved ? "Example approved" : "Needs review"}</span></div>
        <label>Cost basis<select value={source} onChange={(event) => { setSource(event.target.value); resetReview(); }}><option value="example">Historical-cost example</option><option value="supplier">Supplier quote</option><option value="estimator">Estimator input</option></select></label>
        <div className="cost-evidence">
          <strong>{source === "example" ? "Reference: September 8 workflow discussion" : source === "supplier" ? "Alternative source: supplier quote" : "Alternative source: estimator estimate"}</strong>
          <p>{source === "example" ? "Marcel described a previous $3,000-per-anchor cost and an illustrative quantity of 30 (19:14:38–19:15:06). No supporting project quote is attached." : source === "supplier" ? "Enter a rate from a current supplier quote above. In the connected workflow, attach the quote and record its date here." : "Enter a rate based on estimator judgment above. In the connected workflow, record the assumption and its supporting evidence here."}</p>
          <small>Evidence confidence: unverified example · estimator review required</small>
        </div>
        <label className="required-check"><input type="checkbox" checked={reviewed} onChange={(event) => { setReviewed(event.target.checked); setApproved(false); }} />I reviewed this example quantity and rate</label>
        {approved && <p className="cost-approval-message" role="status"><Check />Example adjustment approved. Your workbook is unchanged.</p>}
        <footer><button className="button secondary" type="button" onClick={onClose}>Close</button><button className="button primary" type="submit" disabled={!valid || !reviewed || approved}>{approved ? "Example approved" : "Approve example adjustment"}</button></footer>
      </form>
    </section>
  </div>;
}
