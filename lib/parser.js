export function normalizeTeamName(s) {
  return s
    .trim()
    .toLocaleLowerCase('cs')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
}

// Mapování textových označení fáze (jak se zobrazují na ostravskehry.cz) na náš enum.
const PHASE_PATTERNS = [
  { primary: /^M[A-H]$/i, smallNeeded: /z[áa]kl/i, phase: 'group' },
  { primary: /šestn[áa]ctifin[áa]le/i, smallNeeded: /play-?off\s*a/i, phase: '16F-A' },
  { primary: /šestn[áa]ctifin[áa]le/i, smallNeeded: /play-?off\s*b/i, phase: '16F-B' },
  { primary: /osmifin[áa]le/i, smallNeeded: /play-?off\s*a/i, phase: '8F-A' },
  { primary: /osmifin[áa]le/i, smallNeeded: /play-?off\s*b/i, phase: '8F-B' },
  { primary: /čtvrtfin[áa]le/i, smallNeeded: /play-?off\s*a/i, phase: '4F-A' },
  { primary: /čtvrtfin[áa]le/i, smallNeeded: /play-?off\s*b/i, phase: '4F-B' },
  { primary: /semifin[áa]le/i, smallNeeded: /play-?off\s*a/i, phase: 'SF-A' },
  { primary: /semifin[áa]le/i, smallNeeded: /play-?off\s*b/i, phase: 'SF-B' },
  { primary: /^fin[áa]le$/i, smallNeeded: /play-?off\s*a/i, phase: 'FINAL-A' },
  { primary: /^fin[áa]le$/i, smallNeeded: /play-?off\s*b/i, phase: 'FINAL-B' },
];

function detectPhase(primaryText, smallText) {
  for (const { primary, smallNeeded, phase } of PHASE_PATTERNS) {
    if (primary.test(primaryText) && (!smallNeeded || smallNeeded.test(smallText))) {
      return phase;
    }
  }
  return 'other';
}

function parseDateCs(dateText) {
  const m = dateText.match(/(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})/);
  if (!m) return null;
  return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

function parseScore(linkText, matchTime) {
  // Před zápasem ostravskehry.cz zobrazuje jako odkaz čas startu (např. "11:15"),
  // po skončení zápasu zobrazuje skóre (např. "5:3"). Rozlišujeme podle shody s časem.
  const m = linkText.match(/^\s*(\d+)\s*:\s*(\d+)\s*$/);
  if (!m) return null;
  if (linkText.trim() === matchTime) return null;
  return {
    home: parseInt(m[1], 10),
    away: parseInt(m[2], 10),
    status: 'final',
  };
}

const GROUP_CODE_REGEX = /\(([A-Z]{2})\)\s*$/;

// Vstup: kořenový Element (Document / documentElement / linkedom Element).
// Funguje stejně v Node (přes linkedom) i v browseru (přes DOMParser).
export function parseTable(root) {
  const groups = {};

  root.querySelectorAll('h2').forEach(h => {
    const headingText = (h.textContent || '').trim();
    const match = headingText.match(GROUP_CODE_REGEX);
    if (!match) return;
    const groupCode = match[1];

    // Najdi nejbližší následující <table> mezi sourozenci.
    let sib = h.nextElementSibling;
    while (sib && sib.tagName.toLowerCase() !== 'table') {
      sib = sib.nextElementSibling;
    }
    if (!sib) return;
    const table = sib;

    const rows = [];
    table.querySelectorAll('tbody > tr').forEach(tr => {
      const tds = Array.from(tr.children).filter(c => c.tagName.toLowerCase() === 'td');
      if (tds.length < 4) return;

      const lastIdx = tds.length - 1;
      const scoreText = (tds[lastIdx - 1].textContent || '').trim();
      const pointsText = (tds[lastIdx].textContent || '').trim();
      const [scored, conceded] = scoreText.split(':').map(s => parseInt(s, 10) || 0);

      const rankText = (tds[0].textContent || '').trim().replace(/\.$/, '');
      const rank = parseInt(rankText, 10);
      if (Number.isNaN(rank)) return;

      const teamName = (tds[1].textContent || '').trim().replace(/\s+/g, ' ');

      rows.push({
        rank,
        team: teamName,
        scored,
        conceded,
        points: parseInt(pointsText, 10) || 0,
      });
    });

    if (rows.length) groups[groupCode] = rows;
  });

  return { groups };
}

function textWithoutSmall(el) {
  // Vrací textový obsah s vynecháním <small> dětí.
  let out = '';
  for (const node of el.childNodes) {
    if (node.nodeType === 1) {
      if (node.tagName.toLowerCase() === 'small') continue;
      out += node.textContent || '';
    } else if (node.nodeType === 3) {
      out += node.nodeValue || '';
    }
  }
  return out.trim();
}

export function parseMatches(root) {
  const matches = [];
  const seenIds = new Set();

  root.querySelectorAll('tr.match-row-desktop').forEach(tr => {
    const tds = Array.from(tr.children).filter(c => c.tagName.toLowerCase() === 'td');
    if (tds.length < 8) return;

    const strong = tds[0].querySelector('strong');
    const dateText = strong ? (strong.textContent || '').trim() : '';
    const span = tds[0].querySelector('span');
    const time = span ? (span.textContent || '').trim() : '';

    const venue = (tds[1].textContent || '').trim().replace(/\s+/g, ' ');
    const home = (tds[2].textContent || '').trim();
    const away = (tds[4].textContent || '').trim();

    const groupCell = tds[5];
    const smallEl = groupCell.querySelector('small');
    const smallText = smallEl ? (smallEl.textContent || '').trim() : '';
    const primaryText = textWithoutSmall(groupCell);

    const scoreLink = tds[7].querySelector('a');
    const scoreText = scoreLink ? (scoreLink.textContent || '').trim() : '';
    const href = scoreLink ? (scoreLink.getAttribute('href') || '') : '';

    const idMatch = href.match(/[?&]id=(\d+)/);
    if (!idMatch) return;
    const id = parseInt(idMatch[1], 10);
    if (seenIds.has(id)) return;
    seenIds.add(id);

    const phase = detectPhase(primaryText, smallText);
    const group = /^M[A-H]$/i.test(primaryText) ? primaryText.toUpperCase() : null;

    matches.push({
      id,
      date: parseDateCs(dateText),
      time: time || null,
      group,
      phase,
      venue,
      home,
      away,
      score: parseScore(scoreText, time),
    });
  });

  return { matches };
}
