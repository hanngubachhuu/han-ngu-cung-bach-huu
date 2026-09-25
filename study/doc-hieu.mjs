import {
  $,
  initShared,
  empty,
  entryCard,
  toast,
  speak,
  stopSpeech,
  showWord,
  icon,
} from "./ui.mjs";
import { dictionary, readings } from "./repository.mjs";
import {
  savedReadings,
  saveReading,
  deleteReading,
  savedWords,
} from "./storage.mjs";
import {
  escapeHtml as esc,
  normalizeReading,
  splitSentences,
  segmentText,
  HAN,
  validateQuestions,
} from "./core.mjs";
import { api } from "./auth.mjs";
import { pinyin } from "./vendor/pinyin.mjs";
let active = null,
  sentences = [],
  index = 0,
  playing = false,
  repeat = false,
  sequence = 0,
  audioUrl = null,
  controller = null,
  historyRows = [],
  librarySequence = 0;
function pause() {
  playing = false;
  stopSpeech();
  $("#playReading").innerHTML = icon("play") + " Nghe tiếp";
}
function position() {
  index = Math.max(0, Math.min(index, sentences.length - 1));
  $("#sentencePosition").textContent = `Câu ${index + 1} / ${sentences.length}`;
  $("#sentenceProgress").max = sentences.length;
  $("#sentenceProgress").value = index + 1;
  document
    .querySelectorAll("[data-sentence]")
    .forEach((s) =>
      s.classList.toggle("is-active", Number(s.dataset.sentence) === index),
    );
}
function play() {
  if (!sentences.length) return;
  $("#readingAudio").pause();
  position();
  const current = sequence;
  speak(sentences[index].text, {
    rate: Number($("#readingSpeed").value),
    onStart: () => {
      if (current !== sequence) return;
      playing = true;
      $("#playReading").textContent = "Tạm dừng";
    },
    onEnd: () => {
      if (!playing || current !== sequence) return;
      if (!repeat) index++;
      if (index >= sentences.length) {
        index = sentences.length - 1;
        pause();
        $("#playReading").innerHTML = icon("play") + " Nghe lại";
        index = 0;
      } else play();
    },
    onError: () => pause(),
  });
}
function releaseAudio() {
  pause();
  const audio = $("#readingAudio");
  audio.pause();
  audio.removeAttribute("src");
  audio.hidden = true;
  if (audioUrl) URL.revokeObjectURL(audioUrl);
  audioUrl = null;
}
async function refreshLibrary() {
  const current = ++librarySequence;
  const [samples, saved] = await Promise.all([
    readings.list(),
    savedReadings().catch(() => null),
  ]);
  if (current !== librarySequence) return;
  historyRows = saved || [];
  $("#readingSamples").innerHTML = samples
    .map(
      (r) =>
        `<button class="st-library-item" data-sample="${esc(r.id)}"><strong lang="zh-Hans">${esc(r.title)}</strong><span>${esc(r.titleVi || "")} · HSK ${esc(r.curriculum?.level || "")}</span><small>${r.length || [...r.sourceText].length} ký tự · ${r.questionCount ?? r.questions?.length ?? 0} câu hỏi</small></button>`,
    )
    .join("");
  $("#readingHistory").innerHTML =
    saved === null
      ? '<p class="st-help">Chưa tải được bài trên tài khoản. Hãy thử lại sau.</p>'
      : saved.length
        ? saved
            .map(
              (r) =>
                `<div class="st-history-row"><button class="st-library-item" data-saved-reading="${esc(r.id)}"><strong>${esc(r.title)}</strong><small>${new Date(r.updatedAt).toLocaleDateString("vi-VN")}</small></button><button class="st-icon" data-delete-reading="${esc(r.id)}" aria-label="Xóa bài ${esc(r.title)}">×</button></div>`,
            )
            .join("")
        : '<p class="st-help">Chưa có bài đã lưu. Mở bài đọc và bấm Lưu bài.</p>';
}
function renderQuiz(questions) {
  const valid = validateQuestions(questions);
  const q = $("#readingQuiz");
  q.innerHTML = valid
    ? `<h2>Kiểm tra đọc hiểu</h2><p class="st-caption">Chọn đáp án rồi kiểm tra. Có thể làm lại để tự ôn.</p><form id="quizForm">${questions.map((v, i) => `<fieldset><legend>${i + 1}. ${esc(v.question)}</legend>${v.choices.map((c, j) => `<label><input type="radio" name="q${i}" value="${j}" required>${esc(c)}</label>`).join("")}<div id="feedback${i}" class="st-feedback" hidden></div></fieldset>`).join("")}<div id="quizScore" class="st-score" role="status"></div><div class="st-actions"><button class="st-button primary" type="submit">Kiểm tra đáp án</button><button class="st-button" type="reset">Làm lại</button></div></form>`
    : empty(
        "Tự kiểm tra điều mình hiểu",
        "Thử kể lại ý chính bằng tiếng Việt. Văn bản này chưa có bộ câu hỏi được kiểm chứng; bật phân tích AI khi mở bài mới để tạo thêm.",
      );
  if (!valid) return;
  const form = $("#quizForm");
  const grade = () => {
    let score = 0;
    questions.forEach((v, i) => {
      const selected = form.querySelector(`input[name=q${i}]:checked`);
      if (!selected) return;
      const correct = Number(selected.value) === v.correctIndex;
      if (correct) score++;
      form.querySelectorAll(`input[name=q${i}]`).forEach((input) => {
        input.parentElement.classList.toggle(
          "correct",
          Number(input.value) === v.correctIndex,
        );
        input.parentElement.classList.toggle(
          "wrong",
          input.checked && !correct,
        );
      });
      const feedback = $("#feedback" + i);
      feedback.hidden = false;
      feedback.textContent =
        (correct
          ? "Đúng. "
          : "Chưa đúng. Đáp án: " + v.choices[v.correctIndex] + ". ") +
        v.explanation +
        (v.evidence ? "\nTrong bài: " + v.evidence : "");
    });
    $("#quizScore").textContent =
      `Bạn trả lời đúng ${score} / ${questions.length} câu.`;
    active.result.answers = questions.map((_, i) =>
      Number(form.querySelector(`input[name=q${i}]:checked`)?.value ?? -1),
    );
    active.result.graded = true;
  };
  form.onsubmit = (e) => {
    e.preventDefault();
    grade();
  };
  form.onreset = () => {
    q.querySelectorAll(".correct,.wrong").forEach((x) =>
      x.classList.remove("correct", "wrong"),
    );
    q.querySelectorAll(".st-feedback").forEach((x) => (x.hidden = true));
    $("#quizScore").textContent = "";
    active.result.answers = [];
    active.result.graded = false;
  };
  (active.result.answers || []).forEach((value, i) => {
    const input = form.querySelector(
      `input[name=q${i}][value="${Number(value)}"]`,
    );
    if (input) input.checked = true;
  });
  if (active.result.graded) grade();
}
async function openReading(
  source,
  { sample = null, result = null, id = null, title = null, useAi = false } = {},
) {
  let text;
  try {
    text = normalizeReading(source);
  } catch (e) {
    toast(e.message);
    return;
  }
  controller?.abort();
  controller = new AbortController();
  const current = ++sequence;
  releaseAudio();
  $("#readingInputStatus").textContent = "Đang chuẩn bị bài đọc…";
  $("#readingSubmit").disabled = true;
  try {
    const entries = await dictionary.matchingText(text);
    if (current !== sequence) return;
    let analysis = result?.analysis || null;
    if (useAi) {
      $("#readingInputStatus").textContent = "Đang tạo bản dịch và câu hỏi…";
      analysis = await api("analyze", { text }, controller.signal);
    }
    if (current !== sequence) return;
    active = {
      id,
      title: title || sample?.title || analysis?.title || text.slice(0, 30),
      sourceText: text,
      result: {
        ...(result || {}),
        analysis,
        questions:
          analysis?.questions || result?.questions || sample?.questions || [],
        source: result?.source || sample?.provenance || null,
      },
    };
    const pieces = splitSentences(text);
    sentences = pieces.filter((p) => p.type === "sentence");
    index = Math.min(result?.sentenceIndex || 0, sentences.length - 1);
    let si = 0;
    $("#readingProse").innerHTML = pieces
      .map((piece) => {
        if (piece.type === "break") return esc(piece.text);
        const n = si++;
        const sentencePinyin = pinyin(piece.text, { type: "all" });
        let pyOffset = 0;
        const tokens = segmentText(piece.text, entries)
          .map((token) => {
            const length = [...token.text].length;
            const py = sentencePinyin
              .slice(pyOffset, pyOffset + length)
              .map((x) => x.pinyin)
              .join(" ");
            pyOffset += length;
            return HAN.test(token.text)
              ? `<button class="st-token ${token.entry ? "has-entry" : ""}" ${token.entry ? `data-word="${esc(token.entry.id)}"` : `data-unknown="${esc(token.text)}"`} aria-label="Tra ${esc(token.text)}"><ruby>${esc(token.text)}<rt>${esc(py)}</rt></ruby></button>`
              : esc(token.text);
          })
          .join("");
        const translation =
          analysis?.translations?.find((t) => t.index === n)?.vietnamese ||
          sample?.translations?.find((t) => t.index === n)?.vietnamese;
        return `<span class="st-sentence" data-sentence="${n}"><button class="st-sentence-listen" data-listen="${n}" aria-label="Nghe câu ${n + 1}">${icon("audio")}</button>${tokens}<span class="st-translation">${esc(translation || "Chưa có bản dịch cho câu này.")}</span></span>`;
      })
      .join("");
    $("#readingProse").classList.toggle("show-pinyin", !!result?.showPinyin);
    $("#readingProse").classList.toggle(
      "show-translation",
      !!result?.showTranslation,
    );
    $("#togglePinyin").setAttribute(
      "aria-pressed",
      String(!!result?.showPinyin),
    );
    $("#toggleTranslation").setAttribute(
      "aria-pressed",
      String(!!result?.showTranslation),
    );
    $("#readingTitle").textContent = active.title;
    $("#readingSource").textContent = sample
      ? "Học liệu HSK " +
        sample.curriculum.level +
        " · Bài " +
        sample.curriculum.lessonNo
      : active.result.source
        ? "Bài học đã lưu"
        : "Văn bản do bạn cung cấp";
    const notice = $("#analysisNotice");
    notice.hidden = !analysis;
    if (analysis)
      notice.textContent =
        "Bản dịch và câu hỏi do AI tạo. Hãy đối chiếu với văn bản; câu trả lời chỉ được kiểm tra trong phạm vi bài này.";
    const ids = await savedWords().catch(() => []);
    if (current !== sequence) return;
    $("#keyWordCount").textContent = entries.length + " từ";
    $("#keyVocabulary").innerHTML = entries.length
      ? entries
          .map((e) =>
            entryCard(e, { compact: true, saved: ids.includes(e.id) }),
          )
          .join("")
      : empty(
          "Chưa có từ trong kho",
          "Chạm vào một từ trong bài để mở tra cứu bổ sung.",
        );
    renderQuiz(active.result.questions);
    $("#readingInputView").hidden = true;
    $("#readingResult").hidden = false;
    $("#readingAudioStatus").textContent =
      "Giọng thiết bị · nghe theo câu. Pinyin tự động cần đối chiếu với ngữ cảnh.";
    position();
    $("#readingResult").scrollIntoView({ block: "start" });
  } catch (e) {
    if (e.name !== "AbortError") {
      toast(e.message);
      $("#readingInputStatus").textContent = e.message;
    }
  } finally {
    if (current === sequence) {
      $("#readingSubmit").disabled = false;
      if (active) $("#readingInputStatus").textContent = "";
    }
  }
}
$("#readingForm").onsubmit = (e) => {
  e.preventDefault();
  openReading($("#readingText").value, { useAi: $("#readingUseAi").checked });
};
$("#readingText").oninput = (e) => {
  const count = [...e.target.value].length;
  $("#readingCounter").textContent = count + " / 3000";
  $("#readingSubmit").disabled = count > 3000;
  e.target.setAttribute("aria-invalid", String(count > 3000));
};
$("#readingSamples").onclick = async (e) => {
  const b = e.target.closest("[data-sample]");
  if (!b) return;
  b.disabled = true;
  try {
    const sample = await readings.get(b.dataset.sample);
    if (sample) await openReading(sample.sourceText, { sample });
  } catch (error) {
    toast(error.message);
  } finally {
    b.disabled = false;
  }
};
$("#readingHistory").onclick = async (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  if (b.dataset.savedReading) {
    const r = historyRows.find((x) => x.id === b.dataset.savedReading);
    if (r) openReading(r.sourceText, r);
  }
  if (b.dataset.deleteReading) {
    try {
      await deleteReading(b.dataset.deleteReading);
      await refreshLibrary();
      toast("Đã xóa bài đã lưu.");
    } catch (error) {
      toast(error.message);
    }
  }
};
$("#newReading").onclick = () => {
  sequence++;
  controller?.abort();
  releaseAudio();
  $("#readingResult").hidden = true;
  $("#readingInputView").hidden = false;
  refreshLibrary().catch((e) => toast(e.message));
  $("#readingText").focus();
};
$("#saveReading").onclick = async (e) => {
  if (!active) return;
  const documentToSave = active;
  e.currentTarget.disabled = true;
  try {
    active.result.sentenceIndex = index;
    active.result.showPinyin =
      $("#readingProse").classList.contains("show-pinyin");
    active.result.showTranslation =
      $("#readingProse").classList.contains("show-translation");
    const saved = await saveReading(documentToSave);
    if (active === documentToSave) active.id = saved.id;
    toast("Đã lưu bài và kết quả làm bài.");
  } catch (error) {
    toast(error.message);
  } finally {
    $("#saveReading").disabled = false;
  }
};
$("#playReading").onclick = () => (playing ? pause() : play());
for (const [id, step] of [
  ["previousSentence", -1],
  ["nextSentence", 1],
])
  $("#" + id).onclick = () => {
    pause();
    index += step;
    position();
    play();
  };
