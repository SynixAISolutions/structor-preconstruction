import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { FormLayout, FormText, changeFormBlock } from "./company-forms";
import { contractScopeDraft } from "./contract-files";
import { generateSampleExhibit, type Award, type AwardSnapshot, type DocumentTemplate } from "../../lib/award";

const template: DocumentTemplate = { id: "qa-form", name: "QA company form", version: "1", sample: false, notice: "QA", layout: { title: "Exhibit A · {project}", blocks: [{ kind: "text", heading: "1. General", lines: ["Keep this exact wording."] }, { kind: "scope", heading: "2. Specific notes", intro: "Scope introduction", append: ["Scope closing text"] }, { kind: "exclusions", heading: "3. Scope exclusions" }] } };
test("mapped preview preserves headings, distinguishes slots, known fields and unresolved gaps", () => {
  const html = renderToStaticMarkup(<FormLayout template={template}/>);
  assert.match(html, /1\. General/); assert.match(html, /Keep this exact wording/); assert.match(html, /scope slot/); assert.match(html, /3\. Scope exclusions/);
  const fields = renderToStaticMarkup(<FormText text="{project} {unknown} [gap]"/>);
  assert.equal((fields.match(/cf-field/g) ?? []).length, 1); assert.equal((fields.match(/cf-gap/g) ?? []).length, 2);
  assert.deepEqual(changeFormBlock({ kind: "text", heading: "1. Scope", lines: ["Retained closing wording"] }, "scope"), { kind: "scope", heading: "1. Scope", append: ["Retained closing wording"] });
});
test("scope wording updates the saved template's actual scope slot and keeps all other sections", () => {
  const snapshot = { projectName: "QA building", packageName: "Drywall", packageCode: "09", company: { name: "QA trade" }, scope: [{ id: "a", title: "Wall systems", detail: "", source: "A1.1", answer: "Y", note: "" }], exclusions: ["QA exclusion"], clarifications: [], alternates: [], allowances: [] } as unknown as AwardSnapshot;
  const terms = { amount: 1000, basis: "base", revisionNumber: 1 } as const;
  const content = generateSampleExhibit(snapshot, terms, template);
  const award = { ...terms, snapshot, exhibit: { revisions: [{ number: 1, content, template }] } } as unknown as Award;
  const before = JSON.stringify(award), result = contractScopeDraft(award, ["Reviewed AI scope obligation"]);
  assert.equal(result.index, 1);
  assert.deepEqual(result.content.sections[1].lines, ["Scope introduction", "Reviewed AI scope obligation", "Scope closing text"]);
  assert.deepEqual(result.content.sections[0], content.sections[0]); assert.deepEqual(result.content.sections[2], content.sections[2]);
  assert.equal(JSON.stringify(award), before);
});
