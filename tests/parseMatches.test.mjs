import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseHTML } from 'linkedom';
import { parseMatches } from '../sources/tigers-ostravske-2026/parser.js';

const html = readFileSync(
  new URL('./fixtures/2026-05-19-before-tournament-matches.html', import.meta.url),
  'utf8'
);
const { document } = parseHTML(html);
const result = parseMatches(document);

test('parseMatches: returns matches array', () => {
  assert.ok(Array.isArray(result.matches));
  assert.ok(result.matches.length > 0, 'expected at least one match');
});

test('parseMatches: each match has required fields', () => {
  for (const m of result.matches.slice(0, 5)) {
    for (const field of ['id', 'date', 'time', 'group', 'phase', 'venue', 'home', 'away', 'score']) {
      assert.ok(field in m, `field ${field} missing in match ${JSON.stringify(m)}`);
    }
  }
});

test('parseMatches: date format ISO (YYYY-MM-DD)', () => {
  const m = result.matches[0];
  assert.match(m.date, /^\d{4}-\d{2}-\d{2}$/);
});

test('parseMatches: time format HH:MM', () => {
  const m = result.matches[0];
  assert.match(m.time, /^\d{2}:\d{2}$/);
});

test('parseMatches: phase enum', () => {
  const allowed = new Set(['group', '16F-A', '16F-B', '8F-A', '8F-B', '4F-A', '4F-B', 'SF-A', 'SF-B', 'FINAL-A', 'FINAL-B', 'other']);
  for (const m of result.matches) {
    assert.ok(allowed.has(m.phase), `unexpected phase: ${m.phase} for match id=${m.id}`);
  }
});

test('parseMatches: contains Tigers group matches', () => {
  const tigers = result.matches.filter(m =>
    m.home.toLowerCase().includes('tigers') || m.away.toLowerCase().includes('tigers')
  );
  assert.equal(tigers.length, 3, `expected 3 Tigers group matches, got ${tigers.length}`);
  for (const m of tigers) {
    assert.equal(m.phase, 'group');
    assert.equal(m.group, 'MH');
  }
});

test('parseMatches: contains play-off matches with position codes', () => {
  const playOffA = result.matches.filter(m => m.phase === '16F-A');
  // 8 skupin × 4 týmy = 32 týmů; první kolo play-off A = 16 zápasů (každý tým 1. kolo hraje)
  assert.equal(playOffA.length, 16, `expected 16 sixteen-finals-A matches, got ${playOffA.length}`);
  const tigersBracket = playOffA.find(m => m.home === 'H1' || m.away === 'H1');
  assert.ok(tigersBracket, 'H1 (Tigers placeholder) should appear in 16F-A');
});

test('parseMatches: score is null before tournament', () => {
  for (const m of result.matches.slice(0, 10)) {
    assert.equal(m.score, null, `match ${m.id} should have null score: ${JSON.stringify(m.score)}`);
  }
});

test('parseMatches: deduplicated by id (no double-counting from mobile + desktop rows)', () => {
  const ids = result.matches.map(m => m.id);
  const unique = new Set(ids);
  assert.equal(ids.length, unique.size, 'duplicate match ids found');
});
