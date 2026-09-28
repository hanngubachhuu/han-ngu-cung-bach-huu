# Bật email cho website — hai bước của Bách Hữu

Cập nhật 28/09/2026: chủ website đã tự nhập/lưu mật khẩu ứng dụng. Kiểm thử recovery lúc 10:13 giờ Việt Nam trả 200 và được chủ sở hữu xác nhận thư đến đúng người gửi **Hán Ngữ Cùng Bách Hữu — bachhuu1809@gmail.com**. Không đọc giá trị mật khẩu. Các bước dưới dùng khi cần cấu hình lại; hiện không cần làm lại.

1. Mở [Mật khẩu ứng dụng Google](https://myaccount.google.com/apppasswords), chọn đúng **bachhuu1809@gmail.com**. Tạo mật khẩu ứng dụng tên **Website Bách Hữu**. Nếu Google yêu cầu, bật xác minh hai bước trước. Không dùng mật khẩu đăng nhập Gmail thông thường.
2. Trở về [SMTP Settings của website](https://supabase.com/dashboard/project/dmeqxdznzobbarvkmxyg/auth/smtp), dán mật khẩu vừa tạo vào **Password**, bấm **Save changes**. Báo đã lưu; người triển khai sẽ kiểm tiếp luồng nhận email.

Không gửi mật khẩu qua chat, không lưu vào Git. Nếu Google đang hiện tài khoản khác, tự chuyển sang Gmail đã chỉ định trước khi tạo mật khẩu. Nếu không thấy mục mật khẩu ứng dụng, kiểm tra xác minh hai bước và các giới hạn tài khoản trong [hướng dẫn chính thức của Google](https://support.google.com/accounts/answer/185833?hl=vi).

Thông tin để đối chiếu nếu trang bị tải lại:

| Ô | Giá trị |
|---|---|
| Enable custom SMTP | Bật |
| Sender email address | bachhuu1809@gmail.com |
| Sender name | Hán Ngữ Cùng Bách Hữu |
| Host | smtp.gmail.com |
| Port number | 587 |
| Minimum interval per user | 60 giây |
| Username | bachhuu1809@gmail.com |
| Password | Mật khẩu ứng dụng do chủ tài khoản tự nhập |

Gmail phù hợp giai đoạn ít học viên; Supabase cảnh báo nhà cung cấp thư cá nhân có thể ảnh hưởng khả năng gửi đến hộp thư. Đây không phải giải pháp gửi hàng loạt. Gmail có giới hạn gửi và có thể tạm chặn khi vượt giới hạn; mật khẩu ứng dụng bị thu hồi nếu đổi mật khẩu Google. Khi tăng quy mô, chuyển sang nhà cung cấp email giao dịch với tên miền được xác thực. [Giới hạn Gmail](https://support.google.com/mail/answer/22839?hl=en), [SMTP Supabase](https://supabase.com/docs/guides/auth/auth-smtp).

SMTP phục vụ email xác nhận/khôi phục tài khoản. Nó độc lập với Google Docs: dữ liệu học viên nằm trong Supabase; hồ sơ Docs được tạo trong Drive của chủ tài khoản qua kết nối phía máy chủ, không tự động gửi toàn bộ dữ liệu học viên vào hộp thư Gmail.
