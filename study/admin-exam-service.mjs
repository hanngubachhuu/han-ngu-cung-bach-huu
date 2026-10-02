import { getClient, getSession } from "./auth.mjs";
export async function adminExamCommand(command, payload = {}, ownerId) {
  const session = await getSession();
  if (!session || session.user.id !== ownerId) throw Error("ACCOUNT_CHANGED");
  const client = await getClient();
  const { data, error } = await client.rpc("admin_exam_command", {
    command,
    payload,
  });
  if (error) throw error;
  if ((await getSession())?.user.id !== ownerId) throw Error("ACCOUNT_CHANGED");
  return data;
}
export async function hskkAdminRequest(
  code,
  action,
  { ownerId, method = "GET", body, binary = false } = {},
) {
  const session = await getSession();
  if (!session || session.user.id !== ownerId) throw Error("ACCOUNT_CHANGED");
  const base =
    location.hostname === "hanngubachhuu.github.io"
      ? "https://hanngubachhuu.vercel.app/api/hskk-exams"
      : "./api/hskk-exams";
  const params = new URLSearchParams({
    exam: code,
    ...(action ? { action } : {}),
  });
  const res = await fetch(base + "?" + params, {
    method,
    cache: "no-store",
    headers: {
      Authorization: "Bearer " + session.access_token,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(action === "segment" ? 120000 : 30000),
  });
  if (!res.ok) {
    const data = await res.json();
    throw Error(data.error);
  }
  const data = binary ? await res.blob() : await res.json();
  if ((await getSession())?.user.id !== ownerId) throw Error("ACCOUNT_CHANGED");
  return data;
}
export async function hskkDeliveryRequest(
  code,
  action = "get",
  { ownerId, body } = {},
) {
  const session = await getSession();
  if (!session || session.user.id !== ownerId) throw Error("ACCOUNT_CHANGED");
  const res = await fetch(
    "./api/hskk-delivery?" + new URLSearchParams({ exam: code, action }),
    {
      method: body ? "POST" : "GET",
      cache: "no-store",
      headers: {
        Authorization: "Bearer " + session.access_token,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(120000),
    },
  );
  const data = await res.json();
  if (!res.ok) throw Error(data.error);
  if ((await getSession())?.user.id !== ownerId) throw Error("ACCOUNT_CHANGED");
  return data;
}
