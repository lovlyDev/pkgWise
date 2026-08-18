import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { CliIo } from '../io/CliIo.js';

export async function writeTextOutput(
  content: string,
  outputPath: string | undefined,
  io: CliIo,
): Promise<void> {
  if (outputPath === undefined) {
    io.stdout.write(content);
    return;
  }

  const target = resolve(outputPath);
  const parent = dirname(target);
  const temporary = `${target}.${randomUUID()}.tmp`;
  await mkdir(parent, { recursive: true });

  try {
    await writeFile(temporary, content, { encoding: 'utf8', flag: 'wx' });
    await rename(temporary, target);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}
