# Multi-Tournament Viewer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Zobecnit Tigers Play-off Viewer na pluginový systém pro libovolné turnaje — uživatel přepíná Zdroj → Kategorie → Tým, pavouk zůstává funkční, vše bez build stepu.

**Architecture:** Každý zdroj (web/turnaj) je ES modul (`sources/<id>/index.js`) implementující kontrakt `SourceDefinition` (parser + kategorie + volitelný bracket). Sdílený `lib/bracket-engine.js` vykresluje pavouka z normalizovaného mezimodelu (IR), který plugin vyrobí. `app.js` a `scripts/scrape.mjs` jsou generické — pracují jen přes kontrakt a data model. Stávající Tigers kód se migruje na první plugin (refactor, ne rewrite).

**Tech Stack:** Node 22, pnpm, `linkedom` (Node DOM), `DOMParser` (browser), Mermaid (CDN), GitHub Actions + Pages, `node:test`.

**Spec:** `docs/superpowers/specs/2026-05-30-multi-tournament-viewer-design.md`

---

## File Structure

**Nové soubory:**
- `lib/shared.js` — sport-agnostické utility (`normalizeTeamName`, `escapeHtml`, `fmtDate`, `fmtDateCompact`, `fmtDateTime`).
- `lib/bracket-engine.js` — `resolveCode`, `highlightPath`, `renderMermaid` (sdílené, pracují nad IR).
- `sources/registry.js` — `SOURCES` (lehká metadata + lazy `load()`).
- `sources/_contract.md` — dokumentace kontraktu + recept na pavouka.
- `sources/tigers-ostravske-2026/index.js` — `SourceDefinition`.
- `sources/tigers-ostravske-2026/parser.js` — přesun ze `lib/parser.js`.
- `sources/tigers-ostravske-2026/bracket.js` — `buildBracketModel` (refactor `lib/bracket.js`).
- `sources/tigers-ostravske-2026/demos/` — přesun `data/demo/`.

**Modifikované:**
- `app.js` — generalizace (lazy load pluginu, přepínače, focus override, deep-link, data path).
- `index.html` — přepínače Zdroj/Kategorie/Tým, dynamické nadpisy.
- `styles.css` — styly přepínačů.
- `scripts/scrape.mjs` — multi-source (registr × kategorie, aktivní okna, URL-dedup, groupFilter).
- `.github/workflows/scrape.yml` — amend commit mechanika.
- `README.md` — jak přidat zdroj.

**Smazané (po migraci):**
- `lib/parser.js`, `lib/bracket.js` (přesunuté do pluginu / enginu).
- `data/{table,matches,meta}.json`, `data/demo/` (přesunuté).

**Datový model (referenční tvar pro celý plán):**
```jsonc
// table.json
{ "scraped_at": "2026-05-22T11:30:00Z",
  "groups": { "MH": [ { "rank": 1, "team": "FBC Tigers Poruba", "scored": 15, "conceded": 8, "points": 7 } ] } }
// matches.json
{ "category": "BU13", "scraped_at": "…",
  "matches": [ { "id": 2294, "date": "2026-05-22", "time": "11:15", "group": "MH",
                 "phase": "group", "venue": "SPŠ Elektroniky",
                 "home": "FBC Tigers Poruba", "away": "…", "score": null } ] }
// meta.json
{ "last_success_at": "…", "last_attempt_at": "…", "last_attempt_status": "ok",
  "source": "tigers-ostravske-2026", "category": "BU13" }
```

**BracketModel (IR) — tvar, který plugin vyrábí a engine spotřebovává:**
```js
{
  nodes: [
    { id: 'H1', round: '16F-A · H1', home: 'FBC Tigers Poruba', away: 'D-team4',
      score: { home: 5, away: 3 } | null, venue: 'Sareza Přívoz', when: '23.5. 14:00',
      shape: 'box' | 'rounded', forceHighlight: false }
  ],
  edges: [ { from: 'H1', to: 'OF_A1', label: 'výhra' } ],
}
```

---

## Task 1: `lib/shared.js` — sport-agnostické utility

**Files:**
- Create: `lib/shared.js`
- Test: `tests/shared.test.mjs`

**Cíl:** Vytáhnout čisté utility z `app.js`/`lib/parser.js`/`lib/bracket.js` na jedno místo. `normalizeTeamName` se přesune z `lib/parser.js` (zůstane re-exportovaný odtamtud kvůli Tasku 4).

- [ ] **Step 1: Napiš test (`tests/shared.test.mjs`)**

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTeamName, escapeHtml, fmtDate, fmtDateCompact, fmtDateTime } from '../lib/shared.js';

test('normalizeTeamName: trim + lowercase + bez diakritiky', () => {
  assert.equal(normalizeTeamName('  FBC Tigers Poruba  '), 'fbc tigers poruba');
  assert.equal(normalizeTeamName('Třinec červení'), 'trinec cerveni');
});

test('escapeHtml: escapuje speciální znaky', () => {
  assert.equal(escapeHtml('<a href="x">&'), '&lt;a href=&quot;x&quot;&gt;&amp;');
  assert.equal(escapeHtml(null), '');
});

test('fmtDate: ISO → "D. M." s mezerou', () => {
  assert.equal(fmtDate('2026-05-22'), '22. 5.');
  assert.equal(fmtDate(''), '');
});

test('fmtDateCompact: ISO → "D.M." bez mezery', () => {
  assert.equal(fmtDateCompact('2026-05-22'), '22.5.');
});

test('fmtDateTime: ISO → lokální cs formát (nespadne)', () => {
  const out = fmtDateTime('2026-05-22T11:30:00Z');
  assert.equal(typeof out, 'string');
  assert.ok(out.length > 0);
  assert.equal(fmtDateTime(null), '—');
});
```

- [ ] **Step 2: Spusť test — musí spadnout**

Run: `pnpm test`
Expected: FAIL — `lib/shared.js` neexistuje.

- [ ] **Step 3: Implementuj `lib/shared.js`**

```javascript
export function normalizeTeamName(s) {
  return s
    .trim()
    .toLocaleLowerCase('cs')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
}

export function escapeHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// "2026-05-22" → "22. 5." (UI varianta s mezerou)
export function fmtDate(iso) {
  if (!iso) return '';
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  return `${parseInt(m[3], 10)}. ${parseInt(m[2], 10)}.`;
}

// "2026-05-22" → "22.5." (kompaktní varianta pro bracket labels)
export function fmtDateCompact(iso) {
  if (!iso) return '';
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  return `${parseInt(m[3], 10)}.${parseInt(m[2], 10)}.`;
}

// ISO → lokální cs-CZ datum+čas; fallback na vstup; "—" pro prázdné
export function fmtDateTime(isoString) {
  if (!isoString) return '—';
  try {
    return new Intl.DateTimeFormat('cs-CZ', { dateStyle: 'short', timeStyle: 'short' })
      .format(new Date(isoString));
  } catch {
    return isoString;
  }
}
```

- [ ] **Step 4: Spusť test — musí projít**

Run: `pnpm test`
Expected: PASS všech 5 testů.

- [ ] **Step 5: Commit**

```bash
git add lib/shared.js tests/shared.test.mjs
git commit -m "feat(shared): add sport-agnostic utilities (normalize, escape, fmt)"
```

---

## Task 2: `lib/bracket-engine.js` — `resolveCode`

**Files:**
- Create: `lib/bracket-engine.js`
- Test: `tests/bracket-engine.test.mjs`

**Cíl:** Přeložit position kód (`H1`) na jméno týmu z tabulky. Oproti stávajícímu `lib/bracket.js` je mapování písmeno→skupina **parametr** (`positionGroups`), ne hardcoded konstanta — tím je engine turnaj-nezávislý.

- [ ] **Step 1: Napiš test (`tests/bracket-engine.test.mjs`)**

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveCode } from '../lib/bracket-engine.js';

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
```

- [ ] **Step 2: Spusť test — musí spadnout**

Run: `pnpm test`
Expected: FAIL — `lib/bracket-engine.js` neexistuje.

- [ ] **Step 3: Implementuj `resolveCode` v `lib/bracket-engine.js`**

```javascript
function anyGamesPlayedInGroup(rows) {
  if (!Array.isArray(rows)) return false;
  return rows.some(r => (r.points ?? 0) > 0 || (r.scored ?? 0) > 0 || (r.conceded ?? 0) > 0);
}

// "H1" → tým na 1. místě skupiny dle positionGroups['H']. null pokud nelze rozhodnout.
// positionGroups: mapování písmene kódu na klíč skupiny v table.groups, např. { H: 'MH', D: 'MD' }.
export function resolveCode(code, table, positionGroups) {
  const m = typeof code === 'string' ? code.match(/^([A-Z])(\d+)$/) : null;
  if (!m) return null;
  const groupKey = positionGroups?.[m[1]];
  if (!groupKey) return null;
  const rows = table?.groups?.[groupKey];
  if (!Array.isArray(rows)) return null;
  // Před odehráním zápasů je rank jen abecední seed — nepřekládáme.
  if (!anyGamesPlayedInGroup(rows)) return null;
  const row = rows.find(r => r.rank === parseInt(m[2], 10));
  return row?.team ?? null;
}
```

