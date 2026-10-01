import { getClient, getSession } from "./auth.mjs";
import { myProfile } from "./account-service.mjs";
import { mountAudioReview } from "./hskk-audio-review.mjs";
import { reviewSummary, checkFinalization } from "./hskk-review-validation.mjs";
import { levels } from "./hskk-exam-core.mjs";
import { mountExamEditor } from "./admin-exam-editor.mjs";
import { adminExamCommand, hskkAdminRequest } from "./admin-exam-service.mjs";

// Mounted source authoring: one central account gate and the existing audio engine.
export function mountHSKKAdmin(root, { profile, code, onSaved = () => {} }) {
  let alive = true,
    source,
    editor,
    review,
    audioUrl,
    timer,
    contentTimer;
  let audioPending = null,
    contentPending = null,
    saving = false,
    contentSaving = false;
  let audioChanges = 0,
    contentChanges = 0,
    audioPendingChange = 0,
    contentPendingChange = 0;
  const ownerId = profile.user_id;
  const api = (action, options = {}) =>
    hskkAdminRequest(code, action, { ownerId, ...options });
  const report = (message) => {
    const n = root.querySelector("[data-feedback]");
    if (alive && n) n.textContent = message;
  };
  async function saveAudio() {
    if (!alive || !source.draft_storage_available || saving) return;
    saving = true;
    try {
      if (!audioPending) {
        audioPendingChange = audioChanges;
        audioPending = {
          request_id: crypto.randomUUID(),
          expected_revision: source.database_revision || 0,
          configuration: {
            ...structuredClone(source),
            audio: { ...structuredClone(source.audio), url: "" },
          },
        };
      }
      delete audioPending.configuration.publish_readiness;
      const value = await api("save", { method: "POST", body: audioPending });
      if (!alive) return;
      const newer = audioChanges > audioPendingChange;
      source.database_revision = value.revision;
      audioPending = null;
      report("Đã tự động lưu kiểm tra audio.");
      onSaved();
      if (newer) timer = setTimeout(saveAudio, 600);
    } catch (e) {
      report(
        e.message === "VERSION_CONFLICT"
          ? "Kiểm tra audio đã thay đổi ở nơi khác. Nội dung trên màn hình được giữ; mở lại để đối chiếu."
          : "Chưa lưu được kiểm tra audio. Nội dung vẫn được giữ trong lần mở này.",
      );
    } finally {
      saving = false;
    }
  }
  async function saveContent() {
    if (
      !alive ||
      !editor ||
      editor.state.model.backend_available === false ||
      contentSaving
    )
      return;
    contentSaving = true;
    try {
      if (!contentPending) {
        contentPendingChange = contentChanges;
        contentPending = {
          request_id: crypto.randomUUID(),
          expected_revision: editor.state.model.revision || 0,
          exam: structuredClone(editor.state.model),
        };
      }
      const saved = await adminExamCommand(
        "save_working",
        contentPending,
        ownerId,
      );
      if (!alive) return;
      const newer = contentChanges > contentPendingChange;
      editor.state.model.revision = saved.revision;
      contentPending = null;
      report("Đã tự động lưu nội dung đang kiểm tra.");
      if (newer) contentTimer = setTimeout(saveContent, 600);
    } catch {
      report(
        "Chưa lưu được nội dung. Thay đổi đang được giữ trong lần mở này.",
      );
    } finally {
      contentSaving = false;
    }
  }
  async function boot() {
    root.textContent = "Đang mở đề…";
    try {
      const account = await myProfile();
      if (!alive) return;
      if (
        account?.user_id !== ownerId ||
        account.role !== "ADMIN" ||
        account.status !== "APPROVED"
      )
        throw Error("ADMIN_REQUIRED");
      source = await api();
      const [media, saved] = await Promise.allSettled([
        api("audio", { binary: true }),
        adminExamCommand("get", { id: code }, ownerId),
      ]);
      if (!alive) return;
      audioUrl =
        media.status === "fulfilled" ? URL.createObjectURL(media.value) : null;
      source.audio.url = audioUrl || "";
      const model =
        saved.status === "fulfilled" && saved.value?.exam
          ? saved.value.exam
          : {
              id: code,
              code,
              type: "HSKK",
              level: source.level,
              levelLabel: levels[source.level],
              title: source.title,
              revision: 0,
              active: false,
              backend_available: saved.status === "fulfilled",
              audio_source_name: source.provenance.audio,
              questions: source.questions.map((q) => ({
                ...structuredClone(q),
                question_key: q.id,
                kind: q.type,
                options: [],
                pinyin: q.pinyin || "",
                explanation: "",
              })),
            };
      const audioRoot = document.createElement("section");
      audioRoot.className = "admin-audio-review";
      editor = mountExamEditor(root, {
        model,
        audioRoot,
        audioStatus: () => {
          const s = reviewSummary(source),
            gate = checkFinalization(source);
          return {
            ready: gate.ready && source.publish_readiness?.ready === true,
            message: `Audio: ${s.confirmed}/${s.total} câu đã xác nhận${s.needs_review ? ` · ${s.needs_review} câu chưa xác nhận` : ""}. ${source.publish_readiness?.reasons?.join(" ") || "Đề chưa được kết nối với phiên thi chính thức."}`,
          };
        },
        publish: async () => {
          throw Error("HSKK_OFFICIAL_BINDING_REQUIRED");
        },
        onChange: () => {
          contentChanges++;
          clearTimeout(contentTimer);
          contentTimer = setTimeout(saveContent, 600);
        },
      });
      review = mountAudioReview(audioRoot, {
        exam: source,
        actorId: ownerId,
        runSegmentation: () => api("segment", { method: "POST" }),
        loadWaveform: () => api("waveform"),
        onUpdate: (value, { persisted = false } = {}) => {
          source = value;
          editor.refreshGate();
          if (persisted) {
            report(
              "Đã lưu đề xuất phân đoạn. Mọi câu đều cần nghe và xác nhận.",
            );
            onSaved();
            return;
          }
          audioChanges++;
          clearTimeout(timer);
          if (source.draft_storage_available)
            timer = setTimeout(saveAudio, 600);
          else
            report(
              "Kiểm tra audio được giữ trong lần mở này; chức năng lưu chưa sẵn sàng.",
            );
        },
      });
      root.addEventListener("exam:tab", (e) => {
        if (e.detail !== "segments") review.pause?.();
      });
      const label = document.createElement("label");
      label.textContent = "Tải audio nguồn ";
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".mp3,audio/mpeg";
      label.append(input);
      editor.audioPanel.append(label);
      input.onchange = async () => {
        input.disabled = true;
        try {
          const file = input.files[0];
          if (!file || file.size > 32 * 1024 * 1024) throw Error();
          const hash = [
            ...new Uint8Array(
              await crypto.subtle.digest("SHA-256", await file.arrayBuffer()),
            ),
          ]
            .map((b) => b.toString(16).padStart(2, "0"))
            .join("");
          if (hash !== source.provenance.sha256[source.provenance.audio]) {
            report("File không khớp audio nguồn của đề. Chọn đúng file gốc.");
            return;
          }
          const asset = await api("reserve_source", { method: "POST" }),
            client = await getClient();
          if ((await getSession())?.user.id !== ownerId || !alive)
            throw Error();
          const { error } = await client.storage
            .from(asset.bucket)
            .upload(asset.path, file, {
              contentType: "audio/mpeg",
              upsert: false,
              cacheControl: "0",
            });
          if (
            error &&
            !["409", "Duplicate"].includes(
              String(error.statusCode || error.code),
            )
          )
            throw error;
          const blob = await api("audio", { binary: true });
          if (!alive) return;
          if (audioUrl) URL.revokeObjectURL(audioUrl);
          audioUrl = URL.createObjectURL(blob);
          source.audio.url = audioUrl;
          await review.setSource(audioUrl);
          report(
            "Đã tải audio vào kho riêng tư. Chọn Phân đoạn audio để kiểm tra.",
          );
        } catch {
          report("Chưa tải được audio. Giữ file gốc và thử lại.");
        } finally {
          input.disabled = false;
        }
      };
    } catch {
      if (alive) {
        root.innerHTML =
          '<p>Chưa mở được đề. Kiểm tra tài khoản quản trị và kết nối rồi thử lại.</p><button class="st-button">Thử mở lại đề</button>';
        root.querySelector("button").onclick = () => void boot();
      }
    }
  }
  void boot();
  const dispose = () => {
    alive = false;
    clearTimeout(timer);
    clearTimeout(contentTimer);
    review?.();
    editor?.dispose();
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    audioPending = contentPending = source = null;
  };
  dispose.pause = () => review?.pause?.();
  return dispose;
}
