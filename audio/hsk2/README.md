# Audio HSK 2

Mỗi câu nghe Bài 8–11 đã có đường dẫn file cố định trong dữ liệu bài học, nhưng trang chỉ phát khi trạng thái được đánh dấu là `ready`. Điều này tránh hiển thị một nút phát không có âm thanh.

Xuất kịch bản thu âm bằng lệnh:

```powershell
node scripts\export-hsk2-recording-script.mjs
```

Yêu cầu thu:

- MP3 mono, 44.1 kHz hoặc 48 kHz; giọng Quan thoại phổ thông, tự nhiên, không nhạc nền.
- Đọc một lần, tốc độ vừa phải; không đọc số câu hay phương án đáp án.
- Giữ đúng tên và thư mục do kịch bản xuất, ví dụ `audio/hsk2/bai8/b8-a15.mp3`.

Khi có đủ file, chỉ cần đổi `audioStatus` của từng câu từ `awaiting_recording` thành `ready`; trình phát trên web sẽ dùng tệp thật thay vì công cụ đọc của trình duyệt.
