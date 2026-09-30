# CP2 — Speaking / MP3 / Drive: đề xuất để duyệt

## Hiện trạng đã xác nhận

Foundation/editor, generator thực sự và import/provenance/archive đã phát hành. PR #24 merge a8c15a3; CI94 tests và browser PASS; migration authoring registry20260930143823, smoke production rollback-only PASS; module mới trên Vercel/Pages khớp Git. Không có câu/đề thật được nhập hoặc bật. Speaking vẫn bị chặn mở nhận bài ở server.

Server hiện có Vercel Node API và Google Docs adapter dùng publishable key + JWT Admin, xác minh đúng tài khoản chủ sở hữu. Tài liệu setup đã khai báo drive.file/openid/email; phiên Admin thực tế xác nhận Docs đang kết nối. Điều này **chưa** chứng minh Drive API đã bật, folder audio đã có, quyền Drive của token hiện tại đủ, FFmpeg chạy trên hosting, hay scheduler được cấu hình. Không đọc/in credential để kiểm tra.

Checkpoint này cần thiết vì bản dự án người dùng quy định dừng trước thay đổi storage/Google Drive/deployment hoặc security model; CP1 không phê duyệt audio infrastructure. Chưa tạo bucket/folder/cron, chưa thêm service-role vào server, chưa mở Speaking.

## Một phương án đề xuất

Giữ Supabase làm authority cho Auth, quyền học, recording metadata, attempt/version, grading, feedback và lịch sử. Tạo bucket staging audio **private riêng**, không dùng lesson-private. Browser ghi âm native, nghe lại tại máy rồi upload trực tiếp vào Storage bằng JWT/RLS và object ID do server cấp. API Vercel chỉ nhận ID/metadata, không proxy upload nhị phân.

Worker Node trên Vercel hiện tại tải object đã xác nhận, kiểm MIME/codec/duration/checksum bằng FFprobe/FFmpeg, chuyển MP3 mono64kbps32kHz, rồi tạo file trong folder Drive private do ứng dụng tạo. Dùng OAuth chủ sở hữu hiện có nếu kiểm tra capability xác nhận đủ scope; không đổi/xóa credential Docs, không xin scope toàn bộ Drive. Nếu thiếu scope phải dừng để chủ sở hữu consent, không tự đổi quyền.

Giữ một bản MP3 private trong Storage cho playback qua JWT/RLS, tránh lộ Drive URL/token hoặc cần file public. Drive là bản media liên kết; DB là authority trạng thái và checksum. Worker chỉ đánh dấu ready khi MP3 kiểm chứng và cả hai bản lưu thành công. Mọi bản raw/MP3/Drive dùng cùng expires_at = thời điểm upload gốc được server xác nhận +7 ngày; retry/convert/regrade không kéo dài thời hạn. Các trạng thái upload/processing/failed/ready/expired/deleted phải hiển thị đúng.

