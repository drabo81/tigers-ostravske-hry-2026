# Multi-Tournament Viewer — Design Spec

**Status:** Draft pro review
**Datum:** 2026-05-30
**Autor:** Vítězslav Drábek (brainstorming s Claude Code)
**Navazuje na:** `2026-05-19-tigers-playoff-viewer-design.md`

---

## 1. Cíl

Zobecnit stávající Tigers Play-off Viewer (jeden napevno zadaný turnaj) na **viewer libovolných turnajů**. Uživatel chce:

- přidat nový zdroj (web/turnaj) napsáním pluginu (parseru),
- přepínat se v UI mezi zdroji / turnaji,
- v rámci turnaje si vybrat **věkovou kategorii** a v ní **tým**, který se zvýrazní (focus),
- **zachovat plně funkční pavouk play-off** a umožnit ho i pro budoucí turnaje.

Stránka zůstává statická, zdarma hostovaná na GitHub Pages, bez build stepu, auto-aktualizovaná GitHub Actions cronem.

## 2. Rozhodnutí z brainstormingu

| Téma | Rozhodnutí |
|------|-----------|
| Šíře zdrojů | Plně pluginový systém — libovolný sport/web, bracket nepovinný. |
| Bracket | Volitelný kód-hook v pluginu (chybí → sekce pavouka se skryje). |
| Bracket engine | **Vytáhnout hned** sdílený engine + IR; pluginy vyrábějí IR. |
| Focus tým | Default z konfigurace kategorie, **přepisatelný uživatelem**. |
| Scrape lifecycle | Každý zdroj má **aktivní okno** (`activeFrom`–`activeTo`). |
| Výběr v UI | Dropdown **Zdroj → Kategorie → Tým** + URL deep-link. |
| Kategorie | **Explicitně vyjmenované** v pluginu (ne auto-discovery). |
| Architektura | Přístup A: plugin = ES modul + statický registr. |

### Průzkum zdrojů (provedeno během brainstormingu)

Všechny čtyři ověřené zdroje jsou **server-rendered HTML** (žádná SPA / JS-render riziko — prosté `fetch` + DOM data dostane):

| Zdroj | Kategorie | Layout dat | Playoff |
|-------|-----------|-----------|---------|
| `ostravskehry.cz` | B09–B19, G13… | 1 URL = 1 kategorie (`?category=24`) | zápasy s `phase` kódy (syntetizovaný pavouk) |
| `ostravacup.cz` | 10 (BU19…GU11) | 1 URL = 1 kategorie (`?category=&group=&season=&type=`) | zápasy s fázemi |
| `opengame.cz` | ~19 | **1 URL = všech 46 skupin** (`/turnaj/skupiny/`), filtr je klient-side | zápasy s fázemi |
| `old.ostravacup.cz/junior` | víc | ASP frameset, `tabulka.asp?sezona=` | **dedikovaná** bracket stránka `play_off_vypis.asp` |

Dvě poučení promítnutá do designu:
1. Některé zdroje servírují všechny kategorie na jedné stránce (opengame) → kategorie potřebuje `groupFilter` a scraper deduplikuje stahování podle URL.
2. Playoff je reprezentován různě (syntéza z fází vs. dedikovaná stránka) → bracket engine musí pracovat nad normalizovaným mezimodelem (IR), ne nad konkrétním HTML.

## 3. Architektura

```
tournament-viewer/                       # GitHub repo (přejmenování řeší §13)
├── sources/
│   ├── registry.js                      # seznam zdrojů: lehká metadata + lazy loader
│   ├── _contract.md                     # dokumentace rozhraní pluginu + recept na pavouka
│   └── tigers-ostravske-2026/           # první plugin = dnešní Tigers (migrace)
│       ├── index.js                     # default export: SourceDefinition
│       ├── parser.js                    # parseTable, parseMatches (přesun z lib/)
│       ├── bracket.js                   # buildBracketModel → IR (přesun z lib/)
│       └── demos/                        # demo scénáře tohoto zdroje
├── lib/
│   ├── shared.js                        # normalizeTeamName, escapeHtml, fmtDate, fmtDateTime
│   ├── bracket-engine.js                # resolveCode, highlightPath, renderMermaid (sdílené)
│   └── proxy.js                          # CORS proxy failover (beze změny)
├── app.js                               # generický shell — orchestrace, přepínače, focus
├── index.html / styles.css
├── scripts/
│   └── scrape.mjs                       # multi-source scraper (iteruje registry × kategorie)
├── data/
│   └── <source-id>/<category-id>/{table,matches,meta}.json
├── tests/
│   ├── shared.test.mjs
│   ├── bracket-engine.test.mjs
│   └── sources/tigers-ostravske-2026/*.test.mjs   # parser + bracket builder fixtury
└── .github/workflows/scrape.yml
```

