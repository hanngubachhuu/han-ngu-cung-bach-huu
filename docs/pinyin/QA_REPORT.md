# Phát âm — kết quả kiểm tra

Ngày 25/09/2026 (giờ Việt Nam). Phạm vi hiện tại: trang phat-am.html, chuyển tiếp pinyin.html, 46 video thư viện, audio dự phòng, bảng Pinyin và quản trị nguồn cục bộ.

## Dữ liệu và học liệu

Validator scripts/validate-pinyin.mjs đạt: 47 ô âm cơ bản, gồm 21 thanh mẫu, 24 vận mẫu và y/w; 46 video, 46 MP3 cùng clip và 46 ảnh chờ khớp SHA-256 trong manifest. x chưa có video, dùng mẫu xī với lời giải thích rõ. Các ID Douyin bị từ chối không còn trong mã trang học.

Bảng ghép âm giữ 405 ô duy nhất và 1.620 MP3 bốn thanh, tổng 15.896.296 byte; tất cả khớp SHA-256 và Git blob SHA. Kiểm tra chính tả ü, y/w, iou/uei/uen, -i và vị trí dấu đạt. Không có mẫu thanh nhẹ giả.

QA_LOCAL_MEDIA_DECODE_RESULTS.json kiểm tra giải mã toàn bộ 46 MP4 và 46 MP3 được tách, phát hiện tệp hỏng hoặc audio im lặng; đối chiếu SHA-256 của 46 MPG gốc để xác nhận nguồn không bị sửa.

Kết quả lịch sử QA_AUDIO_RESULTS.json xác nhận 1.620/1.620 MP3 giải mã được bằng Chromium và có tín hiệu PCM, thời lượng 0,888–1,68 giây; bộ tệp này không thay đổi. Kiểm tra kỹ thuật không thay thế lượt nghe duyệt chuyên môn của giáo viên.

## Giao diện và luồng học mới

QA_WORKSPACE_RESULTS.json ghi lượt kiểm tra cục bộ sau thay đổi cuối cùng:

- Bấm lần lượt cả 47 ô: 46 video tương ứng thực sự phát, kích thước 352 × 288; x thực sự phát xi1.mp3. Không dùng iframe bên ngoài, không tải MP4/MP3 khi vừa vào trang.
- Lọc 21/24/2 ô theo nhóm, tìm ü bằng u:, trạng thái không có kết quả và đặt lại hoạt động. Lưu âm cần luyện còn sau khi tải lại.
- Nút phát/tạm dừng, chỉ nghe, thay tốc độ và lặp đúng ba lượt phát hoàn chỉnh hoạt động. Chuyển mẫu dừng âm cũ.
- Chủ động chặn video a: giao diện tự dùng đúng MP3 tách từ clip a.
- Bảng 405 âm giữ nguyên; lu:4 mở lǜ; từ hộp âm tiết có thể mở đúng khẩu hình ü và dừng audio cũ.
- Bài nghe vẫn khóa lựa chọn đến khi nghe hết; nghe nối bốn thanh hoạt động.
- Đường dẫn cũ pinyin.html#videos và pinyin.html#chart tới đúng mục trang mới.
- Các chiều rộng 1440, 1024, 850, 768, 390, 375 px không tràn ngang. Điện thoại chỉ có một trình phát trong hộp thoại; đóng/Escape dừng video và audio.
- Đổi từ điện thoại sang màn hình lớn đưa cùng trình phát về cột bên cạnh, không nhân đôi hoặc kẹt hộp thoại.
- Chặn localStorage vẫn học được, hiện thông báo phù hợp. Không có lỗi JavaScript trong các luồng đã thử.

Đã xem ảnh dựng desktop và mobile để kiểm tra bố cục, cỡ chữ, video và điều khiển. Giữ menu/chân trang chung, không thêm bản sao điều hướng.

## Quản trị nguồn

QA_LOCAL_MEDIA_ADMIN_RESULTS.json: đủ 46 hồ sơ thư viện, 7 clip Douyin chỉ còn trong lịch sử loại bỏ. Bốn mục duyệt bắt buộc, lưu ghi chú, xuất/nhập JSON và bố cục 390 px hoạt động. Mở bằng file:/// vẫn phát video cục bộ. Phiếu duyệt mặc định để trống. Trang học không đưa tên người dạy hoặc nguồn vào luồng học.

Workflow vẫn loại admin/ và docs/pinyin/ khỏi bản Pages. Giấy phép của bộ audio trực tuyến vẫn đi cùng các tệp phân phối. Phiếu quản trị cục bộ không tự sửa nội dung công khai.

## Hồi quy và giới hạn

Validator 30 bài canonical và HSK 1 đạt: 15 bài, 369 câu, 1.009 kiểm tra chấm điểm, 45 hash audio. Đợt này không sửa ngân hàng bài tập, menu hay trang chủ. JavaScript và kiểm tra diff đạt.

Các báo cáo QA_BROWSER_RESULTS.json, QA_ADMIN_RESULTS.json, QA_INTEGRATION_RESULTS.json lưu bằng chứng của bản trước; phần video Douyin trong chúng đã được thay thế bằng hai báo cáo mới nói trên, không dùng để mô tả bản hiện tại.

Chưa kiểm thử trên Safari/iPhone hoặc Android thật. Chưa có thu âm/tự chấm phát âm, đồng bộ tài khoản; x dùng âm tiết minh họa, chưa có clip riêng. Báo cáo triển khai công khai được ghi sau khi GitHub Pages hoàn tất trong báo cáo hoàn thành ở thư mục làm việc.
