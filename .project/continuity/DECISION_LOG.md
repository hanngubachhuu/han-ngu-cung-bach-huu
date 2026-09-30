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

## DEC-006 — Scope of official automated grading
- Date: 2026-09-30
- Authority: direct user refinement during assignment upgrade request.
- Decision: auto-grade only HSK/HSKK pathway assignments submitted by authenticated student accounts. Existing entitlement remains necessary; URL/title alone never authorizes grading.
- Open speaking/writing/translation continue manual rubric grading under original specification. No AI grading.
- Unrelated practice tools are outside the upgrade. Existing self_reported history is preserved, not promoted to official grades.

## DEC-007 — Approved CP1 and post-backup production gate
- Authority: explicit user CP1 approval, followed by explicit local backup authorization and mandatory stop before migration.
- learning_attempts remains lightweight history; linked submission/detail/answers/version/grading/feedback/rubric entities. Self_reported preserved and excluded from all new eligibility rules. Immutable used versions, published-only learner results, explicit audited regrade; existing course/enrollment reused for HSK/HSKK.
- Backup only local ignored .cache/backups/assignment-before-20260930.json, no secrets or Git/push. Seven requested tables plus related audit ledger backed up/restore verified. No production migration until user confirms the next checkpoint.
- Review package: docs/assignment-migrations.md. CP2 Drive/audio and CP3 public verification remain separate and unapproved.
