import { getClient, getSession } from "./auth.mjs";
import { hskkAdminRequest, hskkImportRequest } from "./admin-exam-service.mjs";
import { importHSKK } from "./hskk-import-core.mjs";
export const fileHash = async (file) =>
  [
    ...new Uint8Array(
      await crypto.subtle.digest("SHA-256", await file.arrayBuffer()),
    ),
  ]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
export async function chooseSourcePictures(parsed, container) {
  if (parsed.pictures?.length === 2) return parsed;
  if (!parsed.pictures?.length) throw Error("PICTURES_REQUIRED");
  const panel = document.createElement("section");
  panel.className = "admin-import-preview";
  const title = document.createElement("h3");
  title.textContent = "Đối chiếu hai tranh của phần nhìn tranh và nói";
  panel.append(title);
  const selectors = [];
  for (const number of [11, 12]) {
    const label = document.createElement("label");
    label.textContent = "Tranh câu " + number;
    const select = document.createElement("select"),
      empty = document.createElement("option");
    empty.value = "";
    empty.textContent = "Chọn tranh trích từ file đề";
    select.append(empty);
    for (const [i, image] of parsed.pictures.entries()) {
      const option = document.createElement("option");
      option.value = i;
      option.textContent = `Hình ${i + 1} · Trang ${image.page}`;
      select.append(option);
    }
    const preview = document.createElement("img");
    preview.className = "cbt-source-picture";
    preview.hidden = true;
    select.onchange = () => {
      preview.hidden = select.value === "";
      if (!preview.hidden) {
        preview.src =
          "data:image/jpeg;base64," +
          parsed.pictures[Number(select.value)].bytes;
        preview.alt = "Tranh đang chọn cho câu " + number;
      }
      button.disabled =
        selectors.some((s) => s.value === "") ||
        selectors[0].value === selectors[1].value;
    };
    label.append(select);
    panel.append(label, preview);
    selectors.push(select);
  }
  const button = document.createElement("button");
  button.type = "button";
  button.className = "st-button";
  button.disabled = true;
  button.textContent = "Dùng hai tranh này và tiếp tục nhập";
  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.className = "st-button";
  cancel.textContent = "Dừng nhập để kiểm tra file gốc";
  panel.append(button, cancel);
  container.append(panel);
  try {
    return await new Promise((resolve, reject) => {
      button.onclick = () =>
        resolve({
          ...parsed,
          pictures: selectors.map((s) => parsed.pictures[Number(s.value)]),
        });
      cancel.onclick = () => reject(Error("PICTURES_REQUIRED"));
    });
  } finally {
    panel.remove();
  }
}
export async function createHSKKSource({
  document,
  file,
  audio,
  code,
  level,
  ownerId,
  status,
}) {
  const kind = /\.(mp3|mp4)$/i.exec(audio?.name || "")?.[1].toLowerCase();
  if (
    !kind ||
    !audio.size ||
    audio.size > (kind === "mp4" ? 256 : 32) * 1024 * 1024
  )
    throw Error("INVALID_SOURCE");
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(code)) throw Error("INVALID_SOURCE");
  const [documentHash, originalHash] = await Promise.all([
    fileHash(file),
    fileHash(audio),
  ]);
  if (documentHash !== document.sha256) throw Error("SOURCE_HASH_MISMATCH");
  const descriptors = {},
    pictures = {};
  if (level === "intermediate") {
    if (document.pictures?.length !== 2) throw Error("PICTURES_REQUIRED");
    for (const [i, image] of document.pictures.entries()) {
      const key = `q${11 + i}`,
        bytes = Uint8Array.from(atob(image.bytes), (c) => c.charCodeAt(0));
      if (
        bytes.length !== image.byte_size ||
        bytes.length > 250000 ||
        bytes[0] !== 255 ||
        bytes[1] !== 216 ||
        (await fileHash(new Blob([bytes]))) !== image.sha256
      )
        throw Error("INVALID_PICTURE");
      descriptors[key] = {
        file_name: `${code}-${key}.jpg`,
        byte_size: bytes.length,
        sha256: image.sha256,
      };
      pictures[key] = image.bytes;
    }
  }
  const client = await getClient();
  const reserveUpload = async (input, hash, format) => {
    if ((await getSession())?.user.id !== ownerId)
      throw Error("ACCOUNT_CHANGED");
    const parts = [],
      chunkSize = 32 * 1024 * 1024;
    if (format === "mp4" && input.size > chunkSize)
      for (let offset = 0; offset < input.size; offset += chunkSize) {
        const part = input.slice(
          offset,
          Math.min(offset + chunkSize, input.size),
        );
        parts.push({
          file: part,
          sha256: await fileHash(part),
          byte_size: part.size,
        });
      }
    const asset = await hskkImportRequest(
      "reserve",
      {
        exam_code: code,
        sha256: hash,
        byte_size: input.size,
        kind: format,
        chunks: parts.map(({ sha256, byte_size }) => ({ sha256, byte_size })),
      },
      ownerId,
    );
    const mime = {
      pdf: "application/pdf",
      docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      mp3: "audio/mpeg",
      mp4: "video/mp4",
    }[format];
    const upload = async (path, blob, contentType, expectedHash) => {
      if ((await getSession())?.user.id !== ownerId)
        throw Error("ACCOUNT_CHANGED");
      const { error } = await client.storage
        .from(asset.bucket)
        .upload(path, blob, { contentType, upsert: false, cacheControl: "0" });
      if (error) {
        const { data: stored, error: readError } = await client.storage
          .from(asset.bucket)
          .download(path);
        if (
          readError ||
          !stored ||
          stored.size !== blob.size ||
          (await fileHash(stored)) !== expectedHash
        )
          throw Error("SOURCE_UPLOAD_FAILED");
      }
    };
    if (parts.length)
      for (const [i, part] of parts.entries()) {
        status(`Đang tải file gốc · phần ${i + 1}/${parts.length}…`);
        await upload(
          asset.chunks[i].path,
          part.file,
          "application/octet-stream",
          part.sha256,
        );
      }
    else await upload(asset.path, input, mime, hash);
    return asset;
  };
  status("Đang giữ file đề và file nghe gốc trong kho riêng…");
  const printed = await reserveUpload(
    file,
    documentHash,
    /\.docx$/i.test(file.name) ? "docx" : "pdf",
  );
  await hskkImportRequest("verify", { id: printed.id }, ownerId);
  const original = await reserveUpload(audio, originalHash, kind);
  status(
    kind === "mp4"
      ? "Đang tách âm thanh từ MP4; video gốc được giữ nguyên…"
      : "Đang xác minh MP3 gốc trên hệ thống…",
  );
  const prepared = await hskkImportRequest(
    "audio",
    { id: original.id },
    ownerId,
  );
  const audioName = kind === "mp3" ? audio.name : `${code}.mp3`;
  const configuration = importHSKK(document, {
    code,
    level,
    documentName: file.name,
    documentHash,
    audioName,
    audioHash: prepared.sha256,
    audioSize: prepared.byte_size,
    duration: prepared.duration_seconds,
    pictures: descriptors,
    actor: ownerId,
    now: new Date().toISOString(),
  });
  configuration.provenance.original = {
    document_asset_id: printed.id,
    audio_asset_id: original.id,
    audio_name: audio.name,
    audio_sha256: originalHash,
    audio_kind: kind,
    extraction_method: prepared.method,
  };
  status("Đang đăng ký nguồn riêng…");
  let existing;
  try {
    existing = await hskkAdminRequest(code, undefined, { ownerId });
  } catch (error) {
    if (error.message !== "EXAM_NOT_FOUND") throw error;
  }
  if (existing) {
    // The same original files resume the existing immutable definition. In
    // particular, new OCR output cannot replace previously reviewed source
    // text, pictures, boundaries or history.
    if (
      existing.level !== level ||
      existing.audio.source_audio_id !== prepared.sha256 ||
      existing.audio.byte_size !== prepared.byte_size ||
      Math.abs(existing.audio.duration_seconds - prepared.duration_seconds) >
        0.5 ||
      existing.provenance.sha256[existing.provenance.document] !== documentHash
    )
      throw Error("SOURCE_DEFINITION_LOCKED");
  } else {
    await hskkAdminRequest(code, "register", {
      ownerId,
      method: "POST",
      body: { configuration, pictures },
    });
  }
  status("Đang kiểm tra hash của âm thanh nguồn đã lưu…");
  await hskkImportRequest(
    "attach",
    { exam_code: code, id: prepared.asset_id },
    ownerId,
  );
  let segmentationPending = false;
  try {
    const current = await hskkAdminRequest(code, undefined, { ownerId });
    if (!current.audio.segmentation_runs?.length) {
      status("Đang đề xuất phân câu để bạn nghe và kiểm tra…");
      await hskkAdminRequest(code, "segment", {
        ownerId,
        method: "POST",
        body: {},
      });
    }
  } catch {
    segmentationPending = true;
  }
  return {
    id: code,
    code,
    type: "HSKK",
    level,
    title: code,
    source_review: true,
    segmentation_pending: segmentationPending,
  };
}
