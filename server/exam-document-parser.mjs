import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import mammoth from "mammoth";
import { parseFragment } from "parse5";
import { documentLimits, detectDocument } from "./exam-file.mjs";
function validateZip(bytes) {
  // Inspect central directory before decompression; reject encryption, ZIP64 and bombs.
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--)
    if (bytes.readUInt32LE(i) === 0x06054b50) {
      end = i;
      break;
    }
  if (end < 0) throw Error("DOCUMENT_UNREADABLE");
  const count = bytes.readUInt16LE(end + 10),
    offset = bytes.readUInt32LE(end + 16);
  if (count > 5000 || offset === 0xffffffff) throw Error("DOCUMENT_UNREADABLE");
  let index = offset,
    total = 0,
    main = false;
  for (let n = 0; n < count; n++) {
    if (index + 46 > bytes.length || bytes.readUInt32LE(index) !== 0x02014b50)
      throw Error("DOCUMENT_UNREADABLE");
    const flags = bytes.readUInt16LE(index + 8),
      compressed = bytes.readUInt32LE(index + 20),
      size = bytes.readUInt32LE(index + 24),
      length = bytes.readUInt16LE(index + 28),
      extra = bytes.readUInt16LE(index + 30),
      comment = bytes.readUInt16LE(index + 32);
    total += size;
    if (
      flags & 1 ||
      total > 32 * 1024 * 1024 ||
      size > 12 * 1024 * 1024 ||
      (size > 1024 * 1024 && size / Math.max(1, compressed) > 200)
    )
      throw Error("DOCUMENT_UNREADABLE");
    const name = bytes
      .subarray(index + 46, index + 46 + length)
      .toString("utf8");
    if (name === "word/document.xml") main = true;
    if (
      name.includes("..") ||
      name.startsWith("/") ||
      name.includes("\\") ||
      /vbaProject\.bin$/i.test(name)
    )
      throw Error("DOCUMENT_UNSUPPORTED");
    index += 46 + length + extra + comment;
  }
  if (!main) throw Error("DOCUMENT_UNREADABLE");
}
function wordLines(html) {
  const output = [],
    warnings = [];
  let image = false;
  function text(node) {
    if (node.nodeName === "#text") return node.value;
    if (node.tagName === "br") return "\n";
    if (node.tagName === "img") {
      image = true;
      return "[Hình ảnh trong file — cần đối chiếu bản gốc]";
    }
    return (node.childNodes || []).map(text).join("");
  }
  function walk(node) {
    if (node.tagName === "ol" || node.tagName === "ul") {
      let n = Number(node.attrs?.find((a) => a.name === "start")?.value) || 1;
      for (const child of node.childNodes || []) {
        if (child.tagName === "li") {
          output.push(
            (node.tagName === "ol" ? `${n++}. ` : "• ") + text(child),
          );
        } else walk(child);
      }
      return;
    }
    if (node.tagName === "tr") {
      output.push(
        (node.childNodes || [])
          .filter((n) => ["td", "th"].includes(n.tagName))
          .map(text)
          .join("\t"),
      );
      warnings.push("TABLE_REVIEW");
      return;
    }
    if (["p", "h1", "h2", "h3", "h4", "h5", "h6"].includes(node.tagName)) {
      output.push(text(node));
      return;
    }
    for (const child of node.childNodes || []) walk(child);
  }
  walk(parseFragment(html));
  if (image) warnings.push("IMAGE_REVIEW");
  return { lines: output, warnings: [...new Set(warnings)] };
}
export async function parseExamDocument(bytes, name) {
  const type = detectDocument(bytes, name);
  if (type === "docx") {
    validateZip(bytes);
    const converted = await mammoth.convertToHtml(
      { buffer: bytes },
      {
        externalFileAccess: false,
        includeEmbeddedStyleMap: false,
        convertImage: mammoth.images.imgElement(async () => ({
          src: "",
          alt: "Hình ảnh cần đối chiếu",
        })),
      },
    );
    const result = wordLines(converted.value);
    if (converted.messages.length) result.warnings.push("FORMAT_REVIEW");
    const text = result.lines.join("\n");
    if (text.length > documentLimits.textCharacters)
      throw Error("DOCUMENT_TOO_COMPLEX");
    return { type, pages: [{ number: 1, text }], warnings: result.warnings };
  }
  let task, doc;
  try {
    task = getDocument({
      data: new Uint8Array(bytes),
      isEvalSupported: false,
      disableFontFace: true,
      useSystemFonts: false,
      disableAutoFetch: true,
      verbosity: 0,
    });
    doc = await task.promise;
    if (doc.numPages > documentLimits.pages)
      throw Error("DOCUMENT_TOO_COMPLEX");
    const pages = [],
      warnings = [];
    let total = 0;
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p),
        content = await page.getTextContent();
      const lines = [];
      let line = "",
        y = null,
        right = null;
      for (const item of content.items) {
        if (typeof item.str !== "string") continue;
        const nextY = item.transform[5];
        if (y !== null && Math.abs(nextY - y) > 2) {
          lines.push(line);
          line = "";
          right = null;
        }
        const gap = right === null ? 0 : item.transform[4] - right;
        line +=
          (line && gap > Math.max(2, item.height * 0.15) ? " " : "") + item.str;
        y = nextY;
        right = item.transform[4] + item.width;
        if (item.hasEOL) {
          lines.push(line);
          line = "";
          y = null;
          right = null;
        }
      }
      if (line) lines.push(line);
      const text = lines.join("\n");
      total += text.length;
      if (total > documentLimits.textCharacters)
        throw Error("DOCUMENT_TOO_COMPLEX");
      if (!text.trim()) warnings.push("SCAN_PAGE_" + p);
      if (content.items.some((item) => item.str?.includes("\uFFFD")))
        warnings.push("TEXT_REVIEW");
      pages.push({ number: p, text });
      page.cleanup();
    }
    if (!pages.some((page) => page.text.trim()))
      throw Error("DOCUMENT_SCAN_UNSUPPORTED");
    return { type, pages, warnings };
  } catch (error) {
    if (error.message?.startsWith("DOCUMENT_")) throw error;
    throw Error("DOCUMENT_UNREADABLE");
  } finally {
    if (task) await task.destroy();
  }
}
