// Vyplní všechny zápasy do 24.5. 13:46 (tedy včetně SF-B v 13:45).
// Tigers postupují deterministicky: výhra MH → výhra 16F-A → prohra 8F-A
// → výhra 4F-B → výhra SF-B → FINAL-B (zatím neodehráno, je v 15:30).
// Ostatní výsledky náhodné (deterministicky díky seedu).

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const CUTOFF = process.argv[2] || '2026-05-24 11:31';
const OUTPUT_DIR = process.argv[3] || 'data';

function mulberry32(seed) {
  return () => {
    let t = (seed += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260524);
const randInt = (min, max) => Math.floor(rand() * (max - min + 1)) + min;

function randPlayoffScore() {
  let h = randInt(1, 7), a = randInt(0, 7);
  if (h === a) a = (a + 1) % 8;
  return { home: h, away: a, status: 'final' };
}
function randGroupScore() {
  return { home: randInt(0, 6), away: randInt(0, 6), status: 'final' };
}

const TIGERS = 'FBC TIGERS PORUBA';
const POSITION_GROUPS = { A: 'MA', B: 'MB', C: 'MC', D: 'MD', E: 'ME', F: 'MF', G: 'MG', H: 'MH' };

// Čistý placeholder základ (všechny play-off zápasy jako kódy) — NE živá data, která už
// jsou rozehraná a token-based rozklad by na nich selhal.
const BASE_DIR = 'data/demo/_base';
const matchData = JSON.parse(await readFile(`${BASE_DIR}/matches.json`, 'utf8'));
const tableData = JSON.parse(await readFile(`${BASE_DIR}/table.json`, 'utf8'));

// Uložit originální placeholdery PŘED jakoukoli modifikací cells.
for (const m of matchData.matches) {
  m._homeOriginal = m.home;
  m._awayOriginal = m.away;
}

function cellTokens(cell) {
  if (!cell) return [];
  return cell.replace(/^✖\s*/, '').trim().split(/[\/-]/).map(s => s.trim()).filter(Boolean);
}
function sortedKey(tokens) {
  return [...tokens].sort().join(',');
}
function pairKey(homeCell, awayCell) {
  return sortedKey([...cellTokens(homeCell), ...cellTokens(awayCell)]);
}
function isLossCell(cell) {
  return typeof cell === 'string' && cell.trim().startsWith('✖');
}
function isTigersInMatch(m) { return m.home === TIGERS || m.away === TIGERS; }

// ──────────── Fáze 1: skupinové zápasy ────────────
for (const m of matchData.matches.filter(x => x.phase === 'group')) {
  if (isTigersInMatch(m)) {
    if (m.home === TIGERS) m.score = { home: randInt(3, 7), away: randInt(0, 2), status: 'final' };
    else                   m.score = { home: randInt(0, 2), away: randInt(3, 7), status: 'final' };
  } else {
    m.score = randGroupScore();
  }
}

// ──────────── Fáze 2: spočítat table ────────────
// Pravidla pro určení pořadí (zdroj: ostravskehry.cz/florbal/pravidla-1):
//   1. Celkový počet bodů
//   2. Body ze vzájemných utkání        ← tie-break
//   3. Rozdíl skóre ze vzájemných utkání
//   4. Vstřelené branky ze vzájemných utkání
//   5. Celkový rozdíl skóre
//   6. Celkový počet vstřelených branek
//   7. Los
function buildMiniTable(teamsCluster, allGroupMatches) {
  const teamNames = new Set(teamsCluster.map(t => t.team));
  const mini = new Map();
  for (const t of teamsCluster) mini.set(t.team, { team: t.team, points: 0, scored: 0, conceded: 0 });
  for (const m of allGroupMatches) {
    if (!teamNames.has(m.home) || !teamNames.has(m.away)) continue;
    const h = mini.get(m.home);
    const a = mini.get(m.away);
    h.scored += m.score.home; h.conceded += m.score.away;
    a.scored += m.score.away; a.conceded += m.score.home;
    if (m.score.home > m.score.away) h.points += 3;
    else if (m.score.away > m.score.home) a.points += 3;
    else { h.points++; a.points++; }
  }
  return mini;
}

function rankGroup(teamsArray, allGroupMatches) {
  // Krok 1: clusterovat podle celkových bodů
  const byPoints = new Map();
  for (const t of teamsArray) {
    if (!byPoints.has(t.points)) byPoints.set(t.points, []);
    byPoints.get(t.points).push(t);
  }
  const result = [];
  for (const pts of [...byPoints.keys()].sort((a, b) => b - a)) {
    const cluster = byPoints.get(pts);
    if (cluster.length === 1) {
      result.push(cluster[0]);
      continue;
    }
    // Krok 2: tie-break přes mini-tabulku vzájemných zápasů
    const mini = buildMiniTable(cluster, allGroupMatches);
    cluster.sort((x, y) => {
      const mx = mini.get(x.team);
      const my = mini.get(y.team);
      return (my.points - mx.points) ||
             ((my.scored - my.conceded) - (mx.scored - mx.conceded)) ||
             (my.scored - mx.scored) ||
             ((y.scored - y.conceded) - (x.scored - x.conceded)) ||
             (y.scored - x.scored) ||
             (rand() - 0.5);   // los — deterministický PRNG seed
    });
    result.push(...cluster);
  }
  return result;
}

const allGroupCodes = ['MA', 'MB', 'MC', 'MD', 'ME', 'MF', 'MG', 'MH'];
for (const groupCode of allGroupCodes) {
  const groupMatches = matchData.matches.filter(x => x.phase === 'group' && x.group === groupCode);
  if (groupMatches.length === 0) continue;
  const teams = new Map();
  const ensure = (name) => {
    if (!teams.has(name)) teams.set(name, { team: name, wins: 0, draws: 0, losses: 0, scored: 0, conceded: 0, points: 0 });
    return teams.get(name);
  };
  for (const m of groupMatches) {
    const h = ensure(m.home);
    const a = ensure(m.away);
    h.scored += m.score.home; h.conceded += m.score.away;
    a.scored += m.score.away; a.conceded += m.score.home;
    if (m.score.home > m.score.away) { h.wins++; a.losses++; h.points += 3; }
    else if (m.score.away > m.score.home) { a.wins++; h.losses++; a.points += 3; }
    else { h.draws++; a.draws++; h.points++; a.points++; }
  }
  let ranked = rankGroup([...teams.values()], groupMatches);
  // Tigers force na 1. místo v MH (simulace má jejich výhry deterministické,
  // takže přirozeně 1. by být měli — fallback ochrana proti edge cases)
  if (groupCode === 'MH') {
    const idx = ranked.findIndex(r => r.team === TIGERS);
    if (idx > 0) { const t = ranked.splice(idx, 1)[0]; ranked.unshift(t); }
  }
  tableData.groups[groupCode] = ranked.map((r, i) => ({
    rank: i + 1, team: r.team, scored: r.scored, conceded: r.conceded, points: r.points,
  }));
}

function resolveSingleCode(code) {
  const m = code.match(/^([A-H])(\d+)$/);
  if (!m) return null;
  const grp = POSITION_GROUPS[m[1]];
  const row = tableData.groups[grp]?.find(r => r.rank === parseInt(m[2], 10));
  return row?.team ?? null;
}

// ──────────── Fáze 3: round-by-round play-off ────────────
//
// Per round, držíme:
//   winnersByKey:  Map<set-key, team-name>  — kdo postoupil dál
//   losersByKey:   Map<set-key, team-name>  — kdo padl do B větve

const winners16 = new Map();  // sortedKey 2-token (např. "D4,H1") → winner team
const losers16  = new Map();  // sortedKey 2-token → loser team
const winners8A = new Map();  // sortedKey 4-token → winner of 8F-A
const winners4A = new Map();  // sortedKey 8-token → winner of 4F-A
const winnersSFA = new Map(); // sortedKey 16-token → winner of SF-A

// Tigers (seed H1) jsou v demu šampioni A-větve — vyhrají každé kolo.
const TIGERS_FATE = {
  '16F-A':   { score: { home: 7, away: 2 } },
  '8F-A':    { score: { home: 5, away: 3 } },
  '4F-A':    { score: { home: 4, away: 2 } },
  'SF-A':    { score: { home: 6, away: 4 } },
  'FINAL-A': { score: { home: 3, away: 2 } },
};

function applyScore(m, tigersInvolved) {
  if (tigersInvolved && TIGERS_FATE[m.phase]) {
    // fate.score je vždy perspektivou "Tigers jako home" (home = jejich body, away = soupeř)
    const fate = TIGERS_FATE[m.phase];
    if (m.home === TIGERS) {
      m.score = { ...fate.score, status: 'final' };
    } else {
      m.score = { home: fate.score.away, away: fate.score.home, status: 'final' };
    }
  } else {
    m.score = randPlayoffScore();
  }
}

function decideWinnerLoser(m) {
  const homeWon = m.score.home > m.score.away;
  return { winner: homeWon ? m.home : m.away, loser: homeWon ? m.away : m.home };
}

const beforeCutoff = (m) => `${m.date} ${m.time}` < CUTOFF;

// ── 16F-A ──
for (const m of matchData.matches.filter(x => x.phase === '16F-A' && beforeCutoff(x))) {
  m.home = resolveSingleCode(m._homeOriginal) ?? m._homeOriginal;
  m.away = resolveSingleCode(m._awayOriginal) ?? m._awayOriginal;
  applyScore(m, isTigersInMatch(m));
  const key = pairKey(m._homeOriginal, m._awayOriginal);
  const { winner, loser } = decideWinnerLoser(m);
  winners16.set(key, winner);
  losers16.set(key, loser);
}

// ── 8F-A: home cell je "X/Y" composite = winner of 16F-A {X, Y}. Poražený VYPADÁVÁ
//    (A-větev je čisté vyřazování — do B-větve se z A nepostupuje). ──
for (const m of matchData.matches.filter(x => x.phase === '8F-A' && beforeCutoff(x))) {
  const hKey = sortedKey(cellTokens(m._homeOriginal));
  const aKey = sortedKey(cellTokens(m._awayOriginal));
  m.home = winners16.get(hKey) ?? m._homeOriginal;
  m.away = winners16.get(aKey) ?? m._awayOriginal;
  applyScore(m, isTigersInMatch(m));
  const matchKey = pairKey(m._homeOriginal, m._awayOriginal);
  winners8A.set(matchKey, decideWinnerLoser(m).winner);
}

// ── 4F-A: cells "X/Y/Z/W" composite = winner of 8F-A {X, Y, Z, W} ──
for (const m of matchData.matches.filter(x => x.phase === '4F-A' && beforeCutoff(x))) {
  const hKey = sortedKey(cellTokens(m._homeOriginal));
  const aKey = sortedKey(cellTokens(m._awayOriginal));
  m.home = winners8A.get(hKey) ?? m._homeOriginal;
  m.away = winners8A.get(aKey) ?? m._awayOriginal;
  applyScore(m, isTigersInMatch(m));
  winners4A.set(pairKey(m._homeOriginal, m._awayOriginal), decideWinnerLoser(m).winner);
}

// ── SF-A: 8-token composite cell = winner of 4F-A {set} ──
for (const m of matchData.matches.filter(x => x.phase === 'SF-A' && beforeCutoff(x))) {
  const hKey = sortedKey(cellTokens(m._homeOriginal));
  const aKey = sortedKey(cellTokens(m._awayOriginal));
  m.home = winners4A.get(hKey) ?? m._homeOriginal;
  m.away = winners4A.get(aKey) ?? m._awayOriginal;
  applyScore(m, isTigersInMatch(m));
  winnersSFA.set(pairKey(m._homeOriginal, m._awayOriginal), decideWinnerLoser(m).winner);
}

// ── B-VĚTEV (útěcha pro poražené 16F-A): 8F-B → 4F-B → SF-B → FINÁLE B. Poražení 16F-A
//    hrají 8F-B; vítězové postupují do 4F-B atd. Placeholder kódy 4F-B/SF-B/FINÁLE B
//    odkazují na A-linii (nereálné) — postupující proto přiřazujeme POŘADOVĚ (vítězové
//    předchozího B-kola, seřazení podle id zápasu). Pro demo je to validní, plně určené
//    rozlosování; renderer si týmy stejně dohledá podle jména. ──

// 8F-B: cells "✖ X/Y" = poražený 16F-A {X, Y}.
for (const m of matchData.matches.filter(x => x.phase === '8F-B' && beforeCutoff(x))) {
  const hKey = sortedKey(cellTokens(m._homeOriginal));
  const aKey = sortedKey(cellTokens(m._awayOriginal));
  m.home = losers16.get(hKey) ?? m._homeOriginal;
  m.away = losers16.get(aKey) ?? m._awayOriginal;
  applyScore(m, isTigersInMatch(m));
}

// Pomocník: vítězové fáze (odehrané) seřazení podle id zápasu.
function winnersOf(phase) {
  return matchData.matches
    .filter(x => x.phase === phase && x.score)
    .sort((a, b) => a.id - b.id)
    .map(s => s.score.home > s.score.away ? s.home : s.away);
}
// Pomocník: naplní zápasy `phase` (seřazené podle id) dvojicemi z `feeders` a odehraje je.
function fillBracketRound(phase, feeders) {
  const ms = matchData.matches
    .filter(x => x.phase === phase && beforeCutoff(x))
    .sort((a, b) => a.id - b.id);
  ms.forEach((m, i) => {
    if (feeders[2 * i]) m.home = feeders[2 * i];
    if (feeders[2 * i + 1]) m.away = feeders[2 * i + 1];
    if (m.home && m.away) applyScore(m, isTigersInMatch(m));
  });
}
fillBracketRound('4F-B', winnersOf('8F-B'));
fillBracketRound('SF-B', winnersOf('4F-B'));

// ── FINÁLE (placeholdery home/away jsou prázdné — bereme vítěze SF). ──
const finalA = matchData.matches.find(x => x.phase === 'FINAL-A' && beforeCutoff(x));
if (finalA) {
  const [w1, w2] = winnersOf('SF-A');
  if (w1) finalA.home = w1;
  if (w2) finalA.away = w2;
  if (finalA.home && finalA.away) applyScore(finalA, isTigersInMatch(finalA)); // Tigers šampioni
}

const finalB = matchData.matches.find(x => x.phase === 'FINAL-B' && beforeCutoff(x));
if (finalB) {
  const [w1, w2] = winnersOf('SF-B');
  if (w1) finalB.home = w1;
  if (w2) finalB.away = w2;
  if (finalB.home && finalB.away) applyScore(finalB, isTigersInMatch(finalB));
}

// _homeOriginal a _awayOriginal NECHÁVÁME — renderer je používá pro placeholder lookup.

await mkdir(OUTPUT_DIR, { recursive: true });
tableData.scraped_at = new Date().toISOString();
await writeFile(join(OUTPUT_DIR, 'table.json'), JSON.stringify(tableData, null, 2));
matchData.scraped_at = new Date().toISOString();
await writeFile(join(OUTPUT_DIR, 'matches.json'), JSON.stringify(matchData, null, 2));
await writeFile(join(OUTPUT_DIR, 'meta.json'), JSON.stringify({
  last_success_at: new Date().toISOString(),
  last_attempt_at: new Date().toISOString(),
  last_attempt_status: 'ok',
  source: `ostravskehry.cz (SIMULATED — cutoff ${CUTOFF})`,
}, null, 2));

console.log(`✓ Simulace zapsána (cutoff: ${CUTOFF}). Tigers zápasy:`);
const tigersMatches = matchData.matches
  .filter(x => x.home === TIGERS || x.away === TIGERS)
  .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
for (const t of tigersMatches) {
  const score = t.score ? `${t.score.home}:${t.score.away}` : 'čeká se';
  console.log(`  ${t.phase.padEnd(8)} ${t.date} ${t.time} | ${t.home} – ${t.away} | ${score}`);
}
console.log('  Lokální server: python -m http.server 5173');
console.log('  Návrat na reálná data: git checkout -- data/');
