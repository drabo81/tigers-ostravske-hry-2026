import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isInTournamentWindow } from '../scripts/in-tournament-window.mjs';

// Pomocná funkce: ISO string → Date
const at = iso => new Date(iso);

// Match čas je v lokálním čase Europe/Prague. V květnu (DST) = UTC+2.
const fixture = {
  matches: [
    { id: 1, date: '2026-05-22', time: '09:00' },   // 07:00 UTC
    { id: 2, date: '2026-05-22', time: '20:15' },   // 18:15 UTC
    { id: 3, date: '2026-05-23', time: '10:15' },   // 08:15 UTC
    { id: 4, date: '2026-05-24', time: '15:30' },   // 13:30 UTC — poslední zápas
  ],
};

test('isInTournamentWindow: now uvnitř turnaje → true', () => {
  // 2026-05-23 12:00 UTC = mezi prvním (22.5. 07:00 UTC) a posledním (24.5. 13:30 UTC)
  assert.equal(isInTournamentWindow(fixture, at('2026-05-23T12:00:00Z')), true);
});

test('isInTournamentWindow: now přesně na prvním zápase → true', () => {
  assert.equal(isInTournamentWindow(fixture, at('2026-05-22T07:00:00Z')), true);
});

test('isInTournamentWindow: now 20 min před prvním zápasem (uvnitř -30 min bufferu) → true', () => {
  assert.equal(isInTournamentWindow(fixture, at('2026-05-22T06:40:00Z')), true);
});

test('isInTournamentWindow: now 60 min před prvním zápasem (mimo buffer) → false', () => {
  assert.equal(isInTournamentWindow(fixture, at('2026-05-22T06:00:00Z')), false);
});

test('isInTournamentWindow: now 60 min po posledním zápase (uvnitř +90 min bufferu) → true', () => {
  assert.equal(isInTournamentWindow(fixture, at('2026-05-24T14:30:00Z')), true);
});

test('isInTournamentWindow: now 120 min po posledním zápase (mimo buffer) → false', () => {
  assert.equal(isInTournamentWindow(fixture, at('2026-05-24T15:30:00Z')), false);
});

test('isInTournamentWindow: prázdné matches → false', () => {
  assert.equal(isInTournamentWindow({ matches: [] }, at('2026-05-22T12:00:00Z')), false);
});

test('isInTournamentWindow: matches bez date/time → ignorovány (false pokud žádný validní)', () => {
  assert.equal(
    isInTournamentWindow({ matches: [{ id: 1, date: null, time: null }] }, at('2026-05-22T12:00:00Z')),
    false
  );
});
