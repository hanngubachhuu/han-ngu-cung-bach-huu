# Backup và chuyển nền tảng

Không dùng Google Docs làm database. Dữ liệu có cấu trúc nằm trong PostgreSQL với UUID và khóa ngoại; adapter Google và Supabase tách khỏi UI. Trang tĩnh có thể chuyển host nếu giữ base path, CSP/headers và API routing; Docs API cần môi trường Node server, nên chỉ phần này không chạy trên GitHub Pages.

Gói backup cần có: code + package-lock + migration history đã đối chiếu; schema/roles/grants/functions/RLS; dữ liệu ứng dụng gồm profiles/enrollments/grants/library/readings/attempts/documents/audit/sync; Auth theo quy trình hỗ trợ của Supabase; private storage cùng checksum; danh mục Google document IDs và bản xuất tài liệu được phép. Secrets quản lý riêng trong secret store, không đưa chung archive công khai.

Khi đổi Auth provider, tạo bảng ánh xạ UUID cũ/mới, di chuyển ownership và grants trong transaction, vô hiệu session cũ theo quy trình; không thể chỉ thay endpoint rồi giữ nguyên giả định auth.uid(). Khi đổi Google, giữ documents.id/student_id và tạo adapter tương đương optimistic revision; không đổi khóa theo tên người học.

Kiểm tra restore tối thiểu: chủ sở hữu đúng, học viên A không đọc B, pending bị chặn, quyền khóa/bài giữ nguyên, số lượng thư viện/attempts khớp, asset checksum khớp, Docs mapping không tạo trùng. Ghi RPO/RTO sau bài diễn tập thật; chưa có bằng chứng để công bố các con số này.
