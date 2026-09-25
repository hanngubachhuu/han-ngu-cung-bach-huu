# SECURITY_ARCHITECTURE.md

## Mục tiêu

Bảo vệ nội dung học tập và tài nguyên riêng của Hán Ngữ Cùng Bách Hữu mà không phá giao diện HTML/CSS/JavaScript hiện tại.

## Kiến trúc đích

```
GitHub
  └─ source code / version control

Vercel
  ├─ public website
  ├─ protected application routes
  └─ server-side/API layer

Supabase
  ├─ Auth
  ├─ Postgres Database
  └─ Private Storage
```

## Phân loại tài nguyên

### Public
- Trang chủ
- Giới thiệu
- Thông tin khóa học
- Ba bài đầu của mỗi cấp HSK được chủ động công khai để người dùng mới trải nghiệm
- Nội dung mẫu được chủ động công khai
- Logo, ảnh nền, tài nguyên trang trí

### Student-private
- Từ bài 4 trở đi của mỗi cấp HSK
- Bài tập và dữ liệu luyện tập private
- Audio/video học tập private
- PDF/tài liệu khóa học private
- Nội dung HSK/HSKK chỉ dành cho học viên
- Các bài hoặc tài nguyên đã đặt trạng thái private dù có liên kết trực tiếp

### Admin-private
- Phiếu nguồn/duyệt
- Dữ liệu quản trị
- Công cụ kiểm soát dữ liệu
- Thông tin nội bộ không phục vụ học sinh

## Luồng truy cập

```
Browser
  ↓
Vercel
  ↓
Auth session
  ↓
Permission check
  ↓
Supabase Database / Private Storage
  ↓
Chỉ trả dữ liệu người dùng được phép truy cập
```

Không dùng frontend-only checks làm cơ chế bảo mật.

## Nguyên tắc dữ liệu

Không đưa toàn bộ canonical lesson data xuống browser khi người dùng chưa có quyền.

Không để tài nguyên private trong thư mục public deployment.

Không dùng URL bí mật, ẩn bằng CSS, disable F12 hoặc kiểm tra quyền chỉ ở JavaScript để bảo vệ dữ liệu.

## Storage

Tài nguyên private chuyển sang Supabase Private Buckets.

Tải xuống/xem tài nguyên thực hiện qua:
1. Authenticated user
2. RLS/policy
3. Signed URL có thời hạn hoặc authenticated download

Service-role key tuyệt đối không được đưa vào frontend.

## Repository

Repository GitHub nên được chuyển sang Private trước khi đưa source học thuật độc quyền tiếp tục vào kho.

`main` là source of truth.

Không phát triển trực tiếp trên `gh-pages`.

## Migration theo giai đoạn

### Phase 1 — Host
- Dựng Vercel project từ repository hiện tại.
- Giữ nguyên giao diện và đường dẫn trong giai đoạn đầu.
- Chỉ đổi deployment, chưa đổi data contract.
- Vercel project `hanngubachhuu` đã được tạo trong đúng team.
- GitHub repository đã được kết nối với project Vercel.

### Phase 2 — Tách public/private
- Public mặc định chỉ gồm tài nguyên chung và ba bài đầu của mỗi cấp HSK.
- Loại data/audio/media private khỏi artifact public.
- Từ bài 4 trở đi không nằm trong public deployment.
- Quyền public/private phải được xác định ở tầng dữ liệu/server, không bảo vệ bằng frontend-only checks.
- Giữ các tài nguyên thật sự public ở deployment.

### Phase 3 — Auth
- Tích hợp Supabase Auth.
- Xây vai trò student/admin.

### Phase 4 — Database
- Di chuyển canonical lesson data cần bảo vệ sang Postgres.
- API chỉ trả phần dữ liệu người dùng có quyền.

### Phase 5 — Private Storage
- Chuyển PDF/audio/video private sang bucket private.
- Dùng signed URL hoặc authenticated download.

### Phase 6 — Admin
- Tạo /admin thật sự ở phía server.
- Chỉ admin được truy cập.

### Phase 7 — Hardening
- Rate limit
- Logging
- CSP/security headers
- Link/access testing
- Kiểm tra không còn private asset trong deployment

## Quy tắc chuyển đổi

Không refactor toàn bộ website một lần.

Mỗi phase phải:
1. đọc source of truth;
2. thay đổi một boundary rõ ràng;
3. validate;
4. verify;
5. cập nhật architecture nếu boundary thay đổi.

## Host decision

### Vercel + Supabase
Được chọn làm kiến trúc đích vì:
- Vercel có thể triển khai frontend hiện tại và mở rộng sang server-side/API mà không bắt buộc viết lại toàn bộ giao diện.
- Supabase cung cấp Auth, Postgres và Storage với private bucket, RLS và signed URL.
- Ranh giới trách nhiệm rõ: GitHub = source, Vercel = app/deployment, Supabase = protected data/assets.

### Netlify
Là phương án thay thế khả thi cho hosting và serverless. Netlify Blobs có access control, nhưng với mô hình dữ liệu HSK/HSKK + student/admin permissions, Supabase cho boundary database/RLS rõ hơn.
