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
2. Napiš `parser.js` (`parseTable`, `parseMatches`) proti HTML fixtuře.
3. Volitelně `bracket.js` s `renderBracket(matches, table, focusTeam)` vracející Mermaid string.
4. Zaregistruj zdroj v `sources/registry.js` (lehká metadata + `load`).
5. Nastav `activeFrom`/`activeTo` (mimo okno cron nescrapuje).

Data layout: `data/<source-id>/<category-id>/{table,matches,meta}.json`.
Pavouk je volitelný — bez `renderBracket` se sekce skryje.
