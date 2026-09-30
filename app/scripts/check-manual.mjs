import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
function load(path, require = (id) => { throw new Error(`Unexpected manual dependency: ${id}`); }) {
  const { outputText, diagnostics = [] } = ts.transpileModule(read(path), {
    fileName: path,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    reportDiagnostics: true,
  });
  assert.equal(diagnostics.length, 0, `${path}: ${diagnostics.map(d => ts.flattenDiagnosticMessageText(d.messageText, "\n")).join("\n")}`);
  const module = { exports: {} };
  new Function("module", "exports", "require", outputText)(module, module.exports, require);
  return module.exports;
}

const pages = load("lib/manual-pages.ts");
const { manualGuides, manualGroups, glossary, searchManual, manualMarkdown } = load("lib/user-manual.ts", (id) => {
  assert.equal(id, "./manual-pages", "The manual must use the extensionless local page-guide import");
  return pages;
});
const screenType = read("lib/screens.ts").match(/export type Screen\s*=\s*([^;]+);/);
assert(screenType, "Screen type was not found");
const screens = [...screenType[1].matchAll(/"([^"]+)"/g)].map(match => match[1]);
const { ALL_SCREENS, RETIRED_SCREENS, resolveScreen } = load("lib/screens.ts");
const retired = Object.keys(RETIRED_SCREENS);
const iconMap = read("app/page.tsx").match(/const ICONS: Record<string, typeof Box> = \{([^}]+)\}/);
assert(iconMap, "The page.tsx ICONS map was not found");
const iconNames = new Set(iconMap[1].split(",").map(name => name.trim()).filter(Boolean));
assert.equal(ALL_SCREENS.length, screens.length, "Every Screen id must appear once in the navigation groups");
for (const id of retired) {
  assert(!screens.includes(id) && !ALL_SCREENS.some(s => s.id === id), `${id}: a retired id is gone from the type and navigation`);
  assert(ALL_SCREENS.some(s => s.id === RETIRED_SCREENS[id]), `${id}: must redirect to a current screen`);
  assert.equal(resolveScreen(id), RETIRED_SCREENS[id]);
}
assert.equal(resolveScreen("packages"), "packages");
assert.equal(resolveScreen("nope"), null);
for (const screen of ALL_SCREENS) {
  assert(screens.includes(screen.id), `${screen.id}: navigation lists a screen that is not in the Screen type`);
  assert(iconNames.has(screen.icon), `${screen.id}: icon ${screen.icon} is missing from the page.tsx ICONS map`);
}
const ids = manualGuides.map(guide => guide.id);
const guideIds = new Set(ids);
const unique = (values, message) => assert.equal(new Set(values).size, values.length, message);
const nonempty = (value, message) => assert(typeof value === "string" && value.trim(), message);

assert.equal(screens.length, 26, "Expected coverage of all 26 current app screens");
unique(screens, "Screen ids must be unique");
unique(ids, "Manual article ids must be unique");
unique(manualGroups, "Manual group names must be unique");
assert(!guideIds.has("glossary"), "The virtual glossary id must not collide with an article");
for (const screen of screens) assert.equal(ids.filter(id => id === screen).length, 1, `${screen}: expected exactly one guide`);
for (const id of retired) assert(!ids.includes(id), `${id}: a retired screen has no guide`);
for (const guide of manualGuides) {
  for (const field of ["id", "title", "purpose", "example", "reality"]) nonempty(guide[field], `${guide.id}: empty ${field}`);
  assert(manualGroups.includes(guide.group), `${guide.id}: unknown group ${guide.group}`);
  assert(Array.isArray(guide.steps) && guide.steps.length, `${guide.id}: missing steps`);
  guide.steps.forEach(step => nonempty(step, `${guide.id}: empty step`));
  assert(Array.isArray(guide.terms) && guide.terms.length, `${guide.id}: missing terms`);
  guide.terms.forEach(term => {
    nonempty(term.name, `${guide.id}: empty term name`);
    nonempty(term.meaning, `${guide.id}: empty term meaning`);
  });
  assert(Array.isArray(guide.related), `${guide.id}: missing related links`);
  for (const related of guide.related) assert(related === "glossary" || guideIds.has(related), `${guide.id}: broken related link ${related}`);
}
for (const group of manualGroups) assert(manualGuides.some(guide => guide.group === group), `${group}: empty manual group`);

