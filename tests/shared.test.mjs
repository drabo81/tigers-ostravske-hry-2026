import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTeamName, escapeHtml, fmtDate, fmtDateCompact, fmtDateTime } from '../lib/shared.js';

test('normalizeTeamName: trim + lowercase + bez diakritiky', () => {
  assert.equal(normalizeTeamName('  FBC Tigers Poruba  '), 'fbc tigers poruba');
  assert.equal(normalizeTeamName('Třinec červení'), 'trinec cerveni');
});

test('escapeHtml: escapuje speciální znaky', () => {
  assert.equal(escapeHtml('<a href="x">&'), '&lt;a href=&quot;x&quot;&gt;&amp;');
  assert.equal(escapeHtml(null), '');
});

test('fmtDate: ISO → "D. M." s mezerou', () => {
  assert.equal(fmtDate('2026-05-22'), '22. 5.');
  assert.equal(fmtDate(''), '');
});

test('fmtDateCompact: ISO → "D.M." bez mezery', () => {
  assert.equal(fmtDateCompact('2026-05-22'), '22.5.');
});

test('fmtDateTime: ISO → lokální cs formát (nespadne)', () => {
  const out = fmtDateTime('2026-05-22T11:30:00Z');
  assert.equal(typeof out, 'string');
  assert.ok(out.length > 0);
  assert.equal(fmtDateTime(null), '—');
});
