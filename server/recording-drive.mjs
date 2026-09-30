import { createHash } from "node:crypto";
const identifier = /^[A-Za-z0-9_-]{1,200}$/;
export function driveConfigured(env = process.env) {
  return [
    "SPEAKING_DRIVE_CLIENT_ID",
    "SPEAKING_DRIVE_CLIENT_SECRET",
    "SPEAKING_DRIVE_REFRESH_TOKEN",
    "SPEAKING_DRIVE_FOLDER_ID",
    "SPEAKING_DRIVE_OWNER_EMAIL",
  ].every((k) => !!env[k]);
}
export async function createDriveArchive(env = process.env, request = fetch) {
  if (!driveConfigured(env)) throw Error("DRIVE_NOT_CONFIGURED");
  if (!identifier.test(env.SPEAKING_DRIVE_FOLDER_ID))
    throw Error("DRIVE_INVALID_FOLDER");
  const response = await request("https://oauth2.googleapis.com/token", {
    method: "POST",
    signal: AbortSignal.timeout(15000),
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.SPEAKING_DRIVE_CLIENT_ID,
      client_secret: env.SPEAKING_DRIVE_CLIENT_SECRET,
      refresh_token: env.SPEAKING_DRIVE_REFRESH_TOKEN,
      grant_type: "refresh_token",
    }),
  });
  const token = await response.json();
  if (!response.ok || !token.access_token) throw Error("DRIVE_AUTH_FAILED");
  const headers = { Authorization: "Bearer " + token.access_token };
  async function api(route, options = {}, missing = false) {
    const res = await request("https://www.googleapis.com/" + route, {
      ...options,
      headers: { ...headers, ...options.headers },
      signal: AbortSignal.timeout(30000),
    });
    if (missing && res.status === 404) return null;
    if (!res.ok)
      throw Error(
        res.status === 409
          ? "DRIVE_EXISTS"
          : res.status === 403
            ? "DRIVE_PERMISSION_DENIED"
            : "DRIVE_REQUEST_FAILED",
      );
    return res.status === 204 ? {} : res.json();
  }
  const owner = await api("oauth2/v3/userinfo");
  if (
    owner.email_verified !== true ||
    owner.email !== env.SPEAKING_DRIVE_OWNER_EMAIL
  )
    throw Error("DRIVE_ACCOUNT_MISMATCH");
  const folder = env.SPEAKING_DRIVE_FOLDER_ID;
  const fields =
    "id,mimeType,parents,appProperties,size,md5Checksum,trashed,owners(emailAddress),permissions(type,role,emailAddress)";
  async function metadata(id, missing = false) {
    if (!identifier.test(id || "")) throw Error("DRIVE_INVALID_ID");
    return api(
      `drive/v3/files/${id}?fields=${encodeURIComponent(fields)}`,
      {},
      missing,
    );
  }
  function privateOnly(meta) {
    // Require a single configured owner and no shared/public/domain permission.
    if (
      meta.trashed ||
      !meta.owners?.length ||
      meta.owners.some(
        (o) => o.emailAddress !== env.SPEAKING_DRIVE_OWNER_EMAIL,
      ) ||
      !meta.permissions?.length ||
      meta.permissions.some(
        (p) =>
          p.type !== "user" ||
          p.role !== "owner" ||
          p.emailAddress !== env.SPEAKING_DRIVE_OWNER_EMAIL,
      )
    )
      throw Error("DRIVE_NOT_PRIVATE");
  }
  const target = await metadata(folder);
  privateOnly(target);
  if (target.mimeType !== "application/vnd.google-apps.folder")
    throw Error("DRIVE_INVALID_FOLDER");
  function verify(meta, recording, bytes) {
    privateOnly(meta);
    if (
      meta.mimeType !== "audio/mpeg" ||
      meta.parents?.length !== 1 ||
      meta.parents[0] !== folder ||
      meta.appProperties?.recording_id !== recording.id ||
      meta.appProperties?.sha256 !== recording.mp3_sha256 ||
      Number(meta.size) !== recording.mp3_size ||
      (bytes &&
        meta.md5Checksum !== createHash("md5").update(bytes).digest("hex"))
    )
      throw Error("DRIVE_IDENTITY_CONFLICT");
  }
  return {
    async allocateId() {
      const data = await api(
        "drive/v3/files/generateIds?count=1&space=drive&type=files",
      );
      if (!identifier.test(data.ids?.[0] || ""))
        throw Error("DRIVE_INVALID_ID");
      return data.ids[0];
    },
    async upload(recording, bytes) {
      if (
        createHash("sha256").update(bytes).digest("hex") !==
        recording.mp3_sha256
      )
        throw Error("MP3_IDENTITY_CONFLICT");
      let meta = await metadata(recording.drive_file_id, true);
      if (!meta) {
        const boundary = "hnh_" + recording.id.replaceAll("-", "");
        const description = {
          id: recording.drive_file_id,
          name: recording.id + ".mp3",
          mimeType: "audio/mpeg",
          parents: [folder],
          appProperties: {
            recording_id: recording.id,
            sha256: recording.mp3_sha256,
          },
        };
        const body = Buffer.concat([
          Buffer.from(
            `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(description)}\r\n--${boundary}\r\nContent-Type: audio/mpeg\r\n\r\n`,
          ),
          bytes,
          Buffer.from(`\r\n--${boundary}--\r\n`),
        ]);
        try {
          await api("upload/drive/v3/files?uploadType=multipart", {
            method: "POST",
            headers: {
              "Content-Type": `multipart/related; boundary=${boundary}`,
            },
            body,
          });
        } catch (error) {
          if (error.message !== "DRIVE_EXISTS") throw error;
        }
        meta = await metadata(recording.drive_file_id);
      }
      verify(meta, recording, bytes);
      return { fileId: meta.id };
    },
    async remove(recording) {
      const meta = await metadata(recording.drive_file_id, true);
      if (!meta) return;
      verify(meta, recording);
      await api(
        `drive/v3/files/${recording.drive_file_id}`,
        { method: "DELETE" },
        true,
      );
    },
  };
}
