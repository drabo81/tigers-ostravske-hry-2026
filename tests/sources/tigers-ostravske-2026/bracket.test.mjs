import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderBracket } from '../../../sources/tigers-ostravske-2026/bracket.js';

const FOCUS = 'FBC Tigers Poruba';

const scenarios = [
  { scn: 'po-skupina', snap: 'po-skupine' },
  { scn: 'po-16f', snap: 'po-16f' },
  { scn: 'turnaj-dohran', snap: 'turnaj-dohran' }
];
for (const { scn, snap } of scenarios) {
  test(`renderBracket parity: ${scn}`, () => {
    const matches = JSON.parse(readFileSync(new URL(`../../../sources/tigers-ostravske-2026/demos/${scn}/matches.json`, import.meta.url), 'utf8'));
    const table   = JSON.parse(readFileSync(new URL(`../../../sources/tigers-ostravske-2026/demos/${scn}/table.json`, import.meta.url), 'utf8'));
    const expected = readFileSync(new URL(`./__snapshots__/${snap}.mmd`, import.meta.url), 'utf8');
    assert.equal(renderBracket(matches, table, FOCUS), expected);
  });
}

test('renderBracket: flowchart string', () => {
  const model = renderBracket({ matches: [] }, { groups: { MH: [], MD: [], ME: [] } }, FOCUS);
  assert.match(model, /^flowchart TD/);
});
