import { escapeHtml as esc } from "./core.mjs";
// Explicit confirmation with native dialog focus containment and Escape cancellation.
export function confirmAssignment({ title, message, action = "Xác nhận" }) {
  const previous = document.activeElement;
  const dialog = document.createElement("dialog");
  dialog.className = "assignment-dialog";
  dialog.setAttribute("aria-label", title);
  dialog.innerHTML = `<form method="dialog"><h2>${esc(title)}</h2><p>${esc(message)}</p><div class="account-actions"><button class="st-button" value="cancel" autofocus>Hủy</button><button class="st-button primary" value="confirm">${esc(action)}</button></div></form>`;
  document.body.append(dialog);
  return new Promise((resolve) => {
    dialog.addEventListener(
      "close",
      () => {
        const approved = dialog.returnValue === "confirm";
        dialog.remove();
        if (previous?.isConnected) previous.focus();
        resolve(approved);
      },
      { once: true },
    );
    dialog.showModal();
  });
}
