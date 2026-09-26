# Hán tự, Từ điển và Đọc hiểu

## Chạy và kiểm tra

Yêu cầu Node.js 24; cài đúng phiên bản trong lockfile.

```sh
npm ci
npm run build
npm run dev
```

Mở `http://127.0.0.1:4173/tu-dien.html`. Dev server chỉ phục vụ `dist/` và route API, không phục vụ `.env.local`, seed quản trị hoặc mã server. Chạy build lại sau khi sửa source.

```sh
npm run lint
npm test
npm run validate:study
node scripts/validate-lessons.mjs
node scripts/validate-pinyin.mjs
npm run test:browser
```

Kiểm thử trình duyệt cần Chromium của Playwright (`npx playwright install chromium`) hoặc biến `BROWSER_EXECUTABLE` trỏ tới Chrome. `STUDY_BASE_URL` chọn bản local/preview cần kiểm tra. Ảnh và báo cáo nằm trong `test-results/`, được bỏ qua bởi Git. Test dùng context mới; bước lỗi đăng nhập được mock, không gửi email hoặc đăng nhập tài khoản thật.

## Dữ liệu và phạm vi hiện có

Nguồn giáo trình HSK 2.0: `data/lesson-registry.js`, `data/lesson-manifest.js` và các file bài học còn công khai trong `data/lessons/`. Build đọc nguồn, giữ provenance theo bài và sinh ID từ chữ Hán. HSK ở giao diện là cấp **giáo trình chứa mục từ**, không phải cam kết phân loại chính thức HSK 3.0.

- Học liệu công khai: 62 từ, 91 chữ và 5 bài đọc từ bài 1–3 của HSK 1/2, cộng 214 bộ thủ Unicode.
- Kho mở rộng: 119.044 mục từ, 122.596 nhóm cách đọc/dạng chữ từ CVDICT; 103.013 chữ từ hợp nhất Unihan, CVDICT và Hán Việt Pinyin. Có 8.105 chữ thông dụng và 13.610 chữ có ánh xạ âm Hán Việt (gồm biến thể giản–phồn). Không đồng nghĩa với từng ấy mục đã được giáo viên kiểm chứng. Xem [nguồn, giấy phép và quy trình nhập](../sources/dictionaries/README.md).
- Bản nhập Supabase: 344 record từ, 524 record chữ, 45 bài đọc; các record ngoài bài 1–3 được bảo vệ bằng quyền bài học. Record không đồng nghĩa với số từ duy nhất.
- Bộ nét cục bộ: 9.574 chữ từ `hanzi-writer-data@2.0.1`; chứa giấy phép Arphic và NOTICE trong bản build. Hanzi Writer, Supabase JS và pinyin-pro có license kèm bundle.
- `scripts/import-unicode.py` nhập tập dữ liệu Unihan 17.0 có hash/nguồn. Không suy diễn âm Hán Việt; trường thiếu được hiển thị rõ. Bộ lọc HSK 3–9 hoạt động nhưng chưa có nguồn giáo trình tương ứng trong dự án.
- Pinyin của bài tự nhập do pinyin-pro suy ra theo câu, cần đối chiếu chữ đa âm. Bản dịch bài mẫu chỉ được lấy khi có câu khớp chính xác trong ví dụ giáo trình. Câu hỏi mẫu lấy từ bài tập canonical; không tự dựng đáp án cho đoạn bất kỳ khi AI tắt.

`data/study/entries/`, `readings/` và `catalog.json` là đầu ra build. Hai collection được tạo lại mỗi lần để không sót dữ liệu đã rút khỏi kho công khai. Không sửa các JSON sinh ra bằng tay.

`sources/dictionaries/` chứa snapshot nguồn mở có hash và giấy phép; `data/study/lexicon/` chỉ là đầu ra build offline và không được đưa vào `dist`. Từ điển trên website truy vấn `study_lexicon_words` và các RPC Supabase, nên không tải toàn bộ 119.044 từ về client. Hán tự mở rộng tải snapshot Unihan/Hán Việt nén từ Supabase Storage trong Web Worker. Trang `nguon-tu-dien.html` công bố nguồn, số lượng và link snapshot. CVDICT có bản dịch do tác giả dùng AI hỗ trợ nên luôn có nhãn đối chiếu; không phát sinh gọi API AI. Hanzii/Thi Viện là liên kết tra cứu bên ngoài.

Kho học liệu cũ đang chuyển dần sang riêng tư. Thay đổi này không biến tất cả file giáo trình cũ thành riêng tư. Bài HSK 1 số 4 dùng cổng tải hiện có và không được xuất lại từ seed cục bộ.

## Tính năng

Hán tự: tìm chữ/pinyin/nghĩa, HSK theo giáo trình, 214 bộ thủ, phân trang, chi tiết, biến thể, nguồn, sao chép, lưu chữ, từ ghép/ví dụ từ cùng kho, animation và luyện viết. Canvas thật có trace, Undo/Clear, DPR và chống cuộn khi viết. Nhận dạng canvas chỉ có khi dịch vụ AI được bật.

