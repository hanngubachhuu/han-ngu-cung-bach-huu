import JSZip from "jszip";
export function syntheticPdf(pages) {
  const objects = [];
  const add = (value) => {
    objects.push(value);
    return objects.length;
  };
  const catalog = add(""),
    root = add(""),
    font = add(""),
    cid = add("");
  const chars = [...new Set(pages.flatMap((p) => [...p.join("\n")]))];
  const mapping = chars
    .map((c) => {
      const code = c.charCodeAt(0).toString(16).padStart(4, "0");
      return `<${code}> <${code}>`;
    })
    .join("\n");
  const cmap = `/CIDInit /ProcSet findresource begin 12 dict begin begincmap /CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def /CMapName /SyntheticUnicode def /CMapType 2 def 1 begincodespacerange <0000> <FFFF> endcodespacerange ${chars.length} beginbfchar ${mapping} endbfchar endcmap CMapName currentdict /CMap defineresource pop end end`;
  const unicode = add(
    `<< /Length ${Buffer.byteLength(cmap)} >>\nstream\n${cmap}\nendstream`,
  );
  objects[font - 1] =
    `<< /Type /Font /Subtype /Type0 /BaseFont /Synthetic /Encoding /Identity-H /DescendantFonts [${cid} 0 R] /ToUnicode ${unicode} 0 R >>`;
  objects[cid - 1] =
    "<< /Type /Font /Subtype /CIDFontType2 /BaseFont /Synthetic /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /DW 500 >>";
  const kids = [];
  for (const lines of pages) {
    const commands =
      "BT /F1 8 Tf 30 800 Td 10 TL\n" +
      lines
        .map(
          (line, i) =>
            `${i ? "T* " : ""}<${[...line].map((c) => c.charCodeAt(0).toString(16).padStart(4, "0")).join("")}> Tj`,
        )
        .join("\n") +
      "\nET";
    const stream = add(
      `<< /Length ${Buffer.byteLength(commands)} >>\nstream\n${commands}\nendstream`,
    );
    kids.push(
      add(
        `<< /Type /Page /Parent ${root} 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${stream} 0 R >>`,
      ),
    );
  }
  objects[catalog - 1] = `<< /Type /Catalog /Pages ${root} 0 R >>`;
  objects[root - 1] =
    `<< /Type /Pages /Kids [${kids.map((k) => k + " 0 R").join(" ")}] /Count ${kids.length} >>`;
  let body = "%PDF-1.7\n";
  const offsets = [0];
  for (let i = 0; i < objects.length; i++) {
    offsets.push(Buffer.byteLength(body));
    body += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xref = Buffer.byteLength(body);
  body +=
    `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` +
    offsets
      .slice(1)
      .map((n) => String(n).padStart(10, "0") + " 00000 n \n")
      .join("") +
    `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(body);
}
export async function syntheticDocx(lines) {
  const escape = (s) =>
    s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
  );
  zip.file(
    "_rels/.rels",
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
  );
  zip.file(
    "word/document.xml",
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' +
      lines
        .map(
          (s) =>
            '<w:p><w:r><w:t xml:space="preserve">' +
            escape(s) +
            "</w:t></w:r></w:p>",
        )
        .join("") +
      "<w:sectPr/></w:body></w:document>",
  );
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}
export function tenQuestions(withKey = true) {
  const lines = [];
  for (let i = 1; i <= 10; i++)
    lines.push(
      `${i}. 你好 nǐ hǎo — Chọn lời chào ${i}?`,
      "A. 你好",
      "B. 再见",
      "C. 老师",
      "D. 学生",
    );
  if (withKey)
    lines.push(
      "Đáp án:",
      ...Array.from({ length: 10 }, (_, i) => `${i + 1}.A`),
    );
  return lines;
}
