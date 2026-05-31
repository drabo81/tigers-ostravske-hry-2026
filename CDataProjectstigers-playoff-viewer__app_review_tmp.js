import { SOURCES } from './sources/registry.js';
import { normalizeTeamName, escapeHtml, fmtDate, fmtDateTime } from './lib/shared.js';
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

const REFRESH_DEBOUNCE_MS = 5_000;
const POLL_INTERVAL_MS = 90_000;
// After 3 consecutive errors, back off for 5 min to spare GH Pages CDN during outages.
const POLL_MAX_ERRORS = 3;
const POLL_BACKOFF_MS = 5 * 60_000;

const $ = (id) => document.getElementById(id);

// ─── State ────────────────────────────────────────────────────────────────────
let state = {
  sourceId: null,
  categoryId: null,
  focusTeam: null,
  def: null,        // loaded SourceDefinition (default export from plugin)
  category: null,   // category entry from def.categories
};
let lastData = { table: null, matches: null, meta: null };

function isFocus(name) {
  if (!name || !state.focusTeam) return false;
  return normalizeTeamName(name).includes(normalizeTeamName(state.focusTeam));
}

// ─── URL / localStorage helpers ───────────────────────────────────────────────
const LS_SOURCE   = 'tv.source';
const LS_CATEGORY = 'tv.category';
const LS_TEAM     = 'tv.team';

function readUrlParams() {
  const p = new URLSearchParams(location.search);
  return {
    source:   p.get('source')   || null,
    category: p.get('category') || null,
    team:     p.get('team')     || null,
  };
}

function writeUrl() {
  const p = new URLSearchParams();
  if (state.sourceId)   p.set('source',   state.sourceId);
  if (state.categoryId) p.set('category', state.categoryId);
  if (state.focusTeam)  p.set('team',     state.focusTeam);
  history.replaceState(null, '', `${location.pathname}?${p.toString()}`);
}

function resolveInitialSelection() {
  const url = readUrlParams();

  // Determine sourceId
  let sourceId = url.source || localStorage.getItem(LS_SOURCE) || null;
  if (!SOURCES.find(s => s.id === sourceId)) sourceId = SOURCES[0]?.id ?? null;

  const src = SOURCES.find(s => s.id === sourceId);
  if (!src) return { sourceId: null, categoryId: null, focusTeam: null };

  // Determine categoryId
  let categoryId = url.category || localStorage.getItem(LS_CATEGORY) || null;
  // Only accept categoryId if it exists in this source
  if (!src.categories.find(c => c.id === categoryId)) {
    // Pick first category that has a defaultGroup
    const withGroup = src.categories.find(c => c.defaultGroup);
    categoryId = (withGroup || src.categories[0])?.id ?? null;
  }

  const catMeta = src.categories.find(c => c.id === categoryId);

  // Determine focusTeam
  let focusTeam = url.team || localStorage.getItem(LS_TEAM) || null;
  if (!focusTeam) focusTeam = catMeta?.defaultFocusTeam ?? null;

  return { sourceId, categoryId, focusTeam };
}

async function selectSource(sourceId, categoryId, focusTeam) {
  const src = SOURCES.find(s => s.id === sourceId);
  if (!src) throw new Error(`Unknown sourceId: ${sourceId}`);

  const loaded = await src.load();
  const def = loaded.default;
  const category = def.categories.find(c => c.id === categoryId) ?? def.categories[0];

  state.sourceId   = sourceId;
  state.categoryId = category.id;
  state.focusTeam  = focusTeam ?? category.defaultFocusTeam ?? null;
  state.def        = def;
  state.category   = category;

  // Persist
  localStorage.setItem(LS_SOURCE,   state.sourceId);
  localStorage.setItem(LS_CATEGORY, state.categoryId);
  if (state.focusTeam) localStorage.setItem(LS_TEAM, state.focusTeam);
  else                 localStorage.removeItem(LS_TEAM);

  writeUrl();

  // Update page title
  const title = `${src.label} – ${category.label}`;
  document.title = title;
  const pageTitle    = $('page-title');
  const pageSubtitle = $('page-subtitle');
  if (pageTitle)    pageTitle.textContent    = src.label;
  if (pageSubtitle) pageSubtitle.textContent = category.label;
}

// ─── Data mode (live vs demo scénáře) ────────────────────────────────────────
const DATA_MODE_STORAGE_KEY = 'tigers.dataMode';
let currentDataMode = localStorage.getItem(DATA_MODE_STORAGE_KEY) || 'live';

