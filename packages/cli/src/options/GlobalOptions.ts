export type OutputFormat = 'terminal' | 'json' | 'sarif' | 'markdown';

export interface GlobalOptions {
  readonly config?: string;
  readonly format: OutputFormat;
  readonly output?: string;
  readonly root?: string;
  readonly offline: boolean;
  readonly refresh: boolean;
  readonly cache: boolean;
  readonly cacheDir?: string;
  readonly timeout: number;
  readonly concurrency: number;
  readonly ci: boolean;
  readonly quiet: boolean;
  readonly verbose: boolean;
  readonly debug: boolean;
  readonly color: boolean;
}