- [ ] **Step 4: Spusť test — musí projít**

Run: `pnpm test`
Expected: PASS všech 3 `resolveCode` testů.

- [ ] **Step 5: Commit**

```bash
git add lib/bracket-engine.js tests/bracket-engine.test.mjs
git commit -m "feat(bracket-engine): add resolveCode with parametrized positionGroups"
```

---

## Task 3: `lib/bracket-engine.js` — `highlightPath` + `renderMermaid`

**Files:**
- Modify: `lib/bracket-engine.js`
- Test: `tests/bracket-engine.test.mjs`

**Cíl:** Generický highlight focus týmu (nad jmény v IR) + serializace IR do Mermaid `flowchart TD` stringu. Veškerá turnaj-specifická logika zůstane v pluginu (Task 5); engine jen renderuje popsaný model.

**Pravidlo highlightu:** uzel je zvýrazněný, pokud některý z jeho účastníků (`home`/`away`) je focus tým (po `normalizeTeamName`), nebo má `forceHighlight: true`. Protože plugin do IR dosadí jméno focus týmu jen na uzly jeho skutečné cesty, je to ekvivalent dnešního „sledování cesty dle výsledků".

- [ ] **Step 1: Přidej testy do `tests/bracket-engine.test.mjs`**

```javascript
import { highlightPath, renderMermaid } from '../lib/bracket-engine.js';

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
  // Finále má zaoblený tvar (["…"])
  assert.match(out, /FIN\(\["/);
  // Zvýrazněný uzel má oranžový styl
  assert.match(out, /style ZC1 fill:#ff6600/);
});

test('renderMermaid: skóre a label v uzlu', () => {
  const out = renderMermaid(model, { highlighted: new Set(), focusTeam: null });
  assert.ok(out.includes('5 : 3'));         // skóre ZC1
  assert.ok(out.includes('MH skupina'));    // round label
});
```

- [ ] **Step 2: Spusť test — musí spadnout**

Run: `pnpm test`
Expected: FAIL — `highlightPath`/`renderMermaid` nejsou exportované.

- [ ] **Step 3: Implementuj `highlightPath` + `renderMermaid`**

Přidej do `lib/bracket-engine.js` (nahoře doplň import):

```javascript
import { normalizeTeamName } from './shared.js';

function nodeContainsTeam(node, key) {
  if (!key) return false;
  const h = node.home ? normalizeTeamName(node.home) : '';
  const a = node.away ? normalizeTeamName(node.away) : '';
  return h === key || a === key;
}

// Vrátí Set ID uzlů na cestě focus týmu. Uzel je na cestě, pokud obsahuje focus tým
// (po normalizaci) nebo má forceHighlight (a focus je znám).
export function highlightPath(model, focusTeam) {
  const set = new Set();
  const key = focusTeam ? normalizeTeamName(focusTeam) : null;
  if (!key) return set;
  for (const n of model.nodes) {
    if (n.forceHighlight) set.add(n.id);
    if (nodeContainsTeam(n, key)) set.add(n.id);
  }
  return set;
}

function nodeLabel(node) {
  const lines = [];
  if (node.round) lines.push(node.round);
  const home = node.home || '?';
  const away = node.away || '?';
  if (home !== '?' && away !== '?') lines.push(`${home} – ${away}`);
  else if (away !== '?') lines.push(`vs ${away}`);
  else if (home !== '?') lines.push(home);
  if (node.when || node.venue) lines.push([node.when, node.venue].filter(Boolean).join(' '));
  if (node.score) lines.push(`${node.score.home} : ${node.score.away}`);
  return lines.join('\\n').replace(/"/g, "'");
}

// Serializuje IR do Mermaid flowchart TD. opts.highlighted = Set ID; opts.focusTeam jen informativní.
export function renderMermaid(model, opts = {}) {
  const highlighted = opts.highlighted ?? new Set();
  const lines = ['flowchart TD'];

  for (const n of model.nodes) {
    const label = nodeLabel(n);
    const body = n.shape === 'rounded' ? `(["${label}"])` : `["${label}"]`;
    lines.push(`    ${n.id}${body}`);
  }

  for (const e of model.edges) {
    const label = e.label ? `|${e.label}|` : '';
    lines.push(`    ${e.from} -->${label} ${e.to}`);
  }

  // Played/unplayed styling
  for (const n of model.nodes) {
    if (highlighted.has(n.id)) continue; // highlight přepíše níže
    if (n.score) {
      lines.push(`    style ${n.id} fill:#d6eaf8,stroke:#2874a6,stroke-width:1px,color:#1b4f72`);
    } else {
      lines.push(`    style ${n.id} fill:#ffffff,stroke:#aaaaaa,stroke-width:1px,stroke-dasharray:4 3,color:#666`);
    }
  }

  // Highlight cesty (oranžově) — po played-stylech, ať override
  for (const n of model.nodes) {
    if (!highlighted.has(n.id)) continue;
    if (n.shape === 'rounded') {
      lines.push(`    style ${n.id} fill:#ffd700,color:#000,font-weight:bold,stroke:#ff6600,stroke-width:3px`);
    } else {
      lines.push(`    style ${n.id} fill:#ff6600,color:#fff,stroke:#000,stroke-width:2px`);
    }
  }

  return lines.join('\n');
}
```

- [ ] **Step 4: Spusť test — musí projít**

Run: `pnpm test`
Expected: PASS všech `highlightPath` + `renderMermaid` testů.

- [ ] **Step 5: Commit**

```bash
git add lib/bracket-engine.js tests/bracket-engine.test.mjs
git commit -m "feat(bracket-engine): add highlightPath and renderMermaid over IR"
```

---

## Task 4: Přesun parseru do pluginu

**Files:**
- Create: `sources/tigers-ostravske-2026/parser.js`
- Modify: stávající `tests/parseTable.test.mjs`, `tests/parseMatches.test.mjs`, `tests/normalize.test.mjs`, `tests/tigersPath.test.mjs` (oprava import cest)
- Delete (na konci): nic zatím (starý `lib/parser.js` smažeme v Tasku 12)

**Cíl:** Přesunout `lib/parser.js` do pluginu beze změny parsovací logiky; `normalizeTeamName` brát z `lib/shared.js`.

- [ ] **Step 1: Zkopíruj soubor**

Run:
```bash
mkdir -p sources/tigers-ostravske-2026
cp lib/parser.js sources/tigers-ostravske-2026/parser.js
```

- [ ] **Step 2: Uprav `sources/tigers-ostravske-2026/parser.js` — `normalizeTeamName` z shared**

Nahraď úvodní definici `normalizeTeamName` re-exportem ze shared. Tj. odstraň blok:
```javascript
export function normalizeTeamName(s) {
  return s
    .trim()
    .toLocaleLowerCase('cs')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
}
```
a nahraď ho prvním řádkem souboru:
```javascript
export { normalizeTeamName } from '../../lib/shared.js';
```
Zbytek souboru (`PHASE_PATTERNS`, `detectPhase`, `parseDateCs`, `parseScore`, `parseTable`, `parseMatches`, `textWithoutSmall`, `GROUP_CODE_REGEX`) ponech beze změny.

- [ ] **Step 3: Přesměruj testy parseru na nový soubor**

Ve `tests/parseTable.test.mjs`, `tests/parseMatches.test.mjs`, `tests/normalize.test.mjs` změň import:
```javascript
// z:
import { parseTable, parseMatches, normalizeTeamName } from '../lib/parser.js';
// na:
import { parseTable, parseMatches, normalizeTeamName } from '../sources/tigers-ostravske-2026/parser.js';
```
(V každém testu jen ty symboly, které importuje.) Pokud `tests/tigersPath.test.mjs` importuje z `lib/parser.js` nebo `lib/bracket.js`, ten test zatím **přeskoč** — `lib/bracket.js` se mění v Tasku 5; uprav ho tam.

- [ ] **Step 4: Spusť testy — musí projít**

Run: `pnpm test`
Expected: PASS parser testy (parseTable, parseMatches, normalize). Fixtury v `tests/fixtures/` zůstávají na místě.

- [ ] **Step 5: Commit**

```bash
git add sources/tigers-ostravske-2026/parser.js tests/parseTable.test.mjs tests/parseMatches.test.mjs tests/normalize.test.mjs
git commit -m "refactor(tigers): move parser into source plugin, share normalizeTeamName"
```

---

## Task 5: `renderBracket` v pluginu (přesun `lib/bracket.js`)

> **⚠️ ODCHYLKA OD PŮVODNÍHO PLÁNU (rozhodnuto při implementaci 2026-05-31):**
> Původní záměr „plugin vyrobí IR `{nodes,edges}` a generický engine ho vykreslí" **neprošel realitou**: stávající Tigers pavouk je příliš specifický (subgrafy Play-off A/B, tečkované alternativy `-.->`, řetězené hrany, a hlavně highlight přes `tigersHighlightedNodes`, který zvýrazňuje i placeholder uzly `✖ H1/D4`, kam focus tým teprve postupuje — generický `highlightPath` přes jména to nereprodukuje). Bytová parita by vynutila přepis enginu do kopie starého kódu.
>
> **Nový přístup (ctí spec §5.3 „renderBracket → Mermaid/HTML"):** plugin exportuje **`renderBracket(matches, table, focusTeam) → Mermaid string`** vzniklý **přesunem** `renderStaticBracket` + jeho pomocníků z `lib/bracket.js` do pluginu, **beze změny logiky** — jen `Tigers` → `focusTeam` parametrizace a lokální `resolveCode` → `resolveCode(code, table, POSITION_GROUPS)` z enginu. **Parita = bytová shoda s dnešním `renderStaticBracket`** (triviálně drží, kód se v podstatě nemění).
>
> Engine `highlightPath`/`renderMermaid` (Task 2–3) **zůstávají** jako volitelné utility pro budoucí jednoduché brackety (otestované), Tigers je nepoužije. Dopady na další tasky: **Task 6** kontrakt používá `renderBracket` místo `buildBracketModel`; **Task 10** app.js volá `category.renderBracket(...) → string` (ne přes engine); **`_contract.md`** popisuje `renderBracket`. Ignoruj níže uvedený IR kód (`nodeFields`, `buildBracketModel`) — nahrazuje ho přesun popsaný výše.

**Files:**
- Create: `sources/tigers-ostravske-2026/bracket.js`
- Test: `tests/sources/tigers-ostravske-2026/bracket.test.mjs`
- Reference: stávající `lib/bracket.js` (zdroj logiky)

**Cíl:** Z `lib/bracket.js` vytvořit `buildBracketModel(matches, table, focusTeam)`, který vrátí **IR** (`{ nodes, edges }`) místo Mermaid stringu. Mermaid pak vyrobí engine (Task 3). Logika resolve placeholderů a kostry zůstává; mění se jen výstup (IR místo `lines`). Parita se ověří snapshotem.

**Postup refactoru (přečti `lib/bracket.js` než začneš):**
- `STATIC_TEMPLATE`, `resolvePlaceholder`, `resolveCode` (lokální), `findMatchByCodeAndPhase`, `isPlaceholderCell`, `_cellTokens`, `tigersPositionCode`, `isTigersTeam`, `matchContainsCode` — **ponech** (zkopíruj do nového souboru).
- `tigersPositionCode` používá fragment `tigers poruba` natvrdo → nahraď parametrem `focusTeam` (viz níže).
- `renderStaticBracket` → přepiš na `buildBracketModel`, který místo `lines.push('… mermaid …')` plní `nodes`/`edges`.
- `tigersHighlightedNodes`, `nodeLabelStatic`, `renderMermaid`, `tigersPath`, `inferEdges`, `nodeLabel`, `fmtScore` — **zahoď** (highlight i render dělá engine; label se skládá v enginu z node fields).
- `normalizeTeamName` ber z `lib/shared.js`; `resolveCode` z `lib/bracket-engine.js` s `POSITION_GROUPS`.

- [ ] **Step 1: Zachyť snapshot stávajícího pavouka (před refactorem)**

Vytvoř dočasný skript a ulož výstupy ze 3 demo scénářů jako referenci:
```bash
mkdir -p tests/sources/tigers-ostravske-2026/__snapshots__
node --input-type=module -e "
import { renderStaticBracket } from './lib/bracket.js';
import { readFileSync, writeFileSync } from 'node:fs';
for (const scn of ['po-skupine','po-16f','turnaj-dohran']) {
  const matches = JSON.parse(readFileSync('data/demo/'+scn+'/matches.json','utf8'));
  const table   = JSON.parse(readFileSync('data/demo/'+scn+'/table.json','utf8'));
  const out = renderStaticBracket(matches, table);
  writeFileSync('tests/sources/tigers-ostravske-2026/__snapshots__/'+scn+'.mmd', out);
}
console.log('snapshots written');
"
```
Expected: `snapshots written`, tři `.mmd` soubory. **Tyto soubory jsou referenční výstup, který musí nový kód reprodukovat.**

- [ ] **Step 2: Napiš parity test (`tests/sources/tigers-ostravske-2026/bracket.test.mjs`)**

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildBracketModel } from '../../../sources/tigers-ostravske-2026/bracket.js';
import { highlightPath, renderMermaid } from '../../../lib/bracket-engine.js';

const FOCUS = 'FBC Tigers Poruba';

function renderScenario(scn) {
  const matches = JSON.parse(readFileSync(new URL(`../../../data/demo/${scn}/matches.json`, import.meta.url), 'utf8'));
  const table   = JSON.parse(readFileSync(new URL(`../../../data/demo/${scn}/table.json`, import.meta.url), 'utf8'));
  const model = buildBracketModel(matches, table, FOCUS);
  const highlighted = highlightPath(model, FOCUS);
  return renderMermaid(model, { highlighted, focusTeam: FOCUS });
}

for (const scn of ['po-skupine', 'po-16f', 'turnaj-dohran']) {
  test(`buildBracketModel parity: ${scn}`, () => {
    const expected = readFileSync(new URL(`./__snapshots__/${scn}.mmd`, import.meta.url), 'utf8');
    const actual = renderScenario(scn);
    assert.equal(actual, expected);
  });
}

test('buildBracketModel: vrací IR tvar', () => {
  const matches = { matches: [] };
  const table = { groups: { MH: [], MD: [], ME: [] } };
  const model = buildBracketModel(matches, table, FOCUS);
  assert.ok(Array.isArray(model.nodes));
  assert.ok(Array.isArray(model.edges));
});
```

