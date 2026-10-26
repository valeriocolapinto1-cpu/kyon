# Kyon — Architettura

Documento vivo: descrive com'è fatto il sistema **oggi** e le scelte già decise per le fasi successive. Le regole permanenti sono in `CLAUDE.md`, il comportamento del prodotto in `docs/SPEC.md`.

## 1. Vista d'insieme

```
                     ┌──────────────────────────── Cloudflare (piano Free) ───────────────────────────┐
 Browser / PWA ────▶ │ kyon-web  (Next.js via OpenNext)                                                │
   (HTTPS, WS)       │   ├─ asset statici + prerender (cache statica OpenNext, niente render)          │
                     │   ├─ API / Server Components ──▶ D1 (kyon-db)   KV (kyon-kv)   R2 (kyon-files)  │
                     │   └─ binding DO (script_name) ─┐                                                │
                     │                                ▼                                                │
                     │ kyon-realtime  ProjectRoom (1 per progetto) · GeneralRoom (chat del gruppo)    │
                     │   Durable Objects SQLite + WebSocket Hibernation ──▶ D1 (archivio chat)         │
                     │                                                                                 │
                     │ kyon-cron  scheduled ogni 15 min ──▶ D1 (riconciliazione, scadenze)             │
                     └─────────────────────────────────────────────────────────────────────────────────┘
 GitHub ── webhook (HMAC) ──▶ kyon-web /api/github/webhook            (Fase 3–4)
 kyon-web ── GitHub API (token utente cifrati, ETag) ──▶ GitHub      (Fase 3–4)
```

Tre Worker separati, ognuno con il proprio bundle (limite Free: 3 MB gzip ciascuno):

| Worker          | Sorgente           | Ruolo                                                         | Binding               |
| --------------- | ------------------ | ------------------------------------------------------------- | --------------------- |
| `kyon-web`      | `apps/web`         | UI, API, auth, webhook GitHub, scritture sulla repo           | D1, KV, R2, DO, self  |
| `kyon-realtime` | `workers/realtime` | Stanze realtime: chat, presenza, eventi board                 | DO (proprietario), D1 |
| `kyon-cron`     | `workers/cron`     | Riconciliazione webhook persi, promemoria scadenze, heartbeat | D1                    |

`packages/core` è logica pura (nessun import di Next, React o Cloudflare: regola ESLint `no-restricted-imports`) usata da tutti e tre e testata a fondo.

## 2. Dati: chi è la fonte di verità

- **Le task vivono nella repo GitHub** (file `.md`). D1 tiene solo metadati (`task_meta`: assegnatario, priorità, scadenza, colonna, posizione) e snapshot parsati (`task_snapshot`) per calcolare differenze.
- **D1** (SQLite, Drizzle): utenti, sessioni, inviti, progetti, prompt, esecuzioni, commenti, notifiche, archivio chat (FTS5). Schema in `apps/web/src/db/schema.ts`, migrazioni SQL generate da Drizzle in `apps/web/src/db/migrations` e applicate da wrangler (in locale da `pnpm dev`, in produzione da `scripts/deploy.ts`).
- **Durable Objects (SQLite interno)**: messaggi recenti di ogni stanza, presenza, "sta scrivendo".
- **KV**: rate limit e piccole cache (anteprime link, ETag). Mai dati che devono essere coerenti subito.
- **R2**: avatar e allegati, letti solo passando dal Worker con controllo `can()`.

Date sempre in UTC nel DB (millisecondi epoch, `integer` `timestamp_ms`), formattate nel fuso dell'utente (default `Europe/Rome`).

## 3. Rendering e budget CPU

Il piano Free dà **10 ms di CPU per richiesta**. Scelte di conseguenza:

- Pagine statiche prerenderizzate e servite dagli asset: `open-next.config.ts` usa `staticAssetsIncrementalCache` e `pnpm build` esegue `populateCache`, così un prerender costa una lettura di asset e nessun render React. Misura locale: ~8 ms di tempo totale della richiesta contro ~45 ms senza cache (di cui ~4 ms sono il costo di base di workerd in locale).
- Dati dinamici via route API leggere; niente SSR pesante nelle route calde.
- Nessun polling: aggiornamenti via webhook + WebSocket; il cron gira ogni 15 minuti e lavora su poche repo per invocazione.
- Hashing password PBKDF2 (WebCrypto) da misurare in Fase 2: è il punto più a rischio rispetto ai 10 ms.

