# CLAUDE.md — Kyon

Kyon è il gestionale privato del gruppo "Cerbero" (4 persone). Coordina progetti di sviluppo: task lette dai file `.md` delle repo GitHub, prompt per Claude Code legati alle task con tracciamento della PR che ne risulta, chat e thread, stato di commit/PR/CI. Interfaccia mobile-first, in italiano, estetica "Liquid Glass" in stile Apple, accessibile (WCAG 2.2 AA).

Leggi questo file all'inizio di ogni sessione. Specifiche funzionali complete: `docs/SPEC.md` (generato in Fase 0 da `KYON-PROMPT.md`). Stato del lavoro: `docs/PROGRESS.md`. Passi manuali per l'utente: `docs/SETUP.md`.

---

## 1. Principi guida

1. **Semplicità Apple**: poche schermate, gesti chiari, niente rumore. Se una funzione richiede spiegazioni, semplificala.
2. **Mobile-first**: si progetta per telefono (~390px), poi si adatta a iPad, desktop e landscape.
3. **La repo è la fonte di verità delle task.** Il database tiene solo metadati (assegnatario, priorità, scadenza, colonna, prompt, esecuzioni, commenti).
4. **Accessibile per costruzione**, non a posteriori (vedi §9). Il vetro non deve mai compromettere la leggibilità.
5. **Resta nei limiti del piano Cloudflare Free** finché possibile (vedi §6): ogni scelta pesante si misura, non si suppone.
6. **Sicurezza e privacy prima delle funzioni**: i token GitHub sono segreti, la visibilità delle repo è una promessa.
7. **Piccoli passi verificabili**: ogni fase finisce con test verdi, commit su `main` e `docs/PROGRESS.md` aggiornato.

## 2. Stack (decisioni prese: non rimetterle in discussione senza motivo)

| Area             | Scelta                                                                                                              |
| ---------------- | ------------------------------------------------------------------------------------------------------------------- |
| Framework        | Next.js (App Router) + React + TypeScript strict, su Cloudflare Workers via **OpenNext** (`@opennextjs/cloudflare`) |
| Monorepo         | **pnpm** workspaces: `apps/web`, `workers/realtime`, `workers/cron`, `packages/core`                                |
| Database         | **D1** (SQLite) con **Drizzle ORM**, migrazioni versionate                                                          |
| Realtime         | **Durable Objects** (backend SQLite), WebSocket Hibernation API, in un Worker separato (`workers/realtime`)         |
| File             | **R2**: avatar e allegati, accesso solo tramite Worker con controllo permessi                                       |
| Cache/rate limit | **KV** per cache; rate limit con il binding **Workers Rate Limiting** (KV Free ha solo 1.000 scritture/giorno)      |
| Auth             | **Better Auth**: email+password, registrazione solo su invito, GitHub collegabile come account aggiuntivo           |
| GitHub           | **GitHub App** (autorizzazione utente con token a scadenza + webhook). Per l'utente è solo "Collega GitHub"         |
| UI               | Tailwind CSS, componenti stile shadcn/ui (Radix), `motion` per animazioni a molla, **`lucide-react`** per le icone  |
| Font             | **Font di sistema** (`-apple-system, system-ui, "Segoe UI", …`). Nessun font ospitato                               |
| Email            | **Cloudflare Email Service** dietro interfaccia `EmailProvider` (vedi §6)                                           |
| Push             | Web Push con chiavi VAPID, implementato con WebCrypto (niente librerie Node-only)                                   |
| PWA              | Manifest, service worker, cache offline in sola lettura                                                             |
| Test             | **Vitest**, **Playwright** + **axe-core**, **Lighthouse CI**. GitHub e email sempre mockati                         |
| Qualità          | ESLint, Prettier, `tsc --noEmit`: obbligatori prima di ogni commit                                                  |

Non aggiungere dipendenze pesanti senza misurare l'impatto sul bundle. Preferisci API Web standard e piccole librerie pure.

## 3. Struttura del repository

