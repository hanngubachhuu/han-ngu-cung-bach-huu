import { $, initShared } from "./ui.mjs";
import { escapeHtml as esc } from "./core.mjs";
import { lexiconManifest } from "./lexicon.mjs";
await initShared();
try {
  const { counts, sources, files } = await lexiconManifest();
  const n = (number) => number.toLocaleString("vi-VN");
  $("#lexiconStatistics").innerHTML = [
    [counts.words, "mục từ khác nhau"],
    [counts.readings, "nhóm cách đọc / dạng chữ"],
    [counts.characters, "chữ Hán"],
    [counts.hanVietCharacters, "chữ có âm Hán Việt"],
  ]
    .map(
      ([value, label]) =>
        `<div><strong>${n(value)}</strong><span>${label}</span></div>`,
    )
    .join("");
  const notes = {
    jieba:
      "Dùng trọng số tần suất từ của Jieba để sắp xếp những kết quả cùng mức khớp, giúp từ quen thuộc xuất hiện trước. Không dùng nguồn này để tạo nghĩa Việt hoặc gán cấp HSK. Số liệu là trọng số của bộ từ điển, không phải thống kê tần suất hiện hành của toàn bộ tiếng Trung.",
    cvdict: `Nguồn gồm ${n(counts.sourceRows)} dòng, gộp một dòng trùng thành ${n(counts.words)} mục từ. Giữ riêng các cách đọc và dạng phồn thể. Tác giả cho biết phần lớn nghĩa Việt có hỗ trợ AI khi dịch, chưa được kiểm chứng toàn bộ; tên riêng và nghĩa ít gặp đặc biệt cần đối chiếu. Đã sửa một lỗi dấu ngoặc pinyin của nguồn, không đổi nghĩa. Dữ liệu nguồn và dữ liệu tra cứu được lưu ngoài Vercel trên Supabase; bản chuyển định dạng tiếp tục theo CC BY-SA 4.0.`,
    hanviet: `${n(counts.directHanVietCharacters)} chữ có ánh xạ trực tiếp; tổng ${n(counts.hanVietCharacters)} chữ khi bổ sung liên hệ giản–phồn từ Unicode. Giữ các cách đọc khác nhau, không đoán âm còn thiếu. Âm của từ được ghép theo từng chữ và pinyin tương ứng, không phải một bản dịch nghĩa.`,
    unihan: `Thông tin mã chữ, pinyin, số nét, bộ thủ, giản–phồn và nghĩa tiếng Anh từ Unicode Unihan 17.0. Bảng kTGH cung cấp ${n(counts.commonCharacters)} chữ thông dụng năm 2013, không phải danh sách HSK. Trường kVietnamese chỉ hiển thị là “Âm Việt (Unihan)”; không dùng thay âm Hán Việt. Dữ liệu Unihan nén được phục vụ từ Supabase Storage.`,
  };
  $("#lexiconSources").innerHTML =
    Object.entries(sources)
      .map(
        ([id, source]) =>
          `<section id="${esc(id)}" class="st-panel"><p class="st-eyebrow">${esc(source.license)}</p><h2>${esc(source.name)}</h2><p>${esc(notes[id])}</p><p class="st-caption">Tác giả / tổ chức: ${esc(source.author)}. Phiên bản: <code>${esc(source.version)}</code>.</p><div class="st-reference-links"><a href="${esc(source.url)}" target="_blank" rel="noopener noreferrer">Nguồn gốc ↗</a><a href="${esc(source.licenseUrl)}" target="_blank" rel="noopener noreferrer">Giấy phép ↗</a></div></section>`,
      )
      .join("") +
    `<section class="st-panel"><h2>Dữ liệu nguồn trên Supabase</h2><p>Các snapshot nén được giữ trong Supabase Storage để website không phải đưa kho từ điển lớn vào từng deployment Vercel. Tệp được giữ nguyên theo phiên bản đã ghim và dùng để phục vụ Hán tự/đối chiếu.</p><div class="st-reference-links">${Object.entries(files)
      .map(
        ([id, file]) =>
          `<a href="${esc(file.gzip)}" target="_blank" rel="noopener noreferrer">Tải ${esc(sources[id]?.name || id)} (.gz) ↗</a>`,
      )
      .join("")}</div></section>`;
} catch (error) {
  $("#lexiconStatistics").textContent = error.message;
}
