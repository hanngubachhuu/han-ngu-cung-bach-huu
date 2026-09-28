// Accept both the original flat DB payload and the wrapped authoring payload.
export function preparePrivateLesson(data, engine) {
  const payload = data.content;
  const lesson = {
    id: data.id,
    content: payload?.content || payload,
    exerciseSections: payload?.exerciseSections || [],
  };
  if (engine !== "legacy") {
    const sections = lesson.exerciseSections;
    const questions = lesson.content?.exercises?.all;
    const ids = new Set(sections.map((section) => section.id));
    if (
      !sections.length ||
      ids.size !== sections.length ||
      !questions?.length ||
      questions.some((question) => !ids.has(question.section))
    )
      throw Error("PRIVATE_LESSON_STRUCTURE_INVALID");
  }
  return lesson;
}
