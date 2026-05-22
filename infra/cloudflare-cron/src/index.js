// Cloudflare Worker — třetí spouštěč scrape workflow.
//
// Každých 5 minut:
//   1. Stáhne data/matches.json z GitHub raw.
//   2. Spočítá turnajové okno (lib/tournament-window.js).
//   3. Pokud je "teď" v okně, POSTne workflow_dispatch na scrape.yml
//      s inputs.cf_cron=true.
//
// Důvod existence: GitHub Actions cron je nespolehlivý (free plan občas
// přeskakuje runs). Cloudflare Workers Cron Trigger má sub-minutovou
// přesnost a je free.

import { isInTournamentWindow } from '../../../lib/tournament-window.js';

const REPO_OWNER = 'drabo81';
const REPO_NAME = 'tigers-ostravske-hry-2026';
const WORKFLOW_FILE = 'scrape.yml';
const MATCHES_URL = `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/main/data/matches.json`;
const DISPATCH_URL = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/actions/workflows/${WORKFLOW_FILE}/dispatches`;

export async function handleScheduled(env, now = new Date(), fetcher = fetch) {
  // 1) matches.json
  const r = await fetcher(MATCHES_URL, { headers: { 'User-Agent': 'cf-cron-trigger' } });
  if (!r.ok) {
    return { dispatched: false, reason: `matches.json HTTP ${r.status}` };
  }
  const matches = await r.json();

  // 2) window check
  if (!isInTournamentWindow(matches, now)) {
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
