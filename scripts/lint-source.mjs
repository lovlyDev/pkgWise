import { readFile, readdir } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const workspace = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const roots = [resolve(workspace, 'packages/core/src'), resolve(workspace, 'packages/cli/src')];
const issues = [];

for (const root of roots) {
  for (const path of await collectTypeScript(root)) {
    const source = await readFile(path, 'utf8');
    const display = relative(workspace, path);
    if (root.endsWith('packages/core/src')) {
      reject(source, display, /\bconsole\s*\./, 'core must not print to the console');
      reject(source, display, /\bprocess\.exit\s*\(/, 'core must not terminate the process');
    } else {
      reject(
        source,
        display,
        /from\s+['"]@pkgwise\/core\//,
        'CLI must import only the public @pkgwise/core export',
      );
    }
    reject(source, display, /@ts-ignore/, 'type errors must not be suppressed with @ts-ignore');
    reject(
      source,
      display,
      /\b(?:TODO|FIXME)\b/,
      'committed source must not contain TODO/FIXME markers',
    );
  }
}

if (issues.length > 0) {
  throw new Error(
    `Source boundary checks failed:\n${issues.map((issue) => `- ${issue}`).join('\n')}`,
  );
}
process.stdout.write('Source boundary checks passed.\n');

async function collectTypeScript(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) result.push(...(await collectTypeScript(path)));
    else if (entry.isFile() && entry.name.endsWith('.ts')) result.push(path);
  }
  return result.sort();
}

function reject(source, path, pattern, message) {
  if (pattern.test(source)) issues.push(`${path}: ${message}`);
}
