import { SOURCES } from './sources/registry.js';
import { normalizeTeamName, escapeHtml, fmtDate, fmtDateTime } from './lib/shared.js';
import { fetchViaProxy } from './lib/proxy.js';
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
const $ = (id) => document.getElementById(id);

// ─── Stav výběru ───────────────────────────────────────────────────────────────
const LS_SOURCE = 'tv.source', LS_CATEGORY = 'tv.category', LS_TEAM = 'tv.team';
let state = { sourceId: null, categoryId: null, focusTeam: null, def: null, category: null };
let lastData = { table: null, matches: null, meta: null };
let tigersFilterMode = 'tigers';
let refreshLocked = false;
let bracketPanZoom = null;

function isActive(src, now = new Date()) {
  return now >= new Date(src.activeFrom) && now < new Date(src.activeTo);
}

function isFocus(name) {
  return name && state.focusTeam
    ? normalizeTeamName(name) === normalizeTeamName(state.focusTeam)
    : false;
}

// ─── URL / localStorage helpers ────────────────────────────────────────────────
function readUrlParams() {
  const p = new URLSearchParams(location.search);
  return { source: p.get('source'), category: p.get('category'), team: p.get('team') };
}

function writeUrl() {
  const p = new URLSearchParams();
  if (state.sourceId)   p.set('source',   state.sourceId);
  if (state.categoryId) p.set('category', state.categoryId);
  if (state.focusTeam)  p.set('team',     state.focusTeam);
  history.replaceState(null, '', `?${p.toString()}`);
}

function resolveInitialSelection() {
  const url = readUrlParams();
  const sourceId = url.source || localStorage.getItem(LS_SOURCE)
    || (SOURCES.find(isActive) || SOURCES[0])?.id;
  const src = SOURCES.find(s => s.id === sourceId) || SOURCES[0];
  const meta = src.categories;
  const categoryId = url.category || localStorage.getItem(LS_CATEGORY) || meta[0]?.id;
  const catMeta = meta.find(c => c.id === categoryId) || meta[0];
  const focusTeam = url.team ?? localStorage.getItem(LS_TEAM) ?? catMeta?.defaultFocusTeam ?? null;
  return { sourceId: src.id, categoryId: catMeta?.id, focusTeam };
}

async function selectSource(sourceId, categoryId, focusTeam) {
  const src = SOURCES.find(s => s.id === sourceId) || SOURCES[0];
  state.def = (await src.load()).default;
  state.sourceId = src.id;
  state.category = state.def.categories.find(c => c.id === categoryId) || state.def.categories[0];
  state.categoryId = state.category.id;
  state.focusTeam = focusTeam !== undefined ? focusTeam : state.category.defaultFocusTeam ?? null;
  localStorage.setItem(LS_SOURCE, state.sourceId);
  localStorage.setItem(LS_CATEGORY, state.categoryId);
  if (state.focusTeam) localStorage.setItem(LS_TEAM, state.focusTeam);
  else localStorage.removeItem(LS_TEAM);
  writeUrl();
  document.title = `${state.def.label} — ${state.category.label}`;
}

// ─── Datová cesta ───────────────────────────────────────────────────────────────
function dataDir() { return `data/${state.sourceId}/${state.categoryId}`; }

async function loadJson(filename) {
  const url = `${dataDir()}/${filename}?t=${Date.now()}`;
  const r = await fetch(url, { cache: 'no-cache' });
  if (!r.ok) throw new Error(`fetch ${filename}: HTTP ${r.status}`);
  return r.json();
}

// ─── Pomocné funkce ────────────────────────────────────────────────────────────
function isValidTable(t)   { return t && typeof t === 'object' && t.groups && typeof t.groups === 'object'; }
function isValidMatches(m) { return m && Array.isArray(m.matches); }

function toast(message, level = 'info') {
  const el = document.createElement('div');
  el.className = `toast ${level}`;
  el.textContent = message;
  const container = $('toast-container');
  if (!container) return;
  container.appendChild(el);
  setTimeout(() => el.remove(), 6_000);
}

// ─── Focus matches (nahrazuje tigersBracketPath) ───────────────────────────────
function focusMatches(matches) {
  return (matches.matches || [])
    .filter(m => isFocus(m.home) || isFocus(m.away))
    .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
}

// ─── Render funkce ─────────────────────────────────────────────────────────────
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
    span.innerHTML = `${okText} <span style="opacity:0.85">(poslední pokus ${fmtDateTime(meta.last_attempt_at)} selhal: ${escapeHtml(meta.last_attempt_status)})</span>`;
  } else {
    span.textContent = okText;
  }
}

