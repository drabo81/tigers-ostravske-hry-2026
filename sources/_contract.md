# Kontrakt zdroje (SourceDefinition)

Každý zdroj je složka `sources/<id>/` s `index.js`, jehož **default export** je `SourceDefinition`.

## Tvar

```js
export default {
  id, label, sport,                    // metadata
  activeFrom, activeTo,                // ISO; mimo okno cron nescrapuje
  parseTable(doc), parseMatches(doc),  // čisté funkce nad DOM (Node linkedom i browser DOMParser)
  categories: [ {
    id, label,
    fetchTargets: { table, matches },  // URL
    groupFilter,                       // 'all' | [groupCode, …]
    defaultFocusTeam,                  // null = bez focusu
    defaultGroup,                      // null = první skupina
    renderBracket(matches, table, focusTeam),  // volitelné → Mermaid string; chybí = bez pavouka
  } ],
};
```

### `groupFilter` — známé omezení

`'all'` (1 URL = 1 kategorie) je plně funkční. Pole skupin (`['B13A', …]`, kdy 1 stránka
servíruje více kategorií, např. opengame) zatím filtruje jen skupinové zápasy; **playoff
zápasy bez skupiny (`group: null`) se ponechávají všechny**. Doladit při psaní prvního
takového pluginu (viz `scripts/scrape.mjs` `filterMatches`).

## Datový model (návratové hodnoty parseru)

- `parseTable(doc)` → `{ groups: { '<groupCode>': [ { rank, team, scored, conceded, points } ] } }`
- `parseMatches(doc)` → `{ matches: [ { id, date, time, group, phase, venue, home, away, score } ] }`
  - `date`: `YYYY-MM-DD`, `time`: `HH:MM`, `score`: `{ home, away, status } | null`, `phase`: `'group'` nebo turnaj-specifické.

## Pavouk (`renderBracket`)

Volitelná funkce vracející **Mermaid `flowchart` string**. Chybí-li, jádro sekci pavouka skryje.
Tigers referenční implementace: `sources/tigers-ostravske-2026/bracket.js` (renderuje vlastní Mermaid se subgrafy a zvýrazněnou cestou focus týmu).

Pro jednoduché brackety lze využít sdílené utility z `lib/bracket-engine.js`:
- `resolveCode(code, table, positionGroups)` — pozice (např. „H1") → jméno týmu z tabulky.
- `highlightPath(model, focusTeam)` + `renderMermaid(model)` — nad jednoduchým IR `{ nodes, edges }` (viz `lib/bracket-engine.js`). Tigers je nepoužívá (má vlastní render).
