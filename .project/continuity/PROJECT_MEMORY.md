# PROJECT MEMORY — HÁN NGỮ CÙNG BÁCH HỮU

Đây là durable memory của dự án, không phải nhật ký phiên.

## Identity

- Repository: hanngubachhuu/han-ngu-cung-bach-huu
- Product: nền tảng/web học tiếng Trung của Bách Hữu.
- Domain chính: HSK, HSKK, phát âm, Hán tự, từ điển, đọc hiểu, bài học, bài tập, tài khoản và quản trị.

## Product direction

- Học viên có thể tự đăng ký.
- Admin duyệt đăng ký.
- Quyền học được cấp theo lesson.
- Phạm vi hiện tại là một admin; chưa xây teacher-role nếu chưa được yêu cầu.
- Google Docs là managed editing surface cho phạm vi dữ liệu đã thiết kế.
- Supabase là thành phần backend chính cho Auth/Postgres/Private Storage theo kiến trúc hiện hành.
- Không tự thêm học liệu khi nguồn canonical dự kiến phải được bảo toàn.

## Architecture baseline đã quan sát khi bootstrap

- Source branch: main.
- GitHub Pages là deployment artifact do workflow tạo, không phải nơi phát triển.
- Vercel + Supabase là kiến trúc app/backend đang được repository mô tả.
- package.json hiện dùng Node 24.x, ESM, esbuild và các script build/test/validate.
- UI hiện là HTML/CSS/JavaScript thuần là nền tảng chính.
- data/lesson-manifest.js là manifest lesson dùng chung.
- data/lesson-registry.js là lớp registry/load/prepare/validate.
- server/ và api/ chứa logic phía máy chủ/API.
- supabase/ chứa phần database/deployment liên quan.
- study/ chứa các module học tập hiện hành.

## Access-control model

Luôn tách:
- authentication;
- authorization;
- lesson entitlement;
- UI visibility.

Login thành công không chứng minh quyền bài học chính xác.

## Data principle

Ưu tiên:
stable IDs → targeted changes → explicit migration → verification.

Không sửa triệu chứng trước khi xác định source of truth.

## Protected product principles

- Không redesign chức năng đang ổn chỉ vì sửa bug khác.
- Không tạo source of truth thứ hai.
- Không tạo patch chồng patch khi có thể sửa source.
- Không normalize toàn bộ lesson chỉ vì một lesson lỗi.
- Không đẩy private content/assets xuống public build.

## Bootstrap observations requiring reconciliation

Các điểm sau chỉ là tín hiệu quan sát, chưa phải kết luận:

1. lesson-registry.js ghi SCHEMA_VERSION = 1 trong khi logic prepare/validate dùng content structure mới; cần xác định schema contract chính thức.
2. Security architecture mô tả từ bài 4 trở đi private, trong khi lesson-manifest quan sát được có item bài 5+ với data path nhưng visibility flag không đồng nhất với bài 4; cần trace build + server + RLS trước khi kết luận.
3. Security/architecture docs còn chứa các đoạn mô tả pilot cũ; commit gần nhất cho thấy rollout đã tiến xa hơn. Cần phân loại stale/verified.
4. Production/deployment state phải được kiểm từ workflow/deployment hiện tại, không chỉ từ tài liệu.

## Not authoritative until reconciliation

- exact Supabase tables/columns;
- exact RLS policies;
- exact Google Docs mapping;
- exact public/private build inventory;
- exact lesson access runtime;
- exact deployment URLs/status;
- exact schema version transition;
- exact current working lesson baseline.

