import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyGroupFilter, filterMatches } from '../scripts/scrape.mjs';

test('applyGroupFilter: "all" → vše', () => {
  const t = { groups: { MH: [1], MD: [2] } };
  assert.deepEqual(applyGroupFilter(t, 'all'), t);
});
test('applyGroupFilter: výčet', () => {
  const t = { groups: { MH: [1], MD: [2], ME: [3] } };
  assert.deepEqual(Object.keys(applyGroupFilter(t, ['MH','ME']).groups), ['MH','ME']);
});
test('filterMatches: "all" → vše; výčet ponechá group==null', () => {
  const m = { matches: [{group:'MH'},{group:'MD'},{group:null,phase:'8F-A'}] };
  assert.equal(filterMatches(m, 'all').matches.length, 3);
  assert.equal(filterMatches(m, ['MH']).matches.length, 2); // MH + group:null
});
