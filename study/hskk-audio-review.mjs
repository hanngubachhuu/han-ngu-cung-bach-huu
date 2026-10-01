import { escapeHtml as esc } from "./core.mjs";
// Admin review of proposals only. Nothing is published or silently persisted by this editor.
export function mountAudioReview(root, { exam, actorId, runAI, onUpdate }) {
  let proposals = exam.audio.proposals || [],
    audit = exam.audio.review_audit || [],
    cancelled = false,
    player = new Audio(exam.audio.url),
    stopTimer;
  root.innerHTML = `<h3>Phân đoạn audio</h3><div class="account-actions"><button class="st-button primary" data-ai>AI tự phân đoạn</button><button class="st-button" data-manual>Chỉnh thủ công</button></div><p data-progress role="status">Đề xuất cần được đối chiếu và xác nhận trước khi dùng cho bài thi.</p><canvas data-waveform width="1000" height="100" role="img" aria-label="Dạng sóng audio nguồn" style="width:100%;height:100px"></canvas><label>Lọc đoạn<select data-filter><option value="all">Tất cả</option><option value="review">Cần kiểm tra</option><option value="confirmed">Đã xác nhận</option></select></label><section data-segments></section>`;
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
    const previous = structuredClone(q.audio_segment);
    q.audio_segment = {
      start_seconds: start,
      end_seconds: end,
      verified: true,
      reviewed_by: actorId,
      reviewed_at: new Date().toISOString(),
    };
    audit.push({
      question_id: q.id,
      question_version: q.version,
      previous,
      current: structuredClone(q.audio_segment),
      actor_id: actorId,
      event: previous ? "segment_adjusted" : "segment_confirmed",
    });
    exam.audio.review_audit = audit;
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
        return `<details data-q="${esc(q.id)}"><summary>Câu ${q.number} · ${segment?.verified ? "Đã xác nhận" : p?.start_ms != null ? "Cần kiểm tra" : "Chưa xác định"}${p ? ` · Khớp văn bản ${Math.round(p.confidence * 100)}%` : ""}</summary><p lang="zh">${esc(q.prompt)}</p>${p?.match_kind === "source_cue" ? "<p>Đoạn lời dẫn, chưa phải lời đọc nội dung câu hỏi.</p>" : ""}<label>Bắt đầu (giây)<input data-from type="number" min="0" step="0.1" value="${segment?.start_seconds ?? (p?.start_ms != null ? p.start_ms / 1000 : "")}"></label><label>Kết thúc (giây)<input data-to type="number" min="0" step="0.1" value="${segment?.end_seconds ?? (p?.end_ms != null ? p.end_ms / 1000 : "")}"></label><div class="account-actions"><button class="st-button" data-play>Nghe đoạn</button><button class="st-button" data-context>Nghe ±2 giây</button><button class="st-button" data-confirm>Xác nhận đoạn</button></div><p>Độ khớp văn bản không bảo đảm ranh giới audio chính xác. Hãy nghe trước khi xác nhận.</p></details>`;
      })
      .join("");
    for (const row of root.querySelectorAll("[data-q]")) {
      const q = exam.questions.find((q) => q.id === row.dataset.q),
        values = () => [
          Number(row.querySelector("[data-from]").value),
          Number(row.querySelector("[data-to]").value),
        ];
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
    status.textContent = "Đang phiên âm và đối chiếu audio với câu hỏi…";
    try {
      const proposal = await runAI();
      if (cancelled) return;
      proposals = proposal.questions;
      exam.audio.proposals = proposals;
      exam.audio.non_question_proposals = proposal.non_questions;
      exam.audio.job_id = proposal.job_id;
      onUpdate(exam);
      status.textContent = `Đã đề xuất ${proposal.matched}/${exam.questions.length} câu. Mọi đoạn đều cần bạn xác nhận; chưa công bố.`;
      e.target.textContent = "Chạy lại AI";
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
