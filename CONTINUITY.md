# HÁN NGỮ CÙNG BÁCH HỮU — CONTINUITY

Đây là điểm vào của hệ thống continuity dành riêng cho repository này.

## Quy tắc bắt buộc

Trước khi sửa code trong một phiên mới:

1. Đọc .project/continuity/WORK_STATE.md.
2. Đọc .project/continuity/PROJECT_MEMORY.md và các decision liên quan.
3. Đọc .ai/skills/han-ngu-cung-bach-huu-continuity/SKILL.md.
4. Nếu WORK_STATE ghi REPOSITORY RECONCILIATION REQUIRED, thực hiện reconciliation trước khi sửa ứng dụng.
5. Không yêu cầu Bách kể lại lịch sử đã có trong các file continuity.

## Nguồn trạng thái

- WORK_STATE.md = trạng thái vận hành hiện tại.
- PROJECT_MEMORY.md = sự thật bền vững của dự án.
- DECISION_LOG.md = quyết định dài hạn.
- BUG_LOG.md = lịch sử và trạng thái bug.
- DATA_CONTRACT.md = ranh giới dữ liệu và sync.
- CHANGELOG_HANDOFF.md = nhật ký bàn giao.

## Tiêu chuẩn

Continuity không có nghĩa là "nhớ mang máng dự án".
Continuity nghĩa là một phiên mới biết:

"Ta đang ở đâu → cái gì đã được chứng minh → cái gì chưa → đã thử gì → không được chạm gì → bước tiếp theo chính xác là gì."

Phiên đầu tiên sau khi cài hệ thống phải hoàn thành Repository Reconciliation và biến WORK_STATE từ bootstrap thành checkpoint có bằng chứng thực tế.
