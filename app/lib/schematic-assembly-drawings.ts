import { drawingLengthFeet, type DrawingTextRun } from "./drawing-dimensions";
import type { Segment } from "./plan-vectors";
import type { RegisterRow } from "./project-files";
import { feetPerInch, levelOfTitle } from "./schematic-model";
import type { PlanBox } from "./schematic-plan-views";
import type { TextBox } from "./text-anchor";

export type AssemblyKind = "wall" | "floor";
export type AssemblyCaption = {
  title: string; box: PlanBox; tags: string[]; labels: TextBox[]; detail?: string;
};
export type AssemblyRead = {
  tag: string; thickness: string; rating: string;
  layers: { material: string; thickness: string }[];
};

const normalized = (value: string) => value.toUpperCase().replace(/[″“”]/g, '"')
  .replace(/[′‘’]/g, "'").replace(/[‐‑–—]/g, "-").replace(/\s+/g, " ").trim();

export function wallAssemblySheet(row: Pick<RegisterRow, "title" | "discipline">) {
  return row.discipline === "Architectural" && /\b(?:WALL|PARTITION)\s+(?:TYPES?|SCHEDULES?|ASSEMBL(?:Y|IES))\b/i.test(row.title);
}

export function floorAssemblySheet(row: Pick<RegisterRow, "title" | "discipline">) {
  return /^(?:Architectural|Structural)$/.test(row.discipline) &&
    /\b(?:FLOOR(?:[\s/-]+CEILING)?|SLAB)\s+(?:ASSEMBL(?:Y|IES)|BUILD[- ]?UPS?|TYPES?|DETAILS?|SCHEDULES?)\b/i.test(row.title);
}

function wallMarks(title: string): string[] {
  const type = /^TYPE\s+((?:[A-Z]{0,5}-?\d{1,3}[A-Z]?(?:\.\d{1,3})*)(?:\s*(?:\/|,|&|–|-)\s*[A-Z]{0,3}\d{1,3}[A-Z]?)*)(?=\s|$)/i.exec(title);
  if (type) return type[1].match(/(?:[A-Z]{1,5}-?)?\d{1,3}[A-Z]?(?:\.\d{1,3})*/gi) ?? [];
  const ext = /^(?:EXT|INT|PTN|WALL)-?\d{1,3}[A-Z]?(?=\s|$)/i.exec(title);
  return ext ? [ext[0]] : [];
}

export type FloorDetailReference = { sheet: string; detail: string; at: [number, number] };

const sheetKey = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/g, "");
const detailNumber = (value: string) => /^\d{1,3}[A-Z]?$/i.test(value.trim()) ? value.trim().toUpperCase() : "";

/** Read numbered references to floor-detail sheets. A nearby number alone is not enough. */
export function printedFloorDetailReferences(boxes: TextBox[], page: { width: number; height: number }, sheets: ReadonlySet<string>) {
  return boxes.flatMap(box => {
    if (!sheets.has(sheetKey(box.str))) return [];
    const center = box.x + box.w / 2;
    const numbers = boxes.filter(b => detailNumber(b.str) &&
      Math.abs(b.x + b.w / 2 - center) * page.width < box.h * page.height * .55 &&
      b.y < box.y && b.y + b.h > box.y - box.h * .85);
    if (numbers.length !== 1) return [];
    const mark = numbers[0];
    return [{ sheet: sheetKey(box.str), detail: detailNumber(mark.str), at: [center, (mark.y + box.y + box.h) / 2] } satisfies FloorDetailReference];
  });
}

const isFloorCaption = (title: string) =>
  /\b(?:SLAB[- ]ON[- ]GRADE|FLOOR|FLR\.?|SLAB)\b/i.test(title) &&
  /\b(?:ASSEMBL(?:Y|IES)|DETAILS?|BUILD[- ]?UP|SLAB[- ]ON[- ]GRADE|TYPE)\b/i.test(title) &&
  !/\b(?:ROOF|TERRACE)\b/i.test(title);

type Page = { width: number; height: number };

