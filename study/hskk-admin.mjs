import { getClient, getSession } from "./auth.mjs";
import { myProfile } from "./account-service.mjs";
import { mountAudioReview } from "./hskk-audio-review.mjs";
import { reviewSummary, checkFinalization } from "./hskk-review-validation.mjs";
import { levels } from "./hskk-exam-core.mjs";
import { mountExamEditor } from "./admin-exam-editor.mjs";
import {
  adminExamCommand,
  hskkAdminRequest,
  hskkDeliveryRequest,
} from "./admin-exam-service.mjs";

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
  let delivery,
    unpublishedChanges = false,
    readiness = { ready: false };
  const deliveryApi = (action, body) =>
    hskkDeliveryRequest(code, action, { ownerId: profile.user_id, body });
  async function refreshDelivery() {
    delivery = await deliveryApi("get");
    const c = await getClient();
    const checked = await c.rpc("hskk_publication", {
      command: "readiness",
      payload: { exam_code: code, version_id: delivery.version_id },
    });
    readiness = checked.error ? { ready: false } : checked.data;
    editor?.refreshGate();
  }
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
      return false;
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
      if (!alive) return false;
      const newer = contentChanges > contentPendingChange;
      editor.state.model.revision = saved.revision;
      contentPending = null;
      report("Đã tự động lưu nội dung đang kiểm tra.");
      if (newer) contentTimer = setTimeout(saveContent, 600);
      return !newer;
    } catch {
      report(
        "Chưa lưu được nội dung. Thay đổi đang được giữ trong lần mở này.",
      );
      return false;
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
          const message =
            delivery?.published === true
              ? unpublishedChanges
                ? "Đề đã xuất bản. Thay đổi đang sửa cần chuẩn bị và xuất bản lại để áp dụng."
                : "Đề đã xuất bản. Học viên được cấp quyền có thể bắt đầu."
              : readiness?.ready
                ? "Đề đã đủ điều kiện xuất bản."
                : "Hoàn tất chuẩn bị đề, audio câu và quyền học viên trước khi xuất bản.";
          return {
            ready: gate.ready && readiness?.ready === true,
            message: `Audio: ${s.confirmed}/${s.total} câu đã xác nhận${s.needs_review ? ` · ${s.needs_review} câu chưa xác nhận` : ""}. ${message}`,
          };
        },
        publish: async (body) => {
          await adminExamCommand("save_working", body, ownerId);
          await deliveryApi("prepare", {});
          await refreshDelivery();
          const client = await getClient();
          const { data, error } = await client.rpc("hskk_publication", {
            command: "publish",
            payload: { exam_code: code, version_id: delivery.version_id },
          });
          if (error) throw Error("HSKK_NOT_READY");
          return data;
        },
        onPublished: () => {
          unpublishedChanges = false;
          delivery = { ...delivery, published: true };
          readiness = { ready: false };
          onSaved();
          void showDelivery().catch(() =>
            report(
              "Đề đã xuất bản. Mở lại để kiểm tra trạng thái chuẩn bị đề.",
            ),
          );
        },
        onChange: () => {
          unpublishedChanges = true;
          readiness = { ready: false };
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
          unpublishedChanges = true;
          readiness = { ready: false };
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
      const deliveryPanel = document.createElement("section");
      deliveryPanel.innerHTML =
        '<h3>Chuẩn bị đề cho học viên</h3><p data-delivery-status>Đang kiểm tra…</p><button class="st-button" data-prepare>Chuẩn bị phiên bản đề</button><label>Audio câu đã duyệt <input type="file" accept=".zip,application/zip" data-clips></label><label>Học viên kiểm thử <select data-learner><option value="">Chọn học viên</option></select></label><button class="st-button" data-grant>Cấp quyền đề này</button><button class="st-button" data-runtime>Kiểm tra dịch vụ thi</button>';
      editor.audioPanel.append(deliveryPanel);
      const deliveryStatus = deliveryPanel.querySelector(
        "[data-delivery-status]",
      );
      const showDelivery = async () => {
        await refreshDelivery();
        if (alive)
          deliveryStatus.textContent = delivery.prepared
            ? `${delivery.published ? "Đề đã xuất bản · " : ""}${delivery.question_count} câu đã gắn phiên bản · ${delivery.verified_clips}/27 audio đã kiểm tra · ${delivery.controlled_students} học viên được cấp quyền.`
            : "Chưa chuẩn bị phiên bản cho học viên.";
      };
      deliveryPanel.querySelector("[data-prepare]").onclick = async (event) => {
        event.currentTarget.disabled = true;
        try {
          if (!(await saveContent())) throw Error("CONTENT_NOT_SAVED");
          await deliveryApi("prepare", {});
          await showDelivery();
        } catch {
          deliveryStatus.textContent =
            "Chưa chuẩn bị được phiên bản đề. Kiểm tra nội dung và kết nối rồi thử lại.";
        } finally {
          event.target.disabled = false;
        }
      };
      deliveryPanel.querySelector("[data-clips]").onchange = async (event) => {
        const input = event.target;
        input.disabled = true;
        try {
          const file = input.files[0];
          if (!file || file.size > 4 * 1024 * 1024) throw Error();
          const bytes = new Uint8Array(await file.arrayBuffer());
          let binary = "";
          for (let i = 0; i < bytes.length; i += 16384)
            binary += String.fromCharCode(...bytes.subarray(i, i + 16384));
          deliveryStatus.textContent = "Đang lưu và kiểm tra 27 audio câu…";
          await deliveryApi("upload", { bytes: btoa(binary) });
          await showDelivery();
        } catch {
          try {
            // A lost response can follow a successful immutable upload. Read
            // authoritative receipts before asking the Admin to retry.
            await showDelivery();
            if (delivery.verified_clips !== 27)
              deliveryStatus.textContent =
                "Chưa hoàn tất audio câu. Chọn đúng ZIP đã duyệt; có thể tải lại cùng file để tiếp tục kiểm tra.";
          } catch {
            deliveryStatus.textContent =
              "Chưa kiểm tra được audio câu đã lưu. Mở lại đề để đối chiếu trước khi thử lại.";
          }
        } finally {
          input.disabled = false;
        }
      };
      deliveryPanel.querySelector("[data-grant]").onclick = async () => {
        try {
          const id = deliveryPanel.querySelector("[data-learner]").value;
          if (!id) return;
          const c = await getClient();
          const { error } = await c.rpc("hskk_delivery_admin", {
            command: "grant_access",
            payload: { exam_code: code, student_id: id },
          });
          if (error) throw error;
          await showDelivery();
        } catch {
          deliveryStatus.textContent =
            "Chưa cấp được quyền. Chọn học viên đã được duyệt rồi thử lại.";
        }
      };
      deliveryPanel.querySelector("[data-runtime]").onclick = async () => {
        try {
          await deliveryApi("runtime", {});
          await showDelivery();
        } catch {
          deliveryStatus.textContent =
            "Dịch vụ thi chưa sẵn sàng. Kiểm tra kết nối rồi thử lại.";
        }
      };
      try {
        const c = await getClient();
        const students = await c
          .from("profiles")
          .select("user_id,full_name")
          .eq("role", "STUDENT")
          .eq("status", "APPROVED")
          .order("full_name")
          .limit(100);
        for (const student of students.data || []) {
          const option = document.createElement("option");
          option.value = student.user_id;
          option.textContent = student.full_name;
          deliveryPanel.querySelector("[data-learner]").append(option);
        }
        await showDelivery();
      } catch {
        deliveryStatus.textContent =
          "Chưa kiểm tra được việc chuẩn bị đề. Thử mở lại đề.";
      }
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
