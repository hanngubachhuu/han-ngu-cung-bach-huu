# BUG LOG — HÁN NGỮ CÙNG BÁCH HỮU

Không coi một bug lịch sử là bug hiện tại nếu chưa tái xác minh.

## Current verified bugs
Chưa có bug nào được đánh dấu OPEN ở thời điểm bootstrap này.

## Historical areas to reconcile

### AREA-LESSON-ACCESS
- Historical: từng có lỗi liên quan login, quyền bài, visibility và lesson rendering.
- Current status: UNKNOWN until runtime/source verification.

### AREA-LESSON-QUESTIONS
- Historical: từng có lỗi câu hỏi biến mất, submit không hoạt động và cấu trúc lesson khác nhau.
- Current status: UNKNOWN until comparison of working/failing lessons.

### AREA-GOOGLE-DOCS
- Historical: từng có nhiều trạng thái cấu hình OAuth/API/scope/revision.
- Current status: UNKNOWN until current adapter/tests/deployment evidence is inspected.

### AREA-PUBLIC-PRIVATE
- Historical: từng có rollout private lesson và static build boundary.
- Current status: RECONCILE against manifest, build output, Vercel, GitHub Pages, Supabase/RLS.

## Bug schema

~~~md
## BUG-YYYY-MM-DD-NNN
- Status:
- Area:
- First observed:
- Symptom:
- Reproduction:
- Expected:
- Actual:
- Root cause: VERIFIED | UNVERIFIED
- Attempts:
- Current fix:
- Verification level: V0 | V1 | V2 | V3 | V4
- Regression risk:
- Related files:
~~~