**Princip:** `app.js` a `scrape.mjs` neznají žádný konkrétní turnaj. Veškerá turnaj-specifická logika (parser, kostra pavouka, časy, haly, focus tým) žije v `sources/<id>/`. Jádro pracuje jen přes **kontrakt pluginu**, obecný datový model (`table` + `matches`) a **BracketModel** (IR).

## 4. Kontrakt pluginu (`SourceDefinition`)

Každý `sources/<id>/index.js` exportuje default objekt:

```js
export default {
  // ─── Metadata zdroje (webu/turnaje) ───
  id: 'tigers-ostravske-2026',          // unikátní slug, používá se v URL i data path
  label: 'Tigers — Ostravské hry 2026',
  sport: 'florbal',                     // jen informativní
  activeFrom: '2026-05-22T00:00:00Z',
  activeTo:   '2026-05-26T00:00:00Z',   // mimo okno cron nescrapuje

  // ─── Parser: SDÍLENÝ napříč kategoriemi tohoto zdroje ───
  //     Čisté funkce nad DOM. Vstup = kořenový Document (Node linkedom i browser DOMParser).
  //     Nesmí vědět, kde běží. Vrací jednotný datový model (§5).
  parseTable(doc)   { /* → { groups: { '<groupCode>': [row, …] } } */ },
  parseMatches(doc) { /* → { matches: [match, …] } */ },

  // ─── Kategorie, které zdroj zpřístupní (explicitní výčet) ───
  categories: [
    {
      id: 'BU13',
      label: 'Mladší žáci BU13',
      fetchTargets: {
        table:   'https://ostravskehry.cz/florbal/table/',
        matches: 'https://ostravskehry.cz/florbal/matches/?category=24',
      },
      groupFilter: 'all',               // 'all' | ['MH','MD','ME'] — které skupiny do kategorie patří
      defaultFocusTeam: 'FBC Tigers Poruba',  // null = bez focusu
      defaultGroup: 'MH',               // null = první skupina
      // Volitelný bracket hook (chybí / null → sekce pavouka skrytá):
      buildBracketModel(matches, table, focusTeam) { /* → BracketModel (§8) */ },
    },
    // … další kategorie
  ],
};
```

**Pravidla kontraktu:**
- `parseTable`/`parseMatches` jsou **čisté funkce nad DOM**, sdílené napříč kategoriemi zdroje (HTML struktura webu je stejná, liší se jen URL parametry). Vrací jednotný model (§5), nezávislý na běhovém prostředí.
- `categories[]` je úroveň mezi zdrojem a týmem. `fetchTargets`, `groupFilter`, `defaultFocusTeam`, `defaultGroup` a `buildBracketModel` jsou **per kategorie**.
- `groupFilter`: parser vždy vrátí všechny skupiny ze stažené stránky; kategorie deklaruje, které jí patří (`'all'` u zdrojů s 1 URL/kategorie, výčet kódů u opengame-stylu, kde je vše na jedné stránce).
- `buildBracketModel` je **nepovinné**. Vrací IR (§8), který vykreslí sdílený engine. Když chybí → jádro sekci pavouka nevykreslí.
- Metadata (`id`, `label`, `active*`, a `categories` jako lehké `{id,label,defaultFocusTeam,defaultGroup}`) musí jít přečíst **bez** nahrání parseru — drží je registr (§4.1).

### 4.1 Registr zdrojů (`sources/registry.js`)

```js
export const SOURCES = [
  {
    id: 'tigers-ostravske-2026',
    label: 'Tigers — Ostravské hry 2026',
    activeFrom: '2026-05-22T00:00:00Z',
    activeTo:   '2026-05-26T00:00:00Z',
    categories: [
      { id: 'BU13', label: 'Mladší žáci BU13', defaultFocusTeam: 'FBC Tigers Poruba', defaultGroup: 'MH' },
    ],
    load: () => import('./tigers-ostravske-2026/index.js'),   // lazy: parser/bracket až při potřebě
  },
  // … další zdroje
];
```

