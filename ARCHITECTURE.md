# ARCHITECTURE.md

## 1. Mục đích

Đây là tài liệu kiến trúc chuẩn của **Hán Ngữ Cùng Bách Hữu**.

Mục tiêu cao nhất của kiến trúc là:

> **Dễ hiểu → dễ sửa → dễ kiểm tra → khó làm hỏng.**

Website phải được phát triển theo hướng có cấu trúc ổn định lâu dài, thay vì giải quyết từng lỗi bằng các lớp vá ngắn hạn.

Tài liệu này mô tả:

- các tầng của hệ thống;
- nơi nào là **source of truth** của từng loại dữ liệu/giao diện/hành vi;
- ranh giới trách nhiệm giữa HTML, CSS, JavaScript và dữ liệu;
- quy tắc mở rộng tính năng;
- quy trình chuyển đổi từ cấu trúc hiện tại sang cấu trúc sạch hơn.

---

## 2. Nguyên tắc kiến trúc cốt lõi

### 2.1. Single Source of Truth

Mỗi khái niệm quan trọng chỉ được có **một nguồn chính**.

Ví dụ:

- danh sách bài học → manifest dữ liệu;
- cấu trúc bài học → lesson schema/template;
- giao diện navigation → stylesheet dùng chung;
- hành vi navigation → JavaScript dùng chung;
- deployment → GitHub Actions;
- footer → một hệ thống footer duy nhất.

Các nơi khác chỉ **đọc và sử dụng**, không tạo bản sao độc lập.

### 2.2. Không sửa triệu chứng khi nguyên nhân chưa được xác định

Một lỗi giao diện phải được truy nguyên theo thứ tự:

`DOM → parent/layout → CSS cascade → JavaScript behavior → data`

Không được mặc định thêm CSS override chỉ vì đó là cách nhanh nhất.

### 2.3. Composition over Patch

Ưu tiên ghép các thành phần ổn định:

`Layout → Component → Data → Behavior`

thay vì:

`Old code → override → override mới → special-case → final-fix`

Tên kiểu `v2`, `v3`, `final`, `fix2`, `override-new` không phải kiến trúc.

### 2.4. Source code và artifact triển khai là hai thứ khác nhau

`main` là **source of truth**.

`gh-pages` là **deployment artifact**.

Luồng chuẩn:

`main → GitHub Actions → dist → gh-pages → GitHub Pages`

Không phát triển trực tiếp trên `gh-pages`.

---

# 3. Kiến trúc logic tổng thể

Hiện tại website chủ yếu là HTML/CSS/JavaScript tĩnh, nhưng phải được tổ chức theo các tầng sau:

`┌──────────────────────────────┐
│          UI / HTML           │
├──────────────────────────────┤
│     Components / CSS         │
├──────────────────────────────┤
│      Behavior / JS           │
├──────────────────────────────┤
│       Canonical Data         │
├──────────────────────────────┤
│ Validation / Build / Deploy  │
└──────────────────────────────┘`

### Tầng 1. HTML

HTML chịu trách nhiệm:

- cấu trúc tài liệu;
- semantic elements;
- nội dung tĩnh tối thiểu;
- điểm móc (`id`, `class`, `data-*`) cần thiết cho JS/CSS.

HTML **không** chịu trách nhiệm:

- điều khiển trạng thái phức tạp;
- lặp lại một khối nội dung chỉ để phục vụ JS;
- chứa bản sao của dữ liệu canonical;
- chứa các CSS patch dành cho hệ thống dùng chung.

### Tầng 2. CSS

CSS chịu trách nhiệm:

- layout;
- typography;
- màu sắc;
- spacing;
- responsive;
- states;
- accessibility presentation.

CSS dùng chung phải có **một nơi sở hữu chính**.

Không dùng CSS để sửa một cấu trúc DOM sai nếu có thể sửa chính DOM hoặc source component.

### Tầng 3. JavaScript

JavaScript chịu trách nhiệm:

- tương tác;
- trạng thái;
- render động;
- navigation behavior;
- localStorage;
- kết nối dữ liệu với UI.

JavaScript không nên dùng inline style để sửa layout thường xuyên.

Ví dụ không ưu tiên:

`element.style.marginTop = "20px"`

Ưu tiên:

`element.classList.add("is-condensed")`

và để CSS quyết định presentation.

### Tầng 4. Canonical Data

