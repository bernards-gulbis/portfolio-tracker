import { unlinkSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiDir = path.resolve(__dirname, '..', '..', 'api');

for (const suffix of ['', '-journal', '-shm', '-wal']) {
  try {
    unlinkSync(path.join(apiDir, `e2e_test.db${suffix}`));
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
}
