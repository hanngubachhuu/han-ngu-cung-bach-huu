# Checkpoint 1 — migration và rollout bài nộp chính thức

Ngày 30/09/2026, Asia/Bangkok. CP1 đã được người dùng duyệt cùng ba nguyên tắc về history, nguồn điểm và version bất biến. Tài liệu này là hồ sơ trình bày **trước khi chạy production**. Ba migration mới hiện chưa chạy trên production. Không sửa migration production cũ.

## Danh sách migration, đúng thứ tự

| File mới | Mục đích |
|---|---|
| `20260930074239_official_assignment_model.sql` | Course HSK/HSKK, envelope history, 9 bảng con, RLS, bất biến lịch sử, view điểm chính thức |
| `20260930074240_official_assignment_commands.sql` | Commands làm bài/chấm/đề; server timer/scoring; preview/publish; regrade và audit |
| `20260930074242_official_assignment_legacy_boundary.sql` | Bảo vệ official khỏi API tự luyện; khóa raw content; getter tương thích và chỉ đọc điểm đã công bố |

Các file được tạo bằng CLI `migration new`. Production đang có 33 mục lịch sử, trong khi checkout có 14 migration cũ và 3 file mới: **không dùng `db push`, `reset` hay repair để ép hai danh sách giống nhau**. Khi thực thi, áp dụng đúng nội dung ba file mới, ghi lại version/name/checksum mà production đăng ký. Không replay các migration cũ.

## Bảng/cột/constraint thay đổi

| Entity | Thay đổi cụ thể | Ảnh hưởng |
|---|---|---|
| `courses` | Thêm `program text NOT NULL DEFAULT 'HSK'`, check HSK/HSKK. Unique `level` → `(program,level)` | HSK/HSKK cùng cấp có thể cùng tồn tại. Giữ ID hsk1/hsk2 |
| `lesson_content` | Unique `(level,lesson_no)` → `(course_id,lesson_no)` | Giữ ID, course FK, content và visibility |
| `learning_attempts` | Source cho phép self_reported/official; `score/max_score/submitted_at` nullable có check theo source | Self_reported vẫn bắt buộc đủ điểm/timestamp. Official draft chưa có điểm; max=100 chỉ khi công bố. Không thêm answers, rubric, snapshot hay nội dung chấm vào đây |
| `enrollments`, `student_lesson_access`, `profiles` | Không thêm hệ thống thay thế | Commands sử dụng quyền duyệt/enrollment/quyền bài hiện có |
| `audit_logs` | Giữ schema; commands thêm event `assignment.*` | Actor/đối tượng/lý do/phiên bản và thay đổi điểm được ghi khi có thao tác |

Bảng mới, tất cả có FK/constraint/index phù hợp:

| Bảng | Trách nhiệm và cột chính |
|---|---|
| `assignment_rubric_versions` | rubric_key/version/kind, criteria/trọng số, actor/time; append-only |
| `assignment_question_versions` | lesson/question_key/version, kind/prompt/options/key/explanation/tip, rubric version, max10, actor/publication |
| `assignment_versions` | Version đề, title/time_limit, draft/published, preview/publish metadata |
| `assignment_version_questions` | Version đề → version câu và thứ tự |
| `lesson_assignments` | Con trỏ đề hiện tại, enabled, protected_at. Tắt nhận bài không mở lại raw key |
| `submission_details` | PK/FK learning_attempts.id; đề được pin, state/revision, start/deadline/duration/timeout |
| `submission_answers` | Attempt + question version, thứ tự, prompt snapshot allowlist, câu trả lời |
| `submission_results` | Revision chấm, draft/published, edit/preview versions, lý do, raw/max/normalized, actor/time |
| `submission_grades` | Original question + grading question + rubric version, điểm/criteria/feedback, phương thức và người chấm |

`official_learning_results` là view `security_invoker=true`, lấy riêng source=official, submission đã nộp và revision kết quả Published mới nhất. Admin dùng view này cho business rule mới; không dùng bảng history tổng hợp hoặc self_reported. Completion/graduation/certificate **chưa triển khai** trong CP1, phải dùng nguồn này ở phase sau.

## RLS, GRANT và API