Dữ liệu học tập phải nằm trong các nguồn dữ liệu chuẩn.

Ví dụ:

`data/lesson-manifest.js`

là nơi chuẩn cho:

- HSK level;
- lesson number;
- title;
- lesson href;
- metadata dùng chung cho menu/navigation.

Schema bài học được định nghĩa bởi:

- `LESSON_TEMPLATE_V2.md`
- `lesson-schema.js`

### Tầng 5. Validation / Build / Deploy

Validation và deployment phải tự động hóa càng nhiều càng tốt.

Các thay đổi dữ liệu phải có validation.

Deployment phải bắt đầu từ `main`, không từ `gh-pages`.

---

# 4. Source of Truth

| Thành phần | Source of truth |
|---|---|
| Lesson structure | `LESSON_TEMPLATE_V2.md` + `lesson-schema.js` |
| Lesson manifest | `data/lesson-manifest.js` |
| Lesson content | `data/**` / dữ liệu canonical tương ứng |
| Navigation visual | `navigation.css` |
| Navigation behavior | `hsk1-navigation.js` và module navigation tương lai |
| Footer visual | `navigation.css` |
| Footer behavior/content | JavaScript footer logic |
| Deployment | `.github/workflows/deploy.yml` |
| Lesson validation | `scripts/validate-lessons.mjs` + workflow validation |
| Production branch | `gh-pages` do workflow tạo |

**Quy tắc:** nếu một thành phần đã có source of truth, không tạo thêm source of truth thứ hai.

---

# 5. Kiến trúc Lesson

Bài học phải đi theo mô hình:

`Canonical lesson data
        ↓
     LESSON
        ↓
  lesson renderer
        ↓
        UI
        ↓
Review / Vocabulary / Grammar / Hanzi / Exercises`

Một lesson không được tự định nghĩa lại:

- danh sách bài;
- navigation;
- metadata dùng chung;
- dữ liệu review đã tồn tại ở canonical layer.

## 5.1. Schema

Schema hiện hành là **v2**.

Các trường canonical nằm dưới:

`LESSON.content`

Legacy:

`LESSON.sections`
`LESSON.questions`

được giữ trong giai đoạn chuyển đổi để không phá engine cũ.

Khi phát triển tính năng mới, ưu tiên canonical schema.

## 5.2. Dữ liệu thiếu

Không tự bịa:

- pinyin;
- bộ thủ;
- số nét;
- nghĩa;
- câu ví dụ;
- nguồn tham chiếu.

Dữ liệu chưa đủ phải được đánh dấu trạng thái thích hợp như:

- `pending_enrichment`;
- `derived_*`;
- hoặc trạng thái đã được schema quy định.

---

# 6. Navigation Architecture

Navigation là một component hệ thống, không phải một phần trang riêng lẻ.

Kiến trúc mục tiêu:

`navigation.html structure
        +
navigation.css
        +
navigation.js
        +
canonical lesson manifest`

Navigation phải:

1. lấy danh sách bài từ manifest;
2. xác định bài hiện tại từ URL;
3. xử lý trạng thái học tập bằng một model thống nhất;
4. render desktop/mobile từ cùng một nguồn dữ liệu;
5. không lưu một bản danh sách bài khác trong mỗi HTML.

## 6.1. Lesson navigation

Một bài học chỉ được có:

`Lesson Content
↓
Lesson Navigation
↓
Footer`

Không được có hai `.lesson-route` để rồi dùng JavaScript xóa một cái.

Nếu template sinh ra hai navigation, phải sửa template/source generation.

JavaScript có thể làm migration tạm thời trong giai đoạn chuyển đổi, nhưng migration phải có kế hoạch xóa.

---

# 7. Footer Architecture

Footer là component dùng chung.

Kiến trúc mục tiêu:

`Page
 ↓
Footer component
 ↓
Footer visual + footer behavior`

Footer phải nằm trong **normal document flow**.

Nguyên tắc:

- không `position:absolute` để ép footer xuống;
- không `position:fixed` cho chính footer;
- không dùng nhiều `margin-top` khác nhau cho cùng một footer;
- không có `footer-v2`, `footer-v3`, `footer-final`;
- không nhúng một bản CSS footer lớn trong từng page script.

Đối với trang ngắn:

`body` dùng flex-column và footer được phép dùng `margin-top:auto` ở tầng layout chung.

Đối với trang dài:

footer tiếp tục nằm trong flow tự nhiên.

---

# 8. Responsive Architecture

Responsive phải được thiết kế từ component, không phải chữa từng màn hình sau khi lỗi xuất hiện.

Thứ tự ưu tiên:

1. mobile-safe base;
2. tablet adjustments;
3. desktop enhancement.

Không tạo:

`mobile-fix-1 → mobile-fix-2 → mobile-final`

cho cùng một vấn đề.

Mỗi component nên có breakpoint rõ ràng, gần khu vực CSS của component hoặc theo hệ thống responsive chung được chuẩn hóa sau này.

---

# 9. State Management

State của người học phải có một nguồn duy nhất.

Ví dụ hiện tại:

`hnh_learning_state_v1`

State nên chứa dữ liệu logic tối thiểu:

`last lesson
visited lessons
timestamps / metadata cần thiết`

UI không được tự tạo một state song song khác chỉ vì một component mới cần dữ liệu.

Nếu schema state thay đổi lớn:

`v1 → v2`

phải có migration rõ ràng.

---

# 10. Deployment Architecture

Workflow hiện tại:

`push main
  ↓
GitHub Actions
  ↓
prepare dist
  ↓
cache-bust assets
  ↓
publish gh-pages
  ↓
GitHub Pages`

## 10.1. Không chỉnh production branch bằng tay

Không commit trực tiếp vào `gh-pages` để sửa bug.

Nếu production đang sai:

1. tìm nguyên nhân trong source;
2. sửa `main`;
3. chạy validation;
4. deploy lại.

Ngoại lệ chỉ dành cho sự cố khẩn cấp có lý do rõ ràng và phải tạo follow-up để đưa source về trạng thái đồng nhất.

---

# 11. Validation Architecture

Validation phải bảo vệ các invariant quan trọng.

Ví dụ:

- schema lesson hợp lệ;
- required fields tồn tại;
- không có lesson ID duplicate;
- manifest không có href duplicate;
- đường dẫn lesson hợp lệ;
- không có dữ liệu ngoài schema nếu validator cấm;
- build/deploy không làm mất file cần thiết.

Về lâu dài nên bổ sung:

- duplicate HTML component detection;
- duplicate selector detection;
- forbidden inline style check cho shared components;
- forbidden direct `gh-pages` development;
- broken-link check;
- basic HTML/CSS/JS sanity check.

---

# 12. Quy tắc mở rộng hệ thống

Khi thêm một tính năng:

### Bước 1
Xác định tính năng thuộc tầng nào.

### Bước 2
Tìm source of truth đang có.

### Bước 3
Tìm component chịu trách nhiệm.

### Bước 4
Mở rộng component đó.

### Bước 5
Chỉ tạo abstraction mới khi abstraction cũ không còn phù hợp.

Không tạo abstraction mới chỉ vì muốn tránh đọc code cũ.

---

# 13. Migration Strategy

Repository hiện tại đã trải qua nhiều giai đoạn chỉnh sửa. Vì vậy **không refactor toàn bộ trong một lần**.

Mỗi đợt refactor nên theo:

`Observe
→ Inventory
→ Define canonical source
→ Migrate
→ Remove duplicate
→ Verify
→ Lock rule
`

Ưu tiên refactor theo vùng:

1. shared navigation;
2. shared footer;
3. lesson layout;
4. lesson manifest/data;
5. page-specific styles;
6. các utility script còn lại.

Một vùng chỉ được coi là hoàn thành khi:

- không còn duplicate source;
- không còn patch cũ;
- source of truth được ghi rõ;
- test/validation phù hợp đã chạy.

---

# 14. Định nghĩa “kiến trúc sạch”

Một khu vực được xem là sạch khi người mới vào repository có thể trả lời trong vài phút:

1. Dữ liệu nằm ở đâu?
2. Giao diện nằm ở đâu?
3. Logic nằm ở đâu?
4. Component này được dùng ở những trang nào?
5. Sửa ở đâu để toàn hệ thống cùng thay đổi?
6. Làm thế nào để kiểm tra thay đổi không phá phần khác?

Nếu không trả lời được các câu hỏi này, khu vực đó cần refactor.

---

# 15. Architectural Decision Rule

Khi có hai cách sửa, ưu tiên cách:

**ít duplicate hơn + ít coupling hơn + ít special-case hơn + dễ rollback hơn.**

