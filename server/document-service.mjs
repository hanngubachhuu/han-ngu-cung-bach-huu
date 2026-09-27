import { createClient } from "@supabase/supabase-js";
import { googleAdapter, googleConfigured } from "./google-docs-adapter.mjs";
import { profileFields, planSync } from "./document-sync.mjs";
export async function documentContext(token, env = process.env) {
  const c = createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: { Authorization: "Bearer " + token },
      fetch: (url, options = {}) =>
        fetch(url, { ...options, signal: AbortSignal.timeout(10000) }),
    },
  });
  const { data, error } = await c.auth.getUser(token);
  if (error || !data.user) throw Error("AUTH_REQUIRED");
  const profile = await c
    .from("profiles")
    .select("role,status")
    .eq("user_id", data.user.id)
    .single();
  if (
    profile.error ||
    profile.data.role !== "ADMIN" ||
    profile.data.status !== "APPROVED"
  )
    throw Error("ADMIN_REQUIRED");
  return c;
}
export async function runDocumentAction(
  c,
  action,
  body,
  { adapterFactory = googleAdapter, configured = googleConfigured() } = {},
) {
  if (action === "status") {
    if (!configured) return { configured: false, connected: false };
    // The factory refreshes OAuth and verifies the owner before exposing an adapter.
    await adapterFactory();
    return { configured: true, connected: true };
  }
  if (!configured) throw Error("GOOGLE_NOT_CONFIGURED");
  const rpc = async (command, payload) => {
    const { data, error } = await c.rpc("account_document_command", {
      command,
      payload,
    });
    if (error) throw error;
    return data;
  };
  const adapter = await adapterFactory();
  if (action === "create") {
    if (!/^[0-9a-f-]{36}$/i.test(body.studentId || ""))
      throw Error("INVALID_REQUEST");
    const { data: p, error } = await c
      .from("profiles")
      .select("user_id,version,full_name,phone,learning_goal")
      .eq("user_id", body.studentId)
      .single();
    if (error) throw error;
    const existing = await c
      .from("documents")
      .select("id")
      .eq("student_id", body.studentId)
      .maybeSingle();
    if (existing.error) throw existing.error;
    if (existing.data) throw Error("DOCUMENT_ALREADY_LINKED");
    const id = await adapter.create(p.user_id, profileFields(p)),
      remote = await adapter.read(id);
    try {
      return await rpc("bind", {
        student_id: p.user_id,
        profile_version: p.version,
        google_document_id: id,
        google_revision: remote.revision,
      });
    } catch {
      const error = Error("DOCUMENT_CREATED_BIND_FAILED");
      error.documentId = id;
      throw error;
    }
  }
  if (
    !["preview", "sync"].includes(action) ||
    !/^[0-9a-f-]{36}$/i.test(body.documentId || "")
  )
    throw Error("INVALID_REQUEST");
  const { data: d, error } = await c
    .from("documents")
    .select("*")
    .eq("id", body.documentId)
    .single();
  if (error) throw error;
  const result = await c
    .from("profiles")
    .select("user_id,version,full_name,phone,learning_goal")
    .eq("user_id", d.student_id)
    .single();
  if (result.error) throw result.error;
  const p = result.data,
    remote = await adapter.read(d.google_document_id);
  const plan = planSync(
    d.base_fields,
    profileFields(p),
    remote.fields,
    action === "sync" ? body.resolutions || {} : {},
  );
  const versions = {
    profileVersion: p.version,
    syncVersion: d.sync_version,
    googleRevision: remote.revision,
  };
  if (action === "preview") {
    if (plan.conflicts.length) await rpc("conflict", { document_id: d.id });
    return {
      ...plan,
      ...versions,
      website: profileFields(p),
      google: remote.fields,
    };
  }
  if (
    body.profileVersion !== p.version ||
    body.syncVersion !== d.sync_version ||
    body.googleRevision !== remote.revision
  )
    throw Error("VERSION_CONFLICT");
  if (plan.conflicts.length) throw Error("UNRESOLVED_CONFLICT");
  const { operation_id } = await rpc("start", {
    document_id: d.id,
    profile_version: p.version,
    sync_version: d.sync_version,
  });
  try {
    const revision = await adapter.write(
      d.google_document_id,
      remote,
      plan.fields,
    );
    await rpc("complete", {
      document_id: d.id,
      operation_id,
      profile_version: p.version,
      fields: plan.fields,
      google_revision: revision,
    });
    return { ok: true, fields: plan.fields };
  } catch (error) {
    await rpc("fail", {
      document_id: d.id,
      operation_id,
      error_code:
        error.code === "40001"
          ? "VERSION_CONFLICT_AFTER_GOOGLE_WRITE"
          : "SYNC_INCOMPLETE",
    }).catch(() => {});
    throw Error("SYNC_INCOMPLETE_REVIEW_REQUIRED");
  }
}
