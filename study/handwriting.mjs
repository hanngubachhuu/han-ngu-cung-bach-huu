import { api, aiEnabled } from "./auth.mjs";
import { escapeHtml as esc, HAN } from "./core.mjs";
export class HandwritingRecognizer {
  async recognize(strokes, image, signal) {
    const data = await api("recognize", { strokes, image }, signal);
    if (!Array.isArray(data.candidates))
      throw Error("Kết quả nhận dạng không hợp lệ.");
    return [
      ...new Set(
        data.candidates.filter(
          (c) => typeof c === "string" && [...c].length === 1 && HAN.test(c),
        ),
      ),
    ].slice(0, 8);
  }
}
export class HandwritingCanvas {
  constructor(
    root,
    { recognizer = new HandwritingRecognizer(), onSelect } = {},
  ) {
    this.root = root;
    this.recognizer = recognizer;
    this.onSelect = onSelect;
    this.strokes = [];
    this.current = null;
    this.sequence = 0;
    this.abort = null;
    this.canvas = root.querySelector("canvas");
    this.ctx = this.canvas.getContext("2d");
    this.status = root.querySelector("[data-ink-status]");
    this.candidates = root.querySelector("[data-candidates]");
    this.events = new AbortController();
    const options = { signal: this.events.signal };
    this.enabled = aiEnabled;
    this.root.querySelector("[data-recognize]").disabled = !this.enabled;
    window.addEventListener(
      "study:capabilities",
      (e) => {
        this.enabled = e.detail.aiEnabled;
        this.root.querySelector("[data-recognize]").disabled = !this.enabled;
      },
      options,
    );
    this.canvas.addEventListener("pointerdown", (e) => this.down(e), options);
    this.canvas.addEventListener("pointermove", (e) => this.move(e), options);
    this.canvas.addEventListener("pointerup", (e) => this.up(e), options);
    this.canvas.addEventListener(
      "pointercancel",
      () => {
        this.current = null;
        this.redraw();
      },
      options,
    );
    root.querySelector("[data-undo]").addEventListener(
      "click",
      () => {
        this.invalidate();
        this.strokes.pop();
        this.redraw();
      },
      options,
    );
    root.querySelector("[data-clear]").addEventListener(
      "click",
      () => {
        this.invalidate();
        this.strokes = [];
        this.redraw();
      },
      options,
    );
    root
      .querySelector("[data-recognize]")
      .addEventListener("click", () => this.recognize(), options);
    this.candidates.addEventListener(
      "click",
      (e) => {
        const b = e.target.closest("[data-candidate]");
        if (b) this.onSelect?.(b.dataset.candidate);
      },
      options,
    );
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(this.canvas);
    this.resize();
  }
  point(e) {
    const r = this.canvas.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)),
      y: Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)),
      t: Math.round(e.timeStamp),
    };
  }
  invalidate() {
    this.sequence++;
    this.abort?.abort();
    this.candidates.replaceChildren();
    this.root.querySelector("[data-recognize]").disabled = !this.enabled;
  }
  down(e) {
    if (this.current || e.button > 0 || this.strokes.length >= 60) return;
    e.preventDefault();
    this.invalidate();
    this.pointer = e.pointerId;
    this.canvas.setPointerCapture(e.pointerId);
    this.current = [this.point(e)];
    this.redraw();
  }
  move(e) {
    if (!this.current || e.pointerId !== this.pointer) return;
    e.preventDefault();
    if (this.current.length < 512) this.current.push(this.point(e));
    this.redraw();
  }
  up(e) {
    if (!this.current || e.pointerId !== this.pointer) return;
    this.current.push(this.point(e));
    this.strokes.push(this.current);
    this.current = null;
    this.redraw();
  }
  resize() {
    const r = this.canvas.getBoundingClientRect();
    if (!r.width) return;
    this.canvas.width = Math.round(r.width * (devicePixelRatio || 1));
    this.canvas.height = Math.round(r.height * (devicePixelRatio || 1));
    this.redraw();
  }
  draw(ctx, size) {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = "#2c3e50";
    ctx.lineWidth = size / 65;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const stroke of [
      ...this.strokes,
      ...(this.current ? [this.current] : []),
    ]) {
      ctx.beginPath();
      stroke.forEach((p, i) =>
        i
          ? ctx.lineTo(p.x * size, p.y * size)
          : ctx.moveTo(p.x * size, p.y * size),
      );
      if (stroke.length === 1)
        ctx.lineTo(stroke[0].x * size + 0.1, stroke[0].y * size);
      ctx.stroke();
    }
  }
  redraw() {
    this.draw(this.ctx, this.canvas.width);
    this.status.textContent = this.strokes.length
      ? this.strokes.length + " nét · bấm Nhận dạng khi viết xong."
      : "Viết một chữ bằng chuột, bút hoặc ngón tay.";
    this.root.querySelector("[data-undo]").disabled = !this.strokes.length;
    this.root.querySelector("[data-clear]").disabled = !this.strokes.length;
  }
  async recognize() {
    if (!this.strokes.length) {
      this.status.textContent = "Hãy viết một chữ trước.";
      return;
    }
    this.invalidate();
    const sequence = this.sequence;
    this.abort = new AbortController();
    const button = this.root.querySelector("[data-recognize]");
    button.disabled = true;
    this.status.textContent = "Đang nhận dạng…";
    const image = document.createElement("canvas");
    image.width = image.height = 320;
    this.draw(image.getContext("2d"), 320);
    try {
      const candidates = await this.recognizer.recognize(
        structuredClone(this.strokes),
        image.toDataURL("image/png"),
        this.abort.signal,
      );
      if (sequence !== this.sequence) return;
      this.candidates.innerHTML = candidates
        .map(
          (c) =>
            `<button type="button" data-candidate="${esc(c)}" lang="zh-Hans">${esc(c)}</button>`,
        )
        .join("");
      this.status.textContent = candidates.length
        ? "Chọn chữ phù hợp. Kết quả AI có thể nhầm."
        : "Chưa nhận ra chữ. Thử viết rõ hơn hoặc gõ để tra.";
    } catch (e) {
      if (sequence === this.sequence && e.name !== "AbortError")
        this.status.textContent = e.message;
    } finally {
      if (sequence === this.sequence) button.disabled = false;
    }
  }
  destroy() {
    this.abort?.abort();
    this.observer.disconnect();
    this.events.abort();
  }
}
