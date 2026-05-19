import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchViaProxy, PROXY_BUILDERS } from '../lib/proxy.js';

test('PROXY_BUILDERS: má 3 proxy', () => {
  assert.equal(PROXY_BUILDERS.length, 3);
});

test('PROXY_BUILDERS: každá vrací URL', () => {
  for (const builder of PROXY_BUILDERS) {
    const url = builder('https://example.com/');
    assert.ok(url.startsWith('https://'), `bad url: ${url}`);
  }
});

test('fetchViaProxy: vrátí text z první funkční proxy', async () => {
  let callCount = 0;
  const fakeFetch = async () => {
    callCount++;
    return { ok: true, text: async () => 'OK-body' };
  };
  const result = await fetchViaProxy('https://example.com/', { fetchImpl: fakeFetch });
  assert.equal(result, 'OK-body');
  assert.equal(callCount, 1);
});

test('fetchViaProxy: failover na 2. proxy když 1. selže', async () => {
  let callCount = 0;
  const fakeFetch = async () => {
    callCount++;
    if (callCount === 1) throw new Error('network');
    return { ok: true, text: async () => 'OK-from-fallback' };
  };
  const result = await fetchViaProxy('https://example.com/', { fetchImpl: fakeFetch });
  assert.equal(result, 'OK-from-fallback');
  assert.equal(callCount, 2);
});

test('fetchViaProxy: failover i přes HTTP error', async () => {
  let callCount = 0;
  const fakeFetch = async () => {
    callCount++;
    if (callCount === 1) return { ok: false, status: 503, text: async () => '' };
    return { ok: true, text: async () => 'OK-from-third' };
  };
  const result = await fetchViaProxy('https://example.com/', { fetchImpl: fakeFetch });
  assert.equal(result, 'OK-from-third');
});

test('fetchViaProxy: throw když všechny selžou', async () => {
  const fakeFetch = async () => { throw new Error('all-down'); };
  await assert.rejects(
    () => fetchViaProxy('https://example.com/', { fetchImpl: fakeFetch }),
    /all proxies failed/i,
  );
});
