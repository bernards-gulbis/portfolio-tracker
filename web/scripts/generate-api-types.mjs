#!/usr/bin/env node
/**
 * Regenerate web/src/api-generated.ts from the FastAPI OpenAPI schema.
 *
 *   1. Spawn ``python -m scripts.export_openapi`` from ``api/`` to produce
 *      the OpenAPI JSON. The project's virtualenv must be active (or
 *      ``python`` on PATH must resolve to the same interpreter that has
 *      the API's deps installed).
 *   2. Hand the JSON to ``openapi-typescript`` to generate the TypeScript
 *      types.
 *   3. Write the result to ``web/src/api-generated.ts``.
 *
 * Single entry point for the ``generate:api`` npm script and the CI
 * drift gate.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');
const apiDir = path.join(repoRoot, 'api');
const outFile = path.resolve(here, '..', 'src', 'api-generated.ts');

// 1. Export the OpenAPI schema. Prefer the project's venv python
// (matches what tests/lint use); fall back to ``python`` on PATH.
// README documents ``venv/`` (no leading dot); ``.venv/`` is also common.
const VENV_LAYOUTS = ['.venv', 'venv'];
const pythonExe = (() => {
  for (const layout of VENV_LAYOUTS) {
    const winPath = path.join(repoRoot, layout, 'Scripts', 'python.exe');
    const unixPath = path.join(repoRoot, layout, 'bin', 'python');
    if (process.platform === 'win32' && existsSync(winPath)) return winPath;
    if (existsSync(unixPath)) return unixPath;
  }
  return 'python';
})();

const exportResult = spawnSync(
  pythonExe,
  ['-m', 'scripts.export_openapi'],
  // ``maxBuffer`` raised above Node's 1 MB default — the OpenAPI JSON for
  // a fully-populated schema can exceed that and trip ENOBUFS otherwise.
  { cwd: apiDir, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 },
);
if (exportResult.error) {
  process.stderr.write(`Failed to spawn python: ${exportResult.error.message}\n`);
  process.exit(1);
}
if (exportResult.status !== 0) {
  process.stderr.write(exportResult.stderr ?? '');
  process.stderr.write(
    `\nFailed to export OpenAPI schema (exit ${exportResult.status}).\n`,
  );
  process.exit(exportResult.status ?? 1);
}

// 2. Hand the JSON to openapi-typescript via a temp file. The CLI does
// not consume stdin, so we materialise to a tmpdir we own and clean up.
const tmp = mkdtempSync(path.join(tmpdir(), 'pt-openapi-'));
const tmpJson = path.join(tmp, 'openapi.json');
writeFileSync(tmpJson, exportResult.stdout, 'utf8');

// Invoke the CLI's underlying JS file with the current Node binary. This
// avoids the ``.cmd`` shim on Windows (which would force ``shell: true``
// and trip the DEP0190 warning) and stays portable across platforms.
const cliJs = path.join(
  here,
  '..',
  'node_modules',
  'openapi-typescript',
  'bin',
  'cli.js',
);
try {
  const tsResult = spawnSync(
    process.execPath,
    [cliJs, tmpJson, '-o', outFile],
    { stdio: 'inherit' },
  );
  if (tsResult.error) {
    process.stderr.write(
      `Failed to spawn openapi-typescript: ${tsResult.error.message}\n`,
    );
    process.exit(1);
  }
  if (tsResult.status !== 0) {
    process.exit(tsResult.status ?? 1);
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
