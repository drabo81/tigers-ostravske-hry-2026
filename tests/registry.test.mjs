import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SOURCES } from '../sources/registry.js';

test('registry: obsahuje tigers zdroj s lehkými metadaty', () => {
  const s = SOURCES.find(x => x.id === 'tigers-ostravske-2026');
  assert.ok(s, 'tigers zdroj chybí');
  assert.equal(typeof s.label, 'string');
  assert.equal(typeof s.activeFrom, 'string');
  assert.equal(typeof s.activeTo, 'string');
  assert.ok(Array.isArray(s.categories) && s.categories.length >= 1);
  assert.equal(typeof s.load, 'function');
});

test('registry: lazy load vrátí plný SourceDefinition s kontraktem', async () => {
  const s = SOURCES.find(x => x.id === 'tigers-ostravske-2026');
  const mod = await s.load();
  const def = mod.default;
  assert.equal(def.id, 'tigers-ostravske-2026');
  assert.equal(typeof def.parseTable, 'function');
  assert.equal(typeof def.parseMatches, 'function');
  const cat = def.categories.find(c => c.id === 'BU13');
  assert.ok(cat, 'BU13 kategorie chybí');
  assert.equal(typeof cat.fetchTargets.table, 'string');
  assert.equal(typeof cat.fetchTargets.matches, 'string');
  assert.equal(typeof cat.renderBracket, 'function');
});