## 3bis. Web: pagine, API e autenticazione

```
Browser ──GET /settings──▶ asset statico (shell prerenderizzata, nessun dato)
        ──fetch /api/me──▶ app/api/[[...route]] ─▶ router Hono ─▶ lib/server/routes/me.ts ─▶ D1
```

- **Pagine**: shell statiche (`○` nella build) servite dalla cache statica. Gli identificativi vanno in query string (`/progetti?id=…&tab=…`): niente segmenti dinamici, che il Worker renderizzerebbe a ogni richiesta. `AuthGate` legge `/api/me`: senza sessione porta a `/login?next=…`. Ogni blocco mostra il suo skeleton.
- **API**: un'unica route Next (`app/api/[[...route]]/route.ts`) e un router Hono (`lib/server/router.ts`) che monta i moduli di `lib/server/routes/`. Ogni handler passa da `route()`/`authedRoute()` (`lib/server/http.ts`): env, Drizzle, errori JSON `{ error: { code, message } }` in italiano, controllo di origine sulle scritture, sessione e ruolo admin. Validazione con Zod.
- **Better Auth** (`lib/server/auth.ts`), una istanza per isolate e origine: email + password, sessioni in D1 senza cookie cache, plugin `rotate-session`. Il sign-up pubblico è bloccato: gli account nascono da `/api/join` (invito o codice di bootstrap).
- **Password**: il browser calcola PBKDF2-SHA256 (600k) e manda una chiave derivata; il server la ri-hasha (PBKDF2 10k, salt casuale). Logica in `packages/core/src/auth`.
- **Rate limit**: binding `AUTH_LIMITER` (10/min per IP su login, reset, inviti) e `WRITE_LIMITER` (120/min per utente).
- **Client**: TanStack Query (`lib/client/*`), `api()` che normalizza gli errori; preferenze in localStorage + account (`lib/preferences/*`).

## 3ter. GitHub e permessi

- **Accesso**: GitHub App con autorizzazione utente. Ogni utente ha una `github_connection` (token cifrati AES-GCM con `TOKEN_ENCRYPTION_KEY`) e vede le repo dove l'app è installata **e** lui ha accesso (`/user/installations/*/repositories`). Per le chiamate si usa il token di chi agisce; per cron e webhook quello di chi ha esposto la repo.
- **Esposizione** per riga `github_repo` (utente × repo): `hidden`, `self`, `selected` (+ `github_repo_share`), `group`. **Progetto** = una repo GitHub (`github_repo_id` unico), membri in `project_member` con ruolo `owner`/`member`/`viewer`.
- **Permessi**: solo `can()` (`packages/core/src/permissions/can.ts`). Le liste filtrano le righe con `can()`; le singole risorse rispondono 404 a chi non deve vederle. L'accesso a un progetto dipende solo dall'appartenenza; la visibilità della repo decide chi si può aggiungere.
- **Webhook**: `POST /api/github/webhook`, firma verificata prima di tutto. Fase 3: eventi di installazione; push/PR/check nelle fasi 4 e 6.
- **Test**: il GitHub finto (`apps/web/src/test/fakeGithub.ts`) è un'app Hono; nei test di integrazione sostituisce `fetch`, negli e2e e in `pnpm dev` gira su `localhost:8799` (`GITHUB_API_URL` / `GITHUB_WEB_URL`).

## 3quater. Motore task

```
push su GitHub ──webhook──▶ syncProject ─┐
cron (15 min) ──service binding──▶ /api/internal/cron ─┤
"Sincronizza ora" ──▶ /api/projects/:id/sync ─┘
        │  albero Git con ETag → solo i .md con sha cambiato (max 30, resto in pending)
        ▼
parseTasks (core) → task_file (snapshot) → reconcile (core) → task_meta + activity_event
```

