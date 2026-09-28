import { getClient, getSession } from "./auth.mjs";
import { escapeHtml as esc } from "./core.mjs";
const labels = {
  full_name: "Họ và tên",
  phone: "Số điện thoại",
  learning_goal: "Mục tiêu học tập",
};
async function request(action, body = {}) {
  const session = await getSession();
  if (!session) throw Error("AUTH_REQUIRED");
  const response = await fetch("./api/account?action=" + action, {
    method: action === "status" ? "GET" : "POST",
    headers: {
      Authorization: "Bearer " + session.access_token,
      "Content-Type": "application/json",
    },
    ...(action === "status" ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(60000),
  });
  if (!response.headers.get("content-type")?.includes("application/json"))
    throw Error("GOOGLE_NOT_CONFIGURED");
  const data = await response.json();
  if (!response.ok) {
    const error = Error(data.error);
    error.documentId = data.documentId;
    throw error;
  }
  return data;
}
function message(error) {
  return (
    {
      GOOGLE_NOT_CONFIGURED:
        "Chưa kết nối Google Docs cho website. Cần cấu hình OAuth phía máy chủ bằng tài khoản bachhuu1809@gmail.com.",
      GOOGLE_ACCOUNT_MISMATCH:
        "Tài khoản Google kết nối chưa đúng bachhuu1809@gmail.com.",
      GOOGLE_AUTH_FAILED:
        "Kết nối Google đã hết hạn hoặc bị thu hồi. Cần kết nối lại tài khoản bachhuu1809@gmail.com; dữ liệu trên website vẫn được giữ nguyên.",
      GOOGLE_DOCS_API_DISABLED:
        "Google Docs API chưa được bật cho dự án kết nối. Bật API trong Google Cloud rồi thử lại; không cần tạo lại tài khoản website.",
      GOOGLE_SCOPE_REQUIRED:
        "Kết nối Google chưa có quyền thao tác tài liệu của ứng dụng. Cần kết nối lại với quyền Google Drive dành riêng cho các tệp do ứng dụng tạo.",
      GOOGLE_RATE_LIMITED:
        "Google đang giới hạn số yêu cầu. Chờ ít phút rồi xem lại thay đổi trước khi đồng bộ.",
      GOOGLE_REVISION_OR_FORMAT_CONFLICT:
        "Tài liệu Google đã thay đổi hoặc có định dạng chưa hỗ trợ. Xem lại bản so sánh trước khi đồng bộ.",
      DOCUMENT_SERVICE_UNAVAILABLE:
        "Chưa liên lạc được với dịch vụ hồ sơ. Hãy tải lại trang và thử lại sau ít phút.",
      VERSION_CONFLICT:
        "Dữ liệu đã thay đổi. Xem lại bản so sánh mới trước khi đồng bộ.",
      SYNC_INCOMPLETE_REVIEW_REQUIRED:
        "Đồng bộ chưa hoàn tất giữa hai nơi. Hãy mở tài liệu và xem lại bản so sánh; hệ thống đã ghi nhận lỗi, không đánh dấu thành công.",
      UNRESOLVED_CONFLICT: "Chọn cách xử lý cho từng trường đang xung đột.",
    }[error.message] ||
    "Chưa xử lý được tài liệu. Kiểm tra kết nối và xem lại định dạng ba trường được phép sửa."
  );
}
export function mountDocumentConnection(root) {
  root.innerHTML =
    '<h2>Kết nối Google Docs</h2><p data-google-connection role="status"></p><button class="st-button" type="button">Kiểm tra lại kết nối</button>';
  const status = root.querySelector("[data-google-connection]");
  const button = root.querySelector("button");
  const check = async () => {
    button.disabled = true;
    status.textContent = "Đang kiểm tra tài khoản Google…";
    try {
      const result = await request("status");
      if (!root.isConnected) return;
      status.textContent = result.connected
        ? "Đã xác minh kết nối với bachhuu1809@gmail.com. Chọn học viên bên dưới để tạo hoặc đồng bộ hồ sơ."
        : "Chưa có kết nối Google hoạt động. Bạn vẫn có thể duyệt học viên và cấp bài trên website.";
    } catch (error) {
      if (root.isConnected) status.textContent = message(error);
    } finally {
      button.disabled = false;
    }
  };
  button.addEventListener("click", check);
  check();
}
export async function mountDocuments(root, student) {
  root.innerHTML =
    '<h3>Hồ sơ Google Docs</h3><p role="status">Đang kiểm tra kết nối…</p>';
  const setStatus = (text) => {
    const el = root.querySelector("[data-doc-status]");
    if (el) el.textContent = text;
  };
  try {
    const status = await request("status");
    if (!root.isConnected) return;
    if (!status.configured) {
      root.innerHTML =
        "<h3>Hồ sơ Google Docs</h3><p>" +
        message(Error("GOOGLE_NOT_CONFIGURED")) +
        "</p>";
      return;
    }
    const c = await getClient(),
      { data: doc, error } = await c
        .from("documents")
        .select("*")
        .eq("student_id", student.user_id)
        .maybeSingle();
    if (error) throw error;
    if (!root.isConnected) return;
    root.innerHTML = `<h3>Hồ sơ Google Docs</h3><p class="st-help">Đồng bộ họ tên, điện thoại và mục tiêu học. Quyền học và trạng thái duyệt do website quản lý.</p>${doc ? `<p><a href="https://docs.google.com/document/d/${encodeURIComponent(doc.google_document_id)}/edit" target="_blank" rel="noopener">Mở tài liệu ↗</a> · ${esc(doc.sync_status)}</p><button class="st-button" data-doc-preview>Xem thay đổi trước khi đồng bộ</button><div data-doc-plan></div>` : '<button class="st-button" data-doc-create>Tạo hồ sơ Google Docs riêng</button>'}<p data-doc-status class="account-feedback" role="status"></p>`;
    root
      .querySelector("[data-doc-create]")
      ?.addEventListener("click", async (e) => {
        e.currentTarget.disabled = true;
        setStatus("Đang tạo tài liệu riêng…");
        try {
          await request("create", { studentId: student.user_id });
          await mountDocuments(root, student);
        } catch (error) {
          setStatus(message(error));
          if (error.documentId) {
            const a = document.createElement("a");
            a.href =
              "https://docs.google.com/document/d/" +
              encodeURIComponent(error.documentId) +
              "/edit";
            a.textContent =
              "Tài liệu đã tạo nhưng chưa liên kết; giữ lại để kiểm tra.";
            a.target = "_blank";
            a.rel = "noopener";
            root.append(a);
          }
          e.target.disabled = false;
        }
      });
    root
      .querySelector("[data-doc-preview]")
      ?.addEventListener("click", async (e) => {
        e.currentTarget.disabled = true;
        setStatus("Đang đối chiếu hai bản…");
        try {
          const plan = await request("preview", { documentId: doc.id });
          if (!root.isConnected) return;
          const pane = root.querySelector("[data-doc-plan]");
          pane.innerHTML = `<form data-doc-sync class="account-form"><ul class="account-list">${Object.entries(
            labels,
          )
            .map(
              ([field, label]) =>
                `<li><strong>${label}</strong><br>Website: ${esc(plan.website[field] || "Trống")}<br>Google Docs: ${esc(plan.google[field] || "Trống")}${plan.conflicts.some((c) => c.field === field) ? `<label>Chọn bản giữ lại<select name="${field}" required><option value="">Chưa chọn</option><option value="website">Bản website</option><option value="google">Bản Google Docs</option></select></label>` : ""}</li>`,
            )
            .join(
              "",
            )}</ul><button class="st-button primary" type="submit">Áp dụng đồng bộ hai chiều</button></form>`;
          setStatus(
            plan.conflicts.length
              ? "Có xung đột. Chọn bản giữ lại cho từng trường trước khi áp dụng."
              : "Đã đối chiếu. Hãy kiểm tra nội dung trước khi áp dụng.",
          );
          pane.querySelector("form").onsubmit = async (event) => {
            event.preventDefault();
            event.submitter.disabled = true;
            try {
              await request("sync", {
                documentId: doc.id,
                profileVersion: plan.profileVersion,
                syncVersion: plan.syncVersion,
                googleRevision: plan.googleRevision,
                resolutions: Object.fromEntries(
                  new FormData(event.currentTarget),
                ),
              });
              await mountDocuments(root, student);
              setStatus("Đã đồng bộ và ghi nhật ký.");
            } catch (error) {
              setStatus(message(error));
              event.submitter.disabled = false;
            }
          };
        } catch (error) {
          setStatus(message(error));
        } finally {
          e.target.disabled = false;
        }
      });
  } catch (error) {
    root.innerHTML =
      "<h3>Hồ sơ Google Docs</h3><p>" + esc(message(error)) + "</p>";
  }
}
