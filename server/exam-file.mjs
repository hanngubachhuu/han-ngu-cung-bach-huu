// Shared limits reflect Vercel's 4.5 MB request ceiling: base64 expands 3 MiB to 4 MiB.
export const documentLimits = Object.freeze({
  bytes: 3 * 1024 * 1024,
  pages: 80,
  textCharacters: 1000000,
  questions: 200,
});
export function detectDocument(bytes, name) {
  if (!bytes?.length || bytes.length > documentLimits.bytes)
    throw Error("DOCUMENT_TOO_LARGE");
  const lower = String(name).toLowerCase();
  if (lower.endsWith(".pdf") && bytes.subarray(0, 5).toString() === "%PDF-")
    return "pdf";
  if (lower.endsWith(".docx") && bytes.readUInt32LE?.(0) === 0x04034b50)
    return "docx";
  throw Error("DOCUMENT_UNSUPPORTED");
}
