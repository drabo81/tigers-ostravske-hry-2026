import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTeamName } from '../sources/ostravske-hry-2026/parser.js';

test('normalizeTeamName: trim whitespace', () => {
  assert.equal(normalizeTeamName('  FBC Tigers Poruba  '), 'fbc tigers poruba');
});

test('normalizeTeamName: lowercase (Czech locale)', () => {
  assert.equal(normalizeTeamName('FBC TIGERS PORUBA'), 'fbc tigers poruba');
});

test('normalizeTeamName: remove diacritics', () => {
  assert.equal(normalizeTeamName('Třinec červení'), 'trinec cerveni');
  assert.equal(normalizeTeamName('Vítkovická'), 'vitkovicka');
});

test('normalizeTeamName: combined', () => {
  assert.equal(normalizeTeamName('  ACEMA Sparta Praha YELLOW '), 'acema sparta praha yellow');
});
