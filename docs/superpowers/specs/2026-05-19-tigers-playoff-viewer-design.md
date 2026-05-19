# Tigers Play-off Viewer — Design Spec

**Status:** Draft pro review
**Datum:** 2026-05-19
**Autor:** Vítězslav Drábek (brainstorming s Claude Code)

---

## 1. Cíl

Mít po ruce auto-aktualizovanou webovou stránku, která během turnaje Ostravské hry 2026 (22.–24. 5.) zobrazí:

- aktuální tabulku skupiny MH (kategorie B13 5+1, kde hraje FBC Tigers Poruba),
- rozpis a výsledky všech zápasů Tigers (základní část + play-off),
- vizuální pavouk play-off s nahrazenými soupeři a zvýrazněnou cestou Tigers,
- kompaktní seznam všech zápasů skupiny MH.

Stránka má fungovat na mobilu i na PC, být zdarma hostovaná a aktualizovat se sama.

## 2. Non-cíle (YAGNI)

- Žádný vlastní backend mimo GitHub Actions.
- Žádná databáze, historie skóre, audit log.
- Žádné push notifikace, e-maily, integrace s kalendářem.
- Žádné PWA, offline mode, service worker.
- Žádný framework (Angular/React/Vue) — vanilla JS stačí.
- Žádný build step (TypeScript, bundler) — statické soubory.

## 3. Zdroje dat

| Co | URL |
|----|-----|
| Tabulky skupin (vše v jednom HTML) | `https://ostravskehry.cz/florbal/table/` |
| Zápasy kategorie B13 5+1 (vše v jednom HTML) | `https://ostravskehry.cz/florbal/matches/?category=24` |
| Detail zápasu (volitelně) | `https://ostravskehry.cz/florbal/match/?id={id}` |

Server-side rendered HTML, žádné JSON API. Veškeré informace jsou v jednom dokumentu — není potřeba per-skupina dotaz.

## 4. Architektura

```
tigers-playoff-viewer/                    # GitHub repo (public)
├── .github/workflows/scrape.yml          # cron */15 + workflow_dispatch
├── scripts/scrape.mjs                    # Node.js scraper (běží v Actions)
├── lib/parser.js                         # sdílený parser (Node + browser)
├── lib/bracket.js                        # statická kostra pavouka + mapování pozic
├── data/
│   ├── matches.json                      # commitnuto scraperem při změně dat
│   ├── table.json                        # commitnuto scraperem při změně dat
│   └── meta.json                         # commitnuto VŽDY (i při selhání) — { last_success_at, last_attempt_at, last_attempt_status }
├── index.html                            # GitHub Pages root
├── app.js                                # frontend orchestrace
├── styles.css
├── tests/
│   ├── fixtures/                         # HTML snapshoty z ostravskehry.cz
│   └── parser.test.mjs
├── package.json
└── README.md
```

**Tok dat (cron):**

1. GitHub Actions cron každých 15 min spustí `scripts/scrape.mjs`.
2. Scraper stáhne 2 HTML stránky, parsuje přes `cheerio`, normalizuje data.
3. Pokud se obsah liší od posledního commitu, commit nových JSONů do `data/`.
4. GitHub Pages auto-deploy nové verze (žádný build).
5. Frontend při loadu fetchne `data/*.json` ze stejného originu (žádný CORS).

**Tok dat (live refresh):**

1. Uživatel klikne "Force refresh" (po kliknutí **debounce 5 s** — tlačítko se na 5 s deaktivuje, prevence rate-limit ban od proxy služeb).
2. Frontend fetchne `ostravskehry.cz/florbal/{table,matches}` přes veřejnou CORS proxy. Sekvenční failover řetězec (NE paralelní — šetříme proxy služby):
   - `corsproxy.io` (primary, 8 s timeout)
   - `api.allorigins.win/raw` (1. fallback, 8 s timeout)
   - `thingproxy.freeboard.io/fetch` (2. fallback, 8 s timeout)
   - Pokud všechny selžou → toast "Refresh selhal", data v UI zůstávají z poslední úspěšné instance.
3. Stejný parser (`lib/parser.js`) běží v browseru a produkuje stejnou strukturu jako Node verze.
4. Frontend překreslí UI a v paměti drží novější data než JSON v repu (do refreshe stránky).

