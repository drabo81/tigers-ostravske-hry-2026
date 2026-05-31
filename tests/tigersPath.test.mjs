import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseHTML } from 'linkedom';
import { parseMatches, parseTable } from '../sources/ostravske-hry-2026/parser.js';
import { tigersPath } from '../sources/ostravske-hry-2026/bracket.js';

const matchesHtml = readFileSync(
  new URL('./fixtures/2026-05-19-before-tournament-matches.html', import.meta.url),
  'utf8'
);
const tableHtml = readFileSync(
  new URL('./fixtures/2026-05-19-before-tournament-table.html', import.meta.url),
  'utf8'
);
const matches = parseMatches(parseHTML(matchesHtml).document);
const tableBefore = parseTable(parseHTML(tableHtml).document);     // všichni mají 0 bodů, Tigers rank 1 (alphabetical)

test('tigersPath: before tournament — returns group matches + ALL placeholder play-off paths', () => {
  const path = tigersPath(matches, tableBefore);
  // 3 group matches + minimálně 1 zápas 16F-A (Tigers jako H1) + dál do hloubky pavouka
  assert.ok(path.length >= 3, `expected >= 3 matches, got ${path.length}`);
  const groupCount = path.filter(m => m.phase === 'group').length;
  assert.equal(groupCount, 3, `expected 3 group matches in path, got ${groupCount}`);
});

test('tigersPath: sorted by date+time', () => {
  const path = tigersPath(matches, tableBefore);
  for (let i = 1; i < path.length; i++) {
    const a = `${path[i - 1].date} ${path[i - 1].time}`;
    const b = `${path[i].date} ${path[i].time}`;
    assert.ok(a <= b, `out of order: ${a} > ${b}`);
  }
});

test('tigersPath: includes 16F-A match where H1 (Tigers seeded rank 1) appears', () => {
  const path = tigersPath(matches, tableBefore);
  const sixteenF = path.find(m => m.phase === '16F-A');
  assert.ok(sixteenF, '16F-A match for Tigers (H1) missing');
  const containsH1 = sixteenF.home === 'H1' || sixteenF.away === 'H1';
  assert.ok(containsH1, `expected literal H1 in 16F-A cell, got home=${sixteenF.home} away=${sixteenF.away}`);
});

test('tigersPath: includes 8F-A match with composite H1/X code', () => {
  const path = tigersPath(matches, tableBefore);
  const eightF = path.find(m => m.phase === '8F-A');
  assert.ok(eightF, '8F-A match for Tigers H1 missing');
  const cells = [eightF.home, eightF.away];
  assert.ok(cells.some(c => c.split('/').includes('H1')), `H1 missing in 8F-A cells: ${cells}`);
});

test('tigersPath: no duplicates by match id', () => {
  const path = tigersPath(matches, tableBefore);
  const ids = path.map(m => m.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('tigersPath: when Tigers not in table (e.g. empty MH), returns only direct-name matches', () => {
  const emptyTable = { groups: { MH: [] } };
  const path = tigersPath(matches, emptyTable);
  // Group matches mají reálné jméno "FBC TIGERS PORUBA", takže pořád najdeme 3
  const groupCount = path.filter(m => m.phase === 'group').length;
  assert.equal(groupCount, 3);
});
