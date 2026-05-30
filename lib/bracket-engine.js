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