/** Crop around the printed detail title and its drawn underline, independently on every sheet. */
export function assemblyCaptions(boxes: TextBox[], segments: Segment[], page: Page, kind: AssemblyKind): AssemblyCaption[] {
  const rules = segments.flatMap(({ a, b }) => Math.abs(a[1] - b[1]) <= .35 && Math.abs(a[0] - b[0]) >= 48
    ? [{ y: a[1] / page.height, left: Math.min(a[0], b[0]) / page.width, right: Math.max(a[0], b[0]) / page.width }] : []);
  const captions = boxes.flatMap(label => {
    const title = label.str.trim(), tags = kind === "wall" ? wallMarks(title) : [];
    if (kind === "wall" ? !tags.length : !isFloorCaption(title)) return [];
    const below = label.y + label.h;
    const candidates = rules.filter(rule => rule.y >= below - label.h * .22 && rule.y <= below + label.h * .75 &&
      Math.abs(rule.left - label.x) < .03 && rule.right >= label.x + label.w - .012 && rule.right - rule.left < .6);
    candidates.sort((a, b) => Math.abs(a.y - below) - Math.abs(b.y - below) || Math.abs(a.left - label.x) - Math.abs(b.left - label.x));
    return candidates[0] ? [{ title, label, tags, rule: candidates[0] }] : [];
  });
  // Non-floor neighbors such as roof details are still crop boundaries.
  const captionRules = rules.filter(rule => boxes.some(b => b.str.length > 8 && Math.abs(b.x - rule.left) < .025 &&
    Math.abs(b.y + b.h - rule.y) < b.h * .55 && b.x + b.w <= rule.right + .012));
  const seen = new Set<string>();
  return captions.flatMap(({ title, label, tags, rule }) => {
    const key = [normalized(title), label.x.toFixed(4), label.y.toFixed(4)].join("|");
    if (seen.has(key)) return [];
    seen.add(key);
    const next = captionRules.filter(other => other.left > rule.right && Math.abs(other.y - rule.y) < .01)
      .sort((a, b) => a.left - b.left)[0];
    const adjacentLeft = captionRules.filter(other => other.right < rule.left && Math.abs(other.y - rule.y) < .01)
      .sort((a, b) => b.right - a.right)[0];
    const left = Math.max(0, adjacentLeft ? Math.max(rule.left - .036, (adjacentLeft.right + rule.left) / 2) : rule.left - .036);
    const right = Math.min(1, next ? Math.min(rule.right + .045, (next.left + rule.right) / 2) : rule.right + .04);
    const previous = captions.map(c => c.rule).filter(other => other.y < rule.y - .045);
    const top = Math.max(0, ...previous.map(other => other.y + .012));
    const bottom = Math.min(1, rule.y + .016);
    const labels = boxes.filter(b => b.x >= left && b.x + b.w <= right && b.y >= top && b.y < label.y - label.h * .3);
    if (!labels.length || right <= left || bottom <= top) return [];
    const cropTop = Math.max(top, Math.min(...labels.map(b => b.y)) - .045);
    const numbers = boxes.filter(b => detailNumber(b.str) && b.x + b.w < label.x &&
      (label.x - b.x - b.w) * page.width < label.h * page.height * 1.4 &&
      Math.abs(b.y + b.h / 2 - (label.y + label.h / 2)) < label.h * .45);
    const detail = numbers.length === 1 ? detailNumber(numbers[0].str) : undefined;
    return [{ title, tags, labels, box: [left, cropTop, right - left, bottom - cropTop], detail }];
  });
}

/** Whitespace, punctuation variants and line wrapping do not change the words printed in the detail. */
export function assemblyTextMatches(value: string, labels: TextBox[]) {
  const search = normalized(value);
  if (!search) return false;
  return labels.some(box => {
    const label = normalized(box.str);
    if (label === search) return true;
    const next = labels.find(b => b.y > box.y && b.y - box.y < box.h * 1.65 && Math.abs(b.x - box.x) <= .0012);
    return !!next && normalized(box.str + " " + next.str) === search;
  });
}

