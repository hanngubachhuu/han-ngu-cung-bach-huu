# Hồ sơ nguồn — Phát âm và Pinyin

Cập nhật: 25/09/2026. Trang học chính: `phat-am.html`; `pinyin.html` chuyển tiếp và giữ các liên kết cũ. Khu vực tự kiểm tra: `admin/pinyin-sources.html`.

## Thư viện khẩu hình hiện tại

Theo yêu cầu mới, dùng **46 tệp MPG do chủ website cung cấp** tại D:\download\hsk\soan bai\hsk\web\img. Hai video Douyin được chọn trong đợt trước đã bị người dùng từ chối và được gỡ khỏi trang học.

Đã kiểm tra khung hình đầu và giữa của cả 46 tệp: các cảnh quan sát quay cận miệng/môi/răng, có phần cằm hoặc chân mũi, không có toàn bộ gương mặt. Đây là kiểm tra hình ảnh và kỹ thuật; các phiếu duyệt phát âm của giáo viên vẫn để trống. Tác giả gốc của thư viện chưa xác định, không gán tên hay giấy phép khi chưa có chứng cứ.

Script scripts/prepare-pinyin-media.py chuyển toàn bộ nội dung từng MPG sang MP4 H.264/AAC, giữ kích thước 352 × 288 và tạo ảnh chờ WEBP. Mỗi clip có một MP3 tách từ chính âm thanh của clip, dùng cho nút “Chỉ nghe âm” và khi video lỗi tải. Không cắt, nối hay tạo khẩu hình mới. Tệp nguồn được giữ nguyên. SHA-256, kích thước, thời lượng và ánh xạ nguồn nằm trong [basic-media-manifest.json](basic-media-manifest.json).

Quy đổi tên tệp: ch1 → ch, zh1 → zh, sh1 → sh, r1 → r, ue → ve. Giao diện hiển thị v/ve/vn thành ü/üe/ün. Bộ nhập môn gồm 21 thanh mẫu, 24 vận mẫu và hai chữ chính tả y/w; y/w được trình bày riêng, không cộng thành 23 thanh mẫu.

Thư viện **thiếu x**. Vì vậy có 47 ô chọn nhưng 46 video. Ô x dùng bản thu **xī** (audio/pinyin/xi1.mp3) từ bộ âm mẫu bên dưới, ghi rõ đây là âm tiết minh họa để nghe phần âm đầu x, không nhận là bản thu x độc lập. Các âm còn lại mở đúng clip riêng, không dùng một video tổng hợp cho nhiều ô.

Trình phát dùng tệp cùng website, chỉ tải khi được chọn, có tạm dừng, tốc độ 1/0,75/0,5, lặp ba lượt và chỉ nghe. Đổi âm, đóng hộp thoại, chuyển mục hoặc rời trang dừng mẫu cũ. Máy tính dùng khung bên cạnh bảng; điện thoại dùng hộp thoại với cùng một trình phát. Lỗi video chuyển sang MP3 cùng clip, lỗi audio có thông báo.

## Lịch sử video đã loại

Các video Douyin ID 7480865057459555595, 7646738541879364883 và loạt cũ 7096033338703613214, 7097533807473085733, 7099709465556946190, 7103464588951293196, 7105977196241571083 chỉ còn trong hồ sơ loại bỏ ở quản trị. Trang học không tải iframe Douyin, không dùng lại clip bị từ chối.

## Âm mẫu từng âm tiết

- Người thu: **Chen Wang**; dự án [hugolpz/audio-cmn](https://github.com/hugolpz/audio-cmn).
- Nguồn 64k/syllabs, commit ff9ed3d0c631195bd2c06f39450f3264c7124040.
- Giấy phép nguồn: **CC-by-sa**, không ghi phiên bản cụ thể. Giữ [README gốc](AUDIO_SOURCE_README.md), không tự gán số phiên bản.
- 1.620 MP3, 15.896.296 byte, giữ nguyên nội dung nhị phân. URL, SHA-256 và Git blob SHA từng tệp nằm trong [audio-manifest.json](audio-manifest.json).
- 405 âm tiết × 4 thanh. cmn-jv4.mp3 được ánh xạ thành ju4.mp3; v biểu diễn ü trong tên tệp, còn Pinyin bỏ hai chấm sau j.
- Bản thu dùng để luyện bốn thanh, không chứng minh mọi tổ hợp đều là một từ thông dụng. Chưa có bản thu thanh nhẹ trong từ/câu; không giả lập bằng đổi cao độ hay âm lượng.

Thông báo tác giả/giấy phép được giữ trong audio/pinyin/NOTICE.md và SOURCE_README.md cùng các tệp phân phối. Trang học không liệt kê tên người dạy hoặc danh sách nguồn; thông tin kiểm tra nằm trong quản trị.

## Quản trị và triển khai

Trang admin/pinyin-sources.html mở trực tiếp trên máy hoặc qua máy chủ xem trước. Có 46 hồ sơ thư viện, trình phát từng clip, đường dẫn tệp gốc, phiếu duyệt, ghi chú, lưu trình duyệt và xuất/nhập JSON. Chỉ một mẫu phát mỗi lúc; không được đánh dấu đã duyệt khi chưa đủ bốn mục kiểm tra. Phiếu duyệt không tự thay đổi học liệu công khai. Đây là công cụ cục bộ, chưa phải hệ thống đăng nhập hay quản trị nhiều người.

Workflow loại admin/ và docs/pinyin/ khỏi GitHub Pages. Các tệp vẫn có thể được xem trong kho mã nguồn công khai; không lưu bí mật ở đây. Thông báo giấy phép đi cùng audio vẫn được phát hành.

## Nội dung biên soạn

Ghép âm, y/w, ü, iou→iu, uei→ui, uen→un và đặt dấu được đối chiếu [《汉语拼音方案》](https://zh.wikisource.org/zh/汉语拼音方案). Bảng 405 âm tiết phục vụ học tập, không bao gồm mọi thán từ, âm hiếm hoặc phương ngữ. i sau zh/ch/sh/r và z/c/s dùng cột -i riêng.

Hướng dẫn dành cho người Việt: không đồng nhất thanh 2 với dấu sắc, thanh 3 với dấu hỏi; phân biệt bật hơi và không bật hơi, không đọc b/d/g theo tiếng Việt. Bài nghe mở lựa chọn sau khi nghe hết mẫu, có giải thích và luyện lại câu sai.

Đã chuẩn hóa lời hướng dẫn cho b/d/g/j/zh/z thành “không bật hơi”, đối chiếu [PolyU — Initial groups](https://www.polyu.edu.hk/bepth/introduction-to-phonetics/initials/initial-groups/). Tránh cách viết “bật hơi nhẹ” làm lẫn đối lập với p/t/k/q/ch/c.

Tham khảo chức năng bảng, bộ lọc và hộp thanh điệu trong ảnh Nhai HSK người dùng cung cấp. Mã, lời hướng dẫn và nhận diện Bách Hữu được làm riêng. Chưa có thu âm/chấm phát âm tự động, nhận diện khẩu hình hoặc đồng bộ tài khoản.
