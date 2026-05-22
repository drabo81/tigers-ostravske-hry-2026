# Cloudflare Worker — třetí spouštěč scrape

Worker s cron triggerem `*/5 * * * *` slouží jako záloha k GitHub Actions cronu,
který na free planu občas přeskakuje runs až o desítky minut. Sub-minutová přesnost
CF cronu výrazně snižuje pravděpodobnost dlouhé mezery mezi scrapy během turnaje.

## Jak to funguje

1. Každých 5 minut se Worker probudí.
2. Stáhne `data/matches.json` z GitHub raw.
3. Spočítá turnajové okno (první zápas −30 min .. poslední zápas +90 min).
4. Pokud je „teď" v okně, POSTne `workflow_dispatch` na `scrape.yml` s `inputs.cf_cron=true`.
5. GitHub workflow gate rozezná `cf_cron=true` → spustí standardní scrape pipeline.

Mimo turnajové okno Worker **neudělá nic** — žádný workflow run, žádný billing.

## Setup (jednorázový)

### 1) Vytvoř fine-grained Personal Access Token

GitHub → Settings → Developer settings → **Personal access tokens** → Fine-grained tokens → Generate new token.

- **Repository access:** Only select repositories → `drabo81/tigers-ostravske-hry-2026`
- **Permissions:**
  - `Actions`: Read and write
  - `Metadata`: Read (auto)
- **Expiration:** doporučuju 90 dní (rotace), nebo „No expiration" pokud věříš svému CF účtu.

Token si zkopíruj — uvidíš ho jen jednou.

### 2) Cloudflare account + wrangler login

```bash
cd infra/cloudflare-cron
npm install
npx wrangler login         # OAuth flow v prohlížeči
```

### 3) Nahraj PAT jako Worker secret

```bash
npx wrangler secret put GH_DISPATCH_PAT
# Paste PAT a Enter
```

### 4) Deploy

```bash
npx wrangler deploy
```

Hotovo. Cron začne tikat hned.

## Verifikace

### Test lokálně (bez deploy)

```bash
npx wrangler dev --test-scheduled
# v jiném terminálu:
curl "http://localhost:8787/__scheduled?cron=*/5+*+*+*+*"
```

V `wrangler dev` výstupu uvidíš JSON log `{ "event": "cf_cron_tick", "dispatched": true/false, "reason": "..." }`.

### Po deploy

```bash
npx wrangler tail
```

Streamuje produkční logy. Měl bys vidět `cf_cron_tick` event každých 5 minut.

Plus na GitHubu Actions tab — runs s eventem `workflow_dispatch` jsou ty od CF Worker (rozlišíš v gate logu: `inputs.cf_cron = "true"`).

## Rotace PAT

Když token expiruje:

```bash
npx wrangler secret put GH_DISPATCH_PAT
```

Není potřeba re-deploy — secret update je atomický.

## Smazání

Pokud Worker přestaneš potřebovat (např. po turnaji):

```bash
npx wrangler delete
```

Smazne i secrety.
