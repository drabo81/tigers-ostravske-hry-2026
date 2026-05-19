import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hasMetaChanged } from '../lib/poll.js';

test('hasMetaChanged: same timestamp → false', () => {
  const meta = { last_success_at: '2026-05-19T12:00:00Z' };
  assert.equal(hasMetaChanged(meta, meta), false);
});

test('hasMetaChanged: newer timestamp → true', () => {
  const old   = { last_success_at: '2026-05-19T12:00:00Z' };
  const newer = { last_success_at: '2026-05-19T13:30:00Z' };
  assert.equal(hasMetaChanged(old, newer), true);
});

test('hasMetaChanged: oldMeta null, newMeta has timestamp → true', () => {
  // Happens when initial meta fetch failed and first poll succeeds.
  assert.equal(hasMetaChanged(null, { last_success_at: '2026-05-19T12:00:00Z' }), true);
});

test('hasMetaChanged: newMeta missing last_success_at → false', () => {
  const old = { last_success_at: '2026-05-19T12:00:00Z' };
  assert.equal(hasMetaChanged(old, {}), false);
  assert.equal(hasMetaChanged(old, null), false);
});
