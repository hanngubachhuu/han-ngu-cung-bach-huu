# Nghiên cứu và triển khai từ điển — 27/09/2026

## Nguồn thiết kế chính

Quan sát trực tiếp [Hanzii tiếng Việt](https://hanzii.net/?hl=vi) và [mục từ 学习](https://hanzii.net/search/word/%E5%AD%A6%E4%B9%A0?hl=vi): thanh tra theo chữ/pinyin, năm hướng tra Từ vựng / Hán tự / Ví dụ / Ngữ pháp / Kết hợp từ; chữ giản-phồn, phiên âm, Hán Việt, nhãn cấp, nghĩa theo nhóm, ví dụ, từ ghép và tra từng chữ; trang chủ có lịch sử, chủ đề và cấp HSK. Đây là tham khảo cấu trúc và tương tác. Không lấy kho dữ liệu, nội dung trả phí, logo hoặc hình ảnh của Hanzii.

## Quyết định thiết kế

- Intent: công cụ tra cứu và học từ trong ngữ cảnh. Mức chuyển động tối thiểu, chỉ trạng thái focus/hover/loading.
- Desktop: kết quả bên trái, chi tiết chính giữa, HSK/sổ từ/lịch sử bên phải. Mobile/tablet: mở bộ lọc ngay cạnh ô tìm kiếm; mobile có danh sách kết quả cuộn riêng, chọn từ sẽ đi đến chi tiết; giữ một DOM cho mỗi điều khiển.
- Giữ bảng màu Chu Sa / giấy ấm, font tiếng Việt và chữ Hán, navigation hiện tại. Thẻ từ và phát âm dùng thành phần cũ; tạo riêng renderer cho danh sách kết quả, tab và tài liệu liên quan.
- Tab dùng bàn phím trái/phải/Home/End; truy vấn, tab, cấp, trang và mục từ có URL để mở lại. Hỗ trợ nhập IME và loại kết quả async cũ.
- Dữ liệu chưa có (ảnh minh họa, bộ đồng nghĩa/trái nghĩa đã duyệt, phân tích kết hợp từ) không được bịa để lấp bố cục. Liên kết Hanzii theo đúng từ đang tra giúp đối chiếu bổ sung.

## Kiểm tra nguồn từ vựng

Excel có 5.002 dòng, 4.896 từ khác nhau; số dòng cấp 1–6: 149 / 150 / 295 / 600 / 1.295 / 2.513. Import phát hiện 47 vấn đề cấu trúc/ví dụ và không dùng câu không chứa từ đang minh họa. Đây là lọc cơ học, không phải thẩm định ngôn ngữ.

Danh mục [Complete HSK Vocabulary](https://github.com/drkameleon/complete-hsk-vocabulary) khóa commit `7ac65bf1a6387d35f1ade478906172a19311c7f9`, chỉ dùng nhãn HSK 2.0; có 4.991 mục khác nhau. Hợp nhất với Excel thành 5.072 từ, 81 từ chỉ có ở Excel. Có 222 dòng không cùng cấp giữa nhãn giữ lại và sheet nguồn; chi tiết trong `data-audit.json`. Không tự đổi tên tập này thành danh sách thi chính thức 5.000 từ.

4.703 ví dụ được giữ với nguồn sheet/dòng và nhãn chưa thẩm định. Kiểm tra cách đọc giữ nguyên dấu thanh: 255 dòng có pinyin không trùng danh mục được ghi riêng để đối chiếu, không ghép nghĩa/ví dụ vào cách đọc khác. Con số này gồm cả biến thể ghi âm, chưa đồng nghĩa với 255 lỗi. Không mặc định toàn bộ câu cùng cấp HSK của mục từ, không dùng ví dụ này làm đáp án chấm điểm. Cấp từ là HSK 2.0; không trộn chuẩn 2021 hoặc đề cương 2025.

Với kho CVDICT, mục nghĩa từ thông thường đứng trước mục tên riêng (pinyin viết hoa), ví dụ 大学 hiển thị “trường đại học” trước tên sách Đại học. Khi từ có nhãn HSK, ưu tiên cách đọc khớp danh mục và giữ các nhóm nghĩa còn lại. Nội dung giáo trình vẫn luôn được ưu tiên.

## Kho tài liệu dùng chung

`sources/study/materials-manifest.json` ghi hash, tên và trạng thái 24 tệp nguồn. Nội dung 1 Excel đã được trích. 21 PDF và 2 DOCX cần trích/đối chiếu theo trang trước khi nhập bài học; không công khai PDF nguyên bản hoặc tự coi tài liệu scan đã được đọc. Dữ liệu từ vựng hiện đã đi qua repository dùng chung nên cửa sổ tra trong bài đọc và mục từ ở trang Hán tự cũng nhận phân cấp/ví dụ mới.

## Phạm vi miễn phí

Tra kho từ, năm tab, phân cấp, sổ từ khách và lịch sử chạy bằng tệp tĩnh/JavaScript. Phát âm dùng giọng tiếng Trung có trên thiết bị; thiếu giọng có thông báo. Không thêm SDK dịch vụ trả phí, API key hoặc lệnh gọi nhà cung cấp AI. Đồng bộ tài khoản dùng kết nối sẵn có; không bắt đăng nhập để tra cứu.
