# Cấu trúc dữ liệu bài học

## Mục tiêu

Dữ liệu bài học là nguồn sự thật duy nhất cho nội dung. HTML/JS giao diện chỉ đọc và hiển thị dữ liệu.

Thứ tự kiến trúc:

```
data/lesson-manifest.js
        ↓
data/lessons/<level>/baiN.js
        ↓
data/lesson-registry.js
        ↓
trang bài học / Ôn tập chung / Hồ sơ từ / Hồ sơ chữ
```

## Khi thêm một bài mới

1. Tạo file `data/lessons/hskX/baiN.js`.
2. Dùng `schemaVersion: 5`.
3. Đăng ký bằng:
```js
window.HAN_NGU_DATA.register({
  schemaVersion: 5,
  id: "hsk2_bai3_xxx",
  content: { ... },
  exerciseSections: [ ... ]
});
```
4. Thêm đúng một dòng vào `data/lesson-manifest.js`.
5. Trang chủ, Ôn tập chung và các trang tra cứu sẽ đọc manifest tự động.
6. Chạy validator trước khi thay đổi tiếp.

## Nội dung canonical

### content.course

- `system`
- `level`
- `lessonNo`
- `textbook`
- `titleZh`
- `titleVi`

### content.meta

- `lessonId`
- `timeLimitMinutes`
- `version`
- `detailSchemaVersion`

### content.vocabulary[]

Một mục từ nên có:

- `id`
- `han`
- `pinyin`
- `meaning`
- `partOfSpeech`
- `notes`
- `detail.collocations[]`
- `detail.usageNotes[]`
- `detail.commonConfusions[]`
- `detail.relatedWords[]`
- `status`

### detail.collocations[]

```json
{
  "pattern": "没有时间 + V",
  "meaning": "không có thời gian làm gì",
  "examples": ["我没有时间休息。"],
  "note": "Giải thích sắc thái hoặc điều kiện sử dụng."
}
```

### content.hanzi[]

Mỗi chữ nên có:

- `char`
- `pinyin`
- `meaning`
- `radical`
- `structure`
- `strokes`
- `words` hoặc `exampleWords`
- `readingProfile`
- `deepProfile`

### readingProfile

Dùng cho chữ có nhiều cách đọc hoặc có vấn đề đọc cần giải thích.

```json
{
  "lessonReading": "de",
  "readings": [
    {
      "pinyin": "de",
      "pos": "助词",
      "meaning": "...",
      "when": "...",
      "examples": []
    }
  ],
  "note": "..."
}
```

Không ghi kiểu đơn giản `wéi/wèi` nếu chữ cần phân biệt theo ngữ cảnh.

### content.grammar[]

Chỉ chứa **điểm ngữ pháp**, không chứa tên của dạng bài tập.

```json
{
  "id": "...",
  "title": "Câu hỏi với 是不是",
  "pattern": "S + 是不是 + V/Adj...?",
  "explanation": "...",
  "examples": [],
  "commonErrorIds": [],
  "sourceRefs": [],
  "status": "explicit_verified"
}
```

### content.commonErrors[]

Lỗi thường gặp là dữ liệu sư phạm mở rộng, không được gắn nhãn là nội dung chính thức của SGK nếu không có nguồn.

### content.exampleSentences[]

Mỗi câu:

- `zh`
- `pinyin`
- `vi`
- `sourceRefs`
- `status`

### content.exercises.all[]

Đây là **nguồn duy nhất của ngân hàng bài tập**.

Mỗi câu tối thiểu:

- `id`
- `section`
- `type`
- `prompt`
- `answer` nếu tự động chấm được
- `explanation`
- `sourceRefs`
- `status`

Các dạng đang dùng:

- `mcq`
- `text_fill`
- `self_check`

Sau này chỉ thêm type mới khi renderer đã được nâng cấp tương ứng.

### exerciseSections[]

Chỉ mô tả nhóm bài tập:

```json
{
  "id": "b2-mei",
  "title": "Đại từ 每",
  "skill": "Ngữ pháp",
  "instruction": "..."
}
```

Không lặp câu hỏi vào section.

## Quy tắc nguồn

- Nội dung SGK: `explicit_verified`
- Nội dung mở rộng do giáo viên xây dựng: `teacher_enriched`
- Nội dung suy ra từ dữ liệu khác: `derived`
- Không trộn nguồn mà không ghi `sourceRefs`.

## Điều không nên làm

Không sửa dữ liệu canonical trực tiếp trong file HTML.

Không tạo một bản sao khác của `vocabulary`, `grammar` hoặc `exercises.all` ở HTML.

Không viết `pinyin: "wéi/wèi"` cho chữ đa âm nếu có thể mô tả điều kiện đọc.

Không đưa "Dạng 1, Dạng 2..." vào `content.grammar`. Đó là exercise section.

Không thêm một trường mới tùy tiện chỉ cho một bài. Nếu trường đó cần dùng lâu dài, cập nhật schema và validator trước.

## Quy trình sửa bài

Khi sửa nội dung một bài:

```
data file
  ↓
validator
  ↓
UI dùng chung
  ↓
kiểm tra câu / số lượng / ID
```

Sửa dữ liệu trước, sửa giao diện sau.

## Schema hiện tại

`schemaVersion: 5`

Bất kỳ thay đổi có tính phá vỡ cấu trúc phải tăng phiên bản và cập nhật `data/lesson-registry.js` cùng validator.
