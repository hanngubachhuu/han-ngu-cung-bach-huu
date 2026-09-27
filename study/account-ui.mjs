import { getClient, getSession } from "./auth.mjs";
import { observeAccount, myProfile } from "./account-service.mjs";
import {
  accountState,
  authMessage,
  validatePassword,
} from "./account-core.mjs";
import { escapeHtml as esc } from "./core.mjs";

export function authMarkup({ dialog = false } = {}) {
  return `<div class="account-heading"><div><p class="st-eyebrow">HÁN NGỮ CÙNG BÁCH HỮU</p><h2 id="authTitle">Chào bạn trở lại</h2></div>${dialog ? '<button class="st-icon" id="authClose" aria-label="Đóng đăng nhập">×</button>' : '<span class="account-seal" lang="zh" aria-hidden="true">学</span>'}</div>
  <div id="authGuest"><p id="authIntro" class="st-help">Tiếp tục học và mở sổ tay của bạn trên mọi thiết bị.</p>
  <div class="account-tabs" role="group" aria-label="Chọn đăng nhập hoặc đăng ký"><button type="button" data-auth-mode="login" aria-pressed="true">Đăng nhập</button><button type="button" data-auth-mode="register" aria-pressed="false">Đăng ký học viên</button></div>
  <form id="authForm" class="account-form">
  <label id="authNameField" hidden>Họ và tên<input id="authName" name="name" autocomplete="name" maxlength="120" placeholder="Tên để Bách Hữu nhận ra bạn"></label>
  <label id="authEmailField">Email<input type="email" id="authEmail" name="email" autocomplete="email" maxlength="254" required placeholder="ban@example.com"></label>
  <label id="authPasswordField">Mật khẩu<span class="account-password"><input type="password" id="authPassword" name="password" autocomplete="current-password" maxlength="128" required><button type="button" id="authReveal" aria-label="Hiện mật khẩu" aria-pressed="false">Hiện</button></span></label>
  <label id="authConfirmField" hidden>Nhập lại mật khẩu<input type="password" id="authConfirm" autocomplete="new-password" maxlength="128"></label>
  <p id="authPasswordHint" class="st-help" hidden>Ít nhất 12 ký tự. Nên dùng một cụm từ riêng, dễ nhớ với bạn.</p>
  <p id="authApprovalNote" class="account-notice" hidden>Đăng ký → xác nhận email → chờ Bách Hữu duyệt. Quyền học sẽ được cấp theo khóa và từng bài.</p>
  <button class="st-button primary account-submit" id="authSubmit" type="submit">Đăng nhập</button>
  </form><div class="account-links"><button type="button" data-auth-mode="forgot">Quên mật khẩu?</button><button type="button" id="authResend">Gửi lại email xác nhận</button></div>
  <p class="account-fine">Email dùng để xác nhận tài khoản và khôi phục mật khẩu.</p></div>
  <div id="authSignedIn" hidden><p id="authEmailDisplay" class="account-email"></p><div id="authState" class="account-notice" role="status"></div><div class="account-actions"><a class="st-button primary" href="tai-khoan.html">Vào khu vực học tập →</a><button id="authRefresh" class="st-button" type="button">Kiểm tra trạng thái</button><button id="authSignout" class="st-button" type="button">Đăng xuất</button></div></div>
  <p id="authStatus" class="account-feedback" role="status" aria-live="polite" tabindex="-1"></p>`;
}

