import type { CliIo } from '../../src/io/CliIo.js';

export interface MemoryIo extends CliIo {
  readStdout(): string;
  readStderr(): string;
}

export function createMemoryIo(): MemoryIo {
  let stdout = '';
  let stderr = '';

  return {
    stdout: {
      write(chunk) {
        stdout += chunk;
      },
    },
    stderr: {
      write(chunk) {
        stderr += chunk;
      },
    },
    readStdout: () => stdout,
    readStderr: () => stderr,
  };
}
