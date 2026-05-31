import { parseTable, parseMatches } from './parser.js';
import { renderBracket } from './bracket.js';

export default {
  id: 'tigers-ostravske-2026',
  label: 'Tigers — Ostravské hry 2026',
  sport: 'florbal',
  activeFrom: '2026-05-22T00:00:00Z',
  activeTo:   '2026-05-26T00:00:00Z',

  parseTable,
  parseMatches,

  categories: [
    {
      id: 'BU13',
      label: 'B13 5+1 (skupina MH)',
      fetchTargets: {
        table:   'https://ostravskehry.cz/florbal/table/',
        matches: 'https://ostravskehry.cz/florbal/matches/?category=24',
      },
      groupFilter: 'all',
      defaultFocusTeam: 'FBC Tigers Poruba',
      defaultGroup: 'MH',
      renderBracket,
    },
  ],
};
