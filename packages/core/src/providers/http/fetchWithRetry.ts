import { PkgWiseError } from '../../errors/PkgWiseError.js';

export interface HttpRequestOptions {
  readonly url: URL;
  readonly method?: 'GET' | 'POST';
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: string;
  readonly signal?: AbortSignal;
  readonly timeoutMs: number;
  readonly maximumBytes: number;
  readonly attempts?: number;
}

export interface HttpResponseData {
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: Uint8Array;
}

export interface HttpRuntime {
  readonly fetch: typeof globalThis.fetch;
  readonly sleep: (milliseconds: number, signal?: AbortSignal) => Promise<void>;
  readonly random: () => number;
}

export async function fetchWithRetry(
  options: HttpRequestOptions,
  runtime: HttpRuntime,
): Promise<HttpResponseData> {
  if (options.url.protocol !== 'https:') {
    throw new PkgWiseError({
      code: 'PW_CONFIG_INVALID',
      userMessage: `Refusing insecure provider URL ${options.url.origin}.`,
      recoverable: false,
    });
  }
  const attempts = options.attempts ?? 3;
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    options.signal?.throwIfAborted();
    const timeout = AbortSignal.timeout(options.timeoutMs);
    const signal =
      options.signal === undefined ? timeout : AbortSignal.any([options.signal, timeout]);
    try {
      const response = await runtime.fetch(options.url, {
        method: options.method ?? 'GET',
        redirect: 'error',
        headers: { accept: 'application/json', ...options.headers },
        ...(options.body === undefined ? {} : { body: options.body }),
        signal,
      });
      const body = await readBoundedBody(response, options.maximumBytes);
      const result = {
        status: response.status,
        headers: Object.fromEntries(response.headers.entries()),
        body,
      };
      if (!isRetryableStatus(response.status) || attempt === attempts) return result;
      await runtime.sleep(
        retryDelay(response.headers.get('retry-after'), attempt, runtime.random),
        options.signal,
      );
    } catch (error) {
      if (options.signal?.aborted === true) throw options.signal.reason;
      if (error instanceof PkgWiseError) throw error;
      lastError = error;
      if (attempt === attempts) break;
      await runtime.sleep(retryDelay(undefined, attempt, runtime.random), options.signal);
    }
  }
  throw new PkgWiseError({
    code: 'PW_PROVIDER_UNAVAILABLE',
    userMessage: `Provider request to ${options.url.origin} failed after ${attempts} attempts.`,
    recoverable: true,
    cause: lastError,
  });
}

function isRetryableStatus(status: number): boolean {
  return [408, 425, 429, 500, 502, 503, 504].includes(status);
}

function retryDelay(
  header: string | null | undefined,
  attempt: number,
  random: () => number,
): number {
  if (header !== undefined && header !== null) {
    const seconds = Number(header);
    if (Number.isFinite(seconds) && seconds >= 0) return Math.min(10_000, seconds * 1000);
    const date = Date.parse(header);
    if (Number.isFinite(date)) return Math.max(0, Math.min(10_000, date - Date.now()));
  }
  return Math.floor(Math.min(4_000, 250 * 2 ** (attempt - 1)) * random());
}

async function readBoundedBody(response: Response, maximumBytes: number): Promise<Uint8Array> {
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maximumBytes) throw responseTooLarge(maximumBytes);
  if (response.body === null) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const next = await reader.read();
    if (next.done) break;
    total += next.value.byteLength;
    if (total > maximumBytes) {
      await reader.cancel();
      throw responseTooLarge(maximumBytes);
    }
    chunks.push(next.value);
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

function responseTooLarge(maximumBytes: number): PkgWiseError {
  return new PkgWiseError({
    code: 'PW_PROVIDER_UNAVAILABLE',
    userMessage: `Provider response exceeds the ${maximumBytes}-byte safety limit.`,
    recoverable: true,
  });
}

export function defaultSleep(milliseconds: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, milliseconds);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(signal.reason);
      },
      { once: true },
    );
  });
}
