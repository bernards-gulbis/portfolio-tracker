#!/usr/bin/env python3
"""PostToolUse: ruff for api/, eslint for web/. Exit 2 on residual errors."""
from __future__ import annotations

import json
import shutil
import subprocess
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
PY_EXCLUDE_PARTS = {".venv", "__pycache__"}
TS_EXCLUDE_PARTS = {"node_modules", "dist", "coverage", ".vite"}
TS_EXTS = {".ts", ".tsx", ".js", ".jsx"}
RUFF_TIMEOUT = 15
ESLINT_TIMEOUT = 45


def warn(msg: str) -> None:
    print(f"[format-on-edit] {msg}", file=sys.stderr)


def classify(rel: Path) -> str | None:
    parts = rel.parts
    if not parts:
        return None
    if parts[0] == "api" and rel.suffix == ".py":
        if len(parts) >= 4 and parts[1] == "alembic" and parts[2] == "versions":
            return None
        if PY_EXCLUDE_PARTS & set(parts):
            return None
        return "python"
    if parts[0] == "web" and rel.suffix in TS_EXTS:
        if TS_EXCLUDE_PARTS & set(parts):
            return None
        return "typescript"
    return None


def resolve_tool(name: str) -> str | None:
    return shutil.which(name) or shutil.which(name + ".cmd")


def run(cmd: list[str], cwd: Path, timeout: int) -> tuple[int, str]:
    try:
        r = subprocess.run(
            cmd,
            cwd=cwd,
            timeout=timeout,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
        )
        return r.returncode, (r.stdout or "") + (r.stderr or "")
    except FileNotFoundError:
        warn(f"tool not found: {cmd[0]} - skipping")
        sys.exit(0)
    except subprocess.TimeoutExpired:
        warn(f"timeout after {timeout}s: {' '.join(cmd)}")
        sys.exit(1)


def lint_python(file_abs: Path) -> int:
    ruff = resolve_tool("ruff")
    base = [ruff] if ruff else [sys.executable, "-m", "ruff"]
    cwd = PROJECT_ROOT / "api"
    f = str(file_abs)
    run(base + ["check", "--fix", f], cwd, RUFF_TIMEOUT)
    run(base + ["format", f], cwd, RUFF_TIMEOUT)
    code, out = run(base + ["check", f], cwd, RUFF_TIMEOUT)
    if code != 0:
        print(out, file=sys.stderr)
        return 2
    return 0


def lint_typescript(file_abs: Path) -> int:
    npx = resolve_tool("npx")
    if npx is None:
        warn("npx not found - skipping eslint")
        return 0
    cwd = PROJECT_ROOT / "web"
    if not (cwd / "node_modules").exists():
        warn("web/node_modules missing - skipping eslint")
        return 0
    code, out = run(
        [npx, "--no-install", "eslint", "--fix", str(file_abs)],
        cwd,
        ESLINT_TIMEOUT,
    )
    if code != 0:
        print(out, file=sys.stderr)
        return 2
    return 0


def main() -> int:
    try:
        payload = json.load(sys.stdin)
    except json.JSONDecodeError as e:
        warn(f"bad stdin: {e}")
        return 0

    tool_response = payload.get("tool_response") or {}
    if isinstance(tool_response, dict) and tool_response.get("success") is False:
        return 0

    tool_input = payload.get("tool_input") or {}
    raw = tool_input.get("file_path")
    if raw is None:
        return 0

    p = Path(raw)
    if not p.is_absolute():
        p = Path(payload.get("cwd") or PROJECT_ROOT) / p
    p = p.resolve()
    if not p.exists():
        return 0

    try:
        rel = p.relative_to(PROJECT_ROOT)
    except ValueError:
        return 0

    kind = classify(rel)
    if kind == "python":
        return lint_python(p)
    if kind == "typescript":
        return lint_typescript(p)
    return 0


if __name__ == "__main__":
    sys.exit(main())
