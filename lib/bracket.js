import { normalizeTeamName } from './parser.js';

const TIGERS_FRAGMENT = 'tigers poruba';
const POSITION_GROUPS = { H: 'MH', D: 'MD', E: 'ME', A: 'MA', B: 'MB', C: 'MC', F: 'MF', G: 'MG' };

function isTigersTeam(name) {
  return name ? normalizeTeamName(name).includes(TIGERS_FRAGMENT) : false;
}

/**
 * Najde Tigers v tabulce MH a vrátí jejich pozici jako kód (např. "H1", "H3").
 * Vrací null, pokud Tigers v tabulce nejsou, nebo tabulka MH je prázdná.
 */
export function tigersPositionCode(table) {
  const mh = table?.groups?.MH;
  if (!Array.isArray(mh) || mh.length === 0) return null;
  // Návratová hodnota: pozice Tigers v MH jako placeholder kód (např. "H1").
  // I když ještě nebyly odehrány žádné zápasy (před turnajem), pořadí v tabulce
  // existuje (alphabetical seed) a používá se k sestavení play-off placeholderů.
  const tigers = mh.find(row => isTigersTeam(row.team));
  if (!tigers) return null;
  return `H${tigers.rank}`;
}

/**
 * Kontroluje, zda buňka (home/away) obsahuje konkrétní position code.
 * Buňka může být:
 *   - prostý kód:     "H1"
 *   - složený kód:    "H1/D4"
 *   - hlubší složený: "H1/A2/E3/D4"
 *   - reálné jméno:   "FBC TIGERS PORUBA"  (po skupinové fázi — tato funkce false)
 *
 * Match musí respektovat hranice (H1 ≠ H10).
 */
