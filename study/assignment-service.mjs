import { getClient, getSession } from "./auth.mjs";

export async function assignmentCommand(command, payload = {}, ownerId) {
  const session = await getSession();
  if (!session || (ownerId && session.user.id !== ownerId))
    throw Error("ACCOUNT_CHANGED");
  const client = await getClient();
  const { data, error } = await client.rpc("assignment_command", {
    command,
    payload,
  });
  if (error) throw error;
  if ((await getSession())?.user.id !== session.user.id)
    throw Error("ACCOUNT_CHANGED");
  return data;
}

const messages = {
  ACCOUNT_CHANGED: "Tài khoản đã thay đổi. Mở lại bài bằng đúng tài khoản.",
  VERSION_CONFLICT:
    "Bài đã thay đổi ở tab hoặc thiết bị khác. Bản trên máy vẫn được giữ; đối chiếu trước khi tiếp tục.",
  SUBMISSION_LOCKED: "Bài đã nộp hoặc đã hết giờ, không thể sửa câu trả lời.",
  LESSON_ACCESS_REQUIRED:
    "Tài khoản chưa có quyền làm bài này hoặc quyền đã bị thu hồi.",
  ASSIGNMENT_UNAVAILABLE: "Bài này chưa mở nhận bài nộp.",
  PREVIEW_REQUIRED: "Hãy xem trước bản mới nhất trước khi công bố.",
  UNGRADED_QUESTIONS:
    "Còn câu chưa chấm. Hãy chấm đủ trước khi xem trước kết quả.",
  RECORDING_NOT_READY:
    "Bài nói chưa mở nộp vì hệ thống ghi âm đang được chuẩn bị.",
  INVALID_OPTIONS:
    "Các lựa chọn phải khác nhau, có mã riêng và chứa đáp án đúng.",
  INVALID_ANSWER_KEY: "Đáp án chưa hợp lệ cho dạng câu hỏi này.",
  INVALID_QUESTION: "Mã câu và nội dung câu hỏi không được để trống.",
  UNSUPPORTED_QUESTION_TYPE: "Dạng câu hỏi chưa được hỗ trợ.",
  INVALID_RUBRIC: "Rubric cần tiêu chí riêng, trọng số dương và tổng bằng 10.",
  INVALID_RUBRIC_SCORE: "Điểm tiêu chí phải nằm trong trọng số của rubric.",
  INVALID_QUESTIONS:
    "Chọn từ 1 đến 200 câu của cùng bài, không lặp lại một câu.",
  PUBLICATION_IMMUTABLE:
    "Kết quả đã công bố. Dùng chức năng chấm lại để tạo phiên bản mới.",
};
export function assignmentMessage(error) {
  if (error?.code === "PGRST202")
    return "Khu vực nộp bài chưa được mở trên máy chủ.";
  if (error?.code === "40001") return messages.VERSION_CONFLICT;
  return (
    messages[error?.message] ||
    "Chưa hoàn tất thao tác. Dữ liệu trên máy được giữ; kiểm tra kết nối rồi thử lại."
  );
}

// Escape text first, then mark Han runs without changing combining Vietnamese marks.
export function assignmentText(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
    .replace(/\p{Script=Han}+/gu, '<span lang="zh">$&</span>');
}
