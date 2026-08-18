import { access, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const workspace = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const paths = ['packages/core/package.json', 'packages/cli/package.json'];
const packages = await Promise.all(
  paths.map(async (path) => JSON.parse(await readFile(resolve(workspace, path), 'utf8'))),
);
const issues = [];

for (const manifest of packages) {
  if (typeof manifest.license !== 'string' || manifest.license === 'UNLICENSED') {
    issues.push(`${manifest.name}: choose and declare a publishable license`);
  }
  const repository =
    typeof manifest.repository === 'string' ? manifest.repository : manifest.repository?.url;
  if (typeof repository !== 'string' || repository.length === 0) {
    issues.push(`${manifest.name}: add repository.url`);
  }
  if (typeof manifest.homepage !== 'string' || manifest.homepage.length === 0) {
    issues.push(`${manifest.name}: add homepage`);
  }
  if (typeof manifest.bugs?.url !== 'string' || manifest.bugs.url.length === 0) {
    issues.push(`${manifest.name}: add bugs.url`);
  }
  if (manifest.publishConfig?.access !== 'public') {
    issues.push(`${manifest.name}: publishConfig.access must be public`);
  }
  if (typeof manifest.author !== 'string' || manifest.author.length === 0) {
    issues.push(`${manifest.name}: add author`);
  }
}

for (const path of ['LICENSE', 'packages/core/LICENSE', 'packages/cli/LICENSE']) {
  try {
    await access(resolve(workspace, path));
  } catch {
    issues.push(`${path}: add the selected license text to the published artifact`);
  }
}

if (packages[0].version !== packages[1].version) {
  issues.push('published package versions must remain synchronized');
}
if (issues.length > 0) {
  throw new Error(
    `Release metadata is incomplete:\n${issues.map((issue) => `- ${issue}`).join('\n')}`,
  );
}
process.stdout.write('Release metadata is complete.\n');