```
kyon/
├─ CLAUDE.md
├─ KYON-PROMPT.md           # prompt di partenza (non modificare dopo l'avvio)
├─ docs/
│  ├─ SPEC.md  ARCHITECTURE.md  PROGRESS.md
│  ├─ SETUP.md              # passi manuali: Cloudflare, GitHub App, VAPID, secrets
│  └─ A11Y.md               # scelte di accessibilità e come verificarle
├─ apps/web/                # Next.js + OpenNext
│  ├─ src/app/              # home, progetti, chat, persone, settings, join, api
│  ├─ src/components/       # ui/ (design system glass), feature/
│  ├─ src/lib/              # auth, db, github, permissions, notifications, i18n
│  └─ src/db/               # schema Drizzle + migrazioni
├─ workers/realtime/        # Durable Objects (ProjectRoom, GeneralRoom)
├─ workers/cron/            # scheduled handler (riconciliazione GitHub, scadenze)
├─ packages/core/           # logica pura: parser .md, permessi, template prompt, marcatore run
└─ .github/workflows/       # ci.yml (test) + deploy.yml (deploy su push a main)
```

La logica di dominio pura (parser Markdown, riconciliazione task, permessi, template prompt, generazione/lettura del marcatore `Kyon-Run`) vive in `packages/core` con test unitari completi. Nessun import di Next o Cloudflare lì dentro.

**API (regola importante per il bundle)**: tutta l'API JSON sta in `apps/web/src/lib/server/routes/*.ts` ed è montata dal router Hono `src/lib/server/router.ts` dentro **un'unica** route Next, `app/api/[[...route]]/route.ts`. Non creare altri `route.ts` sotto `app/api`: Turbopack duplica il codice condiviso (Better Auth, Drizzle…) in ogni route e il Worker supera la soglia (misurato: 2,5 MB con 15 route contro 1,6 MB con una). Le pagine sono shell statiche; i dati arrivano dalle API (con controllo sessione) tramite TanStack Query.

## 4. Comandi (devono funzionare su macOS, Linux e Windows)

```
pnpm install
pnpm dev                  # migra D1 locale, poi wrangler dev (realtime :8788, cron :8789) + next dev (:3000), stato locale condiviso in .wrangler/state; crea apps/web/.dev.vars e stampa il link /join del primo account
pnpm typecheck && pnpm lint
pnpm format:check         # prettier (pnpm format per correggere)
pnpm test                 # vitest (progetti: core, web, workers, scripts)
pnpm test packages/core/src/limits.test.ts       # un singolo file (senza `--`); aggiungi -t "nome" per un singolo test
pnpm e2e                  # playwright + axe sul bundle di produzione (richiede pnpm build); mobile/tablet/desktop; D1 pulito a ogni giro, admin creato dal progetto `setup`
pnpm e2e e2e/shell.spec.ts --project=desktop   # un file / un progetto; -g "nome" per un singolo test
pnpm lighthouse           # lhci: accessibilità ≥ 95, prestazioni mobile ≥ 80 (richiede pnpm build)
pnpm theme:gen            # rigenera apps/web/src/styles/themes.generated.css da packages/core/src/theme.ts
pnpm icons:gen            # rigenera le icone PNG PWA/Apple dai logo SVG in apps/web/public/brand
pnpm admin:create-invite  # crea un invito nel D1 locale e stampa il link (--remote --url <sito> per la produzione)
pnpm db:generate <nome>   # migrazione da schema Drizzle (apps/web/src/db/schema.ts → src/db/migrations)
pnpm db:migrate:local     # D1 locale
pnpm build                # bundle OpenNext di apps/web (+ cache statica dei prerender)
pnpm size                 # misura gzip del bundle di ogni Worker, fallisce oltre 2,4 MB (richiede pnpm build)
pnpm build && pnpm run deploy  # usato dalla CI. Attenzione: `pnpm deploy` senza `run` è un comando interno di pnpm
```

Cron in locale: `curl http://localhost:8789/cdn-cgi/handler/scheduled`. Anteprima del bundle di produzione: `pnpm --filter @kyon/web preview` dopo `pnpm build`. Galleria componenti: `/dev/ui` (nascosta quando `KYON_ENV=production`).

Next.js 16 ha API diverse da quelle che potresti ricordare (es. `proxy` al posto di `middleware`, `params` asincroni): prima di usare un'API di Next leggi la guida in `apps/web/node_modules/next/dist/docs/` (vedi `apps/web/AGENTS.md`).

Script in Node/TypeScript, **non in bash**. Niente comandi specifici di una shell. Usa `cross-env` dove serve, percorsi con `path`, `.gitattributes` per fine riga LF. Se un comando non esiste ancora, crealo nella fase in cui serve e documentalo qui.

## 5. Ambiente di lavoro (importante)

