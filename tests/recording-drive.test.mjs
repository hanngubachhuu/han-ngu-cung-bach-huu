import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  createDriveArchive,
  driveConfigured,
} from "../server/recording-drive.mjs";
const env = {
  SPEAKING_DRIVE_CLIENT_ID: "synthetic-client",
  SPEAKING_DRIVE_CLIENT_SECRET: "synthetic-secret",
  SPEAKING_DRIVE_REFRESH_TOKEN: "synthetic-token",
  SPEAKING_DRIVE_FOLDER_ID: "folder",
  SPEAKING_DRIVE_OWNER_EMAIL: "owner@example.invalid",
};
function mock({ shared = false, failUpload = false } = {}) {
  let file = null,
    creates = 0,
    deletes = 0;
  const bytes = Buffer.from("synthetic mp3"),
    sha = createHash("sha256").update(bytes).digest("hex");
  const record = {
    id: "00000000-0000-4000-8000-000000000010",
    drive_file_id: "reserved",
    mp3_sha256: sha,
    mp3_size: bytes.length,
  };
  const privateData = {
    owners: [{ emailAddress: env.SPEAKING_DRIVE_OWNER_EMAIL }],
    permissions: [
      {
        type: "user",
        role: "owner",
        emailAddress: env.SPEAKING_DRIVE_OWNER_EMAIL,
      },
    ],
  };
  const request = async (url, opts = {}) => {
    if (url.endsWith("/token"))
      return Response.json({ access_token: "synthetic-access" });
    if (url.endsWith("/userinfo"))
      return Response.json({
        email: env.SPEAKING_DRIVE_OWNER_EMAIL,
        email_verified: true,
      });
    if (url.includes("generateIds"))
      return Response.json({ ids: ["reserved"] });
    if (url.includes("/files/folder"))
      return Response.json({
        id: "folder",
        mimeType: "application/vnd.google-apps.folder",
        ...privateData,
        ...(shared
          ? { permissions: [{ type: "anyone", role: "reader" }] }
          : {}),
      });
    if (url.includes("upload/drive/v3/files")) {
      creates++;
      if (failUpload) throw Error("timeout");
      file = {
        id: "reserved",
        mimeType: "audio/mpeg",
        parents: ["folder"],
        appProperties: { recording_id: record.id, sha256: sha },
        size: String(bytes.length),
        md5Checksum: createHash("md5").update(bytes).digest("hex"),
        ...privateData,
      };
      return Response.json({ id: "reserved" });
    }
    if (url.includes("/files/reserved")) {
      if (opts.method === "DELETE") {
        deletes++;
        file = null;
        return new Response(null, { status: 204 });
      }
      return file ? Response.json(file) : Response.json({}, { status: 404 });
    }
    throw Error("unexpected synthetic route");
  };
  return {
    request,
    bytes,
    record,
    get creates() {
      return creates;
    },
    get deletes() {
      return deletes;
    },
    tamper() {
      file.appProperties.recording_id = "another";
    },
  };
}
test("Drive adapter is inactive without explicit server configuration", async () => {
  assert.equal(driveConfigured({}), false);
  await assert.rejects(createDriveArchive({}), /DRIVE_NOT_CONFIGURED/);
});
test("private Drive upload retry uses reserved identity and verifies actual bytes", async () => {
  const f = mock(),
    a = await createDriveArchive(env, f.request);
  assert.equal(await a.allocateId(), "reserved");
  await a.upload(f.record, f.bytes);
  await a.upload(f.record, f.bytes);
  assert.equal(f.creates, 1);
  await assert.rejects(
    a.upload(f.record, Buffer.from("substitution")),
    /MP3_IDENTITY_CONFLICT/,
  );
});
test("shared/public folder is rejected before upload", async () => {
  const f = mock({ shared: true });
  await assert.rejects(createDriveArchive(env, f.request), /DRIVE_NOT_PRIVATE/);
  assert.equal(f.creates, 0);
});
test("cleanup tolerates 404 and refuses mismatched Drive object identity", async () => {
  const f = mock(),
    a = await createDriveArchive(env, f.request);
  await a.upload(f.record, f.bytes);
  f.tamper();
  await assert.rejects(a.remove(f.record), /DRIVE_IDENTITY_CONFLICT/);
  assert.equal(f.deletes, 0);
  const second = mock(),
    b = await createDriveArchive(env, second.request);
  await b.upload(second.record, second.bytes);
  await b.remove(second.record);
  await b.remove(second.record);
  assert.equal(second.deletes, 1);
});
