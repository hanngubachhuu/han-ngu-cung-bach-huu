// Read-only human Console checkpoint. The JWT stays in the existing session.
// Only filtered evidence is returned; no response bodies, paths or tokens.
export async function runHostedStorageCheckpoint({
  origin,
  config,
  client,
  session,
  probePath,
  expectedStudentId,
  request = fetch,
  digest = async (bytes) =>
    [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join(""),
  decodeMp3 = async (bytes) => {
    const context = new AudioContext();
    try {
      return (await context.decodeAudioData(bytes.slice(0))).duration;
    } finally {
      await context.close();
    }
  },
}) {
  const out = {
    checked_at: new Date().toISOString(),
    evidence: "HOSTED_HTTP",
    results: [],
  };
  try {
    if (
      origin !== "https://hanngubachhuu.vercel.app" ||
      config?.url !== "https://dmeqxdznzobbarvkmxyg.supabase.co"
    )
      throw Error("WRONG_ORIGIN");
    if (!session || !/^[a-f0-9]{64}\.mp3$/.test(probePath))
      throw Error("SESSION_OR_PROBE_REQUIRED");
    const { data, error } = await client.auth.getUser();
    if (error || data.user?.id !== session.user.id)
      throw Error("AUTH_REQUIRED");
    const profile = await client
      .from("profiles")
      .select("role,status")
      .eq("user_id", data.user.id)
      .single();
    out.role = profile.data?.role;
    out.profile_status = profile.data?.status;
    if (
      profile.error ||
      out.profile_status !== "APPROVED" ||
      !["ADMIN", "STUDENT"].includes(out.role)
    )
      throw Error("APPROVED_PROFILE_REQUIRED");
    if (out.role === "STUDENT" && data.user.id !== expectedStudentId)
      throw Error("CONTROLLED_STUDENT_REQUIRED");
    out.identity_verified = true;
    const headers = (authenticated) => ({
      apikey: config.publishableKey,
      ...(authenticated
        ? { Authorization: "Bearer " + session.access_token }
        : {}),
    });
    const read = (url, options = {}) =>
      request(url, {
        cache: "no-store",
        signal: AbortSignal.timeout(20000),
        ...options,
      });
    const json = async (response) => {
      try {
        return await response.json();
      } catch {
        return null;
      }
    };
    const isDenial = (status, body) =>
      [401, 403, 404].includes(status) ||
      (status === 400 &&
        /not.?found|unauthori[sz]ed|invalid.?jwt|no.?such.?key|access.?denied|invalid token/i.test(
          JSON.stringify(body),
        ));
    const object = (path) =>
      config.url + "/storage/v1/object/authenticated/hskk-prompt-clips/" + path;
    const deny = async (name, url, authenticated) => {
      const response = await read(url, { headers: headers(authenticated) });
      const body = await json(response);
      out.results.push({
        name,
        http_status: response.status,
        state: isDenial(response.status, body) ? "PASS" : "FAIL",
      });
    };
    await deny("anonymous_private_clip", object(probePath), false);
    await deny(
      "anonymous_public_clip",
      config.url + "/storage/v1/object/public/hskk-prompt-clips/" + probePath,
      false,
    );
    if (out.role === "STUDENT") {
      await deny("student_private_clip", object(probePath), true);
      const list = await read(
        config.url + "/storage/v1/object/list/hskk-prompt-clips",
        {
          method: "POST",
          headers: { ...headers(true), "Content-Type": "application/json" },
          body: JSON.stringify({ prefix: "", limit: 100 }),
        },
      );
      const objects = await json(list);
      out.results.push({
        name: "student_clip_enumeration",
        http_status: list.status,
        returned_objects: Array.isArray(objects) ? objects.length : null,
        state:
          (list.status === 200 &&
            Array.isArray(objects) &&
            objects.length === 0) ||
          isDenial(list.status, objects)
            ? "PASS"
            : "FAIL",
      });
    } else {
      const authorization = { Authorization: "Bearer " + session.access_token };
      const bindingResponse = await read(
        origin + "/api/hskk-delivery?exam=H71002",
        { headers: authorization },
      );
      const binding = await json(bindingResponse);
      const sourceResponse = await read(
        origin + "/api/hskk-exams?exam=H71002",
        { headers: authorization },
      );
      const source = await json(sourceResponse);
      if (
        bindingResponse.status !== 200 ||
        sourceResponse.status !== 200 ||
        binding?.clips?.length !== 27 ||
        source?.questions?.length !== 27 ||
        !binding.version_id ||
        new Set(binding.clips.map((q) => q.question_version_id)).size !== 27 ||
        binding.clips.some(
          (q) =>
            !/^[a-f0-9-]{36}$/.test(q.question_version_id) ||
            !/^[a-f0-9]{64}$/.test(q.sha256) ||
            q.path !== q.sha256 + ".mp3",
        )
      )
        throw Error("BINDING_UNAVAILABLE");
      out.exam_version_id = binding.version_id;
      out.authoring_revision = source.database_revision;
      for (const clip of binding.clips) {
        const question = source.questions.find(
          (q) => q.id === clip.question_key,
        );
        const provenance = source.audio.clip_provenance.find(
          (p) => p.question_id === clip.question_key,
        );
        const provenanceMatches =
          !!question &&
          !!provenance &&
          provenance.clip_sha256 === clip.sha256 &&
          provenance.question_version === question.version &&
          provenance.exam_version === source.exam_version &&
          provenance.source_sha256 === source.audio.source_audio_id &&
          provenance.source_sha256 ===
            source.provenance.sha256[source.provenance.audio] &&
          provenance.run_id === question.audio_segment.run_id &&
          provenance.start_ms === question.audio_segment.start_ms &&
          provenance.end_ms === question.audio_segment.end_ms &&
          provenance.duration_ms === clip.duration_ms;
        const response = await read(object(clip.path), {
          headers: headers(true),
        });
        if (response.status !== 200) {
          out.results.push({
            name: "admin_clip",
            question: clip.question_key,
            http_status: response.status,
            state: "FAIL",
          });
          continue;
        }
        const bytes = await response.arrayBuffer();
        const prefix = new Uint8Array(bytes);
        const mp3Header =
          (prefix[0] === 73 && prefix[1] === 68 && prefix[2] === 51) ||
          (prefix[0] === 255 && (prefix[1] & 224) === 224);
        const hashMatches = (await digest(bytes)) === clip.sha256;
        const duration = await decodeMp3(bytes);
        const durationMatches =
          Number.isFinite(duration) &&
          Math.abs(duration * 1000 - clip.duration_ms) <= 200;
        const validMp3 =
          mp3Header &&
          response.headers.get("content-type")?.split(";")[0] ===
            "audio/mpeg" &&
          duration > 0;
        out.results.push({
          name: "admin_clip",
          question: clip.question_key,
          question_version_id: clip.question_version_id,
          http_status: response.status,
          hash_match: hashMatches,
          provenance_match: provenanceMatches,
          duration_match: durationMatches,
          valid_mp3: validMp3,
          state:
            hashMatches && provenanceMatches && durationMatches && validMp3
              ? "PASS"
              : "FAIL",
        });
      }
    }
    out.state = out.results.every((r) => r.state === "PASS") ? "PASS" : "FAIL";
  } catch (error) {
    out.state = "NOT_TESTED";
    out.reason = [
      "WRONG_ORIGIN",
      "AUTH_REQUIRED",
      "SESSION_OR_PROBE_REQUIRED",
      "APPROVED_PROFILE_REQUIRED",
      "CONTROLLED_STUDENT_REQUIRED",
      "BINDING_UNAVAILABLE",
    ].includes(error.message)
      ? error.message
      : "REQUEST_OR_DECODE_UNAVAILABLE";
  }
  return out;
}

export function buildHostedStorageConsole({ probePath, expectedStudentId }) {
  if (
    !/^[a-f0-9]{64}\.mp3$/.test(probePath) ||
    !/^[a-f0-9-]{36}$/.test(expectedStudentId)
  )
    throw Error("INVALID_PROBE");
  return `(async () => { try {
    const {getClient,getSession}=await import("/study/auth.mjs");
    const client=await getClient(), session=await getSession();
    const result=await (${runHostedStorageCheckpoint.toString()})({origin:location.origin,config:window.HNH_SUPABASE,client,session,probePath:${JSON.stringify(probePath)},expectedStudentId:${JSON.stringify(expectedStudentId)}});
    console.log("HSKK_CLIP_STORAGE_HTTP",JSON.stringify(result));
  } catch {console.log("HSKK_CLIP_STORAGE_HTTP",JSON.stringify({state:"NOT_TESTED",reason:"SESSION_UNAVAILABLE"}));} })();`;
}