**Cache-buster pro JSON fetch:** Všechny fetch volání na `data/*.json` mají `?t=${Date.now()}` query parameter, který obchází GitHub Pages CDN cache (~10 min TTL). Vždy dostaneme nejnovější commit.

## 5. Komponenty

### 5.1 Scraper (`scripts/scrape.mjs`)

- Závislosti: `cheerio` (HTML parsing), nativní `fetch` v Node 22+.
- Vstupy: žádné (URL natvrdo v kódu).
- Výstupy: `data/matches.json`, `data/table.json`, `data/meta.json`.
- Chování:
  - Network timeout 15 s, 3 retries s exponenciálním backoffem.
  - **Úspěch** → zapíše `matches.json` + `table.json` (jen pokud SHA-256 obsahu se liší od commitnuté verze), `meta.json` s `last_attempt_status: "ok"` a `last_success_at = now`. Exit 0.
  - **Network error** (po retries) → ponechá `matches.json`/`table.json` beze změny, zapíše `meta.json` s `last_attempt_status: "network_error"`, `last_attempt_at = now`, `last_success_at` ponechá. Exit 1.
  - **Parse error** (cheerio našel nečekanou strukturu) → totéž, status `"parse_error"`. Exit 1.
  - `meta.json` se tedy commituje vždy. Frontend pak vidí stav posledního pokusu, nejen posledního úspěchu.

### 5.2 Parser (`lib/parser.js`)

Čisté funkce nad **DOM-like** API. V Node běží přes `cheerio` (které DOM API emuluje), v browseru přes nativní `DOMParser`. Funkce dostávají kořenový element a vrací data — neví, kde běží.

```js
// lib/parser.js
export function parseTable(rootElement) { /* → { groups: { MH: [...], MD: [...], ME: [...] } } */ }
export function parseMatches(rootElement) { /* → { matches: [...] } */ }

// Normalizační helper — používá se uvnitř parseru i v bracket.js pro matchování jmen.
// NENÍ to fuzzy matching (žádné Levenshtein/podobnost) — jen deterministické sjednocení
// před exact comparison. "FBC Tigers Poruba " vs. "fbc tigers poruba" → match.
// Pokud se po normalizaci jména pořád neshodnou, je to skutečná divergence, kterou
// nechceme tiše ohnout — log warning a zobraz "—" místo jména.
export function normalizeTeamName(s) {
  return s.trim().toLocaleLowerCase('cs').normalize('NFD').replace(/\p{Diacritic}/gu, '');
}
```

Adaptéry:

```js
// scripts/scrape.mjs
import * as cheerio from 'cheerio';
const $ = cheerio.load(html);
const data = parseTable($.root());
```

```js
// app.js
const doc = new DOMParser().parseFromString(html, 'text/html');
const data = parseTable(doc.documentElement);
```

### 5.3 Bracket logic (`lib/bracket.js`)

Definuje **statickou kostru pavouka** (kdo s kým hraje na úrovni pozic ve skupinách):

```js
export const BRACKET_SKELETON = {
  '16F-A_H1': { home: 'H1', away: 'D4', time: '14:00', venue: 'Sareza Přívoz' },
  '16F-A_H2': { home: 'H2', away: 'D3', time: '14:50', venue: 'VŠB-TUO' },
  // ...
  '8F-A_1':   { feedsFrom: ['16F-A_H1_win', '16F-A_H2_win'], time: '...', venue: '...' },
  // ...
};
```

Funkce:

```js
export function resolveBracket(skeleton, table, matches) {
  // 1. Nahradí kódy pozic (H1, D4) jmény týmů z `table`.
  // 2. Doplní výsledky z `matches` (matchování přes group + home/away názvy).
  // 3. Označí Tigers cestu (highlight: true) ve větvi kde reálně hrají.
  // 4. Vrátí strom uzlů připravený k vykreslení.
}

export function renderMermaid(resolvedBracket) {
  // Vygeneruje `flowchart TD ...` string.
}
```

### 5.4 Frontend (`app.js`, `index.html`)

Sekce stránky (v tomto pořadí, sticky header):

1. **Header** — "FBC Tigers Poruba B13 — Ostravské hry 2026" + "Naposled aktualizováno {time}" + tlačítko **Force refresh**.
2. **Tabulka MH** — pořadí, body, skóre. Tigers řádek vyznačený oranžově.
3. **Rozpis Tigers** — kartičky všech Tigers zápasů, seřazené v čase. Každá karta: datum/čas, soupeř, hala, výsledek (pokud je).
4. **Pavouk play-off** — Mermaid diagram. Před zahájením základní části: kódy H1–H4. Postupně se nahrazují jmény.
5. **Všechny zápasy MH** — kompaktní tabulka, výsledky když jsou.