Claude Code gira **nel cloud** (iPhone, Mac, Windows) e a volte **in CLI su Windows**. Quindi:

- **Nessun passo interattivo**: mai `wrangler login`, mai browser OAuth. Autenticazione Cloudflare solo con `CLOUDFLARE_API_TOKEN` e `CLOUDFLARE_ACCOUNT_ID` da variabili d'ambiente / secrets di GitHub Actions.
- Lo sviluppo e i test girano in locale con risorse simulate: **non dipendono da risorse Cloudflare reali**.
- Tutto ciò che richiede mani umane (creare D1/R2/KV, GitHub App, VAPID, token API, secrets) è scritto in `docs/SETUP.md` come **guida passo-passo con i valori da copiare**, e in `docs/PROGRESS.md` alla voce "In attesa dell'utente".
- La sessione cloud è effimera: committa spesso, tieni `docs/PROGRESS.md` aggiornato, non lasciare stato solo in locale.
- Dispositivi del gruppo: **iPhone, Mac/iPad, Windows/Linux**. Browser: Safari (iOS/macOS), Chrome/Edge, Firefox. Testa `backdrop-filter`, safe area e PWA su questi.

## 6. Vincoli Cloudflare Free (importante)

L'utente parte sul piano **Free** accettando il rischio. Limiti verificati sulla documentazione:

- Worker: **3 MB dopo gzip** (10 MB su Paid). **CPU 10 ms per richiesta** e per cron (Paid fino a 5 min). 100.000 richieste/giorno, 1.000/minuto.
- **Invio email**: richiede Workers Paid. Sul Free si può scrivere solo a destinatari verificati (da controllare sul campo).

Regole di conseguenza:

