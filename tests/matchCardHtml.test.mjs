import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchCardHtml } from '../sources/ostravske-hry-2026/bracket.js';

const baseMatch = {
  id: 100,
  phase: 'group',
  group: 'MH',
  home: 'FBC TIGERS PORUBA',
  away: 'Opponent X',
  date: '2026-05-22',
  time: '11:15',
  venue: 'Hala A',
};

test('matchCardHtml: final score → no live badge, no is-live class', () => {
  const m = { ...baseMatch, score: { home: 5, away: 2, status: 'final' } };
  const html = matchCardHtml(m, true);
  assert.ok(!html.includes('is-live'), 'final match should not have is-live class');
  assert.ok(!html.includes('Skóre není finální'), 'final match should not show live badge');
  assert.ok(html.includes('5 : 2'), 'score should be rendered');
});

test('matchCardHtml: live score → is-live class + badge "Skóre není finální"', () => {
  const m = { ...baseMatch, score: { home: 3, away: 2, status: 'live' } };
  const html = matchCardHtml(m, true);
  assert.ok(html.includes('is-live'), 'live match should have is-live class');
  assert.ok(html.includes('Skóre není finální'), 'live match should show badge text');
  assert.ok(html.includes('3 : 2'), 'live match score should be rendered');
});

test('matchCardHtml: live score does NOT carry is-pending class (it has a score)', () => {
  const m = { ...baseMatch, score: { home: 1, away: 0, status: 'live' } };
  const html = matchCardHtml(m, false);
  assert.ok(!/match-card[^"]*\bis-pending\b/.test(html), 'live match must not be is-pending');
});

test('matchCardHtml: no score → is-pending, no live badge', () => {
  const m = { ...baseMatch, score: null };
  const html = matchCardHtml(m, false);
  assert.ok(html.includes('is-pending'), 'unplayed match should be is-pending');
  assert.ok(!html.includes('Skóre není finální'), 'unplayed match must not show live badge');
});
