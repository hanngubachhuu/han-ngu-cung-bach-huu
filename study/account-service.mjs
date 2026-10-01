import { getClient, getSession } from "./auth.mjs";
let observation;
export async function observeAccount() {
  if (observation) return observation;
  observation = (async () => {
    const client = await getClient();
    let previousUser = null;
    client.auth.onAuthStateChange((event, session) => {
      // Supabase callbacks run under the auth lock; perform queries only after it is released.
      setTimeout(() => {
        const userId = session?.user.id || null;
        window.dispatchEvent(
          new CustomEvent("study:auth", {
            detail: { event, signedIn: !!session, userId, previousUser },
          }),
        );
        previousUser = userId;
      }, 0);
    });
    return client;
  })().catch((error) => {
    observation = null;
    throw error;
  });
  return observation;
}
export async function myProfile() {
  const session = await getSession();
  if (!session) return null;
  const c = await getClient();
  const { data, error } = await c
    .from("profiles")
    .select("*")
    .eq("user_id", session.user.id)
    .single();
  if (error) throw error;
  return data;
}
export async function saveProfile(profile, fields) {
  const c = await getClient();
  const { data, error } = await c.rpc("account_save_profile", {
    owner_id: profile.user_id,
    expected_version: profile.version,
    display_name: fields.full_name,
    contact_phone: fields.phone,
    goal: fields.learning_goal,
  });
  if (error) throw error;
  return data;
}
export async function learnerData() {
  const session = await getSession();
  if (!session) throw Error("AUTH_REQUIRED");
  const c = await getClient();
  const results = await Promise.all([
    c
      .from("enrollments")
      .select("course_id,active,access_mode,courses(*)")
      .eq("user_id", session.user.id)
      .eq("active", true),
    c
      .from("lesson_content")
      .select("id,level,lesson_no,title_zh,title_vi,course_id")
      .not("id", "like", "exam-%")
      .order("level")
      .order("lesson_no"),
    c
      .from("learning_attempts")
      .select("id,lesson_id,score,max_score,submitted_at,source")
      .eq("user_id", session.user.id)
      .eq("source", "self_reported")
      .order("submitted_at", { ascending: false })
      .limit(30),
  ]);
  for (const r of results) if (r.error) throw r.error;
  return {
    enrollments: results[0].data,
    lessons: results[1].data,
    attempts: results[2].data,
  };
}
export async function adminData({ search = "", status = "", page = 0 } = {}) {
  const c = await getClient();
  const profile = await myProfile();
  if (profile?.role !== "ADMIN" || profile.status !== "APPROVED")
    throw Error("ADMIN_REQUIRED");
  let query = c
    .from("profiles")
    .select("*", { count: "exact" })
    .eq("role", "STUDENT")
    .order("created_at", { ascending: false })
    .range(page * 20, page * 20 + 19);
  if (status) query = query.eq("status", status);
  if (search.trim())
    query = query.ilike(
      "full_name",
      "%" + search.trim().replace(/[%_]/g, "") + "%",
    );
  const result = await query;
  if (result.error) throw result.error;
  return result;
}
export async function adminStudent(userId) {
  const c = await getClient();
  const results = await Promise.all([
    c.from("enrollments").select("*").eq("user_id", userId),
    c
      .from("student_lesson_access")
      .select("lesson_id,active")
      .eq("user_id", userId),
    c.from("courses").select("*").order("level"),
    c
      .from("lesson_content")
      .select("id,course_id,lesson_no,title_vi")
      .not("id", "like", "exam-%")
      .order("level")
      .order("lesson_no"),
    c
      .from("learning_attempts")
      .select("lesson_id,score,max_score,submitted_at,source")
      .eq("user_id", userId)
      .eq("source", "self_reported")
      .order("submitted_at", { ascending: false })
      .limit(30),
    c
      .from("learning_attempts")
      .select("id,lesson_id,score,max_score,submitted_at,source")
      .eq("user_id", userId)
      .eq("source", "official")
      .order("submitted_at", { ascending: false })
      .limit(30),
  ]);
  for (const r of results) if (r.error) throw r.error;
  return {
    enrollments: results[0].data,
    access: results[1].data,
    courses: results[2].data,
    lessons: results[3].data,
    attempts: results[4].data,
    officialAttempts: results[5].data,
  };
}
export async function adminAction(
  target,
  action,
  resource = null,
  enabled = true,
) {
  const c = await getClient(),
    { error } = await c.rpc("account_admin_action", {
      target,
      action,
      resource,
      enabled,
    });
  if (error) throw error;
}
