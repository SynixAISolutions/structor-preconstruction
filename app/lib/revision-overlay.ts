// Bluebeam-style overlay (Marcel, 15 Oct: "it puts the new one on the old one and shows any changes"):
// two renders of one sheet, same size, RGBA. Linework only in the previous revision turns red
// (removed), only in the new one blue (added), in both stays grey; paper stays white.

export const OVERLAY_COLORS = { removed: [214, 40, 40], added: [27, 96, 214], both: [120, 126, 132] } as const;

export type ChangeBox = { x: number; y: number; width: number; height: number; pixels: number };

/**
 * Where an overlay changed: cells of `cell` pixels with enough red/blue ink, joined with their
 * neighbours into boxes (0–1 of the sheet), largest change first. Used to zoom the AI into each spot.
 */
export function changeBoxes(overlay: Uint8ClampedArray, width: number, height: number, cell = 48, minPixels = 25): ChangeBox[] {
  const cols = Math.ceil(width / cell), rows = Math.ceil(height / cell);
  const counts = new Uint32Array(cols * rows);
  for (let i = 0; i < overlay.length; i += 4) {
    const [r, g, b] = [overlay[i], overlay[i + 1], overlay[i + 2]];
    const changed = (r === OVERLAY_COLORS.removed[0] && g === OVERLAY_COLORS.removed[1] && b === OVERLAY_COLORS.removed[2]) || (r === OVERLAY_COLORS.added[0] && g === OVERLAY_COLORS.added[1] && b === OVERLAY_COLORS.added[2]);
    if (changed) { const p = i / 4; counts[Math.floor(Math.floor(p / width) / cell) * cols + Math.floor((p % width) / cell)]++; }
  }
  const seen = new Uint8Array(cols * rows), boxes: ChangeBox[] = [];
  for (let start = 0; start < counts.length; start++) {
    if (seen[start] || counts[start] < minPixels) continue;
    let [x0, y0, x1, y1, pixels] = [cols, rows, 0, 0, 0];
    const stack = [start]; seen[start] = 1;
    while (stack.length) {
      const c = stack.pop()!, cx = c % cols, cy = Math.floor(c / cols);
      x0 = Math.min(x0, cx); y0 = Math.min(y0, cy); x1 = Math.max(x1, cx); y1 = Math.max(y1, cy); pixels += counts[c];
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
        const nx = cx + dx, ny = cy + dy, n = ny * cols + nx;
        if (nx >= 0 && ny >= 0 && nx < cols && ny < rows && !seen[n] && counts[n] >= minPixels) { seen[n] = 1; stack.push(n); }
      }
    }
    const round = (v: number) => Math.round(v * 10000) / 10000;
    boxes.push({ x: round((x0 * cell) / width), y: round((y0 * cell) / height), width: round(Math.min(1, ((x1 + 1) * cell) / width) - (x0 * cell) / width), height: round(Math.min(1, ((y1 + 1) * cell) / height) - (y0 * cell) / height), pixels });
  }
  return boxes.sort((a, b) => b.pixels - a.pixels);
}

export function overlayPixels(previous: Uint8ClampedArray, next: Uint8ClampedArray, out: Uint8ClampedArray, threshold = 170): { removed: number; added: number } {
  if (previous.length !== next.length || out.length !== next.length) throw new Error("Both renders must be the same size.");
  let removed = 0, added = 0;
  for (let i = 0; i < next.length; i += 4) {
    const a = (previous[i] * 299 + previous[i + 1] * 587 + previous[i + 2] * 114) / 1000 < threshold;
    const b = (next[i] * 299 + next[i + 1] * 587 + next[i + 2] * 114) / 1000 < threshold;
    const color = a && b ? OVERLAY_COLORS.both : a ? OVERLAY_COLORS.removed : b ? OVERLAY_COLORS.added : null;
    if (a && !b) removed++; else if (b && !a) added++;
    out[i] = color ? color[0] : 255; out[i + 1] = color ? color[1] : 255; out[i + 2] = color ? color[2] : 255; out[i + 3] = 255;
  }
  return { removed, added };
}
