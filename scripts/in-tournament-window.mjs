// Rozhoduje, zda "teď" leží v turnajovém okně odvozeném z data/matches.json.
//
// Okno = (nejranější zápas - 30 min)  ..  (nejpozdější zápas + 90 min).
// Buffer -30 min pokrývá scrape těsně před výkopem; +90 min pokrývá prodloužení
// a jeden scrape po posledním zápase pro zachycení finálního skóre.
//
// CLI použití (z GitHub Actions):
//   node scripts/in-tournament-window.mjs
// Skript zapisuje `proceed=true|false` do $GITHUB_OUTPUT (pokud je proměnná
// nastavena) a vždy končí exit code 0.

import { readFile } from 'node:fs/promises';
import { appendFile } from 'node:fs/promises';

const WINDOW_BEFORE_MIN = 30;
const WINDOW_AFTER_MIN = 90;

// Match časy v matches.json jsou lokální čas Europe/Prague.
// V květnu (DST) = UTC+2. Hardcoded protože turnaj se hraje v DST období;
// pokud by se v budoucnu konal v zimě, zde upravit nebo použít proper TZ knihovnu.
const PRAGUE_OFFSET_HOURS_DST = 2;

function localPragueToUtc(dateStr, timeStr) {
  // dateStr "2026-05-22", timeStr "09:00"
  if (!dateStr || !timeStr) return null;
  const dm = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const tm = timeStr.match(/^(\d{1,2}):(\d{2})$/);
  if (!dm || !tm) return null;
  // Vytvoř Date jako kdyby to bylo UTC, pak odečti DST offset.
  const utcMillis = Date.UTC(
    parseInt(dm[1], 10),
    parseInt(dm[2], 10) - 1,
    parseInt(dm[3], 10),
    parseInt(tm[1], 10) - PRAGUE_OFFSET_HOURS_DST,
    parseInt(tm[2], 10)
  );
  return new Date(utcMillis);
}

export function isInTournamentWindow(matchesJson, now) {
  const dates = (matchesJson?.matches || [])
    .map(m => localPragueToUtc(m.date, m.time))
    .filter(d => d !== null);
  if (dates.length === 0) return false;
  const first = new Date(Math.min(...dates.map(d => d.getTime())));
  const last  = new Date(Math.max(...dates.map(d => d.getTime())));
  const windowStart = new Date(first.getTime() - WINDOW_BEFORE_MIN * 60_000);
  const windowEnd   = new Date(last.getTime()  + WINDOW_AFTER_MIN  * 60_000);
  return now >= windowStart && now <= windowEnd;
}

// CLI runner — spustí se jen když je modul invocated jako entry point.
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
