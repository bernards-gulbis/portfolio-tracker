#!/usr/bin/env python3
"""PreToolUse: block reading/writing/grepping/shelling protected .env files.

Protected: api/.env, api/.env.<suffix>, web/.env, web/.env.<suffix>
Allowed:   *.env.example, *.env.sample, *.env.template (committed templates)
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
PROTECTED_DIRS = {"api", "web"}
ALLOWED_SUFFIXES = {"example", "sample", "template"}
FILE_PATH_TOOLS = {"Read", "Edit", "Write", "MultiEdit"}


def warn(msg: str) -> None:
    print(f"[block-env-access] {msg}", file=sys.stderr)


def is_protected_env_name(name: str) -> bool:
    """True if the filename is .env or .env.<non-template-suffix>."""
    if name == ".env":
        return True
    if not name.startswith(".env."):
        return False
    suffix = name.removeprefix(".env.")
    return suffix not in ALLOWED_SUFFIXES


def is_protected_rel(rel: Path) -> bool:
    parts = rel.parts
    if len(parts) < 2:
        return False
    if parts[0] not in PROTECTED_DIRS:
        return False
    return is_protected_env_name(rel.name)


def resolve_to_rel(file_path: str, cwd: str | None) -> Path | None:
    p = Path(file_path)
    if not p.is_absolute():
        p = Path(cwd or PROJECT_ROOT) / p
    try:
        p = p.resolve()
    except OSError:
        return None
    try:
        return p.relative_to(PROJECT_ROOT)
    except ValueError:
        return None


def deny(rel_or_match: str, tool: str) -> int:
    print(
        f"Access to env file '{rel_or_match}' is blocked by the block-env-access hook "
        f"(tool: {tool}). This file likely contains secrets. If you need a value, "
        f"ask the user to provide it directly.",
        file=sys.stderr,
    )
    return 2


def check_file_path(payload: dict, tool: str) -> int:
    raw = (payload.get("tool_input") or {}).get("file_path")
    if not isinstance(raw, str):
        return 0
    rel = resolve_to_rel(raw, payload.get("cwd"))
    if rel is None:
        return 0
    if is_protected_rel(rel):
        return deny(rel.as_posix(), tool)
    return 0


# Match `.env` and `.env.<suffix>` tokens in a Bash command, regardless of
# directory prefix (catches `cd api && cat .env` etc.). Allowed suffixes
# (.example/.sample/.template) are filtered post-match.
ENV_TOKEN = re.compile(r"(?<![A-Za-z0-9_.])\.env(?:\.([A-Za-z0-9_-]+))?(?![A-Za-z0-9_-])")


def check_bash(payload: dict) -> int:
    cmd = (payload.get("tool_input") or {}).get("command")
    if not isinstance(cmd, str):
        return 0
    for m in ENV_TOKEN.finditer(cmd):
        suffix = m.group(1)
        if suffix in ALLOWED_SUFFIXES:
            continue
        return deny(m.group(0), "Bash")
    return 0


def main() -> int:
    try:
        payload = json.load(sys.stdin)
    except json.JSONDecodeError as e:
        warn(f"bad stdin: {e}")
        return 0

    tool = payload.get("tool_name")
    if tool in FILE_PATH_TOOLS:
        return check_file_path(payload, tool)
    if tool == "Bash":
        return check_bash(payload)
    return 0


if __name__ == "__main__":
    sys.exit(main())
