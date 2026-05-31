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
