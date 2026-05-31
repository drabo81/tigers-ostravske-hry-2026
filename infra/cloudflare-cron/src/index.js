// Cloudflare Worker — třetí spouštěč scrape workflow.
//
// Každých 5 minut:
//   1. Stáhne data/<source>/<category>/matches.json z GitHub raw pro VŠECHNY
//      zdroje × kategorie.
//   2. Spočítá turnajové okno (lib/tournament-window.js) pro každý pár.
//   3. Pokud je "teď" v okně u JAKÉHOKOLI zdroje/kategorie, POSTne workflow_dispatch
//      na scrape.yml s inputs.cf_cron=true.
//
// Důvod existence: GitHub Actions cron je nespolehlivý (free plan občas
// přeskakuje runs). Cloudflare Workers Cron Trigger má sub-minutovou
// přesnost a je free.

import { isInTournamentWindow } from '../../../lib/tournament-window.js';
import { SOURCES } from '../../../sources/registry.js';

const REPO_OWNER = 'drabo81';
const REPO_NAME = 'tigers-ostravske-hry-2026';
const WORKFLOW_FILE = 'scrape.yml';
const RAW_BASE = `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/main`;
const DISPATCH_URL = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/actions/workflows/${WORKFLOW_FILE}/dispatches`;

export async function handleScheduled(env, now = new Date(), fetcher = fetch) {
  // 1) Fetch matches.json for each source × category; proceed if ANY in window.
  let anyInWindow = false;
  let allFailed = true;
  const windowResults = [];

  for (const source of SOURCES) {
    for (const category of source.categories) {
      const url = `${RAW_BASE}/data/${source.id}/${category.id}/matches.json`;
      const r = await fetcher(url, { headers: { 'User-Agent': 'cf-cron-trigger' } });
      if (!r.ok) {
        windowResults.push({ source: source.id, category: category.id, reason: `HTTP ${r.status}` });
        continue;
      }
      allFailed = false;
      const matches = await r.json();
      const inWindow = isInTournamentWindow(matches, now);
      windowResults.push({ source: source.id, category: category.id, inWindow });
      if (inWindow) anyInWindow = true;
    }
  }

  // If every fetch failed, report the first failure reason.
  if (allFailed) {
    const first = windowResults[0];
    return { dispatched: false, reason: `matches.json HTTP ${first?.reason ?? 'unknown'}` };
  }

  // 2) Window check — dispatch only if at least one source is in window.
  if (!anyInWindow) {
    return { dispatched: false, reason: 'outside tournament window' };
  }

  // 3) dispatch
  if (!env.GH_DISPATCH_PAT) {
    return { dispatched: false, reason: 'GH_DISPATCH_PAT secret missing' };
  }
  const resp = await fetcher(DISPATCH_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.GH_DISPATCH_PAT}`,
      'Accept': 'application/vnd.github+json',
      'User-Agent': 'cf-cron-trigger',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify({
      ref: 'main',
      inputs: { cf_cron: 'true' },
    }),
  });

  if (resp.status === 204) {
    return { dispatched: true, reason: 'ok' };
  }
  const errText = await resp.text();
  return { dispatched: false, reason: `dispatch HTTP ${resp.status}: ${errText.slice(0, 200)}` };
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(
      handleScheduled(env).then(result => {
        console.log(JSON.stringify({ event: 'cf_cron_tick', ...result }));
      })
    );
  },
};
