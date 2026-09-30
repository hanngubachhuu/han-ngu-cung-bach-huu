# Nhập đề từ PDF / Word

Trong Quản trị -> Bài nộp, chấm điểm và đề HSK / HSKK -> Đề và rubric, chọn bài học rồi **Tạo đề mới** -> **Nhập từ PDF / Word**. Kéo/chọn file, bấm **Đọc và phân tích đề**, kiểm tra và sửa, rồi xác nhận thêm vào đề. Đề được lưu dạng nháp; dùng luồng xem trước/xuất bản hiện tại. Có thể tạo câu thủ công bằng cùng giao diện đơn giản.

Admin không phải nhập JSON, mã câu, version, provenance hoặc rubric. Các công cụ soạn cũ nằm trong mục nâng cao để giữ tương thích. Không có bài học thật nào tự được bật.

## Hỗ trợ và giới hạn

- PDF có lớp chữ và DOCX; tối đa 3 MiB, 80 trang PDF, 200 câu, 1 triệu ký tự trích xuất. Giới hạn file giữ JSON/base64 dưới giới hạn body 4.5 MB của Vercel. Word `.doc` cũ chưa được hỗ trợ.
- PDF scan được nhận diện và báo cần OCR; không có OCR/AI mới được thêm. Trang scan xen kẽ được cảnh báo để đối chiếu, không được giả thành nội dung đã đọc. Hình/âm thanh/đối tượng không đọc được có cảnh báo và cần Admin xác nhận/bổ sung.
- Giữ chữ Hán, dấu pinyin và tiếng Việt do file cung cấp. Không sửa ngầm, dịch hoặc đoán đáp án. Nhận diện lựa chọn A-H, key cuối đề hoặc cạnh câu, các dạng được nêu rõ; cấu trúc mơ hồ để Admin chọn.
- Số câu/key trùng hoặc xung đột bị đánh dấu; thiếu đáp án không được tự điền. Các câu trắc nghiệm/điền/đúng-sai cần key hợp lệ trước lưu. Tự luận có thể lưu để chấm tay bằng rubric mặc định, đáp án mẫu riêng tư nếu file có.
- Đoạn đọc chung/hướng dẫn là entity riêng, không lặp vào từng prompt. Mỗi câu tham chiếu version đoạn đọc; version mới kế thừa đoạn đọc của parent. Bản đã dùng không sửa được.
- PDF bố cục nhiều cột/bảng phức tạp hoặc văn bản có kiểu đánh số không nhận diện cần đối chiếu; parser không bảo đảm cấu trúc mọi file. DOCX giữ đoạn, danh sách đánh số và các ô bảng; không render HTML từ file vào trang.

## Bản nháp, lưu và provenance

Chọn/đọc/sửa file chưa ghi câu hỏi vào DB. Bản xem trước lưu tạm theo Admin + lesson trong localStorage để khôi phục khi refresh; không lưu raw file. Trình duyệt không lưu được sẽ báo rõ. Khi không chắc server đã nhận thao tác, khóa sửa bản gửi và retry cùng request để không tạo bản trùng.

Xác nhận gọi một RPC Admin duy nhất, tạo context/question versions/key/order/definition/provenance trong cùng transaction. Lỗi không để lại batch dở. SHA256 file, tên file, source identifier, imported_by/at và version được quản lý tự động; source của câu soạn tay là admin_manual, không giả SHA file. Source-item identity tự cấp và version cũ vẫn có thể truy về nguồn. Raw PDF/DOCX không lưu lâu dài; Admin giữ file gốc nếu cần so sánh về sau.

Auth, profiles, course, enrollment, quyền bài học, immutable submission và publication boundary vẫn dùng hệ thống hiện tại. Student không gọi parser/import RPC hoặc đọc answer keys. Không dùng self_reported làm điểm chính thức.

## Cấu trúc implementation

`server/exam-file.mjs` giới hạn/signature -> `exam-parser.mjs` bounded worker -> `exam-document-parser.mjs` PDFjs/Mammoth/parse5 -> `study/exam-extraction.mjs` tách câu và mapping -> `exam-import-ui.mjs` review/draft -> RPC `document_exam_import` lưu nguyên tử. API `api/exam-import.js` xác minh Auth/Admin trước parse, không ghi DB. DOCX central directory được kiểm encryption/ZIP64/macro/path/size/compression ratio trước giải nén. API lỗi an toàn, CORS chỉ cho host Pages hiện có, no-store.

Dependencies: pdfjs-dist 6.3.289, mammoth 1.13.0, parse5 8.0.0. jszip là dev dependency tạo DOCX synthetic. Không cần dịch vụ ngoài/OCR/AI để nhập đề có chữ.

## Kiểm chứng

Synthetic PDF10 và DOCX10 câu, Chinese+pinyin+Vi, missing/inline/end keys, fill/writing, multipage headers, repeated options, shared passage, duplicate/conflicting key, edits/removal/order, corrupt/scan/size limits. PostgreSQL: Admin-only/anon/student denial, atomic failure, retry, context pin/immutability/inheritance, source manual chính xác, private keys. Chromium390/768/1366: import, edit/delete/reorder/add, refresh và confirm không cần trường kỹ thuật. Các fixture không chứa dữ liệu/đáp án học viên thật.