> **Poznámka k paritě:** Cíl je bytově shodný Mermaid. Pokud se výstup liší jen v pořadí `style` řádků nebo whitespace, srovnej generování v `buildBracketModel`/engine tak, aby pořadí odpovídalo snapshotu (uzly → hrany → played-styly → highlight-styly). Pokud je rozdíl jen kosmetický a neškodí vykreslení, smíš snapshot přegenerovat (Step 1) — ale jen po vizuální kontrole v prohlížeči.

- [ ] **Step 3: Spusť test — musí spadnout**

Run: `pnpm test`
Expected: FAIL — `sources/tigers-ostravske-2026/bracket.js` neexistuje.

- [ ] **Step 4: Implementuj `sources/tigers-ostravske-2026/bracket.js`**

Vyjdi z `lib/bracket.js`. Zkopíruj beze změny tyto části: `STATIC_TEMPLATE`, `_cellTokens`, `_sortedKey`, `isPlaceholderCell`, `resolvePlaceholder`, `findMatchByCodeAndPhase`, `matchContainsCode`, `shortVenue`, `shortTeam`. Na začátek dej:

```javascript
import { normalizeTeamName, fmtDateCompact } from '../../lib/shared.js';
import { resolveCode } from '../../lib/bracket-engine.js';

const TIGERS_FRAGMENT = 'tigers poruba';   // fallback fragment pro identifikaci focus týmu
const POSITION_GROUPS = { H: 'MH', D: 'MD', E: 'ME', A: 'MA', B: 'MB', C: 'MC', F: 'MF', G: 'MG' };

function focusKey(focusTeam) {
  return focusTeam ? normalizeTeamName(focusTeam) : TIGERS_FRAGMENT;
}
function isFocusTeam(name, focusTeam) {
  if (!name) return false;
  const n = normalizeTeamName(name);
  const key = focusKey(focusTeam);
  return n === key || n.includes(TIGERS_FRAGMENT);
}
```

Dále `tigersPositionCode` přejmenuj na `focusPositionCode(table, focusTeam)` a nahraď `isTigersTeam(row.team)` za `isFocusTeam(row.team, focusTeam)`:

```javascript
function focusPositionCode(table, focusTeam) {
  const mh = table?.groups?.MH;
  if (!Array.isArray(mh) || mh.length === 0) return null;
  const anyGamePlayed = mh.some(r => r.points > 0 || r.scored > 0 || r.conceded > 0);
  if (!anyGamePlayed) return null;
  const found = mh.find(row => isFocusTeam(row.team, focusTeam));
  if (!found) return null;
  return `H${found.rank}`;
}
```

Lokální `resolveCode(code, table)` v `lib/bracket.js` nahraď voláním engine helperu — kdekoli byl, použij `resolveCode(code, table, POSITION_GROUPS)`. (V `resolvePlaceholder` a `nodeLabel*` voláních.)

Hlavní funkce: přepiš `renderStaticBracket` na `buildBracketModel`. Místo `lines.push("    ID[...]")` přidávej do `nodes`; místo `lines.push("    A -->|x| B")` přidávej do `edges`. Použij tento skeleton (doplň label-pole z template + resolve, ne hotový Mermaid label — ten skládá engine):

