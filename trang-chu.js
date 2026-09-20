
// ============================================================
// DỮ LIỆU LỘ TRÌNH HSK — nguồn dùng chung cho menu điều hướng và
// khối "Bài học theo cấp độ" ở trang chủ. Khi có bài học mới, chỉ
// cần thêm vào mảng "lessons" của đúng cấp độ tương ứng.
// ============================================================
var HSK_LEVELS = [
  {id:'phat-am', label:'Phát âm', badge:'PA', tag:'Nền tảng nghe – nói', lessons:[]},
  {id:'hsk1', label:'HSK 1', badge:'1', tag:'Nhập môn', lessons:[]},
  {id:'hsk2', label:'HSK 2', badge:'2', tag:'Sơ cấp', reviewHref:'on-tap-chung.html', lessons:[
    {num:1, zh:'九月去北京旅游最好', vi:'Tháng 9 đi Bắc Kinh du lịch là tốt nhất', href:'bvnh2-1.html'},
    {num:2, zh:'我每天六点起床', vi:'Mỗi ngày tôi dậy lúc 6 giờ', href:'bai2_index.html'},
    {num:3, zh:'左边那个红色的是我的', vi:'Cái màu đỏ bên trái là của tôi', href:'bai3_index.html'},
    {num:4, zh:'这个工作是他帮我介绍的', vi:'Công việc này là anh ấy giới thiệu giúp tôi', href:'bai4_index.html'},
    {num:5, zh:'就买这件吧', vi:'Mua chiếc áo này đi', href:'bai5_index.html'},
    {num:6, zh:'你怎么不吃了？', vi:'Sao anh không ăn nữa?', href:'bai6_index.html'},
    {num:7, zh:'你家离公司远吗？', vi:'Nhà chị có ở xa công ty không?', href:'bai7_index.html'}
  ]},
  {id:'hsk3', label:'HSK 3', badge:'3', tag:'Sơ trung cấp', lessons:[]},
  {id:'hsk4', label:'HSK 4', badge:'4', tag:'Trung cấp', lessons:[]},
  {id:'hsk5', label:'HSK 5', badge:'5', tag:'Trung cao cấp', lessons:[]},
  {id:'hsk6', label:'HSK 6', badge:'6', tag:'Cao cấp', lessons:[]}
];

// Vẽ nội dung menu thả xuống "Lộ trình HSK" trên thanh điều hướng —
// mỗi cấp độ là một hàng có thể bấm mở ra danh sách bài học riêng.
function renderHskDropdown(){
  var panel = document.getElementById('hskDropdownPanel');
  if(!panel) return;
  panel.innerHTML = '';
  HSK_LEVELS.forEach(function(level){
    var wrap = document.createElement('div');
    wrap.className = 'dd-level';
    var head = document.createElement('div');
    head.className = 'dd-level-head';
    var hasLessons = level.lessons.length > 0;
    head.innerHTML =
      '<span class="dd-level-name"><span class="dd-level-badge">' + level.badge + '</span>' +
      level.label + '<span class="dd-level-tag">· ' + level.tag + '</span></span>' +
      (hasLessons ? '<span class="dd-level-caret">▾</span>' : '<span class="dd-level-soon">Sắp ra mắt</span>');
    wrap.appendChild(head);
    if(hasLessons){
      var list = document.createElement('div');
      list.className = 'dd-level-lessons';
      if(level.reviewHref){
        var rev = document.createElement('a');
        rev.href = level.reviewHref;
        rev.className = 'dd-review-link';
        rev.innerHTML = '📝 Ôn tập nhanh (thẻ từ, ngân hàng đề, kiểm tra) →';
        list.appendChild(rev);
      }
      level.lessons.forEach(function(l){
        var a = document.createElement('a');
        a.href = l.href;
        a.innerHTML = 'Bài ' + l.num + ' · ' + l.vi;
        list.appendChild(a);
      });
      wrap.appendChild(list);
      head.addEventListener('click', function(){ wrap.classList.toggle('open'); });
    }
    panel.appendChild(wrap);
  });
}