- **Frontend** importuje `registry.js` staticky → naplní přepínače z lehkých metadat → vybraný plugin lazy-loadne přes `load()`.
- **Scraper** importuje `registry.js` a iteruje všechny zdroje × kategorie.
- Přidání zdroje = nová složka `sources/<id>/` + jeden záznam v `SOURCES`. (Drobný manuální krok, vědomě zvolený oproti auto-discovery.)

## 5. Datový model

Beze změny shape oproti stávajícímu (jen přesun do per-source/category cest). Jednotný napříč všemi pluginy:

### `table.json`
```jsonc
{
  "scraped_at": "2026-05-22T11:30:00Z",
  "groups": {
    "MH": [
      { "rank": 1, "team": "FBC Tigers Poruba", "scored": 15, "conceded": 8, "points": 7 }
    ]
  }
}
```
Pole řádku jsou minimální společný jmenovatel (`rank`, `team`, `scored`, `conceded`, `points`). Plugin smí přidat další pole (`played`, `wins`…); jádro je ignoruje, pokud je nevykresluje.

### `matches.json`
```jsonc
{
  "category": "BU13",
  "scraped_at": "2026-05-22T11:30:00Z",
  "matches": [
    {
      "id": 2294,
      "date": "2026-05-22",          // ISO YYYY-MM-DD
      "time": "11:15",               // HH:MM
      "group": "MH",                 // group kód | null
      "phase": "group",              // "group" | turnaj-specifické fáze (16F-A…) | "other"
      "venue": "SPŠ Elektroniky",
      "home": "FBC Tigers Poruba",
      "away": "FBC Intevo Třinec červení",
      "score": null                  // { home, away, status:"final" } | null
    }
  ]
}
```
`phase` enum je **per plugin** (jádro ho nevaliduje); společný je jen `"group"`. Pavouk si fáze interpretuje sám v `buildBracketModel`.

### `meta.json`
```jsonc
{
  "last_success_at": "2026-05-22T11:30:00Z",
  "last_attempt_at": "2026-05-22T11:45:00Z",
  "last_attempt_status": "ok",       // "ok" | "parse_error" | "network_error"
  "source": "tigers-ostravske-2026",
  "category": "BU13"
}
```
Aktualizuje se při **každém běhu aktivního zdroje** (drží `last_attempt_at`, takže frontend ví, že cron běžel, i kdy). Aby historie nenarůstala, scraper tyto změny **amenduje do posledního cronového commitu** místo vytváření nového — commit mechanika viz §7.1. Zdroj **mimo aktivní okno** se přeskočí úplně (žádný zápis, `meta.json` se nemění).

**Data layout:** `data/<source-id>/<category-id>/{table,matches,meta}.json`. Všechny `*_at` timestampy v UTC; frontend formátuje přes `Intl.DateTimeFormat`.

## 6. Výběr Zdroj → Kategorie → Tým

- **Tři přepínače** v hlavičce: Zdroj → Kategorie → Tým (focus). Seznam týmů se naplní z naparsovaných tabulek vybrané kategorie (skupiny dle `groupFilter`).
- **Deep-link:** `?source=<id>&category=<id>&team=<urlencoded>`. URL parametr má **nejvyšší prioritu**.
- **Priorita defaultů** (od nejvyšší):
  1. URL parametr,
  2. poslední volba uživatele (`localStorage`),
  3. zdroj = první **aktivní** (v okně), jinak první v `SOURCES`; kategorie = `defaultGroup`/první; tým = `defaultFocusTeam`.
- **Focus override:** uživatel může přepsat tým defaultně daný kategorií; volba se uloží do `localStorage` a promítne do URL. Bez focus týmu = čistý viewer bez highlightu.
- **Sekce tabulky:** zvýrazní se skupina focus týmu; ostatní skupiny kategorie jsou pod ní (sbalitelné). Bez focusu = výpis všech skupin kategorie.

## 7. Scraper (`scripts/scrape.mjs`)

Generalizace stávajícího scraperu na multi-source:

```
pro každý zdroj v SOURCES:
  pokud now < activeFrom nebo now >= activeTo:
    přeskoč zdroj úplně (žádný zápis, žádný commit)
  jinak:
    nahraj plugin přes load()
    pro každou kategorii:
      stáhni fetchTargets.table a .matches (s URL-dedup cache — viz níže)
      parseTable(doc) / parseMatches(doc)
      aplikuj groupFilter (vyber skupiny patřící kategorii)
      validuj shape; zapiš table.json/matches.json (scraped_at = now)
      zapiš meta(last_attempt_at = now; status="ok")
```

