// Shared display URL validation. Private authoring blobs are never learner media.
export function safeMedia(value) {
  return !value || (/^(https:\/\/[^\s<>]+|(?:\.\/)?[A-Za-z0-9_-][^:<>]*)$/u.test(value) && !value.includes("\\"));
}