// Vẽ lưới thẻ cấp độ ở khối "Lộ trình HSK" trên trang chủ — bấm vào
// thẻ có bài học để mở/thu danh sách bài ngay tại chỗ.
function renderLevelGrid(){
  var grid = document.getElementById('levelGrid');
  if(!grid) return;
  grid.innerHTML = '';
  HSK_LEVELS.forEach(function(level){
    var hasLessons = level.lessons.length > 0;
    var card = document.createElement('div');
    card.className = 'level-card' + (hasLessons ? ' has-lessons' : '');
    var head = document.createElement('div');
    head.className = 'level-card-head';
    head.innerHTML =
      '<span class="level-card-badge">' + level.badge + '</span>' +
      '<span class="level-card-info"><h3>' + level.label + '</h3><p>' + level.tag + '</p></span>' +
      '<span class="level-card-meta">' + (hasLessons
        ? '<span class="level-card-count">' + level.lessons.length + ' bài<span class="level-card-caret">▾</span></span>'
        : '<span class="level-card-soon">Sắp ra mắt</span>') + '</span>';
    card.appendChild(head);
    if(hasLessons){
      var lessonsWrap = document.createElement('div');
      lessonsWrap.className = 'level-card-lessons';
      if(level.reviewHref){
        var revRow = document.createElement('a');
        revRow.className = 'lesson-row review-row';
        revRow.href = level.reviewHref;
        revRow.innerHTML =
          '<span class="lesson-row-top"><span class="lesson-row-num">📝</span>' +
          '<span class="lesson-row-zh" style="font-family:var(--font-vn); font-size:14.5px; font-weight:700;">Ôn tập nhanh</span>' +
          '<span class="lesson-row-cta">Thẻ từ · Ngân hàng đề · Kiểm tra →</span></span>';
        lessonsWrap.appendChild(revRow);
      }
      level.lessons.forEach(function(l){
        var a = document.createElement('a');
        a.className = 'lesson-row';
        a.href = l.href;
        a.innerHTML =
          '<span class="lesson-row-top"><span class="lesson-row-num">' + l.num + '</span>' +
          '<span class="lesson-row-zh">' + l.zh + '</span>' +
          '<span class="lesson-row-cta">Vào học →</span></span>' +
          '<span class="lesson-row-vi">' + l.vi + '</span>';
        lessonsWrap.appendChild(a);
      });
      card.appendChild(lessonsWrap);
      head.addEventListener('click', function(){ card.classList.toggle('open'); });
    }
    grid.appendChild(card);
  });
  // Mặc định TẤT CẢ các cấp độ đều thu gọn — người dùng bấm vào mới xem
  // được danh sách bài học bên trong (không tự động mở sẵn cấp nào).
}

(function(){
  renderHskDropdown();
  renderLevelGrid();

  // FAQ accordion — bấm câu hỏi để mở/thu câu trả lời tương ứng.
  document.querySelectorAll('.faq-item .faq-q').forEach(function(btn){
    btn.addEventListener('click', function(){
      btn.closest('.faq-item').classList.toggle('open');
    });
  });

  var burger = document.getElementById('siteNavBurger');
  var links = document.getElementById('siteNavLinks');
  var ddWrap = document.getElementById('hskDropdown');
  var ddBtn = document.getElementById('hskDropdownBtn');

  if(ddBtn && ddWrap){
    ddBtn.addEventListener('click', function(e){
      e.stopPropagation();
      var open = ddWrap.classList.toggle('open');
      ddBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    document.addEventListener('click', function(e){
      if(ddWrap.classList.contains('open') && !ddWrap.contains(e.target)){
        ddWrap.classList.remove('open');
        ddBtn.setAttribute('aria-expanded','false');
      }
    });
  }

  if(burger && links){
    burger.addEventListener('click', function(){
      var open = links.classList.toggle('open');
      burger.setAttribute('aria-expanded', open ? 'true' : 'false');
      burger.textContent = open ? '✕' : '☰';
    });
    links.querySelectorAll('a').forEach(function(a){
      a.addEventListener('click', function(){
        links.classList.remove('open');
        burger.setAttribute('aria-expanded','false');
        burger.textContent = '☰';
      });
    });
  }
  var yearEl = document.getElementById('footerYear');
  if(yearEl) yearEl.textContent = new Date().getFullYear();
})();
