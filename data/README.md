# Bộ khung dữ liệu Hán Ngữ Cùng Bách Hữu

## Mục đích

Thư mục `data/` là **nguồn dữ liệu chuẩn** cho hệ thống HSK/HSKK. Giao diện HTML không phải nơi lưu trữ dữ liệu chuẩn lâu dài.

Nguyên tắc quan trọng:

1. Không tự ý thêm học liệu mới vào hệ thống khi chưa có sự cho phép của giáo viên.
2. Dữ liệu nội dung và giao diện được tách biệt.
3. Mỗi thực thể có ID ổn định, không đổi theo tên hiển thị.
4. Mỗi nội dung có trạng thái vòng đời: draft → review → published → archived.
5. Nội dung phải có nguồn hoặc được đánh dấu rõ là nội dung do giáo viên tự biên soạn.
6. Phiên bản của hệ thống đề thi được lưu trên từng nội dung, không hard-code toàn hệ thống vào một phiên bản duy nhất.
7. Đáp án và dữ liệu chấm điểm nhạy cảm không được gộp vào payload dành cho học sinh.
8. Mọi thay đổi quan trọng phải có version, thời điểm và người/nguồn thay đổi.
9. HSKK có mô hình task riêng, nhưng tái sử dụng các thành phần chung như metadata, source, QA, media.
10. HTML hiện tại được xem là **legacy content**. Giai đoạn đầu chỉ lập khung, không xóa hoặc thay đổi học liệu hiện có.

## Cấu trúc dự kiến

```text
data/
├─ schema/              # Hợp đồng dữ liệu, không phải học liệu
├─ catalog/             # Danh mục và registry của toàn hệ thống
├─ hsk/                 # Nội dung chuẩn hóa HSK
├─ hskk/                # Nội dung chuẩn hóa HSKK
├─ shared/              # Thực thể dùng chung
└─ qa/                  # Báo cáo/luật kiểm định dữ liệu
```

## Mô hình 4 lớp

**Lớp 1 — Canonical data:** dữ liệu chuẩn, có ID và version.

**Lớp 2 — Curriculum mapping:** liên kết dữ liệu với chương trình, cấp độ, bài học, kỹ năng và phiên bản đề thi.

**Lớp 3 — Presentation:** HTML/JS/React hoặc framework khác chỉ đọc dữ liệu để hiển thị.

**Lớp 4 — User state:** tài khoản, tiến độ, lịch sử làm bài, điểm số và phân tích. Lớp này sẽ đặt ở backend/database khi hệ thống cần.

Không để trạng thái học sinh lẫn vào dữ liệu học liệu gốc.

## Trạng thái xuất bản

- `draft`: bản nháp, chưa công khai.
- `review`: đang/đợi kiểm định.
- `published`: đã được phép hiển thị cho học sinh.
- `archived`: ngừng dùng nhưng giữ lịch sử.

## Quy tắc đáp án

Bài tập được tách thành:

```text
public item
   │
   └── answerKeyRef ──> answer key
```

Mục tiêu là về sau backend có thể trả đề cho học sinh mà không gửi toàn bộ đáp án xuống trình duyệt.

## Trạng thái hiện tại

Đợt triển khai này **chỉ xây khung dữ liệu và công cụ kiểm soát chất lượng**. Không thêm bài giảng, từ vựng, câu hỏi hay đáp án mới.