- **Lettura**: la repo è la fonte di verità; `task_file` conserva il parse per file (per l'API senza GitHub), `task_meta` i metadati di Kyon collegati per `stable_id`.
- **Scrittura**: leggi file → `relocate` della task → una riga cambiata (`edit.ts`) → PUT con `sha`; su 409 un solo nuovo tentativo. Dopo il commit il nuovo contenuto viene ri-parsato subito (niente attesa del webhook).
- **Budget Free**: 1 subrequest per l'albero + 1 per file cambiato (max 30); parse ≈ 2 ms per 30 KB; riconciliazione ≤ 6 ms nel caso peggiore misurato.

## 4. Realtime (Fase 7, impostato in Fase 0)

- Il Worker web autentica l'utente e inoltra l'upgrade WebSocket al DO tramite il binding `PROJECT_ROOM`/`GENERAL_ROOM` (`script_name: kyon-realtime`), passando un token breve firmato.
- I DO usano la **Hibernation API** (`ctx.acceptWebSocket`): una stanza inattiva viene tolta dalla memoria senza chiudere i socket e non consuma durata.
- Soglie proposte per l'archivio chat (da confermare con misure in Fase 7): il DO tiene gli ultimi **500 messaggi o 7 giorni** per stanza; un `alarm()` sposta su D1 lotti da **100 messaggi** alla volta; la ricerca unisce FTS5 su D1 e i messaggi recenti del DO.

## 5. Sviluppo locale

`pnpm dev` (`scripts/dev.ts`) applica le migrazioni al D1 locale e avvia tre processi:

- `wrangler dev` per `kyon-realtime` (porta 8788) e `kyon-cron` (porta 8789, `--test-scheduled`);
- `next dev` per il web (porta 3000), con i binding forniti da `initOpenNextCloudflareForDev()`.

Tutti puntano alla **stessa cartella di stato** `.wrangler/state` alla radice, così web, realtime e cron vedono lo stesso D1/KV/R2 simulato. I binding DO del web raggiungono il `wrangler dev` di realtime tramite il dev registry locale di wrangler. Nessun login Cloudflare, nessuna risorsa reale. Gli ID nei `wrangler.jsonc` sono segnaposto validi solo in locale.

## 6. Build, CI e deploy

- `pnpm build` → `opennextjs-cloudflare build` + `populateCache local` in `apps/web` (`.open-next/`). I Worker realtime e cron vengono impacchettati da wrangler al deploy.
- `pnpm size` (`scripts/size.ts`) esegue `wrangler deploy --dry-run` per ogni Worker, misura il gzip dei moduli caricati (mappe escluse), scrive `.size/report.json` e **fallisce oltre 2,4 MB**.
- `.github/workflows/ci.yml`: format, typecheck, lint, test, build, size su ogni push e PR.
- `.github/workflows/deploy.yml`: parte solo quando la CI è verde su un push a `main`. `scripts/deploy.ts`, senza passi interattivi:
  1. legge `CLOUDFLARE_API_TOKEN` e `CLOUDFLARE_ACCOUNT_ID`;
  2. trova o crea D1 `kyon-db`, KV `kyon-kv` e R2 `kyon-files`;
  3. scrive `wrangler.deploy.json` (ignorato da git) accanto a ogni `wrangler.jsonc` con gli ID reali;
  4. applica le migrazioni D1 remote;
  5. pubblica `kyon-realtime` (proprietario dei DO), poi `kyon-cron`, poi `kyon-web`.
     Senza secrets il deploy viene saltato con un avviso, senza rendere rossa la pipeline.

## 7. Portabilità (Piano B)

Se bundle o CPU non entrano nel Free e non si passa a Paid, `apps/web` migra a **Vite + React SPA statica + API Hono**. Per renderlo economico:

- la logica di dominio vive in `packages/core` (pura) e in `apps/web/src/lib` (adattatori: db, auth, github), non nei componenti Next;
- le route API sono funzioni `Request → Response` standard;
- i Worker realtime e cron sono già indipendenti da Next.

## 8. Misure

| Data       | Worker        | gzip      | raw        | Note                       |
| ---------- | ------------- | --------- | ---------- | -------------------------- |
| 2026-10-26 | kyon-web      | 969,1 KiB | 4625,1 KiB | Fase 0, "hello world" + D1 |
| 2026-10-26 | kyon-realtime | 0,6 KiB   | 1,4 KiB    | Fase 0                     |
| 2026-10-26 | kyon-cron     | 0,4 KiB   | 0,7 KiB    | Fase 0                     |

Lo storico completo per fase è in `docs/PROGRESS.md`.