function renderTable(table) {
  const groupKey = state.category?.defaultGroup;
  const rows = (groupKey ? table?.groups?.[groupKey] : Object.values(table?.groups ?? {})[0]) ?? [];
  if (!Array.isArray(rows) || rows.length === 0) {
    $('table-content').innerHTML = '<p>Tabulka zatím není k dispozici.</p>';
    return;
  }
  const rowsHtml = rows.map(r => {
    const focus = isFocus(r.team);
    return `<tr class="${focus ? 'tigers-row' : ''}">
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

function matchCardHtml(m, isFocusMatch) {
  let body;
  if (m.score) {
    body = `<div class="score"><strong>${escapeHtml(m.home)}</strong> <span class="score-num">${m.score.home} : ${m.score.away}</span> <strong>${escapeHtml(m.away)}</strong></div>`;
  } else {
    body = `<div class="vs"><strong>${escapeHtml(m.home)}</strong> – <strong>${escapeHtml(m.away)}</strong> <span class="pending">(zatím nehrané)</span></div>`;
  }

  const klass = `match-card${isFocusMatch ? ' is-tigers' : ''}${!m.score ? ' is-pending' : ''}`;
  return `<div class="${klass}">
    <div><span class="phase">${m.phase === 'group' ? `${m.group ?? ''} skupina` : m.phase}</span>
      <span class="when">${fmtDate(m.date)} ${m.time ?? ''} — ${escapeHtml(m.venue ?? '')}</span></div>
    ${body}
  </div>`;
}

function renderTigersMatches(matches, table) {
  let list;
  if (tigersFilterMode === 'tigers') {
    list = focusMatches(matches);
  } else {
    list = (matches.matches || [])
      .slice()
      .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
  }
  if (!list.length) {
    $('tigers-content').innerHTML = '<p>Žádné zápasy v rozpisu.</p>';
    return;
  }
  const focusIds = new Set(focusMatches(matches).map(m => m.id));
  const cards = list.map(m => matchCardHtml(m, focusIds.has(m.id))).join('');
  $('tigers-content').innerHTML = cards;
}

function renderAllMatches(matches) {
  const groupKey = state.category?.defaultGroup;
  const mh = (matches?.matches ?? []).filter(m => m.phase === 'group' && m.group === groupKey);
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

function renderNextMatch(matches, table) {
  const path = focusMatches(matches);
  const upcoming = path.find(m => !m.score);
  const el = $('next-match');
  if (!upcoming) {
    el.innerHTML = '';
    return;
  }

  let opponent;
  if (isFocus(upcoming.home))      opponent = upcoming.away;
  else if (isFocus(upcoming.away)) opponent = upcoming.home;
  else                             opponent = `${upcoming.home} – ${upcoming.away}`;

  const phaseLabel = upcoming.phase === 'group' ? `${upcoming.group ?? ''} skupina` : upcoming.phase;

  el.innerHTML = `
    <span class="next-label">Další zápas (${escapeHtml(phaseLabel)})</span>
    <span class="next-opponent">vs ${escapeHtml(opponent)}</span>
    <span class="next-time">${fmtDate(upcoming.date)} ${upcoming.time ?? ''}</span>
    <span class="next-venue">${escapeHtml(upcoming.venue ?? '')}</span>
  `;
}

async function renderBracket(matches, table) {
  const container = $('bracket-content');
  if (!container) return;
  const fn = state.category?.renderBracket;
  if (typeof fn !== 'function') { $('section-bracket').hidden = true; return; }
  $('section-bracket').hidden = false;
  const mermaidSrc = fn(matches, table, state.focusTeam);
  container.removeAttribute('data-processed');
  container.textContent = mermaidSrc;
  if (bracketPanZoom) { bracketPanZoom.destroy(); bracketPanZoom = null; }
  try {
    await mermaid.run({ nodes: [container] });
    const svg = container.querySelector('svg');
    if (svg) {
      svg.removeAttribute('width'); svg.removeAttribute('height');
      svg.style.width = '100%'; svg.style.height = '100%'; svg.style.maxWidth = 'none';
      bracketPanZoom = svgPanZoom(svg, { controlIconsEnabled: true, fit: true, center: true,
        minZoom: 0.2, maxZoom: 8, zoomScaleSensitivity: 0.3, contain: false });
    }
  } catch (e) { console.error('mermaid render failed', e); container.textContent = mermaidSrc; }
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

// ─── Načítání dat ──────────────────────────────────────────────────────────────
async function initialLoad() {
  try {
    const [table, matches, meta] = await Promise.all([
      loadJson('table.json').catch(() => ({ groups: {} })),
      loadJson('matches.json').catch(() => ({ matches: [] })),
      loadJson('meta.json').catch(() => null),
    ]);
    lastData = { table, matches, meta };
    await renderAll(table, matches, meta);
  } catch (e) {
    console.error(e);
    toast(`Data nelze načíst: ${e.message}`, 'error');
  }
}

async function forceRefresh() {
  if (refreshLocked) return;
  refreshLocked = true;
  const btn = $('refresh-btn');
  if (btn) btn.disabled = true;
  setTimeout(() => { refreshLocked = false; if (btn) btn.disabled = false; }, REFRESH_DEBOUNCE_MS);

  toast('Stahuji čerstvá data…', 'info');
  try {
    const [tableHtml, matchesHtml] = await Promise.all([
      fetchViaProxy(state.category.fetchTargets.table),
      fetchViaProxy(state.category.fetchTargets.matches),
    ]);
    const table = state.def.parseTable(new DOMParser().parseFromString(tableHtml, 'text/html'));
    const matches = state.def.parseMatches(new DOMParser().parseFromString(matchesHtml, 'text/html'));
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
    populateTeamSelect();
    toast('Aktualizováno.', 'info');
  } catch (e) {
    console.error(e);
    toast(`Refresh selhal: ${e.message}`, 'error');
  }
}

// ─── Přepínače ─────────────────────────────────────────────────────────────────
function populateSourceSelect() {
  const sel = $('source-select');
  if (!sel) return;
  sel.innerHTML = SOURCES.map(s => `<option value="${s.id}">${escapeHtml(s.label)}</option>`).join('');
  sel.value = state.sourceId;
  sel.onchange = async () => {
    await selectSource(sel.value, undefined, undefined);
    populateCategorySelect();
    populateTeamSelect();
    await initialLoad();
  };
}

function populateCategorySelect() {
  const sel = $('category-select');
  if (!sel) return;
  sel.innerHTML = state.def.categories.map(c =>
    `<option value="${c.id}">${escapeHtml(c.label)}</option>`
  ).join('');
  sel.value = state.categoryId;
  sel.onchange = async () => {
    await selectSource(state.sourceId, sel.value, undefined);
    populateTeamSelect();
    await initialLoad();
  };
}

function populateTeamSelect() {
  const sel = $('team-select');
  if (!sel) return;
  const teams = new Set();
  const groups = lastData.table?.groups ?? {};
  for (const rows of Object.values(groups)) for (const r of rows) teams.add(r.team);
  const opts = ['<option value="">(bez zvýraznění)</option>']
    .concat([...teams].sort((a, b) => a.localeCompare(b, 'cs'))
      .map(t => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`));
  sel.innerHTML = opts.join('');
  sel.value = state.focusTeam ?? '';
  sel.onchange = async () => {
    state.focusTeam = sel.value || null;
    if (state.focusTeam) localStorage.setItem(LS_TEAM, state.focusTeam);
    else localStorage.removeItem(LS_TEAM);
    writeUrl();
    await renderAll(lastData.table, lastData.matches, lastData.meta);
  };
}

