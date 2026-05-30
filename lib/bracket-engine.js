import { normalizeTeamName } from './shared.js';

function anyGamesPlayedInGroup(rows) {
  if (!Array.isArray(rows)) return false;
  return rows.some(r => (r.points ?? 0) > 0 || (r.scored ?? 0) > 0 || (r.conceded ?? 0) > 0);
}

// "H1" → tým na 1. místě skupiny dle positionGroups['H']. null pokud nelze rozhodnout.
// positionGroups: mapování písmene kódu na klíč skupiny v table.groups, např. { H: 'MH', D: 'MD' }.
export function resolveCode(code, table, positionGroups) {
  const m = typeof code === 'string' ? code.match(/^([A-Z])(\d+)$/) : null;
  if (!m) return null;
  const groupKey = positionGroups?.[m[1]];
  if (!groupKey) return null;
  const rows = table?.groups?.[groupKey];
  if (!Array.isArray(rows)) return null;
  // Před odehráním zápasů je rank jen abecední seed — nepřekládáme.
  if (!anyGamesPlayedInGroup(rows)) return null;
  const row = rows.find(r => r.rank === parseInt(m[2], 10));
  return row?.team ?? null;
}

function nodeContainsTeam(node, key) {
  if (!key) return false;
  const h = node.home ? normalizeTeamName(node.home) : '';
  const a = node.away ? normalizeTeamName(node.away) : '';
  return h === key || a === key;
}

// Vrátí Set ID uzlů na cestě focus týmu. Uzel je na cestě, pokud obsahuje focus tým
// (po normalizaci) nebo má forceHighlight (a focus je znám).
export function highlightPath(model, focusTeam) {
  const set = new Set();
  const key = focusTeam ? normalizeTeamName(focusTeam) : null;
  if (!key) return set;
  for (const n of model.nodes) {
    if (n.forceHighlight) set.add(n.id);
    if (nodeContainsTeam(n, key)) set.add(n.id);
  }
  return set;
}

function nodeLabel(node) {
  const lines = [];
  if (node.round) lines.push(node.round);
  const home = node.home || '?';
  const away = node.away || '?';
  if (home !== '?' && away !== '?') lines.push(`${home} – ${away}`);
  else if (away !== '?') lines.push(`vs ${away}`);
  else if (home !== '?') lines.push(home);
  if (node.when || node.venue) lines.push([node.when, node.venue].filter(Boolean).join(' '));
  if (node.score) lines.push(`${node.score.home} : ${node.score.away}`);
  return lines.join('\\n').replace(/"/g, "'");
}

// Serializuje IR do Mermaid flowchart TD. opts.highlighted = Set ID; opts.focusTeam jen informativní.
export function renderMermaid(model, opts = {}) {
  const highlighted = opts.highlighted ?? new Set();
  const lines = ['flowchart TD'];

  for (const n of model.nodes) {
    const label = nodeLabel(n);
    const body = n.shape === 'rounded' ? `(["${label}"])` : `["${label}"]`;
    lines.push(`    ${n.id}${body}`);
  }

  for (const e of model.edges) {
    const label = e.label ? `|${e.label}|` : '';
    lines.push(`    ${e.from} -->${label} ${e.to}`);
  }

  // Played/unplayed styling
  for (const n of model.nodes) {
    if (highlighted.has(n.id)) continue; // highlight přepíše níže
    if (n.score) {
      lines.push(`    style ${n.id} fill:#d6eaf8,stroke:#2874a6,stroke-width:1px,color:#1b4f72`);
    } else {
      lines.push(`    style ${n.id} fill:#ffffff,stroke:#aaaaaa,stroke-width:1px,stroke-dasharray:4 3,color:#666`);
    }
  }

  // Highlight cesty (oranžově) — po played-stylech, ať override
  for (const n of model.nodes) {
    if (!highlighted.has(n.id)) continue;
    if (n.shape === 'rounded') {
      lines.push(`    style ${n.id} fill:#ffd700,color:#000,font-weight:bold,stroke:#ff6600,stroke-width:3px`);
    } else {
      lines.push(`    style ${n.id} fill:#ff6600,color:#fff,stroke:#000,stroke-width:2px`);
    }
  }

  return lines.join('\n');
}