Bez frameworku — vanilla JS, ES modules. Mermaid přes CDN (`https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs`).

### 5.5 GitHub Actions (`.github/workflows/scrape.yml`)

```yaml
name: Scrape
on:
  schedule: [{ cron: '*/15 * * * *' }]
  workflow_dispatch:
jobs:
  scrape:
    runs-on: ubuntu-latest
    permissions: { contents: write }
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '22' }
      - uses: pnpm/action-setup@v4
        with: { version: 9 }
      - run: pnpm install --prod --frozen-lockfile
      - id: scrape
        run: pnpm scrape
        continue-on-error: true                                  # ať selhání nezablokuje commit meta.json
      - name: Commit if changed
        run: |
          git config user.name "scraper-bot"
          git config user.email "bot@users.noreply.github.com"
          git add data/
          git diff --quiet --cached || git commit -m "data: scrape $(date -u +%Y-%m-%dT%H:%MZ) [${{ steps.scrape.outcome }}]"
          git push
      - name: Fail if scraper failed
        if: steps.scrape.outcome != 'success'                    # po commitu meta.json job spadne → notifikace
        run: exit 1
```

## 6. Datové struktury

### `data/matches.json`

```jsonc
{
  "category": 24,
  "scraped_at": "2026-05-22T11:30:00Z",
  "matches": [
    {
      "id": 2294,
      "date": "2026-05-22",
      "time": "11:15",
      "group": "MH Zákl. část",
      "phase": "group",                 // "group" | "16F-A" | "8F-A" | "8F-B" | "4F-A" | "4F-B" | "SF-A" | "SF-B" | "FINAL-A" | "FINAL-B"
      "venue": "SPŠ Elektroniky",
      "home": "FBC Tigers Poruba",
      "away": "FBC Intevo Třinec červení",
      "score": null                     // { home: 5, away: 3, status: "final" } | null
    }
  ]
}
```

### `data/table.json`

```jsonc
{
  "scraped_at": "2026-05-22T11:30:00Z",
  "groups": {
    "MH": [
      { "rank": 1, "team": "FBC Tigers Poruba", "played": 3, "wins": 2, "draws": 1, "losses": 0, "scored": 15, "conceded": 8, "points": 7 }
    ],
    "MD": [...],
    "ME": [...]
  }
}
```

### `data/meta.json`

```jsonc
{
  "last_success_at": "2026-05-22T11:30:00Z",     // poslední úspěšný scrape, který commitnul data
  "last_attempt_at": "2026-05-22T11:45:00Z",     // poslední běh scraperu (i při selhání)
  "last_attempt_status": "ok",                   // "ok" | "parse_error" | "network_error"
  "source": "ostravskehry.cz"
}
```

`meta.json` se commituje **vždy** po každém Action runu — i při selhání. Tím frontend ví, že běh proběhl, ale data jsou starší než `last_attempt_at`. Pokud `last_success_at < last_attempt_at`, header zobrazí varování "Poslední pokus o aktualizaci ({last_attempt_at}) selhal, zobrazená data jsou z {last_success_at}".

**Timezone:** Všechny `*_at` timestampy jsou v **UTC** (ISO 8601 se sufixem `Z`). Frontend je formátuje do lokálního času uživatele přes `Intl.DateTimeFormat`.

## 7. Error handling

| Selhání | Co se stane |
|---------|-------------|
| Scraper: HTTP error | Retry 3× s backoff. Pokud i pak fail → `meta.json.last_attempt_status = "network_error"` commit, exit 1, e-mail. |
| Scraper: parse error (změna HTML) | `meta.json.last_attempt_status = "parse_error"` commit, exit 1, e-mail. Staré `matches.json`/`table.json` zůstávají. |
| Frontend: fetch `data/*.json` selže | Inline error banner "Data nelze načíst". |
| Frontend: live refresh — všechny proxy down | Toast "Refresh selhal, data jsou z {time}". |
| Frontend: parse selže během live refresh | Toast "Refresh selhal — server pravděpodobně změnil formát". |
| Před zahájením turnaje (žádné výsledky) | Sekce výsledků zobrazí "Turnaj začíná 22.5." |
| Načtená data: invalidní struktura | Frontend kontroluje shape přes runtime guards (`Array.isArray(data.matches)`, `data.groups?.MH`). Pokud neprojde, toast + zachovat předchozí stav. **Bez JSON Schema knihovny** — kontrakt drží parser unit testy. |