export function matchContainsCode(match, code) {
  // Pokud má match _homeOriginal (přežil resolution v simulaci), preferuj placeholder lookup.
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

/**
 * Resolve placeholder code (např. "H1") na jméno týmu z table.json.
 * Vrací null, pokud:
 *   - kód nemá tvar [písmeno][číslo]
 *   - příslušná skupina v tabulce neexistuje
 *   - tým s daným pořadím v tabulce není
 */
function anyGamesPlayedInGroup(rows) {
  if (!Array.isArray(rows)) return false;
  return rows.some(r => (r.points ?? 0) > 0 || (r.scored ?? 0) > 0 || (r.conceded ?? 0) > 0);
}

export function resolveCode(code, table) {
  const m = code.match(/^([A-H])(\d+)$/);
  if (!m) return null;
  const groupKey = POSITION_GROUPS[m[1]];
  if (!groupKey) return null;
  const rows = table?.groups?.[groupKey];
  if (!Array.isArray(rows)) return null;
  // Před odehráním zápasů ve skupině je rank jen abecední seed — nemá smysl
  // ho překládat na konkrétní tým, jinak by se v 16F-A zobrazili "soupeři"
  // i přes to, že není známo kdo postoupí.
  if (!anyGamesPlayedInGroup(rows)) return null;
  const row = rows.find(r => r.rank === parseInt(m[2], 10));
  return row?.team ?? null;
}

/**
 * Vrátí všechny zápasy Tigers (skupinové + play-off cesta), seřazené v čase.
 * Zahrnuje všechny větve, kterými Tigers MŮŽOU projít (před zápasem nevíme, jestli
 * postoupí; po zápase se cesta zúží přirozeně podle výsledků).
 */
/**
 * Vrátí pole zápasů, které Tigers skutečně hrají/budou hrát (sledování cesty pavoukem
 * podle výsledků). Na rozdíl od starého `tigersPath`, NEZAHRNUJE paralelní matches
 * jen proto, že obsahují stejný position code (jako H1 ve více větvích).
 *
 * Strategie: 3 group matches + pro každé další kolo se posuneme jen do té větve,
 * kterou Tigers skutečně postoupili (vítězná → A, prohra → B).
 */
export function tigersBracketPath(matches, table) {
  const result = [];

  // Group matches — vždy 3 zápasy MH
  const groupMatches = (matches.matches || [])
    .filter(m => m.phase === 'group' && m.group === 'MH' && (isTigersTeam(m.home) || isTigersTeam(m.away)))
    .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
  result.push(...groupMatches);

  const code = tigersPositionCode(table);
  if (!code) return result;       // rank ještě neznáme → jen group

  function tigersWasInMatch(m) {
    if (!m) return false;
    const homeContainsUs = isTigersTeam(m.home) || matchContainsCode({ home: m._homeOriginal ?? m.home, away: '' }, code);
    return homeContainsUs;
  }
  function tigersWon(m) {
    if (!m?.score) return null;
    const home = tigersWasInMatch(m);
    return home ? m.score.home > m.score.away : m.score.away > m.score.home;
  }

  const m16 = findMatchByCodeAndPhase(matches, '16F-A', code, code);
  if (m16) result.push(m16);
  const won16 = tigersWon(m16);
  if (won16 === null) return result;        // nehráli ještě, končíme

  const phase8 = won16 ? '8F-A' : '8F-B';
  const m8 = findMatchByCodeAndPhase(matches, phase8, code, code);
  if (m8) result.push(m8);
  const won8 = tigersWon(m8);
  if (won8 === null) return result;

  // 4F: A pokud won16 && won8; B pokud won16 && !won8 nebo !won16 && won8
  let phase4;
  if (won16 && won8) phase4 = '4F-A';
  else if (won16 && !won8) phase4 = '4F-B';
  else if (!won16 && won8) phase4 = '4F-B';
  else return result;     // prohra 16F + prohra 8F-B → konec

  const m4 = findMatchByCodeAndPhase(matches, phase4, code, code);
  if (m4) result.push(m4);
  const won4 = tigersWon(m4);
  if (won4 === null) return result;
  if (!won4) return result;     // prohra v 4F = konec turnaje

  const phaseSf = (phase4 === '4F-A') ? 'SF-A' : 'SF-B';
  const mSf = findMatchByCodeAndPhase(matches, phaseSf, code, code);
  if (mSf) result.push(mSf);
  const wonSf = tigersWon(mSf);
  if (wonSf === null) return result;
  if (!wonSf) return result;

  const phaseFinal = (phaseSf === 'SF-A') ? 'FINAL-A' : 'FINAL-B';
  const mFinal = (matches.matches || []).find(x => x.phase === phaseFinal);
  if (mFinal) result.push(mFinal);

  return result;
}

export function tigersPath(matches, table) {
  const code = tigersPositionCode(table);
  const all = matches.matches || [];

  const selected = all.filter(m => {
    if (isTigersTeam(m.home) || isTigersTeam(m.away)) return true;
    if (code && matchContainsCode(m, code)) return true;
    return false;
  });

  const seen = new Set();
  const dedup = [];
  for (const m of selected) {
    if (seen.has(m.id)) continue;
    seen.add(m.id);
    dedup.push(m);
  }

  // Pokud má daná fáze match se skutečným jménem Tigers, ostatní placeholderové
  // varianty té fáze jsou irelevantní (Tigers už hraje jen ten jeden).
  const phasesWithRealTigers = new Set(
    dedup
      .filter(m => isTigersTeam(m.home) || isTigersTeam(m.away))
      .map(m => m.phase)
  );
  const filtered = dedup.filter(m =>
    isTigersTeam(m.home) || isTigersTeam(m.away) || !phasesWithRealTigers.has(m.phase)
  );

  filtered.sort((a, b) => {
    const keyA = `${a.date ?? ''} ${a.time ?? ''}`;
    const keyB = `${b.date ?? ''} ${b.time ?? ''}`;
    return keyA.localeCompare(keyB);
  });

  return filtered;
}

const PHASE_PROGRESSION = {
  'group':   { winNext: '16F-A', lossNext: null,    winLabel: 'výhra → 16F-A' },
  '16F-A':   { winNext: '8F-A',  lossNext: '8F-B',  winLabel: 'výhra', lossLabel: 'prohra' },
  '16F-B':   { winNext: '8F-B',  lossNext: null,    winLabel: 'výhra' },
  '8F-A':    { winNext: '4F-A',  lossNext: '4F-B',  winLabel: 'výhra', lossLabel: 'prohra' },
  '8F-B':    { winNext: '4F-B',  lossNext: null,    winLabel: 'výhra' },
  '4F-A':    { winNext: 'SF-A',  lossNext: null,    winLabel: 'výhra' },
  '4F-B':    { winNext: 'SF-B',  lossNext: null,    winLabel: 'výhra' },
  'SF-A':    { winNext: 'FINAL-A', lossNext: null,  winLabel: 'výhra' },
  'SF-B':    { winNext: 'FINAL-B', lossNext: null,  winLabel: 'výhra' },
  'FINAL-A': { winNext: null,    lossNext: null },
  'FINAL-B': { winNext: null,    lossNext: null },
};

function cellTokens(cell) {
  if (!cell) return [];
  // Odstraní prefix "✖" (značí poraženého z předchozí branch) — pro účely set porovnání
  // nás zajímá identita teamů, ne typ source-branch.
  // Tokeny v buňce mohou být separované "/" (winners pool) nebo "-" (cross-branch chain
  // jako "H1/D4-A2/E3" v 4F-B = loser of 8F-A match "H1/D4 vs A2/E3"). Splittujeme obojí.
  const stripped = cell.replace(/^✖\s*/, '').trim();
  return stripped.split(/[\/-]/).map(s => s.trim()).filter(Boolean);
}

function isLossPlaceholder(cell) {
  return typeof cell === 'string' && cell.trim().startsWith('✖');
}

function placeholderSet(match) {
  return new Set([...cellTokens(match.home), ...cellTokens(match.away)]);
}

function isSupersetOf(superSet, subSet) {
  for (const x of subSet) if (!superSet.has(x)) return false;
  return true;
}

/**
 * Inferenuje edges mezi uzly cesty na základě placeholder code overlapu.
 * Pro každý match v `from` fázi hledá match v navazující `to` fázi, jehož placeholder
 * set obsahuje VŠECHNY tokeny z `from` (winner-branch) nebo má prefix `✖` (loser-branch).
 */
function inferEdges(path) {
  const edges = [];
  const byPhase = new Map();
  for (const m of path) {
    if (!byPhase.has(m.phase)) byPhase.set(m.phase, []);
    byPhase.get(m.phase).push(m);
  }

  for (const fromMatch of path) {
    const prog = PHASE_PROGRESSION[fromMatch.phase];
    if (!prog) continue;
    const fromTokens = placeholderSet(fromMatch);
    if (fromTokens.size === 0) continue;

    if (prog.winNext) {
      const candidates = byPhase.get(prog.winNext) || [];
      for (const t of candidates) {
        if ([t.home, t.away].some(c => !isLossPlaceholder(c) && isSupersetOf(new Set(cellTokens(c)), fromTokens))) {
          edges.push({ from: fromMatch.id, to: t.id, label: prog.winLabel });
        }
      }
    }
    if (prog.lossNext) {
      const candidates = byPhase.get(prog.lossNext) || [];
      for (const t of candidates) {
        if ([t.home, t.away].some(c => isLossPlaceholder(c) && isSupersetOf(new Set(cellTokens(c)), fromTokens))) {
          edges.push({ from: fromMatch.id, to: t.id, label: prog.lossLabel });
        }
      }
    }
  }

  return edges;
}

function fmtDate(iso) {
  if (!iso) return '';
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  return `${parseInt(m[3], 10)}.${parseInt(m[2], 10)}.`;
}

function shortVenue(venue) {
  if (!venue) return '';
  // Odstraň prefix "SH " (sportovní hala) a parenthesizované sub-info — diagram se vejde.
  return venue
    .replace(/^SH\s+/, '')
    .replace(/\s*-\s*hřiště.*$/i, '')
    .replace(/\s*\([^)]*\)\s*/g, '')
    .trim();
}