export async function initAccountUI(
  root,
  { dialog = false, initialMode = "login", onUpdate = () => {} } = {},
) {
  root.innerHTML = authMarkup({ dialog });
  if (!dialog) root.querySelector("#authSignedIn a").href = "#accountDashboard";
  const $ = (id) => root.querySelector("#" + id),
    form = $("authForm");
  let mode = "login",
    busy = false,
    generation = 0,
    recovery = false;
  const status = (message) => {
    $("authStatus").textContent = message;
  };
  function setMode(next) {
    mode = ["login", "register", "forgot", "reset"].includes(next)
      ? next
      : "login";
    const registering = mode === "register",
      resetting = mode === "reset",
      forgot = mode === "forgot";
    $("authTitle").textContent = {
      login: "Chào bạn trở lại",
      register: "Bắt đầu cùng Bách Hữu",
      forgot: "Lấy lại mật khẩu",
      reset: "Đặt mật khẩu mới",
    }[mode];
    $("authIntro").textContent = {
      login: "Tiếp tục học và mở sổ tay của bạn trên mọi thiết bị.",
      register: "Một tài khoản cho bài học, sổ từ và hành trình học của bạn.",
      forgot:
        "Nhập email đã đăng ký. Chúng mình sẽ gửi liên kết khôi phục nếu tài khoản tồn tại.",
      reset: "Chọn mật khẩu mới để tiếp tục học.",
    }[mode];
    for (const [id, show] of [
      ["authNameField", registering],
      ["authConfirmField", registering || resetting],
      ["authPasswordHint", registering || resetting],
      ["authApprovalNote", registering],
      ["authEmailField", !resetting],
      ["authPasswordField", !forgot],
    ])
      $(id).hidden = !show;
    $("authName").required = registering;
    $("authEmail").required = !resetting;
    $("authPassword").required = !forgot;
    $("authPassword").minLength = registering || resetting ? 12 : 1;
    $("authPassword").autocomplete =
      registering || resetting ? "new-password" : "current-password";
    $("authConfirm").required = registering || resetting;
    $("authSubmit").textContent = {
      login: "Đăng nhập",
      register: "Tạo tài khoản học viên",
      forgot: "Gửi liên kết khôi phục",
      reset: "Lưu mật khẩu mới",
    }[mode];
    for (const button of root.querySelectorAll("[data-auth-mode]"))
      button.setAttribute(
        "aria-pressed",
        String(button.dataset.authMode === mode),
      );
    status("");
  }
  function setBusy(value) {
    busy = value;
    form.setAttribute("aria-busy", String(value));
    for (const button of root.querySelectorAll("button"))
      if (button.id !== "authClose") button.disabled = value;
  }
  async function refresh() {
    const request = ++generation;
    try {
      const session = await getSession();
      if (request !== generation) return;
      const signedIn = !!session && !recovery;
      $("authGuest").hidden = signedIn;
      $("authSignedIn").hidden = !signedIn;
      $("authEmailDisplay").textContent = session?.user.email || "";
      if (signedIn) {
        $("authTitle").textContent = "Tài khoản học tập";
        $("authState").textContent = "Đang kiểm tra trạng thái…";
        const profile = await myProfile();
        if (request !== generation) return;
        const state = accountState(profile);
        $("authState").innerHTML =
          `<strong>${esc(state.label)}</strong><p>${esc(state.description)}</p>`;
        onUpdate({ session, profile });
      } else {
        onUpdate({ session: null, profile: null });
      }
    } catch (error) {
      if (request === generation) {
        $("authState").textContent =
          "Chưa tải được hồ sơ. Thử kiểm tra trạng thái lại.";
        status(authMessage(error));
        onUpdate({ session: null, profile: null, error });
      }
    }
  }
  root.addEventListener("click", (event) => {
    const target = event.target.closest("[data-auth-mode]");
    if (target && !busy) {
      recovery = false;
      setMode(target.dataset.authMode);
      $("authEmail").focus();
    }
  });
  $("authReveal").onclick = () => {
    const show = $("authPassword").type === "password";
    $("authPassword").type = show ? "text" : "password";
    $("authReveal").textContent = show ? "Ẩn" : "Hiện";
    $("authReveal").setAttribute("aria-pressed", String(show));
    $("authReveal").setAttribute(
      "aria-label",
      show ? "Ẩn mật khẩu" : "Hiện mật khẩu",
    );
  };
  if (dialog) {
    $("authClose").onclick = () => root.close();
    root.addEventListener("close", () => {
      $("authPassword").value = "";
      $("authConfirm").value = "";
      $("authPassword").type = "password";
      $("authReveal").textContent = "Hiện";
      $("authReveal").setAttribute("aria-pressed", "false");
    });
  }
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (busy) return;
    if (mode === "register" || mode === "reset") {
      const problem = validatePassword(
        $("authPassword").value,
        $("authConfirm").value,
      );
      if (problem) {
        status(problem);
        $("authConfirm").focus();
        return;
      }
    }
    const submittedMode = mode;
    setBusy(true);
    status("Đang xử lý…");
    try {
      const c = await getClient(),
        email = $("authEmail").value.trim(),
        password = $("authPassword").value;
      let result;
      if (mode === "login")
        result = await c.auth.signInWithPassword({ email, password });
      if (mode === "register")
        result = await c.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: $("authName").value.trim() },
            emailRedirectTo: new URL("tai-khoan.html", location.href).href,
          },
        });
      if (mode === "forgot")
        result = await c.auth.resetPasswordForEmail(email, {
          redirectTo: new URL("tai-khoan.html?mode=reset", location.href).href,
        });
      if (mode === "reset") {
        if (!recovery || !(await getSession()))
          throw Error("RECOVERY_REQUIRED");
        result = await c.auth.updateUser({ password });
      }
      if (result.error) throw result.error;
      $("authPassword").value = "";
      $("authConfirm").value = "";
      if (submittedMode === "forgot")
        status(
          "Nếu email này đã đăng ký, bạn sẽ nhận được liên kết khôi phục. Kiểm tra cả thư rác.",
        );
      if (submittedMode === "register")
        status(
          result.data.session
            ? "Đã tạo tài khoản. Đăng ký đang chờ Bách Hữu duyệt."
            : "Kiểm tra email xác nhận. Sau khi xác nhận, đăng ký sẽ được Bách Hữu xem xét.",
        );
      if (submittedMode === "login") {
        status("Đã đăng nhập.");
        await refresh();
      }
      if (submittedMode === "reset") {
        recovery = false;
        await c.auth.signOut();
        setMode("login");
        status("Đã đổi mật khẩu. Đăng nhập lại bằng mật khẩu mới.");
        await refresh();
      }
    } catch (error) {
      status(
        error.message === "RECOVERY_REQUIRED"
          ? "Liên kết khôi phục chưa hợp lệ hoặc đã hết hạn. Hãy yêu cầu liên kết mới."
          : authMessage(error),
      );
    } finally {
      setBusy(false);
    }
  });
  $("authSignout").onclick = async () => {
    setBusy(true);
    try {
      const c = await getClient(),
        { error } = await c.auth.signOut();
      if (error) throw error;
      recovery = false;
      setMode("login");
      await refresh();
      status("Đã đăng xuất.");
    } catch (e) {
      status(authMessage(e));
    } finally {
      setBusy(false);
    }
  };
  $("authRefresh").onclick = refresh;
  let resendAfter = 0;
  $("authResend").onclick = async () => {
    if (!$("authEmail").reportValidity()) return;
    if (Date.now() < resendAfter) {
      status("Vui lòng chờ một phút trước khi gửi lại.");
      return;
    }
    setBusy(true);
    try {
      const c = await getClient(),
        { error } = await c.auth.resend({
          type: "signup",
          email: $("authEmail").value.trim(),
          options: {
            emailRedirectTo: new URL("tai-khoan.html", location.href).href,
          },
        });
      if (error) throw error;
      resendAfter = Date.now() + 60000;
      status(
        "Nếu tài khoản đang chờ xác nhận, thư mới sẽ được gửi tới email của bạn.",
      );
    } catch (e) {
      status(authMessage(e));
    } finally {
      setBusy(false);
    }
  };
  window.addEventListener("study:auth", (event) => {
    if (event.detail.event === "PASSWORD_RECOVERY") {
      recovery = true;
      setMode("reset");
      if (dialog && !root.open) root.showModal();
    }
    if (event.detail.event === "SIGNED_OUT") {
      recovery = false;
      // Deferred provider events must not erase the password-reset confirmation.
      if (mode !== "login") setMode("login");
    }
    refresh();
  });
  setMode(initialMode === "reset" ? "forgot" : initialMode);
  try {
    await observeAccount();
    await refresh();
  } catch (e) {
    status(authMessage(e));
  }
  return { refresh };
}
