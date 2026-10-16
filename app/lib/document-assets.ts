export type DocumentAsset = { id: string; name: string; type: string; size: number };
export const ASSET_LIMIT = 3_000_000;
export const assetUrl = (asset: DocumentAsset) => `/api/document-assets?id=${encodeURIComponent(asset.id)}`;
export const assetId = (id: string) => /^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i.test(id);
export function documentFormat(type: string, bytes: Uint8Array): string {
  const starts = (...n: number[]) => n.every((v, i) => bytes[i] === v);
  if (!bytes.length || bytes.length > ASSET_LIMIT) throw new Error("Choose a file under 3 MB.");
  if (type === "application/pdf" && starts(37, 80, 68, 70, 45)) return "pdf";
  if (type === "image/png" && starts(137, 80, 78, 71, 13, 10, 26, 10)) return "png";
  if (type === "image/jpeg" && starts(255, 216, 255)) return "jpg";
  if (type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" && starts(80, 75, 3, 4)) return "docx";
  throw new Error("Choose a PDF, Word form, PNG or JPEG with a matching file type.");
}
export async function uploadDocument(file: File): Promise<DocumentAsset> {
  const response = await fetch(`/api/document-assets?name=${encodeURIComponent(file.name)}`, { method: "POST", headers: { "Content-Type": file.type }, body: file });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "The file could not be saved.");
  return body.asset;
}
