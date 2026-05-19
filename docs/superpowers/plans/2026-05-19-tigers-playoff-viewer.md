# Tigers Play-off Viewer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Postavit statickou webovou stránku hostovanou na GitHub Pages, která zobrazí aktuální stav turnaje Ostravské hry 2026 (B13 5+1, skupina MH) — tabulka, zápasy Tigers, pavouk play-off — automaticky aktualizovaný GitHub Actions cronem.

**Architecture:** Vanilla JS + Mermaid CDN frontend + Node.js scraper běžící v GitHub Actions, který stahuje HTML z ostravskehry.cz a commituje JSON do repa. Frontend čte JSON ze stejného originu (žádný build, žádný CORS); manuální "Force refresh" obchází cron přes veřejnou CORS proxy.

**Tech Stack:** Node.js 22, pnpm, `cheerio` (HTML parsing, Node-only), Mermaid.js (browser CDN), GitHub Actions, GitHub Pages.

**Spec:** `docs/superpowers/specs/2026-05-19-tigers-playoff-viewer-design.md`

---

## Task 1: Projekt setup

**Files:**
- Create: `package.json`
- Create: `.gitignore`
- Create: `README.md` (stub)

- [ ] **Step 1: Vytvoř `package.json`**

```json
{
  "name": "tigers-playoff-viewer",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "engines": { "node": ">=22" },
  "packageManager": "pnpm@9.0.0",
  "scripts": {
    "scrape": "node scripts/scrape.mjs",
    "test": "node --test tests/"
  },
  "dependencies": {
    "cheerio": "^1.0.0"
  }
}
```

- [ ] **Step 2: Vytvoř `.gitignore`**

```
node_modules/
.DS_Store
*.log
.vscode/
```

- [ ] **Step 3: Vytvoř stub `README.md`**

```markdown
# Tigers Play-off Viewer

Live stránka s výsledky FBC Tigers Poruba B13 na turnaji Ostravské hry 2026.

Bude doplněno během implementace.
```

- [ ] **Step 4: Nainstaluj závislosti**

Run: `pnpm install`
Expected: `cheerio` se nainstaluje, vytvoří se `pnpm-lock.yaml`, `node_modules/`.

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-lock.yaml .gitignore README.md
git commit -m "chore: project setup with pnpm and cheerio"
```

---

## Task 2: Zachycení HTML fixtury

**Files:**
- Create: `tests/fixtures/2026-05-19-before-tournament-table.html`
- Create: `tests/fixtures/2026-05-19-before-tournament-matches.html`
- Create: `tests/fixtures/README.md`

**Cíl:** Před psaním parseru potřebujeme reálný HTML, ne AI-shrnutí. Stáhneme dvě stránky ostravskehry.cz a uložíme jako fixtury. Parser pak píšeme TDD proti reálné struktuře.

- [ ] **Step 1: Stáhni tabulku**

Run:
```bash
curl -L -A "Mozilla/5.0" "https://ostravskehry.cz/florbal/table/" -o tests/fixtures/2026-05-19-before-tournament-table.html
```
Expected: Soubor cca 50–500 kB.

- [ ] **Step 2: Stáhni zápasy**

Run:
```bash
curl -L -A "Mozilla/5.0" "https://ostravskehry.cz/florbal/matches/?category=24" -o tests/fixtures/2026-05-19-before-tournament-matches.html
```
Expected: Soubor cca 50–500 kB.

- [ ] **Step 3: Ověř, že fixtury obsahují očekávaná data**

Run:
```bash
grep -c "FBC Tigers Poruba" tests/fixtures/2026-05-19-before-tournament-matches.html
grep -c "MH" tests/fixtures/2026-05-19-before-tournament-table.html
```
Expected: Obě hodnoty > 0. Pokud ne, opravit URL/selektory.

- [ ] **Step 4: Krátce zdokumentuj fixtury**

Vytvoř `tests/fixtures/README.md`:
```markdown
# HTML Fixtures

Reálné HTML snapshoty z ostravskehry.cz, použité parser unit testy.

| Soubor | Zdroj | Datum stažení | Stav turnaje |
|--------|-------|---------------|--------------|
| `2026-05-19-before-tournament-table.html` | `/florbal/table/` | 2026-05-19 | Před zahájením, jen rozpis |
| `2026-05-19-before-tournament-matches.html` | `/florbal/matches/?category=24` | 2026-05-19 | Před zahájením, jen rozpis |

Po základní části a po play-off doplnit další fixtury (s výsledky).
```

- [ ] **Step 5: Commit**

```bash
git add tests/fixtures/
git commit -m "test: capture initial HTML fixtures from ostravskehry.cz"
```

---

## Task 3: Parser — `normalizeTeamName` helper

**Files:**
- Create: `lib/parser.js`
- Create: `tests/normalize.test.mjs`

**Cíl:** Drobný čistý helper. Začínáme jím, protože ho používá `parseTable`, `parseMatches` i `resolveBracket`.

- [ ] **Step 1: Napiš test (`tests/normalize.test.mjs`)**

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTeamName } from '../lib/parser.js';

test('normalizeTeamName: trim whitespace', () => {
  assert.equal(normalizeTeamName('  FBC Tigers Poruba  '), 'fbc tigers poruba');
});

test('normalizeTeamName: lowercase (Czech locale)', () => {
  assert.equal(normalizeTeamName('FBC TIGERS PORUBA'), 'fbc tigers poruba');
});

test('normalizeTeamName: remove diacritics', () => {
  assert.equal(normalizeTeamName('Třinec červení'), 'trinec cerveni');
  assert.equal(normalizeTeamName('Vítkovická'), 'vitkovicka');
});

test('normalizeTeamName: combined', () => {
  assert.equal(normalizeTeamName('  ACEMA Sparta Praha YELLOW '), 'acema sparta praha yellow');
});
```

- [ ] **Step 2: Spusť testy — musí spadnout**

Run: `pnpm test`
Expected: FAIL — `lib/parser.js` neexistuje nebo `normalizeTeamName` není exportován.

- [ ] **Step 3: Implementuj v `lib/parser.js`**

```javascript
export function normalizeTeamName(s) {
  return s
    .trim()
    .toLocaleLowerCase('cs')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
}
```

- [ ] **Step 4: Spusť testy — musí projít**

Run: `pnpm test`
Expected: PASS všechny 4 testy.

- [ ] **Step 5: Commit**

```bash
git add lib/parser.js tests/normalize.test.mjs
git commit -m "feat(parser): add normalizeTeamName helper with tests"
```

---

## Task 4: Parser — `parseTable`

**Files:**
- Modify: `lib/parser.js`
- Create: `tests/parseTable.test.mjs`

**Cíl:** Načte HTML tabulkové stránky, vrátí `{ groups: { MH: [...], MD: [...], ME: [...] } }`.

**Před začátkem:** Otevři `tests/fixtures/2026-05-19-before-tournament-table.html` a najdi sekci skupiny MH. Identifikuj HTML selektory pro: kotvící prvek skupiny (např. `<h3>MH</h3>` nebo `id="MH"`), tabulkový řádek týmu, sloupce (rank, team, played, wins, draws, losses, scored, conceded, points).

- [ ] **Step 1: Napiš test (`tests/parseTable.test.mjs`)**

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as cheerio from 'cheerio';
import { parseTable } from '../lib/parser.js';

const html = readFileSync(
  new URL('./fixtures/2026-05-19-before-tournament-table.html', import.meta.url),
  'utf8'
);
const $ = cheerio.load(html);
const result = parseTable($);

test('parseTable: returns groups object', () => {
  assert.ok(result.groups, 'result.groups missing');
  assert.ok(result.groups.MH, 'group MH missing');
});

test('parseTable: MH has 4 teams', () => {
  assert.equal(result.groups.MH.length, 4);
});

test('parseTable: MH contains FBC Tigers Poruba', () => {
  const tigers = result.groups.MH.find(t => t.team.includes('Tigers'));
  assert.ok(tigers, 'Tigers missing');
  assert.equal(typeof tigers.rank, 'number');
  assert.equal(typeof tigers.points, 'number');
});

test('parseTable: also returns MD and ME (potrebne pro play-off)', () => {
  assert.ok(result.groups.MD, 'MD missing');
  assert.ok(result.groups.ME, 'ME missing');
});