## 8. Testování

- **Parser unit testy** (`tests/parser.test.mjs`) — fixtury HTML v `tests/fixtures/`:
  - `2026-05-19-before-tournament.html` (před zahájením)
  - `2026-05-22-after-group-stage.html` (po základní části — pokud bude k dispozici)
  - `2026-05-23-after-16F.html` (po prvním kole play-off)
  - Parser musí pro každou fixturu produkovat očekávaný JSON (snapshot test).
  - **Test import**: `import { parseTable, parseMatches } from '../lib/parser.js'`. Test si načte fixturu, vytvoří DOM přes `cheerio.load(html)` a předá `$.root()` jako root element — stejný kontrakt jako `DOMParser` v browseru (oba poskytují query selektory `.find`, `.text`, `.attr`).
- **Bracket mapping testy** — pro daný `(table, matches)` input musí `resolveBracket` produkovat očekávaný strom.
- **Smoke test** — `pnpm scrape` lokálně před prvním deployem; vizuální kontrola JSONu. (`package.json` definuje `scripts.scrape: "node scripts/scrape.mjs"` a `scripts.test: "node --test tests/"`.)
- Frameworky: `node:test` (žádná další dep) + native assertions.

## 9. Tech stack

- **Runtime:** Node 22 LTS, prohlížeč (moderní, ES2022+).
- **Package manager:** pnpm.
- **Dependencies (Node only):** `cheerio`.
- **CDN (browser):** `mermaid@10`.
- **Hosting:** GitHub Pages (origin `https://<user>.github.io/tigers-playoff-viewer/`).
- **CI:** GitHub Actions (cron + workflow_dispatch).
- **CORS proxies:** sekvenční failover `corsproxy.io` → `api.allorigins.win/raw` → `thingproxy.freeboard.io/fetch`, 8 s timeout na proxy.

## 10. Otevřené body / rizika

- **Změna HTML struktury ostravskehry.cz** — scraper i live parser selžou. Mitigace: jasná chybová hláška, fallback na poslední úspěšná data, varování v headeru přes `last_attempt_status`.
- **CORS proxy down** — sekvenční failover přes 3 proxy. Pokud všechny dolů, uživatel vidí toast a data z cronu.
- **Identifikace play-off fází** — pavouk vyžaduje konzistentní označení skupin ("16F-A" vs. "1/16 A" atd.). Při implementaci ověřit přesný formát v HTML.
- **Mermaid layout na mobilu** — diagram může být široký. CSS strategie: wrapper `overflow-x: auto`, `min-width: 720px` na `.mermaid`, font-size 12 px pod 768 px viewport. Pokud po implementaci bude na mobilu nečitelný, vyřeším pak (např. zjednodušený textový seznam zápasů místo diagramu pro `< 600 px`).
- **GitHub Pages cache** — vyřešeno cache-busterem `?t=${Date.now()}` na všech JSON fetch voláních (viz §4).
- **Změna formátu turnaje (odložení, odstoupení týmu, reorganizace pavouka)** — `BRACKET_SKELETON` v `lib/bracket.js` je **statická konstanta editovaná ručně**. Pokud organizátor změní rozpis, ruční úprava skeletonu + commit. Není to automatizováno (YAGNI — turnaj trvá 3 dny).

## 11. Definition of Done

- [ ] Scraper úspěšně tahá data z ostravskehry.cz a generuje validní JSON.
- [ ] GitHub Actions cron běží každých 15 min a commituje jen při změně.
- [ ] Frontend zobrazuje 5 sekcí (header, tabulka, rozpis Tigers, pavouk, všechny zápasy).
- [ ] Force refresh tlačítko funguje přes alespoň jednu CORS proxy.
- [ ] Mermaid pavouk se vykreslí s reálnými jmény týmů (jakmile je tabulka k dispozici).
- [ ] Parser testy procházejí na všech fixturách.
- [ ] Stránka funguje na mobilu (responzivní layout).
- [ ] README popisuje setup, deploy, refresh.
