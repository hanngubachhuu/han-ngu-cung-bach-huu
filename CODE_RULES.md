# CODE_RULES.md

## 0. Status

**Đây là bộ quy tắc kiểm soát code của Hán Ngữ Cùng Bách Hữu.**

Các quy tắc trong file này áp dụng cho:

- code mới;
- refactor;
- bug fix;
- dữ liệu HSK/HSKK;
- UI;
- CSS;
- JavaScript;
- lesson pages;
- deployment;
- mọi thay đổi do con người hoặc AI thực hiện.

Khi một yêu cầu mâu thuẫn với các quy tắc này, phải ưu tiên bảo vệ tính ổn định kiến trúc và làm rõ trade-off trước khi tạo thêm technical debt.

---

# 1. Luật số 1: Clean Code là yêu cầu bắt buộc

Mục tiêu của mỗi commit không chỉ là:

> “tính năng chạy được”

mà là:

> **“tính năng chạy được và hệ thống vẫn dễ hiểu, dễ sửa hơn hoặc ít nhất không khó sửa hơn.”**

Không chấp nhận kiểu sửa:

`Bug → patch → patch lên patch → special-case → không ai dám đụng nữa.`

---

# 2. Luật số 2: Không patch trước khi chẩn đoán

Trước một bug phải xác định:

`WHAT
→ WHERE
→ WHY
→ SOURCE OF TRUTH
→ FIX`

Không dùng ngay:

- `!important`;
- inline style;
- extra wrapper;
- duplicate element;
- duplicate event listener;
- duplicate CSS block;
- JS remove/hide để che markup sai.

Nếu chưa biết nguyên nhân, phải đọc code trước.

---

# 3. Luật số 3: Một khái niệm = một nguồn chính

Không được có hai nơi cùng làm chủ một thứ.

Ví dụ danh sách bài học không được đồng thời nằm trong:

- manifest;
- navigation HTML;
- JavaScript hard-code;
- từng lesson page.

Một nguồn phải là canonical.

---

# 4. Luật số 4: Không tạo “V2/V3/FINAL/FIX”

Không đặt tên hoặc tổ chức code theo lịch sử vá lỗi:

`component-v2`
`component-v3`
`component-final`
`component-final-new`
`fix-mobile`
`fix-mobile-2`
`override-last`

Khi version mới thay thế version cũ:

1. migrate;
2. xóa version cũ;
3. giữ một implementation chuẩn.

Version chỉ được dùng khi đó là **schema/data contract thực sự**, ví dụ schema v2.

---

# 5. Luật số 5: Không duplicate component

Một component dùng chung phải có một implementation chung.

Cấm:

`footer-A
footer-B
footer-mobile
footer-v2`

chỉ vì chúng có chút khác nhau.

Nếu hai giao diện thực sự có khác biệt có chủ đích, tạo **modifier/state**:

`.footer
.footer--compact
.footer.is-loading`

thay vì copy cả component.

---

# 6. Luật số 6: HTML giữ cấu trúc

HTML phải mô tả cấu trúc và nội dung.

Không dùng HTML để:

- giả lập state;
- lặp nội dung chỉ để JS dễ xử lý;
- chứa CSS patch;
- chứa bản sao dữ liệu canonical.

Đặc biệt:

**Một lesson không được có hai navigation chỉ vì một cái dành cho intro và một cái dành cho footer.**

Nếu có nhu cầu hiển thị ở hai vị trí, phải thiết kế lại component/flow, không nhân bản DOM.

---

# 7. Luật số 7: CSS có một nơi sở hữu

Mỗi component shared có một khu vực CSS chính.

Ví dụ:

`Navigation → navigation.css
Footer → navigation.css
Lesson → lesson stylesheet`

Không giải quyết cùng một property bằng nhiều selector không cần thiết.

### Không nên

`.site-footer { margin-top: auto; }
.site-footer-v2 { margin-top: 48px; }
body.foo .site-footer-v2 { margin-top: 20px; }`

### Nên

`.site-footer { margin-top: auto; }`

và component không phá page-flow bằng rule khác.

---

# 8. Luật số 8: Hạn chế !important

`!important` chỉ được dùng khi có lý do kiến trúc rõ ràng.

Trước khi thêm phải hỏi:

> “Tại sao cascade bình thường không đủ?”

Nếu câu trả lời là:

> “Vì selector cũ khó sửa”

thì phải refactor selector cũ, không thêm `!important`.

---

# 9. Luật số 9: Không dùng inline style cho layout dùng chung

Không dùng:

`element.style.marginTop = ...
element.style.display = ...
element.style.position = ...`

để giải quyết lỗi layout shared.