- 9 bảng mới bật RLS. Policy `assignment_admin_read` cho SELECT của APPROVED ADMIN. Học viên SELECT trực tiếp không thấy các dòng này; anon không có quyền. Authenticated (kể cả ADMIN) không có trực tiếp INSERT/UPDATE/DELETE.
- Learner chỉ nhận projection qua `assignment_command`: STUDENT/APPROVED, đúng owner, course program HSK/HSKK, enrollment và quyền bài còn hiệu lực. Admin không tạo attempt học viên qua start. Các truy vấn catalog/history/queue phân trang 20.
- `attempts_insert`: chỉ self_reported của owner có quyền, client ID không thuộc namespace official. `account_save_attempt` giữ signature cũ nhưng chặn mọi official ID/row. Không tin điểm/timer do browser gửi.
- `attempts_read`: ADMIN hoặc owner của self_reported/official đã Published. Draft official được đọc bằng projection RPC, không dùng parent SELECT làm kênh lộ điểm.
- `lesson_content`: giữ RLS quyền bài hiện có, thu hồi SELECT bảng và cột content của PUBLIC/anon/authenticated; cấp SELECT các cột metadata. `get_private_lesson_content` giữ signature, kiểm quyền qua internal helper. Bài từng bật official trả marker để mở workspace nộp bài, không trả raw keys; các bài legacy tiếp tục trả học liệu được cấp.
- Public RPC là invoker; code cần đặc quyền nằm trong schema `account_internal`, fixed search_path, hạn chế EXECUTE, kiểm identity/role/ownership tại DB. Các helper finish/read/score không được gọi trực tiếp từ client.
- Trigger chặn sửa/xóa version, answers đã nộp, published grades/results; chặn thêm thành viên vào đề Published, thêm answers sau nộp hoặc thêm grade vào publication cũ.
- Question/key mới không đưa vào repository PUBLIC. Bí mật của học liệu từng public không thể được khôi phục chỉ bằng RLS.

## Data migration/backfill

Chỉ gán `program='HSK'` cho course hiện có qua default. Không chuyển self_reported thành official, không sửa score/max/timestamp/version/ID cũ; không backfill submission giả; không nhập hoặc tự xuất bản đề, rubric, HSKK hay điểm. Không bật bài hiện tại. Các bảng official bắt đầu rỗng.

Preflight production đã kiểm tra read-only: 2 profiles, 4 enrollments, 26 grants, 24 lessons, 3 attempts; hash tập history `70baf5db371f37eea4b88b5154a2b200`. Constraint names khớp; lesson course_id không NULL, không trùng course_id/lesson_no. Các giá trị này là mốc kiểm tra, phải chụp lại ngay trước DDL nếu có hoạt động mới.

## Ảnh hưởng dữ liệu và rollout

1. Backup đã được người dùng chấp thuận rõ ngày 30/09/2026, sau lần automatic review từ chối ban đầu. File cục bộ `.cache/backups/assignment-before-20260930.json` chứa đủ 7 bảng yêu cầu và thêm 12 dòng audit_logs. Snapshot lúc 18:30:42 Asia/Bangkok (11:30:42 UTC); SHA-256 `3d34e12f952fd43aedd823ac76ad7ff4adc35e92e5ffb218e693bfa7f528d104`. `.gitignore:7` bỏ qua toàn bộ `.cache/`; file không tracked, không commit/push. Không export Auth password/session/token hay Google credentials; quét cấu trúc và mẫu secret trước khi ghi không phát hiện candidate.
2. Backup đã đọc/parse và restore vào PostgreSQL cục bộ thành công. Áp dụng ba migration mới lên bản restore giữ nguyên các dòng history/content/profiles/enrollment/grants/assets/audit; course chỉ thêm program HSK; quyền bài đúng như trước; SELECT content trực tiếp bị chặn; getter legacy tương thích; official activation=0. Evidence cục bộ ignored: `assignment-restore-report.json`. Đây là rehearsal dữ liệu thực trên PostgreSQL WASM, không phải hosted staging hay restore toàn bộ Supabase Auth/media. Chụp lại preflight ngay trước DDL nếu production có phát sinh mới.
3. Phát hành code tương thích trước: loader gọi RPC vốn đã tồn tại, account queries chỉ metadata, Admin/học viên xử lý máy chủ chưa có RPC mới. Xác nhận deployed hashes trên Vercel và Pages. Không chạy migration3 khi live loader vẫn SELECT raw content.
4. Áp dụng ba migration mới theo thứ tự, mỗi migration trong transaction; kiểm tra thành công trước bước kế tiếp. Nếu lỗi, rollback transaction hiện tại; không sửa/xóa file đã được đăng ký production, sửa bằng migration mới.
5. Kiểm postflight: history/lesson/grants/enrollment nguyên vẹn, course chỉ thêm program; không có official activation; RLS/GRANT/RPC đúng; schema cache đã reload. Kiểm advisors và phân biệt cảnh báo cũ với lỗi mới.
6. Sau đó mới nhập một đề có provenance, Admin preview→publish→enable pilot rõ ràng. Migration không tự mở nộp cho cả 24 bài. Học liệu HSKK/rubric thật cần đối chiếu, không bịa để lấp khóa.