// Navigation contract — Marcel's 20 September structure.
const { SCREEN_GROUPS, DEFAULT_SCREEN, screenGroup, searchScreens } = load("lib/screens.ts");
assert(screens.includes(DEFAULT_SCREEN), `DEFAULT_SCREEN ${DEFAULT_SCREEN} is not a screen`);
unique(SCREEN_GROUPS.map(group => group.label), "Navigation group labels must be unique");
assert.deepEqual(SCREEN_GROUPS.filter(group => group.scope === "project").map(group => group.label), ["PRECONSTRUCTION", "OPERATIONS"], "Exactly two project groups: Preconstruction, then Operations");
for (const group of SCREEN_GROUPS) {
  assert(["global", "project"].includes(group.scope), `${group.label}: unknown scope ${group.scope}`);
  const runs = group.items.map(item => item.section ?? "").filter((section, i, all) => section && section !== all[i - 1]);
  unique(runs, `${group.label}: items in one section must be adjacent`);
}
for (const [former, id] of [["spec matrix", "specs"], ["drawing register", "drawings"], ["bidder directory", "bidders"], ["project turnover", "turnover"], ["conversations", "packages"], ["documents", "documents"]]) {
  assert(searchScreens(former).some(screen => screen.id === id), `Quick find must still reach ${id} by its former name "${former}"`);
}
// The manual follows the navigation: same group, and each title starts with the nav label.
for (const screen of ALL_SCREENS) {
  const guide = manualGuides.find(g => g.id === screen.id);
  assert(guide.title.startsWith(screen.label), `${screen.id}: manual title "${guide.title}" must start with nav label "${screen.label}"`);
  assert.equal(guide.group.toUpperCase(), screenGroup(screen.id)?.label ?? "WORKSPACE", `${screen.id}: manual group must match its navigation group`);
}
assert(glossary.length, "The glossary must contain terms");
// Glossary names are the entries' identities; the data does not define a separate id.
unique(glossary.map(term => term.name.trim().toLowerCase()), "Glossary term identities must be unique");
glossary.forEach(term => {
  nonempty(term.name, "Empty glossary term name");
  nonempty(term.meaning, `${term.name}: empty glossary definition`);
});

const resultIds = query => searchManual(query).map(guide => guide.id);
assert.deepEqual(resultIds(""), ids, "Empty search must show every guide");
assert.deepEqual(resultIds(" \n\t "), ids, "Whitespace search must show every guide");
const drawingResults = resultIds("drawing");
assert(drawingResults.length && drawingResults.length < ids.length, "Drawing search must narrow results");
assert.deepEqual(resultIds("DRAWING"), drawingResults, "Search must ignore case");
assert.deepEqual(resultIds("  drawing  "), drawingResults, "Search must ignore surrounding whitespace");
const combined = resultIds("floor plan");
assert(combined.includes("model"), "Multiword search must find relevant model guidance");
assert.deepEqual(combined, resultIds("floor").filter(id => resultIds("plan").includes(id)), "Multiword search must require every word");
assert.deepEqual(resultIds(" \tFLOOR\n  PLAN "), combined, "Search must normalize inter-word whitespace and case");
assert.deepEqual(resultIds("manual-no-result-79b304e1"), [], "Unmatched search must return no guides");

const markdown = manualMarkdown();
assert(markdown.startsWith("# Structor"), "Markdown must have the manual title");
const headings = markdown.split("\n").filter(line => line.startsWith("## "));
for (const guide of manualGuides) {
  assert.equal(headings.filter(line => line === `## ${guide.title}`).length, 1, `${guide.id}: missing or duplicate Markdown article`);
  for (const text of [guide.purpose, ...guide.steps, ...guide.terms.flatMap(term => [term.name, term.meaning]), guide.example, guide.reality]) {
    assert(markdown.includes(text), `${guide.id}: Markdown omits article content`);
  }
}
assert.equal(headings.filter(line => line === "## Glossary").length, 1, "Markdown must contain one glossary");
for (const term of glossary) assert(markdown.includes(`- **${term.name}:** ${term.meaning}`), `${term.name}: Markdown glossary entry missing`);
console.log(`Manual checked: ${screens.length} screens, ${manualGuides.length} guides, ${glossary.length} glossary terms; links, search, and full Markdown passed.`);
