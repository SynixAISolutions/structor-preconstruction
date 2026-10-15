/** Coverage is based on an explicit source review, never on loose keyword matches. */
export function drywallAccuracy({ answerKey, readings, review, quantities = [] }) {
  const required = answerKey?.items, mappings = review?.matches, findings = readings.flatMap(reading => reading.findings ?? []);
  if (!Array.isArray(required) || !required.length || !Array.isArray(mappings) || typeof review.reviewer !== "string" || !review.reviewer.trim()) throw new Error("Provide a private answer key and a named review mapping its items to finding ids.");
  const expectedIds = new Set(), findingIds = new Set();
  for (const item of required) {
    if (!item || typeof item.id !== "string" || !item.id || expectedIds.has(item.id) || typeof item.title !== "string" || !item.title.trim()) throw new Error("Every answer-key item needs a unique id and title.");
    expectedIds.add(item.id);
  }
  for (const finding of findings) {
    if (!finding || typeof finding.id !== "string" || findingIds.has(finding.id) || !Array.isArray(finding.citations) || !finding.citations.length) throw new Error("Exported findings need unique ids and citations.");
    findingIds.add(finding.id);
  }
  if (!Array.isArray(review.reviewedItemIds) || review.reviewedItemIds.some(id => !expectedIds.has(id)) || new Set(review.reviewedItemIds).size !== review.reviewedItemIds.length) throw new Error("Name the answer-key item ids actually source-reviewed; unexamined items must remain unassessed.");
  const reviewed = new Set(review.reviewedItemIds);
  if (!findings.some(f => f.kind === "scope") && reviewed.size) throw new Error("A reading with no scope findings cannot be scored. Leave its items unassessed.");
  const used = new Set(), matched = new Set();
  for (const match of mappings) {
    if (!expectedIds.has(match.expectedId) || !reviewed.has(match.expectedId) || matched.has(match.expectedId) || !Array.isArray(match.findingIds) || !match.findingIds.length) throw new Error("A review match needs one reviewed answer-key item and its finding ids, once per item.");
    for (const id of match.findingIds) {
      const finding = findings.find(f => f.id === id);
      if (!finding || finding.kind !== "scope" || finding.status === "rejected") throw new Error(`Review match ${id} is missing, rejected or not a scope item.`);
      used.add(id);
    }
    matched.add(match.expectedId);
  }
  const quantityDeltas = (answerKey.quantities ?? []).map(expected => {
    const actual = quantities.filter(row => row.id === expected.id);
    if (actual.some(row => row.unit !== expected.unit || !Number.isFinite(row.value) || row.value < 0)) throw new Error(`${expected.id}: quantity units must agree and values must be finite and non-negative.`);
    if (expected.value !== null && (!Number.isFinite(expected.value) || expected.value < 0)) throw new Error("A checked quantity must be finite and non-negative, or null when unavailable.");
    const value = actual.length ? actual.reduce((sum, row) => sum + row.value, 0) : null;
    if (value !== null && !Number.isFinite(value)) throw new Error("Quantity total is too large.");
    return { id: expected.id, title: expected.title, unit: expected.unit, expected: expected.value, actual: value, delta: expected.value === null || value === null ? null : value - expected.value, status: expected.value === null ? "checked-takeoff-unavailable" : value === null ? "not-measured" : "compared" };
  });
  return {
    reviewer: review.reviewer,
    found: required.filter(item => matched.has(item.id)), missed: required.filter(item => reviewed.has(item.id) && !matched.has(item.id)), unassessed: required.filter(item => !reviewed.has(item.id)),
    extra: findings.filter(finding => finding.kind === "scope" && finding.status !== "rejected" && !used.has(finding.id)).map(finding => ({ id: finding.id, title: finding.title, source: finding.source })),
    quantityDeltas,
    failedRuns: readings.filter(reading => reading.run?.status === "failed").length,
    failures: readings.flatMap(reading => reading.run?.notes?.failures ?? []),
    screening: readings.flatMap(reading => reading.run?.notes?.screening ?? []),
    limits: "Found means linked by the named source reviewer. Extra means outside the answer-key mapping, not necessarily incorrect. Image citations require visual verification. Quantity accuracy is unavailable wherever the checked takeoff is missing.",
  };
}
