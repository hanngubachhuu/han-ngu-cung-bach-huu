export const ACCOUNT_STATES = Object.freeze({
  PENDING: {
    label: "Chờ duyệt",
    description:
      "Bách Hữu sẽ kiểm tra đăng ký và cấp quyền học phù hợp. Bạn có thể dùng các công cụ học công khai trong lúc chờ.",
  },
  APPROVED: {
    label: "Đã duyệt",
    description:
      "Tài khoản đã được duyệt. Các bài học được cấp xuất hiện trong khu vực học tập của bạn.",
  },
  SUSPENDED: {
    label: "Tạm ngưng",
    description:
      "Quyền vào bài học đang tạm ngưng. Liên hệ Bách Hữu để được hỗ trợ.",
  },
  REJECTED: {
    label: "Chưa được duyệt",
    description:
      "Đăng ký chưa được chấp nhận. Liên hệ Bách Hữu nếu bạn cần bổ sung thông tin.",
  },
});
export function accountState(profile) {
  return (
    ACCOUNT_STATES[profile?.status] || {
      label: "Chưa xác định",
      description: "Chưa tải được trạng thái tài khoản. Hãy thử kết nối lại.",
    }
  );
}
export function safeReturnPath(value, base) {
  try {
    const root = new URL(".", base),
      target = new URL(value || "tai-khoan.html", root);
    if (
      target.origin !== root.origin ||
      !target.pathname.startsWith(root.pathname) ||
      !/\.html$/.test(target.pathname)
    )
      return "tai-khoan.html";
    // Do not propagate credentials or authentication callback parameters.
    return (
      target.pathname +
      (target.searchParams.has("word")
        ? "?word=" + encodeURIComponent(target.searchParams.get("word"))
        : "")
    );
  } catch {
    return "tai-khoan.html";
  }
}
export function authMessage(error) {
  if (error?.code === "invalid_credentials")
    return "Chưa đăng nhập được. Kiểm tra lại email và mật khẩu.";
  if (error?.code === "email_not_confirmed")
    return "Email chưa được xác nhận. Mở thư xác nhận hoặc gửi lại bên dưới.";
  if (error?.status === 429 || /rate_limit/.test(error?.code || ""))
    return "Bạn đã thử nhiều lần. Vui lòng chờ vài phút rồi thử lại.";
  if (error?.code === "weak_password")
    return "Mật khẩu chưa đủ an toàn. Hãy chọn một mật khẩu dài và khó đoán hơn.";
  if (error?.code === "40001" || /VERSION_CONFLICT/.test(error?.message || ""))
    return "Dữ liệu đã được sửa ở nơi khác. Tải lại bản mới trước khi lưu; nội dung bạn đang nhập vẫn được giữ.";
  return "Chưa kết nối được. Kiểm tra mạng và thử lại; dữ liệu đã lưu vẫn được giữ.";
}
export function validatePassword(password, confirmation) {
  if (password.length < 12)
    return "Dùng ít nhất 12 ký tự; bạn có thể dùng một cụm từ dễ nhớ.";
  if (password.length > 128) return "Mật khẩu tối đa 128 ký tự.";
  if (password !== confirmation) return "Hai lần nhập mật khẩu chưa khớp.";
  return "";
}
export function mergeGuestLibrary(guest, remote) {
  const words = new Set(remote.words),
    characters = new Set(remote.characters),
    readings = new Map(remote.readings.map((r) => [r.id, r]));
  return {
    words: guest.words.filter((id) => !words.has(id)),
    characters: guest.characters.filter((c) => !characters.has(c)),
    readings: guest.readings.filter((r) => !readings.has(r.id)),
    conflicts: guest.readings.filter(
      (r) =>
        readings.has(r.id) &&
        (readings.get(r.id).sourceText !== r.sourceText ||
          readings.get(r.id).title !== r.title),
    ),
  };
}

// Content-addressed UUID: retrying an explicit guest import cannot make extra copies.
export async function importedReadingId(userId, reading) {
  const bytes = new Uint8Array(
    await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(
        JSON.stringify([
          userId,
          reading.id,
          reading.title,
          reading.sourceText,
          reading.result,
        ]),
      ),
    ),
  );
  bytes[6] = (bytes[6] & 15) | 80;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = [...bytes.slice(0, 16)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
