# Multi-Tournament Integration Plan (na aktuální main)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Kontext:** Refaktor z větve `feature/multi-tournament-viewer` (postavený na předturnajovém `2b7166a`) nelze mechanicky slou­čit — `origin/main` se mezitím force-pushnul na nezávislou, výrazně bohatší historii (polling, view toggle, tournament-window, CF cron, demo generátory). Tento plán **znovu provádí** generalizaci přímo na aktuálním `main` (`9a8425a`), se zachováním všech jeho funkcí. Pracuje se na větvi `feature/mtv-on-main` (založené z `origin/main`).

**Design:** beze změny — `docs/superpowers/specs/2026-05-30-multi-tournament-viewer-design.md` (pluginový systém, Zdroj→Kategorie→Tým, `renderBracket`/bracket modul per zdroj, aktivní okna, amend nepoužíváme — main má vlastní anti-spam commit). Rozhodnutí „plná generalizace včetně infra" z 2026-05-31.

**Tech stack:** Node 22, pnpm, linkedom, mermaid+svg-pan-zoom (CDN), GitHub Actions + Cloudflare Worker, `node:test`. Bez build stepu.

---

## Klíčová designová rozhodnutí (delta proti spec)

1. **Zdroj/kategorie pojmenování:** zdroj `ostravske-hry-2026`, kategorie `B13` (`defaultGroup: 'MH'`, `defaultFocusTeam: 'FBC Tigers Poruba'`). „Tigers" je default focus, ne identita zdroje.
2. **Bracket = celý modul per kategorie** (ne jediný `renderBracket`). Plugin kategorie vystaví `bracket` objekt:
   ```js
   bracket: {
     renderStaticBracket(matches, table, focusTeam),  // Mermaid string (pavouk)
     renderPhaseList(matches, table, focusTeam),      // HTML (seznam)
     focusPath(matches, table, focusTeam),            // dříve tigersBracketPath
     matchCardHtml(m, isFocusMatch, matches, table, focusTeam),
     resolvePlaceholder(cell, matches, table),
     isPlaceholderCell(cell),
   }
   ```
   Tyto vznikají **parametrizací** stávajícího `lib/bracket.js` o `focusTeam` (dnes natvrdo Tigers). Parita ověřena snapshotem.
3. **Shared (zůstává v `lib/`, generické):** `proxy.js`, `poll.js`, `tournament-window.js`, nově `shared.js` (utility vytažené z app.js/bracket.js: `normalizeTeamName` přesun z parseru, `escapeHtml`, `fmtDate`, `fmtDateTime`).
4. **Data layout:** `data/<source>/<category>/{table,matches,meta}.json`; demo `sources/<id>/demos/<category>/<scn>/…` s `_base/`.
5. **Aktivní okno per zdroj:** každý zdroj má `window` odvozené z jeho `matches.json` přes `lib/tournament-window.js` (sdílené). Agregace: „v okně" = **alespoň jeden** zdroj v okně.
6. **Infra generalizace:**
   - `scripts/in-tournament-window.mjs` → iteruje `SOURCES`, čte `data/<source>/<category>/matches.json` každého, `proceed=true` když je aspoň jeden v okně.
   - `infra/cloudflare-cron` → importuje `sources/registry.js` (lehká metadata) + čte per-source matches z raw GitHub, dispatch když aspoň jeden v okně.
   - `scripts/generate-demos.mjs` / `simulate-up-to.mjs` → per-source (čtou `sources/<id>/demos/<cat>/_base/`).
7. **App-instance konfigurace** (ne per-zdroj): GitHub repo slug + counter namespace zůstávají konstanty v `app.js` (deploy-global), s komentářem.

---

## Pořadí tasků (zdola nahoru, testy zelené průběžně)

Bottom-up tak, aby šlo průběžně testovat. Plugin extrakce s parity snapshotem je páteř.

---

