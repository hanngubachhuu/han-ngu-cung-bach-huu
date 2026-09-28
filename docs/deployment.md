# Kế hoạch phát hành tài khoản

## Trạng thái hiện tại

DATABASE AND PRIVATE CONTENT APPLIED, PREVIEW READY, PRODUCTION PENDING (28/09/2026). Chủ sở hữu đã phê duyệt triển khai và xác nhận trực tiếp ADMIN cho `bachhuu1809@gmail.com`. Hai schema account/Docs đã áp dụng; truy vấn lại xác nhận đúng một ADMIN, 24 quyền học và 24 bài. Nội dung/audio riêng đã sẵn sàng; chưa chuyển website chính thức trước khi kiểm tra tích hợp với tài khoản thật.

Đã vá live: anonymous/authenticated không thể gọi `import_study_lexicon_words()`; chín hàm đọc từ điển có search_path cố định, truy vấn mẫu vẫn trả kết quả. Không gọi importer, không đổi corpus.

Vercel đã lưu ba biến Google bí mật cùng SUPABASE_URL và SUPABASE_PUBLISHABLE_KEY cho cả Preview/Production. Không đọc hoặc sao chép giá trị secrets. Cần deployment mới để sử dụng cấu hình vừa đổi. Lưu cấu hình không đồng nghĩa đã xác minh OAuth hay đồng bộ Google Docs thật.