Từ điển: chữ giản/phồn thể, pinyin có dấu/không dấu/số thanh, `ü/v/u:`, nghĩa Việt không dấu; ưu tiên exact rồi prefix/token/contains và cuối cùng pinyin sai một ký tự (chuỗi Latin dài 4–80 ký tự). Không gợi ý gần đúng cho chữ Hán hoặc truy vấn quá ngắn. Có debounce, loại phản hồi cũ, sổ từ và ví dụ có nguồn.

Đọc hiểu: bài mẫu/lịch sử, tối đa 3.000 ký tự, giữ đoạn/dấu câu, pinyin, tra từ ngay trong bài, từ trọng điểm, đọc theo câu bằng giọng thiết bị, tốc độ/lặp câu, câu trước/sau, chấm bài mẫu và lưu vị trí/đáp án. Nghe bằng giọng thiết bị phụ thuộc giọng tiếng Trung đã cài. Tạm dừng rồi nghe tiếp bắt đầu lại câu hiện tại. Audio AI (khi bật) có thanh tua thật nhưng chưa có timestamp để đồng bộ highlight từng từ/câu; không giả mốc thời gian.

## Supabase

Migrations theo thứ tự trong `supabase/migrations/`. Bảng kho curated chỉ cho client SELECT; các bảng `study_saved_words`, `study_saved_characters`, `study_readings`, `study_analysis_cache` chỉ CRUD theo `auth.uid()`. API dùng publishable key và bearer của người dùng, không dùng service-role key.

`study_internal.consume_quota` là security-definer có search_path rỗng, nằm trong schema nội bộ. Nó chỉ chấp nhận tài khoản tồn tại, xác nhận email, không anonymous. Quota/ngày UTC: phân tích 8, nhận dạng 60, tra bổ sung 30, tạo audio 30; trần toàn dự án 200. Lượt bị chặn không tiêu hao trần còn lại. Cache kết quả theo user/hash/model/schema, 7 ngày; không cache audio hoặc chia cache riêng giữa tài khoản.

Seed sau `npm run build`:

```sh
node scripts/seed-study.mjs entries 0 25
node scripts/seed-study.mjs characters 0 25
node scripts/seed-study.mjs readings 0 25
```

Mỗi lệnh trả JSON `{count,total,sql}`. Dùng công cụ quản trị Supabase chạy trường `sql`, lặp offset theo batch đến total. Không đưa đầu ra này vào client. Upsert không tự xóa record đã bỏ khỏi nguồn; khi đổi quyền/xóa bài phải rà và thu hồi record cũ trong cùng đợt cập nhật.

`tests/study-rls.sql` kiểm tra tài khoản sở hữu, từ chối đọc/sửa/chèn chéo chủ, lưu chữ, tài khoản không tồn tại, và quota cá nhân/toàn cục. Test cần một tài khoản đã xác nhận và **ROLLBACK toàn bộ thay đổi**. Không dùng tài khoản sinh ra để giả rằng đã kiểm tra đăng nhập giao diện thật.

Advisors sau cập nhật: không còn cảnh báo RLS/policy của bảng study. Còn cảnh báo cấu hình bảo vệ mật khẩu rò rỉ chưa bật ở Auth; xem [hướng dẫn Supabase](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). Cảnh báo nhiều SELECT policy ở `lesson_content` thuộc hệ thống bài học có sẵn; các index mới chưa được sử dụng nhiều nên giữ lại.

## Vercel và GitHub

`vercel.json`: build `npm run build`, output `dist`, Node 24 theo package.json, `/api/study` tối đa 120 giây. Triển khai từ source GitHub, không từ artifact `gh-pages`. Secret chỉ đặt trong môi trường server Vercel hoặc `.env.local` ở máy; cả Git và gói deploy đều bỏ qua tệp môi trường.

Chế độ đã chọn: **AI tạm tắt**. Không cần khóa OpenAI để chạy các tính năng còn lại. `GET /api/study?action=status` trả `{aiEnabled:false}`; giao diện khóa nút phụ thuộc AI. Adapter nhận dạng/dịch/câu hỏi/audio đã có nhưng chưa xác nhận end-to-end với nhà cung cấp vì OpenAI trả `billing_not_active` khi thử trước đó.

Khi chủ dự án quyết định bật sau này, cấu hình `OPENAI_API_KEY`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` phía server và `STUDY_AI_ENABLED=true`, kiểm tra billing trước, rồi kiểm thử có kiểm soát. Không gửi khóa qua chat hoặc commit. `.env.example` chỉ mô tả tên biến.

Workflow `validate-study.yml` chạy lint/test/build/validator và browser test trên PR. Workflow `deploy.yml` chỉ xuất `dist/` sang Pages sau khi kiểm tra; Pages không có backend AI. Không coi push GitHub hoặc trạng thái build READY là bằng chứng giao diện đã hoạt động: cần mở URL triển khai, kiểm tra route API và các trang desktop/mobile.

## Giới hạn kiểm thử

Đã kiểm tra Chromium ở 375, 768, 1024 và 1440 px; các thao tác lưu khách, bài mẫu, quiz, tra từ, giữ văn bản, đa âm, canvas, nét chữ, keyboard và lỗi đăng nhập mô phỏng. Chưa kiểm tra Safari/iPhone/Android vật lý, chất lượng giọng đọc trên từng thiết bị hoặc đăng ký/xác nhận email thật. RLS thực thi thật trên Supabase; AI giữ tắt theo quyết định của chủ website.
