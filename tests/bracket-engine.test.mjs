import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveCode } from '../lib/bracket-engine.js';

const POS = { H: 'MH', D: 'MD' };

const tablePlayed = {
  groups: {
    MH: [ { rank: 1, team: 'FBC Tigers Poruba', points: 9, scored: 12, conceded: 3 } ],
    MD: [ { rank: 4, team: 'D-team4', points: 0, scored: 2, conceded: 15 } ],
  },
};

test('resolveCode: H1 → tým na 1. místě MH', () => {
  assert.equal(resolveCode('H1', tablePlayed, POS), 'FBC Tigers Poruba');
  assert.equal(resolveCode('D4', tablePlayed, POS), 'D-team4');
});

test('resolveCode: neznámý kód / skupina → null', () => {
  assert.equal(resolveCode('Z9', tablePlayed, POS), null);
  assert.equal(resolveCode('FBC Tigers Poruba', tablePlayed, POS), null); // není kód
});

test('resolveCode: před odehráním zápasů (vše 0) → null', () => {
  const seedOnly = { groups: { MH: [ { rank: 1, team: 'X', points: 0, scored: 0, conceded: 0 } ] } };
  assert.equal(resolveCode('H1', seedOnly, POS), null);
});
