# Tournament Viewer

Live viewer florbalových (a jiných) turnajů — tabulka, zápasy, pavouk play-off (s přepínačem pavouk/seznam), auto-refresh během turnaje. Statická stránka (GitHub Pages), data scrapuje GitHub Actions cron (+ Cloudflare Worker trigger v okně turnaje).

## Vývoj

- `pnpm test` — testy (`node:test`).
- `pnpm scrape` — scrapuje všechny zdroje do `data/<source>/<category>/`.
- `pnpm serve:local` (nebo `npx serve .`) + otevři `index.html` (statický server kvůli fetch JSON).
- `node scripts/generate-demos.mjs` — přegeneruje demo scénáře.

## Přidání nového zdroje (turnaje)

1. Vytvoř `sources/<id>/` s `index.js` (default export `SourceDefinition` — viz `sources/_contract.md`).
2. `parser.js`: `parseTable(doc)` / `parseMatches(doc)` proti HTML zdroje (testuj proti fixtuře).
3. Volitelně `bracket.js`: modul s `renderStaticBracket`/`renderPhaseList`/`focusPath`/`matchCardHtml`/`resolvePlaceholder`/`isPlaceholderCell` (každá bere nepovinný `focusTeam`).
4. Zaregistruj v `sources/registry.js` (lehká metadata + `load`).
5. Demo scénáře: `sources/<id>/demos/<category>/` (`_base/` + generátor).

Data layout: `data/<source-id>/<category-id>/{table,matches,meta}.json`.
Sdílené utility: `lib/shared.js` (normalize/escape/fmt), `lib/tournament-window.js` (okno turnaje), `lib/poll.js`, `lib/proxy.js`.
Okno turnaje (cron gating) agreguje napříč zdroji — scrape běží, je-li aspoň jeden zdroj v okně.
