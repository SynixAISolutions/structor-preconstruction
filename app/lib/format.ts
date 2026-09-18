// Shared formatting and file-download helpers. Presentation-neutral: these decide
// what a value says, not how it looks.

export const usd = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

/** Renders a yyyy-mm-dd string at local noon so the date never slips a day across time zones. */
export const displayDate = (date: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

export function downloadText(name: string, content: string, type = "text/plain") {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** CSV cells are quoted, and a leading =+@- is prefixed with ' so spreadsheets do not execute it. */
export function exportRows(name: string, rows: (string | number)[][]) {
  const csv = rows
    .map(row => row.map(v => {
      const text = String(v);
      return `"${(/^[=+@-]/.test(text) ? "'" : "") + text.replaceAll('"', '""')}"`;
    }).join(","))
    .join("\r\n");
  downloadText(name, csv, "text/csv");
}
export const dateLabel = (value: string) => new Date(`${value}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