function dataPathPrefix(mode) {
  if (mode === 'live') {
    return `data/${state.sourceId}/${state.categoryId}/`;
  }
  const scn = mode.replace(/^demo:/, '');
  return `sources/${state.sourceId}/demos/${state.categoryId}/${scn}/`;
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
  if (!span) return;
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
  const group = state.category?.defaultGroup ?? Object.keys(table?.groups ?? {})[0] ?? null;
  const rows = (group && table?.groups?.[group]) ?? [];
  if (!Array.isArray(rows) || rows.length === 0) {
    const el = $('table-content');
    if (el) el.innerHTML = '<p>Tabulka zatím není k dispozici.</p>';
    return;
  }
  const heading = $('section-table')?.querySelector('h2');
  if (heading) heading.textContent = `Tabulka skupiny ${group}`;
  const rowsHtml = rows.map(r => {
    const focus = isFocus(r.team);
    return `<tr class="${focus ? 'tigers-row' : ''}">
      <td>${r.rank}</td>
      <td>${escapeHtml(r.team)}</td>
      <td>${r.scored}:${r.conceded}</td>
      <td><strong>${r.points}</strong></td>
    </tr>`;
  }).join('');
  const el = $('table-content');
  if (el) el.innerHTML = `<table class="standings">
    <thead><tr><th>#</th><th>Tým</th><th>Skóre</th><th>Body</th></tr></thead>
    <tbody>${rowsHtml}</tbody>
  </table>`;
}

let tigersFilterMode = 'tigers';

function renderTigersMatches(matches, table) {
  const bracket = state.category?.bracket;
  let list;
  if (tigersFilterMode === 'tigers') {
    list = bracket ? bracket.focusPath(matches, table, state.focusTeam) : [];
  } else {
    list = (matches.matches || [])
      .slice()
      .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
  }
  if (!list.length) {
    const el = $('tigers-content');
    if (el) el.innerHTML = '<p>Žádné zápasy v rozpisu.</p>';
    return;
  }
  const focusIds = new Set(
    bracket ? bracket.focusPath(matches, table, state.focusTeam).map(m => m.id) : []
  );
  const cards = list.map(m =>
    bracket
      ? bracket.matchCardHtml(m, focusIds.has(m.id), matches, table, state.focusTeam)
      : escapeHtml(JSON.stringify(m))
  ).join('');
  const el = $('tigers-content');
  if (el) el.innerHTML = cards;
}