```javascript
function nodeFields(template, match, table, focusTeam) {
  // round = titulek; home/away = resolvované jméno nebo placeholder; when/venue z template; score z matche
  const round = template.title || (template.match !== undefined ? 'MH skupina' : '');
  let home = '?', away = '?';
  if (match) {
    home = resolvePlaceholder(match.home, { matches: [] }, table) ?? match.home; // viz pozn. níže
    away = resolvePlaceholder(match.away, { matches: [] }, table) ?? match.away;
  } else if (template.opponentPlaceholder) {
    away = resolveCode(template.opponentPlaceholder, table, POSITION_GROUPS) || template.opponentPlaceholder;
  }
  return {
    round,
    home: shortTeam(home),
    away: shortTeam(away),
    score: match?.score ? { home: match.score.home, away: match.score.away } : null,
    when: template.when || '',
    venue: shortVenue(template.venue || ''),
  };
}

export function buildBracketModel(matches, table, focusTeam) {
  const nodes = [];
  const edges = [];
  const focusCode = focusPositionCode(table, focusTeam);

  const groupMatches = (matches.matches || [])
    .filter(m => m.phase === 'group' && isFocusTeam(m.home, focusTeam) || isFocusTeam(m.away, focusTeam))
    .filter(m => m.phase === 'group')
    .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));

  // — Group stage —
  STATIC_TEMPLATE.group.forEach((t) => {
    const m = groupMatches[t.match];
    const f = nodeFields({ ...t, title: 'MH skupina' }, m, table, focusTeam);
    nodes.push({ id: t.id, ...f, shape: 'box', forceHighlight: false });
  });
  nodes.push({ id: 'START', round: 'Výsledek skupiny MH', home: '?', away: '?', score: null,
               when: '', venue: '', shape: 'rounded', forceHighlight: !!focusCode });
  edges.push({ from: 'ZC1', to: 'ZC2', label: '' });
  edges.push({ from: 'ZC2', to: 'ZC3', label: '' });
  edges.push({ from: 'ZC3', to: 'START', label: '' });

  // — 16F-A —
  STATIC_TEMPLATE.sixteenF.forEach((t) => {
    const m = findMatchByCodeAndPhase(matches, '16F-A', t.code, focusCode);
    const f = nodeFields(t, m, table, focusTeam);
    nodes.push({ id: t.id, ...f, shape: 'box', forceHighlight: false });
  });
  if (focusCode) {
    const n = focusCode[1];
    edges.push({ from: 'START', to: `H${n}`, label: `${n}. místo` });
    for (let i = 1; i <= 4; i++) if (String(i) !== n) edges.push({ from: 'START', to: `H${i}`, label: `${i}. místo`, dotted: true });
  } else {
    for (let i = 1; i <= 4; i++) edges.push({ from: 'START', to: `H${i}`, label: `${i}. místo` });
  }

  // — Play-off A i B (8F/4F/SF) + finále —
  const branch = [
    ['eightA', '8F-A'], ['fourA', '4F-A'], ['semiA', 'SF-A'],
    ['eightB', '8F-B'], ['fourB', '4F-B'], ['semiB', 'SF-B'],
  ];
  for (const [tplKey, phase] of branch) {
    for (const t of STATIC_TEMPLATE[tplKey]) {
      const m = t.code ? findMatchByCodeAndPhase(matches, phase, t.code, focusCode) : null;
      const f = nodeFields(t, m, table, focusTeam);
      nodes.push({ id: t.id, ...f, shape: 'box', forceHighlight: false });
    }
  }
  for (const finKey of ['finalA', 'finalB']) {
    const t = STATIC_TEMPLATE[finKey];
    const m = (matches.matches || []).find(x => x.phase === t.byPhase);
    const f = nodeFields(t, m, table, focusTeam);
    nodes.push({ id: t.id, ...f, shape: 'rounded', forceHighlight: false });
  }

  // — Hrany play-off (přesně jako renderStaticBracket) —
  for (let i = 1; i <= 4; i++) {
    edges.push({ from: `OF_A${i}`, to: `QF_A${i}`, label: 'výhra' });
    edges.push({ from: `OF_B${i}`, to: `QF_B${i}`, label: 'výhra' });
    edges.push({ from: `H${i}`, to: `OF_A${i}`, label: 'výhra' });
    edges.push({ from: `H${i}`, to: `OF_B${i}`, label: 'prohra' });
    edges.push({ from: `OF_A${i}`, to: `QF_B${i}`, label: 'prohra' });
  }
  edges.push({ from: 'QF_A1', to: 'SF_A2', label: 'výhra' });
  edges.push({ from: 'QF_A2', to: 'SF_A1', label: 'výhra' });
  edges.push({ from: 'QF_A3', to: 'SF_A2', label: 'výhra' });
  edges.push({ from: 'QF_A4', to: 'SF_A1', label: 'výhra' });
  edges.push({ from: 'SF_A1', to: 'FINAL_A', label: 'výhra' });
  edges.push({ from: 'SF_A2', to: 'FINAL_A', label: 'výhra' });
  edges.push({ from: 'QF_B1', to: 'SF_B2', label: 'výhra' });
  edges.push({ from: 'QF_B2', to: 'SF_B1', label: 'výhra' });
  edges.push({ from: 'QF_B3', to: 'SF_B2', label: 'výhra' });
  edges.push({ from: 'QF_B4', to: 'SF_B1', label: 'výhra' });
  edges.push({ from: 'SF_B1', to: 'FINAL_B', label: 'výhra' });
  edges.push({ from: 'SF_B2', to: 'FINAL_B', label: 'výhra' });

  return { nodes, edges };
}
```

> **Pozn. k `resolvePlaceholder`:** stávající `resolvePlaceholder(cell, matches, table)` potřebuje plné `matches` (rekurzivně dohledává vítěze). V `nodeFields` předej **skutečné** `matches` (ne prázdné). Uprav signaturu `nodeFields(template, match, table, focusTeam, matches)` a volej `resolvePlaceholder(match.home, matches, table)`. Zkopíruj `resolvePlaceholder` z `lib/bracket.js` beze změny (používá lokální `resolveCode` — uprav na `resolveCode(tokens[0], table, POSITION_GROUPS)`).

> **Pozn. k engine renderu vs. dnešní `nodeLabelStatic`:** dnešní label dává pořadí řádků `title / "Home – Away" / when+venue / score`. Engine `nodeLabel` (Task 3) dělá totéž pořadí. Pokud snapshot odhalí rozdíl (např. „MH skupina" vs. číslo, nebo `D.M.` formát), srovnej `nodeFields` (jaká data do IR dáš) — ne engine.

- [ ] **Step 5: Spusť parity testy — lad až do PASS**

Run: `pnpm test`
Expected: PASS všech 3 parity snapshotů + IR-tvar test. Pokud parita selže, porovnej `actual` vs `expected` (diff) a srovnej `nodeFields`/pořadí push do `nodes`/`edges`. Highlight a played-styling řeší engine — pokud se liší barvy/pořadí stylů, je chyba v engine Task 3 (oprav tam).

- [ ] **Step 6: Uklid dočasný snapshot skript a commit**

Snapshoty v `__snapshots__/` ponech (jsou součást testu). Commit:
```bash
git add sources/tigers-ostravske-2026/bracket.js tests/sources/tigers-ostravske-2026/
git commit -m "refactor(tigers): build bracket as IR, render via shared engine (parity preserved)"
```

---

## Task 6: `SourceDefinition` + registr + dokumentace kontraktu

**Files:**
- Create: `sources/tigers-ostravske-2026/index.js`
- Create: `sources/registry.js`
- Create: `sources/_contract.md`
- Test: `tests/registry.test.mjs`

**Cíl:** Sestavit plugin do jednoho `SourceDefinition`, zaregistrovat ho a zdokumentovat kontrakt.

- [ ] **Step 1: Napiš test (`tests/registry.test.mjs`)**

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SOURCES } from '../sources/registry.js';

test('registry: obsahuje tigers zdroj s lehkými metadaty', () => {
  const s = SOURCES.find(x => x.id === 'tigers-ostravske-2026');
  assert.ok(s, 'tigers zdroj chybí');
  assert.equal(typeof s.label, 'string');
  assert.equal(typeof s.activeFrom, 'string');
  assert.equal(typeof s.activeTo, 'string');
  assert.ok(Array.isArray(s.categories) && s.categories.length >= 1);
  assert.equal(typeof s.load, 'function');
});

test('registry: lazy load vrátí plný SourceDefinition s kontraktem', async () => {
  const s = SOURCES.find(x => x.id === 'tigers-ostravske-2026');
  const mod = await s.load();
  const def = mod.default;
  assert.equal(def.id, 'tigers-ostravske-2026');
  assert.equal(typeof def.parseTable, 'function');
  assert.equal(typeof def.parseMatches, 'function');
  const cat = def.categories.find(c => c.id === 'BU13');
  assert.ok(cat, 'BU13 kategorie chybí');
  assert.equal(typeof cat.fetchTargets.table, 'string');
  assert.equal(typeof cat.fetchTargets.matches, 'string');
  assert.equal(typeof cat.buildBracketModel, 'function');
});
```

- [ ] **Step 2: Spusť test — musí spadnout**

Run: `pnpm test`
Expected: FAIL — `sources/registry.js` neexistuje.

- [ ] **Step 3: Implementuj `sources/tigers-ostravske-2026/index.js`**

```javascript
import { parseTable, parseMatches } from './parser.js';
import { buildBracketModel } from './bracket.js';

