// Compatibility route only; authoring always runs in the central workspace.
const params = new URLSearchParams(location.search);
params.set("section", "exams");
params.set("type", "HSKK");
if (!params.has("level")) params.set("level", "elementary");
location.replace("quan-tri.html?" + params);
