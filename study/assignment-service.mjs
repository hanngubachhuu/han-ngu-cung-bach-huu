import { getClient, getSession } from "./auth.mjs";

export async function assignmentCommand(command, payload = {}, ownerId) {
  return authenticatedCommand("assignment_command", command, payload, ownerId);
}
export async function assignmentMakeup(command, payload = {}, ownerId) {
  return authenticatedCommand("assignment_makeup", command, payload, ownerId);
}
export async function assignmentAuthoring(command, payload = {}, ownerId) {
  return authenticatedCommand(
    "assignment_authoring",
    command,
    payload,
    ownerId,
  );
}
async function authenticatedCommand(rpc, command, payload, ownerId) {
  const session = await getSession();
  if (!session || (ownerId && session.user.id !== ownerId))
    throw Error("ACCOUNT_CHANGED");
  const client = await getClient();
  const { data, error } = await client.rpc(rpc, {
    command,
    payload,
  });
  if (error) throw error;
  if ((await getSession())?.user.id !== session.user.id)
    throw Error("ACCOUNT_CHANGED");
  return data;
}

const messages = {
  MAKEUP_NOT_AVAILABLE:
    "Chưa có lượt nộp bù cho bài này hoặc không còn câu bị thiếu.",
  MAKEUP_ALREADY_OPEN: "Bài đã có lượt nộp bù đang mở. Dùng đúng lượt đó.",
  MAKEUP_INCOMPLETE:
    "Còn câu nộp bù chưa được máy chủ nhận. Giữ trang mở và thử lưu lại.",
  MAKEUP_TRANSPORT_REQUIRED:
    "Admin đã mở nộp bù. Mở liên kết nộp bù để bổ sung câu còn thiếu.",
  UPLOAD_WINDOW_EXPIRED:
    "Lượt nộp bù đã hết hạn. Nhờ Admin mở lại những câu vẫn còn thiếu.",
  RECORDING_LOCKED:
    "Câu đã được nhận hoặc không thuộc lượt nộp bù; không thể thay câu trả lời.",
  RECORDING_REQUIRED: "Lưu bản ghi cho từng câu nói trước khi nộp bài.",
  RECORDING_EXPIRED:
    "Bản ghi đã hết hạn hoặc đã được dọn. Ghi lại và lưu trước khi nộp bài.",
  INVALID_RECORDING_REFERENCE:
    "Bản ghi chưa được xác nhận hoặc không thuộc câu này. Thử lưu lại đúng bản ghi.",
  AUDIO_PROCESSING: "MP3 đang được xử lý. Chờ bản ghi sẵn sàng trước khi chấm.",
  SPEAKING_VERSION_PINNED:
    "Bài nói phải được chấm theo đúng phiên bản học viên đã làm.",
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
  GENERATOR_CONTEXT_REQUIRED:
    "Chưa đủ ngữ cảnh để sinh nhiễu có nghĩa. Bổ sung dữ kiện đúng quy tắc hoặc soạn thủ công.",
  GENERATOR_UNSUPPORTED:
    "Dạng/ngữ cảnh này chưa có quy tắc sinh nhiễu đủ chắc. Không tự thêm lựa chọn ngẫu nhiên.",
  GENERATOR_PROMPT_CHANGED:
    "Câu hỏi chưa khớp ngữ cảnh đã chọn. Dùng câu hỏi theo quy tắc hoặc soạn thủ công.",
  GENERATOR_KEY_CHANGED:
    "Đáp án đúng không khớp ngữ cảnh. Kiểm tra câu và đáp án, rồi sinh lại nhiễu.",
  GENERATOR_INVALID_DISTRACTOR:
    "Nhiễu bị trùng, là cách nói tương đương, hoặc không thuộc dạng từ/câu có nghĩa của quy tắc này.",
  GENERATOR_REGENERATE_REQUIRED:
    "Ngữ cảnh/đáp án đã đổi. Sinh lại nhiễu trước khi lưu version mới.",
  INVALID_IMPORT_JSON:
    "Tệp chưa đúng định dạng hnh-question-import-v1. Chỉ nhận JSON dữ liệu, không thực thi JavaScript.",
  IMPORT_TOO_LARGE:
    "Gói nhập vượt quá 8 MiB. Chia thành các gói tối đa 200 câu.",
  IMPORT_LESSON_MISMATCH:
    "Mã bài trong tệp khác bài đang chọn. Chọn đúng bài trước khi nhập.",
  INVALID_SOURCE:
    "Cần nguồn, định danh nguồn, phiên bản nguồn và mã câu gốc hợp lệ.",
  INVALID_SOURCE_PARENT: "Không tìm thấy phiên bản gốc trong bài đang chọn.",
  AUTHORING_PENDING_CHANGED:
    "Lần lưu câu trước chưa có xác nhận. Kiểm tra/thử lại đúng yêu cầu đó trước khi tạo câu khác.",
  ARCHIVE_REASON_REQUIRED:
    "Nhập lý do archive hoặc khôi phục quyền chọn phiên bản.",
  QUESTION_ARCHIVED:
    "Một phiên bản câu đã lưu trữ. Bỏ khỏi đề mới hoặc khôi phục quyền chọn phiên bản đó.",
  IDEMPOTENCY_CONFLICT:
    "Mã yêu cầu đã dùng cho nội dung khác. Tải lại ngân hàng để đối chiếu trước khi thử lại.",
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
