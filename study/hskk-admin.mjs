import { getSession, getClient } from "./auth.mjs";
import { myProfile, observeAccount } from "./account-service.mjs";
import { validateExam, buildTimeline, levels } from "./hskk-exam-core.mjs";
import { escapeHtml as esc } from "./core.mjs";
import { mountExamExperience } from "./hskk-experience.mjs";
import { previewTransport } from "./hskk-preview-transport.mjs";
import { mountAudioReview } from "./hskk-audio-review.mjs";
const root = document.querySelector("#hskkAdmin");
let draft,
  dispose,
  disposeReview,
  audioUrl,
  pendingSave,
  generation = 0;
function notice(text) {
  const node = root.querySelector("[data-notice]");
  if (node) node.textContent = text;
}
function renderBuilder() {
  disposeReview?.();
  root.innerHTML = `<h1>HSKK · Đề thi thử</h1><p class="hskk-badge">${esc(draft.exam_code)} · ${levels[draft.level]} · ${draft.questions.length} câu · Nháp · Phiên bản ${draft.exam_version}</p><div class="hskk-notice">Bản đang xem chưa công bố. Thay đổi trong trình soạn thảo chỉ được xuất thành tệp nháp; chưa ghi lên máy chủ. Xem trước không tạo bài nộp và bản ghi được bỏ khi rời trang.</div><div class="hskk-editor"><details open><summary>1. Thông tin và nguồn</summary><p>${esc(draft.title)}</p><p>Nguồn đề: ${esc(draft.provenance.document)} · Audio: ${esc(draft.provenance.audio)}</p><p>Phiên bản nguồn: ${esc(draft.provenance.source_version)}</p><p>Chưa có rubric chấm điểm từ tài liệu nguồn.</p></details><details><summary>2. Cấu trúc và thời gian</summary>${draft.sections.map((s) => `<p>${esc(s.title_zh)} · ${esc(s.title_vi)} · ${draft.questions.filter((q) => q.section_id === s.id).length} câu · Chuẩn bị ${s.preparation_seconds} giây</p>`).join("")}<p>Thời gian đề gốc được khóa. Chỉnh sửa quy tắc thi cần một phiên bản mới có nhật ký.</p></details><details><summary>3. Câu hỏi</summary>${draft.questions.map((q) => `<p><strong>${q.number}.</strong> <span lang="zh">${esc(q.prompt)}</span> · ${q.response_seconds} giây</p>`).join("")}</details><details open><summary>4. Audio và đánh dấu đoạn</summary><audio controls src="${esc(draft.audio.url)}" aria-label="Audio gốc để xác định đoạn câu hỏi"></audio><p>Nghe audio gốc, nhập ranh giới đoạn câu hỏi theo giây. Không bao gồm khoảng trả lời. Chỉ xác nhận sau khi đã nghe kiểm tra.</p><div class="account-actions"><button class="st-button" data-export>Xuất cấu hình nháp</button><label>Nạp cấu hình nháp<input type="file" data-import accept="application/json,.json"></label></div>${draft.questions
    .filter((q) => q.prompt_mode === "audio")
    .map(
      (q) =>
        `<details><summary>Câu ${q.number} · ${esc(q.prompt)}</summary><label>Bắt đầu (giây)<input type="number" min="0" step="0.001" data-start="${q.id}" value="${q.audio_segment?.start_seconds ?? ""}"></label><label>Kết thúc (giây)<input type="number" min="0" step="0.001" data-end="${q.id}" value="${q.audio_segment?.end_seconds ?? ""}"></label><label><input type="checkbox" data-verified="${q.id}" ${q.audio_segment?.verified ? "checked" : ""}> Đã đối chiếu audio gốc</label></details>`,
    )
    .join(
      "",
    )}</details><details><summary>5. Xem trước</summary><p>Xem trước dùng cùng engine của bài thi. Cần xác minh tất cả đoạn audio trước khi bắt đầu.</p><button class="st-button primary" data-preview>Xem trước đề</button></details><details><summary>6. Công bố</summary><p>Chưa mở công bố: cần liên kết khóa HSKK thật, phiên bản câu hỏi, phiên thi phía server và rubric đã duyệt.</p><button class="st-button" disabled>Công bố đề</button></details></div><p data-notice role="status"></p><section data-preview-root></section>`;
  const sourceReview = document.createElement("section");
  const audioSection = root.querySelector(".hskk-editor").children[3];
  const uploadLabel = document.createElement("label");
  uploadLabel.textContent = "Tải audio nguồn vào kho riêng tư ";
  const sourceInput = document.createElement("input");
  sourceInput.type = "file";
  sourceInput.accept = "audio/mpeg,.mp3";
  uploadLabel.append(sourceInput);
  audioSection.append(uploadLabel);
  sourceInput.onchange = async () => {
    sourceInput.disabled = true;
    try {
      const file = sourceInput.files[0];
      if (!file || file.size > 32 * 1024 * 1024) throw Error();
      const bytes = await file.arrayBuffer();
      const hash = Array.from(
        new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
        (b) => b.toString(16).padStart(2, "0"),
      ).join("");
      if (hash !== draft.provenance.sha256[draft.provenance.audio]) {
        notice(
          "File không khớp audio nguồn đã khai báo. Không tải lên hoặc thay thế nguồn.",
        );
        return;
      }
      const session = await getSession();
      if (!session || session.user.id !== draft.preview_actor_id) throw Error();
      const response = await fetch(
        "api/hskk-exams?exam=" +
          encodeURIComponent(draft.exam_code) +
          "&action=reserve_source",
        {
          method: "POST",
          headers: { Authorization: "Bearer " + session.access_token },
          signal: AbortSignal.timeout(15000),
        },
      );
      if (!response.ok) throw Error();
      const asset = await response.json(),
        client = await getClient();
      if ((await getSession())?.user.id !== session.user.id) throw Error();
      const { error } = await client.storage
        .from(asset.bucket)
        .upload(asset.path, file, {
          contentType: "audio/mpeg",
          upsert: false,
          cacheControl: "0",
        });
      if (
        error &&
        !["409", "Duplicate"].includes(String(error.statusCode || error.code))
      )
        throw Error();
      await boot();
      notice("Đã đưa audio nguồn vào kho riêng tư. Chưa công bố đề.");
    } catch {
      notice(
        "Chưa tải được nguồn audio. Giữ file gốc và thử lại sau khi kho nguồn sẵn sàng.",
      );
    } finally {
      sourceInput.disabled = false;
    }
  };
  for (const child of audioSection.querySelectorAll("details")) child.remove();
  audioSection.append(sourceReview);
  const saveButton = document.createElement("button");
  saveButton.className = "st-button primary";
  saveButton.textContent = "Lưu phân đoạn nháp";
  saveButton.disabled = !draft.draft_storage_available;
  audioSection.querySelector(".account-actions").prepend(saveButton);
  saveButton.onclick = async () => {
    saveButton.disabled = true;
    try {
      if (!pendingSave) {
        const configuration = collect();
        configuration.audio.url = "";
        delete configuration.preview_actor_id;
        delete configuration.draft_storage_available;
        pendingSave = {
          request_id: crypto.randomUUID(),
          expected_revision: draft.database_revision || 0,
          configuration,
        };
      }
      const session = await getSession();
      if (!session || session.user.id !== draft.preview_actor_id) throw Error();
      const response = await fetch(
        "api/hskk-exams?exam=" +
          encodeURIComponent(draft.exam_code) +
          "&action=save",
        {
          method: "POST",
          headers: {
            Authorization: "Bearer " + session.access_token,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(pendingSave),
          signal: AbortSignal.timeout(15000),
        },
      );
      if (response.status === 409) {
        notice(
          "Bản nháp trên máy chủ đã thay đổi. Xuất bản đang sửa trước khi tải lại để đối chiếu.",
        );
        return;
      }
      if (!response.ok) throw Error();
      const saved = await response.json();
      if ((await getSession())?.user.id !== session.user.id) throw Error();
      draft.database_revision = saved.revision;
      pendingSave = null;
      notice("Đã lưu phân đoạn audio vào bản nháp. Chưa công bố đề.");
    } catch {
      notice(
        "Chưa xác nhận được lần lưu. Thử lại sẽ giữ cùng yêu cầu để tránh tạo bản nháp trùng.",
      );
    } finally {
      saveButton.disabled = false;
    }
  };
  disposeReview = mountAudioReview(sourceReview, {
    exam: draft,
    actorId: draft.preview_actor_id,
    onUpdate: (value) => {
      draft = value;
    },
    loadWaveform: async () => {
      const session = await getSession();
      if (!session || session.user.id !== draft.preview_actor_id) throw Error();
      const response = await fetch(
        "api/hskk-exams?exam=" +
          encodeURIComponent(draft.exam_code) +
          "&action=waveform",
        { headers: { Authorization: "Bearer " + session.access_token } },
      );
      if (!response.ok) throw Error();
      if ((await getSession())?.user.id !== session.user.id) throw Error();
      return response.json();
    },
    runSegmentation: async () => {
      const session = await getSession();
      if (!session || session.user.id !== draft.preview_actor_id) throw Error();
      const response = await fetch(
        "api/hskk-exams?exam=" +
          encodeURIComponent(draft.exam_code) +
          "&action=segment",
        {
          method: "POST",
          headers: { Authorization: "Bearer " + session.access_token },
          signal: AbortSignal.timeout(120000),
        },
      );
      if (!response.ok) throw Error();
      const proposal = await response.json();
      if ((await getSession())?.user.id !== session.user.id) throw Error();
      return proposal;
    },
  });
  function collect() {
    const value = structuredClone(draft);
    validateExam(value);
    return value;
  }
  root.querySelector("[data-export]").onclick = () => {
    try {
      const value = collect();
      value.status = "draft";
      value.draft_revision = (draft.draft_revision || 0) + 1;
      value.reviewed_at = new Date().toISOString();
      value.audio.url = "";
      delete value.preview_actor_id;
      delete value.draft_storage_available;
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(value, null, 2)], {
          type: "application/json",
        }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = value.exam_code + "-draft.json";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      notice("Đã xuất tệp nháp. Chưa lưu lên máy chủ hoặc công bố.");
    } catch {
      notice(
        "Đoạn audio chưa hợp lệ. Kiểm tra thời điểm bắt đầu, kết thúc và xác nhận nguồn.",
      );
    }
  };
  root.querySelector("[data-import]").onchange = async (e) => {
    try {
      const f = e.target.files[0];
      if (!f || f.size > 1024 * 1024) throw Error();
      const value = JSON.parse(await f.text());
      validateExam(value);
      if (
        value.exam_code !== draft.exam_code ||
        value.exam_version !== draft.exam_version ||
        JSON.stringify(value.provenance.sha256) !==
          JSON.stringify(draft.provenance.sha256)
      )
        throw Error();
      // This source review editor may only change audio segment mapping, never official content/timing.
      const baseline = structuredClone(draft),
        candidate = structuredClone(value);
      for (const d of [baseline, candidate]) {
        delete d.reviewed_at;
        delete d.draft_revision;
        delete d.preview_actor_id;
        delete d.database_revision;
        delete d.draft_storage_available;
        for (const field of [
          "url",
          "proposals",
          "non_question_proposals",
          "job_id",
          "review_audit",
          "segmentation_runs",
          "non_question_reviews",
          "review_status",
          "clip_provenance",
        ])
          delete d.audio[field];
        for (const q of d.questions) delete q.audio_segment;
      }
      if (JSON.stringify(baseline) !== JSON.stringify(candidate)) throw Error();
      value.audio.url = audioUrl;
      value.database_revision = draft.database_revision;
      value.draft_storage_available = draft.draft_storage_available;
      value.preview_actor_id = draft.preview_actor_id;
      draft = value;
      await dispose?.();
      renderBuilder();
      notice("Đã nạp bản nháp để xem trước. Chưa ghi lên máy chủ.");
    } catch {
      notice(
        "Tệp nháp chưa đúng đề, nguồn hoặc quy tắc thi. Không thay thế bản đang xem.",
      );
    }
  };
  root.querySelector("[data-preview]").onclick = async () => {
    try {
      const value = collect();
      buildTimeline(value);
      for (const q of value.questions) q.version_id = "preview-" + q.id;
      await dispose?.();
      const session = await getSession();
      dispose = await mountExamExperience(
        root.querySelector("[data-preview-root]"),
        {
          exam: value,
          candidate: {
            id: session.user.id,
            name: "Xem trước đề",
            email: session.user.email,
          },
          transport: previewTransport(value, session.user.id),
          preview: true,
        },
      );
      root
        .querySelector("[data-preview-root]")
        .scrollIntoView({ block: "start" });
    } catch {
      notice(
        "Chưa thể chạy đề: cần xác minh đủ ranh giới audio từng câu. Không tự đoán timestamp.",
      );
    }
  };
}
async function boot() {
  const n = ++generation;
  pendingSave = null;
  await dispose?.();
  disposeReview?.();
  if (audioUrl) {
    URL.revokeObjectURL(audioUrl);
    audioUrl = null;
  }
  root.textContent = "Đang kiểm tra quyền quản trị…";
  try {
    const profile = await myProfile(),
      session = await getSession();
    if (n !== generation) return;
    if (
      !session ||
      profile?.role !== "ADMIN" ||
      profile.status !== "APPROVED"
    ) {
      root.innerHTML =
        '<p>Đăng nhập bằng tài khoản quản trị để xem đề nháp.</p><a class="st-button" href="tai-khoan.html">Mở tài khoản</a>';
      return;
    }
    const options = {
      headers: { Authorization: "Bearer " + session.access_token },
      cache: "no-store",
      signal: AbortSignal.timeout(30000),
    };
    const code = new URLSearchParams(location.search).get("exam") || "H71002";
    const res = await fetch(
      "api/hskk-exams?exam=" + encodeURIComponent(code),
      options,
    );
    if (!res.ok) throw Error();
    const value = await res.json();
    const media = await fetch(
      "api/hskk-exams?exam=" + encodeURIComponent(code) + "&action=audio",
      options,
    );
    const blob = media.ok ? await media.blob() : null;
    if (n !== generation || (await getSession())?.user.id !== session.user.id)
      return;
    audioUrl = blob ? URL.createObjectURL(blob) : null;
    value.audio.url = audioUrl || "";
    value.preview_actor_id = session.user.id;
    draft = validateExam(value);
    renderBuilder();
  } catch {
    root.textContent =
      "Chưa mở được đề nháp. Kiểm tra đăng nhập và kết nối rồi tải lại.";
  }
}
window.addEventListener("study:auth", boot);
window.addEventListener("pagehide", () => {
  generation++;
  void dispose?.();
  disposeReview?.();
  if (audioUrl) URL.revokeObjectURL(audioUrl);
});
void boot();
void observeAccount().catch(() => {});
