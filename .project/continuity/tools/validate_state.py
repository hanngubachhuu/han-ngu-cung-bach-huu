#!/usr/bin/env python3
"""Validate the Hán Ngữ Cùng Bách Hữu continuity state structure."""

from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]

REQUIRED = {
    "WORK_STATE.md": [
        "## Snapshot",
        "## Last verified success",
        "## Current unfinished state",
        "## Exact next action",
        "## Handoff",
        "## Resume checksum",
    ],
    "PROJECT_MEMORY.md": [
        "## Identity",
        "## Product direction",
        "## Not authoritative until reconciliation",
    ],
    "DECISION_LOG.md": ["# DECISION LOG"],
    "BUG_LOG.md": ["# BUG LOG"],
    "DATA_CONTRACT.md": ["# DATA CONTRACT", "## Access-state separation"],
    "RECONCILIATION_PLAN.md": ["# REPOSITORY RECONCILIATION PLAN", "## Definition of done"],
    "RECONCILIATION_REPORT.md": ["# REPOSITORY RECONCILIATION REPORT", "## 12. Exact next action"],
}

def main() -> int:
    errors = []
    for filename, markers in REQUIRED.items():
        path = ROOT / filename
        if not path.exists():
            errors.append(f"missing: {filename}")
            continue
        text = path.read_text(encoding="utf-8")
        for marker in markers:
            if marker not in text:
                errors.append(f"{filename}: missing marker {marker!r}")

    skill = ROOT.parent.parent / ".ai" / "skills" / "han-ngu-cung-bach-huu-continuity" / "SKILL.md"
    if not skill.exists():
        errors.append("missing project skill SKILL.md")

    if errors:
        print("FAIL")
        for error in errors:
            print("-", error)
        return 1

    print("PASS: Hán Ngữ Cùng Bách Hữu continuity structure is valid.")
    return 0

if __name__ == "__main__":
    sys.exit(main())
