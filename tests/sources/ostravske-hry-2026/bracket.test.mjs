import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderStaticBracket, renderPhaseList } from '../../../sources/ostravske-hry-2026/bracket.js';

const FOCUS = 'FBC Tigers Poruba';
const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const data = (scn, f) => JSON.parse(readFileSync(new URL(`../../../sources/ostravske-hry-2026/demos/B13/${scn}/${f}.json`, import.meta.url), 'utf8'));

for (const scn of ['po-skupine', 'po-16f', 'turnaj-dohran']) {
  test(`pavouk parity: ${scn}`, () => {
    assert.equal(renderStaticBracket(data(scn,'matches'), data(scn,'table'), FOCUS), read(`./__snapshots__/${scn}.pavouk.mmd`));
  });
  test(`seznam parity: ${scn}`, () => {
    assert.equal(renderPhaseList(data(scn,'matches'), data(scn,'table'), FOCUS), read(`./__snapshots__/${scn}.seznam.html`));
  });
}
