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
ZOTERO_SUBMODULES = {
    "translators/zotero": "esm",
    "sources/zotero-translate": "async-sandbox",
    "sources/zotero-utilities": "fix-import",
}

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
    for submodule, branch in ZOTERO_SUBMODULES.items():
        submodule_path = str(ROOT / submodule)
        run(["git", "-C", submodule_path, "fetch", "upstream", "master"])
        run(["git", "-C", submodule_path, "checkout", "master"])
        run(["git", "-C", submodule_path, "pull", "--ff-only", "upstream", "master"])
        run(["git", "-C", submodule_path, "push", "origin", "master"])
        run(["git", "-C", submodule_path, "checkout", branch])
        
    run(["git", "submodule", "update", "--remote", "--merge"])

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


def _parse_generated_export_specs(specs_text: str) -> list[str]:
    return [spec.strip() for spec in specs_text.split(",") if spec.strip()]


def _build_exports_body_from_specs(specs: list[str]) -> str:
    entries = []
    for spec in specs:
        if " as " in spec:
            local_name, export_name = [part.strip() for part in spec.split(" as ", 1)]
            entries.append(f"{export_name}: {local_name}")
        else:
            entries.append(spec)
    if not entries:
        return ""
    return " " + ", ".join(entries) + " "


def _extract_and_remove_exports_object(text: str) -> tuple[str, str | None, bool]:
    m = re.search(r"(?:export\s+)?(?:var|let|const)\s+exports\s*=\s*\{", text)
    if not m:
        return text, None, False

    declaration_start = m.start()
    open_brace_index = text.find("{", declaration_start)
    if open_brace_index == -1:
        return text, None, False

    i = open_brace_index
    depth = 0
    in_str = None
    esc = False
    close_brace_index = None
    while i < len(text):
        ch = text[i]
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
                    close_brace_index = i
                    break
        i += 1

    if close_brace_index is None:
        return text, None, False

    body = text[open_brace_index + 1 : close_brace_index]

    end = close_brace_index + 1
    if end < len(text) and text[end] == ";":
        end += 1

    return text[:declaration_start] + text[end:], body, True


def _remove_generated_export_blocks(text: str) -> tuple[str, list[str], str | None, bool]:
    generated_block_re = re.compile(
        r"\n?(?:(?:// Export translator compatibility exports for adapter\n)+"
        r"export\s+const\s+exports\s*=\s*\{([\s\S]*?)\};\n*)?"
        r"// Export translator functions as ES module bindings for adapter\n"
        r"export\s*\{([^}]*)\};\s*\Z",
        re.MULTILINE,
    )
    m = generated_block_re.search(text)
    if m:
        return text[:m.start()].rstrip(), _parse_generated_export_specs(m.group(2)), m.group(1), True

    compatibility_only_re = re.compile(
        r"\n?(?:// Export translator compatibility exports for adapter\n)+"
        r"export\s+const\s+exports\s*=\s*\{([\s\S]*?)\};\s*\Z",
        re.MULTILINE,
    )
    m = compatibility_only_re.search(text)
    if m:
        return text[:m.start()].rstrip(), [], m.group(1), True

    return text, [], None, False


def append_exports(text: str) -> tuple[str, bool]:
    original_text = text
    text, old_generated_specs, old_generated_exports_body, removed_generated_blocks = _remove_generated_export_blocks(text)
    text, exports_body, removed_exports_object = _extract_and_remove_exports_object(text)

    present = [fn for fn in TRANSLATOR_EXPORT_CANDIDATES if _is_function_defined(text, fn)]
    specs: list[str] = []
    seen_specs: set[str] = set()

    for fn in present:
        if fn not in seen_specs:
            seen_specs.add(fn)
            specs.append(fn)

    compatibility_exports_body = exports_body or old_generated_exports_body
    if compatibility_exports_body is None and old_generated_specs:
        extra_specs = [spec for spec in old_generated_specs if spec not in seen_specs]
        compatibility_exports_body = _build_exports_body_from_specs(extra_specs)

    snippets = []
    if compatibility_exports_body and compatibility_exports_body.strip():
        snippets.append(
            "\n// Export translator compatibility exports for adapter\n"
            + "export const exports = {"
            + compatibility_exports_body
            + "};\n"
        )

    if specs:
        export_line = f"export {{ {', '.join(specs)} }};"
        snippets.append(
            "\n// Export translator functions as ES module bindings for adapter\n"
            + export_line
            + "\n"
        )

    if not snippets:
        return text, text != original_text

    candidate = text.rstrip() + "".join(snippets)
    if candidate == original_text or candidate + "\n" == original_text:
        return original_text, False

    return candidate, True


def ensure_sandbox_import(text: str) -> tuple[str, bool]:
    import_re = re.compile(
        r"^\s*import\s*\{\s*([^}]*)\}\s*from\s*[\"'].*sandbox\.js[\"'];?\s*$",
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
        manifest_path.write_text(json.dumps(out, indent=2) + "\n", encoding="utf-8")
        print("Wrote manifest to", manifest_path)
    except Exception as e:
        print("Failed to write manifest:", e)

def main():
    try:
        ensure_repo()
    except Exception as e:
        print("Error ensuring repo:", e)
        sys.exit(1)

    patch_all()
    generate_manifest()


if __name__ == "__main__":
    main()
