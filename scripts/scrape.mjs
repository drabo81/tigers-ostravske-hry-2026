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

// Porovnává obsah ignorováním pole `scraped_at` — když se herní data nezmění,
// scrape pak nepřepíše soubor jen kvůli novému timestampu (jinak by každý běh
// generoval commit-spam s diffem jediného řádku).
async function writeIfDataChanged(path, newObj) {
  if (existsSync(path)) {
    try {
      const existing = JSON.parse(await readFile(path, 'utf8'));
      const { scraped_at: _a, ...existingRest } = existing;
      const { scraped_at: _b, ...newRest } = newObj;
      if (sha256(JSON.stringify(existingRest)) === sha256(JSON.stringify(newRest))) {
        console.log(`unchanged (data identical): ${path}`);
        return false;
      }
    } catch {
      // poškozený předchozí JSON — přepiš
    }
  }
  await writeFile(path, JSON.stringify(newObj, null, 2));
  console.log(`written: ${path}`);
  return true;
}

async function writeMeta(status, dataChanged = false) {
  let prev = null;
  if (existsSync('data/meta.json')) {
    try {
      prev = JSON.parse(await readFile('data/meta.json', 'utf8'));
    } catch {
      // poškozený předchozí meta — začneme čistě
    }
  }

  // Optimalizace: při úspěchu bez změny dat a předchozím ok stavu nepřepisujeme
  // meta.json — vyhneme se commit-spamu kvůli pouhému timestamp updatu.
  // Přepisujeme vždy, když: status není ok (změna stavu klient potřebuje vidět),
  // data se změnila (sjednotit čas), nebo předchozí pokus selhal (reset na ok).
  if (status === 'ok' && !dataChanged && prev?.last_attempt_status === 'ok') {
    console.log('meta: unchanged (no data change, status still ok)');
    return;
  }

  const nowIso = new Date().toISOString();
  const meta = {
    last_success_at: prev?.last_success_at ?? null,
    last_attempt_at: nowIso,
    last_attempt_status: status,
    source: 'ostravskehry.cz',
  };
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
  const tableChanged = await writeIfDataChanged(
    'data/table.json',
    { scraped_at: nowIso, ...tableData },
  );
  const matchesChanged = await writeIfDataChanged(
    'data/matches.json',
    { category: 24, scraped_at: nowIso, ...matchesData },
  );
  await writeMeta('ok', tableChanged || matchesChanged);
}

main().catch(e => {
  console.error('unexpected error:', e);
  process.exit(1);
});
