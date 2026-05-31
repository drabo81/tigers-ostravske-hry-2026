// Lehká metadata (čtena bez nahrání pluginu) + lazy loader.
// Přidání zdroje: nová složka sources/<id>/ + záznam zde.
export const SOURCES = [
  {
    id: 'ostravske-hry-2026',
    label: 'Ostravské hry 2026',
    categories: [
      { id: 'B13', label: 'B13 5+1', defaultGroup: 'MH', defaultFocusTeam: 'FBC Tigers Poruba' },
    ],
    load: () => import('./ostravske-hry-2026/index.js'),
  },
];
