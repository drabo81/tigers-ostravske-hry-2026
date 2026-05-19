# Tigers — Ostravské hry 2026

> Neoficiální fanouškovská stránka s live výsledky FBC Tigers Poruba B13 na turnaji Ostravské hry 2026.
> Statický web hostovaný na GitHub Pages, automaticky aktualizovaný každých 15 minut.

🔗 **Live**: <https://drabo81.github.io/tigers-ostravske-hry-2026/>

---

## ✨ Co stránka umí

- **📊 Tabulka skupiny MH** — pořadí podle [oficiálních pravidel](https://ostravskehry.cz/florbal/pravidla-1) (body → vzájemný zápas → celkové skóre → los), Tigers řádek vyznačený.
- **📅 Zápasy** s filtrem Tigers / Vše (94 zápasů kategorie B13 5+1).
- **🏆 Pavouk play-off** — interaktivní Mermaid diagram, oranžově zvýrazněná cesta Tigers, modře odehrané zápasy. Auto-fit zoom, pan, scroll wheel.
- **🗓 Další zápas** v sticky hlavičce — kdo, kdy, kde.
- **🔄 Manuální aktualizace** — tlačítko `↻ Aktualizovat data` stáhne čerstvá data z ostravskehry.cz přes sekvenční CORS proxy failover (3 proxy).
- **🎭 Demo scénáře** — přepínač *Live / Po skupině / Po 16F / Po 8F / Po 4F / Po SF / Turnaj dohrán*. Pro hosting "co by bylo kdyby" prezentaci.
- **👥 Visitor counter** — unikátní návštěvníci (počítá se jen jednou per prohlížeč).

## 🏗 Architektura

```
┌─────────────────────────────────────────────────────────────────────────┐
│                       ostravskehry.cz (HTML)                            │
└──────────────────────┬─────────────────────┬────────────────────────────┘
                       │                     │
            scrape every 15 min    on user "Aktualizovat data" click
                       │                     │
                       ▼                     ▼
        ┌────────────────────┐    ┌──────────────────────────┐
        │ GitHub Actions     │    │ Browser fetches HTML     │
        │ scripts/scrape.mjs │    │ via 3× CORS proxy        │
        │ (Node + linkedom)  │    │ (corsproxy.io, allorig…) │
        └─────────┬──────────┘    └────────────┬─────────────┘
                  │                            │
                  │  commits to git            │  parses in-browser
                  ▼                            ▼
        ┌────────────────────────────────────────────┐
        │  data/{matches,table,meta}.json            │
        └─────────┬──────────────────────────────────┘
                  │
                  │  served by GitHub Pages
                  ▼
        ┌────────────────────────────────────────────┐
        │  Static frontend (index.html, app.js, …)   │
        │  Vanilla JS · Mermaid · svg-pan-zoom       │
        └────────────────────────────────────────────┘
```

**Žádný backend** mimo GitHub Actions. Žádný build step. Vanilla JS, ES modules, CDN dependencies.

## 📦 Tech stack

| Vrstva | Co | Kde |
|--------|----|-----|
| Frontend | Vanilla JS (ES modules), HTML, CSS | `index.html`, `app.js`, `styles.css` |
| Bracket diagram | Mermaid v10 (CDN) + svg-pan-zoom | inline `<pre class="mermaid">` |
| Scraping (Node) | `linkedom` (lightweight DOM) | `scripts/scrape.mjs` |
| Live refresh (browser) | nativní `DOMParser` + 3× CORS proxy | `lib/proxy.js` |
| CI/CD | GitHub Actions cron `*/15 * * * *` | `.github/workflows/scrape.yml` |
| Hosting | GitHub Pages (zdarma) | branch `main` / root |
| Visitor counter | counterapi.dev (zdarma, bez registrace) | `app.js → bumpVisitorCount` |

## 🚀 Lokální development

```bash
pnpm install

pnpm scrape             # stáhne aktuální data z ostravskehry.cz
pnpm test               # spustí parser testy (44 testů, ~600 ms)

# Lokální HTTP server
python -m http.server 5173
# → http://localhost:5173/
```

### Generování demo dat

```bash
node scripts/generate-demos.mjs
# → data/demo/{po-skupine,po-16f,po-8f,po-4f,po-sf,turnaj-dohran}/
```

Každý scénář je snapshot `matches.json` + `table.json` + `meta.json` pro daný cutoff turnaje.

## 🗂 Struktura repa

```
.
├── .github/workflows/scrape.yml    # cron */15 + workflow_dispatch
├── scripts/
│   ├── scrape.mjs                  # CLI scraper (Node + linkedom)
│   ├── simulate-up-to.mjs          # generuje fake data pro libovolný cutoff
│   └── generate-demos.mjs          # generuje všech 6 demo scénářů
├── lib/
│   ├── parser.js                   # sdílený parser (Node i browser)
│   ├── bracket.js                  # Tigers cesta pavoukem + Mermaid renderer
│   └── proxy.js                    # sekvenční CORS proxy failover (3 proxy)
├── tests/
│   ├── fixtures/                   # HTML snapshoty z ostravskehry.cz
│   └── *.test.mjs                  # 44 testů (node:test, žádný framework)
├── data/
│   ├── {matches,table,meta}.json   # live (cron je píše)
│   └── demo/<slug>/                # 6 demo scénářů
├── docs/superpowers/
│   ├── specs/                      # design spec
│   └── plans/                      # implementační plán
├── index.html · app.js · styles.css
└── package.json (pnpm + cheerio + linkedom)
```

## 🧪 Testy

```bash
pnpm test
```

44 unit testů založených na **reálných HTML fixturách** z ostravskehry.cz:
- `parseTable` — 6 testů (skupiny, ranks, fields, prázdná tabulka)
- `parseMatches` — 8 testů (datum/čas, fáze, Tigers, skóre, deduplikace)
- `normalizeTeamName` — 4 testy (whitespace, lowercase, diakritika)
- `tigersPositionCode` + `matchContainsCode` + `resolveCode` — 8 testů
- `tigersPath` — 6 testů
- `renderMermaid` + bracket helpers — 5 testů
- `fetchViaProxy` (CORS failover) — 5 testů
- 2 ostatní

Testy běží přes nativní `node --test` (Node 22+), bez framework, bez build stepu.

## 🌐 Deploy na GitHub Pages

Repo je už nakonfigurované pro GitHub Pages. Pro nové repo:

1. **Push to GitHub** (public repo).
2. **Settings → Pages** → Source: `Deploy from a branch` → Branch: `main` / `(root)` → Save.
3. **Actions** → povolit (pokud je deaktivováno).
4. **Spustit první scrape ručně**: Actions → Scrape → Run workflow.

Po cca 30 s je stránka live na `https://<user>.github.io/<repo>/`.

#### CI/CD Pipeline

Workflow `.github/workflows/scrape.yml` spouští tři jobs:

| Job | Trigger | Co dělá |
|-----|---------|--------|
| `scrape` | cron `*/15 * * * *` | Fetchne HTML z ostravskehry.cz, spustí testy (44 unit testů), parsuje data, validuje JSON, commituje do `data/` |
| `regenerate-demos` | Po úspěšném scrape | Spustí `generate-demos.mjs`, validuje JSON v `data/demo/`, commituje |
| Health checks | Oba joby | `jq` validuje vygenerovaný JSON (table.json, matches.json, meta.json) |

**Fail-safe mechanismy:**
- Pokud scraper selhane (parse error, network error), workflow selže s exit code 1 a pošle notifikaci
- Pokud se JSON chybně vygeneruje, `jq .` validace selže
- Pokud se data nezmění, commit se neprovede (SHA256 check v scraper.mjs)
- Po konci turnaje (26.5. 2026) scraper jen zapíše `meta.json` status `tournament_ended` a skončí s 0

### Custom doména

Vytvoř soubor `CNAME` v rootu repa s textem `tigers-fans.cz` (nebo jaká doména). Doménový registrátor: CNAME záznam na `<user>.github.io`. V `Settings → Pages → Custom domain` zadej.

## 🔧 Aktualizace pavouka

Pokud organizátor turnaje změní rozpis (přesune zápas, změní formát play-off), edituj `lib/bracket.js` ručně:

- `STATIC_TEMPLATE` — časy, haly, struktura uzlů
- `PHASE_PATTERNS` v `lib/parser.js` — pokud změní textovou hlavičku fáze (`Šestnáctifinále` atd.)

Tabulky a výsledky se aktualizují automaticky scraperem.

## 📊 Pravidla pro řazení (z ostravskehry.cz)

Pořadí týmů ve skupině:

1. **Body** — vyšší celkový součet bodů
2. **Vzájemný zápas — body**
3. **Vzájemný zápas — rozdíl skóre**
4. **Vzájemný zápas — vstřelené branky**
5. **Celkový rozdíl skóre**
6. **Celkový počet vstřelených branek**
7. **Los**

Aplikováno v `scripts/simulate-up-to.mjs → rankGroup()`. Scraper bere reálné pořadí přímo z `ostravskehry.cz/florbal/table/`.

## ⏰ Auto-stop po turnaji

Scraper má hard cutoff `TOURNAMENT_END = 2026-05-26T00:00:00Z` v `scripts/scrape.mjs`. Po tom datu cron pořád běží každých 15 min, ale jen:

- Zapíše `data/meta.json` se statusem `tournament_ended`.
- Skončí s exit code 0 (žádné failure notifikace).
- **NEpřepíše** `matches.json` ani `table.json` — finální data zůstávají.

Frontend pak v hlavičce zobrazí "Turnaj skončil. Data jsou finální z ...".

Důvod: ostravskehry.cz později stránku turnaje přepíše novým turnajem, a bez cutoffu by scraper začal commitovat cizí data.

## 🎯 Design rozhodnutí

- **Žádný framework** — projekt má 3 dny životnosti (turnaj 22.–24. 5. 2026), zbytečná složitost.
- **Žádný build step** — soubory se servírují přímo, GitHub Pages je beze změny.
- **Sdílený parser Node ↔ browser** přes plain DOM API (`linkedom` v Node, `DOMParser` v browseru). Stejný kód, stejné testy.
- **Statická kostra pavouka** v `lib/bracket.js` (časy, haly, struktura). Reálná data overlay přes `resolvePlaceholder` (rekurzivní placeholder resolution).
- **Sekvenční CORS proxy failover** místo paralelního — šetří proxy služby a respektuje rate limity.
- **Cache-buster `?t=${Date.now()}`** na všech JSON fetch — obchází 10min GH Pages CDN cache.

Podrobnosti v [`docs/superpowers/specs/`](docs/superpowers/specs/) a [`docs/superpowers/plans/`](docs/superpowers/plans/).

## 🎨 UI/UX & Accessibility

### Accessibility (WCAG 2.1 AA)
- **Skip-to-content link** — klávesový shortcut pro keyboard users
- **:focus-visible styling** — viditelný outline pro všechny interactive elementy (2px orange)
- **Aria-labels** — všechny buttony a selecty mají `aria-label`
- **ARIA live regions** — toast notifikace jsou oznamovány screen readerům (`aria-live="polite"`)
- **Semantic HTML** — správné použití `<header>`, `<main>`, `<section>`, `<nav>`
- **Color contrast** — text má dostatečný kontrast (WCAG AA minimum)

### Mobile Responsiveness
- **Adaptive heights** — 60vh na desktop, 50vh na tablet, 40vh na mobil
- **Touch targets** — min 44–48px (WCAG guidelines)
- **Flexible layout** — `flex-wrap`, `flex-direction: column` na mobilu
- **Responsive tables** — menší padding, menší font na mobilu
- **Touch-friendly buttons** — lepší padding a spacing

### Visual Improvements
- **Hover effects** — match cards se zvednout (`translateY(-1px)`) s shadow na hover
- **Loading skeleton** — shimmer animace místo plain "Načítám…"
- **Transition animations** — smooth 0.2s transitions na barvy a transformace
- **Focus states** — jasné visual feedback pro keyboard navigation
- **Error messages** — specifičtější chybové hlášky (timeout vs network vs parse error)

### Performance (Preconnect)
- **CDN preconnect** — `<link rel="preconnect" href="https://cdn.jsdelivr.net">`
- **DNS prefetch** — externích API (counterapi.dev, api.github.com)
- **Faster page load** — redukuje latenci na první connect

## 🛡️ Robustnost & Optimalizace

### Frontend (app.js)
- **Retry logika v `loadJson()`** — až 2 retry s exponenciálním backoff (300ms, 600ms)
- **AbortSignal timeout** — každý JSON fetch má max 8 sekund
- **Graceful degradation** — pokud data nejsou dostupná, render se přizpůsobí (fallback na prázdné objekty)
- **Rate limiting visitor counter** — cache výsledku na 5 minut v localStorage, šetří API volání
- **Vylepšené error messages** — rozlišení mezi network error, parse error, timeout

### Backend (CI/CD)
- **Zdravotnost testů v workflow** — 44 unit testů běží před każý scrape
- **JSON validace** — `jq .` control pro vygenerované JSON soubory (tabulka, zápasy, meta, demo)
- **Integritu dat (SHA256)** — scraper porovnává hash, commituje jen pokud se data změní
- **Fallback retry** — scraper se pokouší 3× s exponenciálním backoff
- **Demo regenerace** — automaticky po scrape, s vlastní healthcheck
- **Graceful completion** — i když mají scraper selhane, JSON zůstávají v konzistentním stavu

### CSS/Performance
- **Specificity bez !important** — vyšší specificity selektoru místo !important flags
- **Scrollbar optimalizace** — vlastní CSS scrollbar, stabilní gutter width
- **Touch-action optimalizace** — SVG pan-zoom je optimalizován pro mobilní gesture

## 📝 Disclaimer

**Neoficiální fanouškovská stránka.** Žádný oficiální vztah ke klubu FBC Tigers Poruba ani k organizátorovi turnaje Ostravské hry. Vytvořeno rodiči a fanoušky pro lepší přehled o zápasech.

Oficiální klub: <https://fbctigersporuba.cz/>
Oficiální zdroj výsledků: <https://ostravskehry.cz/>

## 🔍 Troubleshooting

### Frontend / stránka se neotvírá
- **"Data nelze načíst: timeout"** → Čekej 30 sekund, CORS proxy nebo ostravskehry.cz je pomalá. Refresh automaticky zkusí 2× s backoff.
- **Prázdná tabulka / žádné zápasy** → Demo mode? Zkontroluj, že je vybraný "Live (skutečná data)" v selectu.
- **Visitor counter ukazuje "—"** → counterapi.dev je dnes offline. Není kritické, jen cosmetics.
- **SVG pavouk se nezobrazuje** → Mermaid CDN je pomalá. Zkontroluj DevTools (F12 → Network). Příp. refresh.

### Local development
- **pnpm install selže** → `npm install -g pnpm@9` (nebo aktualizuj)
- **Testy selhávají** → `pnpm test` by měl dát 44/44 ✓. Pokud ne, zkontroluj Node verzi: `node -v` (musí být ≥22)
- **Scraper selhává** → `node scripts/scrape.mjs` přímo. Pokud je chyba parse, zkontroluj HTML strukturu na ostravskehry.cz (mohou změní HTML třídy)

### CI/CD Pipeline
- **Workflow "Scrape" selhává** → Zkontroluj GitHub Actions logs. Obvyklé příčiny:
  - Network error (ostravskehry.cz je dole)
  - Parse error (architektura HTML se změnila)
  - Timeout v network fetch (zvětši `TIMEOUT_MS`)
- **Demo regenerace neběží** → Job je v `needs: scrape`, takže musí scrape uspět nejdřív
- **Git push selhává** → Zkontroluj GitHub token (Settings → Actions → General → Workflow permissions)

## 📄 Licence

Žádná. Pro osobní použití. Logo a značka FBC Tigers Poruba patří klubu.
