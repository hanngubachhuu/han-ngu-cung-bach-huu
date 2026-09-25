import { getClient, getSession } from "./auth.mjs";
const KEY = "hnh_study_v1";
function read() {
  try {
    const x = JSON.parse(localStorage.getItem(KEY) || "{}");
    return {
      words: Array.isArray(x.words)
        ? x.words.filter((x) => typeof x === "string")
        : [],
      characters: Array.isArray(x.characters)
        ? x.characters.filter(
            (c) => typeof c === "string" && /^\p{Script=Han}$/u.test(c),
          )
        : [],
      entries: x.entries && typeof x.entries === "object" ? x.entries : {},
      readings: Array.isArray(x.readings)
        ? x.readings.filter(
            (x) =>
              x && typeof x.id === "string" && typeof x.sourceText === "string",
          )
        : [],
    };
  } catch {
    return { words: [], characters: [], entries: {}, readings: [] };
  }
}
function write(value) {
  try {
    localStorage.setItem(KEY, JSON.stringify(value));
  } catch {
    throw Error(
      "Trình duyệt không thể lưu. Hãy đăng nhập để lưu trên tài khoản.",
    );
  }
}
export async function savedWords() {
  return wordIds(await getSession());
}
async function wordIds(session) {
  if (!session) return read().words;
  const c = await getClient();
  const { data, error } = await c
    .from("study_saved_words")
    .select("entry_id")
    .eq("user_id", session.user.id);
  if (error) throw Error("Không tải được sổ từ trên tài khoản.");
  return data.map((x) => x.entry_id);
}
export async function savedWordEntries() {
  const session = await getSession();
  if (!session)
    return Object.values(read().entries).filter(
      (e) => e && typeof e.simplified === "string",
    );
  const c = await getClient();
  const { data, error } = await c.from("study_saved_words").select("entry");
  if (error) throw Error("Chưa tải được sổ từ.");
  return data.map((x) => x.entry).filter(Boolean);
}
export async function toggleWord(id, entry = null) {
  const session = await getSession(),
    ids = await wordIds(session),
    has = ids.includes(id);
  if (session) {
    const c = await getClient();
    const result = has
      ? await c
          .from("study_saved_words")
          .delete()
          .eq("user_id", session.user.id)
          .eq("entry_id", id)
      : await c
          .from("study_saved_words")
          .upsert(
            { user_id: session.user.id, entry_id: id, entry },
            { onConflict: "user_id,entry_id" },
          );
    if (result.error) throw Error("Chưa lưu được từ. Hãy thử lại.");
  } else {
    const data = read();
    data.words = has ? ids.filter((x) => x !== id) : [...ids, id];
    if (has) delete data.entries[id];
    else if (entry) data.entries[id] = entry;
    write(data);
  }
  window.dispatchEvent(new Event("study:saved"));
  return !has;
}
export async function saveReading(reading) {
  const row = {
    id: reading.id || crypto.randomUUID(),
    title: (reading.title || reading.sourceText.slice(0, 30)).slice(0, 150),
    sourceText: reading.sourceText,
    result: reading.result || null,
    updatedAt: new Date().toISOString(),
  };
  const session = await getSession();
  if (session) {
    const c = await getClient();
    const { error } = await c.from("study_readings").upsert({
      id: row.id,
      user_id: session.user.id,
      title: row.title,
      source_text: row.sourceText,
      result: row.result,
      updated_at: row.updatedAt,
    });
    if (error) throw Error("Chưa lưu được bài đọc. Hãy thử lại.");
  } else {
    const data = read();
    data.readings = [
      row,
      ...data.readings.filter((x) => x.id !== row.id),
    ].slice(0, 30);
    write(data);
  }
  return row;
}
export async function savedReadings() {
  const session = await getSession();
  if (!session) return read().readings;
  const c = await getClient();
  const { data, error } = await c
    .from("study_readings")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(50);
  if (error) throw Error("Không tải được bài đã lưu.");
  return data.map((x) => ({
    id: x.id,
    title: x.title,
    sourceText: x.source_text,
    result: x.result,
    updatedAt: x.updated_at,
  }));
}
export async function deleteReading(id) {
  const session = await getSession();
  if (session) {
    const c = await getClient();
    const { error } = await c
      .from("study_readings")
      .delete()
      .eq("id", id)
      .eq("user_id", session.user.id);
    if (error) throw Error("Chưa xóa được bài.");
  } else {
    const d = read();
    d.readings = d.readings.filter((r) => r.id !== id);
    write(d);
  }
}
export async function savedCharacters() {
  return characterIds(await getSession());
}
async function characterIds(session) {
  if (!session) return read().characters;
  const client = await getClient();
  const { data, error } = await client
    .from("study_saved_characters")
    .select("character")
    .eq("user_id", session.user.id);
  if (error) throw Error("Chưa tải được chữ đã lưu.");
  return data.map((row) => row.character);
}
export async function toggleCharacter(character) {
  if (!/^\p{Script=Han}$/u.test(character))
    throw Error("Chọn một chữ Hán để lưu.");
  const session = await getSession(),
    ids = await characterIds(session),
    saved = ids.includes(character);
  if (session) {
    const client = await getClient();
    const result = saved
      ? await client
          .from("study_saved_characters")
          .delete()
          .eq("user_id", session.user.id)
          .eq("character", character)
      : await client
          .from("study_saved_characters")
          .upsert(
            { user_id: session.user.id, character },
            { onConflict: "user_id,character" },
          );
    if (result.error) throw Error("Chưa lưu được chữ. Hãy thử lại.");
  } else {
    const data = read();
    data.characters = saved
      ? ids.filter((c) => c !== character)
      : [...ids, character];
    write(data);
  }
  window.dispatchEvent(new Event("study:characters-saved"));
  return !saved;
}
