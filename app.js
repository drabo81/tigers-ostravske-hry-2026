import { parseTable, parseMatches, normalizeTeamName } from './lib/parser.js';
import { tigersBracketPath, renderStaticBracket, isPlaceholderCell, matchCardHtml, renderPhaseList } from './lib/bracket.js';
import { fetchViaProxy } from './lib/proxy.js';
import { hasMetaChanged } from './lib/poll.js';
import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs';
import svgPanZoom from 'https://esm.sh/svg-pan-zoom@3.6.1';

mermaid.initialize({
  startOnLoad: false,
  theme: 'default',
  securityLevel: 'loose',
  flowchart: {
    nodeSpacing: 30,
    rankSpacing: 60,
    padding: 8,
    htmlLabels: true,
    useMaxWidth: false,
  },
  themeVariables: {
    fontSize: '14px',
  },
});

const TIGERS_FRAGMENT = 'tigers poruba';
const REFRESH_DEBOUNCE_MS = 5_000;
const POLL_INTERVAL_MS = 90_000;
// After 3 consecutive errors, back off for 5 min to spare GH Pages CDN during outages.
const POLL_MAX_ERRORS = 3;
const POLL_BACKOFF_MS = 5 * 60_000;

const $ = (id) => document.getElementById(id);

function isTigers(name) {
  return name ? normalizeTeamName(name).includes(TIGERS_FRAGMENT) : false;
}

function toast(message, level = 'info') {
  const el = document.createElement('div');
  el.className = `toast ${level}`;
  el.textContent = message;
  $('toast-container').appendChild(el);
  setTimeout(() => el.remove(), 6_000);
}

function fmtDateTime(isoString) {
  if (!isoString) return '—';
  try {
    return new Intl.DateTimeFormat('cs-CZ', { dateStyle: 'short', timeStyle: 'short' })
      .format(new Date(isoString));
  } catch {
    return isoString;
  }
}

function fmtDate(iso) {
  if (!iso) return '';
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  return `${parseInt(m[3], 10)}. ${parseInt(m[2], 10)}.`;
}

// ─── Data mode (live vs demo scénáře) ────────────────────────────────────────
const DATA_MODE_STORAGE_KEY = 'tigers.dataMode';
let currentDataMode = localStorage.getItem(DATA_MODE_STORAGE_KEY) || 'live';

function dataPathPrefix(mode) {
  return mode === 'live' ? 'data/' : `data/demo/${mode.replace(/^demo:/, '')}/`;
}

