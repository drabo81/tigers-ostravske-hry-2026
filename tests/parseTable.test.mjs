import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseHTML } from 'linkedom';
import { parseTable } from '../sources/tigers-ostravske-2026/parser.js';

const html = readFileSync(
  new URL('./fixtures/2026-05-19-before-tournament-table.html', import.meta.url),
  'utf8'
);
const { document } = parseHTML(html);
const result = parseTable(document);

test('parseTable: returns groups object', () => {
  assert.ok(result.groups, 'result.groups missing');
  assert.ok(result.groups.MH, 'group MH missing');
});

test('parseTable: MH has 4 teams', () => {
  assert.equal(result.groups.MH.length, 4);
});

test('parseTable: MH contains FBC TIGERS PORUBA on rank 1 (alphabetical seed)', () => {
  const tigers = result.groups.MH.find(t => t.team.includes('TIGERS') || t.team.includes('Tigers'));
  assert.ok(tigers, 'Tigers missing in MH');
  assert.equal(typeof tigers.rank, 'number');
  assert.equal(typeof tigers.points, 'number');
  assert.equal(tigers.rank, 1, 'Tigers should be seeded at rank 1 (alphabetical before tournament)');
});

test('parseTable: also returns MD and ME (potrebne pro play-off)', () => {
  assert.ok(result.groups.MD, 'MD missing');
  assert.ok(result.groups.ME, 'ME missing');
});

test('parseTable: row has all required fields', () => {
  const row = result.groups.MH[0];
  for (const field of ['rank', 'team', 'scored', 'conceded', 'points']) {
    assert.ok(field in row, `field ${field} missing`);
    assert.equal(typeof row[field], field === 'team' ? 'string' : 'number', `field ${field} has wrong type`);
  }
});

test('parseTable: before tournament — all teams have 0 points and 0:0 score', () => {
  for (const row of result.groups.MH) {
    assert.equal(row.points, 0);
    assert.equal(row.scored, 0);
    assert.equal(row.conceded, 0);
  }
});
