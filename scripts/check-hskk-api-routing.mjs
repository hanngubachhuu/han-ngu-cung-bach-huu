// Read-only hosted smoke test. JWTs are read only from environment, never logged.
import fs from "node:fs/promises";
import path from "node:path";

const args = process.argv.slice(2);
function option(name, fallback) {
  const i = args.indexOf(name);
  return i < 0 ? fallback : args[i + 1];
}
const hosts = {
  preview: option("--preview"),
  production: option("--production", "https://hanngubachhuu.vercel.app"),
};
if (!hosts.preview)
  throw Error("Provide --preview https://<deployment>.vercel.app");
for (const value of Object.values(hosts)) {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    !url.hostname.endsWith(".vercel.app") ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/"
  )
    throw Error("Use a bare HTTPS Vercel deployment origin");
}

async function probe(origin, label, query, token, method = "GET") {
  const url = new URL("/api/hskk-exams", origin);
  url.search = query;
  try {
    const response = await fetch(url, {
      method,
      redirect: "manual",
      headers: token ? { Authorization: "Bearer " + token } : {},
      signal: AbortSignal.timeout(30000),
    });
    const contentType = response.headers.get("content-type") || "";
    const text = await response.text();
    let body;
    if (contentType.includes("application/json")) {
      try {
        body = JSON.parse(text);
      } catch {
        /* Mark non-JSON below. */
      }
    }
    const location = response.headers.get("location");
    const hostAuthRedirect =
      response.status >= 300 &&
      response.status < 400 &&
      location &&
      new URL(location, origin).hostname.endsWith("vercel.com");
    const expectedStatus = label.startsWith("admin")
      ? 200
      : label === "student_status"
        ? 403
        : 401;
    const expectedError =
      label === "student_status" ? "ADMIN_REQUIRED" : "AUTH_REQUIRED";
    let passed = response.status === expectedStatus && body !== undefined;
    if (expectedStatus !== 200) passed &&= body?.error === expectedError;
    else if (label === "admin_status")
      passed &&=
        body?.local_segmentation_enabled === true &&
        body?.external_ai_enabled === false;
    else if (label === "admin_catalog")
      passed &&=
        Array.isArray(body) && body.some((exam) => exam.code === "H71002");
    else if (label === "admin_exam") passed &&= body?.exam_code === "H71002";
    return {
      label,
      method,
      path: url.pathname + url.search,
      http_status: response.status,
      category: hostAuthRedirect
        ? "HOST_AUTH_REDIRECT"
        : body?.error ||
          (body !== undefined
            ? "JSON"
            : response.headers.get("x-vercel-error") || "NON_JSON"),
      content_type: contentType,
      cache_control: response.headers.get("cache-control"),
      state: hostAuthRedirect ? "NOT_TESTED" : passed ? "PASS" : "FAIL",
      ...(label === "admin_status" && passed
        ? { local_segmentation_enabled: true, external_ai_enabled: false }
        : {}),
    };
  } catch (error) {
    return {
      label,
      method,
      path: url.pathname + url.search,
      http_status: null,
      category: error.name,
      state: "FAIL",
    };
  }
}

const results = {};
for (const [environment, origin] of Object.entries(hosts)) {
  const probes = await Promise.all([
    probe(origin, "anonymous_status", "exam=H71002&action=status"),
    probe(origin, "anonymous_post", "exam=H71002&action=status", null, "POST"),
    probe(origin, "anonymous_exam", "exam=H71002"),
    probe(origin, "anonymous_source", "exam=H71002&action=source"),
    probe(origin, "invalid_token", "exam=H71002&action=status", "invalid"),
    ...(process.env.HSKK_STUDENT_JWT
      ? [
          probe(
            origin,
            "student_status",
            "exam=H71002&action=status",
            process.env.HSKK_STUDENT_JWT,
          ),
        ]
      : []),
    ...(process.env.HSKK_ADMIN_JWT
      ? [
          probe(
            origin,
            "admin_status",
            "exam=H71002&action=status",
            process.env.HSKK_ADMIN_JWT,
          ),
          probe(
            origin,
            "admin_catalog",
            "action=catalog",
            process.env.HSKK_ADMIN_JWT,
          ),
          probe(
            origin,
            "admin_exam",
            "exam=H71002",
            process.env.HSKK_ADMIN_JWT,
          ),
        ]
      : []),
  ]);
  results[environment] = {
    origin,
    route: probes[0].state,
    authoring_verified:
      Boolean(process.env.HSKK_ADMIN_JWT) &&
      probes
        .filter((p) => p.label.startsWith("admin"))
        .every((p) => p.state === "PASS"),
    probes,
    not_tested: [
      ...(!process.env.HSKK_STUDENT_JWT ? ["real_student_JWT"] : []),
      ...(!process.env.HSKK_ADMIN_JWT
        ? ["real_Admin_JWT_status_catalog_exam"]
        : []),
    ],
  };
}
const report = {
  checked_at: new Date().toISOString(),
  evidence: "HOSTED HTTP; no upload, segmentation, confirmation or publication",
  results,
};
const directory = path.resolve("test-results/hskk");
await fs.mkdir(directory, { recursive: true });
await fs.writeFile(
  path.join(directory, "api-routing.json"),
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report, null, 2));
if (
  Object.values(results).some((result) =>
    result.probes.some((probe) => probe.state === "FAIL"),
  )
)
  process.exitCode = 1;
