import {
  appendSegmentationRun,
  reviewBoundary,
  replaceWithProposal,
} from "./hskk-segment-review-state.mjs";
import {
  checkFinalization,
  reviewSummary,
  confirmed,
  parseTimestamp,
  timestamp,
  validBounds,
  sourceHash,
  nonQuestionTypes,
} from "./hskk-review-validation.mjs";
import { escapeHtml as esc } from "./core.mjs";
export function mountAudioReview(
  root,
  { exam, actorId, runSegmentation, loadWaveform, onUpdate },
) {
  let cancelled = false,
    proposals = exam.audio.proposals || [],
    envelope = exam.audio.segmentation_runs?.at(-1)?.analysis?.waveform,
    active = null,
    raf,
    playEnd = 0;
  const player = new Audio(exam.audio.url);
  player.preload = "metadata";
  root.innerHTML = `<h3>Phân đoạn audio</h3><div data-summary role="status" style="position:sticky;top:0;background:#fff9ed;padding:12px;z-index:2"></div><div class="account-actions"><button class="st-button primary" data-ai>Tự phân đoạn local</button><button class="st-button" data-manual>Chỉnh thủ công</button><button class="st-button" data-finalize>Kiểm tra hoàn tất</button></div><p data-progress role="status"></p><div data-gate></div><label>Lọc đoạn<select data-filter><option value="all">Tất cả</option><option value="review">Cần kiểm tra</option><option value="confirmed">Đã xác nhận</option></select></label><section data-segments></section>`;
  const notice = (text) => {
    root.querySelector("[data-progress]").textContent = text;
  };
  function update() {
    onUpdate(exam);
    summary();
    if (root.querySelector("[data-gate]").textContent) gate();
  }
  function summary() {
    const s = reviewSummary(exam);
    root.querySelector("[data-summary]").textContent =
      `${s.total} câu · ${s.confirmed} đã xác nhận · ${s.needs_review} cần kiểm tra · ${s.manually_adjusted} chỉnh thủ công (có thể chưa xác nhận) · ${s.non_question} đoạn ngoài câu hỏi · ${s.unknown} UNKNOWN`;
  }
  function gate() {
    const g = checkFinalization(exam);
    const invalid = [...root.querySelectorAll("[data-error]")].filter(
      (n) => n.dataset.invalid === "true",
    );
    if (invalid.length) {
      g.ready = false;
      g.status = "NEEDS_REVIEW";
      g.issues.push({
        message:
          "Có thời gian đang nhập không hợp lệ; hãy sửa hoặc khôi phục trước khi hoàn tất.",
      });
    }
    root.querySelector("[data-gate]").innerHTML = g.ready
      ? "<p>READY_FOR_PUBLISH · Audio đủ điều kiện chuẩn bị clip; đề vẫn chưa công bố.</p>"
      : `<p>Chưa thể hoàn tất:</p><ul>${g.issues.map((x) => `<li>${esc(x.message)}</li>`).join("")}</ul>`;
    return g;
  }
  function preview(start, end) {
    if (!validBounds(start, end, exam.audio.duration_seconds)) {
      notice("Ranh giới nghe không hợp lệ.");
      return;
    }
    player.pause();
    playEnd = end / 1000;
    player.currentTime = start / 1000;
    void player.play().catch(() => notice("Chưa phát được đoạn audio."));
  }
  function drawLoop() {
    if (cancelled) return;
    if (!player.paused && player.currentTime >= playEnd) player.pause();
    active?.paint();
    raf = requestAnimationFrame(drawLoop);
  }
  player.ontimeupdate = () => {
    if (player.currentTime >= playEnd) player.pause();
  };
  const saveQuestion = (q, p, start, end, confirm = false) => {
    reviewBoundary(exam, q, p, {
      startMs: start,
      endMs: end,
      actorId,
      confirm,
    });
    update();
  };
  function focusNext(id) {
    const index = exam.questions.findIndex((q) => q.id === id),
      next = [
        ...exam.questions.slice(index + 1),
        ...exam.questions.slice(0, index),
      ].find((q) => !confirmed(q.audio_segment));
    if (!next) return;
    const row = [...root.querySelectorAll("[data-q]")].find(
      (r) => r.dataset.q === next.id,
    );
    if (row) {
      row.open = true;
      row.querySelector("[data-play]").focus();
      row.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }
  function render() {
    const openIds = [...root.querySelectorAll("[data-q][open]")].map(
      (r) => r.dataset.q,
    );
    active = null;
    const section = root.querySelector("[data-segments]");
    section.replaceChildren();
    const filter = root.querySelector("[data-filter]").value;
    for (const q of exam.questions) {
      const saved = q.audio_segment,
        p = proposals.find((x) => x.question_id === q.id),
        part = exam.sections.find((s) => s.id === q.section_id);
      if (filter !== "all" && (filter === "confirmed") !== confirmed(saved))
        continue;
      const row = document.createElement("details");
      row.dataset.q = q.id;
      row.open = openIds.includes(q.id);
      const from = saved?.start_ms ?? p?.start_ms,
        to = saved?.end_ms ?? p?.end_ms;
      row.innerHTML = `<summary>Câu ${q.number} · ${confirmed(saved) ? "Đã xác nhận" : "Cần kiểm tra"}</summary><p>${esc(part?.title_vi || q.section_id)}</p><p lang="zh">${esc(q.prompt)}</p><p>Đề xuất: ${timestamp(p?.start_ms)} → ${timestamp(p?.end_ms)} · Điểm cấu trúc ${Math.round((p?.confidence || 0) * 100)}% · ${esc(saved?.detection_method || p?.detection_method || "manual")} · <span data-state>${esc(saved?.status || "NEEDS_REVIEW")}</span></p>${["unverified_cue", "source_cue"].includes(p?.match_kind) ? '<p role="note">Đoạn này chỉ là đề xuất vùng lời dẫn/chuyển tiếp. Chưa xác minh câu hỏi được đọc trong audio.</p>' : ""}<p data-period></p><canvas data-editor width="1000" height="120" style="width:100%;height:120px;touch-action:none" aria-label="Ranh giới, vùng chọn và vị trí phát; có thể chỉnh bằng ô thời gian bên dưới"></canvas><label>Bắt đầu HH:MM:SS.mmm (hoặc giây)<input data-from value="${from == null ? "" : timestamp(from)}" inputmode="decimal"></label><label>Kết thúc HH:MM:SS.mmm (hoặc giây)<input data-to value="${to == null ? "" : timestamp(to)}" inputmode="decimal"></label><p data-duration></p><p data-error role="alert"></p><div class="account-actions"><button class="st-button" data-play>Nghe đoạn</button><button class="st-button" data-before>Nghe từ đầu −2 giây</button><button class="st-button" data-after>Nghe tới cuối +2 giây</button><button class="st-button" data-context>Nghe ±2 giây</button><button class="st-button" data-start>Đặt điểm bắt đầu</button><button class="st-button" data-end>Đặt điểm kết thúc</button><button class="st-button" data-replace>Khôi phục đề xuất</button><button class="st-button" data-confirm>Xác nhận đoạn</button><button class="st-button" data-next>Xác nhận & sang câu tiếp</button></div><p>Điểm cấu trúc không phải xác suất nhận dạng lời nói. Chỉ xác nhận sau khi nghe.</p>`;
      section.append(row);
      const values = () => [
        parseTimestamp(row.querySelector("[data-from]").value),
        parseTimestamp(row.querySelector("[data-to]").value),
      ];
      const error = (message) => {
        const node = row.querySelector("[data-error]");
        node.textContent = message;
        node.dataset.invalid = String(Boolean(message));
      };
      const canvas = row.querySelector("canvas"),
        ctx = canvas.getContext("2d");
      let left = Math.max(0, (from || 0) - 2500),
        right = Math.min(
          Math.round(exam.audio.duration_seconds * 1000),
          Math.max(to || 8000, (from || 0) + 1000) + 2500,
        ),
        drag;
      const pos = (v) => ((v - left) / (right - left)) * 1000;
      function paint() {
        ctx.clearRect(0, 0, 1000, 120);
        let a, b;
        try {
          [a, b] = values();
        } catch {
          return;
        }
        ctx.fillStyle = "rgba(184,57,39,0.16)";
        ctx.fillRect(pos(a), 0, pos(b) - pos(a), 120);
        if (envelope) {
          ctx.fillStyle = "#216e49";
          for (let x = 0; x < 1000; x++) {
            const i = Math.floor(
                (left + (x / 1000) * (right - left)) / envelope.step_ms,
              ),
              v = envelope.peaks[i] || 0;
            ctx.fillRect(x, 60 - v * 55, 1, Math.max(1, v * 110));
          }
        }
        for (const [v, color] of [
          [a, "#b83927"],
          [b, "#b83927"],
          [player.currentTime * 1000, "#173f65"],
        ]) {
          ctx.strokeStyle = color;
          ctx.beginPath();
          ctx.moveTo(pos(v), 0);
          ctx.lineTo(pos(v), 120);
          ctx.stroke();
        }
      }
      const display = () => {
        try {
          const [a, b] = values();
          row.querySelector("[data-duration]").textContent =
            `Thời lượng ${(b - a) / 1000}s · Vị trí phát ${timestamp(Math.round(player.currentTime * 1000))}`;
        } catch {
          row.querySelector("[data-duration]").textContent =
            "Chưa có ranh giới hợp lệ.";
        }
        paint();
      };
      const apply = (confirm = false) => {
        try {
          const [a, b] = values();
          saveQuestion(q, p, a, b, confirm);
          error("");
          row.querySelector("[data-state]").textContent =
            q.audio_segment.status;
          row.querySelector("summary").textContent =
            `Câu ${q.number} · ${confirmed(q.audio_segment) ? "Đã xác nhận" : "Cần kiểm tra"}`;
          display();
          return true;
        } catch (e) {
          error(
            e.message === "STALE_PROPOSAL"
              ? "Nguồn/phiên bản đã thay đổi; cần chạy phân đoạn mới."
              : "Thời gian không hợp lệ: cần 0 ≤ bắt đầu < kết thúc ≤ thời lượng nguồn.",
          );
          return false;
        }
      };
      const invoke = (fn) => () => {
        try {
          fn(...values());
        } catch {
          error("Nhập thời gian hợp lệ trước khi nghe hoặc chỉnh.");
        }
      };
      row.querySelector("[data-play]").onclick = invoke((a, b) => {
        active = {
          paint: () => {
            paint();
            row.querySelector("[data-duration]").textContent =
              `Thời lượng ${(b - a) / 1000}s · Vị trí phát ${timestamp(Math.round(player.currentTime * 1000))}`;
          },
        };
        preview(a, b);
      });
      row.querySelector("[data-before]").onclick = invoke((a, b) => {
        active = { paint };
        preview(Math.max(0, a - 2000), b);
      });
      row.querySelector("[data-after]").onclick = invoke((a, b) => {
        active = { paint };
        preview(
          a,
          Math.min(Math.round(exam.audio.duration_seconds * 1000), b + 2000),
        );
      });
      row.querySelector("[data-context]").onclick = invoke((a, b) => {
        active = { paint };
        preview(
          Math.max(0, a - 2000),
          Math.min(Math.round(exam.audio.duration_seconds * 1000), b + 2000),
        );
      });
      for (const [action, field] of [
        ["start", "from"],
        ["end", "to"],
      ])
        row.querySelector("[data-" + action + "]").onclick = () => {
          row.querySelector("[data-" + field + "]").value = timestamp(
            Math.round(player.currentTime * 1000),
          );
          apply();
        };
      for (const input of row.querySelectorAll("input"))
        input.onblur = (event) => {
          // Confirmation consumes current input itself. Avoid relayout between pointerdown/up.
          if (
            event.relatedTarget?.matches(
              "[data-confirm],[data-next],[data-replace]",
            )
          )
            return;
          apply();
        };
      row.querySelector("[data-confirm]").onclick = () => {
        if (apply(true))
          notice("Đã xác nhận trong nháp; hãy lưu bản nháp lên máy chủ.");
      };
      row.querySelector("[data-next]").onclick = () => {
        if (apply(true)) {
          render();
          focusNext(q.id);
        }
      };
      row.querySelector("[data-replace]").onclick = () => {
        try {
          if (!p || p.start_ms === null) throw Error();
          const approved =
            !q.audio_segment ||
            window.confirm(
              "Thay thế đoạn đã chỉnh/xác nhận bằng đề xuất? Lịch sử vẫn được giữ.",
            );
          if (!approved) return;
          replaceWithProposal(exam, q, p, { actorId, approved });
          update();
          render();
        } catch {
          error("Đề xuất không hợp lệ hoặc khác nguồn.");
        }
      };
      canvas.onpointerdown = (e) => {
        try {
          const [a, b] = values(),
            t =
              left +
              (e.offsetX / canvas.getBoundingClientRect().width) *
                (right - left);
          drag = Math.abs(t - a) < Math.abs(t - b) ? "from" : "to";
          canvas.setPointerCapture(e.pointerId);
        } catch {
          error("Nhập điểm bắt đầu/kết thúc trước khi kéo.");
        }
      };
      canvas.onpointermove = (e) => {
        if (!drag) return;
        const t = Math.round(
          left +
            ((e.clientX - canvas.getBoundingClientRect().left) /
              canvas.getBoundingClientRect().width) *
              (right - left),
        );
        row.querySelector("[data-" + drag + "]").value =
          t < 0 ? String(t / 1000) : timestamp(t);
        display();
      };
      canvas.onpointerup = () => {
        if (drag) apply();
        drag = null;
      };
      canvas.onpointercancel = () => {
        drag = null;
      };
      row.ontoggle = () => {
        if (row.open) {
          try {
            const [a, b] = values();
            left = Math.max(0, a - 2500);
            right = Math.min(
              Math.round(exam.audio.duration_seconds * 1000),
              b + 2500,
            );
          } catch {
            /* Unresolved rows keep their initial context. */
          }
          display();
        }
      };
      if (["unverified_cue", "source_cue"].includes(p?.match_kind)) {
        const prep = (exam.audio.non_question_proposals || [])
          .filter(
            (x) => x.segment_type === "PREPARATION" && x.end_ms <= p.start_ms,
          )
          .at(-1);
        const gap = exam.audio.segmentation_runs
          ?.find((r) => r.run_id === p.run_id)
          ?.analysis?.silence?.find((x) => x.start_ms === p.end_ms);
        row.querySelector("[data-period]").textContent =
          `Lời dẫn đề xuất: ${timestamp(p.start_ms)}–${timestamp(p.end_ms)}. Chuẩn bị đo được: ${prep ? timestamp(prep.start_ms) + "–" + timestamp(prep.end_ms) : "chưa xác định"}. Khoảng sau lời dẫn: ${gap ? timestamp(gap.start_ms) + "–" + timestamp(gap.end_ms) : "chưa xác định"}; thời gian trả lời cấu hình ${q.response_seconds}s (cần đối chiếu).`;
      }
      display();
    }
    const others = document.createElement("details");
    others.innerHTML =
      "<summary>Đoạn ngoài câu hỏi · cần nghe để phân loại</summary>";
    section.append(others);
    for (const p of exam.audio.non_question_proposals || []) {
      const key = p.start_ms + ":" + p.end_ms,
        saved = (exam.audio.non_question_reviews || []).findLast(
          (x) => x.key === key,
        ),
        s = saved || p,
        row = document.createElement("div");
      row.innerHTML = `<p>${esc(s.segment_type)} · ${saved ? "Đã lưu" : "Cần kiểm tra"}</p><label>Bắt đầu<input data-nfrom value="${timestamp(s.start_ms)}"></label><label>Kết thúc<input data-nto value="${timestamp(s.end_ms)}"></label><select aria-label="Loại đoạn ngoài câu hỏi">${nonQuestionTypes.map((t) => `<option ${t === s.segment_type ? "selected" : ""}>${t}</option>`).join("")}</select><button class="st-button" data-listen>Nghe đoạn</button><button class="st-button" data-classify>Lưu phân loại và ranh giới</button><p data-error role="alert"></p>`;
      others.append(row);
      const values = () => [
        parseTimestamp(row.querySelector("[data-nfrom]").value),
        parseTimestamp(row.querySelector("[data-nto]").value),
      ];
      row.querySelector("[data-listen]").onclick = () => {
        try {
          preview(...values());
        } catch {
          row.querySelector("[data-error]").textContent =
            "Thời gian không hợp lệ.";
        }
      };
      row.querySelector("[data-classify]").onclick = () => {
        try {
          const [a, b] = values();
          if (!validBounds(a, b, exam.audio.duration_seconds)) throw Error();
          const current = {
            key,
            run_id: p.run_id,
            segment_type: row.querySelector("select").value,
            start_ms: a,
            end_ms: b,
            status: "CONFIRMED",
            source_sha256: sourceHash(exam),
            exam_version: exam.exam_version,
            detection_method: "manual",
            actor_id: actorId,
            at: new Date().toISOString(),
          };
          exam.audio.non_question_reviews = [
            ...(exam.audio.non_question_reviews || []),
            current,
          ];
          exam.audio.review_audit = [
            ...(exam.audio.review_audit || []),
            {
              event: "non_question_reviewed",
              previous: structuredClone(
                (exam.audio.non_question_reviews || [])
                  .filter((x) => x.key === key)
                  .at(-2) || p,
              ),
              current: structuredClone(current),
              actor_id: actorId,
              at: current.at,
            },
          ];
          update();
          row.querySelector("[data-error]").textContent =
            "Đã lưu vào nháp; lưu bản nháp để giữ trên máy chủ.";
        } catch {
          row.querySelector("[data-error]").textContent =
            "Ranh giới không hợp lệ; chưa lưu.";
        }
      };
    }
    summary();
  }
  root.querySelector("[data-ai]").onclick = async (e) => {
    e.target.disabled = true;
    notice("Đang phân tích tín hiệu và cấu trúc đề bằng FFmpeg…");
    try {
      const run = await runSegmentation();
      if (cancelled) return;
      appendSegmentationRun(exam, run);
      proposals = exam.audio.proposals;
      envelope = run.analysis?.waveform || envelope;
      update();
      render();
      notice(
        `Đã đề xuất ${run.matched}/${exam.questions.length} câu. Mọi đoạn đều cần bạn xác nhận; chưa công bố.`,
      );
      e.target.textContent = "Tự phân đoạn lại";
    } catch {
      notice(
        "Không thể tự phân đoạn audio. Bạn có thể thử lại hoặc chọn đoạn thủ công.",
      );
    } finally {
      e.target.disabled = false;
    }
  };
  root.querySelector("[data-manual]").onclick = () => {
    root.querySelector("[data-filter]").value = "all";
    render();
    const first = root.querySelector("[data-q]");
    if (first) first.open = true;
  };
  root.querySelector("[data-finalize]").onclick = gate;
  root.querySelector("[data-filter]").onchange = render;
  render();
  drawLoop();
  if (!envelope && loadWaveform)
    void loadWaveform()
      .then((w) => {
        if (cancelled) return;
        envelope = w;
        for (const row of root.querySelectorAll("[data-q][open]"))
          row.ontoggle();
      })
      .catch(() =>
        notice("Chưa tải được dạng sóng; có thể nghe và nhập thời gian."),
      );
  return () => {
    cancelled = true;
    cancelAnimationFrame(raf);
    player.pause();
    player.removeAttribute("src");
    envelope = null;
  };
}