function renderAllMatches(matches) {
  const group = state.category?.defaultGroup ?? null;
  const mh = (matches?.matches ?? []).filter(
    m => m.phase === 'group' && (!group || m.group === group)
  );
  const heading = $('section-all-matches')?.querySelector('h2');
  if (heading && group) heading.textContent = `Zápasy skupiny ${group}`;
  if (!mh.length) {
    const el = $('all-matches-content');
    if (el) el.innerHTML = '<p>Žádné zápasy v rozpisu.</p>';
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
  const el = $('all-matches-content');
  if (el) el.innerHTML = `<table class="matches">
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
  const bracket = state.category?.bracket;
  const sectionEl = $('section-bracket');

  if (!bracket) {
    if (sectionEl) sectionEl.hidden = true;
    return;
  }
  if (sectionEl) sectionEl.hidden = false;

  const view = resolveBracketView();
  const container = $('bracket-content');
  if (!container) return;
  const scroll = container.closest('.bracket-scroll');

  document.querySelectorAll('.bracket-view-toggle [data-view]').forEach(btn => {
    btn.setAttribute('aria-selected', String(btn.dataset.view === view));
  });

  if (view === 'pavouk') {
    if (scroll) scroll.classList.remove('is-seznam');
    const mermaidSrc = bracket.renderStaticBracket(matches, table, state.focusTeam);
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
      container.textContent = bracket.renderStaticBracket(matches, table, state.focusTeam);
    }
  } else {
    if (bracketPanZoom) { bracketPanZoom.destroy(); bracketPanZoom = null; }
    if (scroll) scroll.classList.add('is-seznam');
    container.innerHTML = bracket.renderPhaseList(matches, table, state.focusTeam);
  }
}

// Render loading skeleton pro zápasy a tabulky
function renderLoadingSkeleton(container, count = 3) {
  if (!container) return;
  const skeletons = Array(count).fill(null)
    .map(() => '<div class="skeleton-line"></div>')
    .join('');
  container.innerHTML = `<div class="loading-skeleton">${skeletons}</div>`;
}

function isValidTable(t)    { return t && typeof t === 'object' && t.groups && typeof t.groups === 'object'; }
function isValidMatches(m)  { return m && Array.isArray(m.matches); }

function renderNextMatch(matches, table) {
  const bracket = state.category?.bracket;
  const el = $('next-match');
  if (!el) return;
  if (!bracket) { el.innerHTML = ''; return; }

  const path = bracket.focusPath(matches, table, state.focusTeam);
  const upcoming = path.find(m => !m.score);
  if (!upcoming) {
    el.innerHTML = '';
    return;
  }

  // Buňky můžou být ještě placeholder (typicky po pádu do Play-off B). Rozlož je na
  // reálná jména, ať poznáme focus tým i soupeře.
  const home = bracket.resolvePlaceholder(upcoming.home, matches, table);
  const away = bracket.resolvePlaceholder(upcoming.away, matches, table);
  const homePh = bracket.isPlaceholderCell(home);
  const awayPh = bracket.isPlaceholderCell(away);
  let opponent;
  if (isFocus(home))      opponent = awayPh ? 'soupeř bude určen' : away;
  else if (isFocus(away)) opponent = homePh ? 'soupeř bude určen' : home;
  else if (homePh || awayPh) opponent = 'soupeř bude určen';
  else                       opponent = `${home} – ${away}`;

  const phaseLabel = upcoming.phase === 'group' ? `${upcoming.group ?? state.category?.defaultGroup ?? ''} skupina` : upcoming.phase;

  el.innerHTML = `
    <span class="next-label">Další zápas (${escapeHtml(phaseLabel)})</span>
    <span class="next-opponent">vs ${escapeHtml(opponent)}</span>
    <span class="next-time">${fmtDate(upcoming.date)} ${upcoming.time ?? ''}</span>
    <span class="next-venue">${escapeHtml(upcoming.venue ?? '')}</span>
  `;
}

function toast(message, level = 'info') {
  const container = $('toast-container');
  if (!container) return;
  const el = document.createElement('div');
  el.className = `toast ${level}`;
  el.textContent = message;
  container.appendChild(el);
  setTimeout(() => el.remove(), 6_000);
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
  if (btn) btn.disabled = true;
  setTimeout(() => {
    refreshLocked = false;
    if (btn) btn.disabled = false;
  }, REFRESH_DEBOUNCE_MS);

  // V demo módu refresh prostě reloadne demo data ze stejné cesty.
  if (currentDataMode !== 'live') {
    toast('Načítám demo data…', 'info');
    await initialLoad();
    toast('Demo data načtena.', 'info');
    return;
  }

  toast('⏳ Stahuji čerstvá data… (může trvat až 30 sekund)', 'info');
  try {
    const targets = state.category?.fetchTargets;
    if (!targets) throw new Error('fetchTargets not defined for this category');
    const [tableHtml, matchesHtml] = await Promise.all([
      fetchViaProxy(targets.table),
      fetchViaProxy(targets.matches),
    ]);
    const tableDoc   = new DOMParser().parseFromString(tableHtml,   'text/html');
    const matchesDoc = new DOMParser().parseFromString(matchesHtml, 'text/html');
    const table   = state.def.parseTable(tableDoc);
    const matches = state.def.parseMatches(matchesDoc);
    const nowIso  = new Date().toISOString();
    lastData = {
      table,
      matches,
      meta: {
        ...lastData.meta,
        last_success_at:      nowIso,
        last_attempt_at:      nowIso,
        last_attempt_status:  'ok',
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
  if (!select) return;
  // Default Live option
  select.innerHTML = `<option value="live">Live (skutečná data)</option>`;
  try {
    const demoIndex = `sources/${state.sourceId}/demos/${state.categoryId}/index.json`;
    const demos = await (await fetch(`${demoIndex}?t=${Date.now()}`)).json();
    for (const d of demos) {
      const opt = document.createElement('option');
      opt.value = `demo:${d.slug}`;
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

function populateSourceSelect() {
  const select = $('source-select');
  if (!select) return;
  select.innerHTML = '';
  for (const src of SOURCES) {
    const opt = document.createElement('option');
    opt.value = src.id;
    opt.textContent = src.label;
    select.appendChild(opt);
  }
  select.value = state.sourceId ?? '';
  select.addEventListener('change', async () => {
    const newSourceId = select.value;
    const src = SOURCES.find(s => s.id === newSourceId);
    if (!src) return;
    const firstCat = src.categories[0];
    stopPolling();
    await selectSource(newSourceId, firstCat?.id ?? null, firstCat?.defaultFocusTeam ?? null);
    populateCategorySelect();
    await populateDataModeSelect();
    await initialLoad();
    await populateTeamSelect();
    startPolling();
  });
}

function populateCategorySelect() {
  const select = $('category-select');
  if (!select) return;
  select.innerHTML = '';
  const src = SOURCES.find(s => s.id === state.sourceId);
  for (const cat of (src?.categories ?? [])) {
    const opt = document.createElement('option');
    opt.value = cat.id;
    opt.textContent = cat.label;
    select.appendChild(opt);
  }
  select.value = state.categoryId ?? '';
  // Remove any existing listener by cloning
  const fresh = select.cloneNode(true);
  select.parentNode?.replaceChild(fresh, select);
  fresh.addEventListener('change', async () => {
    const newCatId = fresh.value;
    stopPolling();
    await selectSource(state.sourceId, newCatId, null);
    await populateDataModeSelect();
    await initialLoad();
    await populateTeamSelect();
    writeUrl();
    startPolling();
  });
}

async function populateTeamSelect() {
  const select = $('team-select');
  if (!select) return;
  // Build team list from loaded table (all groups)
  const teams = new Set();
  if (lastData.table?.groups) {
    for (const rows of Object.values(lastData.table.groups)) {
      for (const r of rows) {
        if (r.team) teams.add(r.team);
      }
    }
  }
  // Fallback: defaultFocusTeam from category
  if (state.category?.defaultFocusTeam) teams.add(state.category.defaultFocusTeam);

  const fresh = select.cloneNode(false); // clone without children
  const noOpt = document.createElement('option');
  noOpt.value = '';
  noOpt.textContent = '(bez zvýraznění)';
  fresh.appendChild(noOpt);
  for (const t of [...teams].sort((a, b) => a.localeCompare(b, 'cs'))) {
    const opt = document.createElement('option');
    opt.value = t;
    opt.textContent = t;
    fresh.appendChild(opt);
  }
  fresh.value = state.focusTeam ?? '';
  select.parentNode?.replaceChild(fresh, select);
  fresh.addEventListener('change', async () => {
    state.focusTeam = fresh.value || null;
    if (state.focusTeam) localStorage.setItem(LS_TEAM, state.focusTeam);
    else                 localStorage.removeItem(LS_TEAM);
    writeUrl();
    if (lastData.table && lastData.matches) {
      await renderAll(lastData.table, lastData.matches, lastData.meta);
    }
  });
}

// deploy-global, ne per-source
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
    const sha      = codeCommit.sha.slice(0, 7);
    const url      = codeCommit.html_url;
    const deployed = fmtDateTime(codeCommit.commit.committer.date);
    el.innerHTML = `Verze <a href="${url}" target="_blank" rel="noopener"><code>${sha}</code></a> · Nasazeno ${deployed}`;
  } catch (e) {
    console.warn('build info failed', e);
    el.textContent = '';
  }
}

// deploy-global, ne per-source
async function bumpVisitorCount() {
  const el = $('visitor-count');
  if (!el) return;

  // Inkrementuj jen jednou na prohlížeč (flag v localStorage), jinak jen načti aktuální stav.
  // Rate limit: refresh max 1x za 5 minut
  const COUNTED_KEY = 'tigers.visitorCounted';
  const CACHE_KEY   = 'tigers.visitorCountCache';
  const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minut
  const BASE = 'https://api.counterapi.dev/v1/tigers-ostravske-hry-2026/visitors';

  const alreadyCounted = localStorage.getItem(COUNTED_KEY);
  const cached         = localStorage.getItem(CACHE_KEY);
  const cachedTime     = localStorage.getItem(CACHE_KEY + '.time');

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
    const d    = await r.json();
    const n    = d.count ?? d.value ?? null;
    const text = (typeof n === 'number') ? n.toLocaleString('cs-CZ') : '—';
    el.textContent = text;

    // Cache výsledek
    localStorage.setItem(CACHE_KEY,              text);
    localStorage.setItem(CACHE_KEY + '.time',    String(Date.now()));

    if (!alreadyCounted) localStorage.setItem(COUNTED_KEY, String(Date.now()));
  } catch (e) {
    console.warn('visitor counter failed:', e);
    el.textContent = cached ?? '—';
  }
}

// ─── Auto-refresh polling ─────────────────────────────────────────────────────
let pollTimerId    = null;
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

document.addEventListener('DOMContentLoaded', async () => {
  const { sourceId, categoryId, focusTeam } = resolveInitialSelection();
  await selectSource(sourceId, categoryId, focusTeam);

  const refreshBtn = $('refresh-btn');
  if (refreshBtn) refreshBtn.addEventListener('click', forceRefresh);

  populateSourceSelect();
  populateCategorySelect();
  await populateDataModeSelect();

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

  bumpVisitorCount();
  loadBuildInfo();

  await initialLoad();
  await populateTeamSelect();
  startPolling();
});
