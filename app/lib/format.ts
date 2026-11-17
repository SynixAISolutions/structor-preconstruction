// Shared formatting and file-download helpers. Presentation-neutral: these decide
// what a value says, not how it looks.

export const usd = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

const localNoon = (date: string) => { const d = new Date(`${date}T12:00:00`); return /^\d{4}-\d{2}-\d{2}$/.test(date) && !isNaN(d.getTime()) ? d : null; };

/** Renders a yyyy-mm-dd string at local noon so the date never slips a day across time zones. Blank or invalid → "Not set". */
export const displayDate = (date: string) =>
  localNoon(date)?.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) ?? "Not set";

/** Saves `content` (text, or bytes such as a PDF) as a file named `name`. */
export function downloadText(name: string, content: BlobPart, type = "text/plain") {
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
export const dateLabel = (value: string) => localNoon(value)?.toLocaleDateString("en-US", { month: "short", day: "numeric" }) ?? "Not set";

/**
 * A whole number as it's typed, with commas between thousands: "1250000" → "1,250,000" (Marcel's feedback log, 7 Nov:
 * "add automatic commas when number in millions, same thing for square footage"). Anything but digits is dropped, and
 * leading zeros with it; "" stays "".
 */
export const groupDigits = (text: string): string => {
  const digits = text.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
};
/** Where the caret belongs after grouping: just past the same number of digits it followed before. */
export const caretAfterDigits = (grouped: string, digitsBefore: number): number => {
  if (digitsBefore <= 0) return 0;
  let seen = 0;
  for (let i = 0; i < grouped.length; i++) if (/\d/.test(grouped[i]) && ++seen === digitsBefore) return i + 1;
  return grouped.length;
};
