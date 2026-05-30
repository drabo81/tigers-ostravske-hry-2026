import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveCode, highlightPath, renderMermaid } from '../lib/bracket-engine.js';

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

const model = {
  nodes: [
    { id: 'ZC1', round: 'MH skupina', home: 'FBC Tigers Poruba', away: 'Soupeř A',
      score: { home: 5, away: 3 }, venue: 'SPŠ', when: '22.5. 11:15', shape: 'box', forceHighlight: false },
    { id: 'H2',  round: '16F-A · H2', home: 'Jiný tým', away: 'D-team3',
      score: null, venue: 'VŠB', when: '23.5. 14:50', shape: 'box', forceHighlight: false },
    { id: 'FIN', round: '🏆 FINÁLE A', home: 'H1', away: 'H3',
      score: null, venue: 'Sareza', when: '24.5. 13:00', shape: 'rounded', forceHighlight: false },
  ],
  edges: [
    { from: 'ZC1', to: 'H2', label: 'výhra' },
    { from: 'H2', to: 'FIN', label: 'výhra' },
  ],
};

test('highlightPath: označí uzly s focus týmem', () => {
  const set = highlightPath(model, 'FBC Tigers Poruba');
  assert.ok(set.has('ZC1'));
  assert.ok(!set.has('H2'));
  assert.ok(!set.has('FIN'));
});

test('highlightPath: forceHighlight + prázdný focus', () => {
  const m2 = { nodes: [{ id: 'START', forceHighlight: true }], edges: [] };
  assert.ok(highlightPath(m2, 'FBC Tigers Poruba').has('START'));
  assert.equal(highlightPath(m2, null).size, 0); // bez focusu nic
});

test('renderMermaid: flowchart TD se všemi uzly a hranami', () => {
  const out = renderMermaid(model, { highlighted: new Set(['ZC1']), focusTeam: 'FBC Tigers Poruba' });
  assert.match(out, /^flowchart TD/);
  assert.ok(out.includes('ZC1'));
  assert.ok(out.includes('FIN'));
  assert.match(out, /ZC1\s*-->\s*\|\s*výhra\s*\|\s*H2/);
  assert.match(out, /FIN\(\["/);
  assert.match(out, /style ZC1 fill:#ff6600/);
});

test('renderMermaid: skóre a label v uzlu', () => {
  const out = renderMermaid(model, { highlighted: new Set(), focusTeam: null });
  assert.ok(out.includes('5 : 3'));
  assert.ok(out.includes('MH skupina'));
});
