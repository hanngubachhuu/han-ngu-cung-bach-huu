import { getClient, getSession } from "./auth.mjs";
import { mountAssignments } from "./assignment-student.mjs";
const parentOrigin = "https://hanngubachhuu.vercel.app",
  loginStatus = document.querySelector("[data-login-status]"),
  proof = document.querySelector("[data-denial-status]");
let fixture, dispose;
function syntheticStream() {
  const c = new AudioContext(),
    osc = c.createOscillator(),
    dest = c.createMediaStreamDestination();
  osc.frequency.value = 440;
  osc.connect(dest);
  osc.start();
  setTimeout(() => c.close(), 120000);
  return dest.stream;
}
async function syntheticBlob() {
  const stream = syntheticStream(),
    rec = new MediaRecorder(stream, { mimeType: "audio/webm;codecs=opus" }),
    chunks = [];
  return new Promise((resolve, reject) => {
    rec.ondataavailable = (e) => chunks.push(e.data);
    rec.onerror = reject;
    rec.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      resolve(new Blob(chunks, { type: "audio/webm" }));
    };
    rec.start();
    setTimeout(() => rec.stop(), 1200);
  });
}
window.addEventListener("message", async (e) => {
  if (
    e.origin !== parentOrigin ||
    e.source !== window.opener ||
    e.data?.type !== "synthetic-speaking-login" ||
    fixture
  )
    return;
  try {
    const client = await getClient();
    const auth = await client.auth.verifyOtp({
      token_hash: e.data.token_hash,
      type: "magiclink",
    });
    if (
      auth.error ||
      auth.data.user?.id !== e.data.owner ||
      !auth.data.user.app_metadata.speaking_browser_run
    )
      throw Error("SYNTHETIC_LOGIN_FAILED");
    fixture = { ...e.data };
    delete fixture.token_hash;
    // Synthetic microphone input only on this disposable fixture page. The normal recorder,
    // uploadRecording, assignment draft/save/submit and hosted RLS remain unchanged.
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
      value: async () => syntheticStream(),
      configurable: true,
    });
    loginStatus.textContent =
      "Đã đăng nhập Supabase: Synthetic " + fixture.label.toUpperCase();
    document.querySelector("[data-denial]").disabled = false;
    document.querySelector("[data-logout]").disabled = false;
    dispose = mountAssignments(document.querySelector("[data-assignments]"), {
      user_id: fixture.owner,
    });
  } catch (e) {
    loginStatus.textContent = e.message;
  }
});
window.opener?.postMessage({ type: "synthetic-speaking-ready" }, parentOrigin);
const check = (value, message) => {
  if (!value) throw Error(message);
};
document.querySelector("[data-denial]").onclick = async (e) => {
  e.target.disabled = true;
  proof.textContent =
    "Đang kiểm tra RPC và Storage bằng session học viên thật…";
  try {
    const c = await getClient(),
      s = await getSession();
    check(s?.user.id === fixture.owner, "ACCOUNT_CHANGED");
    const blob = await syntheticBlob(),
      payload = {
        attempt_id: fixture.attempt,
        question_version_id: fixture.question,
        request_id: crypto.randomUUID(),
        sha256: "a".repeat(64),
        size: blob.size,
        mime: blob.type,
      };
    const reserve = async (p) =>
      c.rpc("recording_command", {
        command: "reserve",
        payload: { ...payload, ...p },
      });
    if (fixture.label === "b") {
      check(
        (await reserve({})).error?.message === "RECORDING_NOT_READY",
        "OUTSIDE_RESERVE_ALLOWED",
      );
      const uploaded = await c.storage
        .from("speaking-private")
        .upload(fixture.outsideRecording + "/raw", blob, {
          upsert: false,
          contentType: blob.type,
        });
      check(
        !!uploaded.error &&
          /row-level security|unauthorized/i.test(uploaded.error.message),
        "OUTSIDE_UPLOAD_ALLOWED",
      );
    } else {
      check(
        (await reserve({ attempt_id: fixture.outsideAttempt })).error
          ?.message === "RECORDING_NOT_READY",
        "OUTSIDE_ATTEMPT_ALLOWED",
      );
      check(
        (await reserve({ question_version_id: fixture.otherQuestion })).error
          ?.message === "RECORDING_NOT_READY",
        "OUTSIDE_QUESTION_ALLOWED",
      );
    }
    const cross = await c.rpc("assignment_command", {
      command: "get",
      payload: { attempt_id: fixture.otherAttempt },
    });
    check(!!cross.error, "CROSS_SUBMISSION_VISIBLE");
    const key = await c
      .from("assignment_question_versions")
      .select("answer_key")
      .eq("id", fixture.question);
    check(!!key.error || key.data.length === 0, "PRIVATE_KEY_VISIBLE");
    const grades = await c
      .from("submission_grades")
      .select("*")
      .eq("attempt_id", fixture.attempt);
    check(!!grades.error || grades.data.length === 0, "DRAFT_GRADES_VISIBLE");
    for (const command of ["grade", "grade_publish", "question_create"]) {
      check(
        !!(
          await c.rpc("assignment_command", {
            command,
            payload: { attempt_id: fixture.attempt },
          })
        ).error,
        "STUDENT_MUTATION_ALLOWED",
      );
    }
    check(
      !!(await c.rpc("recording_worker", { command: "claim", payload: {} }))
        .error,
      "STUDENT_WORKER_ALLOWED",
    );
    const path = (fixture.recording || fixture.outsideRecording) + "/raw";
    const signed = await c.storage
      .from("speaking-private")
      .createSignedUrl(path, 60);
    check(!!signed.error, "SIGNED_URL_ALLOWED");
    const listed = await c.storage
      .from("speaking-private")
      .list(path.split("/")[0]);
    check(
      !!listed.error || listed.data.length === 0,
      "OBJECT_METADATA_VISIBLE",
    );
    if (fixture.label === "b" && fixture.recording) {
      check(
        !!(
          await c.rpc("recording_command", {
            command: "get",
            payload: { recording_id: fixture.recording },
          })
        ).error,
        "CROSS_RECORDING_VISIBLE",
      );
      for (const suffix of ["raw", "audio.mp3"])
        check(
          !!(
            await c.storage
              .from("speaking-private")
              .download(fixture.recording + "/" + suffix)
          ).error,
          "CROSS_AUDIO_VISIBLE",
        );
    }
    proof.textContent =
      "PASS: " +
      (fixture.label === "b"
        ? "học viên ngoài fixture không reserve/upload; "
        : "attempt/question ngoài fixture bị từ chối; ") +
      "owner isolation, private key/grade, student mutation/worker denial, signed URL/list denial.";
  } catch (error) {
    proof.textContent = "FAIL: " + error.message;
  } finally {
    e.target.disabled = false;
  }
};
document.querySelector("[data-logout]").onclick = async () => {
  dispose?.();
  const c = await getClient(),
    r = await c.auth.signOut({ scope: "global" });
  if (r.error) loginStatus.textContent = "FAIL: SESSION_REVOKE_FAILED";
  else {
    const reserve = await c.rpc("recording_command", {
      command: "reserve",
      payload: {
        attempt_id: fixture.attempt,
        question_version_id: fixture.question,
      },
    });
    const audio = await c.storage
      .from("speaking-private")
      .download((fixture.recording || fixture.outsideRecording) + "/raw");
    loginStatus.textContent =
      reserve.error && audio.error
        ? "Đã đăng xuất và thu hồi session synthetic. PASS: anonymous reserve/audio bị từ chối."
        : "FAIL: ANONYMOUS_ACCESS_ALLOWED";
  }
  document.querySelector("[data-assignments]").replaceChildren();
};
