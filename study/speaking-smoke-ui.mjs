import { getSession } from "./auth.mjs";
export function mountSpeakingSmoke(root, ownerId) {
  root.innerHTML = `<details><summary>Kiểm thử Speaking synthetic (tạm thời)</summary><p>Chỉ fixture đã phê duyệt; không bật Speaking hoặc scheduler. Credential và JWT test chỉ dùng trên server.</p><label>Chặng kiểm tra<select data-smoke-step><option value="preflight">Kết nối server / Drive private</option><option value="users">Tạo đúng hai tài khoản test</option><option value="upload">Upload audio synthetic</option><option value="process">Chuyển MP3 / archive Drive</option><option value="isolation">JWT owner isolation / Admin download</option><option value="cleanup">Cleanup media hết hạn</option><option value="delete_users">Xóa hai tài khoản sau rollback fixture</option></select></label><label>Fixture<select data-smoke-label><option value="a">A</option><option value="b">B</option></select></label><label>Lease ID fixture<input data-smoke-lease autocomplete="off"></label><label>Drive ID fixture khi retry<input data-smoke-drive autocomplete="off"></label><button type="button" class="st-button" data-smoke-run>Chạy chặng synthetic</button><pre data-smoke-result role="status" aria-live="polite"></pre></details>`;
  root.querySelector("[data-smoke-run]").onclick = async (e) => {
    const button = e.currentTarget,
      output = root.querySelector("[data-smoke-result]");
    button.disabled = true;
    output.textContent = "Đang kiểm tra…";
    try {
      const session = await getSession();
      if (session?.user.id !== ownerId) throw Error("ACCOUNT_CHANGED");
      const step = root.querySelector("[data-smoke-step]").value,
        body = { step };
      if (step === "process") {
        body.label = root.querySelector("[data-smoke-label]").value;
        body.lease_id = root.querySelector("[data-smoke-lease]").value.trim();
        const id = root.querySelector("[data-smoke-drive]").value.trim();
        if (id) body.drive_file_id = id;
      }
      const response = await fetch(
        location.hostname === "hanngubachhuu.github.io"
          ? "https://hanngubachhuu.vercel.app/api/recordings?action=smoke"
          : "./api/recordings?action=smoke",
        {
          method: "POST",
          headers: {
            Authorization: "Bearer " + session.access_token,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(110000),
        },
      );
      const result = await response.json();
      if ((await getSession())?.user.id !== ownerId)
        throw Error("ACCOUNT_CHANGED");
      output.textContent = JSON.stringify(result, null, 2);
    } catch {
      output.textContent =
        "Chưa hoàn tất kiểm tra. Giữ fixture để chẩn đoán; không bật Speaking.";
    } finally {
      if (button.isConnected) button.disabled = false;
    }
  };
}
