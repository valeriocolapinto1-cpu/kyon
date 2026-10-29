# Kyon — Stato del lavoro

Memoria tra le sessioni: **leggi questo file per primo** e riprendi dalla fase corrente. Aggiornalo durante il lavoro, non solo a fine fase.

## Fase corrente

**Tutte le fasi fatte.** Restano i passi manuali ("In attesa dell'utente") e la prova sui dispositivi in `docs/RELEASE.md` §3.

| Fase | Titolo                                          | Stato    |
| ---- | ----------------------------------------------- | -------- |
| 0    | Scaffold e infrastruttura                       | ✅ fatta |
| 1    | Design system Liquid Glass, a11y di base, shell | ✅ fatta |
| 2    | Auth, inviti, admin, Settings account           | ✅ fatta |
| 3    | GitHub, repo, visibilità, progetti, membri      | ✅ fatta |
| 4    | Motore task da `.md`                            | ✅ fatta |
| 5    | Pagina progetto: Task                           | ✅ fatta |
| 6    | Prompt, esecuzioni, tracciamento PR; Status     | ✅ fatta |
| 7    | Realtime, chat e thread                         | ✅ fatta |
| 8    | Home, Progetti, Chat, Persone, ricerca, extra   | ✅ fatta |
| 9    | Notifiche                                       | ✅ fatta |
| 10   | PWA offline, hardening, rilascio                | ✅ fatta |

## In attesa dell'utente

- [ ] **Cloudflare + secrets GitHub** (`docs/SETUP.md` §A): sottodominio `workers.dev`, attivazione R2, token API, `CLOUDFLARE_API_TOKEN` e `CLOUDFLARE_ACCOUNT_ID` nei secrets della repo. Finché mancano, il workflow Deploy viene saltato con un avviso (la CI resta verde).
- [ ] (Facoltativo) Secret GitHub `ADMIN_BOOTSTRAP_CODE` per creare il primo account admin dal telefono (`docs/SETUP.md` §A6). In alternativa `pnpm admin:create-invite --remote`.
- [ ] Dopo il primo deploy: aprire `/api/health` e guardare **CPU Time** nelle metriche di `kyon-web` (prima misura reale della CPU), in particolare su `/api/auth/sign-in/email`.
- [ ] **GitHub App** (`docs/SETUP.md` §B): creala, poi secrets `KYON_GH_CLIENT_ID`, `KYON_GH_CLIENT_SECRET`, `KYON_GH_WEBHOOK_SECRET` e variabile `KYON_GH_APP_SLUG` nella repo. Senza, Settings → GitHub dice che l'app non è configurata.
- [ ] (Facoltativo) **Email** (`docs/SETUP.md` §D2): dominio su Cloudflare Email Service, destinatari verificati sul piano Free, variabile `KYON_EMAIL_FROM` nella repo. Senza, le notifiche arrivano in Kyon e come push.
- [ ] Su un **iPhone reale**: installare Kyon nella schermata Home e attivare le push (Settings → Notifiche → Invia una prova). Le push non sono verificabili negli e2e (nessun servizio push reale).
- [ ] Un `.md` reale di Biohybrid (es. `PROSSIMI-PASSI.md`) per le fixture del parser (serve in Fase 4).

## Revisione grafica (subagenti agency-agents)

