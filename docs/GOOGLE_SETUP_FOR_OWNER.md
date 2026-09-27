# Kết nối Google Docs của Bách Hữu với website

Cập nhật: 27/09/2026. Tài khoản chủ sở hữu: **bachhuu1809@gmail.com**. Bạn tự đăng nhập Google, cấp quyền và nhập thông tin bí mật vào Vercel. Không gửi client secret, refresh token, mật khẩu hoặc mã xác minh qua chat.

Sau khi kết nối và phát hành, quản trị có thể tạo hồ sơ Google Docs trong Drive của tài khoản này, xem khác biệt và đồng bộ với website. Dữ liệu tài khoản vẫn được lưu tại Supabase. Đây không phải chức năng gửi toàn bộ dữ liệu học viên qua email. Bản hiện tại cho sửa qua Docs ba trường: họ tên, số điện thoại, mục tiêu học; quyền học, trạng thái duyệt và điểm do website quản lý.

## 1. Tạo Google Cloud project

1. Mở [trang tạo project](https://console.cloud.google.com/projectcreate), kiểm tra ảnh tài khoản góc phải là `bachhuu1809@gmail.com`.
2. Đặt tên dễ nhận biết, ví dụ **Han Ngu Bach Huu**. Project ID phải duy nhất; dùng ID Google đề xuất nếu cần. Gmail cá nhân có thể chọn **No organization**.
3. Chọn **Create**, rồi chọn đúng project vừa tạo ở thanh trên cùng. Ghi lại Project ID; đây là thông tin có thể gửi cho người hỗ trợ.

## 2. Bật Google Docs API

Mở **APIs & Services → Library**, tìm **Google Docs API**, chọn **Enable**. Kiểm tra đang ở đúng project. Adapter hiện tại gọi Docs API và endpoint xác minh danh tính Google; không cần tạo service account hoặc cài khóa JSON lên trình duyệt.

## 3. Khai báo ứng dụng và người thử

Vào **Google Auth Platform → Branding → Get started** nếu Google chưa được cấu hình:

- App name: **Han Ngu Bach Huu**.
- User support email và Contact email: **bachhuu1809@gmail.com**.
- Audience: **External**, vì đây là Gmail cá nhân.
- Sau khi tạo, vào **Audience → Test users → Add users**, thêm **bachhuu1809@gmail.com**.
- Vào **Data Access → Add or remove scopes**, thêm các phạm vi bên dưới rồi lưu.

```text
https://www.googleapis.com/auth/drive.file
openid
https://www.googleapis.com/auth/userinfo.email
```

Google có thể hiển thị quyền email bằng URI `userinfo.email`; khi cấp quyền ở Playground có thể dùng tên ngắn `email`. `drive.file` là phạm vi Google khuyến nghị cho Docs: truy cập các file dùng với ứng dụng, phù hợp hồ sơ do website tạo. Không chọn `drive` hay `documents` cho toàn bộ Drive/Docs. File tạo thủ công ngoài ứng dụng chưa được hỗ trợ chọn để liên kết trong giao diện hiện tại. [Cấu hình Google Auth](https://developers.google.com/workspace/guides/configure-oauth-consent), [phạm vi Docs API](https://developers.google.com/workspace/docs/api/auth).

## 4. Tạo OAuth client

Vào **Google Auth Platform → Clients → Create client**:

- Application type: **Web application**.
- Name: **Bach Huu Docs Server**.
- Authorized JavaScript origins: để trống cho quy trình này.
- Authorized redirect URIs: nhập chính xác dòng dưới, không thêm dấu `/` cuối.

```text
https://developers.google.com/oauthplayground
```

Chọn **Create**. Giữ **Client ID** và **Client secret** trong nơi lưu bí mật của bạn. Không tải file chứa secret vào thư mục Git. Redirect này phục vụ lần cấp quyền bằng Playground; chưa cần tạo trang callback trên website. [Hướng dẫn trong OAuth Playground](https://developers.google.com/oauthplayground/).

## 5. Cấp quyền và lấy refresh token

Mở [OAuth Playground chính thức của Google](https://developers.google.com/oauthplayground/). Chọn bánh răng và đặt:

- OAuth flow: **Server-side**; endpoints: **Google**.
- Access type: **Offline**; Force prompt: **Consent Screen**.
- Bật **Use your own OAuth credentials**, nhập Client ID và Client secret vừa tạo. Giữ endpoint mặc định của Google.

Ở **Step 1**, nhập vào ô scopes:

```text
https://www.googleapis.com/auth/drive.file openid email
```

Chọn **Authorize APIs**, đăng nhập đúng `bachhuu1809@gmail.com`, kiểm tra tên ứng dụng và cấp những quyền đã chọn. Ở **Step 2**, chọn **Exchange authorization code for tokens**. Sao chép giá trị **Refresh token** để lưu vào Vercel; không dùng Access token thay thế. Bắt buộc dùng OAuth client của bạn: token dùng client mặc định Playground bị thu hồi sau 24 giờ. [OAuth Playground](https://developers.google.com/oauthplayground/).

**Giai đoạn thử:** với External + Testing và quyền file, refresh token hết hạn sau 7 ngày. Sau khi kiểm thử tích hợp, cần chuyển ứng dụng sang cấu hình phát hành phù hợp trong Audience và cấp lại token trước vận hành lâu dài; hoàn tất các yêu cầu Google hiển thị. Không coi một token vừa lấy thành công là kết nối vĩnh viễn. [Vòng đời refresh token của Google](https://developers.google.com/identity/protocols/oauth2#expiration).

## 6. Lưu vào Vercel

Trong Vercel, chọn project **hanngubachhuu → Settings → Environment Variables**. Tạo ba biến phía máy chủ:

| Tên biến | Giá trị lấy ở đâu |
|---|---|
| `GOOGLE_CLIENT_ID` | Client ID ở bước 4 |
| `GOOGLE_CLIENT_SECRET` | Client secret ở bước 4 |
| `GOOGLE_REFRESH_TOKEN` | Refresh token ở bước 5 |

Chọn môi trường Preview dành cho kiểm thử; khi phát hành mới cấu hình Production theo cùng kế hoạch. Không chia sẻ bộ credential này với nhánh thử không tin cậy. Đánh dấu secret/token là **Sensitive** nếu giao diện hỗ trợ. Không thêm tiền tố `PUBLIC_`, `VITE_` hay `NEXT_PUBLIC_`.

Thay đổi environment chỉ áp dụng cho deployment mới. Chưa redeploy production cũ để thử: bản account mới còn cần schema, quyền và audio riêng. Người triển khai sẽ deploy preview đúng thứ tự sau khi phần cơ sở dữ liệu sẵn sàng. [Tài liệu Vercel về environment variables](https://vercel.com/docs/environment-variables/managing-environment-variables).

## 7. Báo đã xong và kiểm thử

Bạn chỉ cần báo Project ID và đã hoàn thành đến bước nào, ví dụ: “Project ID …; đã tạo client, đã nhập đủ ba biến vào Preview”. Không gửi giá trị bí mật.

Sau khi preview sẵn sàng, người triển khai kiểm: đúng Gmail sở hữu → tạo hồ sơ thử → đọc/sửa hai chiều → xử lý xung đột → từ chối sửa quyền qua Docs → đối chiếu log. Chỉ khi kiểm thử Google thật thành công mới đánh dấu kết nối hoàn tất. Các kiểm thử hiện có dùng adapter mô phỏng.

Nếu gặp lỗi, gửi nguyên tên/mã lỗi và tên bước; nếu gửi ảnh thì che token/client secret. `redirect_uri_mismatch` thường cần so lại URI ở bước 4. `access_denied` cần so đúng Gmail và danh sách Test users. `invalid_grant` có thể do token hết hạn hoặc bị thu hồi; cấp lại quyền bằng đúng client, rồi cập nhật biến và deployment.

## Nội dung Facebook cần tham khảo

Liên kết Facebook đã gửi chưa đọc được bằng công cụ web trong phiên này. Cách nhanh nhất là dán nội dung bài và các ảnh liên quan vào cuộc trò chuyện. Nếu dùng trình duyệt được kết nối với Codex, bạn có thể tự đăng nhập Facebook và chọn đúng tab để chia sẻ; khả năng đọc còn phụ thuộc nội dung/tab mà công cụ thực sự truy cập được. Không gửi cookie, mật khẩu hoặc mã OTP. Có nội dung rồi mới đối chiếu từng cảnh báo với mã website; không mặc định bài viết đúng chỉ vì nói về bảo mật.
