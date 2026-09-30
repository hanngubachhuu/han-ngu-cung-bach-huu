# SKILL — HÁN NGỮ CÙNG BÁCH HỮU PROJECT CONTINUITY ENGINE

## 1. Mission

Skill này là lớp continuity dành riêng cho repository han-ngu-cung-bach-huu.

Mục tiêu:
- tiếp tục công việc ngay sau khi context limit;
- không bắt Bách kể lại lịch sử;
- không lặp lại các cách sửa đã thất bại;
- không phá phần đã ổn khi đang sửa phần khác;
- phân biệt lịch sử với trạng thái thực tế;
- để mỗi phiên kết thúc bằng một exact next action mà phiên sau có thể thực thi.

Tiêu chuẩn thành công:

Một phiên mới phải xác định được từ repository và state:
WHAT WERE WE DOING → WHAT IS VERIFIED → WHAT IS BROKEN → WHAT WAS TRIED → WHAT MUST NOT CHANGE → WHAT EXACTLY COMES NEXT.

## 2. Project identity

Repository:
hanngubachhuu/han-ngu-cung-bach-huu

Branch nguồn chuẩn:
main

Sản phẩm:
nền tảng/web học tiếng Trung cho học viên Bách Hữu.

Các domain hiện có:
HSK, HSKK, phát âm, Hán tự, từ điển, đọc hiểu, bài học, bài tập, tài khoản học viên, admin, dữ liệu private.

Các boundary đã được dự án xác định:
- GitHub: source/version control.
- Vercel: application + API/server layer.
- Supabase: Auth/Postgres/Private Storage.
- GitHub Pages: static deployment artifact.
- Google Docs: managed editing surface cho phạm vi dữ liệu đã được thiết kế.

Không tự bịa tên bảng, route, component, policy hoặc schema.

## 3. Canonical continuity files

Live operational state:
.project/continuity/WORK_STATE.md

Stable project memory:
.project/continuity/PROJECT_MEMORY.md

Durable decisions:
.project/continuity/DECISION_LOG.md

Bug history:
.project/continuity/BUG_LOG.md

Data contracts:
.project/continuity/DATA_CONTRACT.md

Session handoff:
.project/continuity/CHANGELOG_HANDOFF.md

Start procedure:
.project/continuity/SESSION_START_CHECKLIST.md

End procedure:
.project/continuity/SESSION_END_TEMPLATE.md

First-run reconciliation:
.project/continuity/RECONCILIATION_PLAN.md
.project/continuity/RECONCILIATION_REPORT.md

## 4. Authority order

Khi thông tin mâu thuẫn, dùng thứ tự:

1. quyết định mới nhất của Bách trong phiên hiện tại;
2. artifact/code/config/database hiện tại;
3. bằng chứng runtime/deployment hiện tại;
4. WORK_STATE mới nhất đã có bằng chứng;
5. DECISION_LOG / DATA_CONTRACT / PROJECT_MEMORY;
6. handoff cũ;
7. trí nhớ hội thoại chung.

Không để một ghi chú cũ override code hiện tại.

Nếu chưa biết: ghi UNKNOWN.
Nếu code mâu thuẫn tài liệu: ghi CONTRADICTED.
Nếu tài liệu cũ hơn code nhưng code có bằng chứng mới: ghi STALE.
Nếu đã xác minh: ghi VERIFIED.

## 5. Session-start protocol

### Phase A — Recover

Đọc WORK_STATE trước.
Lấy ra:
- current phase;
- current task;
- last verified success;
- current blocker;
- exact next action;
- do-not-touch;
- known failed attempts.

### Phase B — Context

Đọc PROJECT_MEMORY và decision/data contract liên quan.
Không đọc lan man toàn repository chỉ để "nhớ lại".

### Phase C — Reconcile

Đối chiếu state với artifact thật trước khi sửa.

Ví dụ:
- trang được nói là fixed → inspect file/build/runtime;
- entitlement được nói là correct → inspect data path + policy;
- sync được nói là working → inspect adapter + logs/test;
- private asset được nói là protected → inspect public build và access boundary.

### Phase D — Resume

Chỉ sau khi reconcile:
- thực hiện exact next action;
- ưu tiên smallest safe change;
- giữ nguyên protected areas;
- verify ngay sau thay đổi.

## 6. Repository Reconciliation — lần đầu bắt buộc

Phiên đầu tiên sau khi cài skill phải thực hiện một pass riêng:

REPOSITORY INVENTORY
→ ARCHITECTURE RECONSTRUCTION
→ DATA/ACCESS TRACE
→ LESSON CONTRACT CHECK
→ DEPLOYMENT CHECK
→ DOC/ARTIFACT CONFLICT CHECK
→ CONTINUITY UPDATE

Mục tiêu là tạo "baseline có bằng chứng", không phải refactor.

Trong reconciliation:
- không redesign UI;
- không đổi schema;
- không sửa logic chỉ để "tiện tay";
- không dọn code ngoài phạm vi;
- chỉ sửa continuity documents nếu cần.

### 6.1 Inventory

Xác định:
- runtime/version;
- build/test/lint commands;
- root folders;
- app entry points;
- shared CSS/JS;
- lesson files;
- data registry/manifest;
- server/API;
- Supabase migrations/config;
- workflow/deployment;
- private/public asset boundaries.

### 6.2 Architecture reconstruction

Đối chiếu:
ARCHITECTURE.md
CODE_RULES.md
SECURITY_ARCHITECTURE.md
package.json
workflow files
vercel.json

với code thật.

Xác định cái nào:
VERIFIED / STALE / CONTRADICTED / UNKNOWN.

### 6.3 Data and access trace

Trace tối thiểu:
UI
→ authentication
→ authorization
→ lesson entitlement
→ data query
→ persistence
→ rendered state

Tách:
authentication ≠ authorization ≠ entitlement ≠ UI visibility.

### 6.4 Lesson contract check

Chọn ít nhất:
- một lesson đã được xác nhận working;
- một lesson private;
- một lesson đại diện cho schema đang được dùng.

So sánh:
- identity;
- manifest;
- source data;
- renderer;
- exercise/question shape;
- access status;
- navigation;
- completion/submission.

Nếu lesson cùng loại có cấu trúc khác nhau, không normalize hàng loạt khi chưa tìm được nguyên nhân.

### 6.5 Deployment check

Xác nhận:
- main là source;
- build tạo artifact gì;
- GitHub Pages lấy artifact nào;
- Vercel build từ đâu;
- API chạy ở đâu;
- private assets có lọt vào static artifact hay không.

### 6.6 Reconciliation report

Ghi rõ:
- FACTS VERIFIED;
- STALE DOCUMENTS;
- CONTRADICTIONS;
- UNKNOWN;
- PROTECTED AREAS;
- CURRENT WORKING BASELINE;
- FIRST SAFE NEXT ACTION.

Không giải quyết mọi contradiction trong một lượt. Reconciliation trước, remediation sau.

## 7. Current repository signals to verify

Các tín hiệu sau đã được quan sát khi bootstrap và phải được xác minh lại trong reconciliation:

1. package.json hiện khai báo Node 24.x, ESM, esbuild, Supabase JS, Playwright, ESLint và các script build/test/validate.
2. ARCHITECTURE mô tả HTML/CSS/JavaScript là nền tảng chính, main là source, gh-pages là artifact; Vercel + Supabase là hướng backend/app.
3. data/lesson-manifest.js là manifest lesson dùng chung.
4. data/lesson-registry.js có lớp prepare/validate/load và hiện ghi SCHEMA_VERSION = 1 trong khi nội dung bên dưới sử dụng cấu trúc content kiểu mới; cần xác minh mối quan hệ schema v1/v2.
5. Security architecture nói bài học từ bài 4 trở đi phải private, nhưng manifest hiện quan sát được có item hsk1_bai5... với data path và không cùng visibility flag như hsk1_bai4; đây là discrepancy cần kiểm chứng, không được tự kết luận bug.
6. Một số tài liệu security/architecture có lịch sử pilot cũ; các commit gần nhất cho thấy rollout đã tiến thêm. Phiên reconciliation phải xác định tài liệu nào stale và cập nhật state, không tự sửa toàn bộ tài liệu.
7. Recent commits cho thấy tài khoản học viên, lesson access/private rollout, Google Docs readiness và data-policy work đã được triển khai tiếp tục; phải lấy code hiện tại làm căn cứ.

## 8. Exact next action standard

Một next action hợp lệ phải có:

- target file/system;
- operation;
- expected result;
- safe boundary;
- stop condition.

Ví dụ tốt:

Inspect data/lesson-registry.js and data/lesson-manifest.js for the exact visibility contract. Compare with the actual public build and the server/RLS path. Do not change lesson data or access policy until the discrepancy is classified.

Ví dụ không đủ:
"Fix lessons."

## 9. Anti-regression protocol

Trước khi sửa:
- Is this necessary?
- What is already verified?
- What is protected?
- Is there a smaller scope?
- What could this change break?