test('parseTable: row has all required fields', () => {
  const row = result.groups.MH[0];
  for (const field of ['rank', 'team', 'played', 'wins', 'draws', 'losses', 'scored', 'conceded', 'points']) {
    assert.ok(field in row, `field ${field} missing`);
  }
});
```

- [ ] **Step 2: Spusť testy — musí spadnout**

Run: `pnpm test`
Expected: FAIL — `parseTable` není exportován.

- [ ] **Step 3: Implementuj `parseTable` v `lib/parser.js`**

Otevři fixturu, prozkoumej strukturu. Typický pattern na ostravskehry.cz: nadpis se zkratkou skupiny → následující `<table>` obsahuje řádky. Adaptuj kód níže přesně podle reálných selektorů:

```javascript
// Přidej do lib/parser.js — adaptuj selektory podle reálné HTML struktury fixtury
export function parseTable($) {
  const groups = {};
  const wantedGroups = ['MA', 'MB', 'MC', 'MD', 'ME', 'MF', 'MG', 'MH'];

  for (const groupName of wantedGroups) {
    // 1) Najdi heading který reprezentuje skupinu (např. <h3> obsahující text "MH")
    //    Adaptuj selektor podle reálné struktury — může to být .group-title, h2, nebo data-attribut
    const heading = $(`h2, h3, h4`).filter((_, el) =>
      $(el).text().trim() === groupName || $(el).text().trim().endsWith(groupName)
    ).first();
    if (!heading.length) continue;

    // 2) Najdi nejbližší tabulku za headingem
    const table = heading.nextAll('table').first();
    if (!table.length) continue;

    const rows = [];
    table.find('tbody tr').each((_, tr) => {
      const cells = $(tr).find('td').map((__, td) => $(td).text().trim()).get();
      if (cells.length < 8) return;

      // Pořadí sloupců typicky: rank | team | played | wins | draws | losses | score (X:Y) | points
      // Adaptuj indexy podle reálné struktury
      const [scored, conceded] = (cells[6] || '0:0').split(':').map(s => parseInt(s, 10) || 0);
      rows.push({
        rank: parseInt(cells[0], 10),
        team: cells[1],
        played: parseInt(cells[2], 10),
        wins: parseInt(cells[3], 10),
        draws: parseInt(cells[4], 10),
        losses: parseInt(cells[5], 10),
        scored,
        conceded,
        points: parseInt(cells[7], 10),
      });
    });

    if (rows.length) groups[groupName] = rows;
  }

  return { groups };
}
```

**Poznámka pro engineera:** Pokud po prvním běhu testů 2–3 selhávají kvůli odlišné HTML struktuře, otevři fixturu v prohlížeči (`open tests/fixtures/...html`) nebo přes `node -e "console.log(require('cheerio').load(require('fs').readFileSync('tests/fixtures/2026-05-19-before-tournament-table.html', 'utf8')).html().slice(0, 5000))"` a najdi reálné selektory. Pak adaptuj výše.

- [ ] **Step 4: Spusť testy — musí projít**

Run: `pnpm test`
Expected: PASS všech 5 `parseTable` testů + 4 testy `normalizeTeamName` z Tasku 3.

- [ ] **Step 5: Commit**

```bash
git add lib/parser.js tests/parseTable.test.mjs
git commit -m "feat(parser): add parseTable with fixture-based tests"
```

---

## Task 5: Parser — `parseMatches`

**Files:**
- Modify: `lib/parser.js`
- Create: `tests/parseMatches.test.mjs`

**Cíl:** Načte HTML stránky zápasů (kategorie 24), vrátí `{ matches: [...] }` se všemi zápasy ze všech skupin kategorie B13 5+1.

**Před začátkem:** Otevři `tests/fixtures/2026-05-19-before-tournament-matches.html`. Najdi: jak je každý zápas obalený (typicky `<tr>` nebo `<div>`), kde je čas, datum, skupina/fáze, hala, oba týmy, případně skóre, odkaz na detail (`/florbal/match/?id=…`).

- [ ] **Step 1: Napiš test (`tests/parseMatches.test.mjs`)**

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as cheerio from 'cheerio';
import { parseMatches } from '../lib/parser.js';

const html = readFileSync(
  new URL('./fixtures/2026-05-19-before-tournament-matches.html', import.meta.url),
  'utf8'
);
const $ = cheerio.load(html);
const result = parseMatches($);

test('parseMatches: returns matches array', () => {
  assert.ok(Array.isArray(result.matches));
  assert.ok(result.matches.length > 0, 'expected at least one match');
});

test('parseMatches: each match has required fields', () => {
  for (const m of result.matches.slice(0, 5)) {
    for (const field of ['id', 'date', 'time', 'group', 'phase', 'venue', 'home', 'away', 'score']) {
      assert.ok(field in m, `field ${field} missing in match ${JSON.stringify(m)}`);
    }
  }
});

test('parseMatches: date format ISO (YYYY-MM-DD)', () => {
  const m = result.matches[0];
  assert.match(m.date, /^\d{4}-\d{2}-\d{2}$/);
});

test('parseMatches: time format HH:MM', () => {
  const m = result.matches[0];
  assert.match(m.time, /^\d{2}:\d{2}$/);
});

test('parseMatches: phase is one of allowed', () => {
  const allowed = new Set(['group', '16F-A', '16F-B', '8F-A', '8F-B', '4F-A', '4F-B', 'SF-A', 'SF-B', 'FINAL-A', 'FINAL-B', 'other']);
  for (const m of result.matches) {
    assert.ok(allowed.has(m.phase), `unexpected phase: ${m.phase}`);
  }
});

test('parseMatches: contains FBC Tigers Poruba', () => {
  const tigers = result.matches.filter(m => m.home.includes('Tigers') || m.away.includes('Tigers'));
  assert.ok(tigers.length >= 3, `expected at least 3 Tigers matches, got ${tigers.length}`);
});

test('parseMatches: score is null before tournament', () => {
  // Fixture je z 2026-05-19, turnaj 22.5. — výsledky ještě nejsou
  for (const m of result.matches.slice(0, 10)) {
    assert.equal(m.score, null);
  }
});
```

- [ ] **Step 2: Spusť testy — musí spadnout**

Run: `pnpm test`
Expected: FAIL — `parseMatches` není exportován.

- [ ] **Step 3: Implementuj `parseMatches`**

Přidej do `lib/parser.js`:

```javascript
// Mapování textových označení fáze (jak se zobrazují na ostravskehry.cz) na náš enum.
// Po vyzkoušení fixtury adaptuj klíče — reálné texty mohou být "MH Zákl. část", "16F-A", atd.
const PHASE_PATTERNS = [
  { pattern: /zákl/i, phase: 'group' },
  { pattern: /16F-?A/i, phase: '16F-A' },
  { pattern: /16F-?B/i, phase: '16F-B' },
  { pattern: /8F-?A/i, phase: '8F-A' },
  { pattern: /8F-?B/i, phase: '8F-B' },
  { pattern: /4F-?A/i, phase: '4F-A' },
  { pattern: /4F-?B/i, phase: '4F-B' },
  { pattern: /SF-?A/i, phase: 'SF-A' },
  { pattern: /SF-?B/i, phase: 'SF-B' },
  { pattern: /(finále|final).?A/i, phase: 'FINAL-A' },
  { pattern: /(finále|final).?B/i, phase: 'FINAL-B' },
];

function detectPhase(groupText) {
  for (const { pattern, phase } of PHASE_PATTERNS) {
    if (pattern.test(groupText)) return phase;
  }
  return 'other';
}

function parseDateCs(dateText) {
  // Vstup např. "22. 5. 2026" → "2026-05-22"
  const m = dateText.match(/(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})/);
  if (!m) return null;
  const [, d, mo, y] = m;
  return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

function parseScore(text) {
  // "5:3", "5 : 3", nebo prázdné/pomlčka
  const m = text.match(/(\d+)\s*:\s*(\d+)/);
  if (!m) return null;
  return { home: parseInt(m[1], 10), away: parseInt(m[2], 10), status: 'final' };
}

export function parseMatches($) {
  const matches = [];

  // ADAPTUJ selektor podle reálné struktury — `tr` v tabulce zápasů, nebo `.match-row`, atd.
  $('a[href*="/florbal/match/?id="]').each((_, link) => {
    const $link = $(link);
    const href = $link.attr('href') || '';
    const idMatch = href.match(/id=(\d+)/);
    if (!idMatch) return;
    const id = parseInt(idMatch[1], 10);

    // Hledej rodičovský řádek/box, kde jsou všechny informace o zápase
    const $row = $link.closest('tr, .match, div').first();
    if (!$row.length) return;

    const rowText = $row.text();
    const dateMatch = rowText.match(/\d{1,2}\.\s*\d{1,2}\.\s*\d{4}/);
    const timeMatch = rowText.match(/\b(\d{1,2}:\d{2})\b/);

    // Týmy: typicky text odkazu nebo dva separátní elementy
    const linkText = $link.text().trim();
    const teamsMatch = linkText.match(/^(.+?)\s*[-–]\s*(.+)$/);
    if (!teamsMatch) return;

    matches.push({
      id,
      date: dateMatch ? parseDateCs(dateMatch[0]) : null,
      time: timeMatch ? timeMatch[1].padStart(5, '0') : null,
      group: ($row.find('[class*="group"], .skupina').text().trim()) || '',
      phase: detectPhase($row.text()),
      venue: ($row.find('[class*="hall"], [class*="venue"]').text().trim()) || '',
      home: teamsMatch[1].trim(),
      away: teamsMatch[2].trim(),
      score: parseScore(linkText) || parseScore(rowText),
    });
  });

  // Deduplikuj podle id (kdyby HTML obsahoval stejný zápas vícekrát)
  const byId = new Map();
  for (const m of matches) byId.set(m.id, m);
  return { matches: [...byId.values()] };
}
```

**Poznámka:** Stejně jako u `parseTable` — pokud testy selhávají, otevři fixturu a přizpůsob selektory. Detekce skupiny/fáze/haly je nejvíce závislá na konkrétní struktuře.

- [ ] **Step 4: Spusť testy — musí projít**

Run: `pnpm test`
Expected: PASS všech 7 `parseMatches` testů + existující testy.

- [ ] **Step 5: Commit**

```bash
git add lib/parser.js tests/parseMatches.test.mjs
git commit -m "feat(parser): add parseMatches with fixture-based tests"
```

---

## Task 6: Bracket — `BRACKET_SKELETON` konstanta

**Files:**
- Create: `lib/bracket.js`

**Cíl:** Statická data popisující strukturu play-off (kdo s kým hraje, kdy, kde). Manuálně přepsáno ze specu §3 a původního Mermaid pavouka v `tigers-playoff.md` user's memory.