Thứ tự ưu tiên:

`Fix source
> Refactor component
> Extract shared module
> Add controlled configuration
> Temporary migration
> One-off patch`

One-off patch là lựa chọn cuối cùng, không phải lựa chọn mặc định.

---

# 16. Quy tắc dành cho AI coding assistant

Mọi AI trước khi sửa repository phải:

1. đọc `ARCHITECTURE.md`;
2. đọc `CODE_RULES.md`;
3. đọc source file liên quan;
4. xác định source of truth;
5. kiểm tra dependency/call-site;
6. sửa ở đúng tầng;
7. chạy hoặc kiểm tra validation phù hợp;
8. báo rõ những thay đổi kiến trúc nếu có.

AI **không được**:

- tạo patch chồng patch chỉ để làm giao diện “trông đúng”;
- tạo duplicate component;
- sửa production branch trực tiếp;
- tự ý tạo source of truth mới;
- thêm inline CSS cho shared behavior;
- giữ code chết sau khi đã thay thế;
- đổi kiến trúc lớn mà không ghi lại quyết định.

---

# 17. Nguyên tắc tối thượng

## Quyết định tích hợp phát âm — cập nhật 25/09/2026

- `phat-am.html` là trang luyện phát âm chuẩn, vào học trực tiếp, dùng nguyên navigation/footer `hsk1-navigation.js` / `navigation.css`. `pinyin.html` chỉ là URL tương thích, chuyển đến trang chuẩn và giữ hash/query; không tồn tại hai giao diện luyện tập riêng.
- `pinyin.css` / `pinyin.js` sở hữu bốn phần Âm cơ bản / Ghép âm / Thanh điệu / Luyện nghe. Các phần được chọn bằng hash; hash `#videos` cũ mở Âm cơ bản. CSS trang không sở hữu lại navigation/footer.
- `data/pinyin-basics.js` là danh mục chuẩn các âm cơ bản: 21 thanh mẫu, 24 vận mẫu nhập môn, y/w tách riêng. Có 46 video từ thư viện chủ website cung cấp và một mẫu nghe x trong xī. `media/pinyin/` chứa MP4, MP3 tách từ cùng clip, ảnh xem trước; không dùng video Douyin bị từ chối.
- Khung luyện có một DOM và một nguồn trạng thái. Trên desktop nó nằm cạnh bảng; dưới 850px cùng khung đó được đưa vào dialog, đóng thì trả về chỗ cũ. Đổi âm, đổi phần, đóng dialog hoặc rời trang phải dừng các media trước đó. Video lỗi dùng audio của chính clip, không thay bằng âm khác.
- Dữ liệu chuẩn Pinyin là `data/pinyin-data.js`; ánh xạ audio là `data/pinyin-audio.js`. Chúng không thuộc lesson schema vì bảng phát âm phục vụ nhiều bài/cấp độ. `scripts/validate-pinyin.mjs` kiểm tra bảng âm, chính tả, coverage và hash audio.
- `hnbh_pinyin_v1` giữ `saved` / `best` hiện có và thêm `basicSaved` cho âm cơ bản; không xóa tiến độ cũ hoặc sao chép trạng thái bài học `hnh_learning_state_v1`. `hnbh_pinyin_review_v1` là phiếu kiểm tra cục bộ của quản trị, tách dữ liệu học sinh.
- `scripts/prepare-pinyin-media.py` chuyển đổi có thể tái chạy từ thư viện gốc; không sửa MPG. `docs/pinyin/basic-media-manifest.json` ghi tên gốc, hash và đầu ra. Cache version của CSS/JS phát âm do workflow triển khai thêm, không viết tay trong HTML.
- `admin/pinyin-sources*` sở hữu tác giả/nguồn và phiếu duyệt. `admin/` cùng `docs/pinyin/` không được đưa lên Pages; thông báo giấy phép vẫn đi cùng audio.
- Trang chủ chuẩn là `trang-chu.html`. `index.html` là bản vào tương đương cho xem trước; build sao chép từ trang chuẩn trước bước cache-busting để hai địa chỉ không lệch script/nội dung. Thẻ Phát âm trỏ tới `phat-am.html` ngay trong renderer trang chủ.

> **Code mới không được tạo thêm nợ cho code cũ.**

Và:

> **Một lần sửa tốt là một lần làm hệ thống dễ sửa hơn cho lần sau.**
