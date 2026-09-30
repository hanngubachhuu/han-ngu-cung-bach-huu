# DECISION LOG — HÁN NGỮ CÙNG BÁCH HỮU

Chỉ lưu quyết định có ảnh hưởng về sau.

## DEC-001 — Project-specific continuity
- Date: 2026-09-28
- Decision: Continuity phải dành riêng cho repository này.
- Why: dự án dài hạn, nhiều vòng debug và rollout.
- Rule: live state tách khỏi durable memory.

## DEC-002 — Source and artifact boundary
- Date: 2026-09-28
- Decision: main là source; deployment artifacts do workflow tạo.
- Why: tránh sửa trực tiếp artifact và tạo drift.
- Consequence: bug phải sửa ở source rồi build/deploy lại.

## DEC-003 — Access model scope
- Date: 2026-09-28
- Decision: student registration → admin approval → lesson-level access.
- Consequence: chưa xây teacher-role system nếu chưa có yêu cầu mới.

## DEC-004 — Content/data boundary
- Date: 2026-09-28
- Decision: Google Docs chỉ là managed editing surface trong phạm vi đã thiết kế; không tự động trở thành nguồn chính cho mọi field.
- Consequence: sync mapping phải được kiểm chứng trước mọi thay đổi.

## DEC-005 — Reconciliation before remediation
- Date: 2026-09-28
- Decision: phiên đầu tiên sau khi cài continuity phải reconciliation trước khi sửa ứng dụng.
- Why: tránh biến tài liệu lịch sử thành false state.
- Status: ACTIVE
