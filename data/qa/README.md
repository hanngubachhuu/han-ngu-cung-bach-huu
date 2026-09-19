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