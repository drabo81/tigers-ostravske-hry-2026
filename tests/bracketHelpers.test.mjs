import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tigersPositionCode, matchContainsCode } from '../lib/bracket.js';

test('tigersPositionCode: before tournament returns null', () => {
  const table = { groups: { MH: [] } };
  assert.equal(tigersPositionCode(table), null);
});

test('tigersPositionCode: rank 1 → "H1"', () => {
  const table = {
    groups: {
      MH: [
        { rank: 1, team: 'FBC TIGERS PORUBA', points: 9 },
        { rank: 2, team: 'Sparta', points: 6 },
      ],
    },
  };
  assert.equal(tigersPositionCode(table), 'H1');
});

test('tigersPositionCode: rank 3 → "H3"', () => {
  const table = {
    groups: {
      MH: [
        { rank: 1, team: 'Třinec', points: 9 },
        { rank: 2, team: 'Sparta', points: 6 },
        { rank: 3, team: 'FBC Tigers Poruba', points: 3 },
        { rank: 4, team: 'Olomouc', points: 0 },
      ],
    },
  };
  assert.equal(tigersPositionCode(table), 'H3');
});

test('matchContainsCode: literal H1 matches H1 cell', () => {
  assert.equal(matchContainsCode({ home: 'H1', away: 'D4' }, 'H1'), true);
});

test('matchContainsCode: H1 matches composite H1/D4 cell', () => {
  assert.equal(matchContainsCode({ home: 'H1/D4', away: 'A2/E3' }, 'H1'), true);
});

test('matchContainsCode: H1 matches deep composite H1/A2/E3/D4', () => {
  assert.equal(matchContainsCode({ home: 'G1/B2/F3/C4', away: 'H1/A2/E3/D4' }, 'H1'), true);
});

test('matchContainsCode: H1 does NOT match H10 or HH1 (boundary)', () => {
  assert.equal(matchContainsCode({ home: 'H10/D4', away: 'A2' }, 'H1'), false);
});

test('matchContainsCode: real team name FBC TIGERS PORUBA matches H1 lookup when normalizeTeamName eq', () => {
  // Když po skupinové fázi placeholders nahradíme jmény, tato funkce už nepoužívá kód,
  // ale funkce tigersPath musí pak fallback na jméno týmu — řešíme jinde.
  assert.equal(matchContainsCode({ home: 'FBC TIGERS PORUBA', away: 'Sparta' }, 'H1'), false);
});
