# Kiến trúc tài khoản và đồng bộ

Trạng thái 2026-09-28: giao diện tài khoản và quản trị đã phát hành qua PR #19, commit `31984de4328abb48a3b8012ae329a1fdaad5f0ab`. Xem [bằng chứng và giới hạn kiểm chứng](deployment.md) trước khi triển khai tiếp.

Giữ HTML/CSS/JavaScript thuần, Node 24, npm lockfile và esbuild. Không thêm framework, dịch vụ hàng đợi hoặc database thứ hai.

```mermaid
flowchart LR
  UI[Trang tài khoản / quản trị / bài học] --> Service[Account service / storage / attempt sync]
  Service --> Auth[Supabase Auth]
  Service --> DB[PostgreSQL + RLS + RPC]
  UI --> API[/api/account: xác minh JWT và ADMIN]
  API --> Sync[Document service: đối chiếu ba bản]
  Sync --> DB
  Sync --> Google[Google Docs adapter: OAuth phía máy chủ]
  Author[Nguồn bài học] --> Build[Build tách dữ liệu riêng]
  Build --> Public[dist: giao diện và engine]
  Build --> Private[.cache: nội dung và kế hoạch chuyển audio]
```

- `study/account-ui.mjs`: form chung, đăng nhập/đăng ký/xác nhận email/khôi phục/đăng xuất. Các công cụ và bài riêng dùng cùng Supabase client.
- `study/account-service.mjs`: truy vấn hồ sơ, quyền, quản trị; giao diện không quyết định quyền.
- `study/storage.mjs`: thư viện tài khoản, nhập dữ liệu khách có chủ ý, chống ghi đè bài đọc bằng version.
- `study/attempt-sync.mjs`: hàng đợi kết quả tự luyện theo user + lesson, retry có định danh ổn định, chống ghi đè phiên bản cũ. Bài đang làm vẫn lưu cục bộ; không hứa đồng bộ câu trả lời đang làm sang thiết bị khác.
- `server/document-service.mjs`: lệnh tạo/preview/sync; `server/document-sync.mjs`: quy tắc dữ liệu thuần; `server/google-docs-adapter.mjs`: giao tiếp Google.
- `scripts/private-publication.mjs`: tách LESSON bằng AST, giữ nguyên engine HSK 2; không đưa nội dung 24 bài riêng, revision bài riêng hoặc audio riêng vào dist.

Phân loại: bản thân hồ sơ/thư viện và quyền học nằm ở Supabase; Google Docs chỉ là lớp chỉnh sửa quản lý. Bộ máy bài học hiển thị dữ liệu được cấp qua RLS. Điểm từ trình duyệt luôn là `self_reported`, không dùng tự động cấp chứng nhận/quyền học.

Giới hạn có chủ ý: sync Docs do quản trị bấm đối chiếu và áp dụng; chưa có polling/webhook nền. Không có OAuth Google đăng nhập học viên giả lập. Xem [Google Docs](google-docs.md) và [khả năng chuyển nền tảng](portability.md).
