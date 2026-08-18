import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const workspace = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const expected = process.argv[2];

if (expected === undefined || !/^\d+\.\d+\.\d+-alpha\.\d+$/.test(expected)) {
  throw new Error('Expected an explicit alpha version such as 0.1.0-alpha.0.');
}

const manifests = await Promise.all(
  ['packages/core/package.json', 'packages/cli/package.json'].map(async (path) => ({
    path,
    value: JSON.parse(await readFile(resolve(workspace, path), 'utf8')),
  })),
);

const mismatches = manifests.filter(({ value }) => value.version !== expected);
if (mismatches.length > 0) {
  throw new Error(
    `Requested ${expected}, but package versions differ:\n${mismatches
      .map(({ path, value }) => `- ${path}: ${String(value.version)}`)
      .join('\n')}`,
  );
}

process.stdout.write(`Release version ${expected} is synchronized and alpha-tagged.\n`);
