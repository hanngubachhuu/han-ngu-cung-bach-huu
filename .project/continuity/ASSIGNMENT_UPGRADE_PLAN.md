# Nâng cấp nộp bài, chấm điểm và tốt nghiệp

Ngày 30/09/2026. Trạng thái: CP1 ĐÃ DUYỆT, foundation đã triển khai/kiểm thử local; CHỜ XÁC NHẬN CHECKPOINT MIGRATION SAU BACKUP theo chỉ thị mới nhất. Entity/field mới chưa tồn tại trong production. Hiện trạng: RECONCILIATION_REPORT.md. Gói SQL/RLS/backup/rollback cụ thể: docs/assignment-migrations.md.

## Phạm vi đã chốt

Chỉ tự chấm bài thuộc lộ trình HSK/HSKK do tài khoản học viên nộp. Server kiểm STUDENT/APPROVED, enrollment/quyền bài, program HSK/HSKK, bài bật nộp chính thức, version Published và ownership attempt. Không suy phạm vi từ URL/referrer/tên bài. ADMIN preview không tạo kết quả học viên; khách, draft và công cụ tự do ngoài lộ trình không kích hoạt chấm chính thức.

Câu đáp án xác định được tự chấm. Speaking/retell, writing, translation mở phải chấm thủ công theo rubric riêng; không AI. HSKK chủ yếu bài nói, thuộc luồng nộp và chấm thủ công, không tự đánh giá phát âm. Giữ nguyên chức năng tự luyện ngoài phạm vi nâng cấp.

## CP1 — nền tảng bài nộp và quyền đọc điểm/đáp án (R3/R4)

### Hiện trạng và vấn đề

Đã có Auth, ADMIN, profiles, courses, enrollments, student_lesson_access, learning_attempts và audit_logs. Ba điểm cũ do browser tự báo, đọc được ngay. Payload bài học chứa key và engine hiện đáp án. Chưa có version đề/rubric, server draft, grade publication hoặc HSKK enrollment. RLS hiện kiểm quyền bài nhưng chưa có nghiệp vụ giữ kín điểm chưa công bố.

### Phương án khuyến nghị

Mở rộng hệ thống hiện tại. learning_attempts.id tiếp tục là một định danh cho một lần làm bài; không tạo exercise_submissions làm lịch sử thứ hai. Tái sử dụng Auth/ADMIN/enrollment/audit/quan-tri.html; chỉ thêm bảng con cho dữ liệu có vòng đời/quyền khác.

| Nguồn chính | Thay đổi đề xuất | Quyền và consumer |
|---|---|---|
| courses | Thêm program HSK/HSKK; uniqueness (program,level), mapping cấp độ rõ | Giữ hsk1/hsk2 và enrollment keys; không gán HSKK vào HSK giả |
| lesson_content | Giữ ID/nội dung học; uniqueness (course_id,lesson_no); metadata bật assignment | Adapter tương thích flat/wrapped/client_view |
| learning_attempts | History envelope hiện có; thêm official source, score/max/submitted_at nullable có check theo nguồn. Draft/start/deadline/duration/timeout nằm ở submission_details | Legacy giữ nguyên; điểm official chỉ sau publish |
| attempt_answers (mới) | FK attempt/question version, thứ tự, answer/revision; max mặc định 10 | Owner sửa draft qua command; đã submit bất biến |
| question identity + versions (mới) | Identity từ lesson + legacy ID; version an toàn, nội dung/key/options/explanation/tip/scoring/media/status/actor/timestamps | ADMIN full; learner chỉ projection allowlist của Published |
| rubric_versions (mới) | Tiêu chí/trọng số/mô tả riêng theo loại, version bất biến | Pin version khi chấm, không render lịch sử bằng rubric mới |
| grade revisions + publication snapshots (mới) | Raw/max, normalized/100, criterion scores, feedback, grader, lần công bố | Draft chỉ ADMIN; owner chỉ snapshot published, không key/model answer |
| audit_logs | Mở rộng details/entity contract của ledger hiện có | Actor/action/before/after/reason; ADMIN read |

Tên SQL cuối cùng được xác nhận bằng triển khai/tests sau CP1. Cần migration score NOT NULL theo source: legacy giữ check cũ, official chưa publish dùng NULL thay vì 0 giả. Khi Admin sửa/regrade kết quả đã công bố, học viên tiếp tục thấy snapshot cũ tới lần publish tiếp theo. Câu chưa chấm khác 0 điểm. 96/120 → 80/100; giữ raw để audit/regrade.

### Bảo mật và bất biến

