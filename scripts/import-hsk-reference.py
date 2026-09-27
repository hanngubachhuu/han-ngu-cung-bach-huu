"""Pin only HSK 2.0 level metadata from the MIT upstream (no translations)."""
import hashlib
import json
from pathlib import Path
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
repository = "drkameleon/complete-hsk-vocabulary"
sha = json.load(urllib.request.urlopen(f"https://api.github.com/repos/{repository}/commits/main"))["sha"]
base = f"https://raw.githubusercontent.com/{repository}/{sha}/"
blob = urllib.request.urlopen(base + "complete.json").read()
data = json.loads(blob)
rows = []
for item in data:
    levels = [int(level[4:]) for level in item["level"] if level.startswith("old-")]
    if levels:
        rows.append({"simplified": item["simplified"], "level": min(levels), "pinyin": item["forms"][0]["transcriptions"]["pinyin"]})
out = ROOT / "sources/hsk"
out.mkdir(exist_ok=True)
payload = {"schema": 1, "framework": "HSK 2.0", "source": {"name": "Complete HSK Vocabulary", "url": f"https://github.com/{repository}", "version": sha, "sha256": hashlib.sha256(blob).hexdigest(), "license": "MIT", "scope": "Old HSK metadata only; not the 2021 standard or 2025 exam syllabus"}, "entries": rows}
(out / "hsk20-reference.json").write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
(out / "LICENSE.txt").write_bytes(urllib.request.urlopen(base + "LICENSE").read())
print(json.dumps({"version": sha, "counts": {i: sum(r["level"] == i for r in rows) for i in range(1, 7)}}))