Tab cũ đọc raw content sẽ cần tải lại sau thay đổi GRANT. Bản mới tiếp tục hỗ trợ bài legacy. Bài đã bật official luôn giữ protected_at kể cả khi tắt; không đánh đổi key privacy khi rollback vận hành.

## Rollback strategy

- Trước commit của một migration: rollback transaction thất bại; các migration trước đã thành công giữ nguyên.
- Sau rollout: tắt `lesson_assignments.enabled` để ngừng start mới (Admin command có audit); giữ bài đang làm/history/answers/điểm/feedback/audit và các version đã dùng. Không DROP bảng, DELETE dữ liệu hay chuyển official về self_reported.
- Rollback UI chỉ về bản tương thích getter RPC. Không quay về loader SELECT content, không mở lại raw key hoặc unpublished grade.
- Schema lỗi sau commit: tạo migration sửa mới, ưu tiên roll-forward. Không hoàn nguyên uniqueness nếu đã có HSKK cùng level/lesson_no; không ép lại NOT NULL khi draft official đang tồn tại.
- Sao lưu là khả năng phục hồi khi cần, không tự ghi đè database đang có bài nộp mới. Nếu cần restore production, phải xác định mốc/thay đổi phát sinh/phạm vi cụ thể trước khi thực hiện. Không dùng restore như rollback thường ngày.

## Test plan và bằng chứng

Đã chạy local: 72 tests toàn dự án pass, bao gồm 5 tests autosave/race/reload/conflict/storage và 15 scenario DB+parent test. DB tests áp dụng cả ba migration mới lên dữ liệu legacy, kiểm guest/PENDING/hai học viên/admin/revoked; direct REST-equivalent SELECT/DML/private RPC; source forgery; immutable versions/snapshots; 6 dạng objective; rubric; preview invalidation; publish; key change/regrade/audit; HSKK enrollment; deadline/late input/idempotency. Chuẩn hóa đã kiểm 48/60→80 và 18/20→90.

Lint/build/validate đã pass. Browser Chromium với mocked providers đã pass: học viên autosave→offline/reload→submit→chờ; Admin rubric→preview→publish→regrade; học viên thấy publication cũ khi regrade draft; injection được escape; 390/768/1366px không overflow; official gate không mở legacy engine. Hồi quy account responsive và 23 private lesson engines pass. CI đã thêm script browser mới.

Trước/ sau release phải chạy lại checks khi code thay đổi; production verify counts/hashes/ACL/roles/query và live payload/bytes. Browser mock không chứng minh hosted Supabase concurrency hoặc thiết bị thật Safari/iPhone. Test deadline dùng clock fixture local; production chưa có job tự chốt bài offline trong background: deadline luôn kiểm trên server, draft quá hạn được chốt ở lần get/save/submit kế tiếp. Cần thêm job trước khi tuyên bố queue tự cập nhật mọi bài quá hạn khi không còn client.

## Phạm vi còn lại

CP1 foundation có UI tạo rubric/câu/version đề, preview/publish/enable và chấm/regrade. Editor đầy đủ (duplicate/archive/order/rollback UX/distractor validation/import có provenance), speaking/MP3/Drive/cleanup (CP2), course lifecycle/eligibility/graduation và certificate/public verify (CP3) còn tiếp tục. Bài có speaking bị chặn bật nộp tới khi CP2 sẵn; không có upload giả, AI chấm, public audio hay public certificate endpoint trong gói này.

