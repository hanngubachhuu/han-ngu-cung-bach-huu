# LESSON Data Schema v2

Mọi bài học mới dùng một khung dữ liệu chung dưới `LESSON.content`. Các trường `sections` và `questions` cũ vẫn giữ lại trong giai đoạn chuyển đổi để không làm hỏng các engine hiện tại.

## Khung chuẩn

```js
const LESSON = {
  schemaVersion: 2,
  content: {
    course: { system: 'HSK', level: 2, lessonNo: 1, textbook: 'Giáo trình chuẩn HSK 2', titleZh: '中文标题', titleVi: 'Tiêu đề tiếng Việt' },
    meta: { timeLimitMinutes: 60, version: 1, lessonId: '...' },
    vocabulary: [{ id: 'bai1_v1', han: '明', pinyin: 'míng', meaning: 'sáng, rõ ràng', partOfSpeech: 'tính từ', notes: '...', exampleSentenceIds: ['bai1_s1'], sourceRefs: ['q1'], status: 'explicit' }],
    grammar: [{ id: 'bai1_g1', title: '...', pattern: '...', explanation: '...', examples: ['...'], commonErrorIds: ['bai1_e1'], sourceRefs: ['q10'], status: 'explicit' }],
    hanzi: [{ char: '明', pinyin: 'míng', meaning: 'sáng, rõ ràng', radical: '日', structure: '左右结构 · 日 + 月', strokes: 8, notes: '...', exampleWords: ['明天','明白'], sourceRefs: ['bai1_v1'], detailHref: 'chu-han-ming.html', status: 'enriched' }],
    exampleSentences: [{ id: 'bai1_s1', zh: '我明白了。', pinyin: 'Wǒ míngbai le.', vi: 'Tôi hiểu rồi.', sourceRefs: ['q18'], status: 'explicit' }],
    commonErrors: [{ id: 'bai1_e1', area: 'grammar', wrong: '...', correct: '...', explanation: '...', tip: '...', sourceQuestionId: 'q20', status: 'explicit' }],
    skills: { vocabulary: ['q1'], grammar: ['q10'], reading: ['q30'], translation: ['q40'], writing: ['q50'], speaking: ['q51'], mixed: [] },
    exercises: { all: [], vocabulary: [], grammar: [], reading: [], translation: [], writing: [], speaking: [], mixed: [] },
    passages: [{ id: 'p1', text: '...', source: 'lesson.passages' }],
    coverage: { vocabulary: 'explicit', grammar: 'explicit', hanzi: 'enriched', exampleSentences: 'explicit', commonErrors: 'explicit', translation: 'present', writing: 'present', speaking: 'present', reading: 'present' }
  },
  sections: [],
  questions: []
};
```

## Quy ước trạng thái

- `explicit`: dữ liệu được khai báo trực tiếp trong bài.
- `derived_...`: dữ liệu được suy ra từ dữ liệu cũ, cần biên tập lại.
- `enriched`: đã được bổ sung dữ liệu chuyên sâu.
- `pending_enrichment`: trường đã tồn tại nhưng chưa có dữ liệu đáng tin cậy để điền.

Nguyên tắc: không tự bịa pinyin, bộ thủ, số nét, nghĩa hoặc câu mẫu nếu nguồn bài học chưa hỗ trợ. Dữ liệu thiếu được đánh dấu trạng thái để bổ sung sau.

## Luồng dữ liệu

`Bài học → LESSON.content → Ôn tập chung → Chữ Hán / Từ vựng / Ngữ pháp / Bài tập / Kiểm tra`

Khi tạo Bài 8, Bài 9... chỉ cần theo schema này; không cần thiết kế lại phần Ôn tập chung.