## Task 1: `lib/shared.js` — sdílené utility

**Files:** Create `lib/shared.js`; Create `tests/shared.test.mjs`.

**Cíl:** Jedno místo pro `normalizeTeamName`, `escapeHtml`, `fmtDate`, `fmtDateTime`. Dnes jsou duplikované v `app.js` a `lib/parser.js`/`lib/bracket.js`.

- [ ] **Step 1: test** — `tests/shared.test.mjs`:
```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTeamName, escapeHtml, fmtDate, fmtDateTime } from '../lib/shared.js';
test('normalizeTeamName', () => { assert.equal(normalizeTeamName('  Třinec červení '), 'trinec cerveni'); });
test('escapeHtml', () => { assert.equal(escapeHtml('<a href="x">&'), '&lt;a href=&quot;x&quot;&gt;&amp;'); assert.equal(escapeHtml(null), ''); });
test('fmtDate', () => { assert.equal(fmtDate('2026-05-22'), '22. 5.'); assert.equal(fmtDate(''), ''); });
test('fmtDateTime', () => { assert.equal(fmtDateTime(null), '—'); assert.equal(typeof fmtDateTime('2026-05-22T11:30:00Z'), 'string'); });
```
- [ ] **Step 2:** `pnpm test` → FAIL.
- [ ] **Step 3:** implementuj `lib/shared.js` (zkopíruj definice z aktuálního `app.js`: `escapeHtml`, `fmtDate`, `fmtDateTime`; `normalizeTeamName` z `lib/parser.js`). Pozor: `fmtDate` v app.js dává `"22. 5."` (s mezerou).
- [ ] **Step 4:** `pnpm test` → PASS.
- [ ] **Step 5:** commit `feat(shared): extract shared utilities`.

> Pozn.: app.js/parser.js zatím své kopie ponechávají (přepojí se v pozdějších tascích), ať tento task nic nerozbije.

---

## Task 2: Přesun parseru do pluginu

**Files:** Create `sources/ostravske-hry-2026/parser.js`; Modify `tests/parseTable.test.mjs`, `tests/parseMatches.test.mjs`, `tests/normalize.test.mjs`.

- [ ] **Step 1:** `mkdir -p sources/ostravske-hry-2026 && git mv lib/parser.js sources/ostravske-hry-2026/parser.js`. (git mv — ne kopie; app.js a lib/bracket.js importují z `./lib/parser.js` → dočasně se rozbijí, opraví se v Tasku 3/8. Proto tento task běží spolu s Task 3 v jedné review dávce, NEBO doplň dočasný re-export `lib/parser.js` → `export * from '../sources/ostravske-hry-2026/parser.js'` a smaž ho v Tasku 8.)
  **Zvolený přístup:** ponech dočasný shim `lib/parser.js`:
  ```javascript
  export * from '../sources/ostravske-hry-2026/parser.js';
  ```
  (smaže se v Tasku 11 cleanup). Tím app.js/bracket.js běží dál beze změny importů zatím.
- [ ] **Step 2:** v `sources/ostravske-hry-2026/parser.js` nahraď lokální `normalizeTeamName` re-exportem: první řádek `export { normalizeTeamName } from '../../lib/shared.js';` a smaž lokální definici. Zbytek beze změny.
- [ ] **Step 3:** přesměruj přímé parser testy (`parseTable`, `parseMatches`, `normalize`) na `../sources/ostravske-hry-2026/parser.js`.
- [ ] **Step 4:** `pnpm test` → PASS (vč. ostatních, díky shimu).
- [ ] **Step 5:** commit `refactor: move parser into source plugin (+shim)`.

---

## Task 3: Parametrizace bracketu focus týmem + přesun do pluginu

**Files:** Create `sources/ostravske-hry-2026/bracket.js`; Create `tests/sources/ostravske-hry-2026/bracket.test.mjs` (+ `__snapshots__/`); dočasný shim `lib/bracket.js`.

