// Presentation adapter only: keep the established form payload and version semantics.
import { escapeHtml as esc } from "./core.mjs";
export function mountQuestionFields(form) {
  const field = (name) => form.elements.namedItem(name);
  const options = field("options"),
    answer = field("answer"),
    kind = field("kind");
  const optionsLabel = options.closest("label"),
    answerLabel = answer.closest("label");
  const box = document.createElement("div");
  box.dataset.questionChoices = "";
  optionsLabel.after(box);
  function render() {
    const mcq = kind.value === "mcq";
    optionsLabel.hidden =
      mcq ||
      [
        "speaking",
        "writing",
        "translation",
        "true_false",
        "text_fill",
        "multi_fill",
      ].includes(kind.value);
    answerLabel.hidden =
      mcq ||
      ["speaking", "writing", "translation", "true_false"].includes(kind.value);
    field("rubric_version_id").closest("label").hidden = ![
      "speaking",
      "writing",
      "translation",
    ].includes(kind.value);
    box.hidden = !mcq && kind.value !== "true_false";
    box.replaceChildren();
    if (kind.value === "true_false") {
      box.innerHTML = `<label>Đáp án đúng<select data-key-choice><option value="">Chọn đáp án đúng</option><option value="true" ${answer.value === "true" ? "selected" : ""}>Đúng</option><option value="false" ${answer.value === "false" ? "selected" : ""}>Sai</option></select></label>`;
      box.querySelector("select").onchange = (e) => {
        answer.value = e.target.value;
        answer.dispatchEvent(new Event("input", { bubbles: true }));
      };
      return;
    }
    if (!mcq) return;
    const choices = options.value
      .split("\n")
      .filter((s) => s.trim())
      .map((line) => {
        const index = line.indexOf("|");
        return {
          id: line.slice(0, index).trim(),
          text: line.slice(index + 1).trim(),
        };
      });
    if (!choices.length)
      choices.push(
        { id: "A", text: "" },
        { id: "B", text: "" },
        { id: "C", text: "" },
        { id: "D", text: "" },
      );
    box.innerHTML = `<h4>Các lựa chọn</h4>${choices.map((o, i) => `<label>Lựa chọn ${i + 1}<textarea rows="2" maxlength="2000" data-option-choice="${esc(o.id)}">${esc(o.text)}</textarea></label>`).join("")}<button type="button" class="st-button" data-add-choice ${choices.length >= 8 ? "disabled" : ""}>+ Thêm lựa chọn</button><label>Đáp án đúng<select data-key-choice><option value="">Chọn đáp án đúng</option>${choices.map((o, i) => `<option value="${esc(o.id)}" ${o.id === answer.value ? "selected" : ""}>${esc(o.text || "Lựa chọn " + (i + 1))}</option>`).join("")}</select></label>`;
    box.querySelector("[data-add-choice]").onclick = () => {
      const id = [..."ABCDEFGH"].find(
        (id) => !choices.some((o) => o.id === id),
      );
      if (!id || choices.length >= 8) return;
      options.value =
        [...box.querySelectorAll("[data-option-choice]")]
          .map((n) => n.dataset.optionChoice + " | " + n.value.trim())
          .join("\n") +
        "\n" +
        id +
        " | ";
      options.dispatchEvent(new Event("input", { bubbles: true }));
      render();
    };
    for (const input of box.querySelectorAll("[data-option-choice]"))
      input.oninput = () => {
        options.value = [...box.querySelectorAll("[data-option-choice]")]
          .filter((n) => n.value.trim())
          .map((n) => n.dataset.optionChoice + " | " + n.value.trim())
          .join("\n");
        options.dispatchEvent(new Event("input", { bubbles: true }));
        for (const option of box.querySelector("select").options) {
          const input = [...box.querySelectorAll("[data-option-choice]")].find(
            (n) => n.dataset.optionChoice === option.value,
          );
          if (input)
            option.textContent =
              input.value ||
              "Lựa chọn " +
                ([...box.querySelectorAll("[data-option-choice]")].indexOf(
                  input,
                ) +
                  1);
        }
      };
    box.querySelector("select").onchange = (e) => {
      answer.value = e.target.value;
      answer.dispatchEvent(new Event("input", { bubbles: true }));
    };
  }
  kind.addEventListener("change", render);
  form.addEventListener("question:changed", render);
  render();
  return { render };
}
export function mountRubricFields(form) {
  const raw = form.elements.namedItem("criteria");
  raw.closest("label").hidden = true;
  const box = document.createElement("div");
  raw.closest("label").after(box);
  const criteria = [
    { label: "Nội dung", weight: 6 },
    { label: "Ngữ pháp", weight: 4 },
  ];
  function save() {
    raw.value = criteria.map((c) => c.label + " | " + c.weight).join("\n");
    box.querySelector("[data-weight-total]").textContent =
      `Tổng: ${criteria.reduce((sum, c) => sum + Number(c.weight || 0), 0)} / 10 điểm`;
  }
  function render() {
    box.innerHTML =
      criteria
        .map(
          (c, i) =>
            `<div class="assignment-question"><label>Tiêu chí ${i + 1}<input data-criterion-label="${i}" value="${esc(c.label)}" maxlength="120" required></label><label>Điểm tối đa<input data-criterion-weight="${i}" value="${c.weight}" type="number" min="0.01" max="10" step="0.01" required></label><button class="st-button" type="button" data-remove-criterion="${i}">Bỏ tiêu chí</button></div>`,
        )
        .join("") +
      '<p data-weight-total role="status"></p><button type="button" class="st-button" data-add-criterion>+ Thêm tiêu chí</button>';
    for (const input of box.querySelectorAll("input"))
      input.oninput = () => {
        if (input.dataset.criterionLabel !== undefined)
          criteria[Number(input.dataset.criterionLabel)].label = input.value;
        else
          criteria[Number(input.dataset.criterionWeight)].weight = input.value;
        save();
      };
    for (const button of box.querySelectorAll("[data-remove-criterion]"))
      button.onclick = () => {
        criteria.splice(Number(button.dataset.removeCriterion), 1);
        render();
      };
    box.querySelector("[data-add-criterion]").onclick = () => {
      criteria.push({ label: "", weight: 1 });
      render();
    };
    save();
  }
  render();
}