Fatta con UI Designer, Accessibility Auditor, UX Architect e Finish-Gate Reviewer (installati in `.claude/agents/`). Applicato: vetro più visibile (mesh e superfici più marcati, bordi e testo secondario ritoccati nei temi; contrasti ancora garantiti dai test), tour di benvenuto solo in Home, checklist "Per iniziare" nella Home vuota, orologio rimosso, colonne di Progetti 5/7, sidebar allineata in alto, Chat con pannello vuoto vero e conversazione unica aperta da sola su schermi larghi, Settings con chip su una riga scorrevole e riga "Dimensione del testo" ripulita, un solo "Nuovo progetto" a elenco vuoto, testo della Cronologia vuota. Non è un difetto: le sezioni Settings "vuote" sono placeholder di `Deferred` (si montano all'interazione, per la CPU del piano Free); "Riprendi: Settings" usa il titolo della pagina. Bundle kyon-web 1824,5 KiB gzip.

## Dopo il rilascio: file checklist, CLAUDE.md nei prompt, titoli brevi

- **File checklist** (migrazione `0011`, `project.checklist_files`): un progetto nuovo non legge nulla finché il proprietario non sceglie quali `.md` sono checklist (la scheda Task lo chiede; poi "Altre azioni → File checklist"). La sync scarica solo i file scelti; un file tolto dalla scelta sparisce dalla board ma le sue task sono solo nascoste (orfane, recuperabili 30 giorni), e rimetterlo riporta le stesse task. Cambiare la scelta azzera l'ETag dell'albero (altrimenti la sync vedrebbe "nulla di nuovo"). `GET /api/projects/:id/markdown-files` elenca i candidati (con le task già lette). Un `TASKS.md` creato da Kyon viene scelto da solo. Nella board ogni colonna raggruppa le card per file in tendine (aperta da sola se in quella colonna c'è un solo file). Decisione: per i progetti già esistenti la scelta parte vuota (richiesta dell'utente), quindi mostrano il selettore alla prima apertura.
- **CLAUDE.md nella finestra prompt**: la sync legge il `CLAUDE.md` della repo insieme all'albero (una richiesta in più, solo se il blob cambia; `project_sync.claude_md`, migrazione `0010`, max 30.000 caratteri). Il prompt copiato lo include tra corpo e blocco Kyon, a meno che il modello lo piazzi con `{{claude_md}}`; le righe che sembrano un marcatore `Kyon-Run` sono omesse. L'editor dice se la repo ce l'ha e quanto è grande.
- **Titoli brevi** (`summarizeTask` in `packages/core`): riassunto deterministico (niente modello AI, per restare nel piano Free): senza Markdown, senza parentesi, fino alla prima frase, poi taglio a parola con "…". Usato nel menu Task di "Nuovo prompt", nel titolo proposto e nei titoli dell'elenco prompt; il testo intero resta sotto il menu.
- Dai test: la sync ora non orfana le task con albero troncato o file illeggibili (PR #2); `projectFromRepo` dei test sceglie i file di default.
- Debito: l'opzione "Mostra i file di archivio" è inutile quando c'è una scelta (i file di archivio si scelgono nell'elenco); cambiare le parole chiave "di piano" non rilegge i file già letti; Home, ricerca e feed `.ics` mostrano ancora le task già lette dei progetti che non hanno ancora scelto i file.
- Numeri: kyon-web 1829,8 KiB gzip.

## Numeri del bundle (gzip, `pnpm size`)

Soglia di allarme 2,4 MB per Worker, limite Free 3 MB.

| Fase | kyon-web   | kyon-realtime | kyon-cron | Note                                                                                                                |
| ---- | ---------- | ------------- | --------- | ------------------------------------------------------------------------------------------------------------------- |
| 0    | 969,1 KiB  | 0,6 KiB       | 0,4 KiB   | Next 16.4.3 + OpenNext 1.20.13, pagina + `/api/health` con D1                                                       |
| 1    | 1307,4 KiB | 0,6 KiB       | 0,4 KiB   | + Tailwind, Radix (dialog, radio, toast, switch, slider), motion, cmdk, lucide                                      |
| 2    | 1574,0 KiB | 0,6 KiB       | 0,4 KiB   | + Better Auth, TanStack Query, Hono. Con 15 route Next separate era 2531 KiB (oltre soglia): ora un'unica route API |
| 3    | 1597,4 KiB | 0,6 KiB       | 0,4 KiB   | + GitHub, repo, progetti (tutto nel router unico)                                                                   |
| 4    | 1606,8 KiB | 0,6 KiB       | 0,7 KiB   | + motore task, sync, scritture; cron chiama il web via service binding                                              |
| 5    | 1669,4 KiB | 1,8 KiB       | 0,7 KiB   | + metadati, colonne, etichette, cronologia, ticket realtime; entry del Worker per i WebSocket                       |
| 6    | 1697,7 KiB | 1,8 KiB       | 0,7 KiB   | + prompt, versioni, template, esecuzioni, webhook PR/CI, Status, CLAUDE.md                                          |
| 7    | 1745,9 KiB | 2,2 KiB       | 0,7 KiB   | + chat (stanze, messaggi, reazioni, pin, ricerca FTS5, allegati R2, anteprime), presenza e "sta scrivendo"          |
| 8    | 1770,7 KiB | 2,2 KiB       | 0,7 KiB   | + Home con dati, Persone, Cronologia, ricerca globale, feed .ics, tour, scorciatoie                                 |
| 9    | 1810,6 KiB | 2,2 KiB       | 0,7 KiB   | + notifiche (in-app, Web Push RFC 8291/8292 con WebCrypto, email via EmailProvider), presenza interrogabile dal DO  |
| 10   | 1809,0 KiB | 2,2 KiB       | 0,7 KiB   | + PWA offline, CSP, audit permessi, export, Salute; `motion` fuori dal primo caricamento                            |

## Misure di CPU / latenza (locali, indicative)

Tempo totale della richiesta su workerd locale (`wrangler dev` sul bundle di produzione, sandbox a 4 core). **Non è il CPU time di Cloudflare**, ma un tetto approssimativo: il costo di base di workerd in locale è ~4 ms (file statico).

| Fase | Route           | Senza cache statica | Con cache statica | Note                                 |
| ---- | --------------- | ------------------- | ----------------- | ------------------------------------ |
| 0    | `/` (prerender) | ~45 ms              | ~8 ms             | per questo la cache statica è attiva |
| 0    | `/api/health`   | ~11 ms              | ~11 ms            | include una query D1 locale          |

**Pagina statica vs dinamica** (Fase 3, tempo totale locale): shell statica ~10 ms, pagina renderizzata dal Worker (`/join/[code]`) ~30 ms, galleria `/dev/ui` ~33 ms, API con D1 ~11–13 ms. Per questo tutte le pagine restano statiche e gli identificativi viaggiano in query string.

**Motore task** (Fase 4, Node sullo stesso host): parse del file Biohybrid (1,5 KB, 7 task) 0,13 ms; file da 30 KB con 140 task 2,2 ms; riconciliazione nel caso peggiore (tutti gli id cambiati, 140 task) 5,8 ms dopo l'ottimizzazione (era 54 ms).

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
| 8    | `/` (loggato)         | 86          | 100           | 100            |
| 8    | `/progetti` (loggato) | 87          | 100           | 100            |
| 8    | `/chat` (loggato)     | 86          | 100           | 100            |
| 8    | `/settings` (loggato) | 80          | 100           | 100            |
| 8    | `/login`              | 96          | 100           | 100            |
| 9    | `/` (loggato)         | 76–84       | 100           | 100            |
| 9    | `/progetti` (loggato) | 81–89       | 100           | 100            |
| 9    | `/chat` (loggato)     | 80–89       | 100           | 100            |
| 9    | `/settings` (loggato) | 74–77       | 100           | 100            |
| 9    | `/login`              | 90–95       | 100           | 100            |

Dalla Fase 9 ogni pagina è misurata 3 volte con una **sessione nuova per pagina** (vedi decisioni Fase 9: prima le pagine dopo la prima erano misurate da sloggato). Gli intervalli sono i 3 giri su questa macchina, che oscilla di ±8 punti.

## Log delle fasi

### Fase 10 — PWA offline, hardening, rilascio ✅ (2026-10-27)

Fatto:

- **Offline in sola lettura** (`public/sw.js`): pagine e dati principali (Home, progetti, task, prompt, chat, notifiche, cronologia) dalla rete e, senza rete, dall'ultima copia salvata sul dispositivo; file statici con hash in cache una volta sola; le scritture non passano mai dalla cache. **Banner "Sei offline"** e scritture rifiutate con un messaggio chiaro (niente modifiche perse in silenzio). Dati salvati cancellati all'**accesso** e all'**uscita** (sul dispositivo restano solo quelli di chi lo usa). Toast "Kyon è stato aggiornato — Ricarica" al cambio di versione.
- **Installazione guidata**: Settings → Installa Kyon con il pulsante nativo (Chrome/Edge), i passi per iPhone/iPad e un **promemoria discreto** in Home dopo 3 giorni d'uso, disattivabile.
- **Sicurezza** (revisione di `CLAUDE.md` §7): **CSP** e **HSTS** sulle risposte del Worker e sugli asset statici (identiche, verificate da un test); **audit automatico** di tutte le route dell'API (chi non ha una sessione è sempre rifiutato, tranne una lista pubblica motivata: health, auth, inviti, reset, webhook firmato, OAuth, feed `.ics` con segreto, cron con segreto, avatar); **rate limit centrale** su ogni scrittura (per IP, oltre a quelli per persona) con il binding Workers Rate Limiting; verificato che token GitHub cifrati, webhook HMAC a tempo costante, inviti monouso con hash, allegati con `nosniff` e sandbox, anteprime solo GitHub/Kyon restano come previsto.
- **Admin → Salute**: configurazione (GitHub App, push, email), ultimo webhook valido, ultimo giro del cron, sincronizzazione di ogni repo (nomi solo per i progetti di cui l'admin fa parte), errori, dispositivi push con errori, conteggi e dimensione del database (da `meta.size_after` di D1).
- **Esportazione** JSON e Markdown: progetti di cui l'admin fa parte (membri, colonne, metadati delle task, prompt con tutte le versioni, esecuzioni), discussioni e chat del gruppo.
- **Pulizia nel cron**: gli allegati caricati e mai inviati lasciano R2 dopo 24 ore (pochi per giro).
- **D1 Time Travel**: istruzioni passo-passo in `docs/SETUP.md` §E.
- **Dipendenze**: tolta `@kyon/core` dal Worker cron (non usata); le altre sono tutte in uso (`hono` alla radice serve a `@hono/node-server`).
- **Audit finale e checklist**: `docs/RELEASE.md` (automatico, manuale, prova sui dispositivi, tabella del piano Free).
- Test: 601 unit/integrazione (nuovi: audit dei permessi con controllo di mutazione, export e Salute solo admin e senza dati altrui, pulizia degli allegati), e2e **117/117** (nuovi: offline su telefono e desktop, Salute ed export).

Decisioni:

- L'export dell'admin **non** contiene i progetti di cui non fa parte: la promessa di visibilità vale anche per l'admin. Per il backup completo c'è D1 Time Travel.
- La CSP usa `'unsafe-inline'` per gli script: le pagine statiche non possono avere un nonce per richiesta (lo script di avvio del tema e il bootstrap di Next sono inline). Tutto il resto è limitato a questa origine.
- La copia offline è "prima la rete": i dati mostrati offline sono quelli dell'ultima visita, mai più vecchi del necessario quando c'è rete.

Debito tecnico / da controllare:

- CPU reale sul Worker (Metrics → CPU Time) dopo il primo deploy: tutte le misure finora sono su workerd locale.
- Prova sui dispositivi (`docs/RELEASE.md` §3), in particolare push su iPhone installato e VoiceOver.
- Prestazioni Lighthouse vicine alla soglia (80) su `/` e `/settings`: sulla CI passano (Fase 10 verde), nella sandbox cloud, più lenta, oscillano tra 70 e 82. Il tempo bloccante viene da render sincroni di React all'arrivo dei dati (le query usano `useSyncExternalStore`, che non si spezza in parti). Già fatto: snapshot delle preferenze e dell'ambiente stabili quando i valori non cambiano (niente render in più dopo l'idratazione), valore del contesto presenza memoizzato. Provati e scartati perché peggioravano: sezioni di Settings come chunk separati (più valutazioni di moduli) e sezioni rese in transizione (un unico commit grande). Risolto per `/settings` (2026-10-28, da 0,69–0,78 a 0,85–0,91 nella sandbox): le sezioni sotto la piega si montano al primo segno d'uso (tocco, tasto, scroll) o quando arrivano vicino allo schermo, al più tardi dopo 8 s (`Deferred when="interaction"`); un tasto le monta tutte, così Tab non salta sezioni.

### Fase 9 — Notifiche ✅ (2026-10-27)

Fatto:

- **Logica pura** (`packages/core/src/notifications`, test): eventi `mention`, `assigned`, `due`, `message`, `run` × canali `inapp`, `push`, `email`; preferenze sanificate (orari silenziosi `HH:MM` anche a cavallo della mezzanotte, nel fuso della persona, default **23:00–08:00**; "consenti menzioni dirette" spento); regole di consegna (chat silenziata: niente messaggi, menzioni solo in-app; chi ha la chat aperta: niente push/email e niente in-app per i messaggi; orari silenziosi: solo in-app); raggruppamento in finestra di 10 minuti.
- **Web Push senza librerie**: cifratura **RFC 8291** (aes128gcm, ECDH P-256 + HKDF + AES-GCM) e **VAPID RFC 8292** (JWT ES256) con WebCrypto, verificate sul **vettore ufficiale dell'RFC 8291** byte per byte e con un round-trip di decifratura. Endpoint accettati solo dei servizi push reali (FCM, Mozilla, Apple, Windows): niente SSRF da un endpoint falso.
- **Dati** (migrazione `0009_notifications`): `notification` (con `group_key` e conteggio), `push_subscription` (rimosse da sole su 404/410), `user.notification_prefs`.
- **Sorgenti**: menzioni (in qualsiasi chat) e nuovi messaggi (chat di progetto, thread, commenti delle task), assegnazioni (mai a sé stessi), esecuzioni (PR collegata, CI fallita, merge: una volta per stato, anche con webhook riconsegnati), **scadenze** dal cron (il giorno prima e il giorno stesso, dalle 08:00 di Roma, una volta sola, solo se l'assegnatario è ancora nel progetto).
- **Presenza dal DO**: `GET /presence` (con il segreto interno) dice chi ha la stanza aperta, per non mandare push a chi sta già guardando.
- **Email** dietro `EmailProvider`: Cloudflare Email Service (`env.EMAIL.send`) se al deploy c'è `KYON_EMAIL_FROM`, altrimenti nessun invio e la colonna Email in Settings è disattivata con spiegazione. Link assoluti con `KYON_URL`, letto dal deploy dal sottodominio `workers.dev`.
- **Chiavi VAPID** generate una volta sola dal deploy (secrets) e da `pnpm dev` (`.dev.vars`).
- **UI**: campanella con badge (header su telefono, sidebar altrove) aggiornata **live** dal socket del gruppo (viaggiano solo gli id dei destinatari, mai il contenuto); centro notifiche con "Segna tutte come lette"; **Settings → Notifiche**: matrice evento × canale (tabella con caselle etichettate), orari silenziosi, menzioni dirette, push su questo dispositivo, **guida iOS** (Aggiungi alla schermata Home) quando serve, "Invia una prova". Service worker `public/sw.js` per `push` e `notificationclick`.
- Test: 591 unit/integrazione (7 di integrazione: menzioni e messaggi raggruppati, nulla a chi non è nel progetto, letture solo proprie, push cifrate con VAPID e servizio finto, rifiuto di endpoint arbitrari, rimozione su 410, email secondo matrice, orari silenziosi, chat silenziata, promemoria scadenze una volta sola, prova); e2e: menzione → campanella live → apertura → letta (telefono e desktop), preferenze salvate e "Invia una prova".

Prestazioni (regressione della Fase 8 trovata dalla CI, Lighthouse 0,70/0,65):

- **Misura sbagliata**: Lighthouse riusava un cookie fisso, ma l'app ruota il token alla prima pagina della sessione: dalla seconda pagina in poi si misurava il rimbalzo al login. Ora ogni pagina ha una sessione nuova, e il tour iniziale è segnato come visto prima di misurare (lo vedi una volta sola).
- `motion` fuori dal primo caricamento: ingresso pagina e pillole attive (tab bar, sidebar, controlli segmentati, schede) in **CSS puro** (`SlidingPill`); i fogli (`Sheet`) caricano `motion` e Radix al primo gesto o alla prima apertura.
- Palette, scorciatoie, tour, centro notifiche, "Personalizza": codice caricato solo quando servono. Formatter `Intl` creati al primo uso (`lazy`). Orologio analogico senza `Intl` per frame (`zoneOffsetMs` una volta al minuto + `clockAt`).
- Settings: sezioni sotto la piega disegnate quando ci si avvicina (`Deferred when="visible"`, con il titolo vero al loro posto per gli screen reader; tutte subito con un `#ancora`).
- **Fila di avatar dei membri** nell'intestazione del progetto: con molti membri sbordava dallo schermo del telefono, la pagina si allargava e ogni bersaglio si spostava (due e2e su telefono fallivano in CI). Ora al massimo 5 volti e "+N". I controlli axe degli e2e verificano anche il **reflow** (WCAG 1.4.10): nessuno scorrimento orizzontale sotto i 600 px.
- Doppio tocco: `touch-action: manipulation` (niente zoom col doppio tocco, il pinch-zoom resta).
- Nuovo comando `pnpm perf` (profilo CPU 4× delle pagine da loggato).

Decisioni:

- Email spenta per default su tutti gli eventi (sul Free arriva solo a destinatari verificati); push accese per menzioni, assegnazioni, scadenze ed esecuzioni, spente per i messaggi.
- Le preferenze di notifica stanno in una colonna JSON di `user` (una riga per persona) invece di `notification_pref`.
- Un promemoria "once" viene registrato anche se l'in-app è spento (letto), così il cron non lo rimanda ogni 15 minuti.
- La CI gira anche sui branch `claude/**` (il deploy resta solo su `main`).

Debito tecnico / da controllare:

- `/settings` resta la pagina più pesante (Lighthouse 74–77 qui, l'asserzione usa il giro migliore dei tre): in Fase 10 valutare sezioni ancora più leggere.
- Raggruppamento delle notifiche per "progetto" oltre che per stanza: non necessario per 4 persone, per ora.

### Fase 8 — Home, Progetti, Chat, Persone, ricerca, extra ✅ (2026-10-26)

Fatto:

- **Home con dati reali** in una sola richiesta (`GET /api/home`): orologio, **ultimi contributi** (cronologia dei tuoi progetti, ora anche i **commit dei push** con messaggio e autore), **le mie task** (assegnate a te, aperte, per scadenza, con "Scaduta"/"Oggi"), **esecuzioni in corso** (prompt copiati, PR aperte, CI; prima le tue), **ultimi commenti** (thread di progetto e commenti delle task, con il punto esatto), **chi è online**. **Personalizza**: mostra/nascondi e riordina i blocchi con pulsanti su/giù (niente trascinamento obbligatorio), salvato nell'account.
- **"Ritorna dove hai lasciato"**: la pagina (con scheda, task, stanza…) viene salvata dopo 2 s di sosta, solo alla navigazione e mai allo scroll, in `localStorage` e nell'account (`user.last_location`); vince la più recente. Solo percorsi interni (`safeResumePath`: niente `//host`, `/api`, `/login`…). Le pagine possono indicare un titolo migliore dell'h1 con `data-resume-title` (il nome del progetto).
- **Presenza in tutta l'app**: un solo socket verso la stanza del gruppo (`GroupLiveProvider`), riusato dalla chat generale invece di aprirne un secondo.
- **Persone** (`/persone`, `/persone?id=`): elenco con presenza e stato; profilo con bio, stato, GitHub, repo esposte che puoi vedere, **progetti in comune**, attività recente e statistiche (task completate, prompt lanciati) **contate solo nei progetti in comune**. Raggiungibile dalla Home e dalla Chat.
- **Cronologia globale** (`/attivita`): tutta l'attività dei tuoi progetti, filtro per progetto, 30 alla volta.
- **Ricerca globale** nella palette Cmd/Ctrl+K (e lente su telefono): progetti, task, prompt (`/api/search`, `LIKE` con caratteri jolly neutralizzati) e messaggi (FTS5), con risultati raggruppati; ogni risultato porta al punto esatto (i commenti di una task aprono la task). Nella palette anche Persone, Cronologia, Scorciatoie e Tour.
- **Scorciatoie**: "?" ovunque (fuori dai campi di testo) apre l'elenco; anche da Settings → Aiuto e dalla palette.
- **Tour iniziale** al primo accesso: 4 passi, saltabile, ricordato nell'account (`user.tour_done_at`), riapribile da Settings → Aiuto o dalla palette.
- **Feed `.ics`** (Settings → Calendario): URL segreto (24 byte casuali, nel DB solo l'hash SHA-256), mostrato una volta, rigenerabile e revocabile; eventi di giornata intera con le scadenze delle task aperte **assegnate a te o a nessuno** nei progetti attivi; testo RFC 5545 con escape e piegatura a 75 ottetti (`packages/core/src/home/ics.ts`). Rate limit sul feed pubblico.
- **Progetti**: ogni riga mostra a destra l'**ultima task completata** (testo, chi, quando).
- Migrazione `0008_home`: `user.last_location`, `user.tour_done_at`, `user.ics_token_hash` (unico).
- Test: 573 unit/integrazione (8 nuovi di integrazione sulla **visibilità**: chi non è membro non vede task, commenti, contributi, esecuzioni, risultati di ricerca, attività né statistiche, neanche come conteggio; feed `.ics` con rotazione e revoca; percorsi di ripresa rifiutati); e2e **110/110**: Home (le mie task → apertura della task, "Riprendi", personalizzazione che resta dopo il reload, persone, cronologia filtrata) su telefono, tablet e desktop; ricerca globale da Cmd+K e dalla lente; "?"; feed `.ics` letto senza cookie e poi revocato; tour al primo accesso.

Decisioni:

- "Ultima posizione" come colonna JSON su `user` invece di una tabella `user_last_location`: una riga per persona, letta solo dalla Home.
- Il feed `.ics` contiene solo le task assegnate a te o a nessuno: le scadenze degli altri sarebbero rumore in un calendario personale.
- L'URL del feed si vede solo alla creazione (nel DB c'è l'hash, come per gli inviti): se lo perdi, lo rigeneri.
- Statistiche del profilo contate solo nei progetti in comune: altrimenti un numero rivelerebbe attività in progetti che non vedi.

Correzioni trovate dai test:

- Il link alla task dentro le righe di attività si distingueva solo per colore (axe `link-in-text-block`): ora è sottolineato.
- I fogli di solo testo (scorciatoie, tour) non erano scorrevoli da tastiera: `Sheet` ha l'opzione `readingContent`.
- Escape del punto e virgola nel testo `.ics`: mancava un backslash, quindi `;` restava senza escape (trovato dal lint `no-useless-escape`).

Debito tecnico / da controllare:

- Prestazioni Lighthouse di `/settings` a 80 (soglia 80): da alleggerire in Fase 10 (sezioni caricate quando servono).
- Pulizia degli allegati orfani su R2 ancora da fare (Fase 10).

### Fase 7 — Realtime, chat e thread ✅ (2026-10-26)

Fatto:

- **Stanze**: chat generale (`general`), chat di progetto (`project:<id>`), thread di progetto (`thread:<uuid>`, con titolo modificabile) e commenti della task (`task:<id>`). Permessi solo da `can()`: `group:chat` per la generale, `project:view` per leggere, `project:chat` per scrivere, `project:comment` per i commenti; chi non è membro riceve 404 (la stanza "non esiste").
- **Messaggi** (migrazione `0006_chat`): sequenza atomica per stanza (`UPDATE chat_room SET last_seq = last_seq + 1 RETURNING`, poi insert), **idempotenza** con `(room_id, client_id)` unico: un nuovo tentativo dopo un errore di rete non duplica mai. Risposte con citazione e salto al messaggio, **menzioni** con autocompletamento (combobox + listbox ARIA), Markdown con blocchi di codice e "Copia", modifica/elimina dei propri messaggi (eliminazione morbida: "Messaggio eliminato"), **reazioni** rapide, **pin** (owner/admin), non letti per stanza, silenzia stanza.
- **Ricerca** (migrazione `0007_chat_search`): FTS5 `chat_message_fts` (unicode61, senza accenti) tenuta da trigger; i risultati passano dagli stessi controlli di accesso (solo stanze che vedi).
- **Allegati**: corpo grezzo con `content-length`, max 10 MB, tipi consentiti da `packages/core/src/chat/files.ts` (SVG/HTML rifiutati, codice servito come `text/plain`), nomi sanificati, su R2 sotto `chat/<stanza>/<id>`, download solo dal Worker con verifica permessi, `nosniff`, `Content-Disposition` e CSP `sandbox`. **Immagini ridimensionate nel browser** (lato lungo 2048 px, WebP/JPEG) con **testo alternativo** facoltativo.
- **Anteprime link** solo per GitHub (repo che vedi, via `can('repo:view')`, in `caches.default`) e per link Kyon (`/progetti?id=…&task=…`, solo se sei membro). Nessun URL arbitrario (niente SSRF).
- **Realtime**: lo stesso socket del progetto (o della generale) porta `chat` (message/edit/delete/reaction/pin/room), `presence` (chi è online, calcolata dal DO a ogni connessione/chiusura) e `typing` (inoltrato dal DO agli altri, al massimo ogni 3 s). Dopo una riconnessione il client recupera i messaggi persi con `?after=<seq>`.
- **UI**: pagina Chat con elenco stanze (non letti, ultimo messaggio) e conversazione; su telefono la conversazione riempie lo schermo fino alla tab bar o alla tastiera (`useFillHeight` con `visualViewport`); "Nuovo thread" da ogni progetto; ricerca e messaggi fissati in fogli. Nel **dettaglio task** la sezione Commenti (conversazione compatta, live); sulla **card** il numero di commenti.
- Test: 558 unit/integrazione (11 di integrazione sulla chat: permessi, idempotenza, catch-up, menzioni, modifica/elimina, reazioni, pin, ricerca, allegati, anteprime); e2e **104/104**: chat live tra due persone su telefono e desktop (presenza, "sta scrivendo", risposta con menzione, reazione, modifica, pin, ricerca, eliminazione, immagine con testo alternativo, axe) e commenti della task con conteggio sulla card.

Decisioni:

- **D1 è l'archivio dei messaggi, non il SQLite dei Durable Object.** Il DO fa solo smistamento, presenza e "sta scrivendo". Motivi: un solo posto dove applicare `can()` e la visibilità, ricerca FTS5 senza unire due fonti, nessun `alarm()` di travaso da tenere nei 10 ms, e i volumi di un gruppo di 4 persone stanno larghi nei limiti di D1. Le soglie "500 messaggi / 7 giorni nel DO" proposte in Fase 5 non servono più.
- Su telefono Invio va a capo e si invia con il pulsante (come Messaggi di iOS); con tastiera fisica e puntatore fine Invio invia, Maiusc+Invio va a capo.
- Il testo alternativo si scrive anche mentre l'immagine si carica: viaggia con il messaggio (`alts`), non con il caricamento.

Correzioni trovate dai test:

- La griglia della pagina Chat su telefono non aveva una colonna `minmax(0, 1fr)`: un testo lungo la allargava oltre lo schermo e Safari rimpiccioliva la pagina.
- L'altezza della conversazione dipendeva dallo scroll della pagina: ora si misura dall'inizio del documento (niente ridimensionamenti a catena).
- Il nome accessibile delle reazioni non conteneva il testo visibile (WCAG 2.5.3): ora "🎉 1 da …".
- Gli eventi `typing`/`presence` facevano ricaricare le task: ora la scheda Task ascolta solo gli eventi che la riguardano.

Debito tecnico / da controllare:

- Allegati caricati e mai inviati restano su R2: pulizia nel cron (allegati senza messaggio più vecchi di 24 h) da aggiungere in Fase 10.
- Notifiche per menzioni e risposte in Fase 9 (le menzioni sono già salvate per messaggio).
- Da provare su iPhone reale: tastiera e `visualViewport` nella conversazione, incolla di immagini.

### Fase 6 — Prompt, esecuzioni e tracciamento PR; scheda Status ✅ (2026-10-26)

Fatto:

- **Logica pura in `packages/core/src/prompts`** con test: ID di esecuzione (8 caratteri leggibili, senza 0/o/1/l/i, estrazione senza bias), **marcatore `Kyon-Run: <id>`** con regex rigorosa (riga intera; tollerati maiuscole, spazi, elenco/citazione, backtick, grassetto; rifiutati ID dentro una frase, lunghezze sbagliate, caratteri fuori alfabeto; più commit), variabili `{{project}} {{repo}} {{task}} {{file}} {{section}} {{branch}} {{assignee}} {{subtasks}} {{run_id}}` (sconosciute lasciate e segnalate, note vuote = "(nessuno)"), **4 template predefiniti**, blocco automatico finale con la riga del marcatore **sempre presente e su una riga da sola**, stato esecuzione da PR + check (`copied → pr_open → ci_running/ci_failed/ci_passed → merged`, `closed`, `abandoned`), timeline, **suggerimento di ripiego** (dopo la copia, branch, titolo/descrizione, autore), diff a righe, generatore di `CLAUDE.md`.
- **Dati** (migrazione `0005_prompts`): `prompt`, `prompt_version`, `prompt_template`, `prompt_run` (con il testo copiato esatto e la versione fissata). Il blocco automatico dell'admin sta in `app_meta`.
- **Scheda Prompt**: elenco per task, editor Markdown (monospazio, Cmd/Ctrl+S), inserimento variabili, anteprima con variabili sconosciute evidenziate, stato bozza/pronto/usato, **versioni** (chi, quando, differenze, ripristino come nuova versione), template (Kyon, gruppo, progetto, personali; "Salva come template"), **"Copia prompt per Claude"**: crea l'esecuzione, fissa la versione, sposta la task in **In corso**, copia negli appunti (anche su Safari, con `ClipboardItem` e una promessa; altrimenti foglio per copiare a mano), **avviso morbido** se qualcun altro ci sta già lavorando.
- **Esecuzioni**: timeline (Copiato → PR aperta → CI → Mergiata), PR collegata con esito CI e fonte del collegamento, note sul risultato, "Copia di nuovo", **"Verifica stato PR"**, **collegamento manuale**, **suggerimento con conferma**, abbandona, **"Annulla chiusura"**.
- **Webhook**: `pull_request` (marcatore nella descrizione, altrimenti nei trailer dei commit della PR, letti solo se qualche esecuzione aspetta ancora), `check_suite`/`check_run` (CI dal commit di testa), `push` (commit con marcatore → branch dell'esecuzione, PR già aperta collegata subito). **Merge di una PR collegata con certezza** (marcatore, suggerimento confermato o manuale) → task spuntata nella repo (un commit, a nome di chi ha lanciato l'esecuzione se è ancora membro, altrimenti del proprietario), colonna Fatto, eventi in cronologia, toast **"PR mergiata — Annulla chiusura"** a chi l'ha lanciata. PR chiusa senza merge → la task resta in corso con avviso. Riconsegne del webhook innocue.
- **Card del kanban** con lo stato dell'ultima esecuzione (icona + testo nascosto, mai solo colore). **Dettaglio task**: prompt ed esecuzioni della task e "Scrivi un prompt per Claude".
- **Scheda Status**: CI del branch, PR aperte con CI, commit recenti, issue aperte (dati GitHub in cache all'edge per 60 s: `caches.default`, nessuna quota), task completate di recente e storico da Kyon; "Sincronizza ora" salta la cache.
- **"Genera CLAUDE.md"**: anteprima, copia, scarica, **scrivi nella repo solo dopo conferma** e mai sopra un `CLAUDE.md` esistente.
- **Admin → "Blocco automatico dei prompt"** (permesso `admin:prompts` nella tabella di verità di `can()`).
- Realtime: un solo WebSocket per progetto (`ProjectLiveProvider`) condiviso dalle schede; nuovo evento `runs_changed`.
- GitHub finto: PR con autore, commit e SHA di testa, merge/chiusura/riapertura, check run, issue, elenco commit; i comandi di test restituiscono il webhook da consegnare (firmato dal test).
- Test: 538 unit/integrazione (10 sul ciclo completo: versioni e ripristino, copia con versione fissata e spostamento, avviso morbido, collegamento dal trailer, CI in corso/fallita/superata, merge → spunta → riconsegna innocua → annulla, suggerimento e conferma, PR chiusa, verifica dopo webhook perso, template, blocco admin, Status, CLAUDE.md, permessi); e2e **101/101** con axe su Prompt e Status: **ciclo completo prompt → copia (appunti) → PR col marcatore → CI → merge → task chiusa → annulla** su mobile, tablet e desktop, più collegamento manuale e verifica.

Decisioni:

- ID di 8 caratteri invece di 6 (esempio della specifica): circa 8,5·10¹¹ combinazioni, non indovinabili, ancora facili da leggere.
- Il marcatore nel prompt sta su una riga da sola: così Claude lo copia identico (dentro una frase rischiava di essere riformulato).
- Un prompt sopravvive alla sparizione della sua task dalla repo (`task_id` a `null`, "La task non c'è più"): è lavoro da non perdere.
- Il suggerimento di ripiego compare dopo 2 minuti dalla copia (prima la PR non può esistere) e solo nella scheda Prompt; la conferma è sempre di una persona.
- La chiusura automatica usa il token di chi ha lanciato l'esecuzione (se vede la repo), altrimenti di chi l'ha esposta, con trailer `Co-authored-by` come per le altre scritture.

Correzioni trovate dai test:

- Due aggiornamenti dell'URL costruiti dagli stessi parametri si sovrascrivevano ("Crea prompt" perdeva il prompt selezionato).
- Aprire un progetto direttamente sulla scheda Prompt non faceva la prima sincronizzazione (`useFirstSync` condiviso).
- I fogli aperti dall'URL perdevano il focus alla chiusura: ora `Sheet` lo riporta al contenuto principale se l'origine non c'è più.

Debito tecnico / da controllare:

- Notifiche (PR collegata, CI fallita, merge) arrivano in Fase 9; gli eventi sono già in `activity_event`.
- Home "esecuzioni in corso" in Fase 8.
- Su iPhone reale va provata la copia negli appunti (Safari) dopo la richiesta al server.

### Fase 5 — Pagina progetto: Task ✅ (2026-10-26)

Fatto:

- **Scheda Task** (`components/feature/tasks/*`): viste **Kanban**, **Lista** (un'area per file, raggruppata per sezione, sottotask annidati, tabelle del file mostrate come tabelle) e **Calendario** (mese / settimana / agenda, "Senza scadenza"). Vista e task aperta stanno nella query string (`&view=…&task=…`): link condivisibili, pagina statica.
- **Card**: titolo (Markdown inline), priorità colore + simbolo + testo, scadenza solo se impostata (scaduta = icona + testo), etichette, avanzamento sottotask, assegnatario. Superficie piena senza blur (il vetro resta sulle colonne: pochi blur sovrapposti).
- **Spostamento**: drag & drop con Pointer Events (mouse e touch; su touch parte con pressione lunga, la pagina non scorre durante il trascinamento, scorrimento automatico ai bordi, Esc annulla); menu **Azioni** con "Sposta in…" (sezione radio, niente sottomenu: su telefono i sottomenu non funzionano bene), Sposta su/giù; tastiera: frecce per muoversi, **Alt+frecce** per spostare, X, A, 1–4/0, M, /, ?. Annunci `aria-live` di ogni spostamento ("Spostata in In corso, posizione 1 di 1").
- **"Fatto" ↔ repo**: entrare o uscire da "Fatto" spunta/toglie la spunta nel `.md`, con **attesa di 2,5 s** (`DONE_MOVE_DEBOUNCE_MS`): avanti e indietro = nessun commit; poi toast con **Annulla** (commit inverso). Le altre colonne sono solo metadati.
- **UI ottimistica con rollback** (`useTaskActions`): cambio locale immediato, risposta del server che lo sostituisce, ripristino + toast d'errore se fallisce; indicatore "Salvo su GitHub… / Salvato / Errore, riprova" con riprova.
- **Dettaglio task**: pannello laterale da 768 px in su, bottom sheet su telefono; spunta, rinomina (commit), dove si trova + link al file su GitHub alla riga, colonna, assegnatario (solo membri), priorità, scadenza, etichette (crea al volo), note di Kyon, note del file, sottotask, **cronologia** (chi e quando). Focus sul titolo all'apertura e di nuovo sulla card alla chiusura.
- **Filtri** (assegnatario, etichette, priorità, stato, file) e ricerca senza accenti, in `packages/core` (`matchesFilters`) con test.
- **Colonne personalizzabili** (proprietario): aggiungi (prima di "Fatto"), rinomina, riordina, elimina (le task tornano in "Da fare"); "Fatto" e "In corso" si rinominano ma non si eliminano. Massimo 8.
- **Aggiunta task** (file + sezione) e **"Crea TASKS.md"** con conferma quando la repo non ha task. Prima apertura del progetto: sincronizzazione automatica.
- **Aggiornamento live con i Durable Objects** (anticipato dalla Fase 7, non serve un trasporto temporaneo): `GET /api/realtime/ticket` firma un ticket HMAC di 60 s per la stanza dopo il controllo dei permessi; il browser apre `wss://…/ws/project/<id>` sulla stessa origine; un'entry del Worker (`apps/web/worker.ts`) passa gli upgrade al DO prima di Next; il DO verifica il ticket (Hibernation API). Dopo ogni scrittura o sincronizzazione il web pubblica `tasks_changed`; i client ricaricano (aspettando se hanno un salvataggio in corso) e annunciano solo ciò che riguarda l'utente. Riconnessione con backoff, ping, nuovo ticket a ogni connessione, risincronizzazione dopo una disconnessione.
- API nuove: `PATCH /api/projects/:id/tasks/:taskId` (anche `assigneeId`, `priority`, `dueDate`, `notes`, `labelIds`, `move`), `GET …/tasks/:taskId/history`, `POST|PATCH|DELETE …/columns`, `POST|PATCH|DELETE …/labels`, `GET /api/realtime/ticket`. Migrazione `0004_task_history` (`activity_event.task_id` + indice).
- Design system: `Menu` (Radix dropdown), `GlassSelect`, `GlassTextarea`, in `/dev/ui`.
- Test: 512 unit/integrazione (9 nuovi sul board: metadati, spostamenti, "Fatto" ↔ repo, cronologia, etichette, colonne, permessi, ticket, 150 task); e2e **97/97** su mobile/tablet/desktop con axe in ogni vista: tastiera completa sul kanban, spunta con commit e Annulla, "Sposta in…", dettaglio, lista, calendario con Alt+frecce, drag & drop con un solo commit dopo l'attesa e **aggiornamento live in un secondo browser**. Lighthouse: soglie rispettate.

Decisioni:

- Pagina progetto a tutta larghezza (la lista dei progetti torna con "Tutti i progetti"): il kanban ha bisogno di spazio, il pannello di dettaglio fa da seconda colonna.
- Il calendario usa la semantica di tabella, non `grid` (che promette la navigazione a frecce tra celle): i giorni sono pulsanti, le task si spostano con Alt+frecce (±1 giorno, ±7).
- Sul telefono il mese mostra puntini nei giorni e l'elenco del giorno scelto sotto: le card nelle celle sarebbero bersagli sotto i 44 px.
- **Limite D1 di 100 parametri per query** (scoperto dagli e2e con molti utenti): IN lunghi e insert multipli ora sono spezzati (`lib/server/d1.ts`), le etichette si leggono con una join, il "NOT IN" delle repo è sostituito da `updatedAt < now`. Senza, un push che spunta 15 task o un utente con più di 100 repo avrebbero dato errore.

Debito tecnico / da controllare:

- Commenti e prompt collegati nel dettaglio arrivano con le Fasi 6–7 (oggi una riga lo dice).
- Il drag & drop su iPhone reale va provato a mano (pressione lunga, nessuno scroll durante il trascinamento).

### Fase 4 — Motore task da `.md` ✅ (2026-10-26)

Fatto:

- **Parser** (`packages/core/src/tasks/parse.ts`), riga per riga, senza librerie: checkbox GFM ovunque (`-`, `*`, `+`, numerate, `[x]`/`[X]`), elenchi sotto titoli "di piano" (parole chiave configurabili, confronto per parola intera e senza accenti; i sotto-titoli ereditano), sottotask e note annidate, front matter / commento `kyon: ignore`, blocchi di codice (anche annidati, ``` e ~~~), tabelle conservate come tabelle (per l'anteprima) e mai trasformate in task, paragrafi con etichette in grassetto ignorati, CRLF e tab.
- **Stato fatto**: `[x]`; oppure segno ✅/🟢 (anche dentro il grassetto o in fondo alla riga) = fatto, 🟡/⚪/… = da fare.
- **Identità**: `stable_id` = hash di percorso + titoli + testo normalizzato (senza segni, enfasi, link) + indice di occorrenza: resta uguale quando spunti o metti in grassetto.
- **Riconciliazione**: id esatto, poi stesso file e sezione con testo simile (Dice sui bigrammi ≥ 0,75), poi nuova; le task sparite diventano orfane (archivio 30 giorni, poi eliminate dal cron) e possono "tornare".
- **Scritture minime** (`edit.ts`): spunta/togli (checkbox; emoji ✅/⚪; voce semplice → `[x]`), rinomina (conserva indentazione, marcatore, casella, segno), aggiungi in fondo all'elenco della sezione, modello `TASKS.md`. Ogni scrittura cambia o inserisce **una sola riga** e controlla che la riga sia ancora quella letta.
- **Server** (`lib/server/tasks/*`): lettura dall'albero Git con **ETag** (304 = niente download), solo i file con `sha` cambiato, al massimo 30 per richiesta (gli altri in `pending`, entro i 50 subrequest del Free); snapshot per file in `task_file`; metadati in `task_meta` (assegnatario, priorità, scadenza, colonna, posizione, note, etichette); colonne predefinite **Da fare · In corso · Fatto** create col progetto; un task fatto finisce in "Fatto", riaperto torna in "Da fare"; ogni cambio di stato va in `activity_event` (fonte Kyon o GitHub).
- **Scrittura sulla repo** via Contents API con `sha`: su 409 rilegge, ritrova la task e riapplica **una volta**, poi errore chiaro. Messaggi `chore(tasks): complete "<task>" via Kyon` / `reopen` / `rename` / `add`. Token di chi agisce se vede la repo, altrimenti di chi l'ha esposta con trailer `Co-authored-by`. Modalità `branch_pr`: branch `kyon/tasks` creato al bisogno e PR aperta (una sola).
- **Webhook `push`** → risincronizza il progetto della repo. **Cron**: il Worker cron chiama `POST /api/internal/cron` del web tramite service binding con un segreto condiviso (`INTERNAL_SECRET`, generato dal deploy su entrambi i Worker); riconcilia 2 progetti per giro (prima quelli con file in attesa) e pulisce gli orfani.
- API: `GET/POST /api/projects/:id/tasks`, `PATCH /api/projects/:id/tasks/:taskId` (`done`, `text`), `POST /api/projects/:id/sync`, `POST /api/projects/:id/tasks-file`.
- GitHub finto esteso: alberi con ETag, contenuti, PUT con controllo `sha` (409), branch, PR, push esterni, conflitti simulati.
- Test: 30 test del parser/scritture/riconciliazione con la **fixture sintetica Biohybrid** (titoli `## 1 · …`, tabelle ✅🟢🟡⚪, paragrafi **Cosa./Perché./È finita quando.**, "Ordine di priorità", archivio): ne escono 7 task e una tabella. **13 test di integrazione**: lettura (archivio, `node_modules`, file senza task esclusi), ETag, spunta con commit di una riga e colonna "Fatto", emoji, conflitto riapplicato, doppio conflitto → 409, push esterno via webhook (testo modificato = stessa task, task rimossa = orfana), co-autore, aggiungi/rinomina, permessi, `branch_pr` con PR, `TASKS.md` solo se vuoto, cron solo con segreto.

Decisioni:

- Parser scritto a mano (niente librerie Markdown): serve la posizione esatta delle righe per scritture minime e pesa zero nel bundle.
- Un titolo di livello 1 "di piano" (es. `# Prossimi passi` che intitola tutto il file) vale solo per gli elenchi subito sotto, non per ogni sezione: altrimenti tutti gli elenchi di un `PROSSIMI-PASSI.md` diventerebbero task.
- Una voce di elenco che comincia con un'etichetta in grassetto (`- **Nota.** …`) è una nota, non una task.
- Togliere la spunta a una task emoji scrive ⚪ (l'annullamento con "Annulla" ripristina la riga originale con un commit inverso, Fase 5).
- In modalità `branch_pr` Kyon legge le task dal branch `kyon/tasks` (se esiste), così ciò che vedi è ciò che hai scritto.
- Il cron non contiene logica GitHub: la chiede al Worker web (un solo posto dove vive il codice).

Debito tecnico / da controllare:

- La UI della scheda Task (kanban, lista, calendario, spunta con "Annulla") arriva in Fase 5; per ora il motore è usabile dalle API.
- Alberi Git "troncati" (repo enormi) sono segnalati in `project_sync.last_error` ma non gestiti oltre.

### Fase 3 — GitHub, repo, visibilità, progetti, membri ✅ (2026-10-26)

Fatto:

- **`can(user, action, resource)`** in `packages/core/src/permissions`: repo (`view`, `configure`, `create_project`) per esposizione × chi × disponibilità; progetti (12 azioni) per ruolo × archiviato × "osservatori possono commentare"; azioni di gruppo/admin. Tabella di verità scritta a mano e testata (≈180 casi). Gli admin globali non vedono repo o progetti altrui.
- **GitHub App, autorizzazione utente**: `Collega GitHub` (OAuth con `state` in cookie HttpOnly), scambio del codice, token d'accesso e refresh **cifrati AES-GCM** (contesto = utente, così un valore non si sposta su un'altra riga), refresh automatico 5 minuti prima della scadenza, segnalazione "ricollega" quando scade il refresh token. Nessuna chiave privata dell'app: bastano Client ID/secret e webhook secret.
- **Repo**: sincronizzazione delle repo raggiungibili (installazioni × accesso utente, paginazione entro i limiti di subrequest), riga per utente con **esposizione** `hidden` (default) / `self` / `selected` (con persone) / `group`; repo non più raggiungibili segnate "non disponibili" (scelte conservate). Restringere la visibilità non rimuove i membri ma avvisa chi l'ha cambiata con i nomi di chi non vede più la repo.
- **Webhook** `POST /api/github/webhook`: firma HMAC SHA-256 verificata a tempo costante prima di leggere il corpo; `installation` (eliminata/sospesa) e `installation_repositories` (rimosse → non disponibili; aggiunte → risincronizza chi l'ha fatto).
- **Progetti**: 1 repo = 1 progetto (anche se più utenti hanno collegato la stessa repo); creazione solo da repo esposte e visibili; membri iniziali = chi vede la repo, il creatore è proprietario; impostazioni (nome, commit diretto o branch+PR, branch di lavoro, osservatori che commentano, parole chiave "di piano", percorsi ignorati, mostra archivio); membri (aggiungi solo chi vede la repo, ruolo membro/osservatore, rimuovi); abbandona; trasferisci proprietà; archivia/ripristina (sola lettura); elimina con conferma del nome (mai la repo). Chi non è membro riceve 404.
- **UI**: Settings → GitHub (collega/scollega, installa, aggiorna elenco, visibilità per repo in un bottom sheet con descrizioni e scelta delle persone); Progetti (elenco con ruolo e archiviati, nuovo progetto, dettaglio `?id=…&tab=…` con intestazione, membri, indicatore di sincronizzazione, schede Task/Prompt/Status accessibili da tastiera, menu progetto). Due colonne da iPad.
- **GitHub finto** (`apps/web/src/test/fakeGithub.ts`): OAuth con pagina di consenso, refresh, utenti, installazioni, repo, controlli per i test. Usato dai test di integrazione, dagli e2e (server locale su :8799) e da `pnpm dev` quando non c'è una GitHub App vera.
- Deploy: genera `TOKEN_ENCRYPTION_KEY`; passa a Cloudflare i secret `KYON_GH_*` e la variabile `KYON_GH_APP_SLUG`.
- Test: crypto (vettore HMAC della documentazione GitHub, AES-GCM con contesto), tabella `can()`, **13 test di integrazione** (OAuth, stato falsificato, token cifrati, visibilità, unicità progetto, persone scelte, avviso di restrizione, ruoli, 404, trasferimento/archivio/eliminazione, refresh token, webhook firmati/non firmati), e2e completo (collega GitHub, esponi, crea progetto, membro che vede il progetto ma non la repo nascosta, schede da tastiera, eliminazione) con axe.

Decisioni:

- **URL con query string** (`/progetti?id=…`, `/join?code=…`, `/reset?token=…`) invece di segmenti dinamici: una pagina renderizzata dal Worker costa ~3 volte una statica (misure sopra). Deviazione voluta dal `/join/<codice>` della specifica.
- Solo **token utente** (niente token di installazione): coerente con la specifica (§4.3.4 "token dell'utente che agisce, altrimenti del proprietario della repo").
- I secret della GitHub App in Actions si chiamano `KYON_GH_*` (Actions vieta il prefisso `GITHUB_`).
- La config e2e di wrangler vive in `.wrangler/e2e/` (fuori da `apps/web`), così il `.dev.vars` di uno sviluppatore non si mescola ai test.

Debito tecnico / da controllare:

- Le richieste reali a GitHub (OAuth, `/user/installations`) sono testate solo contro il finto: da verificare al primo collegamento vero.
- "Ultima task completata" nell'elenco progetti arriva con la Fase 4.

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
