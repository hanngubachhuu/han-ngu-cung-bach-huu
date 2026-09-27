# Quyền truy cập

|Chủ thể|Quyền|
|---|---|
|Khách|Học liệu công khai, từ điển, thư viện cục bộ|
|STUDENT/PENDING hoặc REJECTED/SUSPENDED|Xem/sửa hồ sơ và thư viện của chính mình; không đọc bài riêng|
|STUDENT/APPROVED|Bài riêng trong enrollment active; ALL cho toàn khóa hoặc SELECTED với lesson grant active|
|ADMIN/APPROVED|Quản trị học viên, duyệt/từ chối/tạm ngưng, cấp/thu hồi khóa và bài, xem nhật ký và kết quả tự luyện|

PostgreSQL bảo vệ `profiles.role/status` và các bảng quyền bằng RLS/grants. UI chỉ trình bày trạng thái. Không nhận ADMIN từ client metadata, tên miền email hoặc nội dung Google Docs. Partial unique index giới hạn một ADMIN; lệnh quản trị không được thay đổi trạng thái tài khoản ADMIN.

Các RPC có kiểm tra `auth.uid()` và quyền hiện hành, `search_path` cố định; API Docs xác minh JWT qua getUser rồi đọc vai trò trong bảng được bảo vệ. JWT cũ không giữ được quyền sau khi DB thu hồi. Storage đọc phải đi qua quyền bài, bucket riêng.

Bài riêng kiểm tra lại quyền mỗi 60 giây; tải audio bằng phiên được xác thực và dùng blob URL trong phiên trang. Việc thu hồi không thể lấy lại dữ liệu người học đã tải hoặc chụp lại. Repo nguồn vẫn public khi audit: chuyển dist sang private content không xóa các bản nguồn đã công khai trong Git/history/fork. Cần quyết định riêng về quyền riêng tư kho mã.

Bootstrap ADMIN chỉ thực hiện bằng kênh quản trị DB sau khi chủ sở hữu phê duyệt gói phát hành. Chủ sở hữu đã chỉ định `bachhuu1809@gmail.com`; truy vấn tổng hợp ngày 27/09/2026 xác nhận đúng một Auth user có email này và đã xác nhận email. Script `supabase/operations/bootstrap_owner.sql` kiểm tra lại điều kiện đó trong transaction, không cho thay ADMIN khác và ghi audit. Không nhận quyền ADMIN từ metadata, OAuth hay lời khai của trình duyệt. Chưa bootstrap trong đợt này.

Test PostgreSQL cục bộ bao gồm truy cập chéo tài khoản, tự nâng quyền, bỏ qua duyệt, enrollment-only, thu hồi, tạm ngưng, storage, version và giới hạn RPC. Xem `tests/account-rls.test.mjs`. Đây chưa phải bằng chứng đã kiểm thử trên production với hai người dùng thật.

Nguồn: [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [OWASP Authorization](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html).
