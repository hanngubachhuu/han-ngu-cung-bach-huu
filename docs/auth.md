# Xác thực

Trang chuẩn là `tai-khoan.html`; Vercel thêm alias `/login`, `/register`. GitHub Pages dùng đường dẫn tương đối đến trang HTML. `next` chỉ nhận trang HTML cùng origin và trong đường dẫn triển khai, không truyền token hoặc query khôi phục.

Đăng ký gửi tên và thông tin đăng nhập tới Supabase Auth. Trigger cơ sở dữ liệu tự tạo STUDENT/PENDING; `user_metadata.role`, email hoặc localStorage không thể cấp ADMIN. Sau xác nhận email, quản trị duyệt và cấp khóa/bài. Tài khoản đã có quyền học trước migration được giữ APPROVED để không mất quyền đang dùng.

Form có nhãn, autocomplete, hiện/ẩn mật khẩu, trạng thái đang gửi, lỗi tiếng Việt và chống bấm lặp. Mật khẩu mới từ 12 đến 128 ký tự; phải cấu hình giới hạn tối thiểu 12 ở Auth server trước phát hành vì kiểm tra frontend không phải hàng rào bảo mật.

Quên mật khẩu trả thông báo chung để không xác nhận email tồn tại. Màn đặt mật khẩu mới chỉ mở sau sự kiện PASSWORD_RECOVERY; tự thêm `?mode=reset` không đủ. Sau thay đổi sẽ đăng xuất và yêu cầu đăng nhập lại. Gửi lại email có cooldown ở giao diện; giới hạn thực tế phải ở nhà cung cấp Auth.

Phiên được Supabase SDK quản lý. Sự kiện đổi user xóa cache giao diện, bài riêng chuyển về tài khoản. Không tự nhập lịch sử khách vào người vừa đăng nhập. Trình duyệt lưu phiên nên XSS vẫn là rủi ro quan trọng: giữ code tin cậy, escape dữ liệu, tránh thêm script bên thứ ba không kiểm soát. Chưa chuyển sang kiến trúc cookie HttpOnly/BFF.

Việc cần kiểm tra trên provider: Site URL/Redirect URLs chính xác cho production và preview, xác nhận email bật, SMTP riêng, rate limits, thời hạn recovery, minimum password length, leaked-password protection. SMTP và cấu hình Auth hiện chưa được xác minh bằng kiểm thử email thật. Không gửi thư thật hay tạo học viên thật trong các bài test tự động.

Nguồn: [Supabase password authentication](https://supabase.com/docs/guides/auth/passwords), [OWASP Forgot Password](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html).