- **URL-dedup cache:** v rámci jednoho běhu se každá URL stáhne **jen jednou** (memo podle URL). Řeší opengame, kde 19 kategorií sdílí jednu stránku `/turnaj/skupiny/`.
- **groupFilter:** parser vrací všechny skupiny stránky; scraper uloží do kategorie jen skupiny dle filtru. Matches se filtrují podle `group` ∈ filtr (a/nebo fází patřících kategorii).
- **`scraped_at` se zapisuje vždy** (= čas posledního scrapu, takže frontend ví, že cron běžel). Commit šum z toho neřeší dedup zápisu, ale **amend mechanika** (§7.1) — historie tím neroste, i když se obsah mění každý běh kvůli timestampu. Žádné porovnávání obsahu tedy není potřeba.
- Zachováno ze stávajícího: timeout 15 s, 3 retries s backoffem; parser běží v Node přes `linkedom` (`parseHTML(html).document`), v browseru přes `DOMParser` — stejný kontrakt.

### 7.1 Commit mechanika (amend posledního cronového commitu)

Cíl: cron nesmí narůstat historii o stovky commitů, ale `meta.json` se má aktualizovat při každém běhu aktivního zdroje.

```
git add data/
pokud git diff --cached je prázdný:        # pojistka (prakticky nenastane: scraped_at = now)
  konec, nic necommituj
HEAD_je_cronový = (autor HEAD == "scraper-bot")   # rozpoznání podle autora, NE podle obsahu
pokud HEAD_je_cronový:
  git commit --amend --no-edit             # přepiš POUZE předchozí cronový commit
  git push --force-with-lease
jinak:                                      # HEAD je kódový/lidský commit
  git commit -m "data: scrape <UTC> [<source-ids>]"   # VŽDY nový commit, kódový se nikdy nemění
  git push
```

- **Amend jen nad cronovým HEAD.** Rozhodující je **autor** předchozího commitu (`scraper-bot`), ne jeho obsah. Je-li HEAD kódový/lidský commit (jiný autor), scraper na něj **nešahá** a udělá nový commit — tím se kódová historie nikdy nepřepíše.
- **Výsledek:** nad posledním lidským (kódovým) commitem žije vždy **max jeden** cronový commit, který se přepisuje. Lidský commit předchozí stav dat „zafixuje".
- **`--force-with-lease`** bezpečně selže, pokud remote mezitím dostal jiný push; scraper pak spadne a příští běh udělá čistý nový commit (žádná tichá ztráta dat).
- **Exit kód:** běh skončí nenulově, pokud aspoň jedna aktivní kategorie selhala (parse/network) — kvůli GitHub Actions notifikaci. Přeskočený (neaktivní) zdroj není chyba.
- Důsledky (force-push, redeploy Pages, ztráta granulární historie) viz §13.

## 8. Bracket engine + IR

### Hranice
```
plugin.buildBracketModel()  ──vyrobí──▶  BracketModel (IR)  ──spotřebuje──▶  lib/bracket-engine
   (turnaj-specifické)                                                        (sdílené, agnostické)
```

### `BracketModel` (IR) — co plugin vyrobí
```js
{
  nodes: [
    {
      id: '16F-A_1',          // unikátní v rámci modelu
      round: '16F-A',         // jen label/seskupení
      home: 'H1',             // jméno týmu NEBO position kód (H1, D4, H1/D4…)
      away: 'D4',
      score: null,            // { home, away } | null
      venue: 'Sareza Přívoz',
      when: '23.5. 14:00',
    },
  ],
  edges: [
    { from: '16F-A_1', to: '8F-A_1', label: 'výhra' },
    { from: '16F-A_1', to: '8F-B_1', label: 'prohra' },
  ],
}
```

### `lib/bracket-engine.js` (sdílené, turnaj-nezávislé)
- `resolveCode(code, table)` — position kód (`H1` = 1. místo skupiny MH, `D4`…) → jméno týmu z tabulky; před odehráním zápasů ve skupině vrací `null` (rank je jen seed). Přesun + zobecnění stávající logiky.
- `highlightPath(model, focusTeam)` — vrátí množinu ID uzlů na cestě focus týmu (sleduje výsledky výhra/prohra přes `edges`). Nahrazuje dnešní hardcoded Tigers `tigersHighlightedNodes`, parametrizovaně přes `focusTeam`.
- `renderMermaid(model, { highlighted, focusTeam })` — vygeneruje `flowchart` string: uzly, hrany, „played/unplayed" styl, oranžový highlight cesty, zlaté finále. Přesun stávajícího Mermaid renderingu.