Blast radius:
R0 = copy/text
R1 = isolated UI/style
R2 = one lesson/page/data module
R3 = shared adapter/navigation/auth/API
R4 = DB schema/RLS/sync/deployment architecture

R3/R4:
- record dependencies;
- define verification;
- update WORK_STATE before broad change.

## 10. Debugging protocol

Mọi bug theo:

SYMPTOM
→ REPRODUCTION
→ EXPECTED
→ ACTUAL
→ SCOPE
→ HYPOTHESIS
→ TEST
→ RESULT
→ NEXT TEST

Confidence:
FACT = verified directly
STRONG = multiple supporting observations
PLAUSIBLE = reasonable but unverified
SPECULATION = do not build major changes on this.

Failed attempts luôn ghi:
- changed;
- expected;
- actual;
- rollback status;
- why not repeat.

## 11. Data safety

Trước khi đổi learning data:
- identify source of truth;
- identify consumers;
- identify keys;
- identify sync direction;
- identify missing/duplicate/error behavior;
- verify representative records.

Không biến "UI không thấy dữ liệu" thành "database thiếu dữ liệu" nếu chưa trace.

Không tự bịa nội dung học thuật để lấp record bị thiếu.

## 12. Supabase rules

Khi đụng Supabase:
- inspect actual schema;
- inspect RLS/policies;
- preserve IDs;
- prefer targeted migrations;
- record migration impacts;
- verify post-change.

Không coi login success là proof of access correctness.

## 13. Google Docs synchronization rules

Trước khi sửa sync phải xác định:
source
→ mapping
→ identity
→ destination
→ conflict behavior
→ retry/error behavior
→ verification.

Không tạo thêm source of truth.

Không lấy một conflict làm lý do để overwrite một phía khi chưa biết ownership.

## 14. UI and lesson protection

Functional fixes không tự động trở thành visual redesign.

Approved:
- lesson structure;
- navigation;
- footer;
- visual hierarchy;
- protected private/public boundaries

phải được giữ nguyên trừ khi có yêu cầu mới.

Khi scaling một lesson pattern:
reuse contract, not blindly copy incidental implementation.

## 15. Verification levels

V0 = static inspection
V1 = targeted test
V2 = browser/user flow
V3 = integration chain
V4 = deployed verification

WORK_STATE phải ghi level thực tế.

Không viết "FIXED" chỉ vì file đã được sửa.

## 16. Session heartbeat

Sau mỗi milestone có ý nghĩa, cập nhật:

WHAT CHANGED
→ WHAT IS TRUE NOW
→ WHAT IS NEXT

Nếu context đang lớn:
- update state sớm;
- dừng refactor phụ;
- hoàn thành smallest safe unit;
- để lại một exact next action.

Không giả vờ hoàn thành vì sắp hết context.

## 17. Session-end protocol

Trước khi phiên kết thúc hoặc context limit có nguy cơ:
- cập nhật WORK_STATE;
- ghi last verified success;
- ghi unfinished state;
- ghi changed files;
- ghi failed attempts;
- ghi do-not-touch;
- ghi exact next action;
- ghi verification level.

Một handoff hợp lệ phải cho phép phiên sau tiếp tục mà không cần hỏi lại lịch sử.

## 18. False completion guard

Không COMPLETE chỉ vì:
- compile pass;
- button hiện;
- API trả một lần;
- local test pass nhưng flow thật chưa kiểm;
- docs nói "ready".

Task user-visible phải có verification phù hợp.

## 19. Scope guard

Điều phát sinh nhưng không cần cho mục tiêu hiện tại:
OUT OF SCOPE — BACKLOG

Không âm thầm biến một bug fix thành refactor toàn repository.

## 20. Session bridge

Khi cần nói với Bách:
"Mình nối từ checkpoint cuối. [last verified]. Hiện còn [blocker]. Mình tiếp tục từ [next action], giữ nguyên [protected area]."

Không kể lại toàn bộ lịch sử.

## 21. Final algorithm

OPEN
→ READ WORK_STATE
→ READ RELEVANT MEMORY
→ INSPECT ARTIFACT
→ RECONCILE
→ IDENTIFY LAST VERIFIED GOOD STATE
→ IDENTIFY EXACT NEXT ACTION
→ IDENTIFY DO-NOT-TOUCH
→ CHANGE SMALLEST SAFE SCOPE
→ VERIFY
→ UPDATE STATE
→ UPDATE BUG/DECISION LOG WHEN NEEDED
→ LEAVE HANDOFF

Không bao giờ kết thúc bằng "lần sau làm tiếp" mà thiếu trạng thái và bước tiếp theo.