Ưu tiên state/class:

`element.classList.add("is-active")`

và CSS sở hữu presentation.

Inline custom properties chỉ được phép khi giá trị đó thực sự là dữ liệu runtime, ví dụ:

`--progress: 0.7`

---

# 10. Luật số 10: JavaScript không được che lỗi DOM

JS không nên làm:

`find all duplicates
→ remove all but one
→ hope the user never notices`

Đây chỉ là migration strategy tạm thời.

Nếu phát hiện duplicate markup:

1. xác định template/source tạo duplicate;
2. sửa source;
3. xóa migration cleanup khi không còn cần.

---

# 11. Luật số 11: Không sửa gh-pages trực tiếp

`main` = source.

`gh-pages` = artifact.

Cấm commit bug fix trực tiếp vào `gh-pages`.

Luồng bắt buộc:

`edit main
→ validate
→ deploy
→ verify production`

Nếu production hotfix buộc phải xử lý thủ công:

- phải ghi lại nguyên nhân;
- phải đưa thay đổi về `main`;
- không để hai branch diverge lâu dài.

---

# 12. Luật số 12: Không tạo source of truth mới

Trước khi thêm dữ liệu/config:

**Tìm xem dữ liệu đó đã tồn tại ở đâu.**

Nếu đã có:

> sửa nơi cũ.

Nếu thực sự cần source mới:

> ghi rõ trong `ARCHITECTURE.md` vì sao source cũ không phù hợp.

---

# 13. Luật số 13: Dữ liệu học thuật không được tự bịa

Đặc biệt với HSK/HSKK:

Không tự tạo dữ liệu mà nguồn không hỗ trợ, nhất là:

- pinyin;
- nghĩa;
- bộ thủ;
- cấu tạo chữ;
- số nét;
- câu ví dụ;
- nguồn tham chiếu.

Thiếu dữ liệu phải được đánh dấu trạng thái theo schema.

---

# 14. Luật số 14: Schema trước, UI sau

Khi thêm dữ liệu lesson mới:

`schema
→ data
→ validation
→ renderer
→ UI`

Không tạo UI trước rồi sau đó “nhét” dữ liệu vào.

---

# 15. Luật số 15: Không hard-code dữ liệu có tính hệ thống

Ví dụ không hard-code danh sách HSK ở nhiều nơi:

`if lesson === 1...
if lesson === 2...
if lesson === 3...`

Ưu tiên data-driven:

`manifest → renderer`

Hard-code chỉ được phép cho:

- cấu hình nhỏ;
- invariant thực sự;
- fallback rõ ràng;
- thuật toán.

---

# 16. Luật số 16: Function phải có một trách nhiệm chính

Một function lớn không được vừa:

- đọc dữ liệu;
- render HTML;
- sửa CSS;
- lưu localStorage;
- xử lý analytics;
- điều hướng.

Tách thành:

`readData()
render()
bindEvents()
saveState()
navigate()`

Không cần tách máy móc mọi vài dòng. Mục tiêu là boundary rõ ràng.

---

# 17. Luật số 17: Không tạo side effect ẩn

Một function tên:

`renderMenu()`

không nên đồng thời:

- sửa localStorage;
- thay đổi URL;
- thêm event listener lần nữa;
- mutate state toàn cục.

Tên function phải phản ánh trách nhiệm thật.

---

# 18. Luật số 18: Event listener phải có lifecycle rõ ràng

Không bind cùng một listener nhiều lần trong những lần render.

Trước khi thêm listener:

- component đã được initialize chưa?
- listener cũ có tồn tại không?
- render lại có gây duplicate event không?

Nếu component có lifecycle:

`init()
update()
destroy()`

thì listener phải thuộc lifecycle đó.

---

# 19. Luật số 19: Không để dead code

Sau refactor phải tìm và xóa:

- function không dùng;
- class không dùng;
- selector không còn element;
- biến cũ;
- comment mô tả kiến trúc không còn đúng;
- compatibility shim đã hết thời gian sử dụng.

Code chết không phải “để đó cho chắc”.

---

# 20. Luật số 20: Comment giải thích WHY

Không viết comment:

`// set margin top to 20px`

nếu code tự nói lên điều đó.

Nên viết:

`// Keep the lesson route in normal document flow so short pages
// can push the footer to the viewport bottom.`

Comment phải giải thích:

> tại sao,

không chỉ:

> làm gì.

---

# 21. Luật số 21: Magic number phải có lý do

Các giá trị như:

`48px
72px
132px
820px
400`

nếu có ý nghĩa hệ thống thì phải:

- đưa vào token/config;
- hoặc ghi rõ context;
- hoặc gom về component rule.

