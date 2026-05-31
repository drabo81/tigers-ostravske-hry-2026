// CLI wrapper kolem lib/tournament-window.js.
// Použití (z GitHub Actions):
//   node scripts/in-tournament-window.mjs
// Skript zapisuje `proceed=true|false` do $GITHUB_OUTPUT (pokud je proměnná
// nastavena) a vždy končí exit code 0.
// Prochází VŠECHNY zdroje × kategorie; proceed=true pokud JE KDEKOLI v okně.

import { readFile, appendFile } from 'node:fs/promises';
import { isInTournamentWindow } from '../lib/tournament-window.js';
import { SOURCES } from '../sources/registry.js';

// Re-export pro zpětnou kompatibilitu s existujícími testy.
export { isInTournamentWindow } from '../lib/tournament-window.js';

const isMain = import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}` ||
               import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'));
if (isMain) {
  const now = new Date();
  let proceed = false;

  for (const source of SOURCES) {
    for (const category of source.categories) {
      const filePath = new URL(
        `../data/${source.id}/${category.id}/matches.json`,
        import.meta.url
      );
      try {
        const raw = await readFile(filePath, 'utf8');
        const data = JSON.parse(raw);
        const inWindow = isInTournamentWindow(data, now);
        console.log(`source=${source.id} category=${category.id} inWindow=${inWindow}`);
        if (inWindow) proceed = true;
      } catch {
        console.log(`source=${source.id} category=${category.id} skipped (file missing or unreadable)`);
      }
    }
  }

  console.log(`now=${now.toISOString()} proceed=${proceed}`);
  if (process.env.GITHUB_OUTPUT) {
    await appendFile(process.env.GITHUB_OUTPUT, `proceed=${proceed}\n`);
  }
}
