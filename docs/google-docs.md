# Đồng bộ Google Docs

Trạng thái: code và kiểm thử adapter/merge/permission đã có; CHƯA kết nối end-to-end với thông tin OAuth của website. Tài khoản Google connector đã được xác minh là `bachhuu1809@gmail.com`, nhưng token của connector không phải credential để đưa vào Vercel.

Mỗi hồ sơ quản lý có UUID trong documents và google_document_id duy nhất. Tên tài liệu hoặc email không dùng làm khóa. Website đọc dữ liệu hoạt động từ PostgreSQL; không đọc Google Doc mỗi lần học viên đăng nhập.

|Loại|Trường|
|---|---|
|GOOGLE_EDITABLE|full_name, phone, learning_goal|
|READ_ONLY|UUID học viên, mapping và trạng thái sync do hệ thống hiển thị|
|SYSTEM_CONTROLLED|role, approval, enrollment, lesson grants, scores, Auth, audit|

Một block JSON nằm giữa `[HNH_PROFILE_BEGIN]` và `[HNH_PROFILE_END]`. Chỉ ba chuỗi được cho phép, có giới hạn độ dài. Nhiều block, marker lỗi hoặc trường lạ sẽ bị từ chối. Ghi chú tự do ngoài block được giữ nguyên và không nhập vào dữ liệu tài khoản. Tài liệu có bảng/tab phức tạp chưa hỗ trợ; adapter báo lỗi thay vì đoán.

Quản trị chọn “Xem thay đổi” để đối chiếu bản gốc lần sync trước, bản website và bản Google. Hai nơi sửa khác trường thì gộp; cùng trường sửa khác nhau phải chọn từng bản giữ lại. Apply cần profile_version + sync_version + Google requiredRevisionId. Không dùng timestamp hoặc tên để quyết định ai thắng.

Lệnh start tạo lease hai phút; complete kiểm tra operation và version, cập nhật profile/base/log trong cùng transaction. Google write dùng revision bắt buộc. Nếu Google đã ghi nhưng DB chưa commit, trạng thái ERROR và dữ liệu nền cũ được giữ, yêu cầu preview lại; không báo thành công giả. Retry cùng thao tác không tự overwrite xung đột. Nếu tạo Doc thành công nhưng bind thất bại, giữ và hiển thị ID để xử lý, không tự xóa tài liệu.

OAuth chỉ ở máy chủ: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN. Dùng Google Cloud project của chủ sở hữu, bật Docs API, scope `https://www.googleapis.com/auth/drive.file openid email`, offline access và consent của đúng tài khoản. `drive.file` đủ cho các tài liệu do ứng dụng tạo và giới hạn quyền ở từng file; không yêu cầu quyền đọc toàn bộ tài liệu cá nhân. Đặt credentials trong Vercel environment tương ứng, không commit và không gửi vào chat. Adapter xác minh email + email_verified trước thao tác. Không tự cấp quyền công khai hoặc gửi chia sẻ tài liệu. Xem [hướng dẫn chủ tài khoản thiết lập Google từ đầu](GOOGLE_SETUP_FOR_OWNER.md).

Kiểm thử tích hợp sau cấu hình: tạo hồ sơ giả được phép; sửa một trường mỗi phía; sửa cùng trường; thay role trong block phải lỗi; sửa Google giữa preview/apply phải lỗi; mô phỏng lỗi DB sau Google write; kiểm tra sync_logs và retry. Chưa chạy các tình huống đó với Google thật.

Nguồn: [Google Docs batchUpdate và requiredRevisionId](https://developers.google.com/workspace/docs/api/reference/rest/v1/documents/batchUpdate), [phạm vi cấp quyền Google Docs](https://developers.google.com/workspace/docs/api/auth).