function shortTeam(name) {
  // Odstraní "FBC " prefix kvůli prostoru v diagramu (zachová pro nečlenitelné účely).
  if (!name) return '';
  return name.replace(/^FBC\s+/i, '').trim();
}

function nodeLabel(match, table) {
  const lines = [];
  lines.push(match.phase === 'group' ? `MH skupina` : match.phase);
  const home = resolveCode(match.home, table) || match.home || '?';
  const away = resolveCode(match.away, table) || match.away || '?';
  lines.push(`${shortTeam(home)} vs ${shortTeam(away)}`);
  if (match.date || match.time) {
    lines.push(`${fmtDate(match.date)} ${match.time ?? ''}`.trim());
  }
  const venue = shortVenue(match.venue);
  if (venue) lines.push(venue);
  if (match.score) lines.push(`${match.score.home}:${match.score.away}`);
  return lines.join('\\n').replace(/"/g, "'");
}

// ─────────────────────────────────────────────────────────────────────────────
// Statický pavouk podle struktury tigers-playoff.md.
// Zobrazí všechny 4 možné Tigers scénáře (H1–H4) + obě větve play-off (A/B).
// Data overlay: skutečná jména a skóre tam, kde už zápas proběhl.
// Tigers cesta se zvýrazní oranžově podle skutečného postupu.
// ─────────────────────────────────────────────────────────────────────────────

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
// Pro buňku "H1": resolveCode → MH rank 1 team
// Pro buňku "H1/D4": najde 16F-A match s {H1, D4} a vrátí vítěze
// Pro buňku "✖ H1/D4": vrátí poraženého 16F-A match
// Pro buňku "H1/A2/E3/D4" (4 tokeny): najde 8F-A match a vrátí vítěze
// Pro buňku "H1/D4-A2/E3" (4 tokeny s dashem): 4F-B placeholder, vrátí 8F-A loser
// Pro 8-token placeholder: 4F-A vítěz (no dash) nebo 4F-B vítěz (s dashem)
// Pokud nelze rozhodnout (zápas neodehraný), vrátí původní buňku.
export function resolvePlaceholder(cell, matches, table) {
  if (!cell) return cell;
  if (!isPlaceholderCell(cell)) return cell;     // už reálné jméno

  const tokens = _cellTokens(cell);
  const isLoss = cell.trim().startsWith('✖');
  const hasDash = cell.includes('-');

  if (tokens.length === 1) {
    return resolveCode(tokens[0], table) ?? cell;
  }

  // Najdi source match podle počtu tokenů a separátoru
  const key = _sortedKey(tokens);
  let sourcePhase;
  if (tokens.length === 2) sourcePhase = '16F-A';
  else if (tokens.length === 4) sourcePhase = hasDash ? '8F-A' : '8F-A';   // 8F-A vítěz (jak pro / tak -)
  else if (tokens.length === 8) sourcePhase = hasDash ? '4F-B' : '4F-A';
  else if (tokens.length === 16) sourcePhase = hasDash ? 'SF-B' : 'SF-A';
  else return cell;

  // V matches.json někteří uzly mají hlavičky home/away v placeholderech, jiné v reálných jménech.
  // Hledáme zápas, jehož ORIGINÁLNÍ token set = key. Originál může být buď v home/away
  // (pokud nebyl přepsán), nebo (po simulaci/scrape) totožný s ohledem na strukturu.
  // Strategie: pro každý zápas v sourcePhase, spočítej token set z aktuálního home/away
  // (pokud jsou to placeholdery). Pokud jsou už reálná jména, token set bude prázdný — skip.
  const candidates = matches.matches.filter(m => m.phase === sourcePhase);
  const sourceMatch = candidates.find(m => {
    const t = [..._cellTokens(m.home), ..._cellTokens(m.away)];
    return t.length > 0 && _sortedKey(t) === key;
  });

  if (!sourceMatch || !sourceMatch.score) return cell;

  const homeWon = sourceMatch.score.home > sourceMatch.score.away;
  const winnerTeam = homeWon ? sourceMatch.home : sourceMatch.away;
  const loserTeam  = homeWon ? sourceMatch.away : sourceMatch.home;

  // Pokud source match má v home/away ještě placeholdery, rekurze:
  const resolvedWinner = isPlaceholderCell(winnerTeam)
    ? resolvePlaceholder(winnerTeam, matches, table)
    : winnerTeam;
  const resolvedLoser  = isPlaceholderCell(loserTeam)
    ? resolvePlaceholder(loserTeam, matches, table)
    : loserTeam;

  // Pravidlo větve:
  //   8F-A buňka (2 tokeny, no ✖): vítěz 16F-A
  //   8F-B buňka (2 tokeny, ✖): poražený 16F-A
  //   4F-A buňka (4 tokeny / separator):   vítěz 8F-A
  //   4F-B buňka (4 tokeny - separator):   poražený 8F-A
  //   atd.
  if (tokens.length === 2 && isLoss) return resolvedLoser;
  if (tokens.length === 2)           return resolvedWinner;
  if (tokens.length === 4 && hasDash) return resolvedLoser;
  if (tokens.length === 4)            return resolvedWinner;
  if (tokens.length === 8 && hasDash) return resolvedWinner;   // 4F-B větev = vítěz 4F-B
  if (tokens.length === 8)            return resolvedWinner;   // 4F-A větev
  return resolvedWinner;
}

function findMatchByCodeAndPhase(matches, phase, code, tigersCode = null) {
  // 1) Pokud hledáme zápas na Tigers' pozici, preferuj match s Tigers' reálným jménem
  //    (po odehrání zápasu ostravskehry.cz nahrazuje placeholdery reálnými jmény).
  if (tigersCode && code === tigersCode) {
    const byName = matches.matches.find(m =>
      m.phase === phase && (isTigersTeam(m.home) || isTigersTeam(m.away))
    );
    if (byName) return byName;
  }
  // 2) Hledej podle position kódu v placeholderu
  return matches.matches.find(m => m.phase === phase && matchContainsCode(m, code));
}

function fmtScore(score) {
  return score ? ` ${score.home}:${score.away}` : '';
}

function tigersHighlightedNodes(matches, table) {
  // Vrátí Set ID uzlů, které mají být zvýrazněné (skutečná cesta Tigers).
  const set = new Set(['ZC1', 'ZC2', 'ZC3', 'START']);
  const rank = tigersPositionCode(table);
  if (!rank) return set;

  const n = rank[1];   // '1', '2', '3', '4'
  set.add(`H${n}`);

  const m16 = findMatchByCodeAndPhase(matches, '16F-A', rank, rank);
  if (!m16?.score) return set;

  const tigersIsHome16 = isTigersTeam(m16.home) || matchContainsCode({ home: m16.home, away: '' }, rank);
  const won16 = tigersIsHome16
    ? m16.score.home > m16.score.away
    : m16.score.away > m16.score.home;

  let phase8, nodePrefix8;
  if (won16) { phase8 = '8F-A'; nodePrefix8 = 'OF_A'; }
  else       { phase8 = '8F-B'; nodePrefix8 = 'OF_B'; }
  set.add(`${nodePrefix8}${n}`);

  const m8 = findMatchByCodeAndPhase(matches, phase8, rank, rank);
  if (!m8?.score) return set;

  const tigersIsHome8 = isTigersTeam(m8.home) || matchContainsCode({ home: m8.home, away: '' }, rank);
  const won8 = tigersIsHome8
    ? m8.score.home > m8.score.away
    : m8.score.away > m8.score.home;

  // Po 8F-A: výhra → 4F-A, prohra → 4F-B
  // Po 8F-B: výhra → 4F-B, prohra → konec
  let phase4, nodePrefix4;
  if (won16 && won8)        { phase4 = '4F-A'; nodePrefix4 = 'QF_A'; }
  else if (won16 && !won8)  { phase4 = '4F-B'; nodePrefix4 = 'QF_B'; }
  else if (!won16 && won8)  { phase4 = '4F-B'; nodePrefix4 = 'QF_B'; }
  else                      { return set; }    // prohrál 16F i 8F-B → konec
  set.add(`${nodePrefix4}${n}`);

  const m4 = findMatchByCodeAndPhase(matches, phase4, rank, rank);
  if (!m4?.score) return set;

  const tigersIsHome4 = isTigersTeam(m4.home) || matchContainsCode({ home: m4.home, away: '' }, rank);
  const won4 = tigersIsHome4
    ? m4.score.home > m4.score.away
    : m4.score.away > m4.score.home;
  if (!won4) return set;     // prohra v 4F = konec turnaje

  // SF mapping: H1, H3 → SF_*2;  H2, H4 → SF_*1   (podle struktury tigers-playoff.md)
  // Větev (A vs B) je určená tím, kam jsme se dostali ve 4F (NIKOLI 16F):
  //   4F-A → SF-A → FINAL-A
  //   4F-B → SF-B → FINAL-B
  const sfSlot = (n === '1' || n === '3') ? '2' : '1';
  const inBranchA = (phase4 === '4F-A');
  const phaseSf = inBranchA ? 'SF-A' : 'SF-B';
  const sfPrefix = inBranchA ? 'SF_A' : 'SF_B';
  set.add(`${sfPrefix}${sfSlot}`);

  const mSf = findMatchByCodeAndPhase(matches, phaseSf, rank, rank);
  if (!mSf?.score) return set;

  const tigersIsHomeSf = isTigersTeam(mSf.home) || matchContainsCode({ home: mSf.home, away: '' }, rank);
  const wonSf = tigersIsHomeSf
    ? mSf.score.home > mSf.score.away
    : mSf.score.away > mSf.score.home;
  if (!wonSf) return set;

  set.add(inBranchA ? 'FINAL_A' : 'FINAL_B');
  return set;
}

function opponentName(match, tigersCode) {
  // Vrátí jméno soupeře pro daný match (z pohledu Tigers / pozičního kódu).
  if (!match) return null;
  const homeContainsUs = isTigersTeam(match.home) || matchContainsCode({ home: match.home, away: '' }, tigersCode ?? '');
  return homeContainsUs ? match.away : match.home;
}

function nodeLabelStatic(template, match, table, tigersCode, matches) {
  const lines = [];
  if (template.title) lines.push(template.title);

  let homeLabel = '?', awayLabel = '?';
  if (match) {
    homeLabel = matches ? resolvePlaceholder(match.home, matches, table) : match.home;
    awayLabel = matches ? resolvePlaceholder(match.away, matches, table) : match.away;
  } else if (template.opponentPlaceholder) {
    // Skupinová fáze / 16F-A bez matche: použij template placeholder a resolveCode
    awayLabel = resolveCode(template.opponentPlaceholder, table) || template.opponentPlaceholder;
  }

  // Vždy "Home – Away" — score se pak čte přímo (home_score : away_score)
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
  // Group stage — opponenty doplníme dynamicky z matches.json (Tigers home/away)
  group: [
    { id: 'ZC1', match: 0, when: '22.5. 11:15', venue: 'SPŠ Elektroniky' },
    { id: 'ZC2', match: 1, when: '22.5. 20:15', venue: 'Vítkovická střední A' },
    { id: 'ZC3', match: 2, when: '23.5. 10:15', venue: 'Sareza Přívoz' },
  ],
  // 16F-A: pro každý H_n → opponent z MD ranks (D4, D3, D2, D1)
  sixteenF: [
    { id: 'H1', code: 'H1', title: '16F-A · H1', opponentPlaceholder: 'D4', when: '23.5. 14:00', venue: 'Sareza Přívoz' },
    { id: 'H2', code: 'H2', title: '16F-A · H2', opponentPlaceholder: 'D3', when: '23.5. 14:50', venue: 'VŠB-TUO' },
    { id: 'H3', code: 'H3', title: '16F-A · H3', opponentPlaceholder: 'D2', when: '23.5. 14:00', venue: 'Vítkovická střední A' },
    { id: 'H4', code: 'H4', title: '16F-A · H4', opponentPlaceholder: 'D1', when: '23.5. 14:00', venue: 'ČPP Aréna' },
  ],
  // 8F-A (Tigers vyhráli 16F)
  eightA: [
    { id: 'OF_A1', code: 'H1', title: '8F-A',  when: '23.5. 19:00', venue: 'Střední škola Tech.' },
    { id: 'OF_A2', code: 'H2', title: '8F-A',  when: '23.5. 18:10', venue: 'Střední škola Tech.' },
    { id: 'OF_A3', code: 'H3', title: '8F-A',  when: '23.5. 17:30', venue: 'Vítkovická střední A' },
    { id: 'OF_A4', code: 'H4', title: '8F-A',  when: '23.5. 19:00', venue: 'SPŠ Elektroniky' },
  ],
  // 8F-B (Tigers prohráli 16F)
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
  // SF: každý SF match obsahuje 4 H-pozice. SF_*1 dostává H2/H4 větve, SF_*2 dostává H1/H3.
  // Stačí jeden distinctive code, lookup matchContainsCode najde unikátní SF-A/B match.
  semiA: [
    { id: 'SF_A1', code: 'H2', title: 'SF-A', when: '24.5. 10:30', venue: 'ČPP Aréna' },
    { id: 'SF_A2', code: 'H1', title: 'SF-A', when: '24.5. 10:30', venue: 'SPŠ Elektroniky' },
  ],
  semiB: [
    { id: 'SF_B1', code: 'H2', title: 'SF-B', when: '24.5. 13:15', venue: 'Vítkovická střední A' },
    { id: 'SF_B2', code: 'H1', title: 'SF-B', when: '24.5. 13:45', venue: 'Vítkovická střední A' },
  ],
  // FINAL: jediný match per větev, lookup podle phase samotné (code nepotřeba).
  finalA: { id: 'FINAL_A', title: '🏆 FINÁLE A', when: '24.5. 13:00', venue: 'Sareza Přívoz', byPhase: 'FINAL-A' },
  finalB: { id: 'FINAL_B', title: 'FINÁLE B',     when: '24.5. 15:30', venue: 'Vítkovická střední A', byPhase: 'FINAL-B' },
};

export function renderStaticBracket(matches, table) {
  const tigersCode = tigersPositionCode(table);
  const groupMatches = (matches.matches || [])
    .filter(m => m.phase === 'group' && (isTigersTeam(m.home) || isTigersTeam(m.away)))
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

  // 16F-A: pokud známe Tigers rank, šipka jen z ranku; jinak všechny 4 možnosti.
  for (const t of STATIC_TEMPLATE.sixteenF) {
    const m = findMatchByCodeAndPhase(matches, '16F-A', t.code, tigersCode);
    const label = nodeLabelStatic(t, m, table, t.code, matches);
    lines.push(`    ${t.id}["${label}"]`);
  }
  if (tigersCode) {
    const n = tigersCode[1];
    lines.push(`    START -->|${n}. místo| H${n}`);
    // Ostatní 3 možnosti: tenká neviditelná hrana, ať se zobrazí (alternativní scénář)
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
    const m = t.code ? findMatchByCodeAndPhase(matches, phase, t.code, tigersCode) : null;
    const label = nodeLabelStatic(t, m, table, t.code, matches);
    lines.push(`        ${t.id}["${label}"]`);
  }
  const finA = STATIC_TEMPLATE.finalA;
  const mFinA = (matches.matches || []).find(x => x.phase === finA.byPhase);
  lines.push(`        ${finA.id}(["${nodeLabelStatic(finA, mFinA, table, tigersCode, matches)}"])`);
  // Hrany v PA
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
    const m = t.code ? findMatchByCodeAndPhase(matches, phase, t.code, tigersCode) : null;
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

  // Played / unplayed styling — odehrané zápasy dostávají barevný fill,
  // neodehrané zůstávají s tečkovaným okrajem.
  // Mapování: node ID → odpovídající match (přes findMatchByCodeAndPhase už použito nahoře).
  const nodeMatchPairs = [
    ...STATIC_TEMPLATE.group.map((t, i) => ({ id: t.id, match: groupMatches[i] })),
    ...STATIC_TEMPLATE.sixteenF.map(t => ({ id: t.id, match: findMatchByCodeAndPhase(matches, '16F-A', t.code, tigersCode) })),
    ...STATIC_TEMPLATE.eightA.map(t => ({ id: t.id, match: findMatchByCodeAndPhase(matches, '8F-A', t.code, tigersCode) })),
    ...STATIC_TEMPLATE.eightB.map(t => ({ id: t.id, match: findMatchByCodeAndPhase(matches, '8F-B', t.code, tigersCode) })),
    ...STATIC_TEMPLATE.fourA.map(t => ({ id: t.id, match: findMatchByCodeAndPhase(matches, '4F-A', t.code, tigersCode) })),
    ...STATIC_TEMPLATE.fourB.map(t => ({ id: t.id, match: findMatchByCodeAndPhase(matches, '4F-B', t.code, tigersCode) })),
    ...STATIC_TEMPLATE.semiA.map(t => ({ id: t.id, match: findMatchByCodeAndPhase(matches, 'SF-A', t.code, tigersCode) })),
    ...STATIC_TEMPLATE.semiB.map(t => ({ id: t.id, match: findMatchByCodeAndPhase(matches, 'SF-B', t.code, tigersCode) })),
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

  // Highlight Tigers cesty (musí být PO played-stylech, ať override)
  const highlighted = tigersHighlightedNodes(matches, table);
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

// ─────────────────────────────────────────────────────────────────────────────
// Match card HTML shared between app.js (Zápasy sekce) a renderPhaseList
// ─────────────────────────────────────────────────────────────────────────────

function _escapeHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function _fmtDateCard(iso) {
  if (!iso) return '';
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  return `${parseInt(m[3], 10)}. ${parseInt(m[2], 10)}.`;
}

export function matchCardHtml(m, isTigersMatch) {
  const homePh = isPlaceholderCell(m.home);
  const awayPh = isPlaceholderCell(m.away);
  const hasPlaceholder = homePh || awayPh;

  const isLive = m.score?.status === 'live';

  let body;
  if (m.score) {
    const liveBadge = isLive ? ` <span class="live-badge">Skóre není finální</span>` : '';
    body = `<div class="score${isLive ? ' is-live' : ''}"><strong>${_escapeHtml(m.home)}</strong> <span class="score-num">${m.score.home} : ${m.score.away}</span> <strong>${_escapeHtml(m.away)}</strong>${liveBadge}</div>`;
  } else if (hasPlaceholder && isTigersMatch) {
    body = `<div class="vs"><strong>FBC TIGERS PORUBA</strong> – <em>soupeř bude určen</em> <span class="pending">(zatím nehrané)</span></div>`;
  } else if (hasPlaceholder) {
    body = `<div class="vs"><em>soupeři budou určeni</em> <span class="pending">(zatím nehrané)</span></div>`;
  } else {
    body = `<div class="vs"><strong>${_escapeHtml(m.home)}</strong> – <strong>${_escapeHtml(m.away)}</strong> <span class="pending">(zatím nehrané)</span></div>`;
  }

  const klass = `match-card${isTigersMatch ? ' is-tigers' : ''}${isLive ? ' is-live' : ''}${!m.score ? ' is-pending' : ''}`;
  return `<div class="${klass}">
    <div><span class="phase">${m.phase === 'group' ? `${m.group ?? 'MH'} skupina` : m.phase}</span>
      <span class="when">${_fmtDateCard(m.date)} ${m.time ?? ''} — ${_escapeHtml(m.venue ?? '')}</span></div>
    ${body}
  </div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase list (seznam mód) — lineární zobrazení fází pro mobil
// ─────────────────────────────────────────────────────────────────────────────

const PHASE_LIST_ORDER = [
  { phase: 'group',   label: 'Skupina MH',        isGroup: true },
  { phase: '16F-A',   label: 'Šestnáctifinále A'  },
  { phase: '16F-B',   label: 'Šestnáctifinále B'  },
  { phase: '8F-A',    label: 'Čtvrtfinále A'       },
  { phase: '8F-B',    label: 'Čtvrtfinále B'       },
  { phase: 'SF-A',    label: 'Semifinále A'        },
  { phase: 'SF-B',    label: 'Semifinále B'        },
  { phase: 'FINAL-A', label: 'Finále A'            },
  { phase: 'FINAL-B', label: 'Finále B'            },
];

function _phasePlaceholders(phaseKey) {
  const s = STATIC_TEMPLATE;
  const ph = {
    'group':   s.group.map((e, i) => ({ id: `ph-g${i}`, phase: 'group', group: 'MH', home: 'H1', away: 'H2', time: e.when, venue: e.venue })),
    '16F-A':   s.sixteenF.map((e, i) => ({ id: `ph-16A${i}`, phase: '16F-A', home: e.code, away: e.opponentPlaceholder ?? 'D1', time: e.when, venue: e.venue })),
    '16F-B':   [{ id: 'ph-16B0', phase: '16F-B', home: 'A1', away: 'B1' }],
    '8F-A':    s.eightA.map((e, i) => ({ id: `ph-8A${i}`, phase: '8F-A', home: e.code, away: 'D1', time: e.when, venue: e.venue })),
    '8F-B':    s.eightB.map((e, i) => ({ id: `ph-8B${i}`, phase: '8F-B', home: e.code, away: 'D1', time: e.when, venue: e.venue })),
    'SF-A':    s.semiA.map((e, i) => ({ id: `ph-SFA${i}`, phase: 'SF-A', home: 'H1', away: 'H2', time: e.when, venue: e.venue })),
    'SF-B':    s.semiB.map((e, i) => ({ id: `ph-SFB${i}`, phase: 'SF-B', home: 'H1', away: 'H2', time: e.when, venue: e.venue })),
    'FINAL-A': [{ id: 'ph-FA0', phase: 'FINAL-A', home: 'H1', away: 'H2', time: s.finalA.when, venue: s.finalA.venue }],
    'FINAL-B': [{ id: 'ph-FB0', phase: 'FINAL-B', home: 'H1', away: 'H2', time: s.finalB.when, venue: s.finalB.venue }],
  };
  return ph[phaseKey] ?? [{ id: `ph-${phaseKey}-0`, phase: phaseKey, home: 'H1', away: 'H2' }];
}

function _pluralZapas(n) {
  if (n === 1) return 'zápas';
  if (n >= 2 && n <= 4) return 'zápasy';
  return 'zápasů';
}

export function renderPhaseList(matches, table) {
  const allMatches = matches.matches || [];
  const bracketPath = tigersBracketPath(matches, table);
  const lastBracketMatch = bracketPath[bracketPath.length - 1] ?? null;
  const tigersIds = new Set(bracketPath.map(m => m.id));

  const blocks = PHASE_LIST_ORDER.map(({ phase, label, isGroup }) => {
    let phaseMatches = isGroup
      ? allMatches.filter(m => m.phase === 'group' && m.group === 'MH')
      : allMatches.filter(m => m.phase === phase);

    phaseMatches = phaseMatches
      .slice()
      .sort((a, b) => `${a.date ?? ''} ${a.time ?? ''}`.localeCompare(`${b.date ?? ''} ${b.time ?? ''}`));

    const hasTigers = phaseMatches.some(m => isTigersTeam(m.home) || isTigersTeam(m.away));
    const isUpcoming = lastBracketMatch !== null && lastBracketMatch.phase === phase && !lastBracketMatch.score;
    const defaultOpen = hasTigers || isUpcoming;

    const displayMatches = phaseMatches.length === 0 ? _phasePlaceholders(phase) : phaseMatches;
    const count = displayMatches.length;
    const metaClass = hasTigers ? ' tigers' : '';
    const metaSuffix = hasTigers ? ' · Tigers hrají' : '';
    const metaText = `(${count} ${_pluralZapas(count)}${metaSuffix})`;

    const cards = displayMatches.map(m => {
      const isTm = tigersIds.has(m.id) || isTigersTeam(m.home) || isTigersTeam(m.away);
      return matchCardHtml(m, isTm);
    }).join('\n');

    return `<details${defaultOpen ? ' open' : ''}>
  <summary>
    <strong>${_escapeHtml(label)}</strong>
    <span class="phase-meta${metaClass}">${metaText}</span>
  </summary>
  ${cards}
</details>`;
  });

  return `<section class="phase-list">\n${blocks.join('\n')}\n</section>`;
}

export function renderMermaid(path, table) {
  const lines = ['flowchart LR'];

  for (const m of path) {
    const isFinal = m.phase === 'FINAL-A' || m.phase === 'FINAL-B';
    const shape = isFinal ? `(["${nodeLabel(m, table)}"])` : `["${nodeLabel(m, table)}"]`;
    lines.push(`    M${m.id}${shape}`);
  }

  const edges = inferEdges(path);

  // Doplň hrany group → 16F-A pro Tigers cestu (group fáze nemá placeholder, takže
  // inferEdges to nepokryje). Pokud existuje 16F-A match s Tigers (kódem nebo jménem),
  // všechny 3 group matches Tigers se k němu připojí.
  const sixteenWithTigers = path.find(m => m.phase === '16F-A' &&
    (isTigersTeam(m.home) || isTigersTeam(m.away) || matchContainsCode(m, tigersPositionCode(table) ?? '')));
  if (sixteenWithTigers) {
    for (const g of path.filter(m => m.phase === 'group')) {
      edges.push({ from: g.id, to: sixteenWithTigers.id, label: '' });
    }
  }

  for (const e of edges) {
    const label = e.label ? `|${e.label}|` : '';
    lines.push(`    M${e.from} -->${label} M${e.to}`);
  }

  // Tigers/group uzly oranžově
  for (const m of path) {
    const involved = isTigersTeam(m.home) || isTigersTeam(m.away);
    if (involved) {
      lines.push(`    style M${m.id} fill:#ff6600,color:#fff,stroke:#000,stroke-width:2px`);
    }
  }

  // Finále lehce zlatě/šedě
  for (const m of path) {
    if (m.phase === 'FINAL-A') lines.push(`    style M${m.id} fill:#ffd700,color:#000,font-weight:bold`);
    if (m.phase === 'FINAL-B') lines.push(`    style M${m.id} fill:#cccccc,color:#000`);
  }

  return lines.join('\n');
}