### Co plugin dělá
- **Tigers** (`sources/tigers-ostravske-2026/bracket.js`): `buildBracketModel` vezme statickou kostru (dnešní `STATIC_TEMPLATE`, ~750 řádků turnaj-specifických dat) + `matches` podle fází a **emituje IR**. Dnešní `resolvePlaceholder`/`findMatchByCodeAndPhase` logika zůstává v pluginu (je specifická pro „pavouk A/B" formát ostravskehry). Engine převezme jen resolve+highlight+render.
- **Zdroj s dedikovanou bracket stránkou** (old.ostravacup styl): `buildBracketModel` naparsuje bracket stránku přímo do IR. (Mimo rozsah první iterace — návrh to ale umožňuje.)

Tím se 750 řádků rozdělí na **sdílený engine** (znovupoužitelný) + **Tigers builder** (zůstává v pluginu). Druhý turnaj píše jen svůj builder.

## 9. Frontend shell (`app.js`)

Generický, turnaj-agnostický. Sekce stránky (sticky header):
1. **Header** — název zdroje + přepínače Zdroj/Kategorie/Tým + „Naposled aktualizováno" + Force refresh.
2. **Další zápas** focus týmu (skryté bez focusu).
3. **Tabulka** — skupina focus týmu zvýrazněná, ostatní skupiny sbalitelné.
4. **Zápasy focus týmu** — kartičky (skryté bez focusu).
5. **Pavouk** — Mermaid z `bracket-engine.renderMermaid(plugin.buildBracketModel(...))`; skrytý, když plugin `buildBracketModel` nemá.
6. **Všechny zápasy** kategorie — kompaktní tabulka.

- **Načítání dat:** `data/<source>/<category>/{table,matches,meta}.json` s cache-busterem `?t=${Date.now()}`.
- **Force refresh:** přes `lib/proxy.js` (CORS failover) stáhne `fetchTargets` vybrané kategorie, naparsuje stejným pluginem v browseru, překreslí (v paměti).
- **Demo režim** zůstává zachován: demo scénáře se přesunou pod plugin (`sources/<id>/demos/`); registr je zpřístupní jako alternativní „kategorie/zdroj" v přepínači.
- Zachované utility (počítadlo návštěv, build-info) zůstávají, ale jsou turnaj-agnostické.

## 10. Migrace stávajícího Tigers kódu

1. `lib/parser.js` → `sources/tigers-ostravske-2026/parser.js` (beze změny logiky).
2. `lib/bracket.js` → rozdělit: sdílené resolve/highlight/render → `lib/bracket-engine.js`; Tigers kostra + `buildBracketModel` → `sources/tigers-ostravske-2026/bracket.js`.
3. `normalizeTeamName`, `escapeHtml`, `fmtDate`, `fmtDateTime` → `lib/shared.js`.
4. `data/{table,matches,meta}.json` → `data/tigers-ostravske-2026/BU13/`. Demo scénáře → `sources/tigers-ostravske-2026/demos/`.
5. `app.js` zgeneralizovat (přepínače, focus override, lazy load pluginu).
6. `scrape.mjs` zgeneralizovat (iterace registru, URL-dedup, aktivní okna).
7. Testy přesunout/rozdělit (§11).

**Pravidlo migrace:** bracket je **refactor, ne rewrite** — Tigers pavouk musí po migraci produkovat vizuálně tentýž výstup (ověřeno přes snapshot fixtury, §11).

## 11. Testování

- **Sdílené utility** (`tests/shared.test.mjs`): `normalizeTeamName` atd.
- **Bracket engine** (`tests/bracket-engine.test.mjs`): `resolveCode` (pozice→tým, prázdná tabulka→null), `highlightPath` (cesta dle výsledků), `renderMermaid` (flowchart string, styly) nad syntetickým IR.
- **Plugin parser** (`tests/sources/tigers-ostravske-2026/parser.test.mjs`): HTML fixtury → očekávaný model (stávající fixtury se přesunou).
- **Plugin bracket** (`…/bracket.test.mjs`): `buildBracketModel` produkuje očekávaný IR; **snapshot** výsledného Mermaidu pro zachování parity s dnešním pavoukem.
- **Scraper smoke:** `pnpm scrape` lokálně před deployem.
- Framework: `node:test` + native assertions (beze změny).

## 12. Error handling

| Selhání | Co se stane |
|---------|-------------|
| Scraper: HTTP error (po retries) | `meta.status="network_error"`, data beze změny, nenulový exit (GitHub notifikace). |
| Scraper: parse error | `meta.status="parse_error"`, stará data zůstávají, nenulový exit (GitHub notifikace). |
| Zdroj mimo aktivní okno | Scraper zdroj přeskočí, nic nezapíše, žádný commit. **Bez** chyby. |
| Frontend: `data/*.json` chybí (ještě nescrapováno) | Sekce „Data zatím nejsou k dispozici". |
| Frontend: live refresh — proxy down | Toast „Refresh selhal, data jsou z {time}". |
| Načtená data: invalidní shape | Runtime guard (`data.groups`, `Array.isArray(data.matches)`) → toast + zachovat předchozí stav. |
| Plugin bez `buildBracketModel` | Sekce pavouka se nevykreslí (validní stav). |
| `groupFilter` nevybere žádnou skupinu | Tabulka „Žádné skupiny pro tuto kategorii"; warning v konzoli. |

## 13. Otevřené body / rizika

- **Přejmenování repa** `tigers-playoff-viewer` → např. `tournament-viewer`. Dotčené: build-info GitHub API URL v `app.js`, případně counter API klíč, GitHub Pages origin. Rozhodnout před nasazením (lze i ponechat starý název a změnit jen titulek).
- **opengame.cz matches URL** — ověřena jen stránka skupin; URL zápasů a formát fází je třeba dozkoumat při psaní toho pluginu (mimo první iteraci).
- **old.ostravacup bracket** — `play_off_vypis.asp` vyžaduje `kategorie=` kód; přímé parsování dedikovaného pavouka je navržené, ale neimplementované v první iteraci.
- **Předčasná abstrakce enginu** — engine se vytahuje nad 1 reálným pavoukem (Tigers). Riziko, že IR nesedne 2. turnaji. Mitigace: IR je záměrně minimální (nodes+edges+score); až druhý builder ukáže mezery, IR se rozšíří.
- **Force-push z cronu** (§7.1) — amend posledního cronového commitu vyžaduje `git push --force-with-lease` na data. Důsledky: GitHub Pages se přebuilduje při každém běhu i bez reálné změny dat; granulární historie mezistavů dat se nezachovává (záměr). Pro single-user data repo přijatelné; `--force-with-lease` chrání před přepsáním cizího pushe.
- **Velikost `data/`** — víc zdrojů × kategorií. Díky amend mechanice historie neroste počtem běhů, jen reálnými změnami dat. Zatím YAGNI; aktivní okna to dál omezují.
- **Sdílení parseru Node↔browser** — drží jen dokud pluginy nepoužijí Node-only/browser-only API. Kontrakt to zakazuje; hlídá review.

## 14. Non-cíle (YAGNI)

- Žádné auto-discovery kategorií (explicitní výčet v pluginu).
- Žádný vlastní backend mimo GitHub Actions, žádná databáze.
- Žádná podpora JS-renderovaných (SPA) zdrojů v první iteraci (všechny ověřené jsou SSR).
- Žádný build step, žádný framework — vanilla JS, ES moduly.
- Žádné parsování dedikovaných bracket stránek v první iteraci (návrh to umožňuje, implementace později).
- Žádné víc-focus týmů najednou (jeden focus tým na kategorii).

## 15. Definition of Done

- [ ] `sources/registry.js` + kontrakt `SourceDefinition` (§4) implementován a zdokumentován v `_contract.md`.
- [ ] Tigers migrován na první plugin; data v `data/tigers-ostravske-2026/BU13/`.
- [ ] `lib/bracket-engine.js` (resolveCode, highlightPath, renderMermaid) + `lib/shared.js` vytaženy a otestovány.
- [ ] Tigers pavouk po migraci produkuje vizuálně tentýž výstup (snapshot test prochází).
- [ ] Frontend: přepínače Zdroj→Kategorie→Tým, focus override, deep-link přes URL.
- [ ] Scraper iteruje registr × kategorie, respektuje aktivní okna, dedupuje URL, aplikuje groupFilter.
- [ ] Cron amenduje **pouze** předchozí cronový commit (rozpoznání podle autora `scraper-bot`); kódové commity nechává a vytváří nad nimi nový (§7.1).
- [ ] Force refresh funguje pro vybranou kategorii přes CORS proxy.
- [ ] Všechny testy procházejí; `pnpm scrape` lokálně vrací validní data.
- [ ] README popisuje, jak přidat nový zdroj (plugin).
