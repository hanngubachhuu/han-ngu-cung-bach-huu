# Dữ liệu và migration

|Bảng|Chức năng|Quyền ghi|
|---|---|---|
|profiles|Hồ sơ, role, trạng thái, version|Trigger/RPC có kiểm soát|
|courses, enrollments|Khóa và phạm vi ALL/SELECTED|RPC ADMIN|
|lesson_content, student_lesson_access, lesson_assets|Nội dung và quyền bài hiện có|Xuất bản có kiểm soát / RPC ADMIN|
|study_saved_words, study_saved_characters|Sổ tay người dùng|Chủ sở hữu qua RLS|
|study_readings|Bài đọc, version|Chủ sở hữu; UI dùng compare-and-swap|
|learning_attempts|Kết quả tự luyện, version, client_attempt_id|RPC phiên bản; dữ liệu luôn self_reported|
|documents|Mapping UUID học viên ↔ Doc, base_fields, revision, lease|RPC ADMIN|
|audit_logs, sync_logs|Lịch sử quyền và sync|Hàm server; chỉ ADMIN đọc|

Không lưu mật khẩu trong bảng ứng dụng. Email được sao chép từ Auth lúc tạo hồ sơ; hiện chưa có chức năng đổi email. Nếu bổ sung, phải thêm luồng cập nhật Auth → profile có kiểm chứng.

Migration account mới: `20260927052247_learner_accounts_and_access.sql`; Docs: `20260927054113_managed_document_sync.sql`. Cả hai đã áp dụng production ngày 27/09/2026 sau khi chủ sở hữu phê duyệt; kiểm tra trực tiếp giữ đủ 24 quyền học. Tệp lịch sử lesson access/storage/RPC được khôi phục từ định nghĩa migration đã tồn tại để test được ranh giới quyền cục bộ. Đây chưa phải toàn bộ lịch sử lexicon: không chạy `db reset`/`db push` mù trên production.

Đã áp dụng riêng hai vá bảo mật ít ảnh hưởng: thu hồi quyền gọi importer và cố định search_path của chín hàm đọc từ điển. Tên migration remote do Supabase gán thời điểm thực thi có thể khác timestamp file local; cần đối chiếu theo tên/nội dung trước khi repair migration history. Không sửa lịch sử đã chạy để ép khớp.

Các ràng buộc nghiệp vụ dùng foreign key, CHECK, UNIQUE và transaction. Profile/reading/attempt có version. Log quan trọng là append-only với client. Trước migration phải có backup và kiểm tra khôi phục; lịch sử đang lệch nên chưa thể gọi bộ migration là bản sao đầy đủ của production.

Chuyển nội dung riêng: `.cache/private-release.sql` được tạo từ hash baseline hiện tại; nếu DB đổi nội dung, toàn transaction dừng. Chỉ thêm client_view của HSK 2 và thay đường dẫn audio HSK 1, không thay canonical text. Backup cũ nằm trong schema account_internal, không cấp quyền browser. Rollback dùng after_hash để không ghi đè một bản mới hơn.