export default {
  id: 'tigers-ostravske-2026',
  label: 'Tigers — Ostravské hry 2026',
  sport: 'florbal',
  activeFrom: '2026-05-22T00:00:00Z',
  activeTo:   '2026-05-26T00:00:00Z',

  parseTable,
  parseMatches,

  categories: [
    {
      id: 'BU13',
      label: 'B13 5+1 (skupina MH)',
      fetchTargets: {
        table:   'https://ostravskehry.cz/florbal/table/',
        matches: 'https://ostravskehry.cz/florbal/matches/?category=24',
      },
      groupFilter: 'all',
      defaultFocusTeam: 'FBC Tigers Poruba',
      defaultGroup: 'MH',
      buildBracketModel,
    },
  ],
};
```

- [ ] **Step 4: Implementuj `sources/registry.js`**

```javascript
// Lehká metadata (čtena bez nahrání parseru) + lazy loader plného SourceDefinition.
// Přidání zdroje: nová složka sources/<id>/ + jeden záznam zde.
export const SOURCES = [
  {
    id: 'tigers-ostravske-2026',
    label: 'Tigers — Ostravské hry 2026',
    activeFrom: '2026-05-22T00:00:00Z',
    activeTo:   '2026-05-26T00:00:00Z',
    categories: [
      { id: 'BU13', label: 'B13 5+1 (skupina MH)', defaultFocusTeam: 'FBC Tigers Poruba', defaultGroup: 'MH' },
    ],
    load: () => import('./tigers-ostravske-2026/index.js'),
  },
];
```

- [ ] **Step 5: Napiš `sources/_contract.md`**

```markdown
# Kontrakt zdroje (SourceDefinition)

Každý zdroj je složka `sources/<id>/` s `index.js`, jehož **default export** je `SourceDefinition`.

## Tvar

```js
export default {
  id, label, sport,                 // metadata
  activeFrom, activeTo,             // ISO; mimo okno cron nescrapuje
  parseTable(doc), parseMatches(doc),  // čisté funkce nad DOM (Node linkedom i browser DOMParser)
  categories: [ {
    id, label,
    fetchTargets: { table, matches },  // URL
    groupFilter,                       // 'all' | [groupCode, …]
    defaultFocusTeam,                  // null = bez focusu
    defaultGroup,                      // null = první skupina
    buildBracketModel(matches, table, focusTeam),  // volitelné → IR; chybí = bez pavouka
  } ],
};
```

## Datový model (návratové hodnoty parseru)

- `parseTable(doc)` → `{ groups: { '<groupCode>': [ { rank, team, scored, conceded, points } ] } }`
- `parseMatches(doc)` → `{ matches: [ { id, date, time, group, phase, venue, home, away, score } ] }`
  - `date`: `YYYY-MM-DD`, `time`: `HH:MM`, `score`: `{ home, away, status } | null`, `phase`: `'group'` nebo turnaj-specifické.

## Recept na pavouka (`buildBracketModel`)

Vrací **IR**: `{ nodes: [...], edges: [...] }` — viz `lib/bracket-engine.js`.
- `nodes[]`: `{ id, round, home, away, score, venue, when, shape:'box'|'rounded', forceHighlight }`.
  - Do `home`/`away` dosaď **jméno týmu**, jakmile je známé (přes `resolveCode` z enginu); jinak nech placeholder. Engine zvýrazní uzly, kde je `focusTeam` v `home`/`away`.
- `edges[]`: `{ from, to, label }` — `label` typicky `'výhra'`/`'prohra'`.
- Vykreslení: `renderMermaid(model, { highlighted: highlightPath(model, focusTeam) })`.

