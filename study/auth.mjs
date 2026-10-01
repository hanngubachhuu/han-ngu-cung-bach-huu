let clientPromise;
let capabilitiesPromise;
export let aiEnabled = false;
export async function loadCapabilities() {
  if (!capabilitiesPromise)
    capabilitiesPromise = (async () => {
      try {
        const response = await fetch("./api/study?action=status", {
          signal: AbortSignal.timeout(5000),
        });
        const data = response.ok ? await response.json() : {};
        aiEnabled = data.aiEnabled === true;
      } catch {
        aiEnabled = false;
      }
      window.dispatchEvent(
        new CustomEvent("study:capabilities", { detail: { aiEnabled } }),
      );
      return { aiEnabled };
    })();
  return capabilitiesPromise;
}
export async function getClient() {
  if (!clientPromise)
    clientPromise = (async () => {
      const config = globalThis.HNH_SUPABASE;
      if (!config?.url || !config.publishableKey)
        throw Error("Chưa có kết nối tài khoản.");
      const { createClient } = await import("./vendor/supabase.mjs");
      return createClient(config.url, config.publishableKey, {
        global: {
          fetch: (url, options = {}) =>
            fetch(url, {
              ...options,
              signal: options.signal
                ? AbortSignal.any([options.signal, AbortSignal.timeout(8000)])
                : AbortSignal.timeout(8000),
            }),
        },
      });
    })().catch((error) => {
      clientPromise = null;
      throw error;
    });
  return clientPromise;
}
export async function getSession() {
  const c = await getClient();
  const { data, error } = await c.auth.getSession();
  if (error) throw error;
  return data.session;
}
export async function api(action, body = {}, signal) {
  if (!(await loadCapabilities()).aiEnabled)
    throw Error(
      "AI tạm chưa bật. Kho từ, luyện nét và bài đọc mẫu vẫn sử dụng được.",
    );
  const session = await getSession();
  if (!session)
    throw Error("Đăng nhập để sử dụng phân tích AI và lưu trên tài khoản.");
  const response = await fetch(
    "./api/study?action=" + encodeURIComponent(action),
    {
      method: "POST",
      signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + session.access_token,
      },
      body: JSON.stringify(body),
    },
  );
  const type = response.headers.get("content-type") || "";
  if (!type.includes("application/json")) {
    if (response.ok && type.includes("audio/")) return response.blob();
    throw Error(
      "Dịch vụ chưa sẵn sàng. Các công cụ tra cứu và bài mẫu vẫn dùng được.",
    );
  }
  const data = await response.json();
  if (!response.ok) throw Error(data.error || "Không kết nối được dịch vụ.");
  return data;
}