Đề xuất giới hạn ban đầu: 6 phút/câu, raw tối đa8MiB, MP3 tối đa3MiB. Đây là cấu hình đề xuất CP2, chưa áp lên bài học. Worker timeout và bundle native phải benchmark trước khi deploy; không tự nâng gói hosting nếu giới hạn/quota không đủ. Vercel body limit4.5MB là lý do upload trực tiếp; giới hạn6 phút/64kbps giữ MP3 nhỏ. [Vercel giới hạn](https://vercel.com/docs/functions/limitations), [Supabase upload](https://supabase.com/docs/guides/storage/uploads/standard-uploads).

Scheduler Supabase Cron + pg_net gọi endpoint worker mỗi5 phút bằng secret riêng trong Vault/server env, job lease và bounded batches. Không dựa vào cron hàng giờ trên Vercel Hobby (chỉ hỗ trợ một lần/ngày). Access bị chặn đúng expires_at; xóa vật lý ở lần cleanup thành công tiếp theo (mục tiêu ≤5 phút sau hạn, provider outage có retry/cảnh báo). Không cam kết xóa vật lý đúng giây thứ604800 khi provider ngừng đáp ứng. [Supabase scheduling](https://supabase.com/docs/guides/functions/schedule-functions), [Vercel cron](https://vercel.com/docs/cron-jobs/usage-and-pricing).

Worker/background cleanup cần quyền server riêng: đề xuất SUPABASE_SERVICE_ROLE_KEY chỉ ở Vercel env, worker RPC chỉ GRANT EXECUTE cho service_role, cron key riêng. Service-role có quyền rộng ở provider; tuyệt đối không đưa vào client/repo/log/chat. Endpoint chỉ cung cấp các thao tác recording, không nhận SQL/table/path/URL tùy ý. Đây là mở rộng credential boundary cần CP2, khác server Docs hiện chỉ dùng JWT Admin. OAuth Drive giữ drive.file, không drive toàn bộ tài khoản. [Google scope](https://developers.google.com/workspace/drive/api/guides/api-specific-auth).

## Dữ liệu, quyền và deadline

| Thành phần | Đề xuất |
| --- | --- |
| Recording metadata | Liên kết attempt/student/question version; immutable upload ID/object generation/checksum/MIME/size/duration/provider IDs, uploaded_at/expires_at, processing state, heard_by/at |
| Jobs/events | Claim/lease/retry/audit, idempotent create/convert/finalize/delete; không ghi vào learning_attempts toàn bộ file/detail |
| Student | Chỉ cấp/upload/xem recording của mình còn quyền; không ghi ready/Drive ID hoặc thay file đã submit; không đọc file người khác/key/draft grade |
| Admin | Nghe private recording để chấm rubric, ghi heard_at, cảnh báo gần hết hạn7 ngày; Publish kết quả theo luồng hiện tại |
| Worker | Service-role-only RPC, giới hạn recording/job; kiểm đúng ID/generation/lease trước finalize/delete, không thao tác Auth/grade/enrollment |
| Nộp bài | Server phải xác nhận raw upload hoàn tất trước deadline; không tin client timestamp. Submit khóa recording reference đã upload. MP3 có thể còn processing; không nhận thêm nội dung sau submit/deadline, không công bố grade khi media chưa xử lý được |
| Ghi lại | Chỉ draft, mỗi upload một ID mới; job cũ không thay thế ID mới; giữ lịch sử metadata, expiry gốc và các reference đã sử dụng |
| Cleanup | Xóa đúng raw/MP3/Drive/temp sau expiry, 404 đã vắng mặt là idempotent success sau identity check; 403/timeout không giả báo thành công. Không xóa submission, điểm, feedback, audit hoặc metadata |

Ảnh hưởng: bucket/policies mới cho recording, API/worker và scheduler mới trên stack hiện tại; thêm metadata/jobs/events và recording reference vào answer path hiện có. Không tạo enrollment, role học viên hoặc hệ thống auth thứ hai; self_reported tiếp tục không đủ điều kiện khóa học. Không public hóa audio. Cần chủ sở hữu cấu hình secret trong dashboard, bật Drive API nếu chưa có, duyệt folder/private scope; không gửi secret qua chat.

## Migration và rollback

Sau khi CP2 được duyệt, tạo migration bổ sung bằng CLI cho recording metadata/jobs/events, guarded RPC, private bucket policies và Speaking capability gate. Liệt kê exact DDL sau implementation/local tests trước áp dụng. Không sửa migration đã chạy; không backfill audio giả, không di chuyển/xóa lesson asset/history cũ. Scheduler/worker triển khai trước, health-check thực tế trước khi Admin có thể mở Speaking.

Rollback bằng feature flag chặn lượt Speaking mới và dừng claim conversion mới; giữ readonly/history và cleanup cần thiết cho retention, giữ record/submission/grade nguyên vẹn. Có thể sửa lỗi bằng migration mới. Không drop/reset, không rollback bằng xóa người dùng/bài nộp. Không bật storage/public grants để chữa lỗi playback. Credential rollback chỉ thu hồi credential mới của worker, giữ OAuth Docs.

## Test và tiêu chí mở nhận bài

Local: fake mic/provider/clock, quyền anon/pending/student A/B/Admin/worker, MIME giả/size/duration, codec và MP3 thật, stale job/re-record race, upload sau deadline, upload mất phản hồi, processing retry, expired playback, cleanup đúng generation, provider404/403/outage, dữ liệu/grade vẫn còn sau delete. Mock browser trên390/768/1366px; browser capability detection và permission denied.

Production: fixture audio tổng hợp, không lấy giọng học viên để thử; xác minh private bucket + folder, upload/MP3/checksum/authorized playback, actual worker/scheduler, cleanup idempotence giữ metadata/grade, ACL và không public URL. Test MIME browser thực tế, đặc biệt iPhone/Safari phải có evidence riêng; Chromium không chứng minh Safari. Chỉ bật Speaking khi pipeline thật PASS. Không tạo tài nguyên tính phí/nâng plan nếu chưa có phê duyệt riêng.

## Phạm vi đề nghị duyệt

Duyệt phương án private Storage → worker Vercel → private Drive + bản playback private, worker server credential/scheduler, retention7 ngày, giới hạn ban đầu và semantics submit raw-confirmed/MP3-processing nói trên. Sau duyệt triển khai kỹ thuật, trình exact migration/rollback trước production audio DDL; setup secret do chủ sở hữu tự nhập. Không bao gồm public certificate CP3.