Referenční implementace: `sources/tigers-ostravske-2026/bracket.js`.
```

- [ ] **Step 6: Spusť test — musí projít**

Run: `pnpm test`
Expected: PASS oba registry testy.

- [ ] **Step 7: Commit**

```bash
git add sources/tigers-ostravske-2026/index.js sources/registry.js sources/_contract.md tests/registry.test.mjs
git commit -m "feat(sources): add SourceDefinition, registry, and contract docs"
```

---

## Task 7: Migrace dat do per-source/category cest

**Files:**
- Move: `data/{table,matches,meta}.json` → `data/tigers-ostravske-2026/BU13/`
- Move: `data/demo/` → `sources/tigers-ostravske-2026/demos/`
- Modify: `data/demo/index.json` (přesune se s demos)
- Modify: testy z Tasku 5 (cesty k demo datům)

**Cíl:** Přesunout data do nového layoutu. Pozor: parity test (Task 5) čte `data/demo/<scn>/` — po přesunu uprav cesty.

- [ ] **Step 1: Přesuň live data**

Run:
```bash
mkdir -p data/tigers-ostravske-2026/BU13
git mv data/table.json   data/tigers-ostravske-2026/BU13/table.json
git mv data/matches.json data/tigers-ostravske-2026/BU13/matches.json
git mv data/meta.json    data/tigers-ostravske-2026/BU13/meta.json
```
Do `meta.json` doplň pole `"source": "tigers-ostravske-2026"` a `"category": "BU13"` (uprav ručně).

- [ ] **Step 2: Přesuň demo scénáře pod plugin**

Run:
```bash
mkdir -p sources/tigers-ostravske-2026/demos
git mv data/demo/* sources/tigers-ostravske-2026/demos/
rmdir data/demo
```

- [ ] **Step 3: Oprav cesty k demo datům v parity testu**

V `tests/sources/tigers-ostravske-2026/bracket.test.mjs` změň URL z `../../../data/demo/${scn}/` na `../../../sources/tigers-ostravske-2026/demos/${scn}/` (oba `readFileSync` v `renderScenario`).

- [ ] **Step 4: Spusť testy — musí projít**

Run: `pnpm test`
Expected: PASS (parity test čte demo data z nové cesty).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(data): move data and demos into per-source/category layout"
```

---

## Task 8: Multi-source scraper

**Files:**
- Rewrite: `scripts/scrape.mjs`
- Test: `tests/scrape-helpers.test.mjs`

**Cíl:** Scraper iteruje `SOURCES` × kategorie, respektuje aktivní okna, deduplikuje stahování podle URL, aplikuje `groupFilter`, zapisuje do per-category cest. Commit mechaniku (amend) řeší workflow (Task 9) — scraper jen píše soubory.

- [ ] **Step 1: Napiš test čistých helperů (`tests/scrape-helpers.test.mjs`)**

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isActive, applyGroupFilter } from '../scripts/scrape.mjs';

test('isActive: okno od–do', () => {
  const src = { activeFrom: '2026-05-22T00:00:00Z', activeTo: '2026-05-26T00:00:00Z' };
  assert.equal(isActive(src, new Date('2026-05-23T10:00:00Z')), true);
  assert.equal(isActive(src, new Date('2026-05-20T10:00:00Z')), false);
  assert.equal(isActive(src, new Date('2026-05-27T10:00:00Z')), false);
});

test('applyGroupFilter: "all" vrací vše', () => {
  const table = { groups: { MH: [1], MD: [2] } };
  assert.deepEqual(applyGroupFilter(table, 'all'), table);
});

test('applyGroupFilter: výčet vybere jen dané skupiny', () => {
  const table = { groups: { MH: [1], MD: [2], ME: [3] } };
  const out = applyGroupFilter(table, ['MH', 'ME']);
  assert.deepEqual(Object.keys(out.groups), ['MH', 'ME']);
});
```

- [ ] **Step 2: Spusť test — musí spadnout**

Run: `pnpm test`
Expected: FAIL — `isActive`/`applyGroupFilter` nejsou exportované.

- [ ] **Step 3: Přepiš `scripts/scrape.mjs`**

```javascript
import { writeFile, readFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { parseHTML } from 'linkedom';
import { SOURCES } from '../sources/registry.js';

const USER_AGENT = 'tournament-viewer (https://github.com/drabo81/tigers-ostravske-hry-2026)';
const RETRIES = 3;
const TIMEOUT_MS = 15_000;

export function isActive(src, now = new Date()) {
  return now >= new Date(src.activeFrom) && now < new Date(src.activeTo);
}

export function applyGroupFilter(table, groupFilter) {
  if (groupFilter === 'all' || !Array.isArray(groupFilter)) return table;
  const groups = {};
  for (const key of groupFilter) if (table.groups?.[key]) groups[key] = table.groups[key];
  return { ...table, groups };
}

function filterMatches(matchesData, groupFilter) {
  if (groupFilter === 'all' || !Array.isArray(groupFilter)) return matchesData;
  const set = new Set(groupFilter);
  // Ponech zápasy skupiny v kategorii + všechny play-off (group === null).
  const matches = matchesData.matches.filter(m => m.group == null || set.has(m.group));
  return { ...matchesData, matches };
}

async function fetchWithRetry(url) {
  let lastErr;
  for (let attempt = 1; attempt <= RETRIES; attempt++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (!r.ok) throw new Error(`HTTP ${r.status} ${r.statusText}`);
      return await r.text();
    } catch (e) {
      lastErr = e;
      if (attempt < RETRIES) await new Promise(res => setTimeout(res, 500 * 2 ** (attempt - 1)));
    }
  }
  throw lastErr;
}

// URL-dedup cache v rámci jednoho běhu.
function makeFetcher() {
  const cache = new Map();
  return (url) => {
    if (!cache.has(url)) cache.set(url, fetchWithRetry(url));
    return cache.get(url);
  };
}

async function writeMeta(dir, sourceId, categoryId, status) {
  const nowIso = new Date().toISOString();
  const path = `${dir}/meta.json`;
  const meta = { last_success_at: null, last_attempt_at: nowIso, last_attempt_status: status,
                 source: sourceId, category: categoryId };
  if (existsSync(path)) {
    try { meta.last_success_at = JSON.parse(await readFile(path, 'utf8')).last_success_at ?? null; } catch {}
  }
  if (status === 'ok') meta.last_success_at = nowIso;
  await writeFile(path, JSON.stringify(meta, null, 2));
}

async function scrapeCategory(fetcher, def, source, category) {
  const dir = `data/${source.id}/${category.id}`;
  await mkdir(dir, { recursive: true });
  let tableHtml, matchesHtml;
  try {
    [tableHtml, matchesHtml] = await Promise.all([
      fetcher(category.fetchTargets.table),
      fetcher(category.fetchTargets.matches),
    ]);
  } catch (e) {
    console.error(`[${source.id}/${category.id}] network_error:`, e.message);
    await writeMeta(dir, source.id, category.id, 'network_error');
    return false;
  }
  try {
    const table = applyGroupFilter(def.parseTable(parseHTML(tableHtml).document), category.groupFilter);
    const matches = filterMatches(def.parseMatches(parseHTML(matchesHtml).document), category.groupFilter);
    if (!table.groups || Object.keys(table.groups).length === 0) throw new Error('no groups');
    if (!matches.matches?.length) throw new Error('no matches');
    const nowIso = new Date().toISOString();
    await writeFile(`${dir}/table.json`, JSON.stringify({ scraped_at: nowIso, ...table }, null, 2));
    await writeFile(`${dir}/matches.json`, JSON.stringify({ category: category.id, scraped_at: nowIso, ...matches }, null, 2));
    await writeMeta(dir, source.id, category.id, 'ok');
    console.log(`[${source.id}/${category.id}] ok`);
    return true;
  } catch (e) {
    console.error(`[${source.id}/${category.id}] parse_error:`, e.message);
    await writeMeta(dir, source.id, category.id, 'parse_error');
    return false;
  }
}

async function main() {
  const now = new Date();
  let anyFailed = false;
  for (const source of SOURCES) {
    if (!isActive(source, now)) { console.log(`[${source.id}] inactive, skip`); continue; }
    const def = (await source.load()).default;
    const fetcher = makeFetcher();
    for (const category of def.categories) {
      const ok = await scrapeCategory(fetcher, def, source, category);
      if (!ok) anyFailed = true;
    }
  }
  if (anyFailed) process.exit(1);
}

// Spusť main jen když je soubor vstupní bod (ne při importu v testu).
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('scrape.mjs')) {
  main().catch(e => { console.error('unexpected:', e); process.exit(1); });
}
```

- [ ] **Step 4: Spusť testy — musí projít**

Run: `pnpm test`
Expected: PASS helper testy. (Import `scrape.mjs` nesmí spustit `main` — hlídá podmínka na konci.)

- [ ] **Step 5: Smoke test scraperu (volitelný, dle dostupnosti webu)**

Run: `pnpm scrape`
Expected: `[tigers-ostravske-2026]` buď `inactive, skip` (po 26.5.) nebo `BU13 ok` se zápisem do `data/tigers-ostravske-2026/BU13/`. Pokud web vrací jiná data (turnaj přepsán), je `inactive` korektní.

- [ ] **Step 6: Commit**

```bash
git add scripts/scrape.mjs tests/scrape-helpers.test.mjs
git commit -m "feat(scraper): multi-source scrape with active windows, URL dedup, groupFilter"
```

---

## Task 9: GitHub Actions — amend commit mechanika

**Files:**
- Modify: `.github/workflows/scrape.yml`

**Cíl:** Cron amenduje **pouze** předchozí cronový commit (autor `scraper-bot`); nad lidským commitem vytvoří nový. Vyžaduje `fetch-depth: 0` (kvůli amend) a force-with-lease push.

- [ ] **Step 1: Přepiš `.github/workflows/scrape.yml`**

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
        with:
          fetch-depth: 0           # potřeba pro amend posledního commitu

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

      - name: Commit (amend cron commit, jinak nový)
        run: |
          git config user.name "scraper-bot"
          git config user.email "bot@users.noreply.github.com"
          git add data/
          if git diff --quiet --cached; then
            echo "Žádná změna dat"
            exit 0
          fi
          LAST_AUTHOR=$(git log -1 --format='%an')
          if [ "$LAST_AUTHOR" = "scraper-bot" ]; then
            echo "Amend předchozího cronového commitu"
            git commit --amend --no-edit
            git push --force-with-lease
          else
            echo "Nový commit nad lidským commitem"
            git commit -m "data: scrape $(date -u +%Y-%m-%dT%H:%MZ)"
            git push
          fi

      - name: Fail if scraper failed
        if: steps.scrape.outcome != 'success'
        run: |
          echo "Scraper skončil se stavem: ${{ steps.scrape.outcome }}"
          exit 1
```

- [ ] **Step 2: Validuj YAML**

Run: `node -e "const fs=require('fs');console.log(fs.readFileSync('.github/workflows/scrape.yml','utf8').length>0?'OK':'EMPTY')"`
Expected: `OK`.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/scrape.yml
git commit -m "ci: amend previous cron commit (scraper-bot), keep code commits intact"
```

---

## Task 10: Generalizace `app.js`

**Files:**
- Rewrite: `app.js`
- Reference: stávající `app.js` (zdroj UI logiky — render funkce zůstávají)

**Cíl:** `app.js` přestane importovat konkrétní `lib/parser.js`/`lib/bracket.js`. Místo toho: čte `registry.js`, lazy-loadne vybraný plugin, drží stav `source/category/team`, plní přepínače, řeší focus override + deep-link, čte data z `data/<source>/<category>/`.

**Klíčové změny proti stávajícímu `app.js` (render funkce `renderTable`, `renderTigersMatches`, `renderAllMatches`, `matchCardHtml`, `renderNextMatch`, `toast`, `loadBuildInfo`, `bumpVisitorCount` ponech, jen je naváž na nový stav):**

- [ ] **Step 1: Nahraď importy a horní část `app.js`**

```javascript
import { SOURCES } from './sources/registry.js';
import { normalizeTeamName, escapeHtml, fmtDate, fmtDateTime } from './lib/shared.js';
import { highlightPath, renderMermaid } from './lib/bracket-engine.js';
import { fetchViaProxy } from './lib/proxy.js';
import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs';
import svgPanZoom from 'https://esm.sh/svg-pan-zoom@3.6.1';

mermaid.initialize({
  startOnLoad: false, theme: 'default', securityLevel: 'loose',
  flowchart: { nodeSpacing: 30, rankSpacing: 60, padding: 8, htmlLabels: true, useMaxWidth: false },
  themeVariables: { fontSize: '14px' },
});

const REFRESH_DEBOUNCE_MS = 5_000;
const $ = (id) => document.getElementById(id);

// ─── Stav výběru ───
const LS_SOURCE = 'tv.source', LS_CATEGORY = 'tv.category', LS_TEAM = 'tv.team';
let state = { sourceId: null, categoryId: null, focusTeam: null, def: null, category: null };
let lastData = { table: null, matches: null, meta: null };
let tigersFilterMode = 'tigers';
let refreshLocked = false;
let bracketPanZoom = null;

function isActive(src, now = new Date()) {
  return now >= new Date(src.activeFrom) && now < new Date(src.activeTo);
}
function isFocus(name) {
  return name && state.focusTeam ? normalizeTeamName(name) === normalizeTeamName(state.focusTeam) : false;
}
```

- [ ] **Step 2: Přidej výběr zdroje/kategorie/týmu (deep-link + defaulty)**

```javascript
function readUrlParams() {
  const p = new URLSearchParams(location.search);
  return { source: p.get('source'), category: p.get('category'), team: p.get('team') };
}
function writeUrl() {
  const p = new URLSearchParams();
  if (state.sourceId) p.set('source', state.sourceId);
  if (state.categoryId) p.set('category', state.categoryId);
  if (state.focusTeam) p.set('team', state.focusTeam);
  history.replaceState(null, '', `?${p.toString()}`);
}

function resolveInitialSelection() {
  const url = readUrlParams();
  const sourceId = url.source || localStorage.getItem(LS_SOURCE)
    || (SOURCES.find(isActive) || SOURCES[0])?.id;
  const src = SOURCES.find(s => s.id === sourceId) || SOURCES[0];
  const meta = src.categories;
  const categoryId = url.category || localStorage.getItem(LS_CATEGORY) || meta[0]?.id;
  const catMeta = meta.find(c => c.id === categoryId) || meta[0];
  const focusTeam = url.team ?? localStorage.getItem(LS_TEAM) ?? catMeta?.defaultFocusTeam ?? null;
  return { sourceId: src.id, categoryId: catMeta?.id, focusTeam };
}

async function selectSource(sourceId, categoryId, focusTeam) {
  const src = SOURCES.find(s => s.id === sourceId) || SOURCES[0];
  state.def = (await src.load()).default;
  state.sourceId = src.id;
  state.category = state.def.categories.find(c => c.id === categoryId) || state.def.categories[0];
  state.categoryId = state.category.id;
  state.focusTeam = focusTeam !== undefined ? focusTeam : state.category.defaultFocusTeam ?? null;
  localStorage.setItem(LS_SOURCE, state.sourceId);
  localStorage.setItem(LS_CATEGORY, state.categoryId);
  if (state.focusTeam) localStorage.setItem(LS_TEAM, state.focusTeam); else localStorage.removeItem(LS_TEAM);
  writeUrl();
  document.title = `${state.def.label} — ${state.category.label}`;
}
```

- [ ] **Step 3: Datová cesta a načítání**

```javascript
function dataDir() { return `data/${state.sourceId}/${state.categoryId}`; }

async function loadJson(filename) {
  const url = `${dataDir()}/${filename}?t=${Date.now()}`;
  const r = await fetch(url, { cache: 'no-cache' });
  if (!r.ok) throw new Error(`fetch ${filename}: HTTP ${r.status}`);
  return r.json();
}

async function initialLoad() {
  try {
    const [table, matches, meta] = await Promise.all([
      loadJson('table.json').catch(() => ({ groups: {} })),
      loadJson('matches.json').catch(() => ({ matches: [] })),
      loadJson('meta.json').catch(() => null),
    ]);
    lastData = { table, matches, meta };
    await renderAll(table, matches, meta);
  } catch (e) {
    console.error(e);
    toast(`Data nelze načíst: ${e.message}`, 'error');
  }
}
```

- [ ] **Step 4: Přepiš bracket render na engine + plugin**

```javascript
async function renderBracket(matches, table) {
  const container = $('bracket-content');
  if (!state.category?.buildBracketModel) {
    $('section-bracket').hidden = true;
    return;
  }
  $('section-bracket').hidden = false;
  const model = state.category.buildBracketModel(matches, table, state.focusTeam);
  const highlighted = highlightPath(model, state.focusTeam);
  const mermaidSrc = renderMermaid(model, { highlighted, focusTeam: state.focusTeam });
  container.removeAttribute('data-processed');
  container.textContent = mermaidSrc;
  if (bracketPanZoom) { bracketPanZoom.destroy(); bracketPanZoom = null; }
  try {
    await mermaid.run({ nodes: [container] });
    const svg = container.querySelector('svg');
    if (svg) {
      svg.removeAttribute('width'); svg.removeAttribute('height');
      svg.style.width = '100%'; svg.style.height = '100%'; svg.style.maxWidth = 'none';
      bracketPanZoom = svgPanZoom(svg, { controlIconsEnabled: true, fit: true, center: true,
        minZoom: 0.2, maxZoom: 8, zoomScaleSensitivity: 0.3, contain: false });
    }
  } catch (e) {
    console.error('mermaid render failed', e);
    container.textContent = mermaidSrc;
  }
}
```

- [ ] **Step 5: Adaptuj render funkce + `renderAll` na stav**

Ze stávajícího `app.js` přenes `toast`, `renderHeader`, `renderTable`, `matchCardHtml`, `renderTigersMatches`, `renderAllMatches`, `renderNextMatch`, `loadBuildInfo`, `bumpVisitorCount`, `isValidTable`, `isValidMatches`. Proveď tyto úpravy:
- `isTigers(...)` → `isFocus(...)` (focus tým ze stavu).
- `tigersBracketPath(matches, table)` (dřív z `lib/bracket.js`) **nahraď** filtrem focus zápasů přímo:
  ```javascript
  function focusMatches(matches) {
    return (matches.matches || [])
      .filter(m => isFocus(m.home) || isFocus(m.away))
      .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
  }
  ```
  a v `renderTigersMatches`/`renderNextMatch` použij `focusMatches(matches)` místo `tigersBracketPath(...)`. `isPlaceholderCell` se ve focus zápasech neuplatní (jsou to reálná jména), takže větve s placeholdery v `matchCardHtml` zůstanou, ale nebudou se trigger.
- `renderAllMatches` filtr `m.group === 'MH'` → `m.group === state.category.defaultGroup` (a `phase === 'group'`).
- `renderTable` čte `table.groups[state.category.defaultGroup]` místo napevno `MH`.
- Nadpisy: `renderAll` nastaví `document.querySelector('#section-table h2').textContent = 'Tabulka — ' + (state.category.defaultGroup ?? '')` apod. (volitelně).

```javascript
async function renderAll(table, matches, meta) {
  if (!isValidTable(table) || !isValidMatches(matches)) {
    toast('Data mají neplatnou strukturu — zachovávám předchozí stav.', 'error');
    return;
  }
  renderHeader(meta);
  renderNextMatch(matches, table);
  renderTable(table);
  renderTigersMatches(matches, table);
  renderAllMatches(matches);
  await renderBracket(matches, table);
}
```

- [ ] **Step 6: Přepínače v hlavičce + bootstrap**

```javascript
function populateSourceSelect() {
  const sel = $('source-select');
  sel.innerHTML = SOURCES.map(s => `<option value="${s.id}">${escapeHtml(s.label)}</option>`).join('');
  sel.value = state.sourceId;
  sel.onchange = async () => { await selectSource(sel.value, undefined, undefined); populateCategorySelect(); populateTeamSelect(); await initialLoad(); };
}
function populateCategorySelect() {
  const sel = $('category-select');
  sel.innerHTML = state.def.categories.map(c => `<option value="${c.id}">${escapeHtml(c.label)}</option>`).join('');
  sel.value = state.categoryId;
  sel.onchange = async () => { await selectSource(state.sourceId, sel.value, undefined); populateTeamSelect(); await initialLoad(); };
}
function populateTeamSelect() {
  const sel = $('team-select');
  const teams = new Set();
  const groups = lastData.table?.groups ?? {};
  for (const rows of Object.values(groups)) for (const r of rows) teams.add(r.team);
  const opts = ['<option value="">(bez zvýraznění)</option>']
    .concat([...teams].sort((a, b) => a.localeCompare(b, 'cs')).map(t => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`));
  sel.innerHTML = opts.join('');
  sel.value = state.focusTeam ?? '';
  sel.onchange = async () => {
    state.focusTeam = sel.value || null;
    if (state.focusTeam) localStorage.setItem(LS_TEAM, state.focusTeam); else localStorage.removeItem(LS_TEAM);
    writeUrl();
    await renderAll(lastData.table, lastData.matches, lastData.meta);
  };
}

async function forceRefresh() {
  if (refreshLocked) return;
  refreshLocked = true;
  const btn = $('refresh-btn'); btn.disabled = true;
  setTimeout(() => { refreshLocked = false; btn.disabled = false; }, REFRESH_DEBOUNCE_MS);
  toast('Stahuji čerstvá data…', 'info');
  try {
    const [tableHtml, matchesHtml] = await Promise.all([
      fetchViaProxy(state.category.fetchTargets.table),
      fetchViaProxy(state.category.fetchTargets.matches),
    ]);
    const table = state.def.parseTable(new DOMParser().parseFromString(tableHtml, 'text/html'));
    const matches = state.def.parseMatches(new DOMParser().parseFromString(matchesHtml, 'text/html'));
    const nowIso = new Date().toISOString();
    lastData = { table, matches, meta: { ...lastData.meta, last_success_at: nowIso, last_attempt_at: nowIso, last_attempt_status: 'ok' } };
    await renderAll(lastData.table, lastData.matches, lastData.meta);
    populateTeamSelect();
    toast('Aktualizováno.', 'info');
  } catch (e) {
    console.error(e);
    toast(`Refresh selhal: ${e.message}`, 'error');
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const sel = resolveInitialSelection();
  await selectSource(sel.sourceId, sel.categoryId, sel.focusTeam);
  $('refresh-btn').addEventListener('click', forceRefresh);
  populateSourceSelect();
  populateCategorySelect();
  bumpVisitorCount();
  loadBuildInfo();
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      tigersFilterMode = btn.dataset.filter;
      document.querySelectorAll('.filter-btn').forEach(b => {
        const active = b === btn; b.classList.toggle('active', active); b.setAttribute('aria-selected', active);
      });
      if (lastData.matches && lastData.table) renderTigersMatches(lastData.matches, lastData.table);
    });
  });
  await initialLoad();
  populateTeamSelect();   // až po načtení tabulky (potřebuje seznam týmů)
});
```

- [ ] **Step 7: Manuální kontrola v prohlížeči**

Run: `start index.html` (Windows). 
Expected: stránka načte data z `data/tigers-ostravske-2026/BU13/`, přepínače Zdroj/Kategorie/Tým fungují, pavouk se vykreslí, focus na „FBC Tigers Poruba" zvýrazní řádek i cestu. (Pozn.: `file://` může blokovat fetch JSON — pokud ano, spusť přes lokální server, viz Task 12 README.)

- [ ] **Step 8: Commit**

```bash
git add app.js
git commit -m "feat(app): generic shell with source/category/team switchers and deep-link"
```

---

## Task 11: `index.html` + `styles.css` — přepínače

**Files:**
- Modify: `index.html`
- Modify: `styles.css`

**Cíl:** Přidat do hlavičky přepínače Kategorie a Tým (Zdroj už existuje jako `data-mode-select` → přejmenovat na `source-select`), generalizovat nadpisy.

- [ ] **Step 1: Uprav hlavičku v `index.html`**

Nahraď blok `<div class="status">…</div>` (řádky se `last-updated`, `refresh-btn`, `data-mode`):
```html
    <div class="status">
      <span id="last-updated">Načítám…</span>
      <button id="refresh-btn" type="button" title="Stáhne čerstvá data bez čekání na cron">↻ Aktualizovat data</button>
    </div>
    <div class="selectors">
      <label><span>Zdroj:</span><select id="source-select"></select></label>
      <label><span>Kategorie:</span><select id="category-select"></select></label>
      <label><span>Tým:</span><select id="team-select"></select></label>
    </div>
```
Změň `<h1>` a `.subtitle` na neutrální (titulek nastaví JS):
```html
    <h1 id="page-title">Tournament Viewer</h1>
    <p class="subtitle" id="page-subtitle"></p>
```
V `<head>` změň `<title>` na `Tournament Viewer`.

- [ ] **Step 2: Generalizuj nadpisy sekcí (volitelné, ale konzistentní)**

V `#section-bracket h2` změň „Cesta Tigers turnajem" → `Cesta turnajem` (focus tým je dynamický). Ostatní nadpisy (`Zápasy`, `Tabulka skupiny MH`, `Všechny zápasy skupiny MH`) ponech — `MH` upraví JS v Tasku 10 Step 5 (nebo ponech staticky, je to kosmetika).

- [ ] **Step 3: Přidej styly přepínačů do `styles.css`**

Připoj na konec `styles.css`:
```css
.selectors {
  display: flex; flex-wrap: wrap; gap: 0.5rem 1rem; margin-top: 0.5rem; font-size: 0.85rem;
}
.selectors label { display: flex; align-items: center; gap: 0.35rem; }
.selectors select {
  font: inherit; padding: 0.2rem 0.4rem; border-radius: 4px;
  border: 1px solid rgba(255,255,255,0.5); background: rgba(255,255,255,0.15); color: #fff;
}
.selectors select option { color: #000; }
section[hidden] { display: none; }
```
(Pokud `styles.css` mělo `.data-mode` styl pro starý select, ponech — neuškodí.)

- [ ] **Step 4: Manuální kontrola**

Run: `start index.html` (nebo přes lokální server).
Expected: tři přepínače v hlavičce, stylované, funkční; sekce pavouka se skryje, když plugin nemá `buildBracketModel` (u Tigers se zobrazí).

- [ ] **Step 5: Commit**

```bash
git add index.html styles.css
git commit -m "feat(ui): add source/category/team selectors to header"
```

---

## Task 12: Úklid + README

**Files:**
- Delete: `lib/parser.js`, `lib/bracket.js`
- Modify: `README.md`
- Verify: žádný kód neimportuje smazané soubory

**Cíl:** Odstranit nahrazené soubory a zdokumentovat přidání nového zdroje.

> **Cleanup z code review Tasku 5 (odloženo sem kvůli byte-paritě):** v `sources/tigers-ostravske-2026/bracket.js`:
> - **M1:** `isFocusTeam(name, focusTeam)` má fallback `n.includes(TIGERS_FRAGMENT)`, který se vyhodnotí i když je `focusTeam` jiný tým → false-positive pro libovolný tým se jménem obsahujícím „tigers poruba". Až nebude vázané paritou se starým `renderStaticBracket`, zjednodušit na čistou rovnost `n === normalizeTeamName(focusTeam)` (fragment fallback zrušit).
> - **M2:** v `resolvePlaceholder` je mrtvá větev `tokens.length === 4 ? (hasDash ? '8F-A' : '8F-A')` — obě strany ternárního výrazu jsou stejné; zjednodušit na `'8F-A'`.
> Po těchto úpravách znovu spusť parity test (snapshoty by se měnit neměly — jde o no-op zjednodušení); pokud se výstup změní, vrať zpět.

- [ ] **Step 1: Ověř, že nic neimportuje staré soubory**

Run: `grep -rn "lib/parser" --include=*.js --include=*.mjs . ; grep -rn "lib/bracket\.js" --include=*.js --include=*.mjs .`
(Pozn.: hledej mimo `node_modules`.) Expected: žádný zásah kromě případně `tests/tigersPath.test.mjs` / `tests/proxy.test.mjs` / `tests/bracketHelpers.test.mjs` / `tests/renderMermaid.test.mjs` — viz Step 2.

- [ ] **Step 2: Vyřeš staré testy navázané na `lib/bracket.js`**

Stávající testy `tests/tigersPath.test.mjs`, `tests/bracketHelpers.test.mjs`, `tests/renderMermaid.test.mjs` testovaly staré API `lib/bracket.js`. Smaž je (logika je nahrazena parity testem Tasku 5 a engine testy Tasku 2–3):
```bash
git rm tests/tigersPath.test.mjs tests/bracketHelpers.test.mjs tests/renderMermaid.test.mjs
```
`tests/proxy.test.mjs` (testuje `lib/proxy.js`) **ponech** — proxy se nemění.

- [ ] **Step 3: Smaž nahrazené zdroje**

```bash
git rm lib/parser.js lib/bracket.js
```

- [ ] **Step 4: Spusť celou sadu testů**

Run: `pnpm test`
Expected: PASS — shared, bracket-engine, parser (přesunutý), bracket parity, registry, scrape-helpers, proxy. Žádný import na smazané soubory.

- [ ] **Step 5: Aktualizuj `README.md`**

```markdown
# Tournament Viewer

Live viewer florbalových (a jiných) turnajů — tabulky, zápasy, pavouk play-off.
Statická stránka na GitHub Pages, data scrapuje GitHub Actions cron.

## Vývoj

- `pnpm test` — spustí testy (`node:test`).
- `pnpm scrape` — scrapuje všechny aktivní zdroje do `data/<source>/<category>/`.
- Lokální náhled: spusť statický server v kořeni (kvůli fetch JSON), např.
  `npx serve .` nebo `python -m http.server`, a otevři `index.html`.

## Přidání nového zdroje (turnaje)

1. Vytvoř složku `sources/<id>/` s `index.js` (default export `SourceDefinition` — viz `sources/_contract.md`).
2. Napiš `parser.js` (`parseTable`, `parseMatches`) proti HTML fixtuře v `tests/sources/<id>/fixtures/`.
3. Volitelně `bracket.js` s `buildBracketModel` (IR pro `lib/bracket-engine.js`).
4. Zaregistruj zdroj v `sources/registry.js` (metadata + `load`).
5. Nastav `activeFrom`/`activeTo` (mimo okno cron nescrapuje).

Data layout: `data/<source-id>/<category-id>/{table,matches,meta}.json`.
Pavouk je volitelný — bez `buildBracketModel` se sekce skryje.
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: remove legacy lib/parser+bracket, update README for plugins"
```

---

## Self-Review (provedeno při psaní plánu)

- **Spec coverage:** Plugin kontrakt + kategorie (Task 6), registr (Task 6), datový model (Task 7 + scraper Task 8), výběr Zdroj→Kategorie→Tým + deep-link (Task 10–11), scraper s aktivními okny/URL-dedup/groupFilter (Task 8), amend commit (Task 9), bracket engine + IR (Task 2–3, 5), migrace Tigers (Task 4–5, 7), testy (každý task), README (Task 12). ✓
- **Force refresh** přes proxy (Task 10 Step 6) — pokrývá DoD. ✓
- **Parita pavouka** zajištěna snapshot testem (Task 5). ✓
- **Type/název konzistence:** `buildBracketModel(matches, table, focusTeam)`, IR `{nodes, edges}`, `resolveCode(code, table, positionGroups)`, `highlightPath(model, focusTeam)`, `renderMermaid(model, {highlighted, focusTeam})`, data path `data/<source>/<category>/` — konzistentní napříč Task 2/3/5/6/8/10. ✓
- **Otevřený bod:** přejmenování repa je ponecháno (titulek změněn na „Tournament Viewer", GitHub API URL v `loadBuildInfo`/footer odkazu zůstává `drabo81/tigers-ostravske-hry-2026` — funguje dál). Pokud se repo přejmenuje, uprav URL v `app.js` `loadBuildInfo` a `index.html` footeru.
```