- Start/save/submit lấy owner từ identity được xác minh, không tin owner/score/deadline của browser. Draft optimistic revision; giữ bản sửa mới khi response cũ về. Submit idempotent; retake tạo attempt mới.
- RPC account_save_attempt và INSERT cũ chỉ được ghi self_reported, không thể cập nhật/sinh official bằng client points. Test cả gọi RPC trực tiếp, không chỉ UI.
- Không đặt draft grades/key vào row/payload owner SELECT được. RLS/GRANT bảo vệ REST/RPC. Function đặc quyền cần thiết ở account_internal, fixed search_path, EXECUTE tối thiểu và kiểm owner/role/entitlement tại DB.
- Bài bật official dùng getter an toàn; đóng raw lesson_content.content SELECT và đường get_private_lesson_content cũ để không lọt key. Loader/engine chuyển tương thích cùng rollout. Projection theo allowlist từng type, không chỉ xóa một field answer.
- Published question version bất biến. Sửa/rollback tạo version mới. Pin danh sách/version/thứ tự/scoring/deadline lúc start; không đổi đề khi Admin publish giữa lúc học viên làm. Thay key không auto-regrade. Regrade lưu version/điểm trước-sau/actor/lý do và cần publish lại.
- Preview → Publish kiểm đúng revision/hash đã xem. Chặn công bố nếu còn câu chưa chấm hoặc preview đã cũ. Publish/regrade/archive/graduate/issue/revoke có confirmation UI.
- self_check cũ không mặc định objective. Adapter phải phân loại từ metadata/rubric; trường hợp mơ hồ chờ Admin. Sinh distractor chỉ từ dữ liệu đáng tin, phù hợp ngữ pháp/ngữ cảnh; không đủ thì báo không đủ, không tự nhận đã bảo đảm đáp án duy nhất.

### Nguồn chính và đề từng public

Repo giữ học liệu và bài luyện chưa chuyển. Bài bật nộp chính thức được import có provenance/hash từ dữ liệu đã đối chiếu vào DB version bank; sau đó Admin draft/preview/publish sở hữu đề chính thức. Build không ghi đè version DB. Không sửa cùng một version ở cả repo lẫn Admin.

Repo hiện PUBLIC, đã chứa một phần đề/đáp án cũ. API mới không thu hồi được thông tin từng public. Đề/key mới không commit vào repo public. Đổi repo private cần checkpoint riêng vì liên quan Pages; không tự đổi visibility. Bài mẫu 1–3 có thể tiếp tục public để học, còn attempt tài khoản dùng published official version. Không cam kết bí mật cho câu nhập nguyên văn từ nguồn đã public.

### Ảnh hưởng, migration, rollback

Consumers: account-service, attempt-sync, loader, HSK1 engine, HSK2 build adapter, Admin, học viên/tab cũ, RPC/REST. CP1 đã duyệt; theo yêu cầu sau backup, phải được xác nhận checkpoint migration tiếp theo trước production. Không xin duyệt lại architecture CP1.

1. Chụp schema/ACL/hashes, backup và kiểm restore; reconcile 33 live migrations với 14 local files theo nội dung. Không db push/reset/repair lịch sử mù.
2. Migration mới có preconditions: mở rộng course/lesson uniqueness, giữ FK/ID; tạo question/rubric version cùng RLS/grants trước dữ liệu thật.
3. Mở rộng attempts/bảng con/commands/constraints. Legacy id/source/score/max/timestamp giữ nguyên; không chuyển thành official. Tiếp tục entitlement hiện tại.
4. Import có đối chiếu HSK1/4 flat, HSK1/5 flat, HSK2/5 client_view, HSK2/8 revision, public samples và HSKK. Kiểm số câu/ID/order/hash; không tự publish chưa preview.
5. Local DB/API/browser rồi staging được duyệt. Deploy code tương thích trước khi bật pilot một bài. Bật official thì khóa raw key/local reveal cùng rollout; tab cũ yêu cầu tải lại thay vì gửi sai điểm.
6. Test âm tính guest/hai học viên/admin, direct REST/RPC, autosave race, deadline, retake, duplicate submit, publication và hồi quy trước mở rộng.

Rollback: tắt nhận attempt mới nếu lỗi, giữ toàn bộ bài nộp/điểm/audit; rollback UI tương thích schema mở rộng. Không drop dữ liệu, không nới RLS/raw key. Chỉ hoàn nguyên uniqueness khi chưa có HSKK/collision; sau đó ưu tiên forward fix. Migration có pre/post counts và hashes. CP1 cho phép triển khai nền tảng đề xuất nhưng không bỏ qua validation trước kích hoạt production.

Lựa chọn khác là thêm UI lên self_reported; ít thay đổi nhưng không đáp ứng điểm chính thức/ẩn kết quả/chứng nhận, không khuyến nghị.

## Thứ tự thực hiện

