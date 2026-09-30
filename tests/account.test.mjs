import test from "node:test";
import { importedReadingId } from "../study/account-core.mjs";

test("guest conflict copies are stable across retries and isolated by owner and content", async () => {
  const row = { id: "one", title: "Read", sourceText: "你好", result: null };
  assert.equal(
    await importedReadingId("a", row),
    await importedReadingId("a", row),
  );
  assert.notEqual(
    await importedReadingId("a", row),
    await importedReadingId("b", row),
  );
  assert.notEqual(
    await importedReadingId("a", row),
    await importedReadingId("a", { ...row, sourceText: "再见" }),
  );
});
import assert from "node:assert/strict";
import {
  safeReturnPath,
  validatePassword,
  mergeGuestLibrary,
  accountState,
  authCallbackError,
} from "../study/account-core.mjs";
test("expired callbacks give safe confirmation or recovery guidance", () => {
  const base = "https://example.com/tai-khoan.html";
  assert.equal(authCallbackError(base + "#access_token=test"), null);
  const confirmation = authCallbackError(
    base +
      "#error=access_denied&error_code=otp_expired&error_description=UNTRUSTED",
  );
  assert.equal(confirmation.recovery, false);
  assert.match(confirmation.message, /thư mới nhất/);
  assert.doesNotMatch(confirmation.message, /UNTRUSTED/);
  const recovery = authCallbackError(
    base + "?mode=reset&error_code=otp_expired",
  );
  assert.equal(recovery.recovery, true);
  assert.match(recovery.message, /khôi phục mới/);
});
test("return locations stay inside the deployment path", () => {
  const base = "https://example.com/han-ngu/tai-khoan.html";
  for (const path of [
    "https://evil.example/x.html",
    "//evil.example/x.html",
    "javascript:alert(1)",
    "/outside.html",
    "../outside.html",
  ])
    assert.equal(safeReturnPath(path, base), "tai-khoan.html");
  assert.equal(
    safeReturnPath("hsk1_bai4_index.html", base),
    "/han-ngu/hsk1_bai4_index.html",
  );
  assert.equal(
    safeReturnPath("tai-khoan.html?access_token=secret#token", base),
    "/han-ngu/tai-khoan.html",
  );
});
test("new passwords have accessible length and confirmation checks", () => {
  assert.match(validatePassword("short", "short"), /12/);
  assert.match(validatePassword("a long pass phrase", "different"), /khớp/);
  assert.equal(
    validatePassword("a long pass phrase", "a long pass phrase"),
    "",
  );
  assert.equal(accountState({ status: "unknown" }).label, "Chưa xác định");
});
test("guest merge only adds missing items and exposes divergent readings", () => {
  const plan = mergeGuestLibrary(
    {
      words: ["a", "b"],
      characters: ["学", "中"],
      readings: [
        { id: "r", title: "Mine", sourceText: "text" },
        { id: "new", title: "New", sourceText: "new" },
      ],
    },
    {
      words: ["a"],
      characters: ["学"],
      readings: [{ id: "r", title: "Other", sourceText: "other" }],
    },
  );
  assert.deepEqual(plan.words, ["b"]);
  assert.deepEqual(plan.characters, ["中"]);
  assert.equal(plan.readings.length, 1);
  assert.equal(plan.conflicts.length, 1);
});
