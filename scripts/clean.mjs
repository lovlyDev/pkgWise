import { rm } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const workspace = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const targets = [
  resolve(workspace, '.artifacts'),
  resolve(workspace, 'packages/core/dist'),
  resolve(workspace, 'packages/core/.test-dist'),
  resolve(workspace, 'packages/cli/dist'),
  resolve(workspace, 'packages/cli/.test-dist'),
];

for (const target of targets) {
  const child = relative(workspace, target);
  if (child === '' || child.startsWith('..')) {
    throw new Error(`Refusing to clean path outside the workspace: ${target}`);
  }
  await rm(target, { recursive: true, force: true });
}