**Cíl:** Přesunout `lib/bracket.js` do pluginu a **parametrizovat focus tým** (dnes natvrdo `tigersPositionCode`/`isTigersTeam`/`'FBC TIGERS PORUBA'`). Veřejné funkce dostanou nepovinný `focusTeam` (default zachovává Tigers chování → parita). Zachovat VŠECHNY exporty, které app.js i testy používají: `renderStaticBracket`, `renderPhaseList`, `matchCardHtml`, `tigersBracketPath` (alias `focusPath`), `resolvePlaceholder`, `isPlaceholderCell`, a co testy importují (`tigersPath`, `renderMermaid`, `resolveCode`, `matchContainsCode`, `tigersPositionCode`).

- [ ] **Step 1: Zachyť parity snapshoty z aktuálního `lib/bracket.js`** přes demo scénáře (`renderStaticBracket` i `renderPhaseList`):
```bash
mkdir -p tests/sources/ostravske-hry-2026/__snapshots__
node --input-type=module -e "
import { renderStaticBracket, renderPhaseList } from './lib/bracket.js';
import { readFileSync, writeFileSync } from 'node:fs';
for (const scn of ['po-skupine','po-16f','turnaj-dohran']) {
  const m = JSON.parse(readFileSync('data/demo/'+scn+'/matches.json','utf8'));
  const t = JSON.parse(readFileSync('data/demo/'+scn+'/table.json','utf8'));
  writeFileSync('tests/sources/ostravske-hry-2026/__snapshots__/'+scn+'.pavouk.mmd', renderStaticBracket(m,t));
  writeFileSync('tests/sources/ostravske-hry-2026/__snapshots__/'+scn+'.seznam.html', renderPhaseList(m,t));
}
console.log('snapshots written');
"
```
- [ ] **Step 2: parity test** `tests/sources/ostravske-hry-2026/bracket.test.mjs` — pro každý scénář ověř `renderStaticBracket(m,t,'FBC Tigers Poruba') === <pavouk snapshot>` a `renderPhaseList(m,t,'FBC Tigers Poruba') === <seznam snapshot>`. (Importuje z nového `sources/.../bracket.js`.)
- [ ] **Step 3:** `pnpm test` → FAIL (nový soubor neexistuje).
- [ ] **Step 4: Implementuj `sources/ostravske-hry-2026/bracket.js`** — `git mv lib/bracket.js sources/ostravske-hry-2026/bracket.js`, pak:
  - import `normalizeTeamName, fmtDate, escapeHtml` z `../../lib/shared.js` (odstraň lokální duplicitní `_escapeHtml`/`fmtDate`/`_fmtDateCard` jen pokud jsou identické — jinak ponech kvůli paritě; **parita rozhoduje**).
  - `tigersPositionCode(table)` → přidej nepovinný `focusTeam`; `isTigersTeam(name)` → `isFocusTeam(name, focusTeam)` s fallbackem na `'tigers poruba'` když `focusTeam` chybí (zachová paritu). Prothread `focusTeam` veřejnými funkcemi (`renderStaticBracket`, `renderPhaseList`, `tigersBracketPath`, `matchCardHtml`, `tigersHighlightedNodes`, `renderNextMatch` helpery).
  - `resolveCode(code, table)` zůstává (používá interní `POSITION_GROUPS`).
  - Přidej `export function focusPath(matches, table, focusTeam) { return tigersBracketPath(matches, table, focusTeam); }` (alias pro app.js).
  - **Dočasný shim** `lib/bracket.js`: `export * from '../sources/ostravske-hry-2026/bracket.js';` (app.js + testy běží dál; smaže se v Tasku 11).