1. Esegui `pnpm size` a ogni fase e registra i numeri in `docs/PROGRESS.md`. **Soglia di allarme: 2,4 MB gzip per Worker.**
2. Server Components e pagine statiche dove possibile; dati dinamici via API leggere; niente SSR pesante nelle route calde.
3. Hashing password: PBKDF2 con WebCrypto, iterazioni scelte **misurando** il CPU time. Se non entra in modo affidabile nei 10 ms, **segnalalo subito**; non abbassare le iterazioni sotto valori sicuri. **Deciso in Fase 2** (misura: 600k iterazioni ≈ 88 ms sul Worker): PBKDF2-SHA256 600.000 iterazioni **nel browser** (salt legato all'email), il server riceve solo la chiave derivata e la ri-hasha con PBKDF2 10.000 iterazioni e salt casuale (≈ 1 ms). Vedi `packages/core/src/auth/password.ts`. Non riportare l'hashing pesante sul server.
4. Niente polling: realtime via WebSocket (Hibernation API), aggiornamenti repo via webhook + cron a bassa frequenza.
5. Email dietro `EmailProvider`. Se l'invio non è disponibile, l'app resta completa con notifiche in-app e push. Gli inviti sono link/codici, non email.
6. **Piano B documentato**: se bundle o CPU non rientrano e l'utente non passa a Paid, la migrazione è `apps/web` → Vite + React SPA statica + API Hono. Tieni la logica fuori dai componenti Next (in `packages/core` e `src/lib`) per renderla portabile.

## 7. Sicurezza

- Token GitHub cifrati a riposo (AES-GCM, chiave da secret del Worker). Mai nei log, mai nel client.
- Webhook GitHub: firma HMAC SHA-256 verificata a tempo costante; payload non firmati rifiutati.
- Registrazione **solo con invito valido**: codice monouso, salvato come hash, con scadenza (default 7 giorni), creato da un admin.
- Tutti i controlli di accesso passano da **`can(user, action, resource)`** in `packages/core`, con tabella di verità testata. Nessun controllo sparso nei componenti.
- Ruoli di progetto: `owner`, `member`, `viewer`. Ruolo globale: `admin`.
- Visibilità repo per singola repo: `self`, `selected`, `group`. Una repo non visibile a un utente non compare in nessuna query, nemmeno come conteggio.
- **Sessioni lunghe** (fino a logout esplicito): per compensare, elenco sessioni/dispositivi con revoca, revoca totale al cambio password, l'admin può revocare le sessioni di un utente, rotazione del token di sessione.
- Rate limit su login, uso invito, API di scrittura (binding Workers Rate Limiting `AUTH_LIMITER`/`WRITE_LIMITER`, nessuna scrittura su storage). Intestazioni di sicurezza e CSP. Cookie `HttpOnly`, `Secure`, `SameSite=Lax`. Le scritture accettano solo richieste dalla stessa origine.
- Allegati: tipi consentiti (immagini, PDF/documenti, file testo/codice, zip), **max 10 MB**, nomi sanificati, download solo tramite Worker con verifica permessi, `Content-Disposition` e `X-Content-Type-Options: nosniff`.
- **Anteprime link**: il server recupera metadati solo per link a GitHub e a Kyon (mai URL arbitrari: rischio SSRF).
- Feed calendario `.ics`: URL con token segreto per utente, revocabile e rigenerabile.
- Mai segreti nel repo. Locale: `.dev.vars` (gitignored). Remoto: secrets di Cloudflare/GitHub.

## 8. Design system "Liquid Glass"

- Superfici: `backdrop-filter: blur() saturate()` su strati semitrasparenti, bordo interno a gradiente speculare sottile, ombre morbide a più livelli, leggera grana. **Sfondo mesh gradient statico**, con cambio morbido quando cambia l'accento (nessuna animazione continua).
- Navigazione: **tab bar a pillola in basso su mobile**; **sidebar a pillola flottante in vetro su desktop**. Voci: Home, Progetti, Chat, Settings (le persone si raggiungono da Home e dalla chat).
- Palette: i colori di sistema Apple come accento selezionabile in Settings, in tema chiaro/scuro/sistema.
- Tipografia: font di sistema, scala in pochi gradini tramite token, dimensione base regolabile dall'utente (§9).
- Icone: **Lucide**; stato attivo con tratto/riempimento più marcato.
- Movimento: **molto fluido e "vivo"**: molle, transizioni condivise lista↔dettaglio, vetro che reagisce al tocco, sempre disattivabile (§9).
- Layout: mobile; **iPad a due colonne** (lista + dettaglio); **desktop** con sidebar a pillola, contenuto e pannello laterale (es. dettaglio task o chat accanto al kanban); **larghezza massima** del contenuto su monitor grandi; **landscape su telefono** curato.
- Mobile UX: input con testo ≥ 16px (niente zoom di Safari); chat agganciata sopra la tastiera con `visualViewport`; **bottom sheet trascinabili** su mobile (dialog classici su desktop); swipe indietro e pull-to-refresh coerenti con iOS senza conflitti con i gesti di sistema.
- Feedback: **toast con "Annulla"** per azioni reversibili; conferma esplicita per azioni distruttive; UI ottimistica con rollback se il commit su GitHub fallisce; **indicatore di sincronizzazione** con la repo ("Salvo su GitHub…", "Salvato", "Errore, riprova").
- Prestazioni: pochi elementi con blur sovrapposti. **Degrado graduale automatico** (rilevamento di dispositivo debole o frame persi) verso una modalità "Leggera" (meno blur/ombre), con opzione manuale in Settings.
- Testi UI in **italiano**, tono **amichevole e diretto, dai del "tu"**, brevi e chiari; centralizzati in `src/lib/i18n/it.ts`.
- **Logo e icona**: tema Cerbero + Liquid Glass (tre sfere/teste di vetro stilizzate, originali). Fornisci due varianti SVG e le icone PWA.

## 9. Accessibilità (obiettivo WCAG 2.2 AA)

- **Contrasto garantito**: il testo sta sempre su uno strato con contrasto AA; il vetro è decorativo ai bordi. Test automatico dei contrasti per ogni **accento × tema × alto contrasto**.
- **Accenti**: i colori Apple (giallo, menta, azzurro…) non passano AA come testo su chiaro. L'app usa l'accento per riempimenti e deriva automaticamente una variante di testo che passa AA e sceglie testo chiaro/scuro sui pulsanti.
- **Settings di accessibilità**: dimensione del testo regolabile (segue anche il sistema), alto contrasto, riduci trasparenza e riduci movimento (override oltre alle preferenze del sistema), **non solo colore** (priorità e stati hanno anche simbolo/forma).
- Rispetta `prefers-reduced-motion`, `prefers-reduced-transparency`, `prefers-contrast`, `prefers-color-scheme`.
- **Tastiera e alternative al trascinamento**: menu **"Sposta in…"** su ogni task + frecce da tastiera per kanban e calendario; focus sempre visibile; ordine di tabulazione logico; scorciatoie documentate.
- **Screen reader**: nuovi messaggi annunciati con `aria-live="polite"` (disattivabile); spostamenti del kanban annunciati solo se riguardano l'utente; l'orologio analogico ha un'etichetta testuale dell'ora che **non** si aggiorna ogni secondo; gestione del **focus** a ogni cambio pagina e apertura/chiusura di sheet e dialog (focus sul titolo, ritorno all'elemento di origine).
- Bersagli di tocco ≥ 44px, safe area iOS, `lang="it"`, etichette ARIA, titoli gerarchici, testo alternativo opzionale per le immagini caricate.
- **CI**: axe-core nei test Playwright (fallisce su violazioni gravi), test dei contrasti, Lighthouse CI con accessibilità ≥ 95 e soglie di prestazioni su mobile. Documenta in `docs/A11Y.md` come verificare a mano con VoiceOver/TalkBack (facoltativo ma consigliato).

## 10. Convenzioni di codice

- TypeScript `strict`, niente `any` senza commento motivato. Validazione input con Zod su ogni route/azione.
- Codice, commenti e messaggi di commit in **inglese**; testi UI in italiano.
- **Conventional Commits** (`feat:`, `fix:`, `chore:`, `docs:`, `test:`). Commit piccoli e frequenti.
- Componenti piccoli, funzioni pure dove possibile, side effect ai bordi. Errori espliciti, mai `catch` vuoti.
- Ogni feature con test: unit in `packages/core`, e2e per i flussi principali.
- Date in UTC nel DB, formattazione nel fuso dell'utente (default Europe/Rome).

## 11. Come lavorare e consegnare

1. Leggi `docs/PROGRESS.md` e riprendi dalla fase corrente.
2. Pianifica brevemente, poi implementa. Prima di chiudere una fase: `pnpm typecheck && pnpm lint && pnpm test && pnpm size` ed e2e/axe rilevanti.
3. **Consegna: push diretto su `main` a fine di ogni fase.** La CI esegue test, a11y e `size`, e **solo se passano** il workflow di deploy pubblica su Cloudflare (migrazioni D1 incluse). Non committare su `main` codice che rompe la CI.
4. Aggiorna `docs/PROGRESS.md` (fatto, decisioni, numeri del bundle, debiti tecnici, "In attesa dell'utente").
5. **Fermati e chiedi** solo quando serve un'azione manuale dell'utente o una decisione che cambia lo stack. In tutti gli altri casi scegli l'opzione più semplice e coerente con questo file, annotala in `docs/PROGRESS.md` e vai avanti.
6. Non inventare dati: niente seed, l'app parte vuota. Per sviluppo e test usa fixture isolate.

## 12. Decisioni di prodotto già prese (riassunto)

- Gruppo chiuso, registrazione su invito. Login email+password, nessuna passkey/2FA, nessuna verifica email obbligatoria. Sessione fino a logout esplicito.
- GitHub: collegamento account (GitHub App), repo e visibilità per singola repo (solo io / persone scelte / tutti). 1 progetto = 1 repo. GitHub App creata a mano con guida in `SETUP.md`.
- Task: lette dai `.md` (checkbox + elenchi sotto sezioni "di piano", un'area per ogni file), scrittura **bidirezionale**, modalità di commit **configurabile per progetto**.
- Kanban: colonne di default **Da fare · In corso · Fatto**, personalizzabili; si muovono da sole in base a prompt e PR (annullabile). Viste lista e calendario (mese/agenda/settimana). Aggiornamento live.
- Prompt → esecuzione → PR: marcatore `Kyon-Run: <id>` nella descrizione della PR e nei trailer dei commit; collegamento automatico con suggerimento+conferma di ripiego; chiusura automatica della task al merge, annullabile, con "Verifica stato PR".
- Chat: generale + per progetto, thread di progetto e di task; **nessun DM**; reazioni, risposte, modifica/elimina, pin, anteprime link GitHub/Kyon, allegati (immagini compresse sul telefono, max 10 MB), ricerca, presenza; retention illimitata.
- Notifiche in-app, email, push PWA; orari silenziosi di default 23:00–08:00.
- Home personalizzabile; profili ricchi; ricerca globale e palette comandi; tour iniziale; feed `.ics`; cronologia globale; export e pagina "salute" per l'admin.
- Nome **Kyon**; sottodominio `.workers.dev` per ora.
