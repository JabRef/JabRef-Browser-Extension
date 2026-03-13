#!/usr/bin/env python3
"""
Clone or add Zotero translators as a submodule under translators/zotero
and patch each .js file to ensure the initial JSON is commented and
append ES module exports.

Usage: python3 scripts/import_and_patch_translators.py
"""

import json
import re
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TARGET = ROOT / "translators" / "zotero"
ZOTERO_REPO = "https://github.com/zotero/translators"

SANDBOX_PATH = "../../sources/sandbox.js"
REQUIRED_SANDBOX_IMPORTS = [
    "ZU",
    "Zotero",
    "Z",
    "text",
    "requestJSON",
    "requestText",
    "attr",
]
FW_LINE_PREFIX = "/* FW LINE 59:b820c6d */"
TRANSLATOR_EXPORT_CANDIDATES = [
    "detectWeb",
    "doWeb",
    "detectImport",
    "doImport",
    "detectSearch",
    "doSearch",
    "doExport",
]


def should_ignore(path: Path) -> bool:
    name = path.name
    # Ignore dotfiles and any path component starting with a dot (e.g., .ci/)
    for part in path.parts:
        if part.startswith("."):
            return True
    if name in ("jsconfig.json", "AGENTS.md"):
        return True
    return False


def run(cmd, **kwargs):
    print(">", " ".join(cmd))
    return subprocess.run(cmd, check=True, **kwargs)


def ensure_repo():
    run(["git", "submodule", "update", "--init"])


def export_translator_info(text: str) -> tuple[str, bool]:
    # Keep idempotent if already prefixed
    if re.match(r"^\s*export\s+const\s+ZOTERO_TRANSLATOR_INFO\s*=", text):
        return text, False

    # If it starts with '{', convert that leading object to an exported declaration
    s = text.lstrip()
    prefix_ws = text[: len(text) - len(s)]
    if not s.startswith("{"):
        return text, False

    text = prefix_ws + "export const ZOTERO_TRANSLATOR_INFO = " + s
    return text, True


def _is_function_defined(text: str, fn_name: str) -> bool:
    patterns = [
        rf"(^|\n)\s*(?:async\s+)?function\s+{re.escape(fn_name)}\s*\(",
        rf"(^|\n)\s*(?:var|let|const)\s+{re.escape(fn_name)}\s*=\s*(?:async\s+)?function\b",
        rf"(^|\n)\s*(?:var|let|const)\s+{re.escape(fn_name)}\s*=\s*(?:async\s+)?\([^)]*\)\s*=>",
        rf"(^|\n)\s*{re.escape(fn_name)}\s*=\s*(?:async\s+)?function\b",
    ]
    return any(re.search(pattern, text) for pattern in patterns)


def append_exports(text: str) -> tuple[str, bool]:
    present = [fn for fn in TRANSLATOR_EXPORT_CANDIDATES if _is_function_defined(text, fn)]
    if not present:
        return text, False

    export_line = f"export {{ {', '.join(present)} }};"
    export_snippet = (
        "\n// Export translator functions as ES module bindings for adapter\n"
        + export_line
        + "\n"
    )

    # Remove a previously generated metadata+functions trailing block
    generated_metadata_block_re = re.compile(
        r"\n?// Export translator metadata for sandbox adapter\n"
        r"export\s+const\s+ZOTERO_TRANSLATOR_INFO\s*=\s*[^\n]*;\n"
        r"(?:// Export translator functions as ES module bindings for adapter\n"
        r"export\s*\{[^}]*\};\n)?\s*\Z",
        re.MULTILINE,
    )
    text_without_generated = generated_metadata_block_re.sub("", text)

    # Backward compatibility: remove old generated function-only trailing block
    generated_block_re = re.compile(
        r"\n?// Export translator functions as ES module bindings for adapter\n"
        r"export\s*\{[^}]*\};\s*\Z",
        re.MULTILINE,
    )
    new_text = generated_block_re.sub("", text_without_generated).rstrip()

    candidate = new_text + export_snippet
    if candidate == text or candidate + "\n" == text:
        return text, False

    return candidate, True


def ensure_sandbox_import(text: str) -> tuple[str, bool]:
    import_re = re.compile(
        r"^\s*import\s*\{\s*([^}]*)\}\s*from\s*[\"']\.\./\.\./sources/sandbox\.js[\"'];?\s*$",
        re.MULTILINE,
    )
    match = import_re.search(text)

    if match:
        new_line = f'import {{ {", ".join(REQUIRED_SANDBOX_IMPORTS)} }} from "{SANDBOX_PATH}";'
        old_line = match.group(0)
        if old_line.strip() == new_line:
            return text, False
        return text.replace(old_line, new_line), True

    import_line = (
        f'import {{ {", ".join(REQUIRED_SANDBOX_IMPORTS)} }} from "{SANDBOX_PATH}";\n\n'
    )

    return import_line + text, True


def has_fw_line(text: str) -> bool:
    return any(line.lstrip().startswith(FW_LINE_PREFIX) for line in text.splitlines())


