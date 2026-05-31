import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseHTML } from 'linkedom';
import { parseMatches, parseTable } from '../sources/ostravske-hry-2026/parser.js';
import { tigersPath, renderMermaid } from '../sources/ostravske-hry-2026/bracket.js';

const matchesHtml = readFileSync(
  new URL('./fixtures/2026-05-19-before-tournament-matches.html', import.meta.url),
  'utf8'
);
const tableHtml = readFileSync(
  new URL('./fixtures/2026-05-19-before-tournament-table.html', import.meta.url),
  'utf8'
);
const matches = parseMatches(parseHTML(matchesHtml).document);
const table = parseTable(parseHTML(tableHtml).document);
const path = tigersPath(matches, table);

test('renderMermaid: vrací flowchart LR source', () => {
  const out = renderMermaid(path, table);
  assert.match(out, /^flowchart LR/m);
});

test('renderMermaid: obsahuje uzel pro každý match v path', () => {
  const out = renderMermaid(path, table);
  for (const m of path) {
    assert.ok(out.includes(`M${m.id}`), `node M${m.id} missing in output`);
  }
});

test('renderMermaid: label uzlu obsahuje home vs away', () => {
  const out = renderMermaid(path, table);
  const sixteenF = path.find(m => m.phase === '16F-A');
  if (sixteenF) {
    // Po nahrazení placeholderu (Tigers rank 1 → "H1" → "FBC TIGERS PORUBA")
    // očekáváme jméno Tigers nebo placeholder kód.
    assert.ok(
      out.includes('TIGERS') || out.includes('H1'),
      'label 16F-A node missing Tigers reference'
    );
  }
});

test('renderMermaid: edges propojují konsekutivní fáze (win-branch)', () => {
  const out = renderMermaid(path, table);
  // Hledáme alespoň jeden přechod z group→16F-A, 16F-A→8F-A, atd.
  // Edges mají formát "M{id1} -->|...| M{id2}"
  const edgeCount = (out.match(/M\d+\s*-->\s*(\|[^|]*\|)?\s*M\d+/g) || []).length;
  assert.ok(edgeCount > 0, `expected at least one edge, got ${edgeCount}`);
});

test('renderMermaid: Tigers/group uzly mají oranžový style', () => {
  const out = renderMermaid(path, table);
  // V skupinové fázi je Tigers explicitně přítomen, takže styling musí existovat
  assert.match(out, /style M\d+ fill:#ff6600/);
});
