import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleScheduled } from '../infra/cloudflare-cron/src/index.js';

// Fake matches: turnaj 22.5. 09:00 → 24.5. 15:30 local Prague (DST → UTC -2h).
const matchesFixture = {
  matches: [
    { id: 1, date: '2026-05-22', time: '09:00' },
    { id: 2, date: '2026-05-24', time: '15:30' },
  ],
};

function mockFetcher({ matchesStatus = 200, matchesBody = matchesFixture, dispatchStatus = 204, dispatchBody = '' } = {}) {
  const calls = [];
  const fetcher = async (url, opts) => {
    calls.push({ url, opts });
    if (url.includes('raw.githubusercontent.com')) {
      return {
        ok: matchesStatus >= 200 && matchesStatus < 300,
        status: matchesStatus,
        json: async () => matchesBody,
      };
    }
    if (url.includes('/actions/workflows/')) {
      return {
        ok: dispatchStatus >= 200 && dispatchStatus < 300,
        status: dispatchStatus,
        text: async () => dispatchBody,
      };
    }
    throw new Error(`unexpected url: ${url}`);
  };
  return { fetcher, calls };
}

test('handleScheduled: in window + PAT → dispatches', async () => {
  const { fetcher, calls } = mockFetcher();
  const env = { GH_DISPATCH_PAT: 'ghp_abc' };
  const now = new Date('2026-05-23T12:00:00Z');
  const result = await handleScheduled(env, now, fetcher);
  assert.equal(result.dispatched, true, `expected dispatched=true, got: ${JSON.stringify(result)}`);
  assert.equal(calls.length, 2, 'expected 2 fetch calls (matches + dispatch)');
  const dispatchCall = calls[1];
  assert.ok(dispatchCall.opts.headers.Authorization === 'Bearer ghp_abc', 'PAT must be in Authorization header');
  const body = JSON.parse(dispatchCall.opts.body);
  assert.equal(body.ref, 'main');
  assert.equal(body.inputs.cf_cron, 'true');
});

test('handleScheduled: outside window → no dispatch', async () => {
  const { fetcher, calls } = mockFetcher();
  const env = { GH_DISPATCH_PAT: 'ghp_abc' };
  const now = new Date('2026-05-20T12:00:00Z');  // 2 dny před turnajem
  const result = await handleScheduled(env, now, fetcher);
  assert.equal(result.dispatched, false);
  assert.equal(result.reason, 'outside tournament window');
  assert.equal(calls.length, 1, 'only matches.json should be fetched');
});

test('handleScheduled: missing PAT → no dispatch', async () => {
  const { fetcher } = mockFetcher();
  const env = {};
  const now = new Date('2026-05-23T12:00:00Z');
  const result = await handleScheduled(env, now, fetcher);
  assert.equal(result.dispatched, false);
  assert.match(result.reason, /GH_DISPATCH_PAT/);
});

test('handleScheduled: matches.json fetch fail → no dispatch', async () => {
  const { fetcher } = mockFetcher({ matchesStatus: 500 });
  const env = { GH_DISPATCH_PAT: 'ghp_abc' };
  const result = await handleScheduled(env, new Date('2026-05-23T12:00:00Z'), fetcher);
  assert.equal(result.dispatched, false);
  assert.match(result.reason, /HTTP 500/);
});

test('handleScheduled: dispatch API fail → reports error', async () => {
  const { fetcher } = mockFetcher({ dispatchStatus: 401, dispatchBody: '{"message":"Bad credentials"}' });
  const env = { GH_DISPATCH_PAT: 'ghp_bad' };
  const result = await handleScheduled(env, new Date('2026-05-23T12:00:00Z'), fetcher);
  assert.equal(result.dispatched, false);
  assert.match(result.reason, /HTTP 401/);
});