PR [#19](https://github.com/hanngubachhuu/han-ngu-cung-bach-huu/pull/19); preview được xác minh READY: `dpl_3NNrK9XWhMyd58qGKuNzkKaN6KkG`, commit `a32dd281bf3402934c77bd485c0ee594314a10cb`, tại [website thử nghiệm](https://hanngubachhuu-gmhwqbph3-hanngubachhuu.vercel.app/tai-khoan.html). [GitHub Actions 36336231585](https://github.com/hanngubachhuu/han-ngu-cung-bach-huu/actions/runs/36336231585) pass toàn bộ kiểm tra PR, gồm các luồng trình duyệt. Bản production vẫn ở commit `01904b0bf98289e82ad52ec0d17ee39f0c1f1635` trong lần kiểm tra triển khai gần nhất; chưa promote PR này.

Kho `lesson-private` vẫn `public=false`. Đã tải bằng Storage dashboard đủ 33/33 audio mới (HSK 1 bài 5–15); bài 4 giữ nguyên ba tệp cũ. Cả 33 tệp có SHA-256 nguồn khớp manifest build; kích thước, MIME và ETag multipart một phần trên Storage khớp tệp cục bộ. Đây là đối chiếu checksum/metadata, chưa phải tải xuống và băm SHA-256 toàn bộ tệp từ xa. Báo cáo ở `.cache/private-audio-verification.json` (gitignored). Metadata thư mục rỗng không được tính là audio.

Đã xuất bản 23 bài trong một transaction: thêm 12 client_view HSK 2 và chuyển đường dẫn audio của 11 bài HSK 1. Kiểm lại 23/23 canonical text được giữ; HSK 1 bài 4 không bị sửa. Có 36 mapping audio và 24 quyền học. SQL chạy dưới role authenticated với claim ADMIN đọc được 24 bài/36 asset; anon đọc 0 bài/0 object riêng. Đây là kiểm RLS trực tiếp bằng role/claim, chưa thay thế đăng nhập và nghe trên trình duyệt thật. Bảng staging và backup không cấp SELECT cho anon/authenticated.

Auth đã lưu minimum password length 12, secure password change, confirm email; anonymous sign-in và manual identity linking tắt. Site URL là `https://hanngubachhuu.vercel.app/tai-khoan.html`; sáu redirect chính xác gồm trang tài khoản và `?mode=reset` trên production, legacy Pages và preview được ghi ở trên. Preview mới cần được thêm URL chính xác nếu dùng để thử email. Leaked-password protection yêu cầu Pro trên dashboard hiện tại; chưa bật hay nâng gói. Chủ sở hữu đã tự nhập/lưu Gmail SMTP. Lúc 03:13 UTC ngày 28/09, yêu cầu recovery tới đúng chủ tài khoản trả 200, Auth log có `user_recovery_requested`, recovery_sent_at khớp; chủ sở hữu xác nhận nhận thư và đúng người gửi. Chưa thực hiện bước đổi mật khẩu thật. Xem [hướng dẫn SMTP](SMTP_FOR_OWNER.md).

Đăng nhập ADMIN thật đã xác minh trên preview: tài khoản APPROVED, đủ 24 bài. Google status refresh OAuth và kiểm email thành công, hiển thị đúng bachhuu1809@gmail.com. Kho chưa có học viên; mục hồ sơ Google của quản trị cho phép kiểm và dùng kết nối với chính hồ sơ của mình.

Kiểm bài thật phát hiện DB HSK 1 bài 5–15 có đầy đủ câu hỏi nhưng thiếu `exerciseSections`, làm engine hiển thị 0 câu. Migration `20260928032108_repair_private_hsk1_exercise_sections` bổ sung metadata từ nguồn đã có trong transaction kiểm baseline và giữ backup riêng. Đối chiếu 11/11 canonical content giữ nguyên, 271 câu được ánh xạ đúng một nhóm, backup không cấp quyền browser. Bài 5 hiện 25 câu và nút audio chuyển sang “Đang phát audio” với tệp riêng thật. Loader mới từ chối cấu trúc thiếu/sai trước khi mở cổng; fixture trình duyệt nay dùng dạng DB phẳng thay vì chỉ dạng nguồn bọc ngoài.

Sao lưu có phạm vi: `.cache/backups/account-before-20260927.json` (gitignored), gồm dữ liệu bảy bảng liên quan, metadata Auth không chứa mật khẩu/token, chính sách và định nghĩa hàm. `node scripts/check-release-restore.mjs` đã khôi phục bảy bảng vào PostgreSQL WASM, chạy hai migration và bootstrap: 24 nội dung không đổi, 24 quyền học giữ nguyên, khách đọc được 0 bài riêng. Đây không phải backup toàn bộ Auth/Storage hay staging Supabase được hosting. Gói Free không có scheduled backup; chưa tạo tài nguyên tính phí.

## Kiểm tra cục bộ

```powershell
npm ci
npm run lint
npm test
npm run build
npm run validate:study
npm run dev
# Trong terminal khác, sau khi cài browser của Playwright:
node scripts/check-study-browser.mjs
node scripts/check-account-browser.mjs
node scripts/check-private-browser.mjs
```

Windows có thể đặt BROWSER_EXECUTABLE đến Chrome đã cài. Account/private tests chặn toàn bộ Supabase bằng fixture: không gửi email, không tạo tài khoản và không ghi dữ liệu thật. Báo cáo và ảnh nằm trong test-results (gitignored). Test RLS dùng PostgreSQL WASM PGlite, chưa thay thế staging Supabase thật.

Kết quả tại bản local ngày 28/09/2026:

- `npm test`: 49/49 pass; gồm PostgreSQL RLS, giữ quyền học cũ, dữ liệu riêng từng chủ, từ chối đổi owner khi lưu hồ sơ/kết quả, version conflict, retry, lỗi Google/DB giữa chừng, xuất bản dữ liệu lớn qua staging và metadata nhóm câu hỏi cho payload DB phẳng.
- `npm run lint`, `npm run build`, `npm run validate:study`: pass. Validator kiểm 46 file JavaScript, biên public/private, corpus 119.044 từ và 103.013 chữ cùng hash/nguồn/license.
- `check-account-browser.mjs`: pass ở các kích thước 375–1440 px; đăng ký/đăng nhập/quên mật khẩu/recovery, lưu hồ sơ gắn đúng owner, pending/admin, cấp quyền và Google chưa cấu hình/lỗi OAuth/đã kết nối. Auth/email/Google là mô phỏng.
- `check-private-browser.mjs`: pass 23 engine bài có payload cục bộ, từ chối khách/thu hồi quyền, lưu lịch sử theo tài khoản và gửi kết quả kèm owner. HSK 1 bài 4 kiểm cổng khách; nội dung riêng hiện có chưa được tải cho tài khoản thật. Audio mô phỏng không xác nhận chất lượng phát âm thanh thật.
- `check-study-browser.mjs`: đã pass hồi quy công cụ học sau sửa lưới mobile: 12 kích thước/trang, 12 luồng học và 10 luồng từ điển mở rộng. Chưa kiểm Safari hoặc thiết bị di động thật.

Không suy rộng các kiểm tra mô phỏng thành production đã phát hành. Thư recovery thật và Google identity được kiểm riêng như phần trạng thái; chưa coi kiểm identity là kiểm trọn vẹn đồng bộ Docs hai chiều. Các bài test tự động không tạo tài khoản hay gửi thư thật.

## Thứ tự phát hành sau phê duyệt

1. Chủ sở hữu đã chỉ định `bachhuu1809@gmail.com`; đã xác minh tổng hợp đúng một Auth user có email này và đã xác nhận email. Script bootstrap sẽ kiểm tra lại trong transaction. Cần quyết định bảo vệ repo nguồn hiện PUBLIC: khuyến nghị nguồn riêng, website Vercel vẫn công khai; kiểm tra ảnh hưởng tới Pages trước khi đổi visibility. Không thể thu hồi các bản sao từng công khai.
2. Backup DB/schema/roles/Auth metadata và private storage bằng kênh quản trị, kiểm tra restore ở staging. Đối chiếu migration history theo nội dung, không db reset/push/repair mù.
3. Áp dụng hai migration account và managed document sync theo thứ tự, ở staging trước; kiểm tra quyền hiện tại được giữ và account mới PENDING. Chạy `supabase/operations/bootstrap_owner.sql` để bootstrap đúng một ADMIN từ Auth đã xác minh email, không dựa vào user_metadata.
4. Chạy `npm run build`. Lấy lại danh sách id + md5(content::text) từ production vào `.cache/private-baseline.json`, chạy `node scripts/prepare-private-release.mjs`. Review transaction và rollback được tạo; các file này không được xuất bản.
5. Upload 33 audio vào bucket `lesson-private` có public=false và kiểm checksum. Đợt này đã dùng Storage dashboard có sẵn phiên quản trị. Công cụ CLI thay thế là `node scripts/upload-private-assets.mjs --apply` với credential vận hành trong environment an toàn; script không overwrite file khác. SUPABASE_SERVICE_ROLE_KEY chỉ dùng cho vận hành, không đưa vào browser hay cấu hình website thường trực.
6. Áp dụng `.cache/private-release.sql` qua kênh DB quản trị trong transaction; requires đủ storage objects. Nếu API từ chối body lớn, dùng `.cache/private-release-staged.json`: áp dụng setup, lần lượt uploads (chỉ ghi staging riêng), rồi sql để kiểm hash và xuất bản toàn bộ trong một transaction. Không chia nhỏ UPDATE nội dung live. Đợt này đã áp dụng staging `20260927181041_stage_private_lesson_client_views`, publication `20260927181444_publish_private_lesson_client_views`; không chạy lại. Transaction giữ backup, kiểm baseline, thêm client_view HSK 2 và thay đường dẫn audio HSK 1. Bài HSK1/4 vốn riêng được giữ nguyên.
7. Cấu hình Auth: confirm email, SMTP, exact redirect allowlist, minimum password length 12, rate limits, leaked-password protection nếu gói hỗ trợ. Cấu hình Vercel server variables theo .env.example; Docs có thể để disabled rõ ràng đến khi OAuth sẵn sàng.
8. Deploy preview, kiểm tài khoản khách/hai học viên/admin, Google nếu đã cấu hình, duyệt/cấp/thu hồi, reset email thật, mở và nghe bài, nộp/tự chấm/retry, đổi tài khoản, mobile. Chỉ promote production khi pass.
9. Kiểm URL live Vercel và Pages, revision/hash, console/assets, đường dẫn cũ, private source/audio trả 404, pending account không đọc private DB/storage, Google conflict log. Ghi deployment ID và bằng chứng mới.

## Rollback

Không drop các bảng tài khoản hoặc xóa người học. Khi lỗi frontend, phục hồi deployment đã kiểm chứng; lưu ý phiên bản cũ có thể chứa dữ liệu bài riêng công khai. Khi lỗi content, rollback theo thứ tự ngược: `.cache/private-section-repair-rollback.sql` cho 11 bài, sau đó mới `.cache/private-release-rollback.sql` cho 23 bài. Mỗi bước kiểm số dòng bằng backup; dừng nếu after_hash đã khác. Không khôi phục policy cũ rộng hơn chỉ để làm test xanh. Asset upload mới có thể giữ trong bucket riêng; không cần xóa để rollback.

Chưa kiểm tra restore trên staging được hosting, đổi mật khẩu thật, đồng bộ Google Docs hai chiều hoặc phát hành production mới. SMTP nhận thư, ADMIN đăng nhập, Google refresh/identity và HSK 1 bài 5/audio đã kiểm thật. Các bước còn lại cần được ghi bằng chứng riêng.
