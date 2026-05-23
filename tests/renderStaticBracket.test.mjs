import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderStaticBracket } from '../lib/bracket.js';

// Stav po dohrání skupin: ostravskehry.cz nahradila placeholdery (H2, D3…)
// reálnými jmény týmů ve fázi 16F-A. Skutečný los se NESHODUJE se statickým
// template párováním (H2→D3 atd.) — proto se zápasy musí dohledávat podle jména.
function finishedGroupsFixture() {
  const table = {
    groups: {
      MH: [
        { rank: 1, team: 'FBC TIGERS PORUBA', points: 9, scored: 27, conceded: 3 },
        { rank: 2, team: 'ACEMA Sparta Praha YELLOW', points: 6, scored: 14, conceded: 14 },
        { rank: 3, team: 'FBS Olomouc bílí', points: 1, scored: 9, conceded: 20 },
        { rank: 4, team: 'FBC Intevo Třinec červení', points: 1, scored: 11, conceded: 24 },
      ],
      MD: [
        { rank: 1, team: 'SK K2 Prostějov modří', points: 6, scored: 16, conceded: 8 },
        { rank: 2, team: 'FBC Dobruška', points: 3, scored: 7, conceded: 12 },
        { rank: 3, team: 'SOKOLI Pardubice', points: 9, scored: 10, conceded: 4 },
        { rank: 4, team: 'FBK Valašské Meziříčí', points: 0, scored: 4, conceded: 13 },
      ],
    },
  };
  const matches = {
    matches: [
      { id: 1, phase: '16F-A', home: 'FBC TIGERS PORUBA', away: 'FBK Valašské Meziříčí', date: '2026-05-23', time: '14:00', score: null },
      { id: 2, phase: '16F-A', home: 'ACEMA Sparta Praha YELLOW', away: 'FBC Dobruška', date: '2026-05-23', time: '14:50', score: null },
      { id: 3, phase: '16F-A', home: 'SK K2 Prostějov modří', away: 'FBS Olomouc bílí', date: '2026-05-23', time: '14:00', score: null },
      { id: 4, phase: '16F-A', home: 'SOKOLI Pardubice', away: 'FBC Intevo Třinec červení', date: '2026-05-23', time: '14:00', score: null },
    ],
  };
  return { matches, table };
}

// Vytáhne label uzlu daného id z mermaid source (řádek `    ID["...label..."]`).
function nodeLabel(src, id) {
  const m = src.match(new RegExp(`^\\s*${id}\\["([\\s\\S]*?)"\\]`, 'm'));
  return m ? m[1] : null;
}

test('renderStaticBracket: uzel H2 zobrazí domácí tým z MH (ne jen "vs soupeř")', () => {
  const { matches, table } = finishedGroupsFixture();
  const src = renderStaticBracket(matches, table);
  const label = nodeLabel(src, 'H2');
  assert.ok(label, 'H2 node missing');
  assert.ok(
    label.includes('ACEMA Sparta Praha YELLOW'),
    `H2 label má obsahovat domácí tým z MH, ale je: "${label}"`
  );
});

test('renderStaticBracket: uzly H3/H4 ukazují reálné páry podle losu, ne stálý template', () => {
  const { matches, table } = finishedGroupsFixture();
  const src = renderStaticBracket(matches, table);

  const h3 = nodeLabel(src, 'H3');
  assert.ok(h3.includes('FBS Olomouc bílí') && h3.includes('Prostějov modří'),
    `H3 má spárovat FBS Olomouc bílí se Prostějov modří, ale je: "${h3}"`);

  const h4 = nodeLabel(src, 'H4');
  assert.ok(h4.includes('Třinec červení') && h4.includes('SOKOLI Pardubice'),
    `H4 má spárovat Třinec červení se SOKOLI Pardubice, ale je: "${h4}"`);
});

// Po dohrání 16F-A se v zápasech 8F-A/8F-B přepíší placeholdery (H1/D4, ✖ A2/E3…)
// reálnými jmény až po jejich odehrání. Dokud nejsou, musí se kód rozložit z výsledku
// 16F-A: 8F-A bere vítěze, 8F-B poraženého.
function after16fFixture() {
  const team = (name, played) => ({ team: name, points: played ? 3 : 0, scored: played ? 5 : 0, conceded: played ? 2 : 0 });
  const table = {
    groups: {
      MH: [{ rank: 1, ...team('TIGERS', true) }, { rank: 2, ...team('MH2', true) }],
      MD: [{ rank: 4, ...team('D4TEAM', true) }],
      MA: [{ rank: 2, ...team('A2TEAM', true) }],
      ME: [{ rank: 3, ...team('E3TEAM', true) }],
    },
  };
  const matches = {
    matches: [
      { id: 11, phase: '16F-A', home: 'TIGERS', away: 'D4TEAM', score: { home: 7, away: 2 } }, // H1 vyhrál
      { id: 12, phase: '16F-A', home: 'A2TEAM', away: 'E3TEAM', score: { home: 1, away: 3 } }, // E3 vyhrál
      { id: 21, phase: '8F-A', home: 'H1/D4', away: 'A2/E3', score: null },
      { id: 31, phase: '8F-B', home: '✖ H1/D4', away: '✖ A2/E3', score: null },
    ],
  };
  return { matches, table };
}

test('renderStaticBracket: 8F-A uzel rozloží vítěze 16F-A (po dohrání 16F)', () => {
  const { matches, table } = after16fFixture();
  const src = renderStaticBracket(matches, table);
  const of = nodeLabel(src, 'OF_A1');
  assert.ok(of && !/\b[A-H]\d+\b/.test(of), `8F-A uzel má mít rozložená jména, ale je: "${of}"`);
  assert.ok(of.includes('TIGERS') && of.includes('E3TEAM'),
    `8F-A má párovat vítěze 16F-A (TIGERS vs E3TEAM), ale je: "${of}"`);
});

test('renderStaticBracket: 8F-B uzel rozloží poražené 16F-A', () => {
  const { matches, table } = after16fFixture();
  const src = renderStaticBracket(matches, table);
  const of = nodeLabel(src, 'OF_B1');
  assert.ok(of && !/\b[A-H]\d+\b/.test(of), `8F-B uzel má mít rozložená jména, ale je: "${of}"`);
  assert.ok(of.includes('D4TEAM') && of.includes('A2TEAM'),
    `8F-B má párovat poražené 16F-A (D4TEAM vs A2TEAM), ale je: "${of}"`);
});

test('renderStaticBracket: stejný tým na obou stranách → "soupeř bude určen" (ne tým proti sobě)', () => {
  // Zdrojová data občas duplikují placeholder (home == away) v B-větvi → po rozkladu
  // by uzel ukázal "X – X". Render to musí ošetřit.
  const table = { groups: { MH: [{ rank: 1, team: 'TIGERS', points: 9, scored: 27, conceded: 3 }] } };
  const matches = { matches: [{ id: 1, phase: '16F-A', home: 'TIGERS', away: 'TIGERS', score: null }] };
  const src = renderStaticBracket(matches, table);
  const h1 = nodeLabel(src, 'H1');
  assert.ok(!/TIGERS\s*–\s*TIGERS/.test(h1), `nesmí ukázat tým proti sobě, ale je: "${h1}"`);
  assert.ok(h1.includes('soupeř bude určen'), `má ukázat "soupeř bude určen", ale je: "${h1}"`);
});
