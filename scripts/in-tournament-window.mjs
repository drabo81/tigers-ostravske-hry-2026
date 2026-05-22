// CLI wrapper kolem lib/tournament-window.js.
// Použití (z GitHub Actions):
//   node scripts/in-tournament-window.mjs
// Skript zapisuje `proceed=true|false` do $GITHUB_OUTPUT (pokud je proměnná
// nastavena) a vždy končí exit code 0.

import { readFile, appendFile } from 'node:fs/promises';
import { isInTournamentWindow } from '../lib/tournament-window.js';

// Re-export pro zpětnou kompatibilitu s existujícími testy.
export { isInTournamentWindow } from '../lib/tournament-window.js';

const isMain = import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}` ||
               import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'));
if (isMain) {
  const path = new URL('../data/matches.json', import.meta.url);
  const raw = await readFile(path, 'utf8');
  const data = JSON.parse(raw);
  const now = new Date();
  const inWindow = isInTournamentWindow(data, now);
  console.log(`now=${now.toISOString()} inWindow=${inWindow}`);
  if (process.env.GITHUB_OUTPUT) {
    await appendFile(process.env.GITHUB_OUTPUT, `proceed=${inWindow}\n`);
  }
}
