/** Some drawing exports title the architectural plan "Floor plan L0" and use L0 in place of an A-series sheet number. */
export function compactFloorPlanTitle(title: string): { sheet: string; level: number; title: string } | null {
  const id = /^(?:FLOOR\s+PLAN\s+(L\d{1,2})|(L\d{1,2})\s+FLOOR\s+PLAN)$/i.exec(title.trim());
  if (!id) return null;
  const sheet = (id[1] ?? id[2]).toUpperCase();
  return { sheet, level: Number(sheet.slice(1)), title: `Floor plan ${sheet}` };
}

/** Read a unique, stand-alone floor plan title from the PDF text. Sheet references and notes do not count. */
export function compactFloorPlanFromText(text: string): ReturnType<typeof compactFloorPlanTitle> {
  const titles = new Map<string, NonNullable<ReturnType<typeof compactFloorPlanTitle>>>();
  for (const line of text.split(/\r?\n/)) {
    const plan = compactFloorPlanTitle(line);
    if (plan) titles.set(plan.sheet, plan);
  }
  return titles.size === 1 ? titles.values().next().value ?? null : null;
}

const namedFloors: Record<string, number> = { GROUND: 1, FIRST: 1, SECOND: 2, THIRD: 3, FOURTH: 4, FIFTH: 5, SIXTH: 6, SEVENTH: 7, EIGHTH: 8, NINTH: 9, TENTH: 10 };

function floorNumber(label: string): number | undefined {
  const name = label.trim().replace(/^LEVELS?\s+|\s+LEVEL$/g, "");
  const basement = /^(?:BASEMENT\s+)?B([1-9]\d?)$/.exec(name);
  if (basement) return -Number(basement[1]);
  const floor = /^L?(\d{1,2})(?:ST|ND|RD|TH)?$/.exec(name);
  return floor ? Number(floor[1]) : namedFloors[name];
}

/** The levels explicitly named by a plan caption or sheet title, including a printed typical-floor range. */
export function printedPlanLevels(title: string): number[] {
  const name = title.toUpperCase().replace(/\(\s*TYP(?:ICAL)?\.?\s*\)/g, "").trim();
  const caption = /^(.*?)\s+FLOOR\s+PLANS?$/.exec(name);
  if (!caption) return [];
  const levels: number[] = [];
  for (const label of caption[1].split(/\s*(?:&|,|\/|\bAND\b)\s*/)) {
    const [first, last, extra] = label.split(/\s*(?:[-–—]|\bTO\b|\bTHROUGH\b)\s*/);
    const from = floorNumber(first), to = last === undefined ? from : floorNumber(last);
    if (from === undefined || to === undefined || extra !== undefined || Math.abs(to - from) > 30) return [];
    for (let level = Math.min(from, to); level <= Math.max(from, to); level++) levels.push(level);
  }
  return [...new Set(levels)].sort((a, b) => a - b);
}
