import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SOURCES } from '../sources/registry.js';

test('registry: zdroj ostravske-hry-2026 s lehkými metadaty', () => {
  const s = SOURCES.find(x => x.id === 'ostravske-hry-2026');
  assert.ok(s);
  assert.equal(typeof s.label, 'string');
  assert.ok(Array.isArray(s.categories) && s.categories.length >= 1);
  assert.equal(typeof s.load, 'function');
});

test('registry: lazy load → plný SourceDefinition + bracket modul', async () => {
  const s = SOURCES.find(x => x.id === 'ostravske-hry-2026');
  const def = (await s.load()).default;
  assert.equal(def.id, 'ostravske-hry-2026');
  assert.equal(typeof def.parseTable, 'function');
  assert.equal(typeof def.parseMatches, 'function');
  const cat = def.categories.find(c => c.id === 'B13');
  assert.ok(cat);
  assert.equal(typeof cat.fetchTargets.table, 'string');
  assert.equal(typeof cat.fetchTargets.matches, 'string');
  assert.equal(cat.defaultGroup, 'MH');
  assert.equal(cat.defaultFocusTeam, 'FBC Tigers Poruba');
  for (const fn of ['renderStaticBracket','renderPhaseList','focusPath','matchCardHtml','resolvePlaceholder','isPlaceholderCell']) {
    assert.equal(typeof cat.bracket[fn], 'function', `bracket.${fn}`);
  }
});
