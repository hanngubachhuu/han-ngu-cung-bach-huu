import test from "node:test";
import assert from "node:assert/strict";
import { preparePrivateLesson } from "../study/private-lesson-data.mjs";

test("private native lessons accept flat DB and wrapped authoring shapes without losing questions", () => {
  const content = { exercises: { all: [{ id: "q1", section: "listening" }] } };
  const exerciseSections = [{ id: "listening", title: "Nghe", skill: "nghe" }];
  for (const payload of [
    { ...content, exerciseSections },
    { content, exerciseSections },
  ]) {
    const lesson = preparePrivateLesson({ id: "hsk1_bai5", content: payload });
    assert.equal(
      lesson.exerciseSections.flatMap((s) =>
        lesson.content.exercises.all.filter((q) => q.section === s.id),
      ).length,
      1,
    );
  }
});

test("private lessons fail closed for missing, duplicate or incomplete section mappings", () => {
  const content = { exercises: { all: [{ id: "q1", section: "listening" }] } };
  for (const exerciseSections of [
    undefined,
    [],
    [{ id: "writing" }],
    [{ id: "listening" }, { id: "listening" }],
  ]) {
    assert.throws(
      () =>
        preparePrivateLesson({
          id: "hsk1_bai5",
          content: { ...content, exerciseSections },
        }),
      /PRIVATE_LESSON_STRUCTURE_INVALID/,
    );
  }
});
