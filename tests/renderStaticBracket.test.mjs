import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderStaticBracket, tigersBracketPath } from '../lib/bracket.js';

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

// Scénář jako v produkci: MH seedy 2/3/4 prohrají 16F-A, takže seed týmy nejsou
// v 8F-A/4F-A. Uzly A-větve se musí mapovat na zápas týmu, který se na linii seedu
// SKUTEČNĚ dostal (vítěz 16F), ne na seed. To řeší winner-walk.
function divergedAFixture() {
  const t = (name) => ({ team: name, points: 6, scored: 10, conceded: 4 });
  const table = {
    groups: {
      MH: [
        { rank: 1, ...t('FBC TIGERS PORUBA') },
        { rank: 2, ...t('BETA SEED') },
        { rank: 3, ...t('GAMA SEED') },
        { rank: 4, ...t('DELTA SEED') },
      ],
    },
  };
  const matches = { matches: [
    // 16F-A: seedy 2/3/4 prohrají, postupují jejich soupeři
    { id: 101, phase: '16F-A', home: 'FBC TIGERS PORUBA', away: 'OPP1', score: { home: 5, away: 1 } },
    { id: 102, phase: '16F-A', home: 'BETA SEED', away: 'WIN BETA', score: { home: 1, away: 5 } },
    { id: 103, phase: '16F-A', home: 'GAMA SEED', away: 'WIN GAMA', score: { home: 0, away: 3 } },
    { id: 104, phase: '16F-A', home: 'DELTA SEED', away: 'WIN DELTA', score: { home: 2, away: 9 } },
    // 8F-A: reálná jména; Tigers prohrají (jako v produkci), ostatní vítězové postoupí
    { id: 201, phase: '8F-A', home: 'FBC TIGERS PORUBA', away: 'OA1', score: { home: 1, away: 4 } },
    { id: 202, phase: '8F-A', home: 'WIN BETA', away: 'OA2', score: { home: 6, away: 2 } },
    { id: 203, phase: '8F-A', home: 'WIN GAMA', away: 'OA3', score: { home: 3, away: 2 } },
    { id: 204, phase: '8F-A', home: 'WIN DELTA', away: 'OA4', score: { home: 7, away: 0 } },
    // 4F-A: reálná jména (vítězové 8F-A na liniích)
    { id: 301, phase: '4F-A', home: 'OA1', away: 'Z1', score: null },
    { id: 302, phase: '4F-A', home: 'WIN BETA', away: 'Z2', score: null },
    { id: 303, phase: '4F-A', home: 'WIN GAMA', away: 'Z3', score: null },
    { id: 304, phase: '4F-A', home: 'WIN DELTA', away: 'Z4', score: null },
  ] };
  return { matches, table };
}

test('renderStaticBracket: 8F-A uzly mapují na vítěze 16F (seed prohrál) — winner-walk', () => {
  const { matches, table } = divergedAFixture();
  const src = renderStaticBracket(matches, table);
  // OF_A2 = linie H2: BETA SEED prohrál → WIN BETA postoupil
  const a2 = nodeLabel(src, 'OF_A2');
  assert.ok(a2 && a2.includes('WIN BETA'), `OF_A2 má ukázat WIN BETA (vítěz H2 linie), ale je: "${a2}"`);
  assert.ok(!a2.includes('BETA SEED'), `OF_A2 nesmí ukázat poražený seed BETA SEED: "${a2}"`);
  // OF_A3, OF_A4 obdobně
  assert.ok(nodeLabel(src, 'OF_A3').includes('WIN GAMA'), 'OF_A3 → WIN GAMA');
  assert.ok(nodeLabel(src, 'OF_A4').includes('WIN DELTA'), 'OF_A4 → WIN DELTA');
});

test('renderStaticBracket: 4F-A uzly sledují linii dál po vítězích 8F-A — winner-walk', () => {
  const { matches, table } = divergedAFixture();
  const src = renderStaticBracket(matches, table);
  // QF_A1 = linie H1: Tigers vyhráli 16F, prohráli 8F-A → OA1 postoupil do 4F-A
  const q1 = nodeLabel(src, 'QF_A1');
  assert.ok(q1 && q1.includes('OA1'), `QF_A1 má sledovat vítěze 8F-A na H1 linii (OA1), ale je: "${q1}"`);
  // QF_A2 = linie H2: WIN BETA vyhrál 8F-A → pokračuje do 4F-A
  assert.ok(nodeLabel(src, 'QF_A2').includes('WIN BETA'), 'QF_A2 → WIN BETA');
});

test('renderStaticBracket: prohra v 8F-A = vyřazení (Tigers NEpadají do 4F-B)', () => {
  // A-větev je čisté vyřazování. Do 4F-B se jde JEN z B-větve (poražení 16F-A → 8F-B →
  // 4F-B). Tigers po prohře 8F-A končí — nesmí být v 4F-B ani v cestě/zvýraznění.
  const table = { groups: { MH: [{ rank: 1, team: 'FBC TIGERS PORUBA', points: 9, scored: 20, conceded: 3 }] } };
  const matches = { matches: [
    { id: 1, phase: '16F-A', home: 'FBC TIGERS PORUBA', away: 'OPP', score: { home: 5, away: 1 } },
    { id: 2, phase: '8F-A', home: 'FBC TIGERS PORUBA', away: 'WINNER', score: { home: 1, away: 4 } }, // prohra = konec
    { id: 3, phase: '4F-B', home: 'H1/D4-A2/E3', away: 'G1/C4-B2/F3', score: null },
  ] };

  // Cesta Tigers končí na 8F-A, neobsahuje 4F-B.
  const path = tigersBracketPath(matches, table);
  assert.equal(path[path.length - 1].phase, '8F-A', 'cesta má skončit na 8F-A');
  assert.ok(!path.some(m => m.phase === '4F-B'), 'cesta nesmí obsahovat 4F-B');

  // QF_B1 nesmí ukázat Tigers (jsou vyřazení, do 4F-B nejdou).
  const src = renderStaticBracket(matches, table);
  const q = nodeLabel(src, 'QF_B1');
  assert.ok(!q.includes('FBC TIGERS PORUBA'), `QF_B1 nesmí ukázat vyřazené Tigers: "${q}"`);
});

test('renderStaticBracket: 8F-B uzel na linii vítěze 16F ukáže poraženého (ne prázdno)', () => {
  // Na linii H1 Tigers VYHRÁLI 16F → do 8F-B (poražení 16F-A) padl jejich soupeř.
  // OF_B1 se proto nesmí hledat podle seedu (Tigers), ale podle poraženého 16F.
  const table = { groups: { MH: [{ rank: 1, team: 'FBC TIGERS PORUBA', points: 9, scored: 20, conceded: 3 }] } };
  const matches = { matches: [
    { id: 1, phase: '16F-A', home: 'FBC TIGERS PORUBA', away: 'Porazeny 16', score: { home: 5, away: 1 } },
    { id: 2, phase: '8F-B', home: 'Porazeny 16', away: 'Souper B', score: null },
  ] };
  const src = renderStaticBracket(matches, table);
  const b1 = nodeLabel(src, 'OF_B1');
  assert.ok(b1.includes('Porazeny 16'), `OF_B1 má ukázat poraženého H1 16F: "${b1}"`);
  assert.ok(b1.includes('Souper B'), `OF_B1 má ukázat i jeho soupeře: "${b1}"`);
});
