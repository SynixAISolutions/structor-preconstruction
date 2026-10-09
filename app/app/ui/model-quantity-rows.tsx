import { wallFinishStatus } from "./wall-finish-panels";
import { csiDivision } from "../../lib/csi";
import { reviewStatus, type BaseBreakdownRow, type FinishScheduleRow, type LevelId, type ModelObject, type ModelReviewState, type ModelSource, type QuantityUnit, type WallFinishRecord } from "../../lib/model";

export type ModelInspection = { projectId: string; level: LevelId; objectId: string | null; finishId?: string; source?: ModelSource };
export type ModelQuantityFilters = { category: string; query: string; level: string; room: string; division: string; material: string; review: string; coverage: string };
export const DEFAULT_QUANTITY_FILTERS: ModelQuantityFilters = { category: "floor", query: "", level: "", room: "", division: "", material: "", review: "", coverage: "" };
export const QUANTITY_CATEGORIES: Record<string, string> = { floor: "Floor zones", ceiling: "Ceiling zones", wall: "Wall construction / partitions", glass: "Glazing", door: "Door openings", transition: "Transitions", "wall-finish": "Wall finish bands", base: "Base by type" };
export type ModelQuantityRow = {
  id: string; category: string; label: string; level: LevelId; rooms: string[]; division: string; section: string;
  material: string; tag: string; product: string; color: string; value: number | null; unit: QuantityUnit;
  basis: string; warning: boolean; notes: string; objectId: string | null; finishId?: string; sources: ModelSource[];
};
const sourceOf = (source: FinishScheduleRow["source"]): ModelSource => ({ ...source, drawing: source.drawing ?? "" });

/** Display cells only: quantities are copied from the resolved model contract, never remeasured here. */
export function modelQuantityRows(objects: ModelObject[], records: WallFinishRecord[], bases: BaseBreakdownRow[], schedule: FinishScheduleRow[]): ModelQuantityRow[] {
  // An empty project must not inherit the sample's finishes or base quantities.
  if (!objects.length) return [];
  const rows: ModelQuantityRow[] = objects.filter(object => object.views.includes("interior")).map(object => {
    const issues = [object.kind === "floor" && !object.tag ? "Floor finish unassigned" : "", object.ceiling && object.ceiling.status !== "tagged" ? "Ceiling type / height unresolved; area retained" : "", object.partitionBasis === "unverified" ? "Partition type unverified" : "", object.door && object.door.hardware.status !== "match" ? "Hardware conflict" : "", object.door?.widthCheck.within === false ? "Opening / schedule width difference" : ""].filter(Boolean);
    return { id: object.id, category: object.kind, label: object.name, level: object.level, rooms: [...new Set([object.room, object.adjoins].flatMap(room => room ? room.split(/\s*\/\s*/) : []))], division: object.division, section: object.specSection ?? "", material: object.assembly, tag: object.ceiling?.tag ?? object.tag ?? object.partitionType?.tag ?? "", product: object.schedule?.product ?? object.assembly, color: object.schedule?.color ?? "", value: object.quantity.value, unit: object.quantity.unit, basis: issues.join("; ") || `${object.basis.geometry} geometry · ${object.basis.material} assembly`, warning: !!issues.length || object.basis.geometry === "illustrative" || object.basis.material === "illustrative", notes: [object.caution, object.room?.includes("/") ? "This combined zone quantity covers all listed rooms; it is not apportioned between them." : ""].filter(Boolean).join(" "), objectId: object.id, sources: object.sources };
  });
  for (const record of records) for (const [index, band] of record.bands.entries()) {
    rows.push({ id: `${record.id}:band:${index}`, category: "wall-finish", label: record.title, level: record.level, rooms: record.room ? [record.room] : [], division: csiDivision(band.rows[0]?.section ?? "") ?? "", section: [...new Set(band.rows.map(row => row.section))].join(" / "), material: band.tags.join(" / "), tag: band.tags.join(" / "), product: band.rows.map(row => [row.manufacturer, row.product, row.description].filter(Boolean).join(" · ")).join(" / "), color: band.rows.map(row => row.color).filter(Boolean).join(" / "), value: band.areaSf, unit: "SF", basis: `${wallFinishStatus[record.status]} · ${band.areaSf === null ? "area not measured" : "dimensioned band; placement may be unresolved"}`, warning: band.areaSf === null || record.status !== "assigned" || !!record.conflicts.length, notes: [band.note, record.note, ...record.conflicts].filter(Boolean).join(" "), objectId: record.wallIds[0] ?? null, finishId: record.id, sources: [...record.evidence.map(sourceOf), ...band.rows.map(row => sourceOf(row.source))] });
  }
  for (const base of bases) {
    const floor = objects.find(object => object.id === base.floorId);
    if (!floor) continue;
    for (const [index, item] of [base.field, ...base.accents].entries()) {
      const product = schedule.find(row => row.tag === item.tag), record = "recordId" in item ? records.find(record => record.id === item.recordId) : null;
      rows.push({ id: `${base.floorId}:base:${index}`, category: "base", label: `${floor.name} · ${record ? "accent base" : base.accents.length ? "remaining field base" : "base"}`, level: base.level, rooms: base.room ? base.room.split(/\s*\/\s*/) : [], division: csiDivision(product?.section ?? "") ?? "", section: product?.section ?? "", material: item.tag, tag: item.tag, product: product ? [product.manufacturer, product.product, product.description].filter(Boolean).join(" · ") : "", color: product?.color ?? "", value: item.lf, unit: "LF", basis: "Gross base · openings not deducted", warning: false, notes: "Field and supported accent runs partition the same gross base total. Internal finish lines are excluded; conflicting base notes are not applied." + (base.room?.includes("/") ? " This combined zone run is not apportioned between rooms." : ""), objectId: floor.id, finishId: record?.id, sources: record ? [...record.evidence.map(sourceOf), ...(product ? [sourceOf(product.source)] : [])] : [...floor.sources, ...(product ? [sourceOf(product.source)] : [])] });
    }
  }
  return rows;
}

