import { getClient, getSession } from "./auth.mjs";

export async function initAttempts(userId, lessonId) {
  const key = "hnh_attempt_queue:" + userId + ":" + lessonId;
  let queue = {},
    versions = {},
    running = false,
    active = true,
    again = false;
  try {
    queue = JSON.parse(localStorage.getItem(key) || "{}");
  } catch {}
  try {
    versions = JSON.parse(localStorage.getItem(key + ":versions") || "{}");
  } catch {}
  if (!queue || typeof queue !== "object" || Array.isArray(queue)) queue = {};
  if (!versions || typeof versions !== "object" || Array.isArray(versions))
    versions = {};
  const notice = document.createElement("aside");
  notice.className = "attempt-sync-status";
  notice.setAttribute("aria-live", "polite");
  const text = document.createElement("span"),
    retry = document.createElement("button");
  retry.textContent = "Thử đồng bộ lại";
  retry.type = "button";
  retry.hidden = true;
  notice.append(text, retry);
  document.body.append(notice);
  const save = () => {
    try {
      localStorage.setItem(key, JSON.stringify(queue));
      localStorage.setItem(key + ":versions", JSON.stringify(versions));
      return true;
    } catch {
      return false;
    }
  };
  const status = (message, failed = false) => {
    text.textContent = message;
    retry.hidden = !failed;
  };
  async function flush() {
    if (running || !active) return;
    running = true;
    again = false;
    try {
      for (const [id, item] of Object.entries(queue)) {
        if (!active || (await getSession())?.user.id !== userId) return;
        if (!item || item.lesson_id !== lessonId) continue;
        status("Đang đồng bộ kết quả tự luyện…");
        const client = await getClient();
        const { data, error } = await client.rpc("account_save_attempt", {
          owner_id: userId,
          lesson: lessonId,
          attempt: id,
          points: item.score,
          maximum: item.max_score,
          expected_version: item.version || 0,
        });
        if (error) throw error;
        versions[id] = data.version;
        // A self-mark may arrive while this request is running. Keep the newer score queued.
        if (
          queue[id]?.score === item.score &&
          queue[id]?.max_score === item.max_score
        )
          delete queue[id];
        else if (queue[id]) {
          queue[id].version = data.version;
          again = true;
        }
        save();
      }
      if (active)
        status(
          Object.keys(queue).length
            ? "Có kết quả đang chờ gửi."
            : "Kết quả tự luyện đã đồng bộ với tài khoản.",
        );
    } catch (error) {
      again = false;
      if (active)
        status(
          error.code === "40001"
            ? "Kết quả đã thay đổi ở nơi khác. Bản trên máy được giữ; mở trang tài khoản để đối chiếu."
            : "Chưa gửi được kết quả. Bản trên máy được giữ, kết nối mạng rồi thử lại.",
          true,
        );
    } finally {
      running = false;
      if (again) queueMicrotask(flush);
    }
  }
  function capture(record) {
    if (!active) return;
    const id = String(
      record.attemptId || record.submitTime || record.submittedAt || "",
    );
    const score = Number(record.totalScore),
      maximum = Number(record.maxScore || 100);
    if (
      !id ||
      !Number.isFinite(score) ||
      !Number.isFinite(maximum) ||
      maximum <= 0 ||
      score < 0 ||
      score > maximum
    )
      return;
    const previous = queue[id];
    queue[id] = {
      lesson_id: lessonId,
      score,
      max_score: maximum,
      version: previous?.version || versions[id] || 0,
    };
    if (!save())
      status(
        "Trình duyệt không lưu được hàng đợi. Giữ trang mở và thử đồng bộ lại.",
        true,
      );
    void flush();
  }
  retry.onclick = flush;
  window.addEventListener("online", flush);
  window.addEventListener("study:auth", (e) => {
    if (e.detail.userId !== userId) {
      active = false;
      notice.remove();
      window.removeEventListener("online", flush);
    }
  });
  if (Object.keys(queue).length) void flush();
  else status("Kết quả tự luyện sẽ đồng bộ khi bạn nộp bài.");
  return { capture };
}
