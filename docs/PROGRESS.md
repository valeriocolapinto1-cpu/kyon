# Kyon — Stato del lavoro

Memoria tra le sessioni: **leggi questo file per primo** e riprendi dalla fase corrente. Aggiornalo durante il lavoro, non solo a fine fase.

## Fase corrente

**Fase 1 — Design system Liquid Glass, accessibilità di base, shell** (da iniziare).

| Fase | Titolo                                          | Stato      |
| ---- | ----------------------------------------------- | ---------- |
| 0    | Scaffold e infrastruttura                       | ✅ fatta   |
| 1    | Design system Liquid Glass, a11y di base, shell | ⏭ prossima |
| 2    | Auth, inviti, admin, Settings account           | —          |
| 3    | GitHub, repo, visibilità, progetti, membri      | —          |
| 4    | Motore task da `.md`                            | —          |
| 5    | Pagina progetto: Task                           | —          |
| 6    | Prompt, esecuzioni, tracciamento PR; Status     | —          |
| 7    | Realtime, chat e thread                         | —          |
| 8    | Home, Progetti, Chat, Persone, ricerca, extra   | —          |
| 9    | Notifiche                                       | —          |
| 10   | PWA offline, hardening, rilascio                | —          |

## In attesa dell'utente

- [ ] **Cloudflare + secrets GitHub** (`docs/SETUP.md` §A): sottodominio `workers.dev`, attivazione R2, token API, `CLOUDFLARE_API_TOKEN` e `CLOUDFLARE_ACCOUNT_ID` nei secrets della repo. Finché mancano, il workflow Deploy viene saltato con un avviso (la CI resta verde).
- [ ] Dopo il primo deploy: aprire `/api/health` e guardare **CPU Time** nelle metriche di `kyon-web` (prima misura reale della CPU).
- [ ] Un `.md` reale di Biohybrid (es. `PROSSIMI-PASSI.md`) per le fixture del parser (serve in Fase 4).

## Numeri del bundle (gzip, `pnpm size`)

Soglia di allarme 2,4 MB per Worker, limite Free 3 MB.

| Fase | kyon-web  | kyon-realtime | kyon-cron | Note                                                          |
| ---- | --------- | ------------- | --------- | ------------------------------------------------------------- |
| 0    | 969,1 KiB | 0,6 KiB       | 0,4 KiB   | Next 16.4.3 + OpenNext 1.20.13, pagina + `/api/health` con D1 |

## Misure di CPU / latenza (locali, indicative)

Tempo totale della richiesta su workerd locale (`wrangler dev` sul bundle di produzione, sandbox a 4 core). **Non è il CPU time di Cloudflare**, ma un tetto approssimativo: il costo di base di workerd in locale è ~4 ms (file statico).

| Fase | Route           | Senza cache statica | Con cache statica | Note                                 |
| ---- | --------------- | ------------------- | ----------------- | ------------------------------------ |
| 0    | `/` (prerender) | ~45 ms              | ~8 ms             | per questo la cache statica è attiva |
| 0    | `/api/health`   | ~11 ms              | ~11 ms            | include una query D1 locale          |

## Log delle fasi

### Fase 0 — Scaffold e infrastruttura ✅ (2026-10-26)

Fatto:

- Monorepo pnpm (`apps/web`, `workers/realtime`, `workers/cron`, `packages/core`), TypeScript strict (`noUncheckedIndexedAccess`), ESLint flat config (typescript-eslint strict + `eslint-config-next` con jsx-a11y su `apps/web`; `packages/core` non può importare Next/React/Cloudflare), Prettier, `.gitattributes` LF, `.editorconfig`.
- `apps/web`: Next.js 16 App Router + OpenNext, pagina segnaposto in italiano, `/api/health` che verifica D1 via Drizzle. Binding D1/KV/R2/DO (`script_name: kyon-realtime`) in `wrangler.jsonc`, tipi dei binding scritti a mano in `src/env.d.ts`.
- `workers/realtime`: `ProjectRoom` e `GeneralRoom` (DO con SQLite, Hibernation API, per ora solo ping/pong).
- `workers/cron`: handler `scheduled` ogni 15 minuti che registra un heartbeat in `app_meta`.
- Drizzle: schema iniziale (`app_meta`) e migrazione `0000_init.sql`.
- Script Node/TS cross-platform: `pnpm dev`, `pnpm size`, `pnpm run deploy` (crea D1/KV/R2 se mancano, applica le migrazioni, pubblica i tre Worker).
- CI (`ci.yml`) e deploy (`deploy.yml`, solo dopo CI verde su `main`).
- Documenti: `SPEC.md`, `ARCHITECTURE.md`, `SETUP.md`, `A11Y.md`, questo file.

Verificato:

- `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test` (6 test), `pnpm build`, `pnpm size`: verdi su Linux.
- `pnpm dev`: web su :3000 (`/` 200, `/api/health` → `{"ok":true,"db":"up"}`), realtime su :8788, cron su :8789. Il cron scrive nel D1 locale condiviso e il web raggiunge i DO di realtime.
- **Non verificato**: `pnpm dev` su macOS e Windows (gli script evitano bash e usano `shell` solo su Windows per i `.cmd` di pnpm); primo deploy reale (mancano i secrets).

Decisioni:

- **Versioni**: Next 16.4.3, OpenNext 1.20.13, wrangler 4.152, Drizzle 0.45, React 19.3. **TypeScript 6.0.3** e **ESLint 9.39**, non le ultime major: typescript-eslint supporta TS < 6.1 ed `eslint-plugin-react` (in `eslint-config-next`) non supporta ancora ESLint 10.
- **Cache statica OpenNext** (`staticAssetsIncrementalCache` + `populateCache` nella build): i prerender non vengono renderizzati a ogni richiesta. Senza ISR per ora.
- **Stato locale unico** in `.wrangler/state` alla radice per tutti i Worker e per `next dev`.
- **Deploy senza ID nel repo**: gli ID di D1/KV si risolvono a ogni deploy (`wrangler.deploy.json` generato e ignorato da git). Nessun passo manuale per creare le risorse.
- **Deploy saltato senza secrets** con avviso, per non avere la CI rossa prima del setup.
- **Script `build` di `apps/web`** = `next build`: OpenNext lo richiama internamente, quindi la build OpenNext sta in `build:worker`.
- **`pnpm run deploy`**, non `pnpm deploy` (comando interno di pnpm).

Debito tecnico / da controllare:

- `scripts/deploy.ts` usa l'output di `wrangler d1 list --json`, `wrangler kv namespace list` e `wrangler r2 bucket list`: da verificare al primo deploy reale.
- `kyon-web` ha un service binding a se stesso (`WORKER_SELF_REFERENCE`, raccomandato da OpenNext): da verificare che il primo deploy lo accetti.
- PBKDF2 contro i 10 ms di CPU: da misurare in Fase 2 (rischio alto con iterazioni sicure).
- Le versioni delle GitHub Actions (`checkout@v5`, `setup-node@v5`, `pnpm/action-setup@v4`, `upload-artifact@v4`) vanno aggiornate quando escono nuove major.

## Punti aperti (non bloccano)

1. Dominio personalizzato (per ora `.workers.dev`): influisce anche sull'invio email.
2. Passaggio a Workers Paid se bundle/CPU/email non entrano nel Free.
3. `.md` reale di Biohybrid per le fixture.
4. Verifica sul campo dell'invio email sul Free (solo destinatari verificati).
5. Passkey, 2FA, verifica email, integrazione AI: non previste ora.
