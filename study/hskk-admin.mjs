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
export function mountHSKKAdmin(
  root,
  { profile, code, segmentationPending = false, onSaved = () => {} },
) {
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
              sections: structuredClone(source.sections),
              warnings: source.provenance.recognition_warnings || [],
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
        questionMedia: (question) =>
          api("picture", { binary: true, question: question.id }),
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
        '<h3>Chuẩn bị đề cho học viên</h3><p data-delivery-status>Đang kiểm tra…</p><button class="st-button" data-prepare>Chuẩn bị phiên bản đề</button><label>Audio câu đã duyệt <input type="file" accept=".zip,application/zip" data-clips></label><label>Học viên kiểm thử <select data-learner><option value="">Chọn học viên</option></select></label><button class="st-button" data-grant>Cấp quyền đề này</button><button class="st-button" data-runtime>Kiểm tra dịch vụ thi</button><button class="st-button" data-controlled-test>Cấp một lượt kiểm thử mới</button><p data-test-status aria-live="polite">Lượt mới chỉ dành cho học viên đã có quyền đề này và có lượt cũ hết hạn. Lượt cũ được giữ nguyên.</p>';
      editor.audioPanel.append(deliveryPanel);
      if (segmentationPending)
        report(
          "Nguồn đã được giữ và kiểm tra hash. Phân câu chưa hoàn tất; mở Phân đoạn audio và bấm chạy phân đoạn để tiếp tục.",
        );
      const timingReview = document.createElement("section");
      timingReview.innerHTML =
        '<h3>Đối chiếu nội dung và thời gian</h3><p>Kiểm tra nội dung chữ, tranh, thời gian trả lời từng câu và thời gian chuẩn bị theo file gốc. Xác nhận lại nếu sửa các mục này.</p><div data-preparation></div><button class="st-button" data-content-review>Đã đối chiếu nội dung, tranh và thời gian</button><p data-review-status role="status"></p>';
      editor.audioPanel.prepend(timingReview);
      editor.state.model.sections ||= structuredClone(source.sections);
      for (const section of editor.state.model.sections) {
        const label = document.createElement("label");
        label.textContent = section.title_vi + " · Chuẩn bị (giây) ";
        const field = document.createElement("input");
        field.type = "number";
        field.min = "0";
        field.max = "900";
        field.value = section.preparation_seconds;
        field.oninput = () => {
          section.preparation_seconds = Number(field.value);
          contentChanges++;
          readiness = { ready: false };
          clearTimeout(contentTimer);
          contentTimer = setTimeout(saveContent, 600);
          editor.refreshGate();
        };
        label.append(field);
        timingReview.querySelector("[data-preparation]").append(label);
      }
      timingReview.querySelector("[data-content-review]").onclick = async (
        event,
      ) => {
        const button = event.currentTarget;
        button.disabled = true;
        const status = timingReview.querySelector("[data-review-status]");
        try {
          if (!(await saveContent())) throw Error("CONTENT_NOT_SAVED");
          const client = await getClient();
          const { error } = await client.rpc("hskk_delivery_admin", {
            command: "review_content",
            payload: {
              exam_code: code,
              expected_revision: editor.state.model.revision,
            },
          });
          if (error) throw error;
          status.textContent =
            "Đã ghi nhận lần đối chiếu bằng tài khoản Admin của bạn.";
        } catch {
          status.textContent =
            "Chưa xác nhận được. Kiểm tra nội dung, thời gian và việc lưu đề rồi thử lại.";
        } finally {
          if (alive) button.disabled = false;
        }
      };
      const generate = document.createElement("button");
      generate.className = "st-button";
      generate.textContent = "Tạo và lưu audio các câu đã xác nhận";
      deliveryPanel.querySelector("[data-prepare]").before(generate);
      const deliveryStatus = deliveryPanel.querySelector(
        "[data-delivery-status]",
      );
      const showDelivery = async () => {
        await refreshDelivery();
        if (alive)
          deliveryStatus.textContent = delivery.prepared
            ? `${delivery.published ? "Đề đã xuất bản · " : ""}${delivery.question_count} câu đã gắn phiên bản · ${delivery.verified_clips}/${source.questions.length} audio đã kiểm tra · ${delivery.controlled_students} học viên được cấp quyền.`
            : "Chưa chuẩn bị phiên bản cho học viên.";
      };
      generate.onclick = async () => {
        generate.disabled = true;
        let controls = [];
        let staged = false;
        try {
          clearTimeout(timer);
          clearTimeout(contentTimer);
          if (audioPending || audioChanges > audioPendingChange)
            await saveAudio();
          if (saving || audioPending || !(await saveContent()))
            throw Error("CONTENT_NOT_SAVED");
          const client = await getClient();
          const checked = await client.rpc("hskk_delivery_admin", {
            command: "review_status",
            payload: { exam_code: code },
          });
          if (checked.error || checked.data?.reviewed !== true)
            throw Error("CONTENT_REVIEW_REQUIRED");
          const finalization = await api("finalize", { method: "POST" });
          if (!finalization.ready) throw Error("DRAFT_NOT_READY");
          controls = [
            ...root.querySelectorAll("input,select,textarea,button"),
          ].map((node) => [node, node.disabled]);
          for (const [node] of controls) node.disabled = true;
          staged = true;
          for (const [i, q] of source.questions.entries()) {
            if (!alive) return;
            deliveryStatus.textContent = `Đang tạo audio câu ${i + 1}/${source.questions.length} từ phân đoạn đã duyệt…`;
            await api("stage_clip", { method: "POST", question: q.id });
          }
          const current = await api();
          source.database_revision = current.database_revision;
          source.audio.clip_provenance = current.audio.clip_provenance;
          await deliveryApi("prepare", {});
          for (const [i, q] of source.questions.entries()) {
            deliveryStatus.textContent = `Đang lưu và kiểm tra hash audio câu ${i + 1}/${source.questions.length}…`;
            await deliveryApi("store_clip", { question_key: q.id });
          }
          await showDelivery();
        } catch (e) {
          deliveryStatus.textContent =
            e.message === "CONTENT_REVIEW_REQUIRED"
              ? "Hãy đối chiếu và xác nhận nội dung, tranh và thời gian trước khi tạo audio câu."
              : "Chưa hoàn tất audio câu. Đối chiếu nội dung/thời gian và xác nhận đủ phân đoạn, rồi bấm lại để tiếp tục. Đề chưa được xuất bản.";
        } finally {
          if (alive && staged) {
            try {
              const current = await api();
              if (
                current.questions.every(
                  (q, i) =>
                    JSON.stringify(q.audio_segment) ===
                    JSON.stringify(source.questions[i]?.audio_segment),
                )
              ) {
                source.database_revision = current.database_revision;
                source.audio.clip_provenance = current.audio.clip_provenance;
              } else {
                deliveryStatus.textContent =
                  "Phân đoạn đã thay đổi ở nơi khác. Mở lại đề để đối chiếu trước khi tiếp tục.";
              }
            } catch {
              deliveryStatus.textContent =
                "Chưa đọc lại được trạng thái lưu. Mở lại đề trước khi tiếp tục; các audio đã lưu được giữ nguyên.";
            }
          }
          if (alive) {
            for (const [node, disabled] of controls) node.disabled = disabled;
            editor.refreshGate();
            generate.disabled = false;
          }
        }
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
          deliveryStatus.textContent = `Đang lưu và kiểm tra ${source.questions.length} audio câu…`;
          await deliveryApi("upload", { bytes: btoa(binary) });
          await showDelivery();
        } catch {
          try {
            // A lost response can follow a successful immutable upload. Read
            // authoritative receipts before asking the Admin to retry.
            await showDelivery();
            if (delivery.verified_clips !== source.questions.length)
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
      const testRequests = new Map();
      const makeupButton = document.createElement("button");
      makeupButton.className = "st-button";
      makeupButton.textContent = "Mở nộp bù câu chưa nhận";
      const makeupStatus = document.createElement("p");
      makeupStatus.setAttribute("aria-live", "polite");
      deliveryPanel.append(makeupButton, makeupStatus);
      const makeupRequests = new Map();
      makeupButton.onclick = async () => {
        const student_id = deliveryPanel.querySelector("[data-learner]").value;
        if (!student_id) {
          makeupStatus.textContent = "Chọn học viên cần nộp bù.";
          return;
        }
        makeupButton.disabled = true;
        try {
          const current = await deliveryApi("makeup-inspect", { student_id });
          let opened = current;
          if (!current.window_id) {
            if (!current.can_open) throw Error("MAKEUP_NOT_AVAILABLE");
            const key =
              current.attempt_id + ":" + (current.last_window_id || "first");
            if (!makeupRequests.has(key))
              makeupRequests.set(key, crypto.randomUUID());
            opened = await deliveryApi("makeup-open", {
              student_id,
              attempt_id: current.attempt_id,
              request_id: makeupRequests.get(key),
              expected_revision: current.revision,
              expected_version_id: current.version_id,
              expected_missing: current.missing,
            });
          }
          makeupStatus.textContent = `Đã mở nộp bù câu ${current.missing_numbers.join(", ")} · Hạn ${new Date(opened.expires_at).toLocaleString("vi-VN")}. Các câu đã nhận được giữ nguyên. Gửi học viên liên kết: `;
          const link = document.createElement("a");
          link.href = `./hskk-de-thi.html?exam=${encodeURIComponent(code)}&attempt=${current.attempt_id}&makeup=1`;
          link.textContent = "Mở trang nộp bù";
          makeupStatus.append(link);
        } catch {
          makeupStatus.textContent =
            "Chưa mở được nộp bù. Chỉ mở cho lượt chưa nộp, đã hết hạn và còn câu chưa được nhận. Kiểm tra lại học viên/lượt thi.";
        } finally {
          if (alive) makeupButton.disabled = false;
        }
      };
      deliveryPanel.querySelector("[data-controlled-test]").onclick = async (
        event,
      ) => {
        const button = event.currentTarget,
          status = deliveryPanel.querySelector("[data-test-status]");
        const studentId = deliveryPanel.querySelector("[data-learner]").value;
        if (!studentId) {
          status.textContent = "Chọn đúng học viên kiểm thử đã được duyệt.";
          return;
        }
        button.disabled = true;
        try {
          const current = await deliveryApi("test-inspect", {
            student_id: studentId,
          });
          let authorized = current;
          if (!current.authorized) {
            if (!current.can_authorize)
              throw Error("TEST_ATTEMPT_NOT_AVAILABLE");
            if (!testRequests.has(studentId))
              testRequests.set(studentId, crypto.randomUUID());
            authorized = await deliveryApi("test-authorize", {
              student_id: studentId,
              request_id: testRequests.get(studentId),
              expected_version_id: current.version_id,
              expected_previous_attempt_id: current.previous_attempt_id,
            });
          }
          status.textContent = `Lượt kiểm thử đã được cấp: ${authorized.attempt_id}. Học viên mở ${code} để kiểm tra thiết bị và bắt đầu. Lượt cũ được giữ nguyên; kết quả kiểm thử chưa công bố.`;
        } catch {
          status.textContent =
            "Chưa cấp được lượt mới. Chỉ cấp một lượt cho học viên đã có quyền, đúng phiên bản đã xuất bản và lượt cũ hết hạn. Có thể bấm lại để đối chiếu lượt đã cấp.";
        } finally {
          if (alive) button.disabled = false;
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
