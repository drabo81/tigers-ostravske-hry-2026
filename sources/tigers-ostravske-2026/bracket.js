import { normalizeTeamName } from '../../lib/shared.js';
import { resolveCode as engineResolveCode } from '../../lib/bracket-engine.js';

const POSITION_GROUPS = { H: 'MH', D: 'MD', E: 'ME', A: 'MA', B: 'MB', C: 'MC', F: 'MF', G: 'MG' };

function resolveCode(code, table) { return engineResolveCode(code, table, POSITION_GROUPS); }

function isFocusTeam(name, focusTeam) {
  if (!name || !focusTeam) return false;
  return normalizeTeamName(name) === normalizeTeamName(focusTeam);
}

/**
 * Najde focus tým v tabulce MH a vrátí jejich pozici jako kód (např. "H1", "H3").
 * Vrací null, pokud tým v tabulce není, nebo tabulka MH je prázdná.
 */
function focusPositionCode(table, focusTeam) {
  const mh = table?.groups?.MH;
  if (!Array.isArray(mh) || mh.length === 0) return null;
  // Pokud žádný zápas ještě nebyl odehrán, rank je jen iniciální abecední seed —
  // nelze podle něj určit reálnou pozici Tigers v pavouku.
  const anyGamePlayed = mh.some(r => r.points > 0 || r.scored > 0 || r.conceded > 0);
  if (!anyGamePlayed) return null;
  const team = mh.find(row => isFocusTeam(row.team, focusTeam));
  if (!team) return null;
  return `H${team.rank}`;
}

/**
 * Kontroluje, zda buňka (home/away) obsahuje konkrétní position code.
 */
export function matchContainsCode(match, code) {
  const homeCell = match._homeOriginal ?? match.home;
  const awayCell = match._awayOriginal ?? match.away;
  for (const cell of [homeCell, awayCell]) {
    if (!cell) continue;
    if (cell === code) return true;
    const stripped = cell.replace(/^✖\s*/, '').trim();
    if (stripped.split(/[\/-]/).map(s => s.trim()).some(part => part === code)) return true;
  }
  return false;
}

// Vrátí token set buňky (např. "H1/D4" → ["H1", "D4"], "✖ H1/D4" → ["H1", "D4"])
function _cellTokens(cell) {
  if (!cell) return [];
  return cell.replace(/^✖\s*/, '').trim().split(/[\/\-]/).map(s => s.trim()).filter(Boolean);
}
function _sortedKey(tokens) {
  return [...tokens].sort().join(',');
}

// Heuristika: je obsah buňky placeholder kódů (všechny tokeny jsou tvaru [A-H]\d+)?
export function isPlaceholderCell(cell) {
  if (!cell) return false;
  const tokens = _cellTokens(cell);
  if (tokens.length === 0) return false;
  return tokens.every(t => /^[A-H]\d+$/.test(t));
}

// Rekurzivně rozloží placeholder buňku na skutečné jméno týmu (pokud je známé).
export function resolvePlaceholder(cell, matches, table) {
  if (!cell) return cell;
  if (!isPlaceholderCell(cell)) return cell;     // už reálné jméno

  const tokens = _cellTokens(cell);
  const isLoss = cell.trim().startsWith('✖');
  const hasDash = cell.includes('-');

  if (tokens.length === 1) {
    return resolveCode(tokens[0], table) ?? cell;
  }

  const key = _sortedKey(tokens);
  let sourcePhase;
  if (tokens.length === 2) sourcePhase = '16F-A';
  else if (tokens.length === 4) sourcePhase = '8F-A';
  else if (tokens.length === 8) sourcePhase = hasDash ? '4F-B' : '4F-A';
  else if (tokens.length === 16) sourcePhase = hasDash ? 'SF-B' : 'SF-A';
  else return cell;

  const candidates = matches.matches.filter(m => m.phase === sourcePhase);
  const sourceMatch = candidates.find(m => {
    const t = [..._cellTokens(m.home), ..._cellTokens(m.away)];
    return t.length > 0 && _sortedKey(t) === key;
  });

  if (!sourceMatch || !sourceMatch.score) return cell;

  const homeWon = sourceMatch.score.home > sourceMatch.score.away;
  const winnerTeam = homeWon ? sourceMatch.home : sourceMatch.away;
  const loserTeam  = homeWon ? sourceMatch.away : sourceMatch.home;

  const resolvedWinner = isPlaceholderCell(winnerTeam)
    ? resolvePlaceholder(winnerTeam, matches, table)
    : winnerTeam;
  const resolvedLoser  = isPlaceholderCell(loserTeam)
    ? resolvePlaceholder(loserTeam, matches, table)
    : loserTeam;

  if (tokens.length === 2 && isLoss) return resolvedLoser;
  if (tokens.length === 2)           return resolvedWinner;
  if (tokens.length === 4 && hasDash) return resolvedLoser;
  if (tokens.length === 4)            return resolvedWinner;
  if (tokens.length === 8 && hasDash) return resolvedWinner;
  if (tokens.length === 8)            return resolvedWinner;
  return resolvedWinner;
}

