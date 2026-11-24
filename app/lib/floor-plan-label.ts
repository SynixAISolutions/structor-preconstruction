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
