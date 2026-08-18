import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const workspace = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const expected = process.argv[2];
const npmTag = process.argv[3];
const semanticVersion =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|[A-Za-z-][0-9A-Za-z-]*))*))?$/;

if (expected === undefined || !semanticVersion.test(expected)) {
  throw new Error('Expected an explicit semantic version such as 0.2.0-alpha.1 or 1.0.0.');
}

if (npmTag !== 'next' && npmTag !== 'latest') {
  throw new Error('Expected the npm dist-tag to be either next or latest.');
}

const isPrerelease = expected.includes('-');
if ((isPrerelease && npmTag !== 'next') || (!isPrerelease && npmTag !== 'latest')) {
  throw new Error(
    `Version ${expected} must be published with the ${isPrerelease ? 'next' : 'latest'} npm dist-tag.`,
  );
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

process.stdout.write(
  `Release version ${expected} is synchronized and will use npm tag ${npmTag}.\n`,
);
