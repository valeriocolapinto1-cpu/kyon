# Kyon — Stato del lavoro

Memoria tra le sessioni: **leggi questo file per primo** e riprendi dalla fase corrente. Aggiornalo durante il lavoro, non solo a fine fase.

## Fase corrente

**Fase 3 — GitHub, repo, visibilità, progetti, membri** (da iniziare).

| Fase | Titolo                                          | Stato      |
| ---- | ----------------------------------------------- | ---------- |
| 0    | Scaffold e infrastruttura                       | ✅ fatta   |
| 1    | Design system Liquid Glass, a11y di base, shell | ✅ fatta   |
| 2    | Auth, inviti, admin, Settings account           | ✅ fatta   |
| 3    | GitHub, repo, visibilità, progetti, membri      | ⏭ prossima |
| 4    | Motore task da `.md`                            | —          |
| 5    | Pagina progetto: Task                           | —          |
| 6    | Prompt, esecuzioni, tracciamento PR; Status     | —          |
| 7    | Realtime, chat e thread                         | —          |
| 8    | Home, Progetti, Chat, Persone, ricerca, extra   | —          |
| 9    | Notifiche                                       | —          |
| 10   | PWA offline, hardening, rilascio                | —          |

## In attesa dell'utente

- [ ] **Cloudflare + secrets GitHub** (`docs/SETUP.md` §A): sottodominio `workers.dev`, attivazione R2, token API, `CLOUDFLARE_API_TOKEN` e `CLOUDFLARE_ACCOUNT_ID` nei secrets della repo. Finché mancano, il workflow Deploy viene saltato con un avviso (la CI resta verde).
- [ ] (Facoltativo) Secret GitHub `ADMIN_BOOTSTRAP_CODE` per creare il primo account admin dal telefono (`docs/SETUP.md` §A6). In alternativa `pnpm admin:create-invite --remote`.
- [ ] Dopo il primo deploy: aprire `/api/health` e guardare **CPU Time** nelle metriche di `kyon-web` (prima misura reale della CPU), in particolare su `/api/auth/sign-in/email`.
- [ ] Un `.md` reale di Biohybrid (es. `PROSSIMI-PASSI.md`) per le fixture del parser (serve in Fase 4).

## Numeri del bundle (gzip, `pnpm size`)

Soglia di allarme 2,4 MB per Worker, limite Free 3 MB.

| Fase | kyon-web   | kyon-realtime | kyon-cron | Note                                                                                                                |
| ---- | ---------- | ------------- | --------- | ------------------------------------------------------------------------------------------------------------------- |
| 0    | 969,1 KiB  | 0,6 KiB       | 0,4 KiB   | Next 16.4.3 + OpenNext 1.20.13, pagina + `/api/health` con D1                                                       |
| 1    | 1307,4 KiB | 0,6 KiB       | 0,4 KiB   | + Tailwind, Radix (dialog, radio, toast, switch, slider), motion, cmdk, lucide                                      |
| 2    | 1574,0 KiB | 0,6 KiB       | 0,4 KiB   | + Better Auth, TanStack Query, Hono. Con 15 route Next separate era 2531 KiB (oltre soglia): ora un'unica route API |

## Misure di CPU / latenza (locali, indicative)

Tempo totale della richiesta su workerd locale (`wrangler dev` sul bundle di produzione, sandbox a 4 core). **Non è il CPU time di Cloudflare**, ma un tetto approssimativo: il costo di base di workerd in locale è ~4 ms (file statico).

| Fase | Route           | Senza cache statica | Con cache statica | Note                                 |
| ---- | --------------- | ------------------- | ----------------- | ------------------------------------ |
| 0    | `/` (prerender) | ~45 ms              | ~8 ms             | per questo la cache statica è attiva |
| 0    | `/api/health`   | ~11 ms              | ~11 ms            | include una query D1 locale          |

**PBKDF2-SHA256 su workerd locale** (Fase 2): 10.000 iterazioni ≈ 1 ms, 50.000 ≈ 6 ms, 100.000 ≈ 12 ms, 600.000 ≈ 88 ms. Con Node sullo stesso host: 100.000 ≈ 16 ms. Conclusione: un PBKDF2 server-side con un costo sicuro non sta nei 10 ms del piano Free → hashing a due stadi (vedi Fase 2).

## Lighthouse (mobile, bundle di produzione su workerd locale)

| Fase | Pagina                | Prestazioni | Accessibilità | Best practices |
| ---- | --------------------- | ----------- | ------------- | -------------- |
| 1    | `/`                   | 92          | 100           | 100            |
| 1    | `/progetti`           | 96          | 100           | 100            |
| 1    | `/chat`               | 99          | 100           | 100            |
| 1    | `/settings`           | 96          | 100           | 100            |
| 2    | `/` (loggato)         | 90          | 100           | 100            |
| 2    | `/progetti` (loggato) | 94          | 100           | 100            |
| 2    | `/chat` (loggato)     | 95          | 100           | 100            |
| 2    | `/settings` (loggato) | 86          | 100           | 100            |
| 2    | `/login`              | 96          | 100           | 100            |

## Log delle fasi

### Fase 2 — Auth, inviti, admin, Settings account ✅ (2026-10-26)

Fatto:

