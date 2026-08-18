export interface CliIo {
  readonly stdout: { write(chunk: string): unknown };
  readonly stderr: { write(chunk: string): unknown };
}

export const processCliIo: CliIo = {
  stdout: process.stdout,
  stderr: process.stderr,
};
