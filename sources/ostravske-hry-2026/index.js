import { parseTable, parseMatches } from './parser.js';
import * as bracket from './bracket.js';

export default {
  id: 'ostravske-hry-2026',
  label: 'Ostravské hry 2026',
  sport: 'florbal',
  parseTable,
  parseMatches,
  categories: [
    {
      id: 'B13',
      label: 'B13 5+1',
      fetchTargets: {
        table:   'https://ostravskehry.cz/florbal/table/',
        matches: 'https://ostravskehry.cz/florbal/matches/?category=24',
      },
      groupFilter: 'all',
      defaultGroup: 'MH',
      defaultFocusTeam: 'FBC Tigers Poruba',
      bracket: {
        renderStaticBracket: bracket.renderStaticBracket,
        renderPhaseList: bracket.renderPhaseList,
        focusPath: bracket.focusPath,
        matchCardHtml: bracket.matchCardHtml,
        resolvePlaceholder: bracket.resolvePlaceholder,
        isPlaceholderCell: bracket.isPlaceholderCell,
      },
    },
  ],
};