function findMatchByCodeAndPhase(matches, phase, code, focusCode, focusTeam) {
  // 1) Pokud hledáme zápas na focus týmu pozici, preferuj match s focus team reálným jménem
  if (focusCode && code === focusCode) {
    const byName = matches.matches.find(m =>
      m.phase === phase && (isFocusTeam(m.home, focusTeam) || isFocusTeam(m.away, focusTeam))
    );
    if (byName) return byName;
  }
  // 2) Hledej podle position kódu v placeholderu
  return matches.matches.find(m => m.phase === phase && matchContainsCode(m, code));
}

function tigersHighlightedNodes(matches, table, focusTeam) {
  const set = new Set(['ZC1', 'ZC2', 'ZC3', 'START']);
  const rank = focusPositionCode(table, focusTeam);
  if (!rank) return set;

  const n = rank[1];   // '1', '2', '3', '4'
  set.add(`H${n}`);

  const m16 = findMatchByCodeAndPhase(matches, '16F-A', rank, rank, focusTeam);
  if (!m16?.score) return set;

  const tigersIsHome16 = isFocusTeam(m16.home, focusTeam) || matchContainsCode({ home: m16.home, away: '' }, rank);
  const won16 = tigersIsHome16
    ? m16.score.home > m16.score.away
    : m16.score.away > m16.score.home;

  let phase8, nodePrefix8;
  if (won16) { phase8 = '8F-A'; nodePrefix8 = 'OF_A'; }
  else       { phase8 = '8F-B'; nodePrefix8 = 'OF_B'; }
  set.add(`${nodePrefix8}${n}`);

  const m8 = findMatchByCodeAndPhase(matches, phase8, rank, rank, focusTeam);
  if (!m8?.score) return set;

  const tigersIsHome8 = isFocusTeam(m8.home, focusTeam) || matchContainsCode({ home: m8.home, away: '' }, rank);
  const won8 = tigersIsHome8
    ? m8.score.home > m8.score.away
    : m8.score.away > m8.score.home;

  let phase4, nodePrefix4;
  if (won16 && won8)        { phase4 = '4F-A'; nodePrefix4 = 'QF_A'; }
  else if (won16 && !won8)  { phase4 = '4F-B'; nodePrefix4 = 'QF_B'; }
  else if (!won16 && won8)  { phase4 = '4F-B'; nodePrefix4 = 'QF_B'; }
  else                      { return set; }
  set.add(`${nodePrefix4}${n}`);

  const m4 = findMatchByCodeAndPhase(matches, phase4, rank, rank, focusTeam);
  if (!m4?.score) return set;

  const tigersIsHome4 = isFocusTeam(m4.home, focusTeam) || matchContainsCode({ home: m4.home, away: '' }, rank);
  const won4 = tigersIsHome4
    ? m4.score.home > m4.score.away
    : m4.score.away > m4.score.home;
  if (!won4) return set;

  const sfSlot = (n === '1' || n === '3') ? '2' : '1';
  const inBranchA = (phase4 === '4F-A');
  const phaseSf = inBranchA ? 'SF-A' : 'SF-B';
  const sfPrefix = inBranchA ? 'SF_A' : 'SF_B';
  set.add(`${sfPrefix}${sfSlot}`);

  const mSf = findMatchByCodeAndPhase(matches, phaseSf, rank, rank, focusTeam);
  if (!mSf?.score) return set;

  const tigersIsHomeSf = isFocusTeam(mSf.home, focusTeam) || matchContainsCode({ home: mSf.home, away: '' }, rank);
  const wonSf = tigersIsHomeSf
    ? mSf.score.home > mSf.score.away
    : mSf.score.away > mSf.score.home;
  if (!wonSf) return set;

  set.add(inBranchA ? 'FINAL_A' : 'FINAL_B');
  return set;
}