async function loadJson(filename, { retries = 2, timeoutMs = 8000 } = {}) {
  const path = `${dataPathPrefix(currentDataMode)}${filename}`;
  const url = `${path}?t=${Date.now()}`;

  let lastErr;
  for (let attempt = 1; attempt <= retries + 1; attempt++) {
    try {
      const r = await fetch(url, {
        cache: 'no-cache',
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } catch (e) {
      lastErr = e;
      if (attempt <= retries) {
        console.debug(`loadJson retry ${attempt}/${retries} for ${path}:`, e.message);
        await new Promise(res => setTimeout(res, 300 * attempt));
      }
    }
  }
  throw lastErr;
}

function renderHeader(meta) {
  const span = $('last-updated');
  if (!meta || !meta.last_success_at) {
    span.textContent = 'Bez dat';
    return;
  }
  if (meta.last_attempt_status === 'tournament_ended') {
    span.innerHTML = `<strong>Turnaj skončil.</strong> Data jsou finální z ${fmtDateTime(meta.last_success_at)}.`;
    return;
  }
  const okText = `Stav z ${fmtDateTime(meta.last_success_at)}`;
  if (meta.last_attempt_status && meta.last_attempt_status !== 'ok'
      && meta.last_attempt_at !== meta.last_success_at) {
    const errorMsg = {
      network_error: 'síťový problém',
      parse_error: 'chyba parsování',
      timeout: 'časový limit',
    }[meta.last_attempt_status] || meta.last_attempt_status;
    span.innerHTML = `${okText} <span style="opacity:0.85">(poslední pokus ${fmtDateTime(meta.last_attempt_at)} selhal: ${errorMsg})</span>`;
  } else {
    span.textContent = okText;
  }
}

function renderTable(table) {
  const rows = table?.groups?.MH ?? [];
  if (!Array.isArray(rows) || rows.length === 0) {
    $('table-content').innerHTML = '<p>Tabulka zatím není k dispozici.</p>';
    return;
  }
  const rowsHtml = rows.map(r => {
    const tigers = isTigers(r.team);
    return `<tr class="${tigers ? 'tigers-row' : ''}">
      <td>${r.rank}</td>
      <td>${escapeHtml(r.team)}</td>
      <td>${r.scored}:${r.conceded}</td>
      <td><strong>${r.points}</strong></td>
    </tr>`;
  }).join('');
  $('table-content').innerHTML = `<table class="standings">
    <thead><tr><th>#</th><th>Tým</th><th>Skóre</th><th>Body</th></tr></thead>
    <tbody>${rowsHtml}</tbody>
  </table>`;
}

let tigersFilterMode = 'tigers';

function renderTigersMatches(matches, table) {
  let list;
  if (tigersFilterMode === 'tigers') {
    list = tigersBracketPath(matches, table);
  } else {
    list = (matches.matches || [])
      .slice()
      .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
  }
  if (!list.length) {
    $('tigers-content').innerHTML = '<p>Žádné zápasy v rozpisu.</p>';
    return;
  }
  const tigersIds = new Set(tigersBracketPath(matches, table).map(m => m.id));
  const cards = list.map(m => matchCardHtml(m, tigersIds.has(m.id))).join('');
  $('tigers-content').innerHTML = cards;
}

function renderAllMatches(matches) {
  const mh = (matches?.matches ?? []).filter(m => m.phase === 'group' && m.group === 'MH');
  if (!mh.length) {
    $('all-matches-content').innerHTML = '<p>Žádné zápasy v rozpisu.</p>';
    return;
  }
  mh.sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
  const rows = mh.map(m => `<tr>
    <td>${fmtDate(m.date)} ${m.time ?? ''}</td>
    <td>${escapeHtml(m.home)}</td>
    <td>${escapeHtml(m.away)}</td>
    <td>${m.score ? `${m.score.home}:${m.score.away}` : '—'}</td>
    <td>${escapeHtml(m.venue ?? '')}</td>
  </tr>`).join('');
  $('all-matches-content').innerHTML = `<table class="matches">
    <thead><tr><th>Kdy</th><th>Domácí</th><th>Hosté</th><th>Skóre</th><th>Hala</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

const VIEW_KEY = 'tigers.bracketView';
const MOBILE_MQ = '(max-width: 599px)';

function resolveBracketView() {
  const stored = localStorage.getItem(VIEW_KEY);
  if (stored === 'pavouk' || stored === 'seznam') return stored;
  return window.matchMedia(MOBILE_MQ).matches ? 'seznam' : 'pavouk';
}

let bracketPanZoom = null;

async function renderBracket(matches, table) {
  const view = resolveBracketView();
  const container = $('bracket-content');
  const scroll = container.closest('.bracket-scroll');

  document.querySelectorAll('.bracket-view-toggle [data-view]').forEach(btn => {
    btn.setAttribute('aria-selected', String(btn.dataset.view === view));
  });

  if (view === 'pavouk') {
    if (scroll) scroll.classList.remove('is-seznam');
    const mermaidSrc = renderStaticBracket(matches, table);
    container.removeAttribute('data-processed');
    container.textContent = mermaidSrc;
    if (bracketPanZoom) { bracketPanZoom.destroy(); bracketPanZoom = null; }
    try {
      await mermaid.run({ nodes: [container] });
      const svg = container.querySelector('svg');
      if (svg) {
        // Mermaid nastaví inline width/height na konkrétní px; pro pan-zoom potřebujeme
        // 100% rozměry, ať SVG vyplní wrapper.
        svg.removeAttribute('width');
        svg.removeAttribute('height');
        svg.style.width = '100%';
        svg.style.height = '100%';
        svg.style.maxWidth = 'none';
        bracketPanZoom = svgPanZoom(svg, {
          controlIconsEnabled: true,
          fit: true,
          center: true,
          minZoom: 0.2,
          maxZoom: 8,
          zoomScaleSensitivity: 0.3,
          contain: false,
        });
      }
    } catch (e) {
      console.error('mermaid render failed', e);
      container.textContent = renderStaticBracket(matches, table);
    }
  } else {
    if (bracketPanZoom) { bracketPanZoom.destroy(); bracketPanZoom = null; }
    if (scroll) scroll.classList.add('is-seznam');
    container.innerHTML = renderPhaseList(matches, table);
  }
}

function escapeHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Render loading skeleton pro zápasy a tabulky
function renderLoadingSkeleton(container, count = 3) {
  const skeletons = Array(count).fill(null)
    .map(() => '<div class="skeleton-line"></div>')
    .join('');
  container.innerHTML = `<div class="loading-skeleton">${skeletons}</div>`;
}

function isValidTable(t)    { return t && typeof t === 'object' && t.groups && typeof t.groups === 'object'; }
function isValidMatches(m)  { return m && Array.isArray(m.matches); }

function renderNextMatch(matches, table) {
  const path = tigersBracketPath(matches, table);
  const upcoming = path.find(m => !m.score);
  const el = $('next-match');
  if (!upcoming) {
    el.innerHTML = '';
    return;
  }

  const homePh = isPlaceholderCell(upcoming.home);
  const awayPh = isPlaceholderCell(upcoming.away);
  let opponent;
  if (isTigers(upcoming.home))      opponent = upcoming.away;
  else if (isTigers(upcoming.away)) opponent = upcoming.home;
  else if (homePh || awayPh)        opponent = 'soupeř bude určen';
  else                              opponent = `${upcoming.home} – ${upcoming.away}`;

  const phaseLabel = upcoming.phase === 'group' ? `${upcoming.group ?? 'MH'} skupina` : upcoming.phase;

  el.innerHTML = `
    <span class="next-label">Další zápas (${escapeHtml(phaseLabel)})</span>
    <span class="next-opponent">vs ${escapeHtml(opponent)}</span>
    <span class="next-time">${fmtDate(upcoming.date)} ${upcoming.time ?? ''}</span>
    <span class="next-venue">${escapeHtml(upcoming.venue ?? '')}</span>
  `;
}

async function renderAll(table, matches, meta) {
  if (!isValidTable(table) || !isValidMatches(matches)) {
    toast('Data mají neplatnou strukturu — zachovávám předchozí stav.', 'error');
    return;
  }
  renderHeader(meta);
  renderNextMatch(matches, table);
  renderTable(table);
  renderTigersMatches(matches, table);
  renderAllMatches(matches);
  await renderBracket(matches, table);
}

let lastData = { table: null, matches: null, meta: null };
let refreshLocked = false;

async function initialLoad() {
  try {
    // Render loading skeletons během načítání
    renderLoadingSkeleton($('table-content'), 2);
    renderLoadingSkeleton($('tigers-content'), 3);
    renderLoadingSkeleton($('all-matches-content'), 2);

    const [table, matches, meta] = await Promise.all([
      loadJson('table.json').catch(() => {
        console.debug('table.json unavailable, using empty');
        return { groups: {} };
      }),
      loadJson('matches.json').catch(() => {
        console.debug('matches.json unavailable, using empty');
        return { matches: [] };
      }),
      loadJson('meta.json').catch(() => {
        console.debug('meta.json unavailable');
        return null;
      }),
    ]);
    lastData = { table, matches, meta };
    await renderAll(table, matches, meta);
  } catch (e) {
    console.error('initialLoad:', e);
    toast(`Data nelze načíst: ${e.message}. Zkus aktualizovat stránku.`, 'error');
  }
}

async function forceRefresh() {
  if (refreshLocked) return;
  refreshLocked = true;
  const btn = $('refresh-btn');
  btn.disabled = true;
  setTimeout(() => { refreshLocked = false; btn.disabled = false; }, REFRESH_DEBOUNCE_MS);

  // V demo módu refresh prostě reloadne demo data ze stejné cesty.
  if (currentDataMode !== 'live') {
    toast('Načítám demo data…', 'info');
    await initialLoad();
    toast('Demo data načtena.', 'info');
    return;
  }

  toast('⏳ Stahuji čerstvá data… (může trvat až 30 sekund)', 'info');
  try {
    const [tableHtml, matchesHtml] = await Promise.all([
      fetchViaProxy('https://ostravskehry.cz/florbal/table/'),
      fetchViaProxy('https://ostravskehry.cz/florbal/matches/?category=24'),
    ]);
    const tableDoc = new DOMParser().parseFromString(tableHtml, 'text/html');
    const matchesDoc = new DOMParser().parseFromString(matchesHtml, 'text/html');
    const table = parseTable(tableDoc);
    const matches = parseMatches(matchesDoc);
    const nowIso = new Date().toISOString();
    lastData = {
      table,
      matches,
      meta: {
        ...lastData.meta,
        last_success_at: nowIso,
        last_attempt_at: nowIso,
        last_attempt_status: 'ok',
      },
    };
    await renderAll(lastData.table, lastData.matches, lastData.meta);
    toast('✓ Aktualizováno!', 'info');
  } catch (e) {
    console.error(e);
    const errorMsg = e.message.includes('timeout')
      ? 'Vypršel časový limit. Proxy je pomalá, zkus později.'
      : e.message.includes('all proxies failed')
      ? 'CORS proxy nejsou dostupné. Zkus refresh za 30 sekund.'
      : `Chyba: ${e.message}`;
    toast(`Refresh selhal: ${errorMsg}`, 'error');
  }
}

async function populateDataModeSelect() {
  const select = $('data-mode-select');
  // Default Live option
  select.innerHTML = `<option value="live">Live (skutečná data)</option>`;
  try {
    const demos = await (await fetch(`data/demo/index.json?t=${Date.now()}`)).json();
    for (const d of demos) {
      const opt = document.createElement('option');
      opt.value = d.slug;
      opt.textContent = `Demo · ${d.label}`;
      select.appendChild(opt);
    }
  } catch (e) {
    console.warn('demo index nedostupný', e);
  }
  select.value = currentDataMode;
  select.addEventListener('change', async () => {
    currentDataMode = select.value;
    localStorage.setItem(DATA_MODE_STORAGE_KEY, currentDataMode);
    stopPolling();
    await initialLoad();
    startPolling();
  });
}

async function loadBuildInfo() {
  const el = $('build-info');
  if (!el) return;
  try {
    // Fetchneme posledních 30 commitů a najdeme první, který NENÍ "data: scrape ..."
    // (cron commity od scraper-bota). Tím získáme verzi kódu, ne pouhý data update.
    const r = await fetch('https://api.github.com/repos/drabo81/tigers-ostravske-hry-2026/commits?per_page=30');
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const commits = await r.json();
    const codeCommit = commits.find(c => !c.commit.message.startsWith('data:'));
    if (!codeCommit) return;
    const sha = codeCommit.sha.slice(0, 7);
    const url = codeCommit.html_url;
    const deployed = fmtDateTime(codeCommit.commit.committer.date);
    el.innerHTML = `Verze <a href="${url}" target="_blank" rel="noopener"><code>${sha}</code></a> · Nasazeno ${deployed}`;
  } catch (e) {
    console.warn('build info failed', e);
    el.textContent = '';
  }
}

async function bumpVisitorCount() {
  const el = $('visitor-count');
  if (!el) return;

  // Inkrementuj jen jednou na prohlížeč (flag v localStorage), jinak jen načti aktuální stav.
  // Rate limit: refresh max 1x za 5 minut
  const COUNTED_KEY = 'tigers.visitorCounted';
  const CACHE_KEY = 'tigers.visitorCountCache';
  const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minut
  const BASE = 'https://api.counterapi.dev/v1/tigers-ostravske-hry-2026/visitors';

  const alreadyCounted = localStorage.getItem(COUNTED_KEY);
  const cached = localStorage.getItem(CACHE_KEY);
  const cachedTime = localStorage.getItem(CACHE_KEY + '.time');

  // Vrátit cached hodnotu, pokud je ještě čerstvá
  if (cached && cachedTime && Date.now() - parseInt(cachedTime, 10) < CACHE_TTL_MS) {
    el.textContent = cached;
    return;
  }

  // Trailing slash u read endpointu — bez něj API redirectuje s 301 a redirect
  // se přes CORS nedostane do fetch responseu.
  const url = alreadyCounted ? `${BASE}/` : `${BASE}/up`;
  try {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const d = await r.json();
    const n = d.count ?? d.value ?? null;
    const text = (typeof n === 'number') ? n.toLocaleString('cs-CZ') : '—';
    el.textContent = text;

    // Cache výsledek
    localStorage.setItem(CACHE_KEY, text);
    localStorage.setItem(CACHE_KEY + '.time', String(Date.now()));

    if (!alreadyCounted) localStorage.setItem(COUNTED_KEY, String(Date.now()));
  } catch (e) {
    console.warn('visitor counter failed:', e);
    el.textContent = cached ?? '—';
  }
}

// ─── Auto-refresh polling ─────────────────────────────────────────────────────
let pollTimerId = null;
let pollErrorCount = 0;

async function pollOnce() {
  if (currentDataMode !== 'live' || document.hidden) return;

  try {
    const meta = await loadJson('meta.json');
    if (hasMetaChanged(lastData.meta, meta)) {
      const [table, matches] = await Promise.all([
        loadJson('table.json'),
        loadJson('matches.json'),
      ]);
      lastData = { table, matches, meta };
      await renderAll(table, matches, meta);
    }
    pollErrorCount = 0;
  } catch (e) {
    console.warn('auto-refresh poll error:', e);
    pollErrorCount++;
    if (pollErrorCount >= POLL_MAX_ERRORS) {
      stopPolling();
      setTimeout(startPolling, POLL_BACKOFF_MS);
    }
  }
}

function startPolling() {
  if (currentDataMode !== 'live') return;
  stopPolling();
  pollErrorCount = 0;
  pollTimerId = setInterval(pollOnce, POLL_INTERVAL_MS);
}

function stopPolling() {
  if (pollTimerId !== null) {
    clearInterval(pollTimerId);
    pollTimerId = null;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  $('refresh-btn').addEventListener('click', forceRefresh);
  populateDataModeSelect();
  bumpVisitorCount();
  loadBuildInfo();
  document.querySelectorAll('.bracket-view-toggle [data-view]').forEach(btn => {
    btn.addEventListener('click', () => {
      localStorage.setItem(VIEW_KEY, btn.dataset.view);
      if (lastData.matches && lastData.table) {
        renderBracket(lastData.matches, lastData.table);
      }
    });
  });
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      tigersFilterMode = btn.dataset.filter;
      document.querySelectorAll('.filter-btn').forEach(b => {
        const active = b === btn;
        b.classList.toggle('active', active);
        b.setAttribute('aria-selected', active);
      });
      if (lastData.matches && lastData.table) {
        renderTigersMatches(lastData.matches, lastData.table);
      }
    });
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && currentDataMode === 'live') pollOnce();
  });
  initialLoad().then(startPolling);
});
