export function normalizeTeamName(s) {
  return s
    .trim()
    .toLocaleLowerCase('cs')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
}

export function escapeHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// "2026-05-22" → "22. 5." (s mezerou)
export function fmtDate(iso) {
  if (!iso) return '';
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  return `${parseInt(m[3], 10)}. ${parseInt(m[2], 10)}.`;
}

export function fmtDateTime(isoString) {
  if (!isoString) return '—';
  try {
    return new Intl.DateTimeFormat('cs-CZ', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(isoString));
  } catch {
    return isoString;
  }
}
