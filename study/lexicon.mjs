let worker,
  next = 0;
const pending = new Map();
function reset(message) {
  worker?.terminate();
  worker = null;
  for (const { reject, timer } of pending.values()) {
    clearTimeout(timer);
    reject(Error(message));
  }
  pending.clear();
}
export async function lexiconRequest(method, args = {}) {
  if (!worker) {
    worker = new Worker(new URL("./lexicon-worker.mjs", import.meta.url), {
      type: "module",
    });
    worker.onmessage = ({ data }) => {
      const request = pending.get(data.id);
      if (!request) return;
      clearTimeout(request.timer);
      pending.delete(data.id);
      data.error
        ? request.reject(Error(data.error))
        : request.resolve(data.result);
    };
    worker.onerror = () =>
      reset("Kho từ điển mở rộng chưa tải được. Hãy thử tải lại trang.");
  }
  return new Promise((resolve, reject) => {
    const id = ++next;
    const timer = setTimeout(
      () => reset("Tải kho từ điển mất quá lâu. Kiểm tra kết nối rồi thử lại."),
      60000,
    );
    pending.set(id, { resolve, reject, timer });
    worker.postMessage({ id, method, args });
  });
}
export const lexiconManifest = () => lexiconRequest("manifest");
