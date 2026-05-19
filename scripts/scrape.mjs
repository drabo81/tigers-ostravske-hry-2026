import { writeFile, readFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { parseHTML } from 'linkedom';
import { parseTable, parseMatches } from '../lib/parser.js';

const URLS = {
  table:   'https://ostravskehry.cz/florbal/table/',
  matches: 'https://ostravskehry.cz/florbal/matches/?category=24',
};

const USER_AGENT = 'tigers-playoff-viewer (https://github.com/drabo81/tigers-playoff-viewer)';
const RETRIES = 3;
const TIMEOUT_MS = 15_000;

async function fetchWithRetry(url) {
  let lastErr;
  for (let attempt = 1; attempt <= RETRIES; attempt++) {
    try {
      const r = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status} ${r.statusText}`);
      return await r.text();
    } catch (e) {
      lastErr = e;
      if (attempt < RETRIES) {
        await new Promise(res => setTimeout(res, 500 * 2 ** (attempt - 1)));
      }
    }
  }
  throw lastErr;
}

function sha256(s) {
  return createHash('sha256').update(s).digest('hex');
}

async function writeIfChanged(path, contentString) {
  if (existsSync(path)) {
    const existing = await readFile(path, 'utf8');
    if (sha256(existing) === sha256(contentString)) {
      console.log(`unchanged: ${path}`);
      return false;
    }
  }
  await writeFile(path, contentString);
  console.log(`written: ${path}`);
  return true;
}

async function writeMeta(status) {
  const nowIso = new Date().toISOString();
  const meta = {
    last_success_at: null,
    last_attempt_at: nowIso,
    last_attempt_status: status,
    source: 'ostravskehry.cz',
  };
  if (existsSync('data/meta.json')) {
    try {
      const prev = JSON.parse(await readFile('data/meta.json', 'utf8'));
      meta.last_success_at = prev.last_success_at ?? null;
    } catch {
      // ignoruj poškozený předchozí meta — začneme čistě
    }
  }
  if (status === 'ok') meta.last_success_at = nowIso;
  await writeFile('data/meta.json', JSON.stringify(meta, null, 2));
  console.log(`meta: ${status} (last_success_at=${meta.last_success_at})`);
}

// Po skončení turnaje (24.5. 2026 + buffer) přestaneme scrapovat —
// ostravskehry.cz později nahradí stránku jiným turnajem a my nechceme do repa
// dostat cizí data. Cron pořád běží (každých 15 min), ale jen zapíše meta status
// a skončí 0 (ať Action neselže a nedělá spam notifikace).
const TOURNAMENT_END = new Date('2026-05-26T00:00:00Z');

async function main() {
  await mkdir('data', { recursive: true });

  if (new Date() >= TOURNAMENT_END) {
    console.log(`Tournament ended (${TOURNAMENT_END.toISOString()}); scraper disabled.`);
    await writeMeta('tournament_ended');
    return;
  }

  let tableHtml, matchesHtml;
  try {
    [tableHtml, matchesHtml] = await Promise.all([
      fetchWithRetry(URLS.table),
      fetchWithRetry(URLS.matches),
    ]);
  } catch (e) {
    console.error('network_error:', e.message);
    await writeMeta('network_error');
    process.exit(1);
  }

  let tableData, matchesData;
  try {
    tableData = parseTable(parseHTML(tableHtml).document);
    matchesData = parseMatches(parseHTML(matchesHtml).document);
    if (!tableData.groups?.MH) throw new Error('parser returned no MH group');
    if (!matchesData.matches?.length) throw new Error('parser returned no matches');
  } catch (e) {
    console.error('parse_error:', e.message);
    await writeMeta('parse_error');
    process.exit(1);
  }

  const nowIso = new Date().toISOString();
  await writeIfChanged(
    'data/table.json',
    JSON.stringify({ scraped_at: nowIso, ...tableData }, null, 2),
  );
  await writeIfChanged(
    'data/matches.json',
    JSON.stringify({ category: 24, scraped_at: nowIso, ...matchesData }, null, 2),
  );
  await writeMeta('ok');
}

main().catch(e => {
  console.error('unexpected error:', e);
  process.exit(1);
});
