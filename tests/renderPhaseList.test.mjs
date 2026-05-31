import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseHTML } from 'linkedom';
import { parseMatches, parseTable } from '../sources/ostravske-hry-2026/parser.js';
import { renderPhaseList } from '../sources/ostravske-hry-2026/bracket.js';

const matchesHtml = readFileSync(
  new URL('./fixtures/2026-05-19-before-tournament-matches.html', import.meta.url),
  'utf8'
);
const tableHtml = readFileSync(
  new URL('./fixtures/2026-05-19-before-tournament-table.html', import.meta.url),
  'utf8'
);
const fixtureMatches = parseMatches(parseHTML(matchesHtml).document);
const fixtureTable = parseTable(parseHTML(tableHtml).document);

test('renderPhaseList: prázdná data — 9 fází, všechny collapsed', () => {
  const html = renderPhaseList({ matches: [] }, { groups: {} });
  const detailsCount = (html.match(/<details/g) || []).length;
  assert.equal(detailsCount, 9, `expected 9 <details>, got ${detailsCount}`);
  assert.ok(!html.includes('<details open>'), 'no <details> should be open with empty data');
});

test('renderPhaseList: Tigers v group — Skupina MH má třídu tigers a je otevřená', () => {
  const tigerMatch = {
    id: 9001,
    phase: 'group',
    group: 'MH',
    home: 'FBC TIGERS PORUBA',
    away: 'Opponent A',
    date: '2026-05-22',
    time: '11:15',
    venue: 'Hala A',
    score: null,
  };
  const html = renderPhaseList({ matches: [tigerMatch] }, { groups: {} });

  // Skupina MH details should be open
  const groupDetailsMatch = html.match(/<details([^>]*)>[\s\S]*?Skupina MH/);
  assert.ok(groupDetailsMatch, 'Skupina MH details not found');
  assert.ok(groupDetailsMatch[1].includes('open'), 'Skupina MH should be open when Tigers play there');

  // summary span should have class "tigers"
  assert.ok(html.includes('class="phase-meta tigers"'), 'Tigers hrají class should be present');
  assert.ok(html.includes('Tigers hrají'), 'summary should contain "Tigers hrají"');
});

test('renderPhaseList: výhra v 16F → Čtvrtfinále A (8F-A) je rozbalené jako nadcházející', () => {
  // Tigers won 16F-A → their next match is in 8F-A (no score yet)
  const group1 = { id: 1, phase: 'group', group: 'MH', home: 'FBC TIGERS PORUBA', away: 'X', date: '2026-05-22', time: '11:15', venue: 'H', score: { home: 5, away: 2 } };
  const group2 = { id: 2, phase: 'group', group: 'MH', home: 'FBC TIGERS PORUBA', away: 'Y', date: '2026-05-22', time: '20:15', venue: 'H', score: { home: 3, away: 1 } };
  const group3 = { id: 3, phase: 'group', group: 'MH', home: 'FBC TIGERS PORUBA', away: 'Z', date: '2026-05-23', time: '10:15', venue: 'H', score: { home: 4, away: 0 } };
  // Tigers in MH rank 1 means code H1. Table: MH with Tigers at rank 1.
  const tableWithTigers = {
    groups: {
      MH: [
        { rank: 1, team: 'FBC TIGERS PORUBA', scored: 12, conceded: 3, points: 9 },
        { rank: 2, team: 'Opponent B',         scored: 6,  conceded: 6, points: 6 },
        { rank: 3, team: 'Opponent C',         scored: 3,  conceded: 12, points: 0 },
      ],
    },
  };
  // 16F-A match: Tigers (H1) won
  const m16 = { id: 101, phase: '16F-A', home: 'FBC TIGERS PORUBA', away: 'D4', date: '2026-05-23', time: '14:00', venue: 'H', score: { home: 3, away: 1 } };
  // 8F-A match: not yet played
  const m8 = { id: 201, phase: '8F-A', home: 'FBC TIGERS PORUBA', away: 'H1/D4', date: '2026-05-23', time: '19:00', venue: 'H', score: null };

  const allMatches = [group1, group2, group3, m16, m8];
  const html = renderPhaseList({ matches: allMatches }, tableWithTigers);

  // Čtvrtfinále A (8F-A) should be open because it's the upcoming match in tigersBracketPath
  const blocks = html.split('<details');
  // Find the 8F-A block
  const eightFABlock = blocks.find(b => b.includes('Čtvrtfinále A'));
  assert.ok(eightFABlock, 'Čtvrtfinále A block not found');
  assert.ok(eightFABlock.trimStart().startsWith('open>'), 'Čtvrtfinále A should be open as upcoming phase');
});

test('renderPhaseList: placeholdery — fáze bez reálných zápasů obsahuje text "soupeři budou určeni"', () => {
  const html = renderPhaseList({ matches: [] }, { groups: {} });
  assert.ok(
    html.includes('soupeři budou určeni'),
    'placeholder phases should render "soupeři budou určeni"'
  );
});

test('renderPhaseList: pořadí fází — 9 details v deklarovaném pořadí', () => {
  const html = renderPhaseList(fixtureMatches, fixtureTable);
  const labels = ['Skupina MH', 'Šestnáctifinále A', 'Šestnáctifinále B', 'Čtvrtfinále A', 'Čtvrtfinále B', 'Semifinále A', 'Semifinále B', 'Finále A', 'Finále B'];

  const detailsCount = (html.match(/<details/g) || []).length;
  assert.equal(detailsCount, 9, `expected 9 <details>, got ${detailsCount}`);

  let lastIdx = -1;
  for (const label of labels) {
    const idx = html.indexOf(label);
    assert.ok(idx > lastIdx, `"${label}" should appear after previous label (lastIdx=${lastIdx}, idx=${idx})`);
    lastIdx = idx;
  }
});
