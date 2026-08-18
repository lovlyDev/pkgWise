import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fetchWithRetry } from '../../src/providers/http/fetchWithRetry.js';

describe('HTTP provider transport', () => {
  it('retries transient statuses and returns a bounded response', async () => {
    let calls = 0;
    const delays: number[] = [];
    const fetch = async (): Promise<Response> => {
      calls += 1;
      return calls === 1
        ? new Response('busy', { status: 503, headers: { 'retry-after': '0' } })
        : new Response('{"ok":true}', { status: 200 });
    };

    const response = await fetchWithRetry(
      { url: new URL('https://registry.npmjs.org/demo'), timeoutMs: 1000, maximumBytes: 100 },
      {
        fetch: fetch as typeof globalThis.fetch,
        sleep: async (milliseconds) => {
          delays.push(milliseconds);
        },
        random: () => 0,
      },
    );

    assert.equal(calls, 2);
    assert.deepEqual(delays, [0]);
    assert.equal(response.status, 200);
    assert.equal(new TextDecoder().decode(response.body), '{"ok":true}');
  });

  it('rejects insecure URLs and oversized streamed bodies', async () => {
    const runtime = {
      fetch: (async () => new Response('123456')) as typeof globalThis.fetch,
      sleep: async () => {},
      random: () => 0,
    };
    await assert.rejects(
      fetchWithRetry(
        { url: new URL('http://registry.example/demo'), timeoutMs: 1000, maximumBytes: 100 },
        runtime,
      ),
      /Refusing insecure provider URL/,
    );
    await assert.rejects(
      fetchWithRetry(
        {
          url: new URL('https://registry.example/demo'),
          timeoutMs: 1000,
          maximumBytes: 5,
          attempts: 1,
        },
        runtime,
      ),
      /exceeds the 5-byte safety limit/,
    );
  });
});
