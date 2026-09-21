/*
 * Hán Ngữ Cùng Bách Hữu · Ngân hàng luyện tập HSK 2, Bài 8–15
 *
 * Nguồn dữ liệu vẫn là từng baiN.js. File này chỉ tái cấu trúc phần bài tập
 * sau khi bài học được đăng ký, để phần Ôn tập chung, thống kê và trang bài
 * đồng thời dùng cùng một ngân hàng câu hỏi.
 *
 * Quy ước nội bộ:
 * - N01–N25: hồ sơ của phương án nhiễu trắc nghiệm.
 * - E01–E35: rubric/chẩn đoán lỗi đầu ra; rubric được hiện khi học sinh tự chấm.
 */
(function(global){
  const R = global.HAN_NGU_DATA = global.HAN_NGU_DATA || {};
  const sourceRefs = no => [`textbook_l${String(no).padStart(2,"0")}`, `workbook_l${String(no).padStart(2,"0")}`, "teacher_enriched_v2"];
  const errText = {
    N01:"Nhầm từ gần nghĩa hoặc cùng trường nghĩa.",
    N02:"Biết nghĩa từng từ nhưng ghép từ không tự nhiên.",
    N04:"Nhầm vị trí 的、地 hoặc 得.",
    N05:"Đảo trật tự thành phần theo cách người học Việt thường nói.",
    N06:"Nhầm ý hoàn thành, trải nghiệm hoặc trạng thái.",
    N07:"Nhầm phủ định 不 và 没.",
    N09:"Nhầm kết quả của hành động.",
    N10:"Chọn lượng từ theo thói quen tiếng Việt.",
    N11:"Nhầm giới từ hoặc điểm bắt đầu/hướng.",
    N12:"Đảo quan hệ nguyên nhân, nhượng bộ hoặc điều kiện.",
    N15:"Chọn từ cùng chủ đề nhưng không khớp tình huống.",
    N18:"Dịch từng chữ từ tiếng Việt sang tiếng Trung.",
    N19:"Câu gần đúng nhưng sai một chi tiết trọng tâm.",
    N20:"Hình thức có thể đúng nhưng ý không khớp dữ kiện.",
    N22:"Động từ không đi tự nhiên với tân ngữ này."
  };
  const d = (t, code, reason) => ({t, code, reason:reason || errText[code] || "Phương án không khớp mục tiêu cần kiểm tra."});

  const sectionInfo = {
    vocabulary:["A. TỪ VỰNG TRONG TÌNH HUỐNG","tuvung","Chọn cách hiểu hoặc cách dùng phù hợp với tình huống."],
    grammar:["B. DÙNG CÂU TRONG NGỮ CẢNH","nguphap","Dùng câu để diễn đạt việc thật; không cần nhớ tên thuật ngữ."],
    listening:["C. NGHE HIỂU","nghe","Nghe 2–3 lần. Khi chưa có file nghe, đọc kịch bản rồi trả lời."],
    reading:["D. ĐỌC HIỂU","docHieu","Đọc đoạn văn rồi trả lời câu hỏi bằng tiếng Trung."],
    writing:["E. VIẾT CÓ KIỂM SOÁT","viet","Mỗi ô chỉ làm một nhiệm vụ để tiện tự chấm và sửa."],
    translation:["F. CHUYỂN Ý VIỆT–TRUNG","dich","Dịch theo ý và tình huống, không ghép từng từ."],
    speaking:["G. NÓI & TƯƠNG TÁC","giaotiep","Đọc thành tiếng hoặc nói theo vai. Em có thể ghi âm để tự nghe lại."],
  };

  function makeLesson(cfg){
    const lesson = R.lessons && R.lessons[cfg.lessonId];
    if(!lesson) return;
    const c = lesson.content;
    const all = [];
    const serial = {value:0, mcq:0};
    const id = () => `B${cfg.no}-${String(++serial.value).padStart(2,"0")}`;
    const decorate = (q, section, target, level, extra={}) => Object.assign(q, {
      id:id(), section, sectionTitle:sectionInfo[section][0], skill:sectionInfo[section][1],
      sourceRefs:sourceRefs(cfg.no), status:"teacher_enriched_v2",
      quality:{target, level, checked:["grammar","meaning","pragmatics","single_answer"]}
    }, extra);
    const mcq = (section, prompt, correct, wrongs, target, explain, level=2, extra={}) => {
      const correctAt = serial.mcq++ % 4;
      const entries = wrongs.slice(0,3);
      entries.splice(correctAt,0,{t:correct, correct:true});
      return decorate({
        type:"mcq", prompt,
        options:entries.map((entry,index)=>({k:"ABCD"[index],t:entry.t})),
        answer:"ABCD"[correctAt],
        explain, error:"Ba lựa chọn sai được tạo từ lỗi người Việt hay gặp, không phải đáp án ngẫu nhiên.",
        tip:"Đọc cả tình huống trước, rồi mới so sánh từng lựa chọn.", example:correct,
        distractorProfiles:entries.filter(entry=>!entry.correct).map(entry=>({option:entry.t, code:entry.code, reason:entry.reason}))
      },section,target,level,extra);
    };
    const reorder = (section, prompt, tokens, answer, target, explain, level=2) => decorate({
      type:"reorder", prompt, tokens, answer, explain,
      error:"Lỗi thường gặp là đặt thời gian, giới từ hoặc kết quả theo trật tự tiếng Việt.",
      tip:"Tìm chủ ngữ và động từ chính trước, sau đó đặt thời gian hay kết quả vào đúng vị trí.", example:answer.join("")
    },section,target,level);
    const multi = (section, prompt, parts, options, answers, target, explain) => decorate({
      type:"multi_fill", prompt, parts, options, answers, answer:answers, explain,
      error:"Mỗi ô cần được quyết định bằng nghĩa của cả câu, không chọn riêng từng từ.",
      tip:"Đọc hết đoạn, thử từng lựa chọn rồi kiểm tra lại ý chung.", example:answers.join(" · ")
    },section,target,2);
    const open = (section, prompt, model, target, explain, rubric, type="self_check", extra={}) => decorate({
      type, prompt, model, explain, rubric:rubric || "准确 40%: đủ ý và đúng từ/câu.\n连贯 25%: các ý nối được với nhau.\n得体 20%: hợp tình huống.\n自然 15%: trật tự câu tự nhiên.",
      error:"Khi tự sửa, ưu tiên lỗi làm thay đổi ý hoặc lỗi lặp lại.",
      tip:"Không cần chép y hệt đáp án mẫu; câu khác vẫn đạt nếu đúng, rõ và tự nhiên.", example:model,
      ...extra
    },section,target,3);

    cfg.vocabulary.forEach(row => all.push(mcq("vocabulary", row[0], row[1], row[2], row[3], row[4], row[5] || 2)));
    cfg.grammar.forEach(row => {
      if(row.kind === "reorder") all.push(reorder("grammar",row.prompt,row.tokens,row.answer,row.target,row.explain,row.level));
      else if(row.kind === "multi") all.push(multi("grammar",row.prompt,row.parts,row.options,row.answers,row.target,row.explain));
      else all.push(mcq("grammar",row.prompt,row.correct,row.wrongs,row.target,row.explain,row.level || 2));
    });
    cfg.listening.forEach(row => all.push(mcq("listening",row.prompt,row.correct,row.wrongs,row.target,row.explain,2,{
      type:"listening", audioText:row.audioText, audioSrc:`audio/hsk2/bai${cfg.no}/${String(all.length+1).padStart(2,"0")}.mp3`, audioStatus:"awaiting_recording"
    })));
    cfg.passages.forEach(passage => {
      passage.questions.forEach(row => all.push(mcq("reading",row[0],row[1],row[2],row[3],row[4],row[5] || 2,{passageId:passage.id})));
    });
    cfg.writing.orders.forEach(row => all.push(reorder("writing",row[0],row[1],row[2],row[3],row[4],row[5] || 2)));
    cfg.writing.tasks.forEach(row => all.push(open("writing",row[0],row[1],row[2],row[3],row[4])));
    all.push(open("writing",cfg.writing.retell.prompt,cfg.writing.retell.model,"Tường thuật lại một đoạn ngắn",cfg.writing.retell.explain,cfg.writing.retell.rubric,"retell",{sourceText:cfg.writing.retell.sourceText,readSeconds:60}));
    cfg.translation.forEach(row => all.push(open("translation",row[0],row[1],"Chuyển ý hai chiều",row[2],row[3])));
    cfg.speaking.forEach(row => all.push(open("speaking",row[0],row[1],"Nói theo tình huống",row[2],row[3])));
    if(all.length !== 70) throw new Error(`Bài ${cfg.no} cần đúng 70 câu nhưng có ${all.length}.`);

    c.passages = cfg.passages.map(({id,text,source})=>({id,text,source:source || "teacher_enriched_v2"}));
    c.exercises = {all, mixed:[]};
    c.skills = Object.fromEntries(Object.keys(sectionInfo).map(section=>[section,all.filter(q=>q.section===section).map(q=>q.id)]));
    c.skills.mixed = [];
    c.meta.version = Math.max(Number(c.meta.version)||1,3);
    c.meta.timeLimitMinutes = 75;
    c.coverage = Object.assign({},c.coverage,{exercises:"gold_template_v2",skillMatrix:"balanced_4skills_v2",questionStandard:"N01-N25_E01-E35"});
    lesson.exerciseSections = Object.entries(sectionInfo).map(([section,[title,skill,instruction]])=>({id:section,title,skill,instruction,passages:section==="reading" ? c.passages : []}));
  }

  /* Bài 10–15 dùng cùng ma trận 70 câu, với bộ câu tình huống riêng của từng bài.
     Dữ liệu gốc (từ mới/điểm học) được lấy từ baiN.js; các câu chỉ được sinh sau
     khi nội dung bài đã đăng ký, vì vậy Ôn tập chung và thống kê thấy đúng một bản. */
  function makeScenarioBank(profile){
    const lesson = R.lessons[profile.lessonId];
    if(!lesson) return;
    const words = lesson.content.vocabulary.map(v=>v.han);
    const vocab = Array.from({length:12},(_,i)=>{
      const word=words[i%words.length], meaning=lesson.content.vocabulary[i%words.length].meaning;
      const wrongs=[1,2,3].map(offset=>d(words[(i+offset)%words.length], offset===1?"N15":offset===2?"N03":"N20"));
      return [`Chọn từ mới có nghĩa hoặc cách dùng phù hợp với ‘${meaning}’.`,word,wrongs,`Nhận diện từ ${word}`,`Đáp án là ${word}; ba từ còn lại thuộc bài nhưng không mang nghĩa/cách dùng này.`,1];
    });
    const grammar=profile.phrases.map((row,i)=>({prompt:row.prompt,correct:row.zh,wrongs:[
      d(profile.phrases[(i+1)%profile.phrases.length].zh,"N20","Câu đúng hình thức nhưng trả lời một tình huống khác."),
      d(profile.phrases[(i+2)%profile.phrases.length].zh,"N15","Câu cùng chủ đề nhưng chọn sai thông tin trọng tâm."),
      d(profile.phrases[(i+3)%profile.phrases.length].zh,"N19","Câu thay đổi một chi tiết như thời gian, đối tượng hoặc kết quả.")
    ],target:row.target,explain:row.explain,level:2}));
    grammar.splice(5,0,{kind:"reorder",prompt:"Sắp xếp các từ thành câu hoàn chỉnh.",tokens:profile.orders[0],answer:profile.orders[0],target:"Sắp xếp từ thành câu",explain:"Đặt chủ ngữ, thời gian và động từ theo thứ tự tự nhiên."});
    grammar.splice(7,0,{kind:"reorder",prompt:"Sắp xếp các từ thành câu hoàn chỉnh.",tokens:profile.orders[1],answer:profile.orders[1],target:"Sắp xếp từ thành câu",explain:"Các từ phải tạo thành một ý hoàn chỉnh, không đảo theo tiếng Việt."});
    grammar.splice(9,0,{kind:"reorder",prompt:"Sắp xếp các từ thành câu hoàn chỉnh.",tokens:profile.orders[2],answer:profile.orders[2],target:"Sắp xếp từ thành câu",explain:"Tìm cụm động từ chính rồi nối các thành phần còn lại."});
    grammar.length=9;
    grammar.push({kind:"multi",prompt:"Chọn từ phù hợp cho từng chỗ trống.",parts:profile.multi.parts,options:profile.multi.options,answers:profile.multi.answers,target:"Điền từ theo cả ngữ cảnh",explain:"Mỗi lựa chọn cần khớp nghĩa của toàn câu, không chỉ khớp một chỗ trống."});
    const listening=(profile.listening || profile.phrases.slice(0,8).map((row,i)=>[
      row.zh,"听句子，选择和听到内容相同的信息。",row.zh,
      [d(profile.phrases[(i+1)%profile.phrases.length].zh,"N20","Câu đúng hình thức nhưng không phải thông tin đã nghe."),d(profile.phrases[(i+2)%profile.phrases.length].zh,"N20","Đổi sang một tình huống khác."),d(profile.phrases[(i+3)%profile.phrases.length].zh,"N19","Thay đổi một chi tiết trọng tâm.")],"先听清人物、时间和结果。"
    ])).map(row=>({audioText:row[0],prompt:row[1],correct:row[2],wrongs:row[3],target:"Nghe lấy thông tin",explain:row[4]}));
    const passages=profile.stories.map((story,index)=>{
      const others=profile.stories.filter((_,i)=>i!==index);
      const wrong=(key)=>others.map(item=>d(item[key],"N19","Nhầm nhân vật hoặc chi tiết của đoạn khác.")).concat(d("文中没有说。","N20")).slice(0,3);
      return {id:story.id,text:story.text,questions:[
        ["这篇短文主要说什么？",story.summary,wrong("summary"),"Hiểu ý chính","Đáp án tóm đúng người, việc và kết quả."],
        ["短文里的主要人物是谁？",story.who,wrong("who"),"Tìm nhân vật","Đáp án bám đúng nhân vật trung tâm trong đoạn."],
        ["他/她在哪里？",story.place,wrong("place"),"Tìm nơi chốn","Không đổi địa điểm của đoạn khác vào đoạn này."],
        ["后来怎么样？",story.result,wrong("result"),"Theo dõi kết quả","Chọn kết quả có bằng chứng trực tiếp trong đoạn."]
      ]};
    });
    const writing={
      orders:profile.orders.slice(0,5).map(tokens=>["Sắp xếp các từ thành câu hoàn chỉnh.",tokens,tokens,"Sắp xếp từ theo ý", "Chỉ khi các cụm đứng đúng vị trí, câu mới tự nhiên."]),
      tasks:[
        [`Dựa vào tình huống sau, viết một câu tiếng Trung. ${profile.phrases[0].vi}`,profile.phrases[0].zh,profile.phrases[0].target,profile.phrases[0].explain],
        [`Dựa vào tình huống sau, viết một câu tiếng Trung. ${profile.phrases[1].vi}`,profile.phrases[1].zh,profile.phrases[1].target,profile.phrases[1].explain],
        [`Dựa vào tình huống sau, viết một câu tiếng Trung. ${profile.phrases[2].vi}`,profile.phrases[2].zh,profile.phrases[2].target,profile.phrases[2].explain],
        [`Viết 2 câu kể lại tình huống. ${profile.stories[0].summary}`,profile.phrases[3].zh+" "+profile.phrases[4].zh,"Kể lại theo tình huống","Có người, sự việc chính và kết quả; được phép dùng cách diễn đạt khác."],
        [`Viết một tin nhắn 2 câu phù hợp với tình huống. ${profile.stories[1].summary}`,profile.phrases[5].zh+" "+profile.phrases[6].zh,"Viết có mục đích giao tiếp","Tin nhắn phải có ý chính và phản hồi phù hợp."],
        [`Viết một đoạn 3 câu theo chủ đề bài học. ${profile.stories[2].summary}`,profile.phrases[7].zh+" "+profile.phrases[8].zh,"Viết đoạn ngắn","Có trình tự, ít nhất hai thông tin cụ thể và cách nối ý rõ.","准确 40%: đúng ý và câu.\n连贯 25%: ba câu có trình tự.\n得体 20%: phù hợp tình huống.\n自然 15%: không dịch từng chữ."]
      ],
      retell:{prompt:"Đọc đoạn trong 60 giây. Khi hết giờ, kể lại bằng tiếng Trung bằng 2–3 câu.",sourceText:profile.stories[2].text,model:profile.stories[2].retell,explain:"Kể lại bằng lời của em: người nào, việc gì, kết quả ra sao.",rubric:"准确 40%: đủ thông tin chính.\n连贯 25%: theo trật tự đoạn.\n得体 20%: 2–3 câu phù hợp.\n自然 15%: dùng câu tự nhiên."}
    };
    const translation=profile.phrases.slice(0,8).flatMap((row,i)=> i%2===0 ? [[`Dịch sang tiếng Trung ‘${row.vi}’`,row.zh,row.explain,null]] : [[`Dịch sang tiếng Việt ‘${row.zh}’`,row.vi,row.explain,null]]);
    const speaking=profile.phrases.slice(0,8).map((row,i)=>[
      i<4 ? `Đọc to ‘${row.zh}’ hai lần, sau đó đổi một chi tiết phù hợp với bản thân.` : `Đóng vai theo tình huống và nói 1–2 câu. ${row.vi}`,
      row.zh,row.target,row.explain
    ]);
    makeLesson({no:profile.no,lessonId:profile.lessonId,vocabulary:vocab,grammar,listening,passages,writing,translation,speaking});
  }

  const lessons = {
    hsk2_bai8_rangwo:{
      no:8,lessonId:"hsk2_bai8_rangwo",
      vocabulary:[
        ["Chọn từ phù hợp trong câu 明天我___告诉你。","再",[d("在","N20"),d("从","N11"),d("对","N11")],"Dùng 再 để nói việc sẽ làm sau.","Việc trả lời diễn ra vào ngày mai nên 再 đứng trước động từ 告诉。"],
        ["Mẹ bảo Tiểu Vương về sớm. Chọn câu phù hợp.","妈妈让我早点儿回家。",[d("妈妈告诉早点儿回家。","N05"),d("妈妈让我早回家点儿。","N05"),d("妈妈等我早点儿回家。","N20")],"Dùng 让 để nhờ/bảo ai làm việc.","Người được bảo là 我; sau 让 là người rồi đến việc cần làm."],
        ["Chọn từ phù hợp trong câu 有一件事，我想___你。","告诉",[d("等","N20"),d("让","N20"),d("找","N15")],"Dùng 告诉 để nói thông tin cho ai.","Có thông tin cần nói cho người nghe nên dùng 告诉。"],
        ["Bạn cần người khác chờ năm phút. Chọn câu phù hợp.","请等我五分钟。",[d("请再我五分钟。","N05"),d("请告诉我五分钟。","N20"),d("请找我五分钟。","N20")],"Dùng 等 để yêu cầu chờ.","等 + người + khoảng thời gian diễn tả ‘chờ ai bao lâu’."],
        ["Chọn cụm phù hợp trong câu 我找不到小王，你能帮我___他吗？","找",[d("等","N15"),d("告诉","N20"),d("服务员","N03")],"Dùng 找 khi cần đi tìm người.","找不到 表示 chưa tìm thấy; sau đó nhờ người khác 找。"],
        ["Chọn từ phù hợp trong câu 这件___我还没想好。","事情",[d("服务员","N03"),d("白","N03"),d("贵","N03")],"Nhận diện danh từ chỉ sự việc.","这里说的是一件还没决定的事，所以用 事情。"],
        ["Ở nhà hàng, muốn gọi người mang thực đơn. Chọn từ phù hợp.","服务员",[d("同学","N15"),d("朋友","N15"),d("老师","N15")],"Nhận diện người phục vụ theo ngữ cảnh.","Nhà hàng có 服务员, không phải bạn học hay giáo viên."],
        ["Chọn từ phù hợp trong câu 这件衣服是___色的。","白",[d("黑","N15"),d("贵","N03"),d("事情","N03")],"Nhận diện từ chỉ màu sắc.","白色 là màu trắng; 贵 không phải màu sắc."],
        ["Chọn câu phù hợp với ý ‘Cô ấy thích quần áo màu đen’. ","她喜欢黑色的衣服。",[d("她喜欢衣服的黑色。","N05"),d("她黑色喜欢的衣服。","N05"),d("她喜欢贵色的衣服。","N15")],"Kết hợp màu sắc với danh từ.","Màu đứng trước 的衣服 để bổ nghĩa cho quần áo."],
        ["Chọn từ phù hợp trong câu 这件衣服太___了，我不买。","贵",[d("白","N03"),d("黑","N03"),d("服务员","N03")],"Dùng 贵 để nói giá cao.","Không mua vì giá cao nên dùng 贵。"],
        ["Chọn câu tiếng Trung diễn đạt ý ‘Bắt đầu làm từ câu thứ nhất’. ","从第一题开始做。",[d("从明天开始做。","N20"),d("第一题做错了。","N20"),d("我做完第一题了。","N20")],"Diễn đạt điểm bắt đầu của công việc.","Câu đúng giữ được cả ‘từ’ và ‘câu thứ nhất’."],
        ["Nghe bạn nói ‘让我想想’. Bạn ấy muốn làm gì?","先想一想，再回答。",[d("马上离开。","N20"),d("请服务员过来。","N20"),d("把衣服买下来。","N20")],"Hiểu cụm lời nói trong hội thoại.","让我想想 cho biết người nói cần thời gian suy nghĩ trước khi trả lời."]
      ],
      grammar:[
        {prompt:"Bạn muốn rủ bạn đi xem phim ngày mai. Chọn câu phù hợp.",correct:"我们明天一起去看电影，好吗？",wrongs:[d("我们明天一起去看电影好。","N19"),d("好吗我们明天一起去看电影？","N05"),d("我们昨天一起去看电影，好吗？","N20")],target:"Mời và hỏi ý kiến",explain:"Câu đúng có hoạt động, thời gian và lời hỏi ý kiến nhẹ nhàng."},
        {kind:"reorder",prompt:"Sắp xếp các từ thành câu hoàn chỉnh.",tokens:["明天","我们","再","去","吧"],answer:["我们","明天","再","去","吧"],target:"Thứ tự thời gian và 再",explain:"Chủ ngữ đứng trước, thời gian rồi đến 再 + động từ."},
        {prompt:"Bạn chưa thể quyết định hôm nay. Chọn câu nên nói.",correct:"我明天再告诉你。",wrongs:[d("我明天告诉再你。","N05"),d("我再明天你告诉。","N05"),d("我昨天再告诉你。","N20")],target:"Nói việc sẽ làm sau",explain:"再 đặt ngay trước hành động sẽ làm lại hoặc làm sau."},
        {prompt:"Bạn nhờ Minh xem chiếc áo trước rồi hãy trả lời. Chọn câu phù hợp.",correct:"你先看看这件衣服，再告诉我。",wrongs:[d("你先看这件衣服告诉我再。","N05"),d("你再看看这件衣服先告诉我。","N05"),d("你先看过这件衣服。","N20")],target:"Trình tự hai hành động",explain:"先…再… làm rõ việc nào diễn ra trước và việc nào sau."},
        {kind:"reorder",prompt:"Sắp xếp các từ thành câu hoàn chỉnh.",tokens:["让我","想想","再","告诉","你"],answer:["让我","想想","再","告诉","你"],target:"Lời đáp hoãn trả lời",explain:"Câu diễn tả rõ: suy nghĩ trước, rồi mới nói cho người nghe."},
        {prompt:"Bạn muốn nói ‘Cứ xem thử quyển sách này đi’. Chọn câu tự nhiên.",correct:"你看看这本书吧。",wrongs:[d("你看着这本书吧。","N06"),d("你看过这本书吧。","N06"),d("你这本书看看吧。","N05")],target:"Lời đề nghị nhẹ nhàng",explain:"看看 làm nhẹ lời đề nghị; 看着 và 看过 mang ý khác."},
        {prompt:"Bạn chưa biết đường và muốn bạn đợi. Chọn câu phù hợp.",correct:"请等我一下，好吗？",wrongs:[d("请等一下我，好吗？","N05"),d("请让我一下等，好吗？","N05"),d("请告诉我一下，好吗？","N20")],target:"Xin người khác chờ",explain:"等 người được đặt ngay sau động từ 等。"},
        {kind:"reorder",prompt:"Sắp xếp các từ thành câu hoàn chỉnh.",tokens:["朋友","让我","找","服务员"],answer:["朋友","让我","找","服务员"],target:"Nhờ ai làm việc",explain:"Người nhờ đứng đầu câu; sau 让 là người thực hiện việc tìm."},
        {prompt:"Bạn muốn nói ‘Hãy nghĩ thêm một chút rồi trả lời’. Chọn câu phù hợp.",correct:"你再想想，然后告诉我。",wrongs:[d("你想想再，然后告诉我。","N05"),d("你再想告诉我。","N05"),d("你想过，然后告诉我。","N06")],target:"Tổ chức lời khuyên theo thứ tự",explain:"再想想 là hành động cần diễn ra trước việc告诉。"},
        {kind:"multi",prompt:"Chọn từ phù hợp cho từng chỗ trống.",parts:["我还没","___","好这件","___","。让我","___","，明天再","___","你。"],options:["想","事情","告诉","买","白","服务员"],answers:["想","事情","想","告诉"],target:"Kết hợp từ trong một đoạn ngắn",explain:"Dựa vào toàn bộ tình huống: chưa nghĩ xong một việc, cần nghĩ thêm rồi mới nói."}
      ],
      listening:[
        {audioText:"A：今天晚上一起吃饭，好吗？B：让我想想，明天再告诉你。",prompt:"听对话，B什么时候回答？",correct:"明天。",wrongs:[d("今天晚上。","N19"),d("昨天。","N20"),d("下个月。","N20")],target:"Mốc thời gian" ,explain:"B nói 明天再告诉你。"},
        {audioText:"这件白色的衣服太贵了，我们看看那件黑色的吧。",prompt:"听句子，他们不买白色的衣服，为什么？",correct:"太贵了。",wrongs:[d("太小了。","N20"),d("太黑了。","N20"),d("找不到服务员。","N20")],target:"Lý do" ,explain:"Câu nghe nêu rõ 太贵了。"},
        {audioText:"服务员，请给我看看这个菜单。",prompt:"听句子，说话的人在哪里？",correct:"饭店。",wrongs:[d("学校。","N15"),d("医院。","N15"),d("火车站。","N15")],target:"Nơi chốn theo từ khóa" ,explain:"服务员 và 菜单 gợi bối cảnh nhà hàng."},
        {audioText:"小王，你等我五分钟，我去找一下老师。",prompt:"听句子，小王现在要做什么？",correct:"等五分钟。",wrongs:[d("找老师。","N19"),d("买衣服。","N20"),d("告诉服务员。","N20")],target:"Ai làm việc gì" ,explain:"Người nói đi tìm老师; 小王 được yêu cầu等。"},
        {audioText:"我想再看看这本书，明天再决定买不买。",prompt:"听句子，他今天决定了吗？",correct:"还没有。",wrongs:[d("已经买了。","N20"),d("已经告诉老师。","N20"),d("已经回家了。","N20")],target:"Hoàn thành hay chưa" ,explain:"明天再决定 cho biết hôm nay chưa quyết định."},
        {audioText:"A：这是什么事情？B：现在不能告诉你。",prompt:"听对话，B现在能告诉A吗？",correct:"不能。",wrongs:[d("能。","N19"),d("已经说完了。","N20"),d("正在找服务员。","N20")],target:"Phủ định trực tiếp" ,explain:"现在不能告诉你 nói rõ chưa thể nói."},
        {audioText:"你先想想，我们下午再说这个问题。",prompt:"听句子，他们什么时候再谈这个问题？",correct:"下午。",wrongs:[d("上午。","N19"),d("明天。","N20"),d("晚上。","N20")],target:"Thời gian" ,explain:"Câu nghe có 下午再说。"},
        {audioText:"黑色的衣服不贵，白色的也很好看。",prompt:"听句子，哪一种衣服不贵？",correct:"黑色的。",wrongs:[d("白色的。","N19"),d("两种都很贵。","N20"),d("没有衣服。","N20")],target:"So khớp chi tiết" ,explain:"Không贵 gắn với 黑色的衣服。"}
      ],
      passages:[
        {id:"b8-r1",text:"星期六，小王想买一件衣服。他先看了白色的，可是觉得太贵。服务员又给他拿了一件黑色的。小王说：‘让我想想，明天再来告诉你。’",questions:[
          ["小王先看了什么颜色的衣服？","白色的。",[d("黑色的。","N19"),d("红色的。","N20"),d("没有看衣服。","N20")],"提取颜色信息","第一句说他先看了白色的。"],
          ["小王为什么今天不买？","他觉得太贵。",[d("没有服务员。","N20"),d("衣服太小。","N20"),d("他找不到朋友。","N20")],"提取原因","太贵是文中明确的原因。"],
          ["小王明天会做什么？","告诉服务员他的想法。",[d("马上买白色的。","N20"),d("去学校上课。","N15"),d("请朋友等一天。","N20")],"理解后续计划","他说明天再来告诉服务员。"],
          ["‘让我想想’最接近哪一种意思？","我现在还没决定。",[d("我已经买好了。","N20"),d("我不想看衣服。","N20"),d("我在找老师。","N15")],"理解会话功能","这句话表示需要时间考虑。"]]},
        {id:"b8-r2",text:"小李今天晚上要请朋友吃饭，可是他不知道朋友有没有时间。他先发信息：‘我们晚上一起吃饭，好吗？’朋友说：‘我现在有事，明天再去吧。’",questions:[
          ["小李想和朋友做什么？","一起吃饭。",[d("一起买衣服。","N15"),d("一起上课。","N15"),d("一起找服务员。","N15")],"理解活动","小李发出的邀请是一起吃饭。"],
          ["朋友今天晚上怎么样？","现在有事。",[d("没有钱。","N20"),d("在饭店工作。","N20"),d("正在买书。","N20")],"理解原因","朋友直接说现在有事。"],
          ["他们什么时候去吃饭？","明天。",[d("今天上午。","N19"),d("今天晚上。","N19"),d("下周。","N20")],"理解时间","朋友说 明天再去吧。"],
          ["小李的信息主要是在做什么？","邀请并问对方意见。",[d("告诉价格。","N20"),d("请朋友找人。","N20"),d("说自己迷路。","N20")],"理解交际目的","好吗 让邀请变成礼貌地征求同意。"]]},
        {id:"b8-r3",text:"老师让我们找一张中国地图。小王找了很久还没找到。小李说：‘你先看看桌子上，好吗？我再去问老师。’后来，他们在书包里找到了地图。",questions:[
          ["老师让学生找什么？","一张中国地图。",[d("一本汉语书。","N15"),d("一件黑衣服。","N15"),d("一个服务员。","N15")],"提取对象","老师让大家找的是地图。"],
          ["小李让小王先看哪里？","桌子上。",[d("书包里。","N19"),d("饭店里。","N20"),d("老师家。","N20")],"提取地点","小李说先看看桌子上。"],
          ["最后地图在哪里？","书包里。",[d("桌子上。","N19"),d("学校门口。","N20"),d("饭店。","N20")],"追踪结果","后来他们在书包里找到了地图。"],
          ["小李接下来要做什么？","去问老师。",[d("等小王。","N20"),d("买地图。","N20"),d("回家吃饭。","N20")],"理解下一步行动","我再去问老师 给出小李的计划。"]]}
      ],
      writing:{
        orders:[
          ["Sắp xếp các từ thành câu hoàn chỉnh.",["我","明天","再","告诉","你"],["我","明天","再","告诉","你"],"Thứ tự của 再","再 đặt trước 告诉。"],
          ["Sắp xếp các từ thành câu hoàn chỉnh.",["请","等","我","一下"],["请","等","我","一下"],"Lời nhờ ngắn","等 đứng trước người được yêu cầu chờ."],
          ["Sắp xếp các từ thành câu hoàn chỉnh.",["这件","白色的","衣服","太","贵","了"],["这件","白色的","衣服","太","贵","了"],"Cụm danh từ có màu sắc","Màu sắc bổ nghĩa cho 衣服。"],
          ["Sắp xếp các từ thành câu hoàn chỉnh.",["让","我","想想","吧"],["让","我","想想","吧"],"Lời nói cần thời gian","让我想想吧 là lời đáp tự nhiên."],
          ["Sắp xếp các từ thành câu hoàn chỉnh.",["我们","一起","去","吃饭","好吗"],["我们","一起","去","吃饭","好吗"],"Mời và hỏi ý kiến","Câu có hoạt động chung rồi mới đến 好吗。"]
        ],
        tasks:[
          ["Bạn chưa quyết định có mua chiếc áo đắt. Viết một tin nhắn 1 câu cho nhân viên bán hàng.","这件衣服有点儿贵，让我想想，明天再告诉你。","Nói hoãn quyết định", "Câu cần có lý do ngắn và kế hoạch trả lời sau.","准确 40%: có 贵、想想 hoặc 再告诉。\n连贯 25%: lý do trước, kế hoạch sau.\n得体 20%: lịch sự với nhân viên.\n自然 15%: trật tự câu tự nhiên."],
          ["Viết một câu mời bạn đi ăn tối và hỏi ý kiến của bạn ấy.","我们今天晚上一起吃饭，好吗？","Mời bạn trong tình huống quen thuộc","Có thời gian, hoạt động và lời hỏi ý kiến.",null],
          ["Dùng 2 câu tiếng Trung kể bạn đã xem quần áo màu gì và chưa quyết định điều gì.","我看了一件白色的衣服。可是有点儿贵，我还没决定。","Kể lại lựa chọn đơn giản","Có ít nhất hai ý liên quan đến màu sắc và quyết định.",null],
          ["Viết một câu nhờ bạn đợi bạn năm phút.","请等我五分钟。","Lời nhờ trực tiếp","Nêu rõ người nghe cần chờ và khoảng thời gian.",null],
          ["Viết một câu cho biết bạn sẽ làm lại việc gì vào ngày mai.","我明天再看这本书。","Diễn đạt hành động sẽ làm sau","再 đứng trước động từ; em có thể đổi hoạt động.",null],
          ["Viết một tin nhắn 2–3 câu hỏi một người bạn có rảnh đi ăn không. Nếu bạn ấy bận, hãy đề nghị ngày khác.","你明天晚上有时间吗？我们一起吃饭，好吗？如果你有事，我们明天再说。","Tin nhắn theo tình huống","Đánh giá ý mời, hỏi ý kiến và cách phản hồi mềm mại.","准确 40%: đủ lời hỏi và lời đề nghị.\n连贯 25%: trình tự rõ.\n得体 20%: lịch sự với bạn.\n自然 15%: không dịch từng chữ từ tiếng Việt."]
        ],
        retell:{prompt:"Đọc đoạn trong 60 giây. Khi hết giờ, kể lại bằng tiếng Trung bằng 2–3 câu.",sourceText:"小王想买一件衣服。他觉得白色的太贵，所以想再看看黑色的。他说让自己想想，明天再告诉服务员。",model:"小王想买衣服，可是白色的太贵。他想再看看黑色的，明天再告诉服务员。",explain:"Kể đủ người, lý do và việc sẽ làm sau; không cần chép nguyên văn.",rubric:"准确 40%: có người, màu/giá và kế hoạch.\n连贯 25%: các ý theo thứ tự.\n得体 20%: câu phù hợp người học HSK 2.\n自然 15%: dùng 再 tự nhiên."}
      },
      translation:[
        ["Dịch sang tiếng Trung ‘Để tôi suy nghĩ rồi ngày mai nói cho bạn biết.’","让我想想，明天再告诉你。","Cần thể hiện rõ suy nghĩ trước rồi trả lời sau.",null],
        ["Dịch sang tiếng Việt ‘这件白色的衣服太贵了。’","Chiếc áo màu trắng này đắt quá.","Dịch đúng màu sắc và mức giá.",null],
        ["Dịch sang tiếng Trung ‘Bạn đợi mình năm phút nhé.’","请等我五分钟，好吗？","Cần có động từ 等 và khoảng thời gian.",null],
        ["Dịch sang tiếng Việt ‘我们明天再去饭店吧。’","Ngày mai chúng ta lại/hãy đi nhà hàng nhé.","再 ở đây là làm vào một thời điểm sau.",null],
        ["Dịch sang tiếng Trung ‘Nhân viên phục vụ đang tìm tôi.’","服务员在找我。","Chủ thể là 服务员, người được tìm là 我.",null],
        ["Dịch sang tiếng Việt ‘你先看看这个问题。’","Bạn hãy xem/thử xem vấn đề này trước.","看看 làm câu nhẹ hơn mệnh lệnh trực tiếp.",null],
        ["Dịch sang tiếng Trung ‘Việc này tôi vẫn chưa nghĩ xong.’","这件事情我还没想好。","还没 + động từ/kết quả nói chưa hoàn thành.",null],
        ["Dịch sang tiếng Việt ‘我明天再告诉老师。’","Ngày mai tôi sẽ nói cho thầy/cô biết.","Nhớ giữ ý ‘ngày mai mới làm’. ",null]
      ],
      speaking:[
        ["Đọc to ‘让我想想，明天再告诉你。’ hai lần. Sau đó tự nghe lại và viết 1 nhận xét ngắn.","Em đọc rõ 让我想想 và ngắt nhẹ trước 明天。","Đọc câu có nhịp tự nhiên","Chú ý không đọc dính các cụm từ."],
        ["Đóng vai nhân viên bán hàng. Hỏi một câu xem khách có muốn xem áo màu đen không.","你想看看黑色的衣服吗？","Hỏi theo vai","Câu hỏi cần rõ đối tượng và màu sắc."],
        ["Đóng vai khách. Từ chối mua vì giá cao bằng 1 câu lịch sự.","有点儿贵，让我想想吧。","Nói từ chối mềm mại","Không cần dùng đúng từng chữ mẫu."],
        ["Nói 2 câu mời một bạn đi ăn vào ngày mai.","我们明天一起吃饭，好吗？你有时间吗？","Mời và hỏi ý kiến","Có hoạt động và thời gian."],
        ["Nói một câu nhờ bạn chờ bạn một lát.","请等我一下。","Lời nhờ ngắn","Dùng 请 để câu nhẹ nhàng hơn."],
        ["Nói 2 câu kể bạn muốn mua gì nhưng chưa quyết định.","我想买一件衣服，可是我还没决定。","Kể tình huống quen thuộc","Nêu cả đồ muốn mua và trạng thái chưa quyết định."],
        ["Đọc cặp câu ‘先看看，再告诉我。’ và tự đánh dấu chỗ ngắt.","先看看 / 再告诉我。","Ngắt theo hai hành động","Ngắt sau hành động thứ nhất."],
        ["Gọi một người phục vụ trong tình huống nhà hàng bằng 1 câu.","服务员，请过来一下。","Lời gọi theo bối cảnh","Dùng 服务员 để chỉ đúng người trong nhà hàng."]
      ]
    },
    hsk2_bai9_tidu:{
      no:9,lessonId:"hsk2_bai9_tidu",
      vocabulary:[
        ["Chọn từ phù hợp trong câu 这道题我做___了。","错",[d("完","N09"),d("懂","N09"),d("从","N11")],"Kết quả làm sai", "做错 表 thị làm và có kết quả là sai."],
        ["Chọn câu phù hợp với ý ‘Tôi đi từ nhà đến trường’. ","我从家到学校。",[d("我从学校到家。","N20"),d("我家从到学校。","N05"),d("我到从家学校。","N05")],"Nói điểm bắt đầu", "从 đặt trước điểm bắt đầu.",2],
        ["Chọn từ phù hợp trong câu 小王喜欢___，每个星期都去跳。","跳舞",[d("上班","N15"),d("欢迎","N15"),d("问题","N03")],"Hoạt động sở thích", "Những gì diễn ra mỗi tuần là hoạt động nhảy múa."],
        ["Chọn câu phù hợp với ý ‘Hãy làm câu thứ hai’. ","做第二题吧。",[d("第二题做错了。","N20"),d("从第二天做。","N15"),d("做完第二个人。","N10")],"Số thứ tự", "第二题 chỉ câu thứ hai."],
        ["Chọn từ phù hợp trong câu 我___明天能做完作业。","希望",[d("欢迎","N15"),d("可能","N15"),d("问题","N03")],"Nói mong muốn", "希望 dùng trước nội dung mình mong muốn."],
        ["Chọn từ phù hợp trong câu 这个___我不懂，老师能帮我吗？","问题",[d("欢迎","N03"),d("第一","N03"),d("跳舞","N03")],"Danh từ chỉ vấn đề", "不懂 的对象 là 问题."],
        ["Khi có bạn mới vào lớp, em nên nói gì?","欢迎你！",[d("希望你！","N02"),d("做完你！","N22"),d("从你！","N11")],"Chào đón", "欢迎 + người là lời chào đón tự nhiên."],
        ["Chọn từ phù hợp trong câu 我爸爸每天八点___。","上班",[d("跳舞","N15"),d("欢迎","N22"),d("做错","N20")],"Hoạt động đi làm", "八点上班 nói giờ bắt đầu làm việc."],
        ["Chọn từ phù hợp trong câu 老师说得很清楚，我都___了。","懂",[d("错","N20"),d("完","N09"),d("从","N11")],"Hiểu lời nói", "听懂 mới phù hợp với việc nghe giáo viên nói."],
        ["Chọn từ phù hợp trong câu 作业很多，我还没做___。","完",[d("错","N09"),d("懂","N09"),d("从","N11")],"Kết quả hoàn thành", "还没做完 nghĩa là chưa làm xong."],
        ["Chọn câu tiếng Trung diễn đạt ý ‘Bắt đầu làm từ câu thứ nhất’. ","从第一题开始做。",[d("从明天开始做。","N20"),d("第一题做错了。","N20"),d("我做完第一题了。","N20")],"Nói thứ tự bắt đầu", "Câu đúng giữ được cả điểm bắt đầu và câu thứ nhất."],
        ["Chọn cụm phù hợp trong câu 这本书我已经看___了。","完",[d("错","N09"),d("懂","N09"),d("从","N11")],"Kết quả hoàn thành", "看完 表示 đọc/xem hết quyển sách."]
      ],
      grammar:[
        {prompt:"小王的作业还没___，所以他不能去玩。",correct:"做完",wrongs:[d("完做","N05"),d("做了完","N06"),d("做到","N09")],target:"Diễn đạt chưa làm xong",explain:"还没 cần cụm diễn tả hành động chưa hoàn thành là 做完。"},
        {kind:"reorder",prompt:"Sắp xếp các từ thành câu hoàn chỉnh.",tokens:["我","看完","这本书","了"],answer:["我","看完","这本书","了"],target:"Câu có kết quả hoàn thành",explain:"Động từ 看 và kết quả 完 đi cùng nhau trước tân ngữ."},
        {prompt:"Lan bắt đầu học tiếng Trung từ tháng 9. Chọn câu Lan nên nói.",correct:"我从九月开始学汉语。",wrongs:[d("我九月从开始学汉语。","N05","Đảo 从 và mốc thời gian theo trật tự tiếng Việt."),d("我开始从九月学汉语。","N05","Đặt 开始 sai vị trí trong cụm thời gian."),d("我从九月学汉语开始。","N18","Ghép từng cụm Việt–Trung nhưng sai trật tự câu.")],target:"Nói mốc bắt đầu",explain:"从 + thời gian đứng trước 开始 + động từ. Ba nhiễu lần lượt kiểm tra đảo trật tự, đặt sai 开始 và dịch từng chữ.",level:2},
        {prompt:"Bạn muốn nói ‘Đây là lần đầu tôi đến Trung Quốc’. Chọn câu phù hợp.",correct:"这是我第一次来中国。",wrongs:[d("这是我第一来中国次。","N05"),d("这是我来第一中国次。","N05"),d("这是我一次来中国。","N19")],target:"Số thứ tự với 次",explain:"第一 lần này bổ nghĩa cho 次, sau đó mới đến động từ 来。"},
        {kind:"reorder",prompt:"Sắp xếp các từ thành câu hoàn chỉnh.",tokens:["他","从","第一题","开始","做"],answer:["他","从","第一题","开始","做"],target:"Điểm bắt đầu của hành động",explain:"从第一题 là cụm chỉ điểm bắt đầu; đặt trước động từ làm."},
        {prompt:"Nghe giáo viên giảng xong và hiểu. Chọn câu phù hợp.",correct:"老师说得很清楚，我听懂了。",wrongs:[d("老师说得很清楚，我听完了。","N09"),d("老师说很清楚得，我听懂了。","N04"),d("老师很清楚说，我懂听了。","N05")],target:"Kết quả hiểu",explain:"听懂 nói nghe và hiểu; 听完 chỉ nghe hết mà chưa chắc hiểu."},
        {prompt:"Bạn làm sai hai câu. Chọn câu tự nhiên.",correct:"我做错了两道题。",wrongs:[d("我两道题做错了。","N05"),d("我做两道错题了。","N18"),d("我错做了两道题。","N05")],target:"Kết quả làm sai",explain:"做错 đi thành cụm; số lượng và lượng từ đứng sau tân ngữ."},
        {kind:"reorder",prompt:"Sắp xếp các từ thành câu hoàn chỉnh.",tokens:["我","希望","明天","做完","作业"],answer:["我","希望","明天","做完","作业"],target:"Nói mong muốn",explain:"希望 dẫn nội dung mong muốn; 明天 + 做完作业 là phần sau."},
        {prompt:"Bạn muốn nói ‘Tôi từ Hà Nội đến’. Chọn câu phù hợp.",correct:"我从河内来。",wrongs:[d("我河内从来。","N05"),d("我来从河内。","N05"),d("我从来河内。","N18")],target:"Nói nơi xuất phát",explain:"从 đứng trước nơi bắt đầu, rồi đến động từ 来。"},
        {kind:"multi",prompt:"Chọn từ phù hợp cho từng chỗ trống.",parts:["小李","___","第一题开始做。题太多，他还没做","___","。下午他终于做","___","了，可是有两道题做","___","了。"],options:["从","完","错","懂","欢迎","跳舞"],answers:["从","完","完","错"],target:"Theo dõi kết quả trong đoạn",explain:"Đoạn có bốn thông tin: bắt đầu, chưa xong, đã xong và làm sai."}
      ],
      listening:[
        {audioText:"题太多了，我今天还没做完。",prompt:"听句子，为什么他今天没做完？",correct:"题太多了。",wrongs:[d("他没有作业。","N20"),d("他已经做完了。","N19"),d("他去跳舞了。","N20")],target:"Lý do",explain:"Câu mở đầu nêu rõ 题太多了。"},
        {audioText:"我从第一题开始做，最后做错了两道题。",prompt:"听句子，他做错了几道题？",correct:"两道。",wrongs:[d("一道。","N19"),d("第一道。","N19"),d("没有。","N20")],target:"Số lượng",explain:"Có cụm 两道题。"},
        {audioText:"A：你什么时候开始上班？B：我从下个月开始上班。",prompt:"听对话，B什么时候上班？",correct:"下个月。",wrongs:[d("上个月。","N19"),d("今天。","N20"),d("晚上。","N20")],target:"Mốc thời gian",explain:"B trả lời 从下个月开始。"},
        {audioText:"老师说得很清楚，我都听懂了。",prompt:"听句子，说话的人怎么样？",correct:"听懂了。",wrongs:[d("做完了。","N09"),d("写错了。","N20"),d("没听见。","N19")],target:"Kết quả nghe",explain:"听懂 是 nghe và hiểu."},
        {audioText:"今天是我来中国的第一天，大家都欢迎我。",prompt:"听句子，今天是第几天？",correct:"第一天。",wrongs:[d("第二天。","N19"),d("第十天。","N19"),d("明天。","N03")],target:"Số thứ tự",explain:"第一天 nêu rõ thứ tự ngày."},
        {audioText:"我希望明天能做完作业。",prompt:"听句子，说话的人希望什么？",correct:"明天完成作业。",wrongs:[d("明天不上课。","N20"),d("昨天做错了。","N20"),d("今天去跳舞。","N20")],target:"Mong muốn",explain:"希望后的内容是明天做完作业。"},
        {audioText:"这道题我没听懂，你能再说一遍吗？",prompt:"听句子，他想让别人做什么？",correct:"再说一遍。",wrongs:[d("再做一遍。","N09"),d("再写一遍。","N15"),d("再跳一次舞。","N15")],target:"Yêu cầu nhắc lại",explain:"没听懂 nên yêu cầu đối phương再说一遍。"},
        {audioText:"A：你做完了吗？B：还没有，我从第二题开始再做一遍。",prompt:"听对话，B现在要做什么？",correct:"从第二题再做一遍。",wrongs:[d("已经全部做完。","N19"),d("去上班。","N20"),d("欢迎新同学。","N20")],target:"Hành động tiếp theo",explain:"B nói rõ还没有 và kế hoạch从第二题再做一遍。"}
      ],
      passages:[
        {id:"b9-r1",text:"今天老师给我们很多题。小李从第一题开始做，可是题太多，他做了很长时间还没做完。下午，同学帮助他一起看题。最后，他做完了所有的题，可是发现有两道题做错了。",questions:[
          ["小李从哪一题开始做？","第一题。",[d("最后一题。","N19"),d("第二题。","N19"),d("没有开始。","N20")],"定位起点","文中直接说 从第一题开始。"],
          ["小李开始时为什么没做完？","题太多。",[d("他生病了。","N20"),d("他去上班了。","N20"),d("老师没有题。","N20")],"理解原因","题太多导致做很久仍未完成。"],
          ["下午谁帮助小李？","同学。",[d("服务员。","N15"),d("爸爸。","N20"),d("医生。","N15")],"定位人物","下午同学帮助他一起看题。"],
          ["最后小李发现什么？","有两道题做错了。",[d("所有题都没做。","N20"),d("第一题丢了。","N20"),d("没有作业。","N20")],"理解结果","最后他发现两道题错误。"]]},
        {id:"b9-r2",text:"小王下个月开始上班。今天是他来公司的第一天，他有很多问题不懂。经理说得很清楚，小王都听懂了。大家还说：‘欢迎你！’",questions:[
          ["小王什么时候开始上班？","下个月。",[d("上个月。","N19"),d("去年。","N20"),d("每天晚上。","N20")],"读取时间","开头说下个月开始上班。"],
          ["今天是小王来公司的第几天？","第一天。",[d("第二天。","N19"),d("最后一天。","N20"),d("第十天。","N19")],"理解数量顺序","文中说第一天。"],
          ["经理说话以后，小王怎么样？","都听懂了。",[d("做错了。","N20"),d("没上班。","N20"),d("去跳舞了。","N20")],"理解结果","经理说得清楚，小王都听懂了。"],
          ["大家对小王说什么？","欢迎你。",[d("再见。","N20"),d("别做了。","N20"),d("题太多。","N20")],"理解交际目的","欢迎你 用来欢迎新来的人。"]]},
        {id:"b9-r3",text:"明天有汉语考试。小美希望今天做完练习。她从第一题开始做，做错了一道题。她不懂这个问题，所以请老师再说一遍。后来，她终于听懂了。",questions:[
          ["小美希望今天做什么？","做完练习。",[d("开始上班。","N15"),d("去跳舞。","N15"),d("买衣服。","N15")],"理解希望","希望后的内容是做完练习。"],
          ["小美做错了几道题？","一道。",[d("两道。","N19"),d("没有。","N19"),d("第一天。","N03")],"读取数量","文中明确是一道题。"],
          ["小美为什么请老师再说一遍？","她不懂这个问题。",[d("老师不在。","N20"),d("题已经做完。","N20"),d("她要上班。","N20")],"理解因果","不懂问题所以请求再说一遍。"],
          ["后来小美怎么样？","终于听懂了。",[d("还是不懂。","N19"),d("做错更多题。","N20"),d("离开中国。","N20")],"理解结果","后来 表示变化，最后她听懂了。"]]}
      ],
      writing:{
        orders:[
          ["Sắp xếp các từ thành câu hoàn chỉnh.",["我","从","九月","开始","学","汉语"],["我","从","九月","开始","学","汉语"],"Mốc bắt đầu","从 + 时间 đứng trước 开始 học."],
          ["Sắp xếp các từ thành câu hoàn chỉnh.",["这道题","我","做错","了"],["这道题","我","做错","了"],"Kết quả làm sai","做错 là một cụm liền nhau."],
          ["Sắp xếp các từ thành câu hoàn chỉnh.",["老师","说得","很","清楚"],["老师","说得","很","清楚"],"Miêu tả cách nói","得 nối động từ với mức độ/trạng thái."],
          ["Sắp xếp các từ thành câu hoàn chỉnh.",["今天","是","我","第一天","上班"],["今天","是","我","第一天","上班"],"Số thứ tự","第一天 đứng trước hoạt động上班."],
          ["Sắp xếp các từ thành câu hoàn chỉnh.",["我","希望","明天","做完","作业"],["我","希望","明天","做完","作业"],"Diễn đạt mong muốn","希望 dẫn phần mong muốn trong tương lai."]
        ],
        tasks:[
          ["Viết một câu nói bạn chưa làm xong bài tập vì bài quá nhiều.","题太多了，我还没做完作业。","Nêu lý do và trạng thái chưa hoàn thành","Câu cần có nguyên nhân và kết quả chưa xong.",null],
          ["Viết một câu cho biết bạn bắt đầu học tiếng Trung từ khi nào.","我从九月开始学汉语。","Nói mốc bắt đầu","Có 从 + thời gian + 开始 + động từ.",null],
          ["Viết một câu xin thầy/cô nhắc lại vì bạn chưa hiểu.","老师，我没听懂，请您再说一遍。","Yêu cầu hỗ trợ trong lớp","Cần nêu không hiểu và lời đề nghị phù hợp.",null],
          ["Viết 2 câu kể bạn làm bài từ đâu và cuối cùng có làm xong không.","我从第一题开始做。最后我做完了。","Tường thuật tiến trình","Có điểm bắt đầu và kết quả cuối cùng.",null],
          ["Viết một lời chào mừng ngắn cho một bạn mới vào lớp.","欢迎你来我们班！","Chào đón người mới","Dùng 欢迎 đúng đối tượng.",null],
          ["Viết 2–3 câu nhắn cho bạn về một việc bạn làm sai và cách bạn sẽ sửa.","我做错了两道题。我想再做一遍。你能帮助我吗？","Giải quyết một vấn đề học tập","Có lỗi, kế hoạch sửa và lời nhờ nếu cần.","准确 40%: nêu được lỗi và kế hoạch.\n连贯 25%: trình tự trước–sau rõ.\n得体 20%: lời nhờ lịch sự.\n自然 15%: dùng 做错、再做 tự nhiên."]
        ],
        retell:{prompt:"Đọc đoạn trong 60 giây. Khi hết giờ, kể lại bằng tiếng Trung bằng 2–3 câu.",sourceText:"小李今天有很多作业。他从第一题开始做，但是题太多，还没做完。同学帮助他以后，他终于做完了，可是做错了两道题。",model:"小李今天有很多作业。他开始做了很久，后来同学帮助他做完了。他发现自己做错了两道题。",explain:"Kể theo thứ tự bắt đầu, quá trình và kết quả; có thể dùng câu của em.",rubric:"准确 40%: có bài nhiều, sự giúp đỡ và kết quả.\n连贯 25%: theo trình tự thời gian.\n得体 20%: 2–3 câu vừa đủ.\n自然 15%: dùng 做完、做错 tự nhiên."}
      },
      translation:[
        ["Dịch sang tiếng Trung ‘Tôi bắt đầu làm từ câu thứ nhất.’","我从第一题开始做。","Phải giữ được điểm bắt đầu.",null],
        ["Dịch sang tiếng Việt ‘题太多，我还没做完。’","Bài quá nhiều, tôi vẫn chưa làm xong.","还没 làm rõ trạng thái chưa hoàn thành.",null],
        ["Dịch sang tiếng Trung ‘Thầy/cô nói rất rõ, tôi nghe hiểu rồi.’","老师说得很清楚，我听懂了。","Không dùng 听完 thay cho nghe hiểu.",null],
        ["Dịch sang tiếng Việt ‘我做错了两道题。’","Tôi làm sai hai câu.","两道 là số lượng câu hỏi.",null],
        ["Dịch sang tiếng Trung ‘Tôi hy vọng ngày mai làm xong bài tập.’","我希望明天做完作业。","希望 dẫn nội dung mong muốn.",null],
        ["Dịch sang tiếng Việt ‘今天是我上班的第一天。’","Hôm nay là ngày đầu tiên tôi đi làm.","第一天 là ngày thứ nhất.",null],
        ["Dịch sang tiếng Trung ‘Chào mừng bạn đến với lớp chúng tôi.’","欢迎你来我们班。","欢迎 + người + nơi chốn.",null],
        ["Dịch sang tiếng Việt ‘这个问题我不懂。’","Vấn đề này tôi không hiểu.","Giữ đúng đối tượng không hiểu là vấn đề.",null]
      ],
      speaking:[
        ["Đọc to ‘我从九月开始学汉语。’ hai lần và tự đánh dấu chỗ ngắt.","我从九月 / 开始学汉语。","Đọc cụm thời gian","Không tách 从 và 九月."],
        ["Đóng vai giáo viên. Hỏi học sinh đã làm xong bài chưa.","你做完作业了吗？","Hỏi kết quả","Dùng 做完 để hỏi đã hoàn tất hay chưa."],
        ["Đóng vai học sinh. Trả lời rằng bạn chưa làm xong vì bài nhiều.","题太多了，我还没做完。","Trả lời theo nguyên nhân","Có cả lý do và tình trạng."],
        ["Nói 2 câu chào đón một đồng nghiệp mới.","欢迎你！我是小王。","Chào đón trong bối cảnh quen thuộc","Có lời chào và giới thiệu ngắn."],
        ["Nói một câu nhờ bạn giảng lại vì bạn chưa nghe hiểu.","我没听懂，请你再说一遍。","Yêu cầu nhắc lại","Nêu rõ điều em cần hỗ trợ."],
        ["Nói 2 câu kể một câu bạn làm sai và bạn sẽ làm gì sau đó.","我做错了一道题。我再做一遍。","Tường thuật và sửa lỗi","Dùng kết quả làm sai rồi kế hoạch làm lại."],
        ["Đọc cặp từ ‘第一题 / 第一天’ và đặt mỗi cụm vào một câu ngắn.","我做第一题。今天是第一天。","Phân biệt thứ tự của sự vật và thời gian","Cả hai dùng 第 nhưng danh từ theo sau khác nhau."],
        ["Nói một câu về điều bạn hy vọng làm được ngày mai.","我希望明天做完作业。","Nói mong muốn","Dùng 希望 + nội dung mong muốn."]
      ]
    }
  };

  const p=(prompt,zh,vi,target="Dùng câu phù hợp tình huống",explain="Đáp án khớp cả ý, trật tự câu và hoàn cảnh giao tiếp.")=>({prompt,zh,vi,target,explain});
  const s=(id,text,summary,who,place,result,retell)=>({id,text,summary,who,place,result,retell});
  const scenarioLessons={
    hsk2_bai10_biezhao:{no:10,lessonId:"hsk2_bai10_biezhao",phrases:[
      p("Bạn thấy bạn đang tìm điện thoại nhưng điện thoại ở trên bàn. Chọn câu nên nói.","别找了，手机在桌子上呢。","Đừng tìm nữa, điện thoại ở trên bàn kia.","Nhắc người khác dừng hành động không cần thiết","别…了 phù hợp khi khuyên dừng một hành động đang tiếp diễn."),
      p("Bạn muốn nhắc em trai không xem tivi nữa mà làm bài. Chọn câu phù hợp.","不要看电视了，快做作业吧。","Đừng xem tivi nữa, mau làm bài đi."),
      p("Bạn muốn nói mẹ đối xử với bạn rất tốt. Chọn câu phù hợp.","妈妈对我很好。","Mẹ đối xử với tôi rất tốt.","Nói thái độ hướng tới ai","对 đứng trước người nhận thái độ."),
      p("Bạn nói giáo viên thân thiện với học sinh. Chọn câu phù hợp.","老师对学生很友好。","Giáo viên rất thân thiện với học sinh."),
      p("Bạn đang giặt quần áo. Chọn câu phù hợp.","我正在洗衣服。","Tôi đang giặt quần áo.","Nói hành động đang diễn ra","正在 đứng trước động từ."),
      p("Anh trai đang ăn dưa hấu. Chọn câu phù hợp.","哥哥正在吃西瓜。","Anh trai đang ăn dưa hấu."),
      p("Bạn thấy bạn học còn chơi điện thoại trong giờ. Chọn lời nhắc phù hợp.","别玩手机了，快上课吧。","Đừng chơi điện thoại nữa, mau vào học đi."),
      p("Bạn muốn nhờ một người giúp bạn. Chọn câu phù hợp.","请你帮助我一下。","Bạn hãy giúp tôi một chút."),
      p("Bạn vừa tìm thấy điện thoại trên bàn. Chọn câu phù hợp.","手机在桌子上呢。","Điện thoại ở trên bàn kia."),
      p("Bạn muốn nói anh trai mua hai quả trứng. Chọn câu phù hợp.","哥哥买了两个鸡蛋。","Anh trai đã mua hai quả trứng.")
    ],orders:[["别","找","了","手机","在","桌子上","呢"],["老师","对","学生","很","友好"],["我","正在","洗","衣服"],["不要","玩","手机","了"],["哥哥","正在","吃","西瓜"]],multi:{parts:["手机不在书包里，别","___","了，它在","___","上呢。哥哥正在","___","西瓜，妈妈对我们很","___","。"],options:["找","桌子","吃","好","洗","课"],answers:["找","桌子","吃","好"]},stories:[
      s("b10-r1","小王找不到手机，一直在房间里找。哥哥说：‘别找了，手机在桌子上呢。’小王一看，手机真的在桌子上。","小王找到了手机。","小王。","房间里。","手机在桌子上。","小王找手机，哥哥告诉他手机在桌子上，最后他找到了。"),
      s("b10-r2","今天没有课。哥哥正在洗衣服，妹妹正在吃西瓜。妈妈对他们说：‘别玩手机了，先帮助哥哥吧。’","一家人一起做家务。","妈妈。","家里。","妹妹去帮助哥哥。","哥哥洗衣服，妹妹吃西瓜，后来妈妈让妹妹帮助哥哥。"),
      s("b10-r3","老师对新同学很友好。上课的时候，新同学一直玩手机。老师说：‘不要玩手机了，快看书吧。’后来他认真看书了。","新同学后来认真看书。","新同学。","教室里。","他不再玩手机，开始看书。","新同学起初玩手机，老师提醒他，后来他认真看书。")
    ]},
    hsk2_bai11_bida:{no:11,lessonId:"hsk2_bai11_bida",phrases:[
      p("Hai người chênh ba tuổi. Chọn câu phù hợp.","他比我大三岁。","Anh ấy lớn hơn tôi ba tuổi.","So sánh người và chênh lệch","比 nối hai người; 三岁 nêu mức chênh."),
      p("Bạn muốn chỉ ‘cô gái đang hát ở bên phải’. Chọn câu phù hợp.","右边那个唱歌的女孩是我姐姐。","Cô gái đang hát ở bên phải là chị gái tôi.","Chỉ đúng người trong một nhóm","Cụm hành động đứng trước 的女孩 để nhận diện người."),
      p("Bạn muốn nói chiếc áo này rẻ hơn chiếc kia. Chọn câu phù hợp.","这件衣服比那件便宜。","Chiếc áo này rẻ hơn chiếc kia."),
      p("Bạn chưa chắc cô gái ấy là ai. Chọn câu phù hợp.","她可能是新同学。","Cô ấy có thể là học sinh mới.","Nói khả năng","可能 cho biết đây là phỏng đoán, không phải khẳng định."),
      p("Bạn muốn hỏi họ của một người. Chọn câu phù hợp.","你姓什么？","Bạn họ gì?"),
      p("Bạn muốn nói một cậu bé đang hát. Chọn câu phù hợp.","那个唱歌的男孩子是我朋友。","Cậu bé đang hát kia là bạn tôi."),
      p("Bạn muốn nói bên phải có một cô gái. Chọn câu phù hợp.","右边有一个女孩子。","Bên phải có một cô gái."),
      p("Bạn muốn nói đồ hôm nay rẻ hơn năm ngoái. Chọn câu phù hợp.","今年的东西比去年便宜。","Đồ năm nay rẻ hơn năm ngoái."),
      p("Bạn dự đoán bạn ấy ngày mai đến. Chọn câu phù hợp.","他可能明天来。","Anh ấy có thể ngày mai đến."),
      p("Bạn muốn chỉ cuốn sách bạn đã mua. Chọn câu phù hợp.","这是我买的书。","Đây là quyển sách tôi đã mua.")
    ],orders:[["他","比","我","大","三岁"],["右边","那个","唱歌的","女孩","是","我姐姐"],["这件衣服","比","那件","便宜"],["她","可能","是","新同学"],["这是","我","买的","书"]],multi:{parts:["小李比我大三岁。他右边坐着一个","___","，她","___","是新同学。今年的衣服比去年","___","。"],options:["女孩子","可能","便宜","唱歌","去年","姓"],answers:["女孩子","可能","便宜"]},stories:[
      s("b11-r1","小王二十岁，小李二十三岁。他们是同学。小李右边坐着一个女孩，那个女孩正在唱歌。小王觉得她可能是新同学。","小李比小王大三岁。","小李。","教室里。","小王觉得唱歌的女孩可能是新同学。","小王和小李是同学，小李大三岁，右边唱歌的女孩可能是新同学。"),
      s("b11-r2","去年这件衣服一百块，今年八十块。所以今年的衣服比去年便宜。妈妈想买一件给妹妹。","今年衣服比去年便宜。","妈妈。","商店里。","妈妈想给妹妹买衣服。","去年衣服一百块，今年八十块，妈妈想买给妹妹。"),
      s("b11-r3","学校来了一个新同学。她姓王，可能是从北京来的。那个说话很慢的人正在帮助她找教室。","有人在帮助新同学找教室。","新同学。","学校里。","说话很慢的人帮助她。","新同学姓王，有人帮助她找教室。")
    ]},
    hsk2_bai12_chuande:{no:12,lessonId:"hsk2_bai12_chuande",phrases:[
      p("Bạn thấy em trai mặc ít khi trời lạnh. Chọn câu phù hợp.","你穿得太少了。","Bạn mặc ít quá rồi.","Nhận xét cách thực hiện hành động","穿得 + mức độ nói cách/mức độ mặc."),
      p("Bạn muốn nói hôm nay lạnh hơn hôm qua nhiều. Chọn câu phù hợp.","今天比昨天冷多了。","Hôm nay lạnh hơn hôm qua nhiều."),
      p("Bạn muốn nói giáo viên nói tiếng Trung rất hay. Chọn câu phù hợp.","老师汉语说得很好。","Giáo viên nói tiếng Trung rất hay."),
      p("Bạn đang đi vào cổng trường. Chọn câu phù hợp.","我正在进学校。","Tôi đang vào trường."),
      p("Bạn muốn nói nhà trường rất gần nhà. Chọn câu phù hợp.","学校离家很近。","Trường học rất gần nhà."),
      p("Bạn muốn nói ngoài trời có tuyết. Chọn câu phù hợp.","外面下着雪。","Bên ngoài đang có tuyết rơi."),
      p("Bạn muốn nói nhiệt độ là âm năm độ. Chọn câu phù hợp.","今天零下五度。","Hôm nay âm năm độ."),
      p("Bạn muốn bảo em trai mặc thêm một chút. Chọn câu phù hợp.","你多穿一点儿吧。","Bạn mặc thêm một chút đi."),
      p("Bạn muốn nói vợ bạn hát rất hay. Chọn câu phù hợp.","我妻子唱得很好。","Vợ tôi hát rất hay."),
      p("Bạn muốn nói bạn đã đi vào lớp. Chọn câu phù hợp.","我已经进教室了。","Tôi đã vào lớp rồi.")
    ],orders:[["你","穿得","太少","了"],["今天","比","昨天","冷","多了"],["老师","说得","很","好"],["学校","离","家","很近"],["外面","下着","雪"]],multi:{parts:["今天比昨天","___","多了。外面下着","___","，弟弟穿得太","___","了。妈妈让他多穿一","___","儿。"],options:["冷","雪","少","点","近","进"],answers:["冷","雪","少","点"]},stories:[
      s("b12-r1","今天很冷，外面下着雪，气温零下五度。弟弟穿得太少了。妈妈让他多穿一点儿再出去。","妈妈让弟弟多穿衣服。","弟弟。","家里。","弟弟要多穿一点儿。","天冷下雪，弟弟穿少了，妈妈让他加衣服。"),
      s("b12-r2","学校离家很近。小王走得很快，五分钟就进学校了。他说今天比昨天冷多了。","小王很快进了学校。","小王。","从家到学校。","他五分钟进学校。","学校近，小王走得快，很快到了学校。"),
      s("b12-r3","老师汉语说得很好。新同学听得很认真，但是说得不太快。下课后，她想多练习。","新同学想多练习汉语。","新同学。","教室里。","她下课后想练习。","老师说得好，新同学认真听，后来想多练习。")
    ]},
    hsk2_bai13_menkai:{no:13,lessonId:"hsk2_bai13_menkai",phrases:[
      p("Bạn vào lớp và thấy cửa vẫn mở. Chọn câu phù hợp.","门开着呢。","Cửa đang mở đấy.","Nói trạng thái đang duy trì","V + 着 diễn tả trạng thái còn giữ."),
      p("Bạn thấy trên bàn có mấy quyển sách. Chọn câu phù hợp.","桌子上放着几本书。","Trên bàn có đặt mấy quyển sách."),
      p("Bạn muốn nói Dương Tiếu Tiếu đang cầm bút. Chọn câu phù hợp.","杨笑笑拿着一支铅笔。","Dương Tiếu Tiếu đang cầm một chiếc bút chì."),
      p("Bạn nhắc bạn rằng bạn ấy đã biết đường. Chọn câu phù hợp.","你不是知道路吗？","Bạn chẳng phải biết đường rồi sao?"),
      p("Bạn bảo bạn cứ đi thẳng về phía trước. Chọn câu phù hợp.","一直往前走。","Cứ đi thẳng về phía trước."),
      p("Bạn bảo bạn đến ngã tư rẽ trái. Chọn câu phù hợp.","到路口左转。","Đến ngã tư thì rẽ trái."),
      p("Bạn muốn nói con đường này đi về khách sạn. Chọn câu phù hợp.","这条路一直往宾馆走。","Con đường này đi thẳng về phía khách sạn."),
      p("Bạn thấy một người đang cười. Chọn câu phù hợp.","她笑着说话。","Cô ấy cười và nói chuyện."),
      p("Bạn muốn hỏi lại bạn đã cầm bút chưa. Chọn câu phù hợp.","你不是拿着铅笔吗？","Bạn chẳng phải đang cầm bút chì sao?"),
      p("Bạn nói mấy bạn học đang ở trong lớp. Chọn câu phù hợp.","几个同学坐着聊天。","Mấy bạn học đang ngồi trò chuyện.")
    ],orders:[["门","开着","呢"],["桌子上","放着","几本书"],["一直","往前","走"],["杨笑笑","拿着","一支铅笔"],["到","路口","左转"]],multi:{parts:["教室的门","___","着呢。桌子上","___","着几本书。我们一直","___","前走，到路口","___","转。"],options:["开","放","往","左","拿","笑"],answers:["开","放","往","左"]},stories:[
      s("b13-r1","我到教室的时候，门开着呢。桌子上放着几本书，杨笑笑拿着一支铅笔在写字。","教室里有人在写字。","杨笑笑。","教室里。","她拿着铅笔写字。","我到教室时门开着，杨笑笑拿着铅笔写字。"),
      s("b13-r2","下课以后，我们一直往前走。到路口左转，再走五分钟就到宾馆了。","大家往宾馆走。","我们。","路口。","左转以后到宾馆。","下课后我们往前走，到路口左转去宾馆。"),
      s("b13-r3","小王找不到朋友。他问小李：‘你不是知道他住在哪儿吗？’小李说：‘我知道，我们往右边走吧。’","小李知道朋友住在哪里。","小李。","右边。","他们往右边走。","小王问路，小李知道，所以他们往右边走。")
    ]},
    hsk2_bai14_kanvou:{no:14,lessonId:"hsk2_bai14_kanvou",phrases:[
      p("Bạn muốn hỏi bạn đã từng xem bộ phim đó chưa. Chọn câu phù hợp.","你看过那个电影吗？","Bạn đã từng xem bộ phim đó chưa?","Hỏi trải nghiệm","V + 过 hỏi/tả trải nghiệm đã từng có."),
      p("Bạn đã xem bộ phim đó hai lần. Chọn câu phù hợp.","我看过那个电影两次。","Tôi đã từng xem bộ phim đó hai lần."),
      p("Trời nóng nhưng công viên thú vị. Chọn câu phù hợp.","虽然很热，但是公园很有意思。","Mặc dù rất nóng nhưng công viên rất thú vị."),
      p("Cuối tuần trời quang, bạn muốn đi chơi. Chọn câu phù hợp.","周末天气很晴，我们想出去玩儿。","Cuối tuần trời rất đẹp, chúng tôi muốn ra ngoài chơi."),
      p("Bạn muốn nói đã đi Trung Quốc một lần. Chọn câu phù hợp.","我去过中国一次。","Tôi đã từng đi Trung Quốc một lần."),
      p("Bạn muốn xem lại bộ phim một lần nữa. Chọn câu phù hợp.","我还想再看一次。","Tôi vẫn muốn xem lại một lần nữa."),
      p("Bạn muốn nói phim này rất thú vị. Chọn câu phù hợp.","这个电影很有意思。","Bộ phim này rất thú vị."),
      p("Bạn nói đã đi công viên ba lần. Chọn câu phù hợp.","我去过公园三次。","Tôi đã từng đi công viên ba lần."),
      p("Bạn muốn nói tuy mệt nhưng vẫn muốn chơi. Chọn câu phù hợp.","虽然很累，但是我还想玩儿。","Mặc dù rất mệt nhưng tôi vẫn muốn chơi."),
      p("Bạn muốn hỏi người bạn đã từng thử món này chưa. Chọn câu phù hợp.","你吃过这个吗？","Bạn đã từng ăn món này chưa?")
    ],orders:[["你","看过","那个电影","吗"],["我","看过","两次"],["虽然","很热","但是","很有意思"],["周末","天气","很晴"],["我","还想","再看","一次"]],multi:{parts:["周末天气很","___","。我去过那个公园两","___","。虽然很","___","，但是我还想出去","___","。"],options:["晴","次","累","玩儿","过","但是"],answers:["晴","次","累","玩儿"]},stories:[
      s("b14-r1","周末天气很晴。小王和朋友去公园玩儿。虽然有点儿热，但是公园很有意思，他们玩得很高兴。","小王和朋友去公园玩儿。","小王和朋友。","公园。","他们玩得很高兴。","周末天气晴，小王和朋友去公园，虽然热但玩得高兴。"),
      s("b14-r2","小李看过那个电影两次。他觉得很有意思，所以还想再看一次。妹妹没看过，想和他一起去。","小李想再看电影。","小李。","电影院。","妹妹想和他一起去。","小李看过两次电影还想看，妹妹也想一起去。"),
      s("b14-r3","今天下雨了，我们不能出去玩儿。虽然不能去公园，但是我们在家看了一个很有意思的电影。","大家在家看电影。","我们。","家里。","他们没有去公园。","下雨不能出门，我们在家看了有意思的电影。")
    ]},
    hsk2_bai15_xinnian:{no:15,lessonId:"hsk2_bai15_xinnian",phrases:[
      p("Năm mới sắp đến. Chọn câu phù hợp.","新年就要到了。","Năm mới sắp đến rồi.","Nói sự việc sắp xảy ra","就要…了 nói một việc gần xảy ra."),
      p("Phim sắp bắt đầu. Chọn câu phù hợp.","电影就要开始了。","Bộ phim sắp bắt đầu rồi."),
      p("Bạn đã hai mươi tuổi rồi. Chọn câu phù hợp.","你都二十岁了。","Bạn đã hai mươi tuổi rồi."),
      p("Mọi người đều bắt đầu chuẩn bị về nhà. Chọn câu phù hợp.","大家都开始准备回家。","Mọi người đều bắt đầu chuẩn bị về nhà."),
      p("Tiểu Vương đã mua xong vé tàu. Chọn câu phù hợp.","小王已经买好火车票了。","Tiểu Vương đã mua xong vé tàu rồi."),
      p("Em gái thích trời quang hơn. Chọn câu phù hợp.","妹妹觉得晴天更好。","Em gái thấy trời quang tốt hơn."),
      p("Bạn muốn nói trời vẫn âm u. Chọn câu phù hợp.","天气一直阴。","Trời vẫn âm u."),
      p("Bạn muốn nói vé ở nhà ga. Chọn câu phù hợp.","火车票在火车站买。","Vé tàu mua ở ga tàu."),
      p("Bạn nói đã muộn rồi, hãy về nhà. Chọn câu phù hợp.","都很晚了，我们回家吧。","Đã muộn rồi, chúng ta về nhà đi."),
      p("Bạn muốn nói ngày lễ sắp tới. Chọn câu phù hợp.","节日要到了。","Ngày lễ sắp đến rồi.")
    ],orders:[["新年","就要","到了"],["电影","就要","开始了"],["你","都","二十岁","了"],["大家","都","准备","回家"],["小王","已经","买好","火车票","了"]],multi:{parts:["新年就要","___","了。大家都准备","___","家。小王已经买好火车","___","了。妹妹觉得晴天更","___","。"],options:["到","回","票","好","阴","新"],answers:["到","回","票","好"]},stories:[
      s("b15-r1","新年就要到了，大家都开始准备回家。小王已经买好火车票了。他明天要去火车站。","小王准备回家过新年。","小王。","火车站。","他已经买好火车票。","新年快到，小王买好票，明天去火车站回家。"),
      s("b15-r2","妹妹说天气一直阴，她不想出去玩儿。哥哥觉得晴天更好，等天气好了再去公园。","哥哥想等晴天去公园。","哥哥。","公园。","他们等天气好再去。","天气阴，妹妹不想出门，哥哥想等晴天再去公园。"),
      s("b15-r3","电影就要开始了，可是小李还没到。朋友说：‘都七点了，我们先进去吧。’后来小李也来了。","朋友先进去看电影。","小李的朋友。","电影院。","后来小李来了。","电影快开始了，朋友先进去，后来小李到了。")
    ]}
  };

  R.applyHsk2QuestionRevision = lessonId => {
    const cfg = lessons[lessonId];
    if(cfg) makeLesson(cfg);
    else if(scenarioLessons[lessonId]) makeScenarioBank(scenarioLessons[lessonId]);
  };
})(window);
