# HSK 1 — báo cáo kiểm thử

Ngày: 23/09/2026. Nền so sánh HSK 2: `7e738f681a02d46e6ff342ce81b35af46b3ba38f`. Phạm vi: bộ HSK 1 theo Giáo trình chuẩn cũ; không đổi ngân hàng HSK 2.

## Nội dung

15 bài, 369 câu; 279 câu chấm tự động và 90 câu tự chấm. Có 12 nhiệm vụ mở rộng tùy chọn, được tách khỏi tổng điểm cốt lõi. 166 mục từ theo bài, 54 điểm ngôn ngữ/phát âm, 45 bài nghe. Các cụm minh họa của 166 mục từ đã được dịch theo cả cụm; 50 câu/cụm mẫu có bản dịch Việt riêng. Những chỉ dẫn phát âm không phải câu mẫu được giữ trong mục điểm ngôn ngữ.

`CONTENT_AUDIT.json`, `QUESTION_MATRIX.json` và `editorial-changes.json` ghi kết quả soát cấu trúc, phạm vi, phân bố đáp án và sửa câu. 21 câu được chỉnh trong lượt biên tập cuối, không loại cả câu; không còn lỗi cấu trúc hoặc câu trùng hoàn toàn đã phát hiện. Đây là kiểm định nội dung của tác giả, chưa phải duyệt độc lập bởi một giáo viên khác. Audio ghép từ quan hệ slide/tệp gốc, có hash và kiểm tra media; chưa có một lượt nghe chép độc lập toàn bộ 45 tệp.

## Kiểm tra tự động

- `node scripts/validate-hsk1.mjs`: 15 bài, 369 câu, 1.009 kiểm tra hàm chấm điểm, 45 hash audio; đạt. Kiểm tra câu đúng, sai, bỏ trống, điểm tự chấm không hợp lệ, câu sắp xếp tương đương và tách điểm mở rộng.
- `node scripts/validate-lessons.mjs`: cả 30 bài canonical đạt.
- `node scripts/validate-lesson-page-sync.mjs`: dữ liệu và giao diện HSK 2 bài 8–15 vẫn đồng bộ.
- `node scripts/validate-balanced-skills.mjs`: ma trận HSK 2 bài 8–15 đạt.
- JavaScript syntax: engine mới, điều hướng mới, kho ôn tập và script kiểm định đạt.
- HTML: 39 trang thêm/sửa không trùng ID, không thiếu tệp ở các tham chiếu nội bộ được kiểm tra.
- Đối chiếu với Git HEAD nền: toàn bộ script nội tuyến của 15 trang HSK 2 và tệp dữ liệu `data/lessons/hsk2` không đổi. Các trang HSK 2 chỉ nhận liên kết HSK 1 và phần điều hướng dùng chung.

## Kiểm tra trên trình duyệt

Microsoft Edge Chromium chạy bản local qua HTTP, bộ nhớ thử nghiệm riêng. Chi tiết lần chạy ở `QA_BROWSER_RESULTS.json` và `QA_POLISH_RESULTS.json`.

- Mở 15 bài, xem từ vựng và bắt đầu câu hỏi; không có lỗi JavaScript trong các luồng thử.
- Đọc metadata 45 tệp nghe, tổng thời lượng khoảng 1.590,1 giây. Thử phát, tạm dừng, đổi tốc độ và chuyển câu dừng âm cũ trên bài 11.
- Chọn đúng/sai, quay lại, tải lại và tiếp tục; đổi giao diện sáng/tối; kiểm tra dữ liệu HSK 2 không bị ghi đè.
- Nộp đủ/bỏ trống; chấm nghe và sắp xếp; cập nhật tự chấm vào cùng lần làm; tải lại giữ điểm; điểm mở rộng tách riêng; xem lịch sử và chi tiết; đóng hộp thoại bằng Escape; làm lại giữ lịch sử.
- Kho ôn tập HSK 1 đếm 15 bài/369 câu, lọc cấp/bài, lật thẻ, đánh dấu đã nhớ, xem phương án/đoạn đọc/lời giải, làm bài kiểm tra nhanh 10 câu. Chuyển HSK 2 vẫn có 15 bài.
- Menu HSK 1 từ trang chủ và 5 trang HSK 2; menu điện thoại và liên kết hồ sơ từ theo đúng bài. Các liên kết từ vựng cũ không có mã bài vẫn ưu tiên hồ sơ HSK 2 như trước.
- Bốn kích thước 1920×1080, 1366×768, 768×1024, 390×844: không cuộn ngang trong các trạng thái thử. Có ảnh kiểm tra phần tự luận/kết quả; bảng chọn câu và nút nộp giữ khả năng thao tác.
- Bản in kết quả bài 11 có đủ 25 câu, phương án, bài làm, đáp án, lời giải và tiêu chí. Bản in nền trắng độc lập với dark mode; đã render và nhìn kiểm tra trang đầu/cuối. Đây là bản in kết quả, không phải mẫu vở thứ tự nét.

## Lỗi được xử lý trong vòng trình duyệt

Thanh điều hướng từng bị đẩy khỏi màn hình khi câu ngắn làm chân trang xuất hiện; đã bỏ việc tự ẩn ở HSK 1. Lịch sử từng lưu trước điểm tự chấm; đã cập nhật theo ID lần làm. Câu tương đương ở bài sắp xếp đã được nhận. Kho ôn tập đã bổ sung đoạn đọc, phương án và bản mẫu; phân trang cho quá 100 câu. Bản in dark mode từng thiếu tương phản; đã tách bố cục in trắng. Tiêu chí tự chấm đã giảm cỡ chữ để đọc tốt trên điện thoại.

## Giới hạn

Chưa chạy trên iPhone/Safari hoặc thiết bị Android thật. Lưu tiến độ bằng localStorage trên trình duyệt hiện tại; chưa có tài khoản hay đồng bộ nhiều thiết bị. Nói/viết mở do người học hoặc giáo viên tự đánh giá, không phải điểm AI. Kiểm tra asset và metadata không chứng minh mọi câu nói trong audio đã được nghe duyệt độc lập. Trạng thái triển khai ngoài Internet cần ghi nhận riêng sau push và kiểm tra Pages.