- **Better Auth** (modalità `minimal`) su D1/Drizzle: tabelle `user` (+ ruolo, bio, stato, avatar, preferenze, layout Home), `session`, `account`, `verification`; tabella `invite`. Migrazione `0001_auth`.
- **Password a due stadi** (`packages/core/src/auth/password.ts`): PBKDF2-SHA256 600.000 iterazioni nel browser con salt `kyon/v1/<email normalizzata>`; il server accetta solo chiavi derivate (64 hex) e le salva come PBKDF2-SHA256 10.000 iterazioni con salt casuale. Cambio email = nuova chiave (il salt dipende dall'email).
- **Registrazione solo su invito**: codici `XXXX-XXXX-XXXX-XXXX` (80 bit, alfabeto Crockford, tollera minuscole/spazi/O-0/I-1), salvati come SHA-256, monouso (claim atomico), scadenza 7 giorni, revoca, tracciati (chi l'ha creato/usato). L'endpoint pubblico di sign-up di Better Auth è chiuso: si entra solo da `/api/join`.
- **Bootstrap admin**: `ADMIN_BOOTSTRAP_CODE` (vale solo finché non esiste nessun account) oppure `pnpm admin:create-invite`. Il primo account è sempre admin.
- **Sessioni fino al logout**: cookie 400 giorni rinnovato ogni giorno, **rotazione del token** dopo 7 giorni (endpoint `rotate-session`, chiamato all'avvio dell'app), elenco dispositivi con revoca singola e "disconnetti tutti gli altri", cambio password che disconnette gli altri dispositivi, reset da link admin che revoca tutte le sessioni, admin che disconnette un utente ovunque. Niente cache della sessione nel cookie: revoche e cambi di ruolo valgono subito.
- **Rate limit** con il binding Workers Rate Limiting: login/reset/cambio password/inviti per IP (10/min), scritture per utente (120/min). Controllo di origine sulle richieste di scrittura.
- **Admin**: inviti (crea → link mostrato una sola volta, elenco con stato, revoca), persone (ruolo admin/membro con protezione dell'ultimo admin, link per nuova password valido 24 ore e una volta, disconnessione ovunque).
- **Settings**: indice di sezione; Grafica e Accessibilità (prima, statiche); Profilo (nome, stato, bio, foto ridimensionata a 512 px nel browser e salvata su R2); Email; Password; Dispositivi connessi; Admin. Le preferenze si sincronizzano con l'account quando le cambi.
- Pagine `/login`, `/join/[codice]`, `/reset/[token]` (vetro, errori chiari in italiano, campi password con mostra/nascondi). Redirect a `/login?next=…` senza sessione (solo percorsi locali).
- **API in un'unica route** (`app/api/[[...route]]` + router Hono): vedi decisioni.
- Intestazioni di sicurezza su Worker e asset statici (`_headers`). Segreti: `BETTER_AUTH_SECRET` generato dal deploy e salvato solo su Cloudflare; in locale `.dev.vars` generato da `pnpm dev`.
- Test: 50 nuovi unit test (chiavi derivate, vettore PBKDF2 RFC 7914, hash server, inviti, rotazione, user agent, password) + **12 test di integrazione** delle rotte su D1 reale simulato (bootstrap, inviti monouso, sign-up pubblico chiuso, ruoli, 401/403, login, rate limit, CSRF, ultimo admin, reset con revoca sessioni, cambio email, rotazione). E2E: login con redirect, password errata, inviti non validi, iscrizione con link (una volta sola), membro senza pannello admin, reset da link admin, logout e disconnessione degli altri dispositivi, axe su login e join. Lighthouse sulle pagine da loggato.

Decisioni:

- **Hashing a due stadi** invece di PBKDF2 solo lato server (misure sopra). Sicurezza: un attaccante con il database deve pagare 610.000 iterazioni per tentativo; il valore salvato non è riutilizzabile come credenziale. Limite noto: il salt client dipende dall'email (come Bitwarden), quindi non c'è protezione contro tabelle precalcolate per un'email specifica; il salt server casuale non cambia questo per il primo stadio.
- **Rate limit col binding nativo**, non KV: KV Free ha 1.000 scritture al giorno. Il binding è per località Cloudflare (non globale) e va verificato sul piano Free al primo deploy.
- **Nessuna cookie cache di Better Auth**: una lettura D1 in più per richiesta in cambio di revoche immediate.
- **Pagine statiche + API**: il controllo della sessione avviene nelle API e nel client (`AuthGate`), le pagine restano servite dalla cache statica (CPU bassa). Le pagine non contengono dati.
- **Un'unica route Next per l'API**: Turbopack copiava Better Auth e Drizzle in ogni `route.ts` (2531 KiB gzip con 15 route, oltre la soglia). Con il router Hono: 1574 KiB. Regola scritta in `CLAUDE.md` §3.
- Impostazioni: prima le sezioni statiche, poi quelle con dati, per evitare spostamenti del layout (CLS da 0,56 a 0).
- Sincronizzazione preferenze solo su modifica esplicita dell'utente (all'accesso vince la copia dell'account).

Debito tecnico / da controllare:

- Il formato dei token di reset riusa quello interno di Better Auth (`reset-password:<token>` in `verification`): coperto da un test di integrazione end-to-end, da ricontrollare a ogni aggiornamento di Better Auth.
- Le richieste di `wrangler secret list/put` nel deploy non sono ancora state provate contro Cloudflare reale.

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