// ─── Build info + návštěvník ───────────────────────────────────────────────────
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
  const COUNTED_KEY = 'tigers.visitorCounted';
  const BASE = 'https://api.counterapi.dev/v1/tigers-ostravske-hry-2026/visitors';
  const alreadyCounted = localStorage.getItem(COUNTED_KEY);
  // Trailing slash u read endpointu — bez něj API redirectuje s 301 a redirect
  // se přes CORS nedostane do fetch responseu.
  const url = alreadyCounted ? `${BASE}/` : `${BASE}/up`;
  try {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const d = await r.json();
    const n = d.count ?? d.value ?? null;
    el.textContent = (typeof n === 'number') ? n.toLocaleString('cs-CZ') : '—';
    if (!alreadyCounted) localStorage.setItem(COUNTED_KEY, String(Date.now()));
  } catch (e) {
    console.warn('visitor counter failed', e);
    el.textContent = '—';
  }
}

// ─── Bootstrap ─────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  const sel = resolveInitialSelection();
  await selectSource(sel.sourceId, sel.categoryId, sel.focusTeam);
  $('refresh-btn')?.addEventListener('click', forceRefresh);
  populateSourceSelect();
  populateCategorySelect();
  bumpVisitorCount();
  loadBuildInfo();
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
  await initialLoad();
  populateTeamSelect();   // až po načtení tabulky (potřebuje seznam týmů)
});
