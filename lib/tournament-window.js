// Pure logic pro výpočet turnajového okna z matches.json.
// Bezzávislé na fs / process — používáno z CLI skriptu i z Cloudflare Worker.

export const WINDOW_BEFORE_MIN = 30;
export const WINDOW_AFTER_MIN = 90;

// Match časy v matches.json jsou lokální čas Europe/Prague.
// V květnu (DST) = UTC+2. Hardcoded protože turnaj se hraje v DST období;
// pokud by se v budoucnu konal v zimě, zde upravit nebo použít proper TZ knihovnu.
const PRAGUE_OFFSET_HOURS_DST = 2;

export function localPragueToUtc(dateStr, timeStr) {
  if (!dateStr || !timeStr) return null;
  const dm = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const tm = timeStr.match(/^(\d{1,2}):(\d{2})$/);
  if (!dm || !tm) return null;
  const utcMillis = Date.UTC(
    parseInt(dm[1], 10),
    parseInt(dm[2], 10) - 1,
    parseInt(dm[3], 10),
    parseInt(tm[1], 10) - PRAGUE_OFFSET_HOURS_DST,
    parseInt(tm[2], 10)
  );
  return new Date(utcMillis);
}

export function isInTournamentWindow(matchesJson, now) {
  const dates = (matchesJson?.matches || [])
    .map(m => localPragueToUtc(m.date, m.time))
    .filter(d => d !== null);
  if (dates.length === 0) return false;
  const first = new Date(Math.min(...dates.map(d => d.getTime())));
  const last  = new Date(Math.max(...dates.map(d => d.getTime())));
  const windowStart = new Date(first.getTime() - WINDOW_BEFORE_MIN * 60_000);
  const windowEnd   = new Date(last.getTime()  + WINDOW_AFTER_MIN  * 60_000);
  return now >= windowStart && now <= windowEnd;
}