def extract_json_from_text(text: str):
    """
    Try to parse JSON from the provided text. First attempt a direct json.loads,
    otherwise try to locate a balanced {...} substring and parse that.
    Returns the parsed object on success, or None on failure.
    """
    try:
        return json.loads(text)
    except Exception:
        s = text.strip()
        if not s:
            return None
        start = s.find("{")
        if start == -1:
            return None

        i = start
        depth = 0
        in_str = None
        esc = False
        end = None
        while i < len(s):
            ch = s[i]
            if in_str:
                if esc:
                    esc = False
                elif ch == "\\":
                    esc = True
                elif ch == in_str:
                    in_str = None
            else:
                if ch == '"' or ch == "'":
                    in_str = ch
                elif ch == "{":
                    depth += 1
                elif ch == "}":
                    depth -= 1
                    if depth == 0:
                        end = i
                        break
            i += 1

        if end is None:
            return None

        try:
            return json.loads(s[start : end + 1])
        except Exception:
            return None


def extract_declared_translator_info(text: str):
    m = re.search(
        r"(?:export\s+)?(?:const|let|var)\s+ZOTERO_TRANSLATOR_INFO\s*=\s*",
        text,
    )
    if not m:
        return None
    return extract_json_from_text(text[m.end() :])


def process_file(path: Path) -> tuple[bool, bool, bool, bool]:
    commented = False
    imported = False
    exported = False

    text = path.read_text(encoding="utf-8")

    # Delete old translators that still use the deprecated "Zotero Framework"
    # These are not valid esm, and are deprecated anyway: https://github.com/zotero/translators/issues/3105
    if has_fw_line(text):
        path.unlink()
        return commented, imported, exported, True

    text, commented = export_translator_info(text)
    text, imported = ensure_sandbox_import(text)
    text, exported = append_exports(text)

    if commented or imported or exported:
        path.write_text(text, encoding="utf-8")

    return commented, imported, exported, False


def patch_all():
    js_files = [f for f in TARGET.rglob("*.js") if not should_ignore(f)]
    if not js_files:
        print("No .js files found under", TARGET)
        return

    total = 0
    commented_count = 0
    imported_count = 0
    exported_count = 0
    deleted_count = 0
    for f in js_files:
        total += 1
        try:
            commented, imported, exported, deleted = process_file(f)
            if commented:
                commented_count += 1
            if imported:
                imported_count += 1
            if exported:
                exported_count += 1
            if deleted:
                deleted_count += 1
        except Exception as e:
            print("Error processing", f, e)

    print(
        f"Processed {total} files: deleted {deleted_count}, commented {commented_count}, sandbox imports updated {imported_count}, exports updated {exported_count}"
    )


def generate_manifest():
    """Scan translators in TARGET and generate translators/manifest.json
    by extracting the leading commented JSON header from each .js file.
    """
    out = []
    for f in sorted(TARGET.rglob("*.js")):
        if should_ignore(f):
            continue
        try:
            txt = f.read_text(encoding="utf-8")
        except Exception:
            continue

        header = extract_declared_translator_info(txt) or None

        rel = f.relative_to(ROOT).as_posix()
        entry = {
            "path": rel,
            "label": f.stem,
        }
        if header:
            if "label" in header:
                entry["label"] = header.get("label")
            if "translatorID" in header:
                entry["translatorID"] = header.get("translatorID")
            if "target" in header:
                entry["target"] = header.get("target")
            if "browserSupport" in header:
                entry["browserSupport"] = header.get("browserSupport")
            if "translatorType" in header:
                entry["translatorType"] = header.get("translatorType")
            if "creator" in header:
                entry["creator"] = header.get("creator")
            if "priority" in header:
                entry["priority"] = header.get("priority")
            if "lastUpdated" in header:
                entry["lastUpdated"] = header.get("lastUpdated")
            if "minVersion" in header and header.get("minVersion") is not None:
                entry["minVersion"] = header.get("minVersion")
            if "maxVersion" in header and header.get("maxVersion") is not None:
                entry["maxVersion"] = header.get("maxVersion")

        out.append(entry)

    manifest_path = ROOT / "translators" / "manifest.json"
    try:
        manifest_path.write_text(json.dumps(out, indent=2), encoding="utf-8")
        print("Wrote manifest to", manifest_path)
    except Exception as e:
        print("Failed to write manifest:", e)


def delete_ignored():
    """Delete files and directories that should be ignored under TARGET.
    Removes dot-directories and specific files like `jsconfig.json` and `AGENTS.md`.
    """
    for p in sorted(TARGET.rglob("*")):
        try:
            if should_ignore(p):
                if p.is_dir():
                    print("Removing directory", p)
                    shutil.rmtree(p)
                elif p.is_file():
                    print("Removing file", p)
                    p.unlink()
        except Exception as e:
            print("Failed to remove", p, e)


def main():
    try:
        ensure_repo()
    except Exception as e:
        print("Error ensuring repo:", e)
        sys.exit(1)

    # Remove ignored files/directories before patching and manifest generation
    try:
        delete_ignored()
    except Exception as e:
        print("delete_ignored failed:", e)

    patch_all()
    generate_manifest()


if __name__ == "__main__":
    main()
