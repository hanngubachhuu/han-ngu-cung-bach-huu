import { documentBlock, parseDocument } from "./document-sync.mjs";
const timeout = () => AbortSignal.timeout(15000);
export function googleConfigured(env = process.env) {
  return [
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    "GOOGLE_REFRESH_TOKEN",
  ].every((k) => !!env[k]);
}
export async function googleAdapter(env = process.env, request = fetch) {
  if (!googleConfigured(env)) throw Error("GOOGLE_NOT_CONFIGURED");
  const tokenResponse = await request("https://oauth2.googleapis.com/token", {
    method: "POST",
    signal: timeout(),
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      refresh_token: env.GOOGLE_REFRESH_TOKEN,
      grant_type: "refresh_token",
    }),
  });
  const token = await tokenResponse.json();
  if (!tokenResponse.ok || !token.access_token)
    throw Error("GOOGLE_AUTH_FAILED");
  const headers = {
    Authorization: "Bearer " + token.access_token,
    "Content-Type": "application/json",
  };
  const identity = await request(
    "https://www.googleapis.com/oauth2/v3/userinfo",
    { headers, signal: timeout() },
  );
  const user = await identity.json();
  if (
    !identity.ok ||
    user.email !== "bachhuu1809@gmail.com" ||
    user.email_verified !== true
  )
    throw Error("GOOGLE_ACCOUNT_MISMATCH");
  async function api(path, body) {
    const response = await request(
      "https://docs.googleapis.com/v1/documents" + path,
      {
        method: body ? "POST" : "GET",
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: timeout(),
      },
    );
    if (!response.ok)
      throw Error(
        response.status === 400
          ? "GOOGLE_REVISION_OR_FORMAT_CONFLICT"
          : "GOOGLE_REQUEST_FAILED",
      );
    return response.json();
  }
  function documentId(id) {
    if (!/^[A-Za-z0-9_-]{10,200}$/.test(id)) throw Error("INVALID_DOCUMENT_ID");
    return id;
  }
  return {
    async read(id) {
      const doc = await api("/" + documentId(id));
      if (!doc.revisionId) throw Error("GOOGLE_REVISION_REQUIRED");
      const text = (doc.body?.content || [])
        .flatMap((e) => e.paragraph?.elements || [])
        .map((e) => e.textRun?.content || "")
        .join("");
      return { ...parseDocument(text), revision: doc.revisionId };
    },
    async create(studentId, fields) {
      const doc = await api("", { title: "Hồ sơ học viên · " + studentId });
      await api("/" + documentId(doc.documentId) + ":batchUpdate", {
        requests: [
          {
            insertText: {
              location: { index: 1 },
              text:
                "Hồ sơ học viên " +
                studentId +
                "\nChỉ chỉnh sửa ba trường trong khối dưới. Ghi chú tự do có thể viết bên ngoài khối. Không dùng tài liệu này để cấp quyền học.\n\n" +
                documentBlock(fields) +
                "\n",
            },
          },
        ],
      });
      return doc.documentId;
    },
    async write(id, previous, fields) {
      const response = await api("/" + documentId(id) + ":batchUpdate", {
        writeControl: { requiredRevisionId: previous.revision },
        requests: [
          {
            replaceAllText: {
              containsText: { text: previous.block, matchCase: true },
              replaceText: documentBlock(fields),
            },
          },
        ],
      });
      if (response.replies?.[0]?.replaceAllText?.occurrencesChanged !== 1)
        throw Error("DOCUMENT_BLOCK_NOT_REPLACED");
      return (
        response.writeControl?.requiredRevisionId ||
        (await this.read(id)).revision
      );
    },
  };
}
