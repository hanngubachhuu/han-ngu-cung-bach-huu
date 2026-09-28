# Xác thực

Trang chuẩn là `tai-khoan.html`; Vercel thêm alias `/login`, `/register`. GitHub Pages dùng đường dẫn tương đối đến trang HTML. `next` chỉ nhận trang HTML cùng origin và trong đường dẫn triển khai, không truyền token hoặc query khôi phục.

Đăng ký gửi tên và thông tin đăng nhập tới Supabase Auth. Trigger cơ sở dữ liệu tự tạo STUDENT/PENDING; `user_metadata.role`, email hoặc localStorage không thể cấp ADMIN. Sau xác nhận email, quản trị duyệt và cấp khóa/bài. Tài khoản đã có quyền học trước migration được giữ APPROVED để không mất quyền đang dùng.

Form có nhãn, autocomplete, hiện/ẩn mật khẩu, trạng thái đang gửi, lỗi tiếng Việt và chống bấm lặp. Mật khẩu mới từ 12 đến 128 ký tự; phải cấu hình giới hạn tối thiểu 12 ở Auth server trước phát hành vì kiểm tra frontend không phải hàng rào bảo mật.

Quên mật khẩu trả thông báo chung để không xác nhận email tồn tại. Màn đặt mật khẩu mới chỉ mở sau sự kiện PASSWORD_RECOVERY; tự thêm `?mode=reset` không đủ. Sau thay đổi sẽ đăng xuất và yêu cầu đăng nhập lại. Gửi lại email có cooldown ở giao diện; giới hạn thực tế phải ở nhà cung cấp Auth.

Phiên được Supabase SDK quản lý. Sự kiện đổi user xóa cache giao diện, bài riêng chuyển về tài khoản. Không tự nhập lịch sử khách vào người vừa đăng nhập. Trình duyệt lưu phiên nên XSS vẫn là rủi ro quan trọng: giữ code tin cậy, escape dữ liệu, tránh thêm script bên thứ ba không kiểm soát. Chưa chuyển sang kiến trúc cookie HttpOnly/BFF.

Ngày 28/09/2026 đã lưu trên provider: minimum password length 12, secure password change, xác nhận email bật, anonymous sign-in và manual identity linking tắt. Site URL/Redirect URLs đã đặt chính xác cho production, Pages và preview đang thử; xem deployment.md. Gói Free hiện yêu cầu nâng Pro để bật leaked-password protection; chưa nâng gói. Chủ sở hữu đã nhập/lưu Gmail SMTP và xác nhận nhận email recovery đúng người gửi lúc 10:13; server log trả 200. Đổi mật khẩu thật chưa kiểm; đăng nhập ADMIN thật thành công. Xem [hướng dẫn SMTP](SMTP_FOR_OWNER.md). Không gửi thư thật hay tạo học viên thật trong các bài test tự động.

Nguồn: [Supabase password authentication](https://supabase.com/docs/guides/auth/passwords), [OWASP Forgot Password](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html).
