// What a wall is made of, layer by layer, as the drawings say (drawings to 3D, 9 Nov). The partition type sheet draws each
// type's section with its layers labelled and keys its tag to a legend: on Project 1's A8.1, SA.3.10 is steel studs (S),
// full height (A), 3-5/8" studs (3), one layer of gypsum board on the tag side (1), no unique condition (0); 3-5/8" + 5/8"
// is the schedule's 4 1/4". The AI reads the sheet (lib/ai-jobs-more "partition-types", "wall-layers"); this checks and
// presents what it read. Nothing here invents a layer.

/** One layer of a wall, from the side its tag is on to the other: what it is, and how thick in inches (null when not given). */
export type WallLayer = { material: string; inches: number | null };

/** "4 1/4\"", "3-5/8\"", "5/8\"", "1'-0\"", "6" → inches; null when it isn't a length. */
export function parseInches(text: string): number | null {
  const t = text.replace(/[″”]/g, "\"").replace(/[′’]/g, "'").trim();
  const feet = t.match(/^(\d+(?:\.\d+)?)'\s*-?\s*(.*)$/);
  if (feet) { const rest = feet[2].trim(); const inch = rest ? parseInches(rest) : 0; return inch === null ? null : Number(feet[1]) * 12 + inch; }
  const m = t.replace(/"$/, "").trim().match(/^(?:(\d+(?:\.\d+)?)(?:\s+|-))?(?:(\d+)\/(\d+))?$|^(\d+(?:\.\d+)?)$/);
  if (!m) return null;
  if (m[4]) return Number(m[4]);
  const whole = m[1] ? Number(m[1]) : 0, part = m[2] && m[3] && Number(m[3]) ? Number(m[2]) / Number(m[3]) : 0;
  return m[1] || m[2] ? whole + part : null;
}

/** At most this many layers to a wall, each at most this thick in inches. */
export const MAX_LAYERS = 12, MAX_LAYER_INCHES = 24;

/** Layers as the AI gave them, kept only when sensible: a material named, a thickness in range or none. */
export function screenLayers(raw: unknown): WallLayer[] {
  return (Array.isArray(raw) ? raw : []).slice(0, MAX_LAYERS).flatMap((l): WallLayer[] => {
    const o = (l ?? {}) as Record<string, unknown>;
    const material = typeof o.material === "string" ? o.material.trim().slice(0, 60) : "";
    const n = typeof o.inches === "number" ? o.inches : typeof o.inches === "string" ? parseInches(o.inches) : null;
    const inches = n !== null && Number.isFinite(n) && n > 0 && n <= MAX_LAYER_INCHES ? Math.round(n * 1000) / 1000 : null;
    return material ? [{ material, inches }] : [];
  });
}

/** Layers that add up to the schedule's printed thickness, within this, are taken as checked. */
export const LAYERS_FIT_INCHES = 0.25;

/** Insulation in a stud cavity: drawn inside the framing before it, not as a layer of its own thickness. */
const CAVITY = /insulat|batt|blanket|mineral wool|spray foam|fiberglass/i;
/** Whether each layer is insulation inside the framing before it (no thickness of its own). */
const inCavity = (layers: WallLayer[]) => layers.map((l, i) => l.inches === null && i > 0 && layers[i - 1].inches !== null && CAVITY.test(l.material));

/** What a wall's layers add up to in inches; null when a layer (other than insulation in the cavity) has no thickness. */
export function layersTotal(layers: WallLayer[]): number | null {
  const inside = inCavity(layers);
  return !layers.length || layers.some((l, i) => l.inches === null && !inside[i]) ? null : layers.reduce((s, l) => s + (l.inches ?? 0), 0);
}

/**
 * Whether a type's layers add up to its printed thickness: "fits" within LAYERS_FIT_INCHES, "off" when they don't, "unknown"
 * when a layer has no thickness (insulation in the stud cavity aside) or the schedule prints none (or "varies").
 */
export function layersFit(layers: WallLayer[], printed: string): "fits" | "off" | "unknown" {
  const total = parseInches(printed), sum = layersTotal(layers);
  if (total === null || sum === null) return "unknown";
  return Math.abs(sum - total) <= LAYERS_FIT_INCHES ? "fits" : "off";
}

/** Inches as a drawing prints them, to the nearest sixteenth: 0.625 → 5/8", 3.625 → 3 5/8", 12 → 12". */
export function inchesLabel(inches: number): string {
  const sixteenths = Math.round(inches * 16), whole = Math.floor(sixteenths / 16);
  let part = sixteenths % 16, den = 16;
  while (part && part % 2 === 0) { part /= 2; den /= 2; }
  return `${whole || !part ? whole : ""}${whole && part ? " " : ""}${part ? `${part}/${den}` : ""}"`;
}

/**
 * A layer as the 3D view draws it, across the wall in feet: `center` from the wall's centerline (negative on the side the
 * layers start from, the tag side) and `depth` its drawn thickness. `inside` is insulation drawn within the framing before it.
 * `drawnInches` is what's drawn when the drawings give no thickness: a share of what the measured wall leaves, never less
 * than 1/4"; the layer list still says "not given".
 */
export type LayerSlab = WallLayer & { center: number; depth: number; inside: boolean; drawnInches: number };

export function layerSlabs(layers: WallLayer[], measuredFeet: number): LayerSlab[] {
  const inside = inCavity(layers);
  const known = layers.reduce((s, l) => s + (l.inches ?? 0), 0), unknown = layers.filter((l, i) => l.inches === null && !inside[i]).length;
  const share = unknown ? Math.max(0.25, (measuredFeet * 12 - known) / unknown) : 0;
  const drawn = layers.map((l, i) => l.inches ?? (inside[i] ? (layers[i - 1].inches ?? 0) * 0.85 : share));
  const total = layers.reduce((s, _, i) => s + (inside[i] ? 0 : drawn[i]), 0) / 12;
  let at = -total / 2, last = 0;
  return layers.map((l, i) => {
    const depth = drawn[i] / 12;
    if (inside[i]) return { ...l, center: last, depth, inside: true, drawnInches: drawn[i] };
    last = at + depth / 2; at += depth;
    return { ...l, center: last, depth, inside: false, drawnInches: drawn[i] };
  });
}

/** How far apart the layers of a wall this long slide when it opens, in feet: an eighth of its length, 1 to 6 ft. */
export const layerGap = (lengthFeet: number) => Math.min(6, Math.max(1, lengthFeet / 8));

/** Where layer `index` of `count` ends up when the wall opens: its place in the wall, moved out by its turn in the stack. */
export const openedCenter = (slab: Pick<LayerSlab, "center">, index: number, count: number, gap: number) => slab.center + (index - (count - 1) / 2) * gap;

/** A layer's colour in the 3D view, by what it's made of. */
export function layerColor(material: string): string {
  const m = material.toLowerCase();
  if (/insulat|batt|blanket|mineral wool|spray foam|rigid/.test(m)) return "#efcf67";
  if (/gypsum|gwb|drywall|plaster|sheetrock|shaft ?liner|cement board/.test(m)) return "#eee6d5";
  if (/masonry|cmu|block/.test(m)) return "#9ea4a8";
  if (/brick/.test(m)) return "#b4643c";
  if (/concrete|grout/.test(m)) return "#b9b4aa";
  if (/wood|plywood|osb|sheathing|lumber/.test(m)) return "#c9a06e";
  if (/stud|metal|steel|framing|channel|furring|track/.test(m)) return "#a7b4bb";
  if (/air|cavity|gap/.test(m)) return "#dfe9ef";
  if (/tile|stone|panel|finish|paint/.test(m)) return "#d9cbb5";
  return "#c8c5bc";
}
