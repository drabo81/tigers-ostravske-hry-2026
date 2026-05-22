# Cloudflare Worker — třetí spouštěč scrape

Worker s cron triggerem `*/5 * * * *` slouží jako záloha k GitHub Actions cronu,
který na free planu občas přeskakuje runs až o desítky minut. Sub-minutová přesnost
CF cronu výrazně snižuje pravděpodobnost dlouhé mezery mezi scrapy během turnaje.

## Architektura — tři spouštěče dohromady

Scrape pipeline (`.github/workflows/scrape.yml`) má **tři nezávislé spouštěče**, které
sdílí stejnou logiku „kdy skutečně scrapovat":

```
┌──────────────────────────────────────────────────────────────────────┐
│  Spouštěč                  │  Frekvence  │  Gate                      │
├──────────────────────────────────────────────────────────────────────┤
│  GitHub cron *""/15         │  á 15 min   │  vždy proceed              │
│  GitHub cron */5            │  á 5 min    │  jen v turnajovém okně     │
│  Cloudflare Worker cron */5 │  á 5 min    │  jen v turnajovém okně     │
│  workflow_dispatch (ruční)  │  ad hoc     │  vždy proceed              │
└──────────────────────────────────────────────────────────────────────┘
```

**Proč tři, ne jen jeden:**
- `*/15` baseline pokrývá detekci změn rozpisu (přidání týmu, posun zápasu) mimo turnaj.
- `*/5` GitHub cron je hlavní engine během turnaje — funguje bez externí závislosti.
- CF Worker je **záloha k */5** — GitHub Actions cron na free planu občas přeskočí 30–60 min;
  CF cron drží přesný interval. Když oba „zafungují" ve stejnou minutu, concurrency group
  `scrape` runs zařadí do fronty.

**Turnajové okno** se počítá v `lib/tournament-window.js`:
```
windowStart = min(matches[].date+time) - 30 min
windowEnd   = max(matches[].date+time) + 90 min
```
Match časy jsou Europe/Prague; convert na UTC s hardcoded DST offsetem (+2h, validní
v turnajové sezóně květen).

**Gate v workflow** (`scrape.yml`) rozhoduje podle:
- `github.event.schedule == "*/5 * * * *"` → window check
- `github.event.inputs.cf_cron == "true"` → window check
- jinak (baseline cron, ruční dispatch) → vždy proceed

Mimo okno se nevyplýtvá žádný workflow čas — gate vrátí `proceed=false` a steps se přeskočí.
CF Worker mimo okno vůbec nedispatchne (window check běží už ve Workeru).

## Jak Worker konkrétně funguje

1. Každých 5 minut se Worker probudí (CF Cron Trigger).
2. Stáhne `data/matches.json` z GitHub raw URL.
3. Spočítá turnajové okno přes `isInTournamentWindow()` z `lib/tournament-window.js`.
4. Pokud je „teď" v okně, POSTne `workflow_dispatch` na `scrape.yml`:
   ```http
   POST /repos/drabo81/tigers-ostravske-hry-2026/actions/workflows/scrape.yml/dispatches
   Authorization: Bearer <PAT z Worker secret GH_DISPATCH_PAT>
   { "ref": "main", "inputs": { "cf_cron": "true" } }
   ```
5. Loguje výsledek jako JSON event do CF Workers Tail.

Mimo okno se zastaví po kroku 3 — žádný workflow run, žádný billing.

## Setup (jednorázový)

### 1) Vytvoř fine-grained Personal Access Token

GitHub → Settings → Developer settings → **Personal access tokens** → Fine-grained tokens → Generate new token.

- **Repository access:** Only select repositories → `drabo81/tigers-ostravske-hry-2026`
- **Permissions:**
  - `Actions`: Read and write
  - `Metadata`: Read (auto)
- **Expiration:** doporučuju 90 dní (rotace).

Token si zkopíruj — uvidíš ho jen jednou. **Nikdy ho neposílej do chatu, IM ani emailu.**

### 2) Cloudflare account + wrangler login

```bash
cd infra/cloudflare-cron
npm install
npx wrangler login         # OAuth flow v prohlížeči
```

### 3) Nahraj PAT jako Worker secret (interaktivně)

```bash
npx wrangler secret put GH_DISPATCH_PAT
# Na výzvu "Enter a secret value:" paste PAT a Enter
```

PAT **nepředávej jako argument** (`wrangler secret put GH_DISPATCH_PAT ghp_...`) —
wrangler ho neumí číst takhle a token by skončil v shell history.

### 4) Deploy

```bash
npx wrangler deploy
```

Hotovo. Cron začne tikat hned (první tick do 5 minut).

## Verifikace

### Stream logů z produkce

```bash
npx wrangler tail
```

