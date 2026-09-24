# Bảng Pinyin — kết quả kiểm tra

Ngày 24/09/2026. Phạm vi: `pinyin.html`, dữ liệu/âm mẫu, liên kết điều hướng và quản trị nguồn cục bộ.

## Dữ liệu và âm thanh

`node scripts/validate-pinyin.mjs` đạt: 405 ô âm tiết duy nhất, 21 thanh mẫu và nhóm âm đầu rỗng; 1.620 MP3, tổng 15.896.296 byte, không thiếu mẫu bốn thanh. Kiểm tra cả SHA-256 và Git blob SHA so với manifest nguồn. Kiểm tra chính tả ü, y/w, iou/uei/uen, -i và vị trí đặt dấu. Tệp upstream jv4 được ánh xạ sang ju4.

`QA_AUDIO_RESULTS.json`: 1.620/1.620 tệp giải mã được bằng Chromium, có tín hiệu PCM không im lặng; mỗi tệp dài 0,888–1,68 giây. Không có mẫu thanh nhẹ giả. Đây là kiểm tra kỹ thuật, không phải lượt nghe duyệt độc lập toàn bộ phát âm.

## Trình duyệt và bài luyện

`QA_BROWSER_RESULTS.json` ghi lần chạy đầy đủ sau thay video ngày 24/09/2026 theo giờ Việt Nam:

- Bảng 405 âm, bộ lọc kết hợp, trạng thái không có kết quả; tìm lu:4 mở đúng lǜ và lv4.mp3.
- Lưu âm cần luyện, tải lại còn dữ liệu; đóng hộp thoại bằng Escape dừng âm.
- Nghe lặp ba lần, tốc độ 0,85, nghe nối bốn thanh; mẫu ju4 phát được.
- Lỗi tải audio có phản hồi và không mở đáp án trước khi nghe thành công.
- Mỗi nhóm luyện (thanh điệu, bật hơi, vị trí lưỡi, -n/-ng, u/ü và n/l) chạy 10 câu khác nhau, có phát audio thật; cố ý sai một câu, chấm đúng 9/10. Luyện lại câu sai và lưu kết quả theo nhóm hoạt động.
- Video tải khi bấm, đổi hoặc đóng sẽ bỏ iframe cũ. Bài kiểm tra tích hợp dùng iframe giả có kiểm soát; khả năng phát bên ngoài được kiểm tra riêng bằng Chrome.
- Không tràn ngang ở 1920, 1366, 768, 390 px; menu/thẻ âm trên điện thoại, hộp âm zhuang và năm nút thanh không tràn.
- Trang chủ index/trang-chu, bài HSK 1 và HSK 2 có lối vào Pinyin. Chặn localStorage vẫn học được, hiện thông báo đúng.
- Không có lỗi JavaScript trong các luồng được kiểm tra.

## Video bên ngoài

Hai ID `7480865057459555595` và `7646738541879364883` đã mở bằng trình phát chính thức Douyin trên Chrome; video chạy và thời gian phát tiến lên. Các cảnh quan sát là cận môi/răng, không có mặt người dẫn trong hình chính. Hồ sơ quản trị ghi rõ phạm vi quan sát, để trống bước duyệt chuyên môn của giáo viên.

Trình phát vẫn có thể hiện ảnh đại diện/tên tài khoản riêng của Douyin. Ảnh bìa video dọc có thể bị cắt trước khi bấm phát; khi chạy, video nằm vừa trong khung. Có toàn màn hình và mở trình phát riêng. Không dùng video người dẫn cũ trong dữ liệu công khai.

## Quản trị nguồn

`QA_ADMIN_RESULTS.json`: hai hồ sơ nguồn đúng tác giả/ID; các mục duyệt để trống khi mới mở. Đã thử lưu ghi chú và trạng thái, không cho đánh dấu video đã duyệt khi chưa đủ bốn mục kiểm tra. Xuất/nhập JSON khôi phục được trạng thái; JSON lỗi không làm mất phiếu cũ. Nghe mẫu được và đổi lựa chọn dừng mẫu cũ. Mở trực tiếp bằng file local được. Kiểm tra desktop/mobile không tràn ngang. Trang học không liệt kê tên tác giả hoặc hồ sơ nguồn.

Chiều cao iframe được kiểm tra ở 1366/768/390 px, có đủ chỗ cho thanh điều khiển, không bị vòng lặp tăng kích thước. `admin/` và `docs/pinyin/` được loại khỏi bản triển khai. Giấy phép audio vẫn đi cùng tệp phân phối.

## Hồi quy và giới hạn

Các validator 30 bài canonical, HSK 1 (369 câu, 1.009 kiểm tra chấm điểm, 45 hash audio), cân bằng kỹ năng HSK 2 và đồng bộ bài 8–15 đều đạt. Không sửa ngân hàng HSK 2 trong đợt Pinyin. Đã khôi phục script dựng nội dung trang chủ index từ trang-chu để trang vào chính không bị trống danh sách cấp học.

Chưa thử Safari/iPhone hoặc Android thật; chưa có tài khoản/đồng bộ, tự chấm phát âm hay thu âm người học. Quản trị là bản cục bộ, phiếu duyệt không tự sửa học liệu công khai. Trạng thái GitHub Pages và kiểm tra sau triển khai được ghi riêng trong báo cáo hoàn thành tại thư mục làm việc.