Không tạo hàng loạt số “để thử cho đẹp”.

---

# 22. Luật số 22: Responsive không được là lớp vá

Mỗi breakpoint mới phải trả lời:

1. breakpoint này giải quyết vấn đề gì?
2. component nào sở hữu nó?
3. rule cũ có thể sửa trực tiếp không?
4. có breakpoint khác đang làm cùng việc không?

Không thêm breakpoint chỉ để chữa một pixel lệch.

---

# 23. Luật số 23: Accessibility không phải patch cuối cùng

Interactive component phải xem ngay từ đầu:

- keyboard;
- focus;
- aria;
- semantic element;
- touch target;
- reduced motion.

Không đợi sau khi UI xong mới “gắn thêm aria”.

---

# 24. Luật số 24: Cache-busting phải tập trung ở build

HTML source không nên chứa query version do con người cập nhật thủ công hàng loạt.

Source có thể:

`navigation.css`

Build mới chịu trách nhiệm:

`navigation.css?v=<commit>`

Điều này giúp:

- source sạch;
- deploy tự động;
- cache invalidation có kiểm soát.

---

# 25. Luật số 25: Mỗi commit phải có boundary rõ

Một commit lý tưởng giải quyết **một thay đổi logic có thể mô tả trong một câu**.

Ví dụ tốt:

`Centralize footer styles`

`Fix lesson navigation placement`

`Validate duplicate lesson IDs`

Không gom:

`fix footer + menu + hsk data + homepage + random css`

trừ khi chúng thực sự là một refactor có cùng boundary.

---

# 26. Definition of Done

Một thay đổi chỉ được coi là hoàn thành khi:

### Code

- [ ] Không tạo duplicate implementation.
- [ ] Không tạo source of truth mới ngoài chủ đích.
- [ ] Không thêm patch không cần thiết.
- [ ] Không còn dead code do thay đổi.
- [ ] Không dùng `!important` vô lý.
- [ ] Không có inline layout workaround cho shared component.

### Architecture

- [ ] Đúng tầng trách nhiệm.
- [ ] Component có owner rõ ràng.
- [ ] Data flow rõ ràng.
- [ ] Không tạo coupling mới không cần thiết.

### Verification

- [ ] Kiểm tra desktop.
- [ ] Kiểm tra mobile.
- [ ] Kiểm tra trạng thái liên quan.
- [ ] Chạy validation phù hợp.
- [ ] Kiểm tra production sau deployment nếu thay đổi ảnh hưởng production.

### Documentation

- [ ] Cập nhật `ARCHITECTURE.md` nếu boundary/source of truth thay đổi.
- [ ] Cập nhật schema/documentation nếu contract dữ liệu thay đổi.

---

# 27. Quy trình bắt buộc cho AI

Mọi yêu cầu code phải được xử lý theo pipeline:

`1. READ
2. LOCATE
3. UNDERSTAND
4. PLAN
5. CHANGE
6. CLEAN
7. VALIDATE
8. VERIFY`

### READ
Đọc file liên quan.

### LOCATE
Tìm source of truth và tất cả call-site.

### UNDERSTAND
Hiểu DOM/data/control flow hiện tại.

### PLAN
Xác định đúng layer cần sửa.

### CHANGE
Sửa source.

### CLEAN
Xóa patch cũ, duplicate, dead code nếu thay thế được.

### VALIDATE
Chạy validator/test/build phù hợp.

### VERIFY
Kiểm tra vùng bị ảnh hưởng và regression cơ bản.

**AI không được coi “đã chạy” là “đã sạch”.**

---

# 28. Khi chưa chắc chắn

Nếu có nhiều cách sửa và chưa biết cách nào là đúng kiến trúc:

**không được âm thầm chọn cách tạo thêm technical debt.**

Phải:

- đọc thêm code;
- tìm dependency;
- kiểm tra source of truth;
- hoặc nêu rõ trade-off trước khi quyết định.

---

# 29. Nguyên tắc refactor

Refactor có thể không tạo ra tính năng mới, nhưng phải tạo ra một trong các lợi ích:

- giảm duplicate;
- giảm coupling;
- giảm special-case;
- làm boundary rõ hơn;
- làm test/validation dễ hơn;
- làm thay đổi tương lai rẻ hơn.

Nếu refactor chỉ đổi tên hoặc di chuyển code mà không làm kiến trúc rõ hơn, cần cân nhắc.

---

# 30. Câu thần chú của repository

> **Fix the source, not the symptom.**

> **One source of truth.**

> **No patch on top of a patch.**

> **main is source, gh-pages is artifact.**

> **Every new feature must leave the house easier to repair than before.**
