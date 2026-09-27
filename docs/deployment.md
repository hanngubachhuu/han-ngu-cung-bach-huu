# Kế hoạch phát hành tài khoản

## Trạng thái hiện tại

DATABASE APPLIED, WEBSITE RELEASE IN PROGRESS (27/09/2026). Chủ sở hữu đã phê duyệt triển khai và xác nhận trực tiếp ADMIN cho `bachhuu1809@gmail.com`. Hai schema account/Docs đã áp dụng; đúng một ADMIN đã được kiểm chứng, 24 quyền học còn nguyên. Chưa deploy frontend mới trước khi chuyển đủ nội dung/audio riêng.

Đã vá live: anonymous/authenticated không thể gọi `import_study_lexicon_words()`; chín hàm đọc từ điển có search_path cố định, truy vấn mẫu vẫn trả kết quả. Không gọi importer, không đổi corpus.

Lần từ chối migration trước đã được xử lý bằng phê duyệt trực tiếp của chủ sở hữu, sao lưu và kiểm thử khôi phục. Lần cấp ADMIN cần xác nhận riêng theo yêu cầu automatic review; đã nhận xác nhận rồi thực hiện. Vercel được kiểm tra qua dashboard: ba biến Google bí mật do chủ sở hữu nhập ở Preview; SUPABASE_URL và SUPABASE_PUBLISHABLE_KEY đã được bổ sung cho Preview/Production. Cấu hình Google Production đang hoàn tất trong đợt phát hành.

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

Kết quả tại bản local ngày 27/09/2026:

- `npm test`: 44/44 pass; gồm PostgreSQL RLS, giữ quyền học cũ, dữ liệu riêng từng chủ, từ chối đổi owner khi lưu hồ sơ/kết quả, version conflict, retry và lỗi Google/DB giữa chừng.
- `npm run lint`, `npm run build`, `npm run validate:study`: pass. Validator kiểm 45 file JavaScript, biên public/private, corpus 119.044 từ và 103.013 chữ cùng hash/nguồn/license.
- `check-account-browser.mjs`: pass ở các kích thước 375–1440 px; đăng ký/đăng nhập/quên mật khẩu/recovery, lưu hồ sơ gắn đúng owner, pending/admin, cấp quyền và Google chưa cấu hình. Auth/email là mô phỏng.
- `check-private-browser.mjs`: pass 23 engine bài có payload cục bộ, từ chối khách/thu hồi quyền, lưu lịch sử theo tài khoản và gửi kết quả kèm owner. HSK 1 bài 4 kiểm cổng khách; nội dung riêng hiện có chưa được tải cho tài khoản thật. Audio mô phỏng không xác nhận chất lượng phát âm thanh thật.
- `check-study-browser.mjs`: đã pass hồi quy công cụ học sau sửa lưới mobile: 12 kích thước/trang, 12 luồng học và 10 luồng từ điển mở rộng. Chưa kiểm Safari hoặc thiết bị di động thật.

Không suy rộng kết quả này thành production đã phát hành hoặc Google/SMTP đã kết nối. Không có tài khoản hay thư thử thật được tạo bởi các bài test.

## Thứ tự phát hành sau phê duyệt

1. Chủ sở hữu đã chỉ định `bachhuu1809@gmail.com`; đã xác minh tổng hợp đúng một Auth user có email này và đã xác nhận email. Script bootstrap sẽ kiểm tra lại trong transaction. Cần quyết định bảo vệ repo nguồn hiện PUBLIC: khuyến nghị nguồn riêng, website Vercel vẫn công khai; kiểm tra ảnh hưởng tới Pages trước khi đổi visibility. Không thể thu hồi các bản sao từng công khai.
2. Backup DB/schema/roles/Auth metadata và private storage bằng kênh quản trị, kiểm tra restore ở staging. Đối chiếu migration history theo nội dung, không db reset/push/repair mù.
3. Áp dụng hai migration account và managed document sync theo thứ tự, ở staging trước; kiểm tra quyền hiện tại được giữ và account mới PENDING. Chạy `supabase/operations/bootstrap_owner.sql` để bootstrap đúng một ADMIN từ Auth đã xác minh email, không dựa vào user_metadata.
4. Chạy `npm run build`. Lấy lại danh sách id + md5(content::text) từ production vào `.cache/private-baseline.json`, chạy `node scripts/prepare-private-release.mjs`. Review transaction và rollback được tạo; các file này không được xuất bản.
5. Cấp credential vận hành trong environment terminal an toàn, chạy `node scripts/upload-private-assets.mjs --apply` để upload 33 audio vào bucket `lesson-private` có public=false và kiểm hash. Script không overwrite file khác. SUPABASE_SERVICE_ROLE_KEY chỉ dùng cho bước vận hành này, không đưa vào browser hay cấu hình website thường trực.
6. Áp dụng `.cache/private-release.sql` qua kênh DB quản trị trong transaction; requires đủ storage objects. Transaction giữ backup, kiểm baseline, thêm client_view HSK 2 và thay đường dẫn audio HSK 1. Bài HSK1/4 vốn riêng được giữ nguyên.
7. Cấu hình Auth: confirm email, SMTP, exact redirect allowlist, minimum password length 12, rate limits, leaked-password protection nếu gói hỗ trợ. Cấu hình Vercel server variables theo .env.example; Docs có thể để disabled rõ ràng đến khi OAuth sẵn sàng.
8. Deploy preview, kiểm tài khoản khách/hai học viên/admin, Google nếu đã cấu hình, duyệt/cấp/thu hồi, reset email thật, mở và nghe bài, nộp/tự chấm/retry, đổi tài khoản, mobile. Chỉ promote production khi pass.
9. Kiểm URL live Vercel và Pages, revision/hash, console/assets, đường dẫn cũ, private source/audio trả 404, pending account không đọc private DB/storage, Google conflict log. Ghi deployment ID và bằng chứng mới.

## Rollback

Không drop các bảng tài khoản hoặc xóa người học. Khi lỗi frontend, phục hồi deployment đã kiểm chứng; lưu ý phiên bản cũ có thể chứa dữ liệu bài riêng công khai. Khi lỗi content, dùng `.cache/private-release-rollback.sql`, kiểm số dòng trả về bằng số dòng backup; dừng nếu after_hash đã khác. Không khôi phục policy cũ rộng hơn chỉ để làm test xanh. Asset upload mới có thể giữ trong bucket riêng; không cần xóa để rollback.

Chưa thực hiện backup/restore staging thật, bootstrap, SMTP email, Google OAuth thật hoặc deploy trong đợt này. Những bước này không được tính là hoàn tất chỉ vì code/test cục bộ pass.
