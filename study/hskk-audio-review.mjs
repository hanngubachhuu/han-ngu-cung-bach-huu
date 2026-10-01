import {
  appendSegmentationRun,
  reviewBoundary,
} from "./hskk-segment-review-state.mjs";
import { escapeHtml as esc } from "./core.mjs";
// Admin review of proposals only. Nothing is published or silently persisted by this editor.
export function mountAudioReview(
  root,
  { exam, actorId, runSegmentation, onUpdate },
) {
  let proposals = exam.audio.proposals || [],
    cancelled = false,
    player = new Audio(exam.audio.url),
    stopTimer,
    decoded;
  root.innerHTML = `<h3>Phân đoạn audio</h3><div class="account-actions"><button class="st-button primary" data-ai>Tự phân đoạn local</button><button class="st-button" data-manual>Chỉnh thủ công</button></div><p data-progress role="status">Đề xuất cần được đối chiếu và xác nhận trước khi dùng cho bài thi.</p><canvas data-waveform width="1000" height="100" role="img" aria-label="Dạng sóng audio nguồn" style="width:100%;height:100px"></canvas><label>Lọc đoạn<select data-filter><option value="all">Tất cả</option><option value="review">Cần kiểm tra</option><option value="confirmed">Đã xác nhận</option></select></label><section data-segments></section>`;
  const status = root.querySelector("[data-progress]");
  async function drawWaveform() {
    if (!exam.audio.url) {
      status.textContent =
        "Chưa có audio nguồn để nghe. Tải đúng file gốc vào kho riêng tư trước khi phân đoạn.";
      return;
    }
    try {
      const bytes = await (await fetch(exam.audio.url)).arrayBuffer();
      const c = new AudioContext();
      let data;
      try {
        data = await c.decodeAudioData(bytes);
      } finally {
        await c.close();
      }
      if (cancelled) return;
      decoded = data;
      render();
      const canvas = root.querySelector("canvas"),
        ctx = canvas.getContext("2d"),
        pcm = data.getChannelData(0),
        step = Math.max(1, Math.floor(pcm.length / canvas.width));
      ctx.fillStyle = "#216e49";
      for (let x = 0; x < canvas.width; x++) {
        let peak = 0;
        for (
          let i = x * step;
          i < Math.min(pcm.length, (x + 1) * step);
          i += Math.max(1, Math.floor(step / 80))
        )
          peak = Math.max(peak, Math.abs(pcm[i]));
        ctx.fillRect(x, 50 - peak * 48, 1, Math.max(1, peak * 96));
      }
    } catch {
      if (!cancelled)
        status.textContent =
          "Chưa hiển thị được dạng sóng. Bạn vẫn có thể nghe và chỉnh đoạn.";
    }
  }
  function preview(start, end) {
    clearTimeout(stopTimer);
    player.pause();
    player.currentTime = Math.max(0, start);
    void player
      .play()
      .then(() => {
        stopTimer = setTimeout(
          () => player.pause(),
          Math.max(0, end - start) * 1000,
        );
      })
      .catch(() => {
        status.textContent = "Chưa phát được đoạn audio.";
      });
  }
  function commit(q, start, end) {
    if (
      !Number.isFinite(start) ||
      !Number.isFinite(end) ||
      start < 0 ||
      end <= start ||
      end > exam.audio.duration_seconds
    )
      throw Error();
    reviewBoundary(
      exam,
      q,
      proposals.find((p) => p.question_id === q.id),
      { start, end, actorId, confirm: true },
    );
    onUpdate(exam);
    status.textContent =
      "Đã xác nhận trong bản nháp trên trang. Xuất cấu hình nháp để giữ lại; chưa lưu máy chủ.";
  }
  function render() {
    const filter = root.querySelector("[data-filter]").value;
    const questions = exam.questions.filter(
      (q) =>
        filter === "all" ||
        (filter === "confirmed") === Boolean(q.audio_segment?.verified),
    );
    root.querySelector("[data-segments]").innerHTML = questions
      .map((q) => {
        const p = proposals.find((s) => s.question_id === q.id),
          segment = q.audio_segment;
        return `<details data-q="${esc(q.id)}"><summary>Câu ${q.number} · ${segment?.verified ? "Đã xác nhận" : p?.start_ms != null ? "Cần kiểm tra" : "Chưa xác định"}${p ? ` · Điểm phù hợp cấu trúc ${Math.round(p.confidence * 100)}%` : ""}</summary><p lang="zh">${esc(q.prompt)}</p>${p?.match_kind === "source_cue" ? "<p>Đoạn lời dẫn, chưa phải lời đọc nội dung câu hỏi.</p>" : ""}<p>Phương pháp: ${esc(segment?.detection_method || p?.detection_method || "manual")} · ${esc(segment?.status || p?.status || "NEEDS_REVIEW")}</p><canvas data-editor width="1000" height="100" style="width:100%;height:100px;touch-action:none" aria-label="Kéo ranh giới đoạn trên dạng sóng"></canvas><label>Bắt đầu (giây)<input data-from type="number" min="0" step="0.001" value="${segment?.start_seconds ?? (p?.start_ms != null ? p.start_ms / 1000 : "")}"></label><label>Kết thúc (giây)<input data-to type="number" min="0" step="0.001" value="${segment?.end_seconds ?? (p?.end_ms != null ? p.end_ms / 1000 : "")}"></label><div class="account-actions"><button class="st-button" data-play>Nghe đoạn</button><button class="st-button" data-context>Nghe ±2 giây</button><button class="st-button" data-replace>Thay thế bằng kết quả phân đoạn mới</button><button class="st-button" data-confirm>Xác nhận đoạn</button></div><p>Điểm cấu trúc không phải xác suất nhận dạng lời nói. Hãy nghe trước khi xác nhận.</p></details>`;
      })
      .join("");
    const types = [
      "INTRO",
      "CANDIDATE_INFO",
      "SECTION_INTRO",
      "PREPARATION",
      "TIME_WARNING",
      "TRANSITION",
      "OUTRO",
      "UNKNOWN",
    ];
    const others = document.createElement("details");
    others.innerHTML =
      "<summary>Đoạn ngoài câu hỏi · cần nghe để phân loại</summary>";
    for (const segment of exam.audio.non_question_proposals || []) {
      const key = segment.start_ms + ":" + segment.end_ms,
        saved = (exam.audio.non_question_reviews || []).findLast(
          (r) => r.key === key,
        );
      const row = document.createElement("div");
      row.innerHTML = `<p>${segment.start_ms / 1000}–${segment.end_ms / 1000}s · ${esc(saved?.segment_type || segment.segment_type)} · ${saved ? "Đã phân loại" : "Cần kiểm tra"}</p><select aria-label="Loại đoạn ngoài câu hỏi">${types.map((t) => `<option ${t === (saved?.segment_type || segment.segment_type) ? "selected" : ""}>${t}</option>`).join("")}</select><button type="button" class="st-button" data-listen>Nghe đoạn</button><button type="button" class="st-button" data-classify>Xác nhận phân loại</button>`;
      row.querySelector("[data-listen]").onclick = () =>
        preview(segment.start_ms / 1000, segment.end_ms / 1000);
      row.querySelector("[data-classify]").onclick = () => {
        const review = {
          key,
          run_id: segment.run_id,
          segment_type: row.querySelector("select").value,
          start_ms: segment.start_ms,
          end_ms: segment.end_ms,
          status: "CONFIRMED",
          detection_method: "manual",
          actor_id: actorId,
          at: new Date().toISOString(),
        };
        exam.audio.non_question_reviews = [
          ...(exam.audio.non_question_reviews || []),
          review,
        ];
        exam.audio.review_audit = [
          ...(exam.audio.review_audit || []),
          {
            event: "non_question_classified",
            previous: saved || segment,
            current: review,
            actor_id: actorId,
            at: review.at,
          },
        ];
        onUpdate(exam);
        render();
      };
      others.append(row);
    }
    root.querySelector("[data-segments]").append(others);
    for (const row of root.querySelectorAll("[data-q]")) {
      const q = exam.questions.find((q) => q.id === row.dataset.q),
        values = () => [
          Number(row.querySelector("[data-from]").value),
          Number(row.querySelector("[data-to]").value),
        ];
      const proposal = proposals.find((p) => p.question_id === q.id);
      const canvas = row.querySelector("[data-editor]"),
        ctx = canvas.getContext("2d");
      const [from, to] = values(),
        left = Math.max(0, (Number.isFinite(from) ? from : 0) - 3),
        right = Math.min(
          exam.audio.duration_seconds,
          Math.max(to || left + 8, left + 1) + 3,
        );
      function paint() {
        ctx.clearRect(0, 0, 1000, 100);
        if (decoded) {
          const pcm = decoded.getChannelData(0),
            rate = decoded.sampleRate;
          ctx.fillStyle = "#216e49";
          for (let x = 0; x < 1000; x++) {
            let peak = 0;
            const a = Math.floor((left + (x / 1000) * (right - left)) * rate),
              b = Math.min(
                pcm.length,
                Math.ceil((left + ((x + 1) / 1000) * (right - left)) * rate),
              );
            for (let i = a; i < b; i += Math.max(1, Math.floor((b - a) / 30)))
              peak = Math.max(peak, Math.abs(pcm[i]));
            ctx.fillRect(x, 50 - peak * 48, 1, Math.max(1, peak * 96));
          }
        }
        ctx.strokeStyle = "#b83927";
        for (const v of values()) {
          const x = ((v - left) / (right - left)) * 1000;
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, 100);
          ctx.stroke();
        }
      }
      let drag;
      canvas.onpointerdown = (e) => {
        const t =
          left +
          ((e.clientX - canvas.getBoundingClientRect().left) /
            canvas.getBoundingClientRect().width) *
            (right - left);
        const v = values();
        drag =
          Math.abs(t - v[0]) < Math.abs(t - v[1]) ? "[data-from]" : "[data-to]";
        canvas.setPointerCapture(e.pointerId);
      };
      canvas.onpointermove = (e) => {
        if (!drag) return;
        const t = Math.min(
          right,
          Math.max(
            left,
            left +
              ((e.clientX - canvas.getBoundingClientRect().left) /
                canvas.getBoundingClientRect().width) *
                (right - left),
          ),
        );
        row.querySelector(drag).value = t.toFixed(3);
        paint();
      };
      const saveEdit = () => {
        try {
          reviewBoundary(exam, q, proposal, {
            start: values()[0],
            end: values()[1],
            actorId,
          });
          onUpdate(exam);
          status.textContent =
            "Đã chỉnh ranh giới nháp; cần nghe và xác nhận lại.";
        } catch {
          status.textContent = "Ranh giới chưa hợp lệ.";
        }
      };
      canvas.onpointerup = () => {
        if (drag) saveEdit();
        drag = null;
      };
      canvas.onpointercancel = () => {
        drag = null;
      };
      for (const input of row.querySelectorAll("input"))
        input.onchange = () => {
          saveEdit();
          paint();
        };
      row.querySelector("[data-replace]").onclick = () => {
        if (!proposal || proposal.start_ms === null) return;
        if (
          q.audio_segment &&
          !window.confirm(
            "Thay thế đoạn đã chỉnh/xác nhận bằng đề xuất mới? Lịch sử vẫn được giữ.",
          )
        )
          return;
        row.querySelector("[data-from]").value = proposal.start_ms / 1000;
        row.querySelector("[data-to]").value = proposal.end_ms / 1000;
        saveEdit();
        paint();
      };
      paint();
      row.querySelector("[data-play]").onclick = () => preview(...values());
      row.querySelector("[data-context]").onclick = () => {
        const [start, end] = values();
        preview(
          Math.max(0, start - 2),
          Math.min(exam.audio.duration_seconds, end + 2),
        );
      };
      row.querySelector("[data-confirm]").onclick = () => {
        try {
          if (
            !row.querySelector("[data-from]").value ||
            !row.querySelector("[data-to]").value
          )
            throw Error();
          commit(q, ...values());
          render();
        } catch {
          status.textContent =
            "Đoạn chưa hợp lệ. Kiểm tra thời điểm bắt đầu và kết thúc.";
        }
      };
    }
  }
  root.querySelector("[data-ai]").onclick = async (e) => {
    e.target.disabled = true;
    status.textContent = "Đang phân tích tín hiệu và cấu trúc đề bằng FFmpeg…";
    try {
      const proposal = await runSegmentation();
      if (cancelled) return;
      appendSegmentationRun(exam, proposal);
      proposals = exam.audio.proposals;
      onUpdate(exam);
      status.textContent = `Đã đề xuất ${proposal.matched}/${exam.questions.length} câu. Mọi đoạn đều cần bạn xác nhận; chưa công bố.`;
      e.target.textContent = "Tự phân đoạn lại";
      render();
    } catch {
      status.textContent =
        "Không thể tự phân đoạn audio. Bạn có thể thử lại hoặc chọn đoạn thủ công.";
    } finally {
      e.target.disabled = false;
    }
  };
  root.querySelector("[data-manual]").onclick = () => {
    root.querySelector("[data-filter]").value = "all";
    render();
    root.querySelector("[data-q]")?.setAttribute("open", "");
  };
  root.querySelector("[data-filter]").onchange = render;
  render();
  void drawWaveform();
  return () => {
    cancelled = true;
    clearTimeout(stopTimer);
    player.pause();
    player.removeAttribute("src");
  };
}
