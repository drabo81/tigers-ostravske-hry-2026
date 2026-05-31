// Vyplodí všech demo scénáře do sources/ostravske-hry-2026/demos/B13/<slug>/.
// Spuštění:  node scripts/generate-demos.mjs
import { execSync } from 'node:child_process';
import { writeFile, mkdir } from 'node:fs/promises';

const DEMO_BASE = 'sources/ostravske-hry-2026/demos/B13';

export const DEMO_SCENARIOS = [
  { slug: 'po-skupine',     label: 'Po základní části',  cutoff: '2026-05-23 11:00' },
  { slug: 'po-16f',         label: 'Po 16F-A',           cutoff: '2026-05-23 15:00' },
  { slug: 'po-8f',          label: 'Po 8F (A + B)',      cutoff: '2026-05-24 10:31' },
  { slug: 'po-4f',          label: 'Po 4F',              cutoff: '2026-05-24 12:31' },
  { slug: 'po-sf',          label: 'Po semifinále',      cutoff: '2026-05-24 14:00' },
  { slug: 'turnaj-dohran',  label: 'Turnaj dohrán',      cutoff: '2026-05-24 16:00' },
];

for (const { slug, label, cutoff } of DEMO_SCENARIOS) {
  console.log(`\n=== ${label} (${cutoff}) → ${DEMO_BASE}/${slug}/ ===`);
  execSync(`node scripts/simulate-up-to.mjs "${cutoff}" "${DEMO_BASE}/${slug}"`, { stdio: 'inherit' });
}
await mkdir(DEMO_BASE, { recursive: true });
await writeFile(`${DEMO_BASE}/index.json`, JSON.stringify(DEMO_SCENARIOS, null, 2));
console.log(`\n✓ All demos generated. Index: ${DEMO_BASE}/index.json`);
