# Kyon — Stato del lavoro

Memoria tra le sessioni: **leggi questo file per primo** e riprendi dalla fase corrente. Aggiornalo durante il lavoro, non solo a fine fase.

## Fase corrente

**Fase 2 — Auth, inviti, admin, Settings account** (da iniziare).

| Fase | Titolo                                          | Stato      |
| ---- | ----------------------------------------------- | ---------- |
| 0    | Scaffold e infrastruttura                       | ✅ fatta   |
| 1    | Design system Liquid Glass, a11y di base, shell | ✅ fatta   |
| 2    | Auth, inviti, admin, Settings account           | ⏭ prossima |
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

| Fase | kyon-web   | kyon-realtime | kyon-cron | Note                                                                           |
| ---- | ---------- | ------------- | --------- | ------------------------------------------------------------------------------ |
| 0    | 969,1 KiB  | 0,6 KiB       | 0,4 KiB   | Next 16.4.3 + OpenNext 1.20.13, pagina + `/api/health` con D1                  |
| 1    | 1307,4 KiB | 0,6 KiB       | 0,4 KiB   | + Tailwind, Radix (dialog, radio, toast, switch, slider), motion, cmdk, lucide |

## Misure di CPU / latenza (locali, indicative)

Tempo totale della richiesta su workerd locale (`wrangler dev` sul bundle di produzione, sandbox a 4 core). **Non è il CPU time di Cloudflare**, ma un tetto approssimativo: il costo di base di workerd in locale è ~4 ms (file statico).

| Fase | Route           | Senza cache statica | Con cache statica | Note                                 |
| ---- | --------------- | ------------------- | ----------------- | ------------------------------------ |
| 0    | `/` (prerender) | ~45 ms              | ~8 ms             | per questo la cache statica è attiva |
| 0    | `/api/health`   | ~11 ms              | ~11 ms            | include una query D1 locale          |

## Lighthouse (mobile, bundle di produzione su workerd locale)

| Fase | Pagina      | Prestazioni | Accessibilità | Best practices |
| ---- | ----------- | ----------- | ------------- | -------------- |
| 1    | `/`         | 92          | 100           | 100            |
| 1    | `/progetti` | 96          | 100           | 100            |
| 1    | `/chat`     | 99          | 100           | 100            |
| 1    | `/settings` | 96          | 100           | 100            |

## Log delle fasi

### Fase 1 — Design system Liquid Glass, accessibilità di base, shell ✅ (2026-10-26)

Fatto:

- **Temi calcolati e verificati**: `packages/core/src/theme.ts` deriva tutti i token per 11 accenti Apple × chiaro/scuro × normale/alto contrasto (44 temi). Il testo è verificato contro ogni sfondo su cui può finire (sfondo, stop del mesh, vetro composto sopra il mesh, tinte dei badge; per la navigazione flottante anche vetro sopra bianco/nero puri). Ogni accento ha una variante di testo derivata (AA, AAA in alto contrasto), un riempimento per pulsanti con etichetta chiara o scura che passa AA, anello di focus e bordi input ≥ 3:1 (≥ 4,5:1 in alto contrasto). 184 test sul contrasto.
- CSS dei temi generato staticamente (`pnpm theme:gen`, test che fallisce se non è aggiornato) e selezionato da `data-accent`, `data-scheme`, `data-contrast` su `<html>`. Script inline di avvio che applica il tema prima del primo paint (test di parità col resolver di core).
- Preferenze (`packages/core/src/preferences.ts`): tema, accento, alto contrasto, riduci trasparenza/movimento (sistema/sì/no), modalità Leggera (auto/sempre/mai), dimensione testo (sistema o 85–160%), non solo colore, stile orologio, annunci. Salvate su questo dispositivo (localStorage) in attesa dell'account (Fase 2).
- **Modalità Leggera automatica**: pochi core/poca memoria o > 25% di frame persi in 1,5 s → Leggera, decisione salvata per dispositivo.
- Liquid Glass: vetro con blur+saturate, bordo speculare a gradiente, ombre a più livelli, grana; mesh statico con dissolvenza al cambio di accento; opaco in alto contrasto e con riduci trasparenza.
- Componenti (`apps/web/src/components/ui`): GlassCard, GlassButton, GlassInput, Segmented, Switch, Avatar, Badge, PriorityBadge (colore + simbolo + testo), Toast con "Annulla", Skeleton, EmptyState, ColorSwatchPicker (con spunta), ClockAnalog (lancette fluide via rAF, etichetta per screen reader aggiornata al minuto), ClockDigital, SyncIndicator, CommandPalette (Cmd/Ctrl+K), Sheet (bottom sheet trascinabile su telefono, dialog da tablet in su, focus sul titolo), PageHeader, SplitView. Galleria in `/dev/ui`.
- Shell: tab bar a pillola in basso (telefono), sidebar a pillola flottante (tablet/desktop), rail compatta per telefono in orizzontale, layout a due colonne da iPad, larghezza massima su monitor grandi, safe area iOS, link "Vai al contenuto", transizioni a molla tra pagine con focus sul titolo. Quattro pagine segnaposto (Home con orologio, Progetti, Chat, Settings con Grafica e Accessibilità complete).
- Logo Cerbero (tre sfere di vetro): `public/brand/kyon-icon.svg` (a colori), `kyon-mark.svg` (monocromatico), variante maskable; icone PNG PWA/Apple generate con `pnpm icons:gen`; `manifest.webmanifest`.
- Test: Playwright (mobile 390 px, tablet 1024 px, desktop 1280 px) sul bundle di produzione: navigazione e focus, skip link, Cmd+K, persistenza delle impostazioni, preferenze di sistema, tastiera sui controlli segmentati; **axe** (WCAG 2.2 AA, fallisce su violazioni serie/critiche) su 4 pagine × 4 modalità (chiaro, scuro, alto contrasto, scuro + alto contrasto + giallo) + galleria. Lighthouse CI con soglie. Tutto in CI.

Decisioni:

- Il vetro è decorativo: i colori del testo sono calcolati sul **caso peggiore** di composizione, non su un solo sfondo. In alto contrasto il mesh si appiattisce e il vetro diventa opaco con bordo da 2 px.
- Pulsanti: etichetta nera sugli accenti chiari (giallo, arancione, verde, menta, verde acqua, ciano), bianca sugli altri con riempimento leggermente scurito quando serve per l'AA (es. blu).
- CSS custom nei layer `base`/`components` di Tailwind, così le utility possono sempre sovrascriverlo.
- `motion` con `LazyMotion` + `domMax` (serve per `layoutId` della pillola attiva). Con "riduci movimento" `MotionConfig reducedMotion="always"` e transizioni CSS azzerate.
- iOS: senza dimensione scelta dall'utente il testo segue Dynamic Type (`font: -apple-system-body`).
- e2e e Lighthouse girano sul bundle OpenNext reale con `wrangler dev`, non su `next dev`.

Debito tecnico / da controllare:

- Safari/WebKit non è nei test automatici (in sandbox c'è solo Chromium): `backdrop-filter`, safe area e PWA vanno provati a mano su iPhone/iPad.
- `/dev/ui` è dinamica (controlla `KYON_ENV`), quindi passa dal Worker.

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