- [ ] **Step 1: Vytvoř `lib/bracket.js` se skeletonem**

```javascript
// Statická kostra play-off pavouka pro turnaj Ostravské hry 2026, kategorie B13 5+1 (cat=24).
// Pozice ve skupině (např. "H1" = 1. místo skupiny MH) se dynamicky překládají na jména týmů
// z table.json přes resolveBracket().
// Pokud organizátor změní rozpis, edituj tuto konstantu ručně.

export const BRACKET_SKELETON = {
  // ───── 16F-A (vítězi postupují, poražení padají do play-off B) ─────
  '16F-A_1': { phase: '16F-A', home: 'H1', away: 'D4', time: '14:00', venue: 'Sareza Přívoz', date: '2026-05-23', feedsWinTo: '8F-A_1', feedsLossTo: '8F-B_1' },
  '16F-A_2': { phase: '16F-A', home: 'H2', away: 'D3', time: '14:50', venue: 'VŠB-TUO',         date: '2026-05-23', feedsWinTo: '8F-A_2', feedsLossTo: '8F-B_2' },
  '16F-A_3': { phase: '16F-A', home: 'H3', away: 'D2', time: '14:00', venue: 'Vítkovická střední A', date: '2026-05-23', feedsWinTo: '8F-A_3', feedsLossTo: '8F-B_3' },
  '16F-A_4': { phase: '16F-A', home: 'H4', away: 'D1', time: '14:00', venue: 'ČPP Aréna',       date: '2026-05-23', feedsWinTo: '8F-A_4', feedsLossTo: '8F-B_4' },

  // ───── 8F-A (23.5. večer) ─────
  '8F-A_1': { phase: '8F-A', from: ['16F-A_1_win'], time: '19:00', venue: 'Střední škola Tech.',  date: '2026-05-23', feedsWinTo: '4F-A_1', feedsLossTo: '4F-B_1' },
  '8F-A_2': { phase: '8F-A', from: ['16F-A_2_win'], time: '18:10', venue: 'Střední škola Tech.',  date: '2026-05-23', feedsWinTo: '4F-A_2', feedsLossTo: '4F-B_2' },
  '8F-A_3': { phase: '8F-A', from: ['16F-A_3_win'], time: '17:30', venue: 'Vítkovická střední A', date: '2026-05-23', feedsWinTo: '4F-A_3', feedsLossTo: '4F-B_3' },
  '8F-A_4': { phase: '8F-A', from: ['16F-A_4_win'], time: '19:00', venue: 'SPŠ Elektroniky',      date: '2026-05-23', feedsWinTo: '4F-A_4', feedsLossTo: '4F-B_4' },

  // ───── 8F-B (24.5. ráno — pro poražené z 16F-A) ─────
  '8F-B_1': { phase: '8F-B', from: ['16F-A_1_loss'], time: '10:00', venue: 'Vítkovická střední A', date: '2026-05-24', feedsWinTo: '4F-B_1' },
  '8F-B_2': { phase: '8F-B', from: ['16F-A_2_loss'], time: '08:00', venue: 'Vítkovická střední A', date: '2026-05-24', feedsWinTo: '4F-B_2' },
  '8F-B_3': { phase: '8F-B', from: ['16F-A_3_loss'], time: '08:30', venue: 'Třebovice',           date: '2026-05-24', feedsWinTo: '4F-B_3' },
  '8F-B_4': { phase: '8F-B', from: ['16F-A_4_loss'], time: '08:00', venue: 'VŠB-TUO',             date: '2026-05-24', feedsWinTo: '4F-B_4' },

  // ───── 4F-A ─────
  '4F-A_1': { phase: '4F-A', from: ['8F-A_1_win'], time: '08:00', venue: 'ČPP Aréna',           date: '2026-05-24', feedsWinTo: 'SF-A_2' },
  '4F-A_2': { phase: '4F-A', from: ['8F-A_2_win'], time: '08:00', venue: 'SPŠ Elektroniky',     date: '2026-05-24', feedsWinTo: 'SF-A_1' },
  '4F-A_3': { phase: '4F-A', from: ['8F-A_3_win'], time: '08:00', venue: 'Střední škola Tech.', date: '2026-05-24', feedsWinTo: 'SF-A_2' },
  '4F-A_4': { phase: '4F-A', from: ['8F-A_4_win'], time: '08:00', venue: 'Sareza Přívoz',       date: '2026-05-24', feedsWinTo: 'SF-A_1' },

  // ───── 4F-B (kombinuje poražené 8F-A + vítěze 8F-B) ─────
  '4F-B_1': { phase: '4F-B', from: ['8F-A_1_loss', '8F-B_1_win'], time: '12:00', venue: 'Vítkovická střední A', date: '2026-05-24', feedsWinTo: 'SF-B_2' },
  '4F-B_2': { phase: '4F-B', from: ['8F-A_2_loss', '8F-B_2_win'], time: '11:00', venue: 'Vítkovická střední A', date: '2026-05-24', feedsWinTo: 'SF-B_1' },
  '4F-B_3': { phase: '4F-B', from: ['8F-A_3_loss', '8F-B_3_win'], time: '11:30', venue: 'Střední škola Tech.',  date: '2026-05-24', feedsWinTo: 'SF-B_2' },
  '4F-B_4': { phase: '4F-B', from: ['8F-A_4_loss', '8F-B_4_win'], time: '11:30', venue: 'Vítkovická střední A', date: '2026-05-24', feedsWinTo: 'SF-B_1' },

  // ───── SF-A ─────
  'SF-A_1': { phase: 'SF-A', from: ['4F-A_2_win', '4F-A_4_win'], time: '10:30', venue: 'ČPP Aréna',       date: '2026-05-24', feedsWinTo: 'FINAL-A' },
  'SF-A_2': { phase: 'SF-A', from: ['4F-A_1_win', '4F-A_3_win'], time: '10:30', venue: 'SPŠ Elektroniky', date: '2026-05-24', feedsWinTo: 'FINAL-A' },

  // ───── SF-B ─────
  'SF-B_1': { phase: 'SF-B', from: ['4F-B_2_win', '4F-B_4_win'], time: '13:15', venue: 'Vítkovická střední A', date: '2026-05-24', feedsWinTo: 'FINAL-B' },
  'SF-B_2': { phase: 'SF-B', from: ['4F-B_1_win', '4F-B_3_win'], time: '13:45', venue: 'Vítkovická střední A', date: '2026-05-24', feedsWinTo: 'FINAL-B' },

  // ───── FINÁLE ─────
  'FINAL-A': { phase: 'FINAL-A', from: ['SF-A_1_win', 'SF-A_2_win'], time: '13:00', venue: 'Sareza Přívoz',       date: '2026-05-24' },
  'FINAL-B': { phase: 'FINAL-B', from: ['SF-B_1_win', 'SF-B_2_win'], time: '15:30', venue: 'Vítkovická střední A', date: '2026-05-24' },
};

// Skupiny relevantní pro Tigers — H1–H4 jsou pozice ve skupině MH,
// D1–D4 ve skupině MD, E1–E4 ve skupině ME (i když ME zatím nepoužíváme,
// necháváme pro budoucí rozšíření).
export const POSITION_GROUPS = {
  H: 'MH',
  D: 'MD',
  E: 'ME',
};

export const TIGERS_TEAM_FRAGMENT = 'tigers poruba';  // pro substring match po normalizeTeamName
```

- [ ] **Step 2: Smoke test — soubor se načítá**

Run: `node -e "import('./lib/bracket.js').then(m => console.log(Object.keys(m.BRACKET_SKELETON).length))"`
Expected: Číslo (počet uzlů, cca 22).

- [ ] **Step 3: Commit**

```bash
git add lib/bracket.js
git commit -m "feat(bracket): add BRACKET_SKELETON constant for play-off structure"
```

---

## Task 7: Bracket — `resolveBracket`

**Files:**
- Modify: `lib/bracket.js`
- Create: `tests/resolveBracket.test.mjs`

**Cíl:** Funkce vezme skeleton + table + matches, vrátí strom uzlů s reálnými jmény týmů, výsledky a vyznačenou cestou Tigers.

- [ ] **Step 1: Napiš test (`tests/resolveBracket.test.mjs`)**

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BRACKET_SKELETON, resolveBracket } from '../lib/bracket.js';

const tableBeforeStart = {
  groups: {
    MH: [],  // prázdná — turnaj nezačal
    MD: [],
    ME: [],
  },
};

const tableAfterGroupStage = {
  groups: {
    MH: [
      { rank: 1, team: 'FBC Tigers Poruba', points: 9 },
      { rank: 2, team: 'ACEMA Sparta Praha YELLOW', points: 6 },
      { rank: 3, team: 'FBS Olomouc bílí', points: 3 },
      { rank: 4, team: 'FBC Intevo Třinec červení', points: 0 },
    ],
    MD: [
      { rank: 1, team: 'D-team1', points: 9 },
      { rank: 2, team: 'D-team2', points: 6 },
      { rank: 3, team: 'D-team3', points: 3 },
      { rank: 4, team: 'D-team4', points: 0 },
    ],
    ME: [],
  },
};

const matches = { matches: [] };

test('resolveBracket: before tournament — codes stay as placeholders', () => {
  const result = resolveBracket(BRACKET_SKELETON, tableBeforeStart, matches);
  assert.equal(result['16F-A_1'].home, 'H1');
  assert.equal(result['16F-A_1'].away, 'D4');
});