function nodeLabelStatic(template, match, table, tigersCode, matches) {
  const lines = [];
  if (template.title) lines.push(template.title);

  let homeLabel = '?', awayLabel = '?';
  if (match) {
    homeLabel = matches ? resolvePlaceholder(match.home, matches, table) : match.home;
    awayLabel = matches ? resolvePlaceholder(match.away, matches, table) : match.away;
  } else if (template.opponentPlaceholder) {
    awayLabel = resolveCode(template.opponentPlaceholder, table) || template.opponentPlaceholder;
  }

  if (homeLabel && awayLabel && homeLabel !== '?' && awayLabel !== '?') {
    lines.push(`${homeLabel} – ${awayLabel}`);
  } else if (awayLabel && awayLabel !== '?') {
    lines.push(`vs ${awayLabel}`);
  } else if (homeLabel && homeLabel !== '?') {
    lines.push(homeLabel);
  }

  if (template.when) lines.push(template.when);
  if (template.venue) lines.push(template.venue);
  if (match?.score) lines.push(`${match.score.home} : ${match.score.away}`);
  return lines.join('\\n').replace(/"/g, "'");
}

const STATIC_TEMPLATE = {
  group: [
    { id: 'ZC1', match: 0, when: '22.5. 11:15', venue: 'SPŠ Elektroniky' },
    { id: 'ZC2', match: 1, when: '22.5. 20:15', venue: 'Vítkovická střední A' },
    { id: 'ZC3', match: 2, when: '23.5. 10:15', venue: 'Sareza Přívoz' },
  ],
  sixteenF: [
    { id: 'H1', code: 'H1', title: '16F-A · H1', opponentPlaceholder: 'D4', when: '23.5. 14:00', venue: 'Sareza Přívoz' },
    { id: 'H2', code: 'H2', title: '16F-A · H2', opponentPlaceholder: 'D3', when: '23.5. 14:50', venue: 'VŠB-TUO' },
    { id: 'H3', code: 'H3', title: '16F-A · H3', opponentPlaceholder: 'D2', when: '23.5. 14:00', venue: 'Vítkovická střední A' },
    { id: 'H4', code: 'H4', title: '16F-A · H4', opponentPlaceholder: 'D1', when: '23.5. 14:00', venue: 'ČPP Aréna' },
  ],
  eightA: [
    { id: 'OF_A1', code: 'H1', title: '8F-A',  when: '23.5. 19:00', venue: 'Střední škola Tech.' },
    { id: 'OF_A2', code: 'H2', title: '8F-A',  when: '23.5. 18:10', venue: 'Střední škola Tech.' },
    { id: 'OF_A3', code: 'H3', title: '8F-A',  when: '23.5. 17:30', venue: 'Vítkovická střední A' },
    { id: 'OF_A4', code: 'H4', title: '8F-A',  when: '23.5. 19:00', venue: 'SPŠ Elektroniky' },
  ],
  eightB: [
    { id: 'OF_B1', code: 'H1', title: '8F-B',  when: '24.5. 10:00', venue: 'Vítkovická střední A' },
    { id: 'OF_B2', code: 'H2', title: '8F-B',  when: '24.5. 08:00', venue: 'Vítkovická střední A' },
    { id: 'OF_B3', code: 'H3', title: '8F-B',  when: '24.5. 08:30', venue: 'Třebovice' },
    { id: 'OF_B4', code: 'H4', title: '8F-B',  when: '24.5. 08:00', venue: 'VŠB-TUO' },
  ],
  fourA: [
    { id: 'QF_A1', code: 'H1', title: '4F-A',  when: '24.5. 08:00', venue: 'ČPP Aréna' },
    { id: 'QF_A2', code: 'H2', title: '4F-A',  when: '24.5. 08:00', venue: 'SPŠ Elektroniky' },
    { id: 'QF_A3', code: 'H3', title: '4F-A',  when: '24.5. 08:00', venue: 'Střední škola Tech.' },
    { id: 'QF_A4', code: 'H4', title: '4F-A',  when: '24.5. 08:00', venue: 'Sareza Přívoz' },
  ],
  fourB: [
    { id: 'QF_B1', code: 'H1', title: '4F-B',  when: '24.5. 12:00', venue: 'Vítkovická střední A' },
    { id: 'QF_B2', code: 'H2', title: '4F-B',  when: '24.5. 11:00', venue: 'Vítkovická střední A' },
    { id: 'QF_B3', code: 'H3', title: '4F-B',  when: '24.5. 11:30', venue: 'Střední škola Tech.' },
    { id: 'QF_B4', code: 'H4', title: '4F-B',  when: '24.5. 11:30', venue: 'Vítkovická střední A' },
  ],
  semiA: [
    { id: 'SF_A1', code: 'H2', title: 'SF-A', when: '24.5. 10:30', venue: 'ČPP Aréna' },
    { id: 'SF_A2', code: 'H1', title: 'SF-A', when: '24.5. 10:30', venue: 'SPŠ Elektroniky' },
  ],
  semiB: [
    { id: 'SF_B1', code: 'H2', title: 'SF-B', when: '24.5. 13:15', venue: 'Vítkovická střední A' },
    { id: 'SF_B2', code: 'H1', title: 'SF-B', when: '24.5. 13:45', venue: 'Vítkovická střední A' },
  ],
  finalA: { id: 'FINAL_A', title: '🏆 FINÁLE A', when: '24.5. 13:00', venue: 'Sareza Přívoz', byPhase: 'FINAL-A' },
  finalB: { id: 'FINAL_B', title: 'FINÁLE B',     when: '24.5. 15:30', venue: 'Vítkovická střední A', byPhase: 'FINAL-B' },
};

export function renderBracket(matches, table, focusTeam) {
  const tigersCode = focusPositionCode(table, focusTeam);
  const groupMatches = (matches.matches || [])
    .filter(m => m.phase === 'group' && (isFocusTeam(m.home, focusTeam) || isFocusTeam(m.away, focusTeam)))
    .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));

  const lines = ['flowchart TD'];

  // Group stage uzly
  for (const t of STATIC_TEMPLATE.group) {
    const m = groupMatches[t.match];
    const label = nodeLabelStatic(t, m, table, null, matches);
    lines.push(`    ${t.id}["${label}"]`);
  }
  lines.push(`    START(["Výsledek skupiny MH"])`);
  lines.push(`    ZC1 --> ZC2 --> ZC3 --> START`);

  // 16F-A
  for (const t of STATIC_TEMPLATE.sixteenF) {
    const m = findMatchByCodeAndPhase(matches, '16F-A', t.code, tigersCode, focusTeam);
    const label = nodeLabelStatic(t, m, table, t.code, matches);
    lines.push(`    ${t.id}["${label}"]`);
  }
  if (tigersCode) {
    const n = tigersCode[1];
    lines.push(`    START -->|${n}. místo| H${n}`);
    for (let i = 1; i <= 4; i++) {
      if (String(i) !== n) {
        lines.push(`    START -.->|${i}. místo| H${i}`);
      }
    }
  } else {
    for (let i = 1; i <= 4; i++) {
      lines.push(`    START -->|${i}. místo| H${i}`);
    }
  }

  // Play-off A subgraph
  lines.push(`    subgraph PA["Play-off A"]`);
  for (const t of [...STATIC_TEMPLATE.eightA, ...STATIC_TEMPLATE.fourA, ...STATIC_TEMPLATE.semiA]) {
    const phase = t.id.startsWith('OF_A') ? '8F-A' : t.id.startsWith('QF_A') ? '4F-A' : 'SF-A';
    const m = t.code ? findMatchByCodeAndPhase(matches, phase, t.code, tigersCode, focusTeam) : null;
    const label = nodeLabelStatic(t, m, table, t.code, matches);
    lines.push(`        ${t.id}["${label}"]`);
  }
  const finA = STATIC_TEMPLATE.finalA;
  const mFinA = (matches.matches || []).find(x => x.phase === finA.byPhase);
  lines.push(`        ${finA.id}(["${nodeLabelStatic(finA, mFinA, table, tigersCode, matches)}"])`);
  for (let i = 1; i <= 4; i++) lines.push(`        OF_A${i} -->|výhra| QF_A${i}`);
  lines.push(`        QF_A1 -->|výhra| SF_A2`);
  lines.push(`        QF_A2 -->|výhra| SF_A1`);
  lines.push(`        QF_A3 -->|výhra| SF_A2`);
  lines.push(`        QF_A4 -->|výhra| SF_A1`);
  lines.push(`        SF_A1 -->|výhra| FINAL_A`);
  lines.push(`        SF_A2 -->|výhra| FINAL_A`);
  lines.push(`    end`);

  // Play-off B subgraph
  lines.push(`    subgraph PB["Play-off B"]`);
  for (const t of [...STATIC_TEMPLATE.eightB, ...STATIC_TEMPLATE.fourB, ...STATIC_TEMPLATE.semiB]) {
    const phase = t.id.startsWith('OF_B') ? '8F-B' : t.id.startsWith('QF_B') ? '4F-B' : 'SF-B';
    const m = t.code ? findMatchByCodeAndPhase(matches, phase, t.code, tigersCode, focusTeam) : null;
    const label = nodeLabelStatic(t, m, table, t.code, matches);
    lines.push(`        ${t.id}["${label}"]`);
  }
  const finB = STATIC_TEMPLATE.finalB;
  const mFinB = (matches.matches || []).find(x => x.phase === finB.byPhase);
  lines.push(`        ${finB.id}(["${nodeLabelStatic(finB, mFinB, table, tigersCode, matches)}"])`);
  for (let i = 1; i <= 4; i++) lines.push(`        OF_B${i} -->|výhra| QF_B${i}`);
  lines.push(`        QF_B1 -->|výhra| SF_B2`);
  lines.push(`        QF_B2 -->|výhra| SF_B1`);
  lines.push(`        QF_B3 -->|výhra| SF_B2`);
  lines.push(`        QF_B4 -->|výhra| SF_B1`);
  lines.push(`        SF_B1 -->|výhra| FINAL_B`);
  lines.push(`        SF_B2 -->|výhra| FINAL_B`);
  lines.push(`    end`);

  // Křížové hrany H_n → OF_A/B_n + OF_A_n → QF_B_n
  for (let i = 1; i <= 4; i++) {
    lines.push(`    H${i} -->|výhra| OF_A${i}`);
    lines.push(`    H${i} -->|prohra| OF_B${i}`);
    lines.push(`    OF_A${i} -->|prohra| QF_B${i}`);
  }

  // Played / unplayed styling
  const nodeMatchPairs = [
    ...STATIC_TEMPLATE.group.map((t, i) => ({ id: t.id, match: groupMatches[i] })),
    ...STATIC_TEMPLATE.sixteenF.map(t => ({ id: t.id, match: findMatchByCodeAndPhase(matches, '16F-A', t.code, tigersCode, focusTeam) })),
    ...STATIC_TEMPLATE.eightA.map(t => ({ id: t.id, match: findMatchByCodeAndPhase(matches, '8F-A', t.code, tigersCode, focusTeam) })),
    ...STATIC_TEMPLATE.eightB.map(t => ({ id: t.id, match: findMatchByCodeAndPhase(matches, '8F-B', t.code, tigersCode, focusTeam) })),
    ...STATIC_TEMPLATE.fourA.map(t => ({ id: t.id, match: findMatchByCodeAndPhase(matches, '4F-A', t.code, tigersCode, focusTeam) })),
    ...STATIC_TEMPLATE.fourB.map(t => ({ id: t.id, match: findMatchByCodeAndPhase(matches, '4F-B', t.code, tigersCode, focusTeam) })),
    ...STATIC_TEMPLATE.semiA.map(t => ({ id: t.id, match: findMatchByCodeAndPhase(matches, 'SF-A', t.code, tigersCode, focusTeam) })),
    ...STATIC_TEMPLATE.semiB.map(t => ({ id: t.id, match: findMatchByCodeAndPhase(matches, 'SF-B', t.code, tigersCode, focusTeam) })),
    { id: 'FINAL_A', match: mFinA },
    { id: 'FINAL_B', match: mFinB },
  ];
  for (const { id, match } of nodeMatchPairs) {
    if (match?.score) {
      lines.push(`    style ${id} fill:#d6eaf8,stroke:#2874a6,stroke-width:1px,color:#1b4f72`);
    } else {
      lines.push(`    style ${id} fill:#ffffff,stroke:#aaaaaa,stroke-width:1px,stroke-dasharray:4 3,color:#666`);
    }
  }

  // Highlight focus team cesty (musí být PO played-stylech, ať override)
  const highlighted = tigersHighlightedNodes(matches, table, focusTeam);
  for (const id of highlighted) {
    if (id === 'START') {
      lines.push(`    style ${id} fill:#ff6600,color:#fff,font-weight:bold`);
    } else if (id === 'FINAL_A') {
      lines.push(`    style ${id} fill:#ffd700,color:#000,font-weight:bold,stroke:#ff6600,stroke-width:3px`);
    } else if (id === 'FINAL_B') {
      lines.push(`    style ${id} fill:#ff6600,color:#fff,stroke:#000,stroke-width:3px`);
    } else {
      lines.push(`    style ${id} fill:#ff6600,color:#fff,stroke:#000,stroke-width:2px`);
    }
  }
  // Defaultní styling pro nezvýrazněné finály
  if (!highlighted.has('FINAL_A')) {
    lines.push(`    style FINAL_A fill:#ffd700,color:#000,font-weight:bold`);
  }
  if (!highlighted.has('FINAL_B')) {
    lines.push(`    style FINAL_B fill:#cccccc,color:#000`);
  }

  return lines.join('\n');
}
