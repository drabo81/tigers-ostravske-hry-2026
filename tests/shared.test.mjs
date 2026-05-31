import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTeamName, escapeHtml, fmtDate, fmtDateTime } from '../lib/shared.js';

test('normalizeTeamName: trim + lowercase + bez diakritiky', () => {
  assert.equal(normalizeTeamName('  Třinec červení '), 'trinec cerveni');
  assert.equal(normalizeTeamName('FBC Tigers Poruba'), 'fbc tigers poruba');
});

test('escapeHtml', () => {
  assert.equal(escapeHtml('<a href="x">&'), '&lt;a href=&quot;x&quot;&gt;&amp;');
  assert.equal(escapeHtml(null), '');
});

test('fmtDate: ISO → "D. M."', () => {
  assert.equal(fmtDate('2026-05-22'), '22. 5.');
  assert.equal(fmtDate(''), '');
});

test('fmtDateTime', () => {
  assert.equal(fmtDateTime(null), '—');
  assert.equal(typeof fmtDateTime('2026-05-22T11:30:00Z'), 'string');
});
