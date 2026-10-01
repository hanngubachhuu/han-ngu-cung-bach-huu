import { getSession } from "./auth.mjs";
const status = document.querySelector("[data-checkpoint-status]");
let popup,
  origin,
  pending,
  ready = false;
async function call(body) {
  const s = await getSession();
  if (!s) throw Error("AUTH_REQUIRED");
  const response = await fetch("/api/speaking-checkpoint", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + s.access_token,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(110000),
  });
  const data = await response.json();
  if (!response.ok) throw Error(data.error);
  return data;
}
function deliver() {
  if (ready && pending) {
    popup.postMessage({ type: "synthetic-speaking-login", ...pending }, origin);
    pending = null;
    status.textContent =
      "Đã gửi thử thách đăng nhập một lần tới browser học viên synthetic.";
  }
}
window.addEventListener("message", (e) => {
  if (
    e.source === popup &&
    e.origin === origin &&
    e.data?.type === "synthetic-speaking-ready"
  ) {
    ready = true;
    deliver();
  }
});
for (const button of document.querySelectorAll("[data-step]"))
  button.onclick = async () => {
    button.disabled = true;
    status.textContent = "Đang thực hiện…";
    try {
      const data = await call({ step: button.dataset.step });
      status.textContent = JSON.stringify(data);
    } catch (e) {
      status.textContent = e.message;
    } finally {
      button.disabled = false;
    }
  };
for (const button of document.querySelectorAll("[data-login]"))
  button.onclick = async () => {
    button.disabled = true;
    ready = false;
    status.textContent = "Đang chuẩn bị đăng nhập synthetic…";
    popup = window.open("about:blank", "hnh-synthetic-speaking");
    try {
      pending = await call({ step: "login", label: button.dataset.login });
      origin = pending.studentOrigin;
      if (origin === location.origin) throw Error("CANARY_ORIGIN_NOT_ISOLATED");
      popup.location.href = origin + "/speaking-browser-student.html";
      deliver();
    } catch (e) {
      pending = null;
      status.textContent = e.message;
    } finally {
      button.disabled = false;
    }
  };
