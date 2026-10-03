import { getDocument, OPS, Util } from "pdfjs-dist/legacy/build/pdf.mjs";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { createWorker } from "tesseract.js";
import { createHash } from "node:crypto";
import mammoth from "mammoth";
import { parseFragment } from "parse5";
import { parseExamDocument } from "./exam-document-parser.mjs";
import { ocrDirectory, verifyOCRModels } from "./hskk-ocr-runtime.mjs";

function jpegPicture(canvas, page, index) {
  const bytes = canvas.toBuffer("image/jpeg", 80);
  if (bytes.length > 250000) throw Error("DOCUMENT_TOO_COMPLEX");
  return {
    page,
    index,
    width: canvas.width,
    height: canvas.height,
    byte_size: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    bytes: bytes.toString("base64"),
  };
}
function numberedText(text) {
  return text.replace(/^\s*(\d{1,2})\s*\n\s*(?=[\p{Script=Han}])/gmu, "$1. ");
}
function validatePictureBudget(pictures) {
  if (
    pictures.length > 20 ||
    pictures.reduce((sum, p) => sum + p.byte_size, 0) > 2 * 1024 * 1024
  )
    throw Error("DOCUMENT_TOO_COMPLEX");
}
// Dedicated bounded HSKK parse. OCR is local and all recognition remains a draft.
export async function parseHSKKDocument(bytes, name, { level } = {}) {
  if (!["elementary", "intermediate", "advanced"].includes(level))
    throw Error("DOCUMENT_UNSUPPORTED");
  if (/\.docx$/i.test(name)) {
    const text = await parseExamDocument(bytes, name),
      pictures = [];
    const converted = await mammoth.convertToHtml(
      { buffer: bytes },
      {
        externalFileAccess: false,
        convertImage: mammoth.images.imgElement(async (image) => {
          const original = await image.read("base64"),
            decoded = await loadImage(Buffer.from(original, "base64"));
          if (decoded.width * decoded.height > 8000000)
            throw Error("DOCUMENT_TOO_COMPLEX");
          const canvas = createCanvas(decoded.width, decoded.height);
          canvas.getContext("2d").drawImage(decoded, 0, 0);
          pictures.push(jpegPicture(canvas, 1, pictures.length));
          validatePictureBudget(pictures);
          return { src: "", alt: "SOURCE_PICTURE" };
        }),
      },
    );
    const lines = [];
    function walk(n) {
      if (["p", "li"].includes(n.tagName)) {
        const str = (x) =>
          x.nodeName === "#text"
            ? x.value
            : (x.childNodes || []).map(str).join("");
        lines.push(str(n));
      } else for (const c of n.childNodes || []) walk(c);
    }
    walk(parseFragment(converted.value));
    return {
      ...text,
      pages: [{ number: 1, text: numberedText(lines.join("\n")) }],
      pictures,
      recognition: "DOCUMENT_REVIEW_REQUIRED",
    };
  }
  let task, worker;
  try {
    task = getDocument({
      data: new Uint8Array(bytes),
      isEvalSupported: false,
      disableFontFace: true,
      useSystemFonts: false,
      disableAutoFetch: true,
      verbosity: 0,
    });
    const doc = await task.promise;
    if (doc.numPages > 12) throw Error("DOCUMENT_TOO_COMPLEX");
    const pages = [],
      pictures = [],
      warnings = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p),
        viewport = page.getViewport({ scale: 2 });
      if (viewport.width * viewport.height > 8000000)
        throw Error("DOCUMENT_TOO_COMPLEX");
      const canvas = createCanvas(
        Math.ceil(viewport.width),
        Math.ceil(viewport.height),
      );
      const native = await page.getTextContent();
      const nativeLines = [];
      let previousY;
      for (const item of native.items) {
        if (!item.str) continue;
        const y = Math.round(item.transform[5]);
        if (previousY !== undefined && Math.abs(y - previousY) > 3)
          nativeLines.push("\n");
        nativeLines.push(item.str + (item.hasEOL ? "\n" : " "));
        previousY = y;
      }
      const nativeText = nativeLines.join("");
      let data;
      if (
        (nativeText.match(/\p{Script=Han}/gu) || []).length >= 5 &&
        !nativeText.includes("�")
      ) {
        data = { text: nativeText, confidence: null };
        warnings.push("DOCUMENT_REVIEW_PAGE_" + p);
        if (level === "intermediate")
          await page.render({
            canvasContext: canvas.getContext("2d"),
            viewport,
          }).promise;
      } else {
        await page.render({ canvasContext: canvas.getContext("2d"), viewport })
          .promise;
        if (!worker) {
          await verifyOCRModels();
          worker = await createWorker(["chi_sim", "eng"], 1, {
            langPath: ocrDirectory,
            cachePath: ocrDirectory,
            cacheMethod: "readOnly",
            gzip: false,
            logger: () => {},
            errorHandler: () => {},
          });
        }
        ({ data } = await worker.recognize(
          canvas.toBuffer("image/png"),
          {},
          { blocks: true },
        ));
        warnings.push("OCR_REVIEW_PAGE_" + p);
      }
      pages.push({
        number: p,
        text: numberedText(data.text),
        confidence: data.confidence,
      });
      if (level !== "intermediate") {
        page.cleanup();
        continue;
      }
      // Extract each actual image placement in reading order; ignore tiny marks
      // and full-page scans. Full-page scans remain available for visual review.
      const ops = await page.getOperatorList();
      let matrix = [1, 0, 0, 1, 0, 0];
      const stack = [];
      for (let i = 0; i < ops.fnArray.length; i++) {
        const fn = ops.fnArray[i],
          a = ops.argsArray[i];
        if (fn === OPS.save) stack.push([...matrix]);
        else if (fn === OPS.restore) matrix = stack.pop() || matrix;
        else if (fn === OPS.transform) matrix = Util.transform(matrix, a);
        else if (
          level === "intermediate" &&
          [OPS.paintImageXObject, OPS.paintInlineImageXObject].includes(fn)
        ) {
          const transform = Util.transform(viewport.transform, matrix),
            corners = [
              [0, 0],
              [1, 0],
              [0, 1],
              [1, 1],
            ].map((point) => {
              Util.applyTransform(point, transform);
              return point;
            });
          const left = Math.max(
              0,
              Math.floor(Math.min(...corners.map((x) => x[0]))),
            ),
            top = Math.max(
              0,
              Math.floor(Math.min(...corners.map((x) => x[1]))),
            );
          const width = Math.min(
              canvas.width - left,
              Math.ceil(Math.max(...corners.map((x) => x[0]))) - left,
            ),
            height = Math.min(
              canvas.height - top,
              Math.ceil(Math.max(...corners.map((x) => x[1]))) - top,
            );
          if (
            width < 100 ||
            height < 100 ||
            width * height > canvas.width * canvas.height * 0.8
          )
            continue;
          const crop = createCanvas(width, height);
          crop
            .getContext("2d")
            .drawImage(canvas, left, top, width, height, 0, 0, width, height);
          pictures.push({
            ...jpegPicture(crop, p, pictures.length),
            left,
            top,
          });
        }
      }
      // For a scanned page, the original page bitmap is the picture container.
      // Crop only between explicitly recognized question labels, never infer a
      // picture from its meaning or fetch a replacement image.
      if (
        level === "intermediate" &&
        data.blocks &&
        !pictures.some((image) => image.page === p)
      ) {
        const lines = data.blocks
          .flatMap((block) => block.paragraphs || [])
          .flatMap((paragraph) => paragraph.lines || []);
        const labels = lines
          .map((line) => ({
            number: Number(/^\s*(11|12)\s*[.．、，,]/u.exec(line.text)?.[1]),
            box: line.bbox,
          }))
          .filter((x) => x.number && x.box)
          .sort((a, b) => a.box.y0 - b.box.y0);
        if (
          labels.length === 2 &&
          labels[0].number === 11 &&
          labels[1].number === 12
        )
          for (const [i, label] of labels.entries()) {
            const left = Math.round(canvas.width * 0.12),
              top = label.box.y1 + 4,
              width = Math.round(canvas.width * 0.76),
              bottom =
                i === 0
                  ? labels[1].box.y0 - 4
                  : Math.round(canvas.height * 0.9);
            if (bottom - top < 100) continue;
            const crop = createCanvas(width, bottom - top);
            crop
              .getContext("2d")
              .drawImage(
                canvas,
                left,
                top,
                width,
                bottom - top,
                0,
                0,
                width,
                bottom - top,
              );
            pictures.push({
              ...jpegPicture(crop, p, pictures.length),
              left,
              top,
              recognition: "SCANNED_PICTURE_CROP_REVIEW_REQUIRED",
            });
          }
      }
      page.cleanup();
    }
    pictures.sort(
      (a, b) => a.page - b.page || a.top - b.top || a.left - b.left,
    );
    validatePictureBudget(pictures);
    return {
      type: "pdf",
      pages,
      pictures,
      warnings,
      recognition: warnings.some((x) => x.startsWith("OCR_"))
        ? "OCR_REVIEW_REQUIRED"
        : "DOCUMENT_REVIEW_REQUIRED",
    };
  } finally {
    await worker?.terminate();
    await task?.destroy();
  }
}