| Phase | Đầu ra/dependency | Kiểm chứng chính |
|---|---|---|
| 1 Reconcile | Report đã có, giới hạn ghi rõ | Code/schema/RLS/build/deployment đối chiếu |
| 2 Foundation | Courses + version/rubric tối thiểu + attempts/drafts/answers; cần CP1 | Scope/owner, autosave/resume/race, submit/deadline/retake |
| 3 Grading | Objective + manual rubric, grade revisions/publication/regrade | 10/câu, raw + /100, không lộ draft/key, không auto-regrade |
| 4 Editor | Create/edit/duplicate/archive/order/distractors/preview/publish/rollback trên Admin hiện có | Historical immutable, stale preview, chỉ published được dùng |
| 5 Speaking contract | Recorder mỗi câu, draft blob IndexedDB khi có, upload/retry/storage adapter | Mic denied, preview/re-record, chưa upload không nộp hợp lệ |
| 6 Audio production | MP3 worker, private Drive/storage, cleanup 7 ngày; CP2 | Conversion thật, không public file, idempotent cleanup, history giữ |
| 7 Student management | Enrollment hiện có + lifecycle theo khóa | Đang học/tạm nghỉ/nghỉ/hoàn thành/tốt nghiệp và audit |
| 8 Completion/graduation | Config/versioned requirements, chỉ published official results, Admin xác nhận | Không lấy self_reported/draft, snapshot/actor |
| 9 Certificate | Versioned data/template/render/output, server ID, issue/reissue/revoke; CP3 public verify | Ảnh immutable/reproducible, uniqueness race, privacy |
| 10 Integration | Hồi quy, security, browser/mobile, deployed audit, continuity | Acceptance A–J có evidence, không chỉ build |

Versioning tối thiểu đưa từ phase 4 lên phase 2 vì attempt đầu tiên đã cần pin đề; editor đầy đủ vẫn phase 4. Không bịa học liệu HSKK để đủ cấp. Lifecycle khóa học tách profile status duyệt/tạm khóa Auth.

## CP2 — audio/MP3/Drive/retention (chưa xin triển khai production)

Đề xuất Supabase private staging upload gốc có giới hạn/checksum; DB giữ metadata/jobs; worker MP3 chuyển Drive private bằng server OAuth. Không dùng lesson-private như kho recording tùy ý. Chọn worker/lịch cleanup sau kiểm runtime/chi phí, không tự tạo tài nguyên tính phí/cron production.

Adapter upload/status/read-authorized/delete. Metadata: attempt/answer/student/question-version/provider/key/Drive ID/MIME/size/duration/uploaded_at/expires_at/status/heard_by/heard_at. expires_at từ upload thành công, không reset khi retry/regrade. Cleanup raw/MP3/tệp tạm: kiểm recording identity/object version/expires_at, claim/lease, provider 404 coi là đã xóa, retry/log; giữ metadata/submission/grade/feedback/audit. Admin cần cảnh báo audio chưa chấm sắp hết 7 ngày vì hết hạn sẽ không nghe lại được.

Playback/download qua authorization, không anyone-with-link. Upload xong còn processing phải hiển thị đúng. Không coi file chưa upload là answer hợp lệ. Deadline/upload dở/processing nền có server policy rõ, không nhận nội dung mới sau hạn dựa vào client timestamp.

CP2 chốt worker/runtime, folder, scopes/consent, environment, redirect URI, schedule, limits, migration/rollback. Giữ Docs OAuth; không đọc/in secret. Hướng dẫn setup/troubleshooting chỉ dùng placeholder.

## CP3 — chứng nhận và public verification

Completion policy version + graduation event có Admin actor. Certificate snapshot tên/khóa/cấp/ngày/eligibility/template/output hash; ID DB-safe, reissue artifact mới liên kết cũ, revoke giữ lịch sử. Tách data/template/render/output/storage; font Việt/Hán và output ảnh lưu thật, không đổi khi profile/template mới.

Public verification cần duyệt tối thiểu thông tin (tên/khóa/status/ngày/ID), token khó đoán/chống liệt kê. Không email/phone/điểm/bài nộp/audio. CP1 không mở public endpoint.

## Validation và documentation phải giao

Mỗi phase chạy checks phù hợp: lint/build/unit/integration/DB/RLS trực tiếp/browser/responsive; ghi phần chưa kiểm. Negative roles: anonymous/PENDING/revoked/A/B/ADMIN; thêm official sửa bằng RPC cũ, student tự publish, giả program, stale version, quá giờ, answer race và submit đồng thời. Điểm/max lấy từ version server.

Admin hiện có dùng server filtering/pagination; audio metadata không kéo file trước khi nghe. Student: làm → autosave → submit → chờ → điểm công bố. Typography kế thừa Times New Roman/Latin, KaiTi/Hán, Unicode mixed script; không redesign nav/footer.

Cuối dự án có docs setup/env/migration/rollback/ownership/admin grading/Drive auth-folder-cleanup-troubleshooting/certificate generation-verification; cập nhật continuity mỗi milestone. Foundation phases 2–3 và editor tối thiểu đã có local; toàn bộ dự án chưa đạt acceptance. Xem docs/assignment-migrations.md cho kiểm chứng và phần còn thiếu.
