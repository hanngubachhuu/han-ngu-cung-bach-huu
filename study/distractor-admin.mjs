import {
  DISTRACTOR_RULES,
  DISTRACTOR_RULE_VERSION,
  generateDistractors,
  generatorPrompt,
  generatorAnswer,
  inferGenerator,
  validateGeneratedQuestion,
} from "./distractor-generator.mjs";
import { assignmentMessage } from "./assignment-service.mjs";

export function mountDistractorGenerator(form) {
  const panel = document.createElement("details");
  panel.innerHTML = `<summary>Tự sinh đáp án nhiễu theo quy tắc tiếng Trung</summary>
    <p>Chọn ngữ cảnh đủ rõ. Hệ thống sinh 3 phương án sai có nghĩa và kiểm tra đáp án duy nhất theo quy tắc; câu ngoài phạm vi được giữ để soạn thủ công.</p>
    <label>Quy tắc<select data-generator-rule>${DISTRACTOR_RULES.map((r) => `<option value="${r.id}">${r.label}</option>`).join("")}</select></label>
    <label>Thông tin ngữ cảnh<input data-generator-target maxlength="120"><small data-generator-hint></small></label>
    <label>Nội dung đáp án đúng<input data-generator-correct maxlength="2000"></label>
    <div class="account-actions"><button type="button" class="st-button" data-generator-prompt>Dùng câu hỏi theo quy tắc</button><button type="button" class="st-button" data-generate>Sinh / sinh lại nhiễu</button><button type="button" class="st-button" data-generator-manual>Soạn thủ công</button></div>
    <p data-generator-status role="status" aria-live="polite"></p><div data-generator-preview></div>`;
  form.querySelector('[name="options"]').closest("label").before(panel);
  const field = (name) => form.elements.namedItem(name),
    node = (name) => panel.querySelector(`[data-generator-${name}]`);
  let spec = null,
    seed = 0,
    needsRegeneration = false;
  function status(message) {
    node("status").textContent = message;
  }
  function hint() {
    node("hint").textContent = DISTRACTOR_RULES.find(
      (r) => r.id === node("rule").value,
    ).hint;
  }
  function invalidate() {
    if (spec) {
      needsRegeneration = true;
      node("preview").replaceChildren();
      status(
        "Ngữ cảnh/đáp án đã đổi. Sinh lại nhiễu trước khi lưu phiên bản mới.",
      );
    }
  }
  for (const name of ["rule", "target", "correct"])
    node(name).addEventListener("input", () => {
      invalidate();
      hint();
    });
  for (const name of ["prompt", "answer", "kind"])
    field(name).addEventListener("input", invalidate);
  field("options").addEventListener("input", () => {
    node("preview").replaceChildren();
    status(
      "Đã sửa lựa chọn. Bộ cuối được kiểm tra theo quy tắc khi lưu; sinh lại để xem giải thích cho bộ mới.",
    );
  });
  node("prompt").onclick = () => {
    try {
      const rule = node("rule").value,
        target = node("target").value;
      const prompt = generatorPrompt(rule, target);
      if (
        field("prompt").value &&
        field("prompt").value !== prompt &&
        !window.confirm(
          "Thay nội dung câu hỏi hiện tại bằng câu có ngữ cảnh theo quy tắc?",
        )
      )
        return;
      field("prompt").value = prompt;
      node("correct").value = generatorAnswer(rule, target);
      spec = { rule, target };
      needsRegeneration = true;
      field("kind").value = "mcq";
      status(
        "Câu và đáp án đúng đã sẵn sàng. Bấm Sinh / sinh lại nhiễu để xem các lựa chọn.",
      );
    } catch (error) {
      status(assignmentMessage(error));
    }
  };
  panel.querySelector("[data-generate]").onclick = () => {
    try {
      const result = generateDistractors({
        kind: field("kind").value,
        rule: node("rule").value,
        target: node("target").value,
        correct: node("correct").value,
        prompt: field("prompt").value,
        seed,
      });
      field("options").value = result.options
        .map((o) => `${o.id} | ${o.text}`)
        .join("\n");
      field("answer").value = result.answer_key.value;
      spec = { rule: result.rule, target: result.target };
      seed++;
      needsRegeneration = false;
      node("preview").replaceChildren();
      for (const explanation of result.rationale) {
        const p = document.createElement("p");
        p.textContent = `${explanation.id} · ${explanation.code}: ${explanation.reason}`;
        node("preview").append(p);
      }
      status(
        "Đã sinh 3 nhiễu và trộn vị trí đáp án. Có thể sửa các lựa chọn; bộ cuối sẽ được kiểm tra khi lưu vào version mới.",
      );
    } catch (error) {
      status(assignmentMessage(error));
    }
  };
  node("manual").onclick = () => {
    if (
      spec &&
      !window.confirm(
        "Chuyển sang soạn thủ công? Bạn cần tự kiểm tra ngữ cảnh và đáp án duy nhất trước khi xuất bản.",
      )
    )
      return;
    spec = null;
    needsRegeneration = false;
    node("preview").replaceChildren();
    status(
      "Đang soạn thủ công. Generator không xác nhận ngữ nghĩa của câu ngoài quy tắc.",
    );
  };
  function reset() {
    spec = inferGenerator(field("prompt").value);
    seed = 0;
    needsRegeneration = false;
    node("preview").replaceChildren();
    if (spec) {
      node("rule").value = spec.rule;
      node("target").value = spec.target;
      node("correct").value = generatorAnswer(spec.rule, spec.target);
      status(
        "Nhận diện câu theo quy tắc. Sửa đáp án/ngữ cảnh cần sinh lại; bản cũ không bị thay đổi.",
      );
    } else
      status(
        "Chọn quy tắc và bổ sung ngữ cảnh để tự sinh. Không có quy tắc đủ chắc thì soạn thủ công.",
      );
    hint();
  }
  reset();
  return {
    reset,
    validate(question) {
      if (needsRegeneration && spec)
        throw Error("GENERATOR_REGENERATE_REQUIRED");
      const identified = spec || inferGenerator(question.prompt);
      if (identified) validateGeneratedQuestion(question, identified);
    },
    metadata(question) {
      const identified = spec || inferGenerator(question.prompt);
      return identified
        ? { ...identified, rule_version: DISTRACTOR_RULE_VERSION }
        : null;
    },
  };
}
