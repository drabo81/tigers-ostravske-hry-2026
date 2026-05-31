# Sources Contract

## SourceDefinition

A plugin provides tournament data and visualization functions via a **SourceDefinition** object exported as `default` from `sources/<id>/index.js`. The app lazily loads sources via the registry.

### Fields

- **id** (string): Unique identifier (e.g. `'ostravske-hry-2026'`)
- **label** (string): Display name (e.g. `'Ostravské hry 2026'`)
- **sport** (string): Sport code (e.g. `'florbal'`)
- **parseTable** (function): `(html) => {groups: {<code>: [{rank, team, scored, conceded, points}]}}`
- **parseMatches** (function): `(html) => {matches: [{id, date, time, group, phase, venue, home, away, score}]}`
- **categories** (array): Category entries (see below)

## Category

A tournament can have multiple categories (e.g., age groups). Each category provides fetch URLs, grouping rules, defaults, and bracket rendering.

### Fields

- **id** (string): Category identifier (e.g. `'B13'`)
- **label** (string): Display name (e.g. `'B13 5+1'`)
- **fetchTargets** (object):
  - **table** (string): URL to fetch standings table HTML
  - **matches** (string): URL to fetch matches HTML
- **groupFilter** (string | array): Either `'all'` (all groups) or array of group codes to include (e.g. `['MH', 'MD']`)
- **defaultGroup** (string): Initial selected group in UI (e.g. `'MH'`)
- **defaultFocusTeam** (string): Default focus/highlight team name (e.g. `'FBC Tigers Poruba'`); each bracket function accepts optional `focusTeam` parameter to override
- **bracket** (object): 6 rendering functions (see Bracket Module below)

## Bracket Module

The bracket module provides functions to render tournament structure, filter matches, and resolve placeholder codes to team names. Each function takes an optional `focusTeam` parameter (string, team name); if omitted, behavior defaults to highlighting the source's `defaultFocusTeam`.

### Functions

#### `renderStaticBracket(matches, table, focusTeam?)`
Returns Mermaid flowchart markdown describing the full tournament bracket structure (all group matches, all play-off phases, branches, progress paths, unplayed/played styling). Focus path is highlighted.

**Parameters:**
- `matches` (object): Parsed matches data `{matches: [...]}`
- `table` (object): Parsed table data `{groups: {...}}`
- `focusTeam` (string, optional): Team name to highlight; defaults to source `defaultFocusTeam`

**Returns:** Mermaid markdown string

#### `renderPhaseList(matches, table, focusTeam?)`
Returns HTML `<section>` with collapsible phase blocks (group, 16F-A, 8F-A, etc.), each containing match card elements. Group is always open; phases with focus team or next upcoming match default open.

**Parameters:**
- `matches` (object): Parsed matches data
- `table` (object): Parsed table data
- `focusTeam` (string, optional): Defaults to source `defaultFocusTeam`

**Returns:** HTML string

#### `focusPath(matches, table, focusTeam?)`
Returns array of match objects representing the actual/potential progression of focus team through the tournament (group matches + all branches according to results and placeholder resolution).

**Parameters:**
- `matches` (object): Parsed matches data
- `table` (object): Parsed table data
- `focusTeam` (string, optional): Defaults to source `defaultFocusTeam`

**Returns:** Array of match objects, sorted by datetime

#### `matchCardHtml(match, isTigersMatch, matches?, table?)`
Returns HTML `<div class="match-card">` for a single match, with team names, score (if played), venue, and time. Resolves placeholder codes to team names if `matches` and `table` provided.

**Parameters:**
- `match` (object): Match object `{id, date, time, group, phase, venue, home, away, score?}`
- `isTigersMatch` (boolean): Whether to highlight as focus team's match
- `matches` (object, optional): For placeholder resolution
- `table` (object, optional): For placeholder resolution

**Returns:** HTML string

#### `resolvePlaceholder(cell, matches, table)`
Recursively expands a placeholder code (e.g. `'H1'`, `'H1/D4'`, `'✖ H1/D4'`) to a team name by looking up position codes in the table and tracing wins/losses through the bracket. Returns the original cell if it's already a team name or if the placeholder cannot be resolved (e.g., match not yet played).

**Parameters:**
- `cell` (string): Placeholder code or team name
- `matches` (object): Parsed matches data
- `table` (object): Parsed table data

**Returns:** Team name (string) or original cell if unresolvable

#### `isPlaceholderCell(cell)`
Returns `true` if cell contains only placeholder codes (all tokens match pattern `[A-H]\d+`), `false` if it's a team name or mixed content.

**Parameters:**
- `cell` (string): Cell content (home or away field from match)

**Returns:** Boolean

## Parsers

### parseTable

**Signature:** `(html: string) => {groups: {[groupCode: string]: TeamRow[]}}`

**TeamRow shape:**
```
{
  rank: number,
  team: string,        // team name
  scored: number,      // goals for
  conceded: number,    // goals against
  points: number       // total points
}
```

Before tournament play, rank is alphabetically seeded. After matches are played, rank reflects actual standings.

### parseMatches

**Signature:** `(html: string) => {matches: Match[]}`

**Match shape:**
```
{
  id: string,
  date: string,        // ISO 8601 (YYYY-MM-DD)
  time: string,        // HH:MM
  group: string,       // group code (MH, MD, etc.) for group phase; null for play-off
  phase: string,       // 'group', '16F-A', '8F-B', 'SF-A', etc.
  venue: string,       // location
  home: string,        // team name or placeholder code
  away: string,        // team name or placeholder code
  score?: {
    home: number,
    away: number,
    status?: 'live'    // optional, if match is currently being played
  }
}
```

Before matches are played, `home` and `away` contain placeholder codes. After a match is played, they are replaced with team names and `score` is populated.

## Shared Utilities

Sources may use helpers from the codebase:

- **lib/shared.js**: `normalizeTeamName()` (lowercase, diacritics, spaces normalized)
- **lib/tournament-window.js**: Time window management for tournament runs
- **lib/poll.js**: Polling utility for data refresh
- **lib/proxy.js**: Server-side proxy for cross-origin fetch

## Data Layout

Tournament data cached locally in `data/<source>/<category>/`:
- **table.json**: Parsed table (groups and standings)
- **matches.json**: Parsed matches
- **meta.json**: Metadata (last fetch time, version, etc.)

## Adding a New Source

1. Create `sources/<id>/` folder with `parser.js` (parse functions) and `bracket.js` (6 bracket functions)
2. Create `sources/<id>/index.js` with SourceDefinition (import parsers, import and re-export bracket functions)
3. Add entry to `SOURCES` array in `sources/registry.js`
4. Test with registry test: `pnpm test -- registry.test.mjs`
