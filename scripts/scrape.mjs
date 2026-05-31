import { writeFile, readFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { parseHTML } from 'linkedom';
import { SOURCES } from '../sources/registry.js';

const USER_AGENT = 'tournament-viewer (https://github.com/drabo81/tigers-ostravske-hry-2026)';
const RETRIES = 3;
const TIMEOUT_MS = 15_000;

export function isActive(src, now = new Date()) {
  return now >= new Date(src.activeFrom) && now < new Date(src.activeTo);
}

export function applyGroupFilter(table, groupFilter) {
  if (groupFilter === 'all' || !Array.isArray(groupFilter)) return table;
  const groups = {};
  for (const key of groupFilter) if (table.groups?.[key]) groups[key] = table.groups[key];
  return { ...table, groups };
}

function filterMatches(matchesData, groupFilter) {
  if (groupFilter === 'all' || !Array.isArray(groupFilter)) return matchesData;
  const set = new Set(groupFilter);
  const matches = matchesData.matches.filter(m => m.group == null || set.has(m.group));
  return { ...matchesData, matches };
}

async function fetchWithRetry(url) {
  let lastErr;
  for (let attempt = 1; attempt <= RETRIES; attempt++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (!r.ok) throw new Error(`HTTP ${r.status} ${r.statusText}`);
      return await r.text();
    } catch (e) {
      lastErr = e;
      if (attempt < RETRIES) await new Promise(res => setTimeout(res, 500 * 2 ** (attempt - 1)));
    }
  }
  throw lastErr;
}

// URL-dedup cache v rámci jednoho běhu.
function makeFetcher() {
  const cache = new Map();
  return (url) => {
    if (!cache.has(url)) cache.set(url, fetchWithRetry(url));
    return cache.get(url);
  };
}

async function writeMeta(dir, sourceId, categoryId, status) {
  const nowIso = new Date().toISOString();
  const path = `${dir}/meta.json`;
  const meta = { last_success_at: null, last_attempt_at: nowIso, last_attempt_status: status,
                 source: sourceId, category: categoryId };
  if (existsSync(path)) {
    try { meta.last_success_at = JSON.parse(await readFile(path, 'utf8')).last_success_at ?? null; } catch {}
  }
  if (status === 'ok') meta.last_success_at = nowIso;
  await writeFile(path, JSON.stringify(meta, null, 2));
}

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
    console.error(`[${source.id}/${category.id}] network_error:`, e.message);
    await writeMeta(dir, source.id, category.id, 'network_error');
    return false;
  }
  try {
    const table = applyGroupFilter(def.parseTable(parseHTML(tableHtml).document), category.groupFilter);
    const matches = filterMatches(def.parseMatches(parseHTML(matchesHtml).document), category.groupFilter);
    if (!table.groups || Object.keys(table.groups).length === 0) throw new Error('no groups');
    if (!matches.matches?.length) throw new Error('no matches');
    const nowIso = new Date().toISOString();
    await writeFile(`${dir}/table.json`, JSON.stringify({ scraped_at: nowIso, ...table }, null, 2));
    await writeFile(`${dir}/matches.json`, JSON.stringify({ category: category.id, scraped_at: nowIso, ...matches }, null, 2));
    await writeMeta(dir, source.id, category.id, 'ok');
    console.log(`[${source.id}/${category.id}] ok`);
    return true;
  } catch (e) {
    console.error(`[${source.id}/${category.id}] parse_error:`, e.message);
    await writeMeta(dir, source.id, category.id, 'parse_error');
    return false;
  }
}

async function main() {
  const now = new Date();
  let anyFailed = false;
  for (const source of SOURCES) {
    if (!isActive(source, now)) { console.log(`[${source.id}] inactive, skip`); continue; }
    const def = (await source.load()).default;
    const fetcher = makeFetcher();
    for (const category of def.categories) {
      const ok = await scrapeCategory(fetcher, def, source, category);
      if (!ok) anyFailed = true;
    }
  }
  if (anyFailed) process.exit(1);
}

// Spusť main jen když je soubor vstupní bod (ne při importu v testu).
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('scrape.mjs')) {
  main().catch(e => { console.error('unexpected:', e); process.exit(1); });
}
