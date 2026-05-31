import { writeFile, readFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { parseHTML } from 'linkedom';
import { SOURCES } from '../sources/registry.js';

const USER_AGENT = 'tigers-playoff-viewer (https://github.com/drabo81/tigers-playoff-viewer)';
const RETRIES = 3;
const TIMEOUT_MS = 15_000;

// ---------------------------------------------------------------------------
// Pure filter helpers (exported for tests)
// ---------------------------------------------------------------------------

export function applyGroupFilter(table, groupFilter) {
  if (groupFilter === 'all' || !Array.isArray(groupFilter)) return table;
  const groups = {};
  for (const key of groupFilter) if (table.groups?.[key]) groups[key] = table.groups[key];
  return { ...table, groups };
}

export function filterMatches(matchesData, groupFilter) {
  if (groupFilter === 'all' || !Array.isArray(groupFilter)) return matchesData;
  const set = new Set(groupFilter);
  // group-less zápasy (playoff) ponecháváme; pro výčtový groupFilter je to známé omezení.
  return { ...matchesData, matches: matchesData.matches.filter(m => m.group == null || set.has(m.group)) };
}

// ---------------------------------------------------------------------------
// Network
// ---------------------------------------------------------------------------

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

// Per-run URL-dedup Map cache: each scrapeCategory call shares a fetcher so
// identical URLs (two categories on same page) are fetched only once.
function makeFetcher() {
  const cache = new Map();
  return async function fetch_cached(url) {
    if (cache.has(url)) return cache.get(url);
    const p = fetchWithRetry(url);
    cache.set(url, p);
    return p;
  };
}

// ---------------------------------------------------------------------------
// File helpers — anti-commit-spam
// ---------------------------------------------------------------------------

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

// Per-dir writeMeta — anti-spam: při úspěchu bez změny dat a předchozím ok
// stavu nepřepisujeme meta.json (vyhneme se commit-spamu kvůli pouhému
// timestamp updatu). Přepisujeme vždy, když: status není ok, data se změnila,
// nebo předchozí pokus selhal.
async function writeMeta(dir, sourceId, categoryId, status, dataChanged = false) {
  const metaPath = `${dir}/meta.json`;
  let prev = null;
  if (existsSync(metaPath)) {
    try {
      prev = JSON.parse(await readFile(metaPath, 'utf8'));
    } catch {
      // poškozený předchozí meta — začneme čistě
    }
  }

  if (status === 'ok' && !dataChanged && prev?.last_attempt_status === 'ok') {
    console.log(`meta [${sourceId}/${categoryId}]: unchanged (no data change, status still ok)`);
    return;
  }

  const nowIso = new Date().toISOString();
  const meta = {
    last_success_at: status === 'ok' ? nowIso : (prev?.last_success_at ?? null),
    last_attempt_at: nowIso,
    last_attempt_status: status,
    source: sourceId,
    category: categoryId,
  };
  await writeFile(metaPath, JSON.stringify(meta, null, 2));
  console.log(`meta [${sourceId}/${categoryId}]: ${status} (last_success_at=${meta.last_success_at})`);
}

// ---------------------------------------------------------------------------
// Per-category scrape
// ---------------------------------------------------------------------------

async function scrapeCategory(fetcher, def, source, category) {
  const dir = `data/${source.id}/${category.id}`;
  await mkdir(dir, { recursive: true });

  let tableHtml, matchesHtml;
  try {
    [tableHtml, matchesHtml] = await Promise.all([
      fetcher(category.fetchTargets.table),
      fetcher(category.fetchTargets.matches),
    ]);
  } catch (e) {
    console.error(`network_error [${source.id}/${category.id}]:`, e.message);
    await writeMeta(dir, source.id, category.id, 'network_error', false);
    return false;
  }

  let table, matches;
  try {
    table = def.parseTable(parseHTML(tableHtml).document);
    matches = def.parseMatches(parseHTML(matchesHtml).document);
    table = applyGroupFilter(table, category.groupFilter);
    matches = filterMatches(matches, category.groupFilter);
    if (!Object.keys(table.groups ?? {}).length) throw new Error('parser returned no groups');
    if (!matches.matches?.length) throw new Error('parser returned no matches');
  } catch (e) {
    console.error(`parse_error [${source.id}/${category.id}]:`, e.message);
    await writeMeta(dir, source.id, category.id, 'parse_error', false);
    return false;
  }

  const nowIso = new Date().toISOString();
  const tableChanged = await writeIfDataChanged(
    `${dir}/table.json`,
    { scraped_at: nowIso, ...table },
  );
  const matchesChanged = await writeIfDataChanged(
    `${dir}/matches.json`,
    { category: category.id, scraped_at: nowIso, ...matches },
  );
  await writeMeta(dir, source.id, category.id, 'ok', tableChanged || matchesChanged);
  return true;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  let anyFailed = false;
  for (const source of SOURCES) {
    const def = (await source.load()).default;
    const fetcher = makeFetcher();
    for (const category of def.categories) {
      const ok = await scrapeCategory(fetcher, def, source, category);
      if (!ok) anyFailed = true;
    }
  }
  if (anyFailed) process.exit(1);
}

// Entry guard: importing this module in tests must NOT trigger main() or any
// network calls.
if (
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith('scrape.mjs')
) {
  main().catch(e => {
    console.error('unexpected:', e);
    process.exit(1);
  });
}
