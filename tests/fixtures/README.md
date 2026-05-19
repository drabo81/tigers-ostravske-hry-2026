# HTML Fixtures

Reálné HTML snapshoty z ostravskehry.cz, použité parser unit testy.

| Soubor | Zdroj | Datum stažení | Stav turnaje |
|--------|-------|---------------|--------------|
| `2026-05-19-before-tournament-table.html` | `/florbal/table/` | 2026-05-19 | Před zahájením, jen rozpis |
| `2026-05-19-before-tournament-matches.html` | `/florbal/matches/?category=24` | 2026-05-19 | Před zahájením, jen rozpis |

Po základní části a po play-off doplnit další fixtury (s výsledky).

## Poznámky ke struktuře

- Tým **FBC TIGERS PORUBA** je v HTML zapisován velkými písmeny — parser musí normalizovat (viz `normalizeTeamName` v `lib/parser.js`).
- Kategorie 24 = B13 Mladší žáci 5+1.
- Skupina MH je vzdálená sekce v `table.html`; v `matches.html` se zobrazují všechny zápasy kategorie (skupina je sloupec v každém řádku).
