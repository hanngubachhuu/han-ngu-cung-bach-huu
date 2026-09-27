export const EDITABLE_FIELDS = Object.freeze({
  full_name: 120,
  phone: 30,
  learning_goal: 1000,
});
export const START = "[HNH_PROFILE_BEGIN]",
  END = "[HNH_PROFILE_END]";
export function profileFields(profile) {
  return Object.fromEntries(
    Object.keys(EDITABLE_FIELDS).map((k) => [k, profile[k] || ""]),
  );
}
export function validateFields(fields) {
  if (
    !fields ||
    typeof fields !== "object" ||
    Array.isArray(fields) ||
    Object.keys(fields).length !== 3
  )
    throw Error("INVALID_DOCUMENT_FIELDS");
  for (const [key, limit] of Object.entries(EDITABLE_FIELDS))
    if (typeof fields[key] !== "string" || fields[key].length > limit)
      throw Error("INVALID_DOCUMENT_FIELDS");
  if (Object.keys(fields).some((k) => !(k in EDITABLE_FIELDS)))
    throw Error("PROTECTED_DOCUMENT_FIELD");
  return fields;
}
export function documentBlock(fields) {
  return (
    START + "\n" + JSON.stringify(validateFields(fields), null, 2) + "\n" + END
  );
}
export function parseDocument(text) {
  if (text.split(START).length !== 2 || text.split(END).length !== 2)
    throw Error("DOCUMENT_MARKERS_INVALID");
  const start = text.indexOf(START),
    end = text.indexOf(END) + END.length;
  const fields = validateFields(
    JSON.parse(text.slice(start + START.length, end - END.length).trim()),
  );
  return { fields, block: text.slice(start, end) };
}
export function planSync(base, website, google, resolutions = {}) {
  validateFields(website);
  validateFields(google);
  const merged = {},
    conflicts = [];
  for (const key of Object.keys(EDITABLE_FIELDS)) {
    const w = website[key],
      g = google[key],
      b = base[key] ?? "";
    if (w === g) merged[key] = w;
    else if (w === b) merged[key] = g;
    else if (g === b) merged[key] = w;
    else if (resolutions[key] === "website") merged[key] = w;
    else if (resolutions[key] === "google") merged[key] = g;
    else conflicts.push({ field: key, website: w, google: g });
  }
  return { fields: merged, conflicts };
}
