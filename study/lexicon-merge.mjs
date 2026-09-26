import { normalizePinyin } from "./core.mjs";

// Course definitions and examples keep their own provenance and stay primary.
export function enrichCourseEntry(course, imported) {
  if (!course) return imported;
  if (!imported) return course;
  const reading = imported.readings.find(
    (r) => normalizePinyin(r.pinyin) === normalizePinyin(course.pinyin),
  );
  return {
    ...course,
    traditional:
      course.traditional || reading?.traditional || imported.traditional,
    hanViet: course.hanViet || reading?.hanViet || null,
    hanVietSource: course.hanViet
      ? course.hanVietSource
      : imported.hanVietSource,
    supplementalReadings: imported.readings,
    lexiconProvenance: imported.provenance,
  };
}

export function enrichCharacter(course, imported) {
  if (!course) return imported;
  if (!imported) return course;
  const combined = { ...imported };
  for (const [key, value] of Object.entries(course)) {
    if (
      value !== null &&
      value !== undefined &&
      value !== "" &&
      (!Array.isArray(value) || value.length)
    )
      combined[key] = value;
  }
  combined.source = "course-and-open-lexicon";
  return combined;
}
