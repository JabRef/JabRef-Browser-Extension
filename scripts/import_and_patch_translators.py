#!/usr/bin/env python3
"""
Clone or add Zotero translators as a submodule under translators/zotero
and patch each .js file to ensure the initial JSON is commented and
append ES module exports for legacy translators.

Usage: python3 scripts/import_and_patch_translators.py
"""

import json
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TARGET = ROOT / "translators" / "zotero"
ZOTERO_REPO = "https://github.com/zotero/translators"


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
    # Ensure translators dir exists
    (ROOT / "translators").mkdir(parents=True, exist_ok=True)

    if TARGET.exists() and (TARGET / ".git").exists():
        print("Found existing git repo at", TARGET)
        print("Updating...")
        run(["git", "-C", str(TARGET), "pull", "--ff-only"])
        return

    # Try to add as submodule if current repo is a git repo
    if (ROOT / ".git").exists():
        try:
            run(["git", "submodule", "add", ZOTERO_REPO, str(TARGET)])
            print("Added submodule at", TARGET)
            return
        except subprocess.CalledProcessError:
            print("git submodule add failed, falling back to clone")

    # Fallback to clone
    if TARGET.exists():
        print("Removing existing target and recloning")
        for child in TARGET.iterdir():
            try:
                if child.is_file():
                    child.unlink()
                else:
                    # naive rmdir
                    import shutil

                    shutil.rmtree(child)
            except Exception:
                pass
    run(["git", "clone", ZOTERO_REPO, str(TARGET)])


def comment_initial_json(text: str) -> tuple[str, bool]:
    # If file already starts with // or /*, assume header is commented
    s = text.lstrip()
    prefix_ws = text[: len(text) - len(s)]
    if s.startswith("//") or s.startswith("/*"):
        return text, False

    # If it starts with '{', try to find the matching closing brace
    if not s.startswith("{"):
        return text, False

    i = 0
    depth = 0
    in_str = None
    esc = False
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
    else:
        return text, False

    header = s[: end + 1]
    # Heuristic: check for translator-specific keys
    if "translatorID" in header or "label" in header:
        # Use line comments (//) for the header to avoid issues with nested comment blocks
        header_lines = header.splitlines()
        commented_lines = []
        for ln in header_lines:
            # preserve existing indentation for the first line
            commented_lines.append(prefix_ws + "// " + ln)
        commented = "\n".join(commented_lines) + "\n\n" + s[end + 1 :]
        return commented, True

    return text, False


def append_exports(text: str) -> tuple[str, bool]:
    export_snippet = "\n// Export legacy translator functions as ES module bindings for adapter\nexport { detectWeb, doWeb };\n"
    if "export { detectWeb, doWeb }" in text:
        return text, False
    return text.rstrip() + export_snippet, True


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


def process_file(path: Path) -> tuple[bool, bool]:
    changed = False
    commented = False
    appended = False

    text = path.read_text(encoding="utf-8")
    new_text, did_comment = comment_initial_json(text)
    if did_comment:
        commented = True
        changed = True

    # new_text2, did_append = append_exports(new_text)
    # if did_append:
    #     appended = True
    #     changed = True
    new_text2 = new_text

    if changed:
        # backup original
        # bak = path.with_suffix(path.suffix + '.bak')
        # try:
        #     if not bak.exists():
        #         bak.write_text(text, encoding='utf-8')
        # except Exception:
        #     pass
        path.write_text(new_text2, encoding="utf-8")

    return commented, appended


def patch_all():
    js_files = [f for f in TARGET.rglob("*.js") if not should_ignore(f)]
    if not js_files:
        print("No .js files found under", TARGET)
        return

    total = 0
    commented_count = 0
    appended_count = 0
    for f in js_files:
        total += 1
        try:
            c, a = process_file(f)
            if c:
                commented_count += 1
            if a:
                appended_count += 1
        except Exception as e:
            print("Error processing", f, e)

    print(
        f"Processed {total} files: commented {commented_count}, appended exports {appended_count}"
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

        header = None
        import re

        # 2) Try to parse a sequence of leading line comments // ... at the top of file
        lines = txt.splitlines()
        collected = []
        started = False
        for line in lines:
            if re.match(r"^\s*//", line):
                started = True
                collected.append(re.sub(r"^\s*//\s?", "", line))
            else:
                if started:
                    break
                if re.match(r"^\s*$", line):
                    continue
                break
        if collected:
            cleaned = "\n".join(collected)
            header = extract_json_from_text(cleaned) or None

        rel = f.relative_to(ROOT).as_posix()
        entry = {"path": rel, "label": f.stem, "type": "zotero-legacy"}
        if header:
            if "label" in header:
                entry["label"] = header.get("label")
            if "translatorID" in header:
                entry["translatorID"] = header.get("translatorID")
            if "target" in header:
                entry["target"] = header.get("target")
            if "translatorType" in header:
                entry["translatorType"] = header.get("translatorType")

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
