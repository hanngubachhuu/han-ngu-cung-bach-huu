# Hồ sơ nguồn — Bảng Pinyin

Cập nhật: 24/09/2026. Trang học: `pinyin.html`. Khu vực tự kiểm tra: `admin/pinyin-sources.html`.

## Video được chọn

Tiêu chí người dùng: nội dung video chỉ quay cận miệng, không có mặt người dẫn. Hai video dưới đây thay thế loạt 5 video có người dẫn trước đó.

| Mục trên trang học | Tài khoản gốc | Tiêu đề gốc | Nguồn |
|---|---|---|---|
| Khẩu hình thanh mẫu | 布兰希尔儿童言语发展中心 | 声母发音标准口型示范 | https://www.douyin.com/video/7480865057459555595 |
| Khẩu hình vận mẫu | 郑老师讲语言干预 | 所有韵母正确口型 | https://www.douyin.com/video/7646738541879364883 |

Đã kiểm tra các cảnh cận môi/răng trong trình phát trực tiếp. Clip thanh mẫu dài khoảng 20 giây, clip vận mẫu khoảng 47 giây. Mốc hình ảnh đã quan sát và giới hạn kiểm tra được ghi trong `admin/pinyin-sources-data.js`. Không coi kiểm tra một số cảnh là chứng nhận chuyên môn toàn bộ clip. Các phiếu giáo viên duyệt ban đầu để trống.

Tên tác giả, tiêu đề gốc và danh mục nguồn được chuyển vào khu vực quản trị. Giao diện học sinh chỉ ghi chủ đề và hướng dẫn học. Trình phát chính thức của Douyin vẫn có thể hiển thị tên tài khoản, ảnh đại diện, logo và các lớp giao diện riêng; website không che hoặc sửa các lớp này. Phần hình chính của các clip đã chọn là cận miệng.

Dùng [trình phát iframe theo tài liệu Douyin](https://developer.open-douyin.com/docs/resource/zh-CN/dop/develop/openapi/video-management/douyin/iframe-player/get-iframe-by-item). Không tải lại/cắt/tách âm của video Douyin. Chỉ tải iframe sau khi người học bấm mở; đổi bài, đóng video, nghe âm mẫu hoặc rời trang sẽ dừng trình phát cũ. Video dọc hiển thị vừa trong vùng phát khi bắt đầu chạy, có nút toàn màn hình. Liên kết “Mở trình phát riêng” là phương án dự phòng khi iframe không phát. Khả năng phát còn phụ thuộc Douyin, vùng mạng và trình duyệt.

Loạt cũ của 青蓝中文 (ID 7096033338703613214, 7097533807473085733, 7099709465556946190, 7103464588951293196, 7105977196241571083) được giữ trong hồ sơ loại bỏ, không còn trong dữ liệu trang học.

## Âm mẫu từng âm tiết

- Người thu: **Chen Wang**; dự án [hugolpz/audio-cmn](https://github.com/hugolpz/audio-cmn).
- Nguồn `64k/syllabs`, commit `ff9ed3d0c631195bd2c06f39450f3264c7124040`.
- Giấy phép nguồn: **CC-by-sa**, không ghi phiên bản cụ thể. Không tự gán số phiên bản; giữ [README gốc](AUDIO_SOURCE_README.md).
- 1.620 tệp MP3, 15.896.296 byte, giữ nguyên nội dung nhị phân. URL, SHA-256 và Git blob SHA từng tệp nằm trong [audio-manifest.json](audio-manifest.json).
- 405 âm tiết × 4 thanh. Nguồn `cmn-jv4.mp3` được ánh xạ thành `ju4.mp3`; v biểu diễn ü trong tên tệp, còn Pinyin bỏ hai chấm sau j.
- Bản thu là âm tiết luyện bốn thanh, không phải danh mục chứng minh mọi tổ hợp đều là một từ thông dụng.
- Không giả lập thanh nhẹ bằng thanh 1, giảm âm lượng hoặc đổi cao độ. Mục này chưa có bản thu thanh nhẹ trong từ/câu.

Âm tra nhanh không lấy từ Douyin. Các bản thu độc lập giúp bấm ô là nghe đúng âm và đúng thanh, không phải tìm mốc trong video. Thông báo tác giả/giấy phép được giữ trong `audio/pinyin/NOTICE.md` và `SOURCE_README.md` cùng các tệp phân phối; chi tiết nguồn và màn hình duyệt nằm trong quản trị.

## Quản trị và triển khai

`admin/pinyin-sources.html` mở được trực tiếp trên máy hoặc qua máy chủ xem trước. Có đường dẫn nguồn, nghe từng bản thu, phiếu duyệt, ghi chú, lưu trình duyệt, xuất/nhập JSON. Phiếu duyệt không tự thay đổi danh sách video công khai. Đây chưa phải hệ thống đăng nhập hay quản trị nhiều người.

Workflow triển khai loại `admin/` và `docs/pinyin/` khỏi GitHub Pages. Các tệp vẫn có thể được xem trong kho mã nguồn nếu kho công khai; không lưu bí mật tại đây. Thông báo giấy phép đi cùng audio vẫn được phát hành.

## Nội dung biên soạn

Ghép âm, y/w, ü, iou→iu, uei→ui, uen→un và đặt dấu được đối chiếu [《汉语拼音方案》](https://zh.wikisource.org/zh/汉语拼音方案). Bảng 405 âm tiết phục vụ học tập, không bao gồm mọi thán từ, âm hiếm hoặc phương ngữ. i sau zh/ch/sh/r và z/c/s dùng cột `-i` riêng.

Diễn giải và bài nghe được soạn cho người Việt: không đồng nhất thanh 2 với dấu sắc, thanh 3 với dấu hỏi; phân biệt bật hơi và không bật hơi, không đọc b/d/g theo tiếng Việt. Bài nghe có một đáp án đúng, mở lựa chọn sau khi nghe hết mẫu, giải thích và luyện lại câu sai.

Tham khảo cấu trúc bảng, bộ lọc và hộp thanh điệu trong ảnh Nhai HSK người dùng cung cấp. Mã, lời hướng dẫn và nhận diện Bách Hữu được làm riêng. Chưa có thu âm/chấm phát âm tự động, nhận diện khẩu hình hoặc đồng bộ tài khoản.