export function filterModelQuantityRows(rows: ModelQuantityRow[], filters: ModelQuantityFilters, review: ModelReviewState): ModelQuantityRow[] {
  const q = filters.query.trim().toLowerCase();
  return rows.filter(row => (!filters.category || row.category === filters.category) && (!filters.level || row.level === filters.level) && (!filters.room || (filters.room === "unnumbered" ? !row.rooms.length : row.rooms.includes(filters.room))) && (!filters.division || row.division === filters.division) && (!filters.material || row.material === filters.material) && (!filters.review || (!!row.objectId && reviewStatus(review, row.objectId) === filters.review)) && (!filters.coverage || (filters.coverage === "unmeasured" ? row.value === null : row.warning)) && (!q || [row.id, row.label, row.tag, row.product, row.color, row.section, row.basis, row.notes, ...row.rooms, ...row.sources.map(source => `${source.sheet} ${source.detail}`)].join(" ").toLowerCase().includes(q)));
}

export function modelQuantityCsv(rows: ModelQuantityRow[], review: ModelReviewState): (string | number)[][] {
  return [["Row ID", "Category", "Item", "Level", "Rooms", "CSI division", "Spec section", "Finish / type", "Product", "Color", "Quantity", "Unit", "Measurement basis", "Notes / conflicts", "Reviewed model object", "Model object review", "Drawing references"], ...rows.map(row => [row.id, QUANTITY_CATEGORIES[row.category] ?? row.category, row.label, row.level, row.rooms.join(" / "), row.division, row.section, row.tag, row.product, row.color, row.value ?? "", row.unit, row.basis, row.notes, row.objectId ?? "", row.objectId ? reviewStatus(review, row.objectId) : "No model object", [...new Set(row.sources.map(source => `${source.sheet} · page ${source.page} · ${source.detail}`))].join(" | ")])];
}
