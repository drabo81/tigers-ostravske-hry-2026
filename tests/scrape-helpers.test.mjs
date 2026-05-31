import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isActive, applyGroupFilter } from '../scripts/scrape.mjs';

test('isActive: okno od–do', () => {
  const src = { activeFrom: '2026-05-22T00:00:00Z', activeTo: '2026-05-26T00:00:00Z' };
  assert.equal(isActive(src, new Date('2026-05-23T10:00:00Z')), true);
  assert.equal(isActive(src, new Date('2026-05-20T10:00:00Z')), false);
  assert.equal(isActive(src, new Date('2026-05-27T10:00:00Z')), false);
});

test('applyGroupFilter: "all" vrací vše', () => {
  const table = { groups: { MH: [1], MD: [2] } };
  assert.deepEqual(applyGroupFilter(table, 'all'), table);
});

test('applyGroupFilter: výčet vybere jen dané skupiny', () => {
  const table = { groups: { MH: [1], MD: [2], ME: [3] } };
  const out = applyGroupFilter(table, ['MH', 'ME']);
  assert.deepEqual(Object.keys(out.groups), ['MH', 'ME']);
});