- [ ] **Step 5:** `pnpm test` → parity 6/6 PASS (3 pavouk + 3 seznam) + existující bracket testy (přes shim) PASS. Pokud parita selže, srovnej threading `focusTeam` (pro `'FBC Tigers Poruba'` musí být chování identické).
- [ ] **Step 6:** commit `refactor: move bracket into plugin, parametrize focusTeam (parity)`.

---

## Task 4: SourceDefinition + registr + kontrakt

**Files:** Create `sources/ostravske-hry-2026/index.js`, `sources/registry.js`, `sources/_contract.md`; Create `tests/registry.test.mjs`.

- [ ] **Step 1: test** `tests/registry.test.mjs` — `SOURCES` má zdroj `ostravske-hry-2026` s lehkými metadaty + `load`; lazy `load()` vrátí `default` s `parseTable`/`parseMatches` + `categories[0]` (`B13`) s `fetchTargets.table/matches`, `defaultGroup`, `defaultFocusTeam`, a `bracket` objektem s funkcemi `renderStaticBracket`/`renderPhaseList`/`focusPath`/`matchCardHtml`/`resolvePlaceholder`/`isPlaceholderCell`.
- [ ] **Step 2:** `pnpm test` → FAIL.
- [ ] **Step 3: `sources/ostravske-hry-2026/index.js`:**
```javascript
import { parseTable, parseMatches } from './parser.js';
import * as bracket from './bracket.js';

export default {
  id: 'ostravske-hry-2026',
  label: 'Ostravské hry 2026',
  sport: 'florbal',
  parseTable, parseMatches,
  categories: [
    {
      id: 'B13', label: 'B13 5+1',
      fetchTargets: {
        table:   'https://ostravskehry.cz/florbal/table/',
        matches: 'https://ostravskehry.cz/florbal/matches/?category=24',
      },
      groupFilter: 'all',
      defaultGroup: 'MH',
      defaultFocusTeam: 'FBC Tigers Poruba',
      bracket: {
        renderStaticBracket: bracket.renderStaticBracket,
        renderPhaseList: bracket.renderPhaseList,
        focusPath: bracket.focusPath,
        matchCardHtml: bracket.matchCardHtml,
        resolvePlaceholder: bracket.resolvePlaceholder,
        isPlaceholderCell: bracket.isPlaceholderCell,
      },
    },
  ],
};
```
- [ ] **Step 4: `sources/registry.js`** — `SOURCES` pole s lehkými metadaty (`id`, `label`, `categories:[{id,label,defaultGroup,defaultFocusTeam}]`, `load: () => import('./ostravske-hry-2026/index.js')`).
- [ ] **Step 5: `sources/_contract.md`** — popiš kontrakt vč. `bracket` modulu (6 funkcí, `focusTeam` param), data model, a sdílené utility (`lib/shared.js`, `lib/tournament-window.js`).
- [ ] **Step 6:** `pnpm test` → PASS.
- [ ] **Step 7:** commit `feat(sources): SourceDefinition, registry, contract`.

---

## Task 5: Migrace dat + demos do per-source layoutu

**Files:** `git mv data/{table,matches,meta}.json data/ostravske-hry-2026/B13/`; `git mv data/demo sources/ostravske-hry-2026/demos/B13`; oprava cest v parity testu (Task 3) a kdekoli se čte `data/demo`.

- [ ] **Step 1:** `mkdir -p data/ostravske-hry-2026/B13 && git mv data/table.json data/matches.json data/meta.json data/ostravske-hry-2026/B13/`. Do `meta.json` doplň `"source":"ostravske-hry-2026"`, `"category":"B13"`.
- [ ] **Step 2:** `mkdir -p sources/ostravske-hry-2026/demos && git mv data/demo sources/ostravske-hry-2026/demos/B13`. (Tím `_base/`, `index.json`, scénáře jdou pod kategorii.) Ověř `ls` skutečné názvy (pozor `po-skupine`).
- [ ] **Step 3:** oprav cesty: parity test Task 3 (`tests/sources/ostravske-hry-2026/bracket.test.mjs`) čte demo data → `../../../sources/ostravske-hry-2026/demos/B13/<scn>/`.
- [ ] **Step 4:** `pnpm test` → PASS (parita stále 6/6, snapshoty nezměněny).
- [ ] **Step 5:** commit `refactor(data): per-source/category layout + demos under plugin`.

