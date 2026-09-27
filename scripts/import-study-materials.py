"""Extract supplied workbook without altering it; keep row provenance and audit issues."""
import argparse
import collections
import hashlib
import json
from pathlib import Path
import re
import unicodedata
import openpyxl

parser = argparse.ArgumentParser()
parser.add_argument("directory", type=Path)
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
workbook = next(args.directory.glob("*.xlsx"))
book = openpyxl.load_workbook(workbook, read_only=True, data_only=True)
entries, issues, sheets = [], [], {}
clean = lambda value: unicodedata.normalize("NFC", str(value or "").strip())
for sheet in book:
    match = re.fullmatch(r"HSK([1-6])", sheet.title)
    if not match:
        continue
    level = int(match[1])
    count = 0
    for row_number, row in enumerate(sheet.iter_rows(min_row=2, max_col=7, values_only=True), 2):
        _, word, pinyin, meaning, chinese, example_pinyin, vietnamese = map(clean, row)
        if not word:
            continue
        count += 1
        ref = {"sheet": sheet.title, "row": row_number}
        if not re.fullmatch(r"[\u3400-\u9fff·]+", word):
            issues.append({**ref, "word": word, "issue": "non-standard-headword"})
        example = None
        if chinese and word in chinese and vietnamese and example_pinyin:
            example = {"chinese": chinese, "pinyin": example_pinyin, "vietnamese": vietnamese, "quality": "unreviewed-reference"}
        elif chinese:
            issues.append({**ref, "word": word, "issue": "example-missing-headword-or-fields", "chinese": chinese})
        entries.append({"simplified": word, "pinyin": pinyin, "meaning": meaning, "level": level, "reference": ref, "example": example})
    sheets[sheet.title] = count
source = {"id": "local-hsk-workbook", "name": workbook.name, "sha256": hashlib.sha256(workbook.read_bytes()).hexdigest(), "framework": "HSK 2.0", "frameworkBasis": "Six-level list cross-checked against old HSK reference; workbook does not state a version.", "quality": "user-supplied-reference"}
out = root / "sources/study"
out.mkdir(exist_ok=True)
(out / "local-vocabulary.json").write_text(json.dumps({"schema": 1, "source": source, "sheets": sheets, "entries": entries}, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
inventory = []
for file in sorted(args.directory.iterdir()):
    if file.is_file():
        inventory.append({"name": file.name, "bytes": file.stat().st_size, "sha256": hashlib.sha256(file.read_bytes()).hexdigest(), "kind": file.suffix[1:], "status": "imported-reference" if file == workbook else "awaiting-content-review"})
(out / "materials-manifest.json").write_text(json.dumps({"schema": 1, "directory": args.directory.name, "files": inventory}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
(out / "import-audit.json").write_text(json.dumps({"sheets": sheets, "rows": len(entries), "uniqueWords": len(set(e["simplified"] for e in entries)), "issues": issues}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(json.dumps({"sheets": sheets, "rows": len(entries), "issues": len(issues)}))
