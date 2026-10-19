import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { inspectSetupPdf, SetupFileChoice } from "./setup-file-drop";
import { RfpComparisonRows, RfpReview } from "./rfp-review";
import { SetupCheckStatus } from "./project-setup";
import { sampleProjectRecords } from "../../lib/projects";
import { compareRfpFacts } from "../../lib/rfp";
import type { StoredDocument } from "../../lib/project-files";

test("failed document checks show recovery instead of indefinite progress", () => {
  const failed = renderToStaticMarkup(<SetupCheckStatus checking={false} error="Referenced reports: AI request failed (502)." onRetry={() => {}}/>);
  assert.match(failed, /role="alert"/);
  assert.match(failed, /Completed results are kept/);
  assert.match(failed, /Referenced reports: AI request failed \(502\)/);
  assert.match(failed, /Retry checks/);
  assert.doesNotMatch(failed, /Checking documents…/);
  assert.match(renderToStaticMarkup(<SetupCheckStatus checking error={null} onRetry={() => {}}/>), /role="status"[^>]*>Checking documents…/);
  assert.equal(renderToStaticMarkup(<SetupCheckStatus checking={false} error={null} onRetry={() => {}}/>), "");
});

test("uncertain PDFs require a category choice and retain the classification reason", () => {
  const html = renderToStaticMarkup(<SetupFileChoice row={{ id: 1, file: new File(["%PDF-"], "scan.pdf"), category: "", guess: { category: "Other", confidence: "low", reason: "Nothing identified it." }, status: "ready", error: "" }} disabled={false} onChange={() => {}} onRemove={() => {}}/>);
  assert.match(html, /Choose a category/);
  assert.match(html, /Nothing identified it/);
  assert.match(html, /option value="" selected=""/);
  assert.doesNotMatch(html, /option selected="">Other/);
});

test("a confident guess can be reviewed and an upload error stays attached to its file", () => {
  const html = renderToStaticMarkup(<SetupFileChoice row={{ id: 1, file: new File(["%PDF-"], "Addendum 02.pdf"), category: "Addenda", guess: { category: "Addenda", confidence: "high", reason: "It says it is an addendum." }, status: "failed", error: "Upload failed (503)." }} disabled={false} onChange={() => {}} onRemove={() => {}}/>);
  assert.match(html, /option selected="">Addenda/);
  assert.match(html, /You can change the category/);
  assert.match(html, /role="alert"[^>]*>Upload failed \(503\)/);
});

test("invalid non-PDF files fail before the PDF reader or upload is loaded", async () => {
  await assert.rejects(() => inspectSetupPdf(new File(["plain text"], "fake.pdf")), /Choose a PDF file/);
});

test("an addendum's changed bid date shows both values without automatically selecting the change", () => {
  const project = sampleProjectRecords[0];
  const rows = compareRfpFacts(project, [{ field: "due", value: "2026-11-06", page: 1, quote: "The bid due date is November 6, 2026." }]).rows;
  assert.equal(rows[0].conflict, true);
  const html = renderToStaticMarkup(<RfpComparisonRows rows={rows} selected={[]} sourceLabel="addendum" onSelect={() => {}} onSource={() => {}}/>);
  assert.match(html, /FROM THE ADDENDUM/);
  assert.match(html, /Different from current/);
  assert.doesNotMatch(html, /checked=""/);
  const button = renderToStaticMarkup(<RfpReview project={project} doc={{ category: "Addenda" } as StoredDocument} onSave={() => {}} onReviewed={() => null}/>);
  assert.match(button, /Read addendum with AI/);
});
