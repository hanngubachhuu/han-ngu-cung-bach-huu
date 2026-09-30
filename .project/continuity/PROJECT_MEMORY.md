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


## 2026-09-30 — Verified reconciliation additions

These findings supersede conflicting bootstrap observations; see RECONCILIATION_REPORT.md for evidence/limits.

- Auth/profile/ADMIN and enrollment/student_lesson_access are existing shared infrastructure; no duplicate role/auth/enrollment system is needed.
- learning_attempts is the existing history owner. Current source is self_reported, populated by browser points via account_save_attempt/INSERT; it is not official grading or certificate eligibility.
- Source lesson visibility is not the full publication boundary. scripts/private-publication.mjs protects lessonNo > 3 and rewrites/removes private payloads in dist.
- Registry helper version and lesson payload versions differ. Native flat and wrapped DB content plus HSK2 client_view need adapter compatibility, not bulk rewrites.
- Google Docs is a server-side three-field profile editor; a separate recording Drive adapter/conversion/cleanup has not been implemented.
- User scope for this upgrade: automatic grading only student-account submissions within HSK/HSKK pathway assignments. Manual grading for open speaking/writing/translation. No AI grading or extension into unrelated practice tools.

- CP1 approved: history envelope plus linked private versions/submission/grading entities; self_reported cannot determine completion/graduation/certificates. Immutable historical version/snapshot, published-only learner scores, audited explicit regrade.
- Rollout ordering: compatible RPC loader on Vercel+Pages precedes raw content GRANT closure. protected_at remains set even when accepting new attempts is disabled. New private keys stay out of public Git.
- User's post-backup instruction requires a new explicit migration checkpoint confirmation; local foundation and backup are ready but production schema/code have not changed. Exact plan and evidence: docs/assignment-migrations.md.
