# Quality Assurance

Đây là tầng kiểm soát chất lượng dữ liệu.

Quy trình chuẩn:

draft
→ schema validation
→ source/provenance check
→ language check
→ pedagogical check
→ answer/media check
→ teacher approval
→ published

Bất kỳ gate có severity=block chưa đạt thì không được publish.

Các luật máy đọc được nằm tại `data/qa/rules.json`.

## Hai tầng kiểm định

### 1. Data integrity CI
`scripts/validate-lessons.mjs` kiểm tra lỗi cấu trúc có thể làm hỏng dữ liệu hoặc giao diện. Thiếu dữ liệu enrich ở trạng thái draft được ghi thành **warning**, không làm CI đỏ.

### 2. Publish readiness
`scripts/validate-publish-readiness.mjs` là gate nghiêm ngặt cho lesson ở `review` hoặc `published`. Gate này buộc dữ liệu chữ Hán, provenance, pinyin/dịch câu mẫu và các yêu cầu enrich tối thiểu phải hoàn tất trước khi publish.

Mục tiêu là tránh tình trạng mỗi lần enrich dở dang lại tạo một chuỗi mail `Run failed`, đồng thời vẫn giữ một cửa kiểm định chặt trước khi đưa nội dung đến học sinh.
