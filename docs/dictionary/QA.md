# Kiểm tra từ điển — 27/09/2026

## Bản dựng và dữ liệu

- `npm run lint`: đạt.
- `npm test`: 23/23 đạt. Bao gồm thứ tự nghĩa thường/tên riêng, giữ dấu thanh khi ghép dữ liệu, HSK trước phân trang, giao với sổ từ, không trộn framework, giữ nghĩa giáo trình, lịch sử hỏng/không ghi được và phạm vi dữ liệu công khai.
- `npm run build`: đạt; build từ nguồn đã khóa phiên bản, không tải nguồn ngoài khi build.
- `npm run validate:study`: đạt; 28 kiểm tra cú pháp, ranh giới bài công khai, 119.044 mục từ, 103.013 chữ, hash nguồn, nén gzip, giấy phép và 214 bộ thủ.
- `node scripts/validate-lessons.mjs`: đạt 30 bài canonical.
- 5.072 từ có nhãn cấp độ; 4.703 ví dụ bổ sung. 222 khác biệt cấp và 255 khác biệt cách ghi pinyin được giữ trong `data-audit.json`. Đây là danh mục tham chiếu có nhãn nguồn, không phải chứng nhận thẩm định ngôn ngữ toàn bộ.

## Kiểm tra trực tiếp trong trình duyệt Chromium

- 375 / 768 / 1024 / 1440 px: không tràn ngang. 375 px mở/đóng bộ lọc, danh sách cuộn, chọn từ đưa chi tiết xuống dưới thanh điều hướng; 768 và 1024 px dùng hai cột; 1440 px dùng ba cột.
- `學校`, `xue2xiao4`, `truong hoc` → 学校; `lu:3you2` → 旅游. Tìm kiếm không khớp hiển thị 0 kết quả và hướng dẫn bỏ lọc.
- HSK 1 có 150 mục; HSK 2 cộng cấp thấp hơn có 298 mục (bao gồm tài liệu bổ sung có đánh dấu). Trang 2/25 giữ nguyên sau tải lại URL; chọn từ và nút quay lại phục hồi trạng thái.
- Từ đã lưu giữ sau tải lại; giao với tìm kiếm hoạt động. Bàn phím trái/phải chuyển tab và cập nhật nhãn tabpanel.
- 学习 có nghĩa, giản/phồn, pinyin, Hán Việt và ví dụ kèm sheet/dòng. Tab Hán tự trả 学: bộ 子, 8 nét; 习: bộ 乙, 3 nét. Liên kết sang công cụ Hán tự mở được luyện nét chữ 学.
- Tab Kết hợp từ với 学 trả dữ liệu thật; 大学 ưu tiên nghĩa trường đại học và giữ nhóm nghĩa tên sách.
- Ngữ pháp tra trong học liệu công khai; mở danh mục đầy đủ được.
- Khi máy thiếu giọng tiếng Trung, nút nghe báo đúng tình trạng; không gọi dịch vụ TTS trả phí.
- Trong Đọc hiểu, nhập `我在學校学习人工智能。图书馆里有很多书。`, tra tại chỗ 学校 nhận HSK 1 và ví dụ Excel có nhãn chưa thẩm định. Trang Hán tự cũng nhận nhãn/ví dụ từ repository chung.
- Không ghi nhận console error/warning trong các luồng đã kiểm tra tại localhost.

## Giới hạn

Chưa kiểm tra thiết bị iPhone/Android vật lý, Safari, giọng đọc thật trên từng hệ điều hành hoặc đăng nhập bằng tài khoản người dùng. Bộ browser test CI cũ được cập nhật selector theo UI mới; kiểm tra tương tác tại máy dùng công cụ trình duyệt trực tiếp. Kho 21 PDF và 2 DOCX mới được lập danh mục/hash, chưa nhập nội dung chưa đối chiếu vào bài học.
