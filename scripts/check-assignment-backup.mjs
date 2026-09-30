// Validate the approved local backup without printing student rows or lesson keys.
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import assert from "node:assert/strict";
const root = fileURLToPath(new URL("../", import.meta.url));
const backupPath = path.resolve(
  root,
  ".cache/backups/assignment-before-20260930.json",
);
const relative = path.relative(root, backupPath).replaceAll("\\", "/");
const git = ["-c", "safe.directory=" + root.replaceAll("\\", "/")];
execFileSync("git", [...git, "check-ignore", "-q", relative], { cwd: root });
assert.equal(
  execFileSync("git", [...git, "ls-files", "--", relative], {
    cwd: root,
    encoding: "utf8",
  }).trim(),
  "",
  "Backup must never be tracked",
);
const bytes = await fs.readFile(backupPath),
  data = JSON.parse(bytes);
assert.equal(data.format, "hnh-assignment-release-backup-1");
assert.equal(data.project, "dmeqxdznzobbarvkmxyg");
const required = [
  "courses",
  "lesson_content",
  "profiles",
  "enrollments",
  "student_lesson_access",
  "learning_attempts",
  "lesson_assets",
  "audit_logs",
];
assert.deepEqual(Object.keys(data.tables).sort(), required.sort());
const counts = Object.fromEntries(
  Object.entries(data.tables).map(([k, v]) => {
    assert(Array.isArray(v));
    return [k, v.length];
  }),
);
const issues = [];
function scan(value, location = "root") {
  if (Array.isArray(value))
    return value.forEach((v, i) => scan(v, location + "." + i));
  if (value && typeof value === "object")
    return Object.entries(value).forEach(([key, v]) => {
      if (
        /^(password|passphrase|service[_-]?role[_-]?(key)?|access[_-]?token|refresh[_-]?token|client[_-]?secret|oauth[_-]?secret|private[_-]?key|credentials?|api[_-]?key|authorization)$/i.test(
          key,
        )
      )
        issues.push(location + "." + key);
      scan(v, location + "." + key);
    });
  if (
    typeof value === "string" &&
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|eyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}|AIza[A-Za-z0-9_-]{30,}|sb_secret_[A-Za-z0-9_-]{10,}|Bearer\s+[A-Za-z0-9_.-]{20,}|[?&](?:access_token|refresh_token|token|api_key|secret)=/i.test(
      value,
    )
  )
    issues.push(location);
}
scan(data);
assert.deepEqual(issues, [], "Forbidden secret/token candidate locations");
const profiles = new Set(data.tables.profiles.map((r) => r.user_id)),
  courses = new Set(data.tables.courses.map((r) => r.id)),
  lessons = new Set(data.tables.lesson_content.map((r) => r.id));
assert.equal(profiles.size, counts.profiles);
assert.equal(courses.size, counts.courses);
assert.equal(lessons.size, counts.lesson_content);
for (const r of data.tables.lesson_content) assert(courses.has(r.course_id));
for (const r of data.tables.enrollments)
  assert(profiles.has(r.user_id) && courses.has(r.course_id));
for (const r of [
  ...data.tables.student_lesson_access,
  ...data.tables.learning_attempts,
])
  assert(profiles.has(r.user_id) && lessons.has(r.lesson_id));
for (const r of data.tables.lesson_assets) assert(lessons.has(r.lesson_id));
const stat = await fs.stat(backupPath);
const report = {
  capturedAt: data.captured_at,
  fileCreatedAt: stat.birthtime.toISOString(),
  checkedAt: new Date().toISOString(),
  bytes: bytes.length,
  sha256: createHash("sha256").update(bytes).digest("hex"),
  counts,
  parseAndRelations: "passed",
  secretTokenCandidates: 0,
  gitIgnored: true,
  gitTracked: false,
  skipped: data.backup_scope.omitted,
};
await fs.writeFile(
  path.join(root, ".cache/backups/assignment-integrity-report.json"),
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report));