/** Dimensional text must have actual units and be printed on the same material label. */
export function assemblyThickness(value: string, label: string): number | null {
  const dimension = normalized(value), printed = normalized(label);
  const printedSizes: string[] = printed.match(/(?<![\d/])(?:\d+(?:\.\d+)?(?:[ -]\d+\/\d+|\/\d+)?)\s*(?:["']|MM\b|CM\b|MIL\b)/g) ?? [];
  if (!dimension || !printedSizes.includes(dimension) ||
    /\b(?:MIN(?:IMUM)?|MAX(?:IMUM)?|VARIES|TYP(?:ICAL)?\.?|SPACING|O\.C)\b/i.test(printed)) return null;
  const mil = /^(\d+(?:\.\d+)?)\s*MIL$/.exec(dimension);
  const feet = mil ? Number(mil[1]) / 12000 : drawingLengthFeet(dimension);
  return feet && feet > 0 && feet <= 4 ? feet : null;
}

/** A numbered floor in a detail title is explicit scope. A typical detail is retained as a reference. */
export function assemblyFloorLevel(title: string) {
  if (/\b(?:TYP(?:ICAL)?|SIM(?:ILAR)?)\b/i.test(title)) return null;
  const marked = /(?:\b(?:AT|FOR)\b|@)\s+(?:THE\s+)?((?:LEVEL\s+)?(?:B\d{1,2}|LEVEL\s+\d{1,2}|\d{1,2}(?:ST|ND|RD|TH)))(?:\s+(?:FLOOR|LEVEL))?\b/i.exec(title) ??
    /^\s*((?:BASEMENT\s+)?B\d{1,2}|LEVEL\s+\d{1,2}|\d{1,2}(?:ST|ND|RD|TH)\s+FLOOR)\b/i.exec(title);
  return marked ? levelOfTitle(marked[1] + " FLOOR") ?? levelOfTitle(marked[1]) : null;
}

/** Recover a dimension only when the detail's scale, both ticks and one layer arrow agree. */
function floorDimension(label: DrawingTextRun, lines: Segment[], feetPerPaperInch: number) {
  const thickness = drawingLengthFeet(label.text);
  if (!thickness || thickness <= 0 || thickness > 4 || Math.abs(label.a[0] - label.b[0]) > .4) return null;
  const center = (label.a[1] + label.b[1]) / 2, expected = thickness * 72 / feetPerPaperInch;
  const choices = lines.flatMap(({ a, b, width }) => {
    const top = Math.min(a[1], b[1]), bottom = Math.max(a[1], b[1]);
    const x = (a[0] + b[0]) / 2, offset = Math.abs(x - label.a[0]);
    if (Math.abs(a[0] - b[0]) > .35 || offset < label.height * .3 || offset > label.height * 1.8 ||
      top >= center || bottom <= center || bottom - top < expected) return [];
    const onAxis = (p: [number, number]) => Math.abs(p[0] - x) <= .35 && p[1] >= top && p[1] <= bottom;
    const ticks = lines.flatMap(tick => {
      if (tick.width <= width + .1) return [];
      const end = onAxis(tick.a) ? tick.a : onAxis(tick.b) ? tick.b : null;
      const dx = Math.abs(tick.a[0] - tick.b[0]), dy = Math.abs(tick.a[1] - tick.b[1]);
      return end && dx >= .7 && dy >= .7 && dx < label.height && dy < label.height ? [end[1]] : [];
    });
    const positions = [...new Set(ticks.map(y => y.toFixed(1)))].map(Number).sort((a, b) => a - b);
    return positions.slice(1).flatMap((end, i) => {
      const start = positions[i], span = end - start;
      return start < center && center < end && Math.abs(span - expected) <= Math.max(.8, expected * .04)
        ? [{ start, end, x }] : [];
    });
  });
  return choices.length === 1 ? { ...choices[0], thicknessFeet: thickness, thickness: label.text } : null;
}

/** Native callout leaders preserve the drawing's wording when visual extraction cannot read a floor detail. */
export function floorLeaderLayers(caption: AssemblyCaption, segments: Segment[], page: Page, text: DrawingTextRun[] = []):
  (AssemblyRead["layers"][number] & { thicknessFeet?: number })[] {
  const [left, top, width, height] = caption.box;
  const inCrop = ([x, y]: [number, number]) => x >= left * page.width && x <= (left + width) * page.width &&
    y >= top * page.height && y <= (top + height) * page.height;
  const lines = segments.filter(line => inCrop(line.a) && inCrop(line.b));
  const calls = caption.labels.flatMap(box => {
    const y = (box.y + box.h / 2) * page.height;
    const start = box.x * page.width, end = (box.x + box.w) * page.width, size = box.h * page.height;
    const text = box.str.trim();
    if (!/[A-Z]{2}/i.test(text) || /\b(?:SCALE|DETAIL NO\.?|ASSEMBLY BELOW)\b/i.test(text) || size <= 0) return [];
    const leaders = lines.flatMap(({ a, b }) => {
      if (Math.abs(a[1] - b[1]) > .4 || Math.abs(a[1] - y) > size * .28 || Math.abs(a[0] - b[0]) < size * 1.1) return [];
      const min = Math.min(a[0], b[0]), max = Math.max(a[0], b[0]);
      if (start - max >= size * .18 && start - max <= size * 1.8) return [{ x: min, y: a[1], side: -1 }];
      if (min - end >= size * .18 && min - end <= size * 1.8) return [{ x: max, y: a[1], side: 1 }];
      return [];
    });
    if (!leaders.length || new Set(leaders.map(l => l.side)).size !== 1) return [];
    const leader = leaders.reduce((a, b) => a.side * a.x > b.side * b.x ? a : b);
    // One angled segment from the leader elbow is the link to the profile.
    const tips = lines.flatMap(({ a, b }) => {
      const near = (p: [number, number]) => Math.hypot(p[0] - leader.x, p[1] - leader.y) < .55;
      const other = near(a) ? b : near(b) ? a : null;
      return other && (other[0] - leader.x) * leader.side > 1 && Math.abs(other[1] - leader.y) > .55 ? [other[1]] : [];
    });
    const tip = [...new Set(tips.map(v => v.toFixed(1)))];
    const tipY = tip.length ? tip.map(Number).reduce((sum, value) => sum + value, 0) / tip.length : leader.y;
    const continuation = caption.labels.find(other => other.y - box.y > box.h && other.y - box.y < box.h * 1.65 &&
      Math.abs(other.x - box.x) < .0004 && !lines.some(({ a, b }) =>
        Math.abs(a[1] - b[1]) <= .4 && Math.abs(a[1] - (other.y + other.h / 2) * page.height) <= size * .28 &&
        Math.abs((leader.side < 0 ? Math.max(a[0], b[0]) - start : Math.min(a[0], b[0]) - end)) <= size * 1.8));
    const material = continuation ? text + " " + continuation.str.trim() : text;
    const explicit = /^(\d+(?:[ -]\d+\/\d+|\/\d+|\.\d+)?\s*(?:["″”]|MM\b|MIL\b|CM\b))/i.exec(material)?.[1] ?? "";
    const depth = assemblyThickness(explicit, material);
    return [{ material, y: tipY, thickness: depth ? explicit : "", thicknessFeet: depth ?? undefined }];
  }).sort((a, b) => a.y - b.y);
  const cropText = text.filter(run => inCrop(run.a) && inCrop(run.b));
  const scales = [...new Set(cropText.flatMap(run => {
    if (run.a[1] < Math.max(...caption.labels.map(label => label.y + label.h)) * page.height) return [];
    const scale = feetPerInch(run.text);
    return scale ? [scale] : [];
  }))];
  if (scales.length === 1) {
    for (const label of cropText) {
      const dimension = floorDimension(label, lines, scales[0]);
      if (!dimension) continue;
      const sameLayer = calls.filter(call => call.y > dimension.start + 1 && call.y < dimension.end - 1);
      if (sameLayer.length === 1 && !sameLayer[0].thickness) {
        sameLayer[0].thickness = dimension.thickness;
        sameLayer[0].thicknessFeet = dimension.thicknessFeet;
      }
    }
  }
  const byMaterial = new Map(calls.map(({ material, thickness, thicknessFeet }) => [material, { material, thickness, thicknessFeet }]));
  return byMaterial.size >= 2 ? [...byMaterial.values()] : [];
}