$("#repeatSentence").onclick = (e) => {
  repeat = !repeat;
  e.currentTarget.setAttribute("aria-pressed", String(repeat));
};
$("#readingSpeed").onchange = () => {
  if (playing) {
    pause();
    play();
  }
  $("#readingAudio").playbackRate = Number($("#readingSpeed").value);
};
for (const [id, name] of [
  ["togglePinyin", "show-pinyin"],
  ["toggleTranslation", "show-translation"],
])
  $("#" + id).onclick = (e) =>
    e.currentTarget.setAttribute(
      "aria-pressed",
      String($("#readingProse").classList.toggle(name)),
    );
$("#readingProse").onclick = (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  if (b.dataset.word) {
    pause();
    showWord(b.dataset.word).catch((error) => toast(error.message));
  }
  if (b.dataset.unknown) {
    pause();
    const d = $("#wordDialog");
    d.querySelector(".st-dialog-body").innerHTML =
      `<p class="st-detail-title" lang="zh-Hans">${esc(b.dataset.unknown)}</p><p class="st-help">Từ này chưa có trong kho học liệu hiện tại.</p><a class="st-button" href="tu-dien.html?word=${encodeURIComponent(b.dataset.unknown)}">Mở Từ điển để tra bổ sung</a>`;
    d.showModal();
  }
  if (b.dataset.listen !== undefined) {
    pause();
    index = Number(b.dataset.listen);
    play();
  }
};
$("#aiVoice").onclick = async (e) => {
  if (!active) return;
  const current = sequence;
  e.currentTarget.disabled = true;
  $("#readingAudioStatus").textContent = "Đang tạo giọng đọc AI…";
  try {
    const blob = await api(
      "speech",
      { text: active.sourceText },
      controller.signal,
    );
    if (current !== sequence) return;
    releaseAudio();
    audioUrl = URL.createObjectURL(blob);
    const audio = $("#readingAudio");
    audio.src = audioUrl;
    audio.hidden = false;
    audio.playbackRate = Number($("#readingSpeed").value);
    document
      .querySelectorAll(".is-active")
      .forEach((x) => x.classList.remove("is-active"));
    $("#readingAudioStatus").textContent =
      "Giọng tổng hợp AI của OpenAI · dùng thanh âm thanh để tua. Bản ghi này chưa có mốc thời gian từng câu.";
  } catch (error) {
    if (current === sequence)
      $("#readingAudioStatus").textContent = error.message;
  } finally {
    $("#aiVoice").disabled = false;
  }
};
window.addEventListener("study:speech-stop", () => {
  playing = false;
  $("#playReading").innerHTML = icon("play") + " Nghe tiếp";
});
$("#readingAudio").addEventListener("play", pause);
window.addEventListener("pagehide", () => {
  sequence++;
  controller?.abort();
  releaseAudio();
});
window.addEventListener("study:auth", (e) => {
  if (e.detail.previousUser && e.detail.previousUser !== e.detail.userId) {
    sequence++;
    controller?.abort();
    releaseAudio();
    active = null;
    $("#readingResult").hidden = true;
    $("#readingInputView").hidden = false;
  }
  refreshLibrary().catch(() => {});
});
await initShared();
await refreshLibrary().catch((e) => toast(e.message));