test('resolveBracket: after group stage — codes replaced by team names', () => {
  const result = resolveBracket(BRACKET_SKELETON, tableAfterGroupStage, matches);
  assert.equal(result['16F-A_1'].home, 'FBC Tigers Poruba');   // H1 → MH rank 1
  assert.equal(result['16F-A_1'].away, 'D-team4');              // D4 → MD rank 4
  assert.equal(result['16F-A_4'].home, 'FBC Intevo Třinec červení');  // H4 → MH rank 4
  assert.equal(result['16F-A_4'].away, 'D-team1');              // D1 → MD rank 1
});

test('resolveBracket: Tigers cesta v 16F-A_1 je highlighted', () => {
  const result = resolveBracket(BRACKET_SKELETON, tableAfterGroupStage, matches);
  assert.equal(result['16F-A_1'].tigersInvolved, true);
  assert.equal(result['16F-A_2'].tigersInvolved, false);
});

test('resolveBracket: výsledek zápasu se promítne do uzlu', () => {
  const matchesWithResult = {
    matches: [{
      id: 999,
      date: '2026-05-23',
      time: '14:00',
      phase: '16F-A',
      home: 'FBC Tigers Poruba',
      away: 'D-team4',
      score: { home: 5, away: 3, status: 'final' },
    }],
  };
  const result = resolveBracket(BRACKET_SKELETON, tableAfterGroupStage, matchesWithResult);
  assert.deepEqual(result['16F-A_1'].score, { home: 5, away: 3, status: 'final' });
  assert.equal(result['16F-A_1'].winner, 'home');
});
```

- [ ] **Step 2: Spusť testy — musí spadnout**

Run: `pnpm test`
Expected: FAIL — `resolveBracket` není exportován.

- [ ] **Step 3: Implementuj `resolveBracket`**

Přidej do `lib/bracket.js`:

```javascript
import { normalizeTeamName } from './parser.js';

function resolvePositionCode(code, table) {
  // "H1" → tým na 1. místě skupiny MH; "D4" → 4. místo MD
  const m = code.match(/^([A-Z])(\d+)$/);
  if (!m) return code;  // už je to název týmu
  const [, letter, rankStr] = m;
  const groupKey = POSITION_GROUPS[letter];
  if (!groupKey) return code;
  const rows = table.groups?.[groupKey] ?? [];
  const row = rows.find(r => r.rank === parseInt(rankStr, 10));
  return row ? row.team : code;
}

function findMatchForNode(nodeKey, node, resolvedNode, matches) {
  // Matchuj zápas v `matches` na uzel `node` — primárně přes phase + jména týmů.
  // Pokud uzel ještě nemá rozřešené týmy (např. 8F-A závisí na výsledku 16F-A), vrátí null.
  if (!resolvedNode.home || !resolvedNode.away) return null;
  if (resolvedNode.home === node.home && resolvedNode.away === node.away) {
    // Stále jen placeholder kódy — nevíme jména
    if (/^[A-Z]\d+$/.test(node.home)) return null;
  }
  const homeKey = normalizeTeamName(resolvedNode.home);
  const awayKey = normalizeTeamName(resolvedNode.away);
  return matches.matches.find(m =>
    m.phase === node.phase &&
    ((normalizeTeamName(m.home) === homeKey && normalizeTeamName(m.away) === awayKey) ||
     (normalizeTeamName(m.home) === awayKey && normalizeTeamName(m.away) === homeKey))
  ) ?? null;
}

const TIGERS_FRAGMENT = 'tigers poruba';

function isTigers(team) {
  return team ? normalizeTeamName(team).includes(TIGERS_FRAGMENT) : false;
}

export function resolveBracket(skeleton, table, matches) {
  const resolved = {};

  // Pass 1: rozřeš position kódy (H1, D4) na jména týmů pro uzly, které mají `home`/`away`
  for (const [key, node] of Object.entries(skeleton)) {
    resolved[key] = { ...node };
    if (node.home) resolved[key].home = resolvePositionCode(node.home, table);
    if (node.away) resolved[key].away = resolvePositionCode(node.away, table);
  }

  // Pass 2: doplň výsledky z matches.json
  for (const [key, node] of Object.entries(skeleton)) {
    const match = findMatchForNode(key, node, resolved[key], matches);
    if (match) {
      resolved[key].matchId = match.id;
      resolved[key].score = match.score;
      if (match.score) {
        resolved[key].winner = match.score.home > match.score.away ? 'home'
          : match.score.away > match.score.home ? 'away' : 'draw';
      }
    }
  }

  // Pass 3: pro uzly závislé na předchozích (8F-A_1.from = ['16F-A_1_win']), propaguj jméno vítěze
  let changed = true;
  let iterations = 0;
  while (changed && iterations < 10) {
    changed = false;
    iterations++;
    for (const [key, node] of Object.entries(skeleton)) {
      if (!node.from) continue;
      const r = resolved[key];
      if (r.home && r.away) continue;  // už rozřešeno

      const teams = [];
      for (const ref of node.from) {
        const refMatch = ref.match(/^(.+)_(win|loss)$/);
        if (!refMatch) continue;
        const [, srcKey, outcome] = refMatch;
        const src = resolved[srcKey];
        if (!src?.winner) continue;
        const winningTeam = src.winner === 'home' ? src.home : src.away;
        const losingTeam = src.winner === 'home' ? src.away : src.home;
        teams.push(outcome === 'win' ? winningTeam : losingTeam);
      }
      if (teams.length === 1 && node.from.length === 1) {
        r.home = teams[0];   // postoupil sólo
        changed = true;
      } else if (teams.length === 2) {
        r.home = teams[0];
        r.away = teams[1];
        changed = true;
      }
    }
  }

  // Pass 4: označ uzly, kde hrají Tigers
  for (const r of Object.values(resolved)) {
    r.tigersInvolved = isTigers(r.home) || isTigers(r.away);
  }

  return resolved;
}
```

- [ ] **Step 4: Spusť testy — musí projít**

Run: `pnpm test`
Expected: PASS všechny 4 `resolveBracket` testy + ostatní.

- [ ] **Step 5: Commit**

```bash
git add lib/bracket.js tests/resolveBracket.test.mjs
git commit -m "feat(bracket): add resolveBracket — maps positions to teams and overlays results"
```

---

## Task 8: Bracket — `renderMermaid`

**Files:**
- Modify: `lib/bracket.js`
- Create: `tests/renderMermaid.test.mjs`

**Cíl:** Funkce vezme resolved bracket (z Tasku 7) a vyplivne Mermaid `flowchart TD` source string. Tigers uzly zvýrazněny oranžově.

- [ ] **Step 1: Napiš test (`tests/renderMermaid.test.mjs`)**

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BRACKET_SKELETON, resolveBracket, renderMermaid } from '../lib/bracket.js';

const minimalResolved = resolveBracket(BRACKET_SKELETON, { groups: { MH: [], MD: [], ME: [] } }, { matches: [] });

test('renderMermaid: returns flowchart TD string', () => {
  const out = renderMermaid(minimalResolved);
  assert.match(out, /^flowchart TD/);
});

test('renderMermaid: includes all bracket nodes', () => {
  const out = renderMermaid(minimalResolved);
  assert.ok(out.includes('16F-A_1'));
  assert.ok(out.includes('FINAL-A'));
  assert.ok(out.includes('FINAL-B'));
});

test('renderMermaid: links winners to next round', () => {
  const out = renderMermaid(minimalResolved);
  // Z 16F-A_1 jde šipka do 8F-A_1 (winner) a 8F-B_1 (loser)
  assert.match(out, /16F-A_1\s*-->\s*\|\s*v[ýy]hra\s*\|\s*8F-A_1/);
  assert.match(out, /16F-A_1\s*-->\s*\|\s*prohra\s*\|\s*8F-B_1/);
});

test('renderMermaid: Tigers nodes have orange style', () => {
  const table = {
    groups: {
      MH: [{ rank: 1, team: 'FBC Tigers Poruba', points: 9 }],
      MD: [{ rank: 4, team: 'D4-team', points: 0 }],
      ME: [],
    },
  };
  const resolved = resolveBracket(BRACKET_SKELETON, table, { matches: [] });
  const out = renderMermaid(resolved);
  assert.match(out, /style 16F-A_1 fill:#ff6600/);
});
```

- [ ] **Step 2: Spusť testy — musí spadnout**

Run: `pnpm test`
Expected: FAIL — `renderMermaid` není exportován.

- [ ] **Step 3: Implementuj `renderMermaid`**

Přidej do `lib/bracket.js`:

```javascript
function nodeLabel(key, node) {
  const lines = [];
  lines.push(key.replace(/_/g, ' '));
  if (node.home || node.away) {
    lines.push(`${node.home ?? '?'} vs ${node.away ?? '?'}`);
  }
  if (node.date && node.time) {
    const datePart = node.date.replace(/^\d{4}-(\d{2})-(\d{2})$/, '$2.$1.');
    lines.push(`${datePart} ${node.time}`);
  } else if (node.time) {
    lines.push(node.time);
  }
  if (node.venue) lines.push(node.venue);
  if (node.score) lines.push(`${node.score.home}:${node.score.away}`);
  return lines.join('\\n');
}

export function renderMermaid(resolved) {
  const lines = ['flowchart TD'];

  // Uzly
  for (const [key, node] of Object.entries(resolved)) {
    const label = nodeLabel(key, node).replace(/"/g, "'");
    const shape = key.startsWith('FINAL') ? `(["${label}"])` : `["${label}"]`;
    lines.push(`    ${key}${shape}`);
  }

  // Hrany podle feedsWinTo / feedsLossTo
  for (const [key, node] of Object.entries(resolved)) {
    if (node.feedsWinTo) {
      lines.push(`    ${key} -->|výhra| ${node.feedsWinTo}`);
    }
    if (node.feedsLossTo) {
      lines.push(`    ${key} -->|prohra| ${node.feedsLossTo}`);
    }
  }

  // Styling — Tigers uzly oranžově, finále zlatě/šedě
  for (const [key, node] of Object.entries(resolved)) {
    if (node.tigersInvolved) {
      lines.push(`    style ${key} fill:#ff6600,color:#fff,stroke:#000,stroke-width:2px`);
    }
  }
  lines.push('    style FINAL-A fill:#ffd700,color:#000,font-weight:bold');
  lines.push('    style FINAL-B fill:#cccccc,color:#000');

  return lines.join('\n');
}
```

- [ ] **Step 4: Spusť testy — musí projít**

Run: `pnpm test`
Expected: PASS všech 4 `renderMermaid` testů + všechny ostatní.

- [ ] **Step 5: Commit**

```bash
git add lib/bracket.js tests/renderMermaid.test.mjs
git commit -m "feat(bracket): add renderMermaid for Mermaid flowchart generation"
```

---

## Task 9: Scraper CLI (`scripts/scrape.mjs`)

**Files:**
- Create: `scripts/scrape.mjs`
- Create: `data/.gitkeep`

**Cíl:** CLI který stáhne 2 HTML, parsuje přes `parseTable`/`parseMatches`, zapíše JSONy, commituje `meta.json` vždy.

- [ ] **Step 1: Vytvoř `data/.gitkeep`**

Run:
```bash
mkdir -p data && touch data/.gitkeep
```

- [ ] **Step 2: Napiš `scripts/scrape.mjs`**

```javascript
import { writeFile, readFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import * as cheerio from 'cheerio';
import { parseTable, parseMatches } from '../lib/parser.js';

const URLS = {
  table:   'https://ostravskehry.cz/florbal/table/',
  matches: 'https://ostravskehry.cz/florbal/matches/?category=24',
};

const USER_AGENT = 'tigers-playoff-viewer (https://github.com/<owner>/tigers-playoff-viewer)';
const RETRIES = 3;
const TIMEOUT_MS = 15_000;

async function fetchWithRetry(url) {
  let lastErr;
  for (let attempt = 1; attempt <= RETRIES; attempt++) {
    try {
      const r = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status} ${r.statusText}`);
      return await r.text();
    } catch (e) {
      lastErr = e;
      if (attempt < RETRIES) {
        await new Promise(res => setTimeout(res, 500 * 2 ** (attempt - 1)));
      }
    }
  }
  throw lastErr;
}

function sha256(s) {
  return createHash('sha256').update(s).digest('hex');
}

async function writeIfChanged(path, contentString) {
  if (existsSync(path)) {
    const existing = await readFile(path, 'utf8');
    if (sha256(existing) === sha256(contentString)) {
      console.log(`unchanged: ${path}`);
      return false;
    }
  }
  await writeFile(path, contentString);
  console.log(`written: ${path}`);
  return true;
}

async function writeMeta(status) {
  const nowIso = new Date().toISOString();
  let meta = {
    last_success_at: null,
    last_attempt_at: nowIso,
    last_attempt_status: status,
    source: 'ostravskehry.cz',
  };
  if (existsSync('data/meta.json')) {
    const prev = JSON.parse(await readFile('data/meta.json', 'utf8'));
    meta.last_success_at = prev.last_success_at ?? null;
  }
  if (status === 'ok') meta.last_success_at = nowIso;
  await writeFile('data/meta.json', JSON.stringify(meta, null, 2));
  console.log(`meta: ${status} (last_success_at=${meta.last_success_at})`);
}

async function main() {
  await mkdir('data', { recursive: true });

  let tableHtml, matchesHtml;
  try {
    [tableHtml, matchesHtml] = await Promise.all([
      fetchWithRetry(URLS.table),
      fetchWithRetry(URLS.matches),
    ]);
  } catch (e) {
    console.error('network_error:', e.message);
    await writeMeta('network_error');
    process.exit(1);
  }

  let tableData, matchesData;
  try {
    tableData = parseTable(cheerio.load(tableHtml));
    matchesData = parseMatches(cheerio.load(matchesHtml));
    if (!tableData.groups?.MH) throw new Error('parser returned no MH group');
    if (!matchesData.matches?.length) throw new Error('parser returned no matches');
  } catch (e) {
    console.error('parse_error:', e.message);
    await writeMeta('parse_error');
    process.exit(1);
  }

  const nowIso = new Date().toISOString();
  await writeIfChanged(
    'data/table.json',
    JSON.stringify({ scraped_at: nowIso, ...tableData }, null, 2),
  );
  await writeIfChanged(
    'data/matches.json',
    JSON.stringify({ category: 24, scraped_at: nowIso, ...matchesData }, null, 2),
  );
  await writeMeta('ok');
}

main().catch(e => {
  console.error('unexpected error:', e);
  process.exit(1);
});
```

- [ ] **Step 3: Spusť scraper lokálně**

Run: `pnpm scrape`
Expected: STDOUT obsahuje `written: data/table.json`, `written: data/matches.json`, `meta: ok ...`. Tři soubory v `data/`.

- [ ] **Step 4: Vizuálně zkontroluj JSON**

Run: `node -e "console.log(JSON.stringify(JSON.parse(require('fs').readFileSync('data/table.json')).groups.MH, null, 2))"`
Expected: Pole 4 týmů ve skupině MH (nebo prázdné pole pokud ostravskehry.cz ještě neuvádí seznam).

Pokud výstup vypadá špatně (chybí pole, divné hodnoty), vrať se k Tasku 4/5 a oprav selektory.

- [ ] **Step 5: Commit**

```bash
git add scripts/scrape.mjs data/
git commit -m "feat(scraper): add scrape CLI with retry, SHA dedup, meta.json on every run"
```

---

## Task 10: GitHub Actions workflow

**Files:**
- Create: `.github/workflows/scrape.yml`

- [ ] **Step 1: Vytvoř `.github/workflows/scrape.yml`**

```yaml
name: Scrape

on:
  schedule:
    - cron: '*/15 * * * *'
  workflow_dispatch:

permissions:
  contents: write

jobs:
  scrape:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: 9

      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'pnpm'

      - run: pnpm install --prod --frozen-lockfile

      - id: scrape
        run: pnpm scrape
        continue-on-error: true

      - name: Commit if changed
        run: |
          git config user.name "scraper-bot"
          git config user.email "bot@users.noreply.github.com"
          git add data/
          if git diff --quiet --cached; then
            echo "No changes to commit"
          else
            git commit -m "data: scrape $(date -u +%Y-%m-%dT%H:%MZ) [${{ steps.scrape.outcome }}]"
            git push
          fi

      - name: Fail if scraper failed
        if: steps.scrape.outcome != 'success'
        run: |
          echo "Scraper exited with status: ${{ steps.scrape.outcome }}"
          exit 1
```

- [ ] **Step 2: Validuj YAML syntax**

Run:
```bash
node -e "const fs=require('fs');const y=fs.readFileSync('.github/workflows/scrape.yml','utf8');console.log(y.length>0?'OK':'EMPTY')"
```
Expected: `OK`. (Pokud máš `yamllint`, můžeš spustit `yamllint .github/workflows/scrape.yml`.)

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/scrape.yml
git commit -m "ci: add GitHub Actions workflow for scheduled scraping"
```

---

## Task 11: Frontend — `index.html` markup

**Files:**
- Create: `index.html`

**Cíl:** Sémantický HTML kostra, žádné JS chování. 5 sekcí ze specu §5.4.

- [ ] **Step 1: Vytvoř `index.html`**

```html
<!DOCTYPE html>
<html lang="cs">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>FBC Tigers Poruba B13 — Ostravské hry 2026</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <header class="site-header">
    <h1>FBC Tigers Poruba B13</h1>
    <p class="subtitle">Ostravské hry 2026 — kategorie B13 5+1, skupina MH</p>
    <div class="status">
      <span id="last-updated">Načítám…</span>
      <button id="refresh-btn" type="button">↻ Force refresh</button>
    </div>
  </header>

  <main>
    <section id="section-table">
      <h2>Tabulka skupiny MH</h2>
      <div id="table-content"><p>Načítám…</p></div>
    </section>

    <section id="section-tigers">
      <h2>Zápasy Tigers</h2>
      <div id="tigers-content"><p>Načítám…</p></div>
    </section>

    <section id="section-bracket">
      <h2>Pavouk play-off</h2>
      <div class="bracket-scroll">
        <pre id="bracket-content" class="mermaid">flowchart TD
  loading["Načítám pavouka…"]
        </pre>
      </div>
    </section>

    <section id="section-all-matches">
      <h2>Všechny zápasy skupiny MH</h2>
      <div id="all-matches-content"><p>Načítám…</p></div>
    </section>
  </main>

  <footer>
    <p>Data ze stránek <a href="https://ostravskehry.cz/" rel="noopener">ostravskehry.cz</a>.
       Automaticky aktualizováno každých 15 min přes GitHub Actions.</p>
  </footer>

  <div id="toast-container" aria-live="polite"></div>

  <script type="module" src="app.js"></script>
</body>
</html>
```

- [ ] **Step 2: Otevři v prohlížeči — vizuální kontrola**

Run: `start index.html` (Windows) nebo `xdg-open index.html` (Linux) nebo `open index.html` (Mac).
Expected: Stránka se zobrazí, čtyři sekce viditelné s "Načítám…" textem, žádné JS chyby v konzoli (kromě možná 404 na `app.js` — ten ještě nemáme).

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat(frontend): add semantic HTML markup with 4 content sections"
```

---

## Task 12: Frontend — `styles.css`

**Files:**
- Create: `styles.css`

**Cíl:** Responzivní layout, mobile-first, Tigers oranžová pro highlight.

- [ ] **Step 1: Vytvoř `styles.css`**

```css
:root {
  --orange: #ff6600;
  --dark: #1a1a1a;
  --gray-light: #f4f4f4;
  --gray: #ddd;
  --gold: #ffd700;
  --max-width: 1000px;
}

* { box-sizing: border-box; }

body {
  margin: 0;
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  color: var(--dark);
  background: #fff;
  line-height: 1.5;
}

.site-header {
  background: var(--orange);
  color: #fff;
  padding: 1rem;
  position: sticky;
  top: 0;
  z-index: 10;
  box-shadow: 0 2px 6px rgba(0,0,0,0.15);
}
.site-header h1 { margin: 0 0 0.25rem; font-size: 1.5rem; }
.site-header .subtitle { margin: 0; font-size: 0.9rem; opacity: 0.95; }
.site-header .status {
  margin-top: 0.5rem;
  display: flex;
  gap: 0.5rem;
  align-items: center;
  flex-wrap: wrap;
  font-size: 0.85rem;
}
.site-header button {
  background: rgba(255,255,255,0.2);
  color: #fff;
  border: 1px solid rgba(255,255,255,0.4);
  padding: 0.35rem 0.75rem;
  border-radius: 4px;
  cursor: pointer;
  font: inherit;
}
.site-header button:hover { background: rgba(255,255,255,0.3); }
.site-header button:disabled { opacity: 0.5; cursor: wait; }

main {
  max-width: var(--max-width);
  margin: 0 auto;
  padding: 1rem;
}
section { margin-bottom: 2.5rem; }
section h2 {
  font-size: 1.2rem;
  border-bottom: 2px solid var(--orange);
  padding-bottom: 0.25rem;
  margin: 0 0 1rem;
}

table.standings, table.matches {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9rem;
}
table th, table td {
  padding: 0.4rem 0.5rem;
  border-bottom: 1px solid var(--gray);
  text-align: left;
}
table th { background: var(--gray-light); }
tr.tigers-row { background: rgba(255,102,0,0.12); font-weight: 600; }

.match-card {
  border: 1px solid var(--gray);
  border-radius: 6px;
  padding: 0.75rem;
  margin-bottom: 0.5rem;
}
.match-card.is-tigers { border-left: 4px solid var(--orange); }
.match-card .when { font-size: 0.85rem; color: #555; }
.match-card .vs { font-weight: 600; margin: 0.25rem 0; }
.match-card .score { font-size: 1.1rem; color: var(--orange); }

.bracket-scroll {
  overflow-x: auto;
  max-width: 100%;
  border: 1px solid var(--gray);
  border-radius: 6px;
  padding: 0.5rem;
}
pre.mermaid {
  min-width: 720px;
  margin: 0;
  font-size: 13px;
}

footer {
  max-width: var(--max-width);
  margin: 3rem auto 1rem;
  padding: 1rem;
  font-size: 0.8rem;
  color: #777;
  border-top: 1px solid var(--gray);
}

#toast-container {
  position: fixed;
  bottom: 1rem;
  right: 1rem;
  z-index: 100;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.toast {
  background: var(--dark);
  color: #fff;
  padding: 0.6rem 1rem;
  border-radius: 4px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.3);
  max-width: 320px;
}
.toast.error { background: #c0392b; }
.toast.warn  { background: #d68910; }

@media (max-width: 768px) {
  .site-header h1 { font-size: 1.2rem; }
  pre.mermaid { font-size: 12px; }
  table th, table td { padding: 0.3rem; font-size: 0.85rem; }
}
```

- [ ] **Step 2: Otevři `index.html` znovu — vizuální kontrola stylu**

Expected: Header je oranžový se sticky pozicí, sekce čitelné, tlačítko Force refresh viditelné.

- [ ] **Step 3: Commit**

```bash
git add styles.css
git commit -m "feat(frontend): add responsive mobile-first styles"
```

---

## Task 13: Frontend — `lib/proxy.js` (CORS proxy failover)

**Files:**
- Create: `lib/proxy.js`
- Create: `tests/proxy.test.mjs`

**Cíl:** Modul pro fetch přes sekvenční failover 3 CORS proxy. Testovatelný přes mockované `fetch`.

- [ ] **Step 1: Napiš test (`tests/proxy.test.mjs`)**

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchViaProxy, PROXY_BUILDERS } from '../lib/proxy.js';

test('PROXY_BUILDERS: má 3 proxy', () => {
  assert.equal(PROXY_BUILDERS.length, 3);
});

test('PROXY_BUILDERS: každá vrací URL', () => {
  for (const builder of PROXY_BUILDERS) {
    const url = builder('https://example.com/');
    assert.ok(url.startsWith('https://'), `bad url: ${url}`);
    assert.ok(url.includes('example.com') || url.includes(encodeURIComponent('https://example.com/')));
  }
});

test('fetchViaProxy: vrátí text z první funkční proxy', async () => {
  let callCount = 0;
  const fakeFetch = async () => {
    callCount++;
    return { ok: true, text: async () => 'OK-body' };
  };
  const result = await fetchViaProxy('https://example.com/', { fetchImpl: fakeFetch });
  assert.equal(result, 'OK-body');
  assert.equal(callCount, 1);
});

test('fetchViaProxy: failover na 2. proxy když 1. selže', async () => {
  let callCount = 0;
  const fakeFetch = async () => {
    callCount++;
    if (callCount === 1) throw new Error('network');
    return { ok: true, text: async () => 'OK-from-fallback' };
  };
  const result = await fetchViaProxy('https://example.com/', { fetchImpl: fakeFetch });
  assert.equal(result, 'OK-from-fallback');
  assert.equal(callCount, 2);
});

test('fetchViaProxy: throw když všechny selžou', async () => {
  const fakeFetch = async () => { throw new Error('all-down'); };
  await assert.rejects(
    () => fetchViaProxy('https://example.com/', { fetchImpl: fakeFetch }),
    /all proxies failed/i,
  );
});
```

- [ ] **Step 2: Spusť testy — musí spadnout**

Run: `pnpm test`
Expected: FAIL — `lib/proxy.js` neexistuje.

- [ ] **Step 3: Implementuj `lib/proxy.js`**

```javascript
export const PROXY_BUILDERS = [
  url => `https://corsproxy.io/?${encodeURIComponent(url)}`,
  url => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  url => `https://thingproxy.freeboard.io/fetch/${url}`,
];

const TIMEOUT_MS = 8_000;

export async function fetchViaProxy(targetUrl, { fetchImpl = fetch, timeoutMs = TIMEOUT_MS } = {}) {
  const errors = [];
  for (const builder of PROXY_BUILDERS) {
    const proxyUrl = builder(targetUrl);
    try {
      const r = await fetchImpl(proxyUrl, { signal: AbortSignal.timeout(timeoutMs) });
      if (!r.ok) {
        errors.push(`${proxyUrl}: HTTP ${r.status}`);
        continue;
      }
      return await r.text();
    } catch (e) {
      errors.push(`${proxyUrl}: ${e.message}`);
    }
  }
  throw new Error(`all proxies failed: ${errors.join(' | ')}`);
}
```

- [ ] **Step 4: Spusť testy — musí projít**

Run: `pnpm test`
Expected: PASS všech 5 proxy testů.

- [ ] **Step 5: Commit**

```bash
git add lib/proxy.js tests/proxy.test.mjs
git commit -m "feat(frontend): add CORS proxy failover module with tests"
```

---

## Task 14: Frontend — `app.js` (data loading + rendering)

**Files:**
- Create: `app.js`

**Cíl:** Načte JSONy z `data/`, vykreslí 4 sekce. Mermaid přes CDN.

- [ ] **Step 1: Vytvoř `app.js`**

```javascript
import { resolveBracket, renderMermaid, BRACKET_SKELETON } from './lib/bracket.js';
import { normalizeTeamName } from './lib/parser.js';
import { fetchViaProxy } from './lib/proxy.js';
import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs';

mermaid.initialize({ startOnLoad: false, theme: 'default', securityLevel: 'loose' });

const TIGERS_FRAGMENT = 'tigers poruba';
const REFRESH_DEBOUNCE_MS = 5_000;

const $ = id => document.getElementById(id);

function toast(message, level = 'info') {
  const el = document.createElement('div');
  el.className = `toast ${level}`;
  el.textContent = message;
  $('toast-container').appendChild(el);
  setTimeout(() => el.remove(), 6_000);
}

function fmtTime(isoString) {
  if (!isoString) return '—';
  try {
    return new Intl.DateTimeFormat('cs-CZ', { dateStyle: 'short', timeStyle: 'short' })
      .format(new Date(isoString));
  } catch { return isoString; }
}

async function loadJson(path) {
  const url = `${path}?t=${Date.now()}`;
  const r = await fetch(url, { cache: 'no-cache' });
  if (!r.ok) throw new Error(`fetch ${path}: HTTP ${r.status}`);
  return r.json();
}

function renderTable(table) {
  const rows = table.groups?.MH ?? [];
  if (!Array.isArray(rows) || rows.length === 0) {
    $('table-content').innerHTML = '<p>Tabulka zatím není k dispozici (turnaj začíná 22. 5.).</p>';
    return;
  }
  const rowsHtml = rows.map(r => {
    const isTigers = normalizeTeamName(r.team).includes(TIGERS_FRAGMENT);
    return `<tr class="${isTigers ? 'tigers-row' : ''}">
      <td>${r.rank}</td>
      <td>${r.team}</td>
      <td>${r.played}</td>
      <td>${r.wins}</td>
      <td>${r.draws}</td>
      <td>${r.losses}</td>
      <td>${r.scored}:${r.conceded}</td>
      <td><strong>${r.points}</strong></td>
    </tr>`;
  }).join('');
  $('table-content').innerHTML = `<table class="standings">
    <thead><tr><th>#</th><th>Tým</th><th>Z</th><th>V</th><th>R</th><th>P</th><th>Skóre</th><th>Body</th></tr></thead>
    <tbody>${rowsHtml}</tbody>
  </table>`;
}

function fmtDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${parseInt(d, 10)}. ${parseInt(m, 10)}.`;
}

function renderTigersMatches(matches) {
  const tigers = (matches.matches ?? []).filter(m =>
    normalizeTeamName(m.home).includes(TIGERS_FRAGMENT) ||
    normalizeTeamName(m.away).includes(TIGERS_FRAGMENT)
  );
  if (!tigers.length) {
    $('tigers-content').innerHTML = '<p>Zatím žádné zápasy v rozpisu.</p>';
    return;
  }
  tigers.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  const cards = tigers.map(m => {
    const opponent = normalizeTeamName(m.home).includes(TIGERS_FRAGMENT) ? m.away : m.home;
    const scoreHtml = m.score
      ? `<div class="score">${m.score.home} : ${m.score.away}</div>`
      : '';
    return `<div class="match-card is-tigers">
      <div class="when">${fmtDate(m.date)} ${m.time ?? ''} — ${m.venue ?? ''}</div>
      <div class="vs">vs ${opponent}</div>
      ${scoreHtml}
    </div>`;
  }).join('');
  $('tigers-content').innerHTML = cards;
}

function renderAllMatches(matches) {
  const mh = (matches.matches ?? []).filter(m => m.phase === 'group' && /MH/i.test(m.group ?? ''));
  if (!mh.length) {
    $('all-matches-content').innerHTML = '<p>Zatím žádné zápasy v rozpisu.</p>';
    return;
  }
  mh.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  const rows = mh.map(m => `<tr>
    <td>${fmtDate(m.date)} ${m.time}</td>
    <td>${m.home}</td>
    <td>${m.away}</td>
    <td>${m.score ? `${m.score.home}:${m.score.away}` : '—'}</td>
    <td>${m.venue ?? ''}</td>
  </tr>`).join('');
  $('all-matches-content').innerHTML = `<table class="matches">
    <thead><tr><th>Kdy</th><th>Domácí</th><th>Hosté</th><th>Skóre</th><th>Hala</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

async function renderBracket(table, matches) {
  const resolved = resolveBracket(BRACKET_SKELETON, table, matches);
  const mermaidSrc = renderMermaid(resolved);
  const container = $('bracket-content');
  container.removeAttribute('data-processed');
  container.textContent = mermaidSrc;
  try {
    await mermaid.run({ nodes: [container] });
  } catch (e) {
    console.error('mermaid render failed', e);
    container.textContent = mermaidSrc;
  }
}

function renderHeader(meta) {
  if (!meta) {
    $('last-updated').textContent = '—';
    return;
  }
  const okText = `Stav z ${fmtTime(meta.last_success_at)}`;
  if (meta.last_attempt_status !== 'ok' && meta.last_attempt_at !== meta.last_success_at) {
    $('last-updated').innerHTML = `${okText} <span style="opacity:0.85">(poslední pokus ${fmtTime(meta.last_attempt_at)} selhal: ${meta.last_attempt_status})</span>`;
  } else {
    $('last-updated').textContent = okText;
  }
}

function isValidTable(table)   { return table?.groups && typeof table.groups === 'object'; }
function isValidMatches(m)     { return Array.isArray(m?.matches); }
function isValidMeta(m)        { return m?.last_attempt_at != null; }

async function renderAll(table, matches, meta) {
  if (!isValidTable(table) || !isValidMatches(matches)) {
    toast('Data mají neplatnou strukturu — zachovávám předchozí stav.', 'error');
    return;
  }
  renderHeader(meta);
  renderTable(table);
  renderTigersMatches(matches);
  renderAllMatches(matches);
  await renderBracket(table, matches);
}

let lastData = { table: null, matches: null, meta: null };
let refreshLocked = false;

async function initialLoad() {
  try {
    const [table, matches, meta] = await Promise.all([
      loadJson('data/table.json').catch(() => ({ groups: {} })),
      loadJson('data/matches.json').catch(() => ({ matches: [] })),
      loadJson('data/meta.json').catch(() => null),
    ]);
    lastData = { table, matches, meta };
    await renderAll(table, matches, meta);
  } catch (e) {
    console.error(e);
    toast(`Data nelze načíst: ${e.message}`, 'error');
  }
}

async function forceRefresh() {
  if (refreshLocked) return;
  refreshLocked = true;
  const btn = $('refresh-btn');
  btn.disabled = true;
  setTimeout(() => { refreshLocked = false; btn.disabled = false; }, REFRESH_DEBOUNCE_MS);

  toast('Stahuji čerstvá data…', 'info');
  try {
    const [tableHtml, matchesHtml] = await Promise.all([
      fetchViaProxy('https://ostravskehry.cz/florbal/table/'),
      fetchViaProxy('https://ostravskehry.cz/florbal/matches/?category=24'),
    ]);
    const parser = await import('./lib/parser.js');
    const tableDoc = new DOMParser().parseFromString(tableHtml, 'text/html');
    const matchesDoc = new DOMParser().parseFromString(matchesHtml, 'text/html');
    // Wrap doc do cheerio-like API:  vytvoříme tenký adaptér nad querySelectorAll
    const wrapDom = doc => {
      const fn = (sel) => ({
        each: (cb) => { doc.querySelectorAll(sel).forEach((el, i) => cb(i, el)); },
        filter: () => { throw new Error('filter not supported in browser adapter'); },
        first: () => doc.querySelector(sel),
        find: (s) => fn(`${sel} ${s}`),
        text: () => doc.querySelector(sel)?.textContent ?? '',
        attr: (name) => doc.querySelector(sel)?.getAttribute(name),
        get: () => Array.from(doc.querySelectorAll(sel)),
      });
      fn.root = () => doc.documentElement;
      return fn;
    };
    const table = parser.parseTable(wrapDom(tableDoc));
    const matches = parser.parseMatches(wrapDom(matchesDoc));
    lastData = { table, matches, meta: { ...lastData.meta, last_success_at: new Date().toISOString(), last_attempt_at: new Date().toISOString(), last_attempt_status: 'ok' } };
    await renderAll(lastData.table, lastData.matches, lastData.meta);
    toast('Aktualizováno.', 'info');
  } catch (e) {
    console.error(e);
    toast(`Refresh selhal: ${e.message}`, 'error');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  $('refresh-btn').addEventListener('click', forceRefresh);
  initialLoad();
});
```

**Důležitá poznámka pro implementátora:** `parseTable`/`parseMatches` byly napsány proti `cheerio.load($)` API. Pro browser side musíme **buď** napsat tenký adaptér nad `DOMParser` (viz `wrapDom` výše — zjednodušená verze), **nebo** refaktorovat parser na společný subset (např. použít `cheerio` i v browseru přes bundling, pokud zavedeme build step).

Pokud `wrapDom` adaptér nestačí (parser používá funkce jako `.closest`, `.nextAll`, které jsou v DOM API jinak), refactor parseru tak, aby pracoval nad **plain DOM API**: `element.querySelectorAll`, `element.textContent`, `element.getAttribute`, `element.closest`. Cheerio tohle všechno emuluje, takže Node testy budou pořád projít.

**TL;DR pro implementátora:** Pokud po Tasku 14 step 3 zjistíš, že live refresh nefunguje kvůli rozdílu cheerio vs DOM, vrať se do `lib/parser.js` a přepiš na **plain DOM API** (`element.querySelectorAll`, atd.). Pak v scraperu místo `cheerio.load(html)` použij `cheerio.load(html).root()[0]` — cheerio implementuje DOM-like API, takže to bude fungovat na obou stranách. Adaptér v `app.js` pak může být jen `doc.documentElement`.

- [ ] **Step 2: Lokální smoke test**

Spusť lokální HTTP server (jednoduchý Python, Node, atd.):
```bash
npx --yes http-server -p 5173 -c-1 .
```
Otevři `http://localhost:5173/` — stránka by měla načíst data z `data/*.json`, vykreslit tabulku, zápasy, pavouka.

Expected:
- Tabulka MH viditelná (i prázdná je OK před turnajem)
- Mermaid pavouk vykreslený s "H1/H2/H3/H4 vs D…/" kódy (před turnajem) nebo se jmény (po základní části)
- Žádné chyby v konzoli (kromě možná Mermaid warnings)

- [ ] **Step 3: Test Force refresh tlačítka**

Klikni na "↻ Force refresh". Sleduj síťové requesty v DevTools.
Expected:
- 2× fetch přes proxy (corsproxy.io)
- Pokud první proxy fungovala: data se přerenderují, toast "Aktualizováno."
- Tlačítko se na 5 s deaktivuje (debounce)

Pokud parsing v browseru selže (kvůli rozdílu cheerio vs DOM API), implementuj refactor podle poznámky výše. **Toto je nejpravděpodobnější bod selhání — počítej s 30 min navíc.**

- [ ] **Step 4: Commit**

```bash
git add app.js
git commit -m "feat(frontend): add app.js with data loading, rendering, and force refresh"
```

---

## Task 15: Frontend — Parser refactor pro browser kompatibilitu (jen pokud Task 14 step 3 selhal)

**Files:**
- Modify: `lib/parser.js`
- Modify: `scripts/scrape.mjs`
- Modify: `app.js`

**Cíl:** Sjednotit parser na plain DOM-like API, které funguje v cheerio i v browseru.

**Skip podmínka:** Pokud Task 14 step 3 prošel bez problémů, přeskoč na Task 16.

- [ ] **Step 1: Refactor `lib/parser.js`**

Přepiš `parseTable` a `parseMatches` tak, aby místo `cheerio` API ($-funkce, `.each`, `.find`, `.text`) používaly **plain DOM API**: `root.querySelectorAll`, `el.textContent`, `el.getAttribute`, `el.closest`, `el.matches`. Vstupem funkce je `Element` (root).

Příklad pro `parseMatches`:
```javascript
export function parseMatches(root) {
  const matches = [];
  const links = root.querySelectorAll('a[href*="/florbal/match/?id="]');
  for (const link of links) {
    const href = link.getAttribute('href') || '';
    const idMatch = href.match(/id=(\d+)/);
    if (!idMatch) continue;
    const id = parseInt(idMatch[1], 10);

    const row = link.closest('tr, .match, div');
    if (!row) continue;
    const rowText = row.textContent || '';
    // ... zbytek logiky beze změny
  }
  // ...
}
```

- [ ] **Step 2: Uprav `scripts/scrape.mjs`**

```javascript
// Místo:  const $ = cheerio.load(html); parseTable($);
// Použij:
const $ = cheerio.load(html);
const root = $.root()[0];                                       // získá DOM-like root element
const tableData = parseTable(root);
```

- [ ] **Step 3: Uprav `app.js`**

```javascript
// Místo wrapDom adaptéru:
const tableDoc = new DOMParser().parseFromString(tableHtml, 'text/html');
const table = parser.parseTable(tableDoc.documentElement);
const matchesDoc = new DOMParser().parseFromString(matchesHtml, 'text/html');
const matches = parser.parseMatches(matchesDoc.documentElement);
```

A v testech (`tests/parseTable.test.mjs`, `tests/parseMatches.test.mjs`) zaměň:
```javascript
const $ = cheerio.load(html);
const result = parseTable($);
```
za:
```javascript
const $ = cheerio.load(html);
const result = parseTable($.root()[0]);
```

- [ ] **Step 4: Spusť testy + lokální smoke**

Run: `pnpm test && npx http-server -p 5173 -c-1 .`
Expected: PASS všech parser testů, Force refresh funguje, pavouk se vykreslí.

- [ ] **Step 5: Commit**

```bash
git add lib/parser.js scripts/scrape.mjs app.js tests/parseTable.test.mjs tests/parseMatches.test.mjs
git commit -m "refactor(parser): switch to plain DOM API for cheerio/browser compat"
```

---

## Task 16: README + deploy

**Files:**
- Modify: `README.md`

**Cíl:** Doplnit README s návodem na deploy. Zapnout GitHub Pages a vytvořit první remote commit.

- [ ] **Step 1: Doplň `README.md`**

```markdown
# Tigers Play-off Viewer

Live stránka s výsledky FBC Tigers Poruba B13 na turnaji Ostravské hry 2026.

🔗 **Live:** https://<owner>.github.io/tigers-playoff-viewer/

## Co to dělá

- Zobrazuje aktuální tabulku skupiny MH, rozpis a výsledky zápasů Tigers, pavouk play-off, všechny zápasy ve skupině.
- Data se aktualizují každých 15 minut přes GitHub Actions, které scrapují HTML z [ostravskehry.cz](https://ostravskehry.cz/florbal/).
- Tlačítko **"Force refresh"** stáhne data live přes CORS proxy bez čekání na cron.

## Lokální development

```bash
pnpm install
pnpm scrape         # stáhne data, uloží do data/*.json
pnpm test           # spustí parser testy

# Spusť lokální server (jakýkoli statický)
npx http-server -p 5173 -c-1 .
```

## Deploy

1. **Vytvoř public GitHub repo** `tigers-playoff-viewer`.
2. Pushni branch `main`.
3. **Zapni GitHub Pages**: Settings → Pages → Source: "Deploy from a branch" → Branch: `main` → Folder: `/ (root)` → Save.
4. **Povol GH Actions** (Actions tab → Enable). Workflow `Scrape` poběží každých 15 min.
5. **Spusť první scrape ručně**: Actions → Scrape → "Run workflow".

## Architektura

- `scripts/scrape.mjs` — Node CLI, scrapuje HTML, generuje `data/*.json`.
- `lib/parser.js` — sdílený parser (Node + browser).
- `lib/bracket.js` — statická kostra pavouka + logika.
- `lib/proxy.js` — sekvenční CORS proxy failover pro live refresh.
- `app.js` + `index.html` + `styles.css` — frontend.
- `.github/workflows/scrape.yml` — cron */15.

Podrobnosti v [docs/superpowers/specs/](docs/superpowers/specs/).

## Aktualizace pavouka

Pokud organizátor turnaje změní rozpis (odložení, změna haly), edituj `BRACKET_SKELETON` v `lib/bracket.js` ručně a commitni.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add README with setup, deploy, and architecture sections"
```

- [ ] **Step 3: Vytvoř GitHub repo + push (manuální krok)**

Tohle už **neprovádí Claude** — vyžaduje to autorizaci uživatele. Návod pro uživatele:

```bash
gh repo create tigers-playoff-viewer --public --source=. --remote=origin --push
```

Nebo přes web: github.com/new → vytvořit prázdný public repo `tigers-playoff-viewer` → pak lokálně:
```bash
git remote add origin https://github.com/<user>/tigers-playoff-viewer.git
git push -u origin main
```

- [ ] **Step 4: Zapni GitHub Pages a spusť první workflow**

V GitHub UI:
1. Settings → Pages → Source: "Deploy from a branch" → Branch: `main` / `(root)` → Save.
2. Actions tab → povolit Actions pokud je třeba.
3. Actions → "Scrape" → "Run workflow" → main → Run workflow.
4. Po ~30 s zkontroluj `data/matches.json` a `data/table.json` v repu — měly by být aktualizovány.
5. Otevři live URL `https://<user>.github.io/tigers-playoff-viewer/` — stránka by měla zobrazit data.

---

## Self-review

**Spec coverage:**
- Tabulka MH (spec §5.4 sek. 2) → Task 14 `renderTable`
- Rozpis Tigers (§5.4 sek. 3) → Task 14 `renderTigersMatches`
- Pavouk play-off s nahrazenými soupeři (§5.3) → Tasks 6, 7, 8, 14 `renderBracket`
- Tigers cesta zvýrazněna (§5.3 krok 3) → Task 7 `tigersInvolved` + Task 8 style override
- Všechny zápasy MH (§5.4 sek. 5) → Task 14 `renderAllMatches`
- Live refresh přes 3 proxy (§4) → Task 13 `lib/proxy.js`
- Cache-buster `?t=` (§4) → Task 14 `loadJson` `?t=${Date.now()}`
- Debounce 5 s (§5.4) → Task 14 `REFRESH_DEBOUNCE_MS`
- `meta.json` always-commit (§5.1, §5.5) → Tasks 9, 10
- Normalizace bez fuzzy (§5.2) → Task 3
- Runtime guards bez AJV (§7) → Task 14 `isValidTable/Matches/Meta`
- UTC timestampy (§6) → Task 9 `new Date().toISOString()` + Task 14 `Intl.DateTimeFormat`
- Mobile CSS (§10) → Task 12 media query
- Parser TDD s fixturami (§8) → Tasks 2, 4, 5
- BRACKET_SKELETON manuální (§10) → Task 6 + Task 16 README

**Placeholder scan:** Žádné TBD / TODO / "implement later" — všechny code bloky obsahují konkrétní implementaci.

**Type consistency:**
- `parseTable($)` vs `parseTable(root)` — pozor, **Task 4 používá `$` (cheerio), Task 15 reflektuje refactor na plain DOM**. Implementátor začne s cheerio API; pokud Task 14 step 3 ukáže problém, Task 15 to opraví. Toto je očekávané a explicitně popsané.
- `BRACKET_SKELETON` keys `'16F-A_1'`, `'8F-A_1'` jsou konzistentně používány v Tasks 6, 7, 8, 14.
- `resolved[key].tigersInvolved` (Task 7) → konzumováno v Task 8 `renderMermaid` a Task 14 `renderBracket` (přes výstup `renderMermaid`).
- `last_attempt_status` enum `'ok' | 'parse_error' | 'network_error'` konzistentně v Tasks 9, 14.

---

**Plan complete and saved to `docs/superpowers/plans/2026-05-19-tigers-playoff-viewer.md`. Two execution options:**

**1. Subagent-Driven (recommended)** - dispatchuji čerstvého subagenta per task, review mezi tasky, rychlá iterace.

**2. Inline Execution** - tasky vykonávám v této session (executing-plans skill), batch s checkpointy.

**Který přístup?**