Každých 5 minut uvidíš JSON event:
```json
{"event":"cf_cron_tick","dispatched":true,"reason":"ok"}
```

Možné `reason` hodnoty:
- `"ok"` — workflow_dispatch poslán
- `"outside tournament window"` — mimo okno, nic se neposlalo (normální mimo turnaj)
- `"GH_DISPATCH_PAT secret missing"` — chybí secret, doplnit
- `"matches.json HTTP <code>"` — GitHub raw nereaguje (síťový problém, časem se vyřeší)
- `"dispatch HTTP <code>: ..."` — GitHub API odmítlo dispatch (typicky 401 = špatný/expirovaný PAT)

### Test lokálně bez deploy

```bash
npx wrangler dev --test-scheduled
# v jiném terminálu:
curl "http://localhost:8787/__scheduled?cron=*/5+*+*+*+*"
```

### Z GitHub strany

GitHub → Actions tab. CF-triggered runs jsou `workflow_dispatch` events. V gate logu (Decide whether to scrape step) uvidíš `inputs.cf_cron = "true"` a `node scripts/in-tournament-window.mjs` výstup.

## Rotace PAT

Když token expiruje:

```bash
cd infra/cloudflare-cron
npx wrangler secret put GH_DISPATCH_PAT
```

Není potřeba re-deploy — secret update je atomický a Worker ho začne používat hned u dalšího ticku.

---

## Vypnutí po turnaji

Dvě úrovně podle toho, jestli plánuješ podobnou věc spustit i příště (např. další ročník),
nebo to chceš úplně vymazat.

### Varianta A — Lightweight: jen vypnout Worker, infra zachovat

Vhodné, pokud příští rok plánuješ stejný turnaj a chceš jen pozastavit běh.

```bash
cd infra/cloudflare-cron
npx wrangler delete tigers-scrape-cron
```

Worker zmizí z Cloudflare, žádný cron už nefiruje. **Soubory v repu zůstanou** —
příští rok stačí `npx wrangler deploy` a všechno pojede jako dřív (po refreshi PAT).

**Doplň ručně:**
- GitHub → Settings → Developer settings → Fine-grained tokens → najít PAT → **Revoke**.
  (Worker je smazaný, ale token je pořád živý; bezpečnostní hygiena.)

Dense cron `*/5` v GitHub Actions a gate logika **běží dál** — vrací `proceed=false`
mimo turnajové okno, takže žádná škoda. Baseline `*/15` taky běží dál.

### Varianta B — Full revert: smazat všechno spojené s adaptivním scrapem

Vhodné, pokud chceš vrátit projekt do stavu „jednoduchý cron á 15 min" a tournament-window
logiku už nikdy nepoužít.

**Krok 1:** Smaž Worker (jako ve Variantě A):
```bash
cd infra/cloudflare-cron
npx wrangler delete tigers-scrape-cron
```

**Krok 2:** Revokni PAT v GitHubu.

**Krok 3:** Revert změn v repu:
```bash
git revert d3a0775   # CF Worker commit
git revert 2ccecfc   # dense cron + tournament-window infra
git push
```

(Pokud commit hashe sedí; jinak najít přes `git log --oneline | grep -E "Cloudflare|hustší scrape"`.)

Alternativně manuálně:
- `.github/workflows/scrape.yml`: smaž druhý cron (`*/5`), `workflow_dispatch.inputs.cf_cron`,
  zjednoduš gate na single `echo "proceed=true" >> $GITHUB_OUTPUT`.
- Smaž `scripts/in-tournament-window.mjs`, `lib/tournament-window.js`, `tests/inTournamentWindow.test.mjs`,
  `tests/cfCronHandler.test.mjs`.
- Smaž celý `infra/cloudflare-cron/`.

**Po revertu zkontroluj testy:** `pnpm test` — neměl by žádný test selhat (mazané testy se mažou samy).

### Co po Variantě B zůstane

- Detekce live zápasů (parser + UI badge + CSS): **zůstává**, není to spojené s adaptivním
  scrapem. Pokud chceš mazat i tohle, revertni i commit `cfdea2b` (`feat: detekce probíhajícího zápasu`).
- Fixture `tests/fixtures/2026-05-22-during-tournament-matches.html`: drobné MB v repu,
  klidně nech jako historický doklad.

### Doporučení

**Varianta A** je pro většinu případů ta správná. Worker stojí $0 na CF free planu (10M
requestů/měsíc; 12 ticků/hod × 24 × 30 = 8640 requestů/měsíc). Když ho ale nepotřebuješ,
proč nechat něco běžet — `wrangler delete` ho odmaže za 5 sekund a příští rok je to jeden
příkaz na obnovu.

**Varianta B** dává smysl jen pokud projekt přerůstá v něco úplně jiného nebo
chceš mít clean slate.