Editor continuation: sửa/nhân bản câu bằng phiên bản mới, chọn xuyên trang (tối đa 200), thay version cùng mã tại chỗ, tăng/giảm thứ tự, bỏ câu khỏi đề nháp, phục hồi đề cũ bằng nháp mới và validation lựa chọn trùng đã triển khai. Dùng đúng RPC cũ, không có migration mới hoặc thay đổi RLS. Lưu khóa controls trong lúc gửi để tránh mất sửa mới. Lịch sử/version/results cũ không bị viết lại; phục hồi không tự publish hoặc regrade. 4 tests model/parser và browser editor xuyên hai trang/ordered payload/edit/copy/restore bổ sung; tổng 76 tests. Archive và import có provenance vẫn còn, không gọi editor phase hoàn tất chỉ từ những chức năng này.

## Gate cập nhật theo yêu cầu người dùng

Gate sau backup đã được người dùng xác nhận trực tiếp: cho phép chạy cả ba migration theo thứ tự và minimum production smoke, tiếp tục phase tiếp theo khi PASS. Đã kiểm tra chỉ có project production, branches rỗng; người dùng không yêu cầu tạo staging mới. Không reset/drop/Auth mutation. Deploy/verify compatible loader trước khi migration3 đóng quyền raw content; kiểm từng migration và smoke trước feature expansion. Thử production bằng fixture tổng hợp trong transaction rollback, không dùng học viên thật làm dữ liệu bài nộp thử.

## Production rollout verified — 30/09/2026

PR #22 đã merge thành `72f5520d81808bc965a330e8d0f8b86d073adf3c`. CI và deployment thành công; loader/service/student/Admin bytes khớp trên cả Vercel và Pages trước DDL (12:43:35 UTC).

| Local filename version | Production registry version | Name |
|---|---|---|
| 20260930074239 | 20260930124349 | official_assignment_model |
| 20260930074240 | 20260930124401 | official_assignment_commands |
| 20260930074242 | 20260930124415 | official_assignment_legacy_boundary |

MCP đăng ký timestamp khi áp dụng; nội dung đúng ba file đã duyệt. Không repair/đổi lịch sử để ép timestamp local bằng production. Cả ba thành công theo thứ tự. 8 bảng backup giữ nguyên số dòng và hash toàn bộ cột cũ, course chỉ thêm program HSK. Official entities/activation=0 sau smoke; không còn fixture. Evidence chỉ chứa counts/hashes ở `.cache/assignment-production-verification.json`, không commit backup hay dữ liệu học viên.

Smoke SQL `supabase/operations/assignment_production_smoke.sql` đã rehearsal trên bản restore và chạy production thành công, toàn bộ fixture/audit rollback. Kiểm thực tế role anon/authenticated, identity approved student/Admin, owner isolation, private key/draft result, student grade/publish/question/DML denial, fixed search_path/helper grants, draft/save/submit/version snapshot, objective/manual rubric, preview/publish/regrade/audit, self_reported exclusion, legacy getter và source forgery. Isolation dùng một identity khác không tạo Auth account; đây là DB role/context test, không phải hai session JWT đăng nhập thật.

REST gateway anonymous trả 401/42501 cho assignment RPC, question keys, grades và raw content; Auth settings 200. Browser production với phiên Admin thật xác nhận account dashboard, Admin, Google status, assignment bank qua REST và bài HSK1 cũ qua getter. Student submit production được chứng minh qua public SQL RPC cùng DB role; UI flow student dùng isolated browser mock. Không thay đổi Auth và không ghi bài thử của học viên thật.

Security advisor không có finding mới của assignment. Hai finding có sẵn vẫn giữ nguyên: source cache RLS không policy (INFO), leaked-password protection disabled (WARN). Không mở raw key để giải quyết warning. Phần editor tiếp tục sau smoke PASS; vẫn chưa nhập/activate bài thật, CP2/CP3 và background deadline sweeper còn riêng.

| Bảng backup | Records |
|---|---:|
| courses | 2 |
| lesson_content | 24 |
| profiles | 2 |
| enrollments | 4 |
| student_lesson_access | 26 |
| learning_attempts | 3 |
| lesson_assets | 36 |
| audit_logs (bổ sung giữ ledger) | 12 |

Không bỏ qua dòng/cột nào trong 8 bảng đã backup. Có bỏ qua Auth/password/session, Google credentials/documents và tệp/storage objects vì chúng không thuộc schema/data được đổi ở CP1; tránh xuất secret và không giả định JSON này là full-project disaster recovery. Các FK tới Auth giữ nguyên ID; rehearsal chỉ dựng identity stub từ profiles, không sao chép credentials. Backup chứa cả metadata schema/constraints/policies/ACL và hai function sẽ được thay thế để đối chiếu phục hồi; không tự chạy SQL trong file.