---

## Task 6: `scripts/simulate-up-to.mjs` + `generate-demos.mjs` per-source

**Files:** Modify both scripts.

- [ ] **Step 1:** `simulate-up-to.mjs` — přijmi cestu k `_base` a výstupní adresář jako argumenty (default `sources/ostravske-hry-2026/demos/B13`). Čte `<base>/_base/{matches,table}.json`, zapisuje do `<base>/<scn>/`.
- [ ] **Step 2:** `generate-demos.mjs` — iteruj zdroje×kategorie z `SOURCES` (resp. zatím napevno `ostravske-hry-2026/B13`), volej simulate s jeho cestou, zapiš `index.json` do kategorie.
- [ ] **Step 3:** Spusť `node scripts/generate-demos.mjs` → ověř, že přegeneruje demo scénáře beze změny (git diff prázdný nebo jen timestamp). Pozn.: pokud generátor je deterministický, diff dat by měl být prázdný.
- [ ] **Step 4:** `pnpm test` → PASS.
- [ ] **Step 5:** commit `refactor(demos): per-source demo generators`.

---

## Task 7: Multi-source scraper

**Files:** Rewrite `scripts/scrape.mjs`; Create `tests/scrape-helpers.test.mjs`.

**Cíl:** Iterovat `SOURCES`×kategorie, per-source URL, zachovat `writeIfDataChanged` + anti-spam `writeMeta`, zapisovat do `data/<source>/<category>/`. Okno per zdroj přes `lib/tournament-window.js` (z jeho matches). URL-dedup cache.

- [ ] **Step 1: test** helperů `isActiveByWindow(matchesJson, now)` (delegace na tournament-window) + `applyGroupFilter` + dedup.
- [ ] **Step 2:** `pnpm test` → FAIL.
- [ ] **Step 3:** přepiš `scrape.mjs`:
  - import `SOURCES`, `parseHTML`, `writeIfDataChanged`/`writeMeta` (zachovat anti-spam logiku, ale cesty per-category: `writeMeta(dir, status, dataChanged)`), `applyGroupFilter`, `makeFetcher` (URL dedup).
  - `main`: pro každý zdroj `load()`, pro každou kategorii: fetch `fetchTargets`, parse, `applyGroupFilter`, validuj, `writeIfDataChanged` do `data/<source>/<cat>/{table,matches}.json`, `writeMeta`. Exit 1 když aspoň jedna kategorie selhala.
  - Okno turnaje řeší workflow (`in-tournament-window.mjs`, Task 9), ne scraper sám (jako dnes). Odstraň `TOURNAMENT_END` hardcode.
- [ ] **Step 4:** `pnpm test` → PASS. Smoke `pnpm scrape` (mimo okno / síť → korektní skip/zápis).
- [ ] **Step 5:** commit `feat(scraper): multi-source with anti-spam writes + groupFilter`.

---

## Task 8: Generalizace `app.js` (zachovat všechny funkce)

**Files:** Rewrite `app.js`. **Nejnáročnější task.**

**Cíl:** Přidat stav Zdroj→Kategorie→Tým + přepínače + deep-link + per-source/category data path, a VŠE ostatní zachovat: polling (`pollOnce`/`startPolling`/`stopPolling`/`hasMetaChanged`/`visibilitychange`/backoff), view toggle (pavouk/seznam přes plugin `bracket.renderStaticBracket`/`renderPhaseList`), `loadJson` retry, loading skeleton, error hlášky, force-refresh (přes plugin parser + fetchTargets), demo mód (per-source demos).

