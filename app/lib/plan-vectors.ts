// Drawing geometry straight from a vector PDF (drawings to 3D, M1, 20 Oct). Revit and AutoCAD sheets
// carry their linework as real paths; reading them gives exact lines at the printed scale, where an AI
// reading the page image can only estimate positions. The AI's part is meaning (tags, room names),
// not coordinates. Pure: takes pdf.js's operator list, so it runs in the browser and on the server.

export type Point = [number, number];
/** A straight stroke on the sheet, in page points (1/72 in), x right and y down as the sheet is viewed. */
export type Segment = { a: Point; b: Point; width: number; color: string };

type Matrix = [number, number, number, number, number, number];
const multiply = (m: Matrix, n: Matrix): Matrix => [
  m[0] * n[0] + m[1] * n[2], m[0] * n[1] + m[1] * n[3],
  m[2] * n[0] + m[3] * n[2], m[2] * n[1] + m[3] * n[3],
  m[4] * n[0] + m[5] * n[2] + n[4], m[4] * n[1] + m[5] * n[3] + n[5],
];
const apply = (m: Matrix, x: number, y: number): Point => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

/** pdf.js path codes inside constructPath (pdf.js 5+). */
const MOVE = 0, LINE = 1, CURVE = 2, QUAD = 3, CLOSE = 4;

/** A stroked cubic curve (door swings are drawn as these), in page points: from, two controls, to. */
export type Curve = { from: Point; c1: Point; c2: Point; to: Point; width: number };

/**
 * Every stroked straight line on the page. `ops` is page.getOperatorList(), `OPS` is pdfjs.OPS and
 * `viewport` is page.getViewport({ scale: 1 }).transform (it carries the page's rotation). Curves are
 * not lines (door swings stay out of wall finding; see vectorsFromOperators); fills are skipped.
 */
export function segmentsFromOperators(ops: { fnArray: number[]; argsArray: unknown[] }, OPS: Record<string, number>, viewport: number[]): Segment[] {
  return vectorsFromOperators(ops, OPS, viewport).segments;
}

/** Stroked lines and stroked cubic curves (quadratic ones raised to cubic), as segmentsFromOperators. */
export function vectorsFromOperators(ops: { fnArray: number[]; argsArray: unknown[] }, OPS: Record<string, number>, viewport: number[]): { segments: Segment[]; curves: Curve[] } {
  const strokes = new Set(["stroke", "closeStroke", "fillStroke", "eoFillStroke", "closeFillStroke", "closeEOFillStroke"].map(k => OPS[k]));
  const out: Segment[] = [], curves: Curve[] = [];
  let state = { ctm: [1, 0, 0, 1, 0, 0] as Matrix, width: 1, color: "#000000" };
  const stack: typeof state[] = [];
  const view = viewport as Matrix;
  for (let i = 0; i < ops.fnArray.length; i++) {
    const fn = ops.fnArray[i], args = ops.argsArray[i] as any[];
    if (fn === OPS.save) stack.push({ ...state });
    else if (fn === OPS.restore) state = stack.pop() ?? state;
    else if (fn === OPS.transform) state = { ...state, ctm: multiply(args as Matrix, state.ctm) };
    else if (fn === OPS.setLineWidth) state = { ...state, width: args[0] };
    else if (fn === OPS.setStrokeRGBColor) state = { ...state, color: String(args[0]) };
    else if (fn === OPS.constructPath && strokes.has(args[0])) {
      const data: ArrayLike<number> = Array.isArray(args[1]) ? args[1][0] : args[1];
      if (!data) continue;
      const m = multiply(state.ctm, view);
      const width = state.width * Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]));
      let start: Point | null = null, at: Point | null = null;
      for (let j = 0; j < data.length;) {
        const code = data[j];
        if (code === MOVE) { at = start = apply(m, data[j + 1], data[j + 2]); j += 3; }
        else if (code === LINE) { const p = apply(m, data[j + 1], data[j + 2]); if (at) out.push({ a: at, b: p, width, color: state.color }); at = p; j += 3; }
        else if (code === CURVE) {
          const c1 = apply(m, data[j + 1], data[j + 2]), c2 = apply(m, data[j + 3], data[j + 4]), to = apply(m, data[j + 5], data[j + 6]);
          if (at) curves.push({ from: at, c1, c2, to, width });
          at = to; j += 7;
        } else if (code === QUAD) {
          const q = apply(m, data[j + 1], data[j + 2]), to = apply(m, data[j + 3], data[j + 4]);
          if (at) { const from = at; curves.push({ from, c1: [from[0] + (2 / 3) * (q[0] - from[0]), from[1] + (2 / 3) * (q[1] - from[1])], c2: [to[0] + (2 / 3) * (q[0] - to[0]), to[1] + (2 / 3) * (q[1] - to[1])], to, width }); }
          at = to; j += 5;
        }
        else if (code === CLOSE) { if (at && start && (at[0] !== start[0] || at[1] !== start[1])) out.push({ a: at, b: start, width, color: state.color }); at = start; j += 1; }
        else break; // an unknown code: stop reading this path rather than misread it
      }
    }
  }
  return { segments: out, curves };
}