Klíčové změny (čti aktuální app.js a uprav):
- Importy: `{ SOURCES }` z `./sources/registry.js`; `{ normalizeTeamName, escapeHtml, fmtDate, fmtDateTime }` z `./lib/shared.js`; `{ fetchViaProxy }`, `{ hasMetaChanged }`, mermaid, svgPanZoom. **Nic z `./lib/parser.js`/`./lib/bracket.js`** — parser/bracket berou z aktivního pluginu (`state.def`, `state.category.bracket`).
- Stav `state = { sourceId, categoryId, focusTeam, def, category }`; `isFocus(name)` přes `state.focusTeam`.
- `dataDir()` = `data/${sourceId}/${categoryId}`; `loadJson` a demo cesty per-source (`sources/<id>/demos/<cat>/<scn>/` — demo se servíruje jako statické z repo; ověř, že GH Pages servíruje sources/).
  > **Pozor:** demo data jsou teď v `sources/.../demos/` — to musí být fetchovatelné z webu. GH Pages servíruje celý repo, takže `sources/...` je dostupné. Demo path prefix = `sources/${sourceId}/demos/${categoryId}/${scn}/`.
- `renderTable`/`renderAllMatches`: skupina z `state.category.defaultGroup` (ne `MH`); nadpisy `#section-table h2`/`#section-all-matches h2` dynamicky.
- `renderBracket`: view toggle volá `state.category.bracket.renderStaticBracket(matches,table,state.focusTeam)` / `.renderPhaseList(...)`.
- `renderTigersMatches`/`renderNextMatch`: `state.category.bracket.focusPath/matchCardHtml/resolvePlaceholder/isPlaceholderCell` se `state.focusTeam`.
- `forceRefresh`: `state.category.fetchTargets` + `state.def.parseTable/parseMatches`.
- Přepínače `populateSourceSelect/CategorySelect/TeamSelect` (IDs `source-select`/`category-select`/`team-select`); team z tabulek kategorie; deep-link `?source=&category=&team=` + localStorage; po změně zdroje/kategorie `stopPolling()`+`initialLoad()`+`startPolling()`.
- `page-title`/`page-subtitle` ze `state.def.label`/`state.category.label`.
- `loadBuildInfo`/`bumpVisitorCount`: ponech repo/counter slug jako konstanty (komentář „deploy-global").
- Null-guardy DOM, escape dat (jako dnes).

- [ ] **Step 1–N:** čti aktuální app.js, proveď výše uvedené, zachovej strukturu funkcí. `node --check app.js`. `grep` na `lib/parser`/`lib/bracket` → prázdné.
- [ ] **Commit:** `feat(app): generic shell — source/category/team, preserve polling+views+refresh`.

> Ověření: app.js nemá testy → controller provede browser-verifikaci (statický server + Edge headless) po Tasku 9 (index.html). Musí render: tabulka, zápasy, **oba pohledy pavouka (pavouk+seznam)**, polling nehází chyby, přepínače, focus highlight.

---

## Task 9: `index.html` + `styles.css` — přepínače + dynamické nadpisy

**Files:** Modify `index.html`, `styles.css`.

- [ ] **Step 1:** `<title>`→`Tournament Viewer`; `<h1 id="page-title">`/`<p id="page-subtitle">`; nahraď `data-mode-select` blok přidáním `.selectors` (source/category/team selecty) — **ponech** demo přepínač? Demo se sloučí do source/category výběru; `data-mode-select` zruš (demo scénáře budou samostatná „kategorie"? NE — zjednodušší: ponech `data-mode-select` pro demo scénáře dané kategorie vedle source/category/team). **Rozhodnutí:** ponech `data-mode-select` (demo scénáře aktuální kategorie) + přidej `source-select`/`category-select`/`team-select`. app.js (Task 8) plní oba.
- [ ] **Step 2:** generalizuj sekční nadpisy (JS je přepíše); ponech `.bracket-view-toggle` a `.filter-btn` beze změny.
- [ ] **Step 3:** `styles.css` — přidej `.selectors` styly + `section[hidden]`.
- [ ] **Step 4:** commit `feat(ui): selectors + dynamic headings (keep view toggle)`.

---

## Task 10: Infra generalizace — okno napříč zdroji + CF worker

**Files:** Modify `scripts/in-tournament-window.mjs`, `infra/cloudflare-cron/src/index.js`; Modify `.github/workflows/scrape.yml`; tests `tests/inTournamentWindow.test.mjs`, `tests/cfCronHandler.test.mjs`.

- [ ] **Step 1: `scripts/in-tournament-window.mjs`** — iteruj `SOURCES`×kategorie, čti `data/<source>/<cat>/matches.json`, `proceed=true` když `isInTournamentWindow` aspoň pro jeden. Zachovej re-export pro testy.
- [ ] **Step 2:** uprav `tests/inTournamentWindow.test.mjs` na novou agregaci (aspoň jeden v okně).
- [ ] **Step 3: CF worker** `infra/cloudflare-cron/src/index.js` — importuj `sources/registry.js`, pro každý zdroj/kategorii fetchni `data/<source>/<cat>/matches.json` z raw GitHub, dispatch když aspoň jeden v okně. Uprav `tests/cfCronHandler.test.mjs`.
- [ ] **Step 4: workflow** `scrape.yml` — cesty validace `jq` na per-source soubory (nebo glob `data/**/*.json`); commit message beze změny. Window-gate krok beze změny (volá in-tournament-window.mjs).
- [ ] **Step 5:** `pnpm test` → PASS.
- [ ] **Step 6:** commit `feat(infra): cross-source tournament window + CF worker`.

---

## Task 11: Úklid + přesun testů + README

**Files:** Delete shims `lib/parser.js`, `lib/bracket.js`; přesun bracket testů do `tests/sources/ostravske-hry-2026/`; Modify `README.md`.

- [ ] **Step 1:** ověř `grep -rn "lib/parser\|lib/bracket\.js"` → jen testy, které přesměruješ/přesuneš. app.js/scrape.mjs/index.html → nic.
- [ ] **Step 2:** přesměruj zbývající testy importující bracket/parser na `sources/ostravske-hry-2026/…` (tigersPath, bracketHelpers, renderStaticBracket, renderMermaid, renderPhaseList, matchCardHtml). Fixtury zůstávají v `tests/fixtures/`.
- [ ] **Step 3:** `git rm lib/parser.js lib/bracket.js` (shimy).
- [ ] **Step 4:** `pnpm test` → **vše zelené** (0 fail).
- [ ] **Step 5:** README — generic Tournament Viewer + „přidání zdroje" (vč. `bracket` modulu + sdílených utilit + okna).
- [ ] **Step 6:** commit `chore: drop shims, relocate tests, update README`.

---

## Definition of Done

- [ ] `sources/registry.js` + `_contract.md` + plugin `ostravske-hry-2026` (parser, bracket s `focusTeam`, demos).
- [ ] Bracket parita 6/6 (pavouk+seznam) snapshot — chování pro Tigers focus beze změny.
- [ ] `app.js` generický: přepínače Zdroj/Kategorie/Tým, deep-link, **zachované** polling, view toggle, retry, demo, force-refresh, skeleton, error hlášky.
- [ ] `data/<source>/<category>/` layout; demos pod pluginem; in-tournament-window + CF worker agregují napříč zdroji.
- [ ] scraper multi-source s anti-spam zápisy.
- [ ] Browser-verifikace: tabulka/zápasy/oba pohledy pavouka/přepínače/focus/polling bez chyb.
- [ ] `pnpm test` 0 fail; README aktualizováno.
- [ ] Žádné importy smazaných `lib/parser.js`/`lib/bracket.js`.
