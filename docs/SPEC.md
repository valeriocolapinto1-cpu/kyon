# Kyon — Specifiche funzionali

Versione ordinata delle specifiche di `KYON-PROMPT.md` (che resta il documento di partenza e non si modifica). Le regole permanenti (stack, convenzioni, sicurezza, design system, accessibilità, vincoli Cloudflare) sono in `CLAUDE.md` e prevalgono su stack e convenzioni; questo documento prevale sul comportamento del prodotto. L'ordine di costruzione (fasi 0–10) e lo stato del lavoro sono in `docs/PROGRESS.md`.

Le note **Decisione** aggiunte durante lo sviluppo sono raccolte in fondo, in "Chiarimenti e decisioni".

## Indice

1. Contesto e obiettivo
2. Utenti, ruoli, accesso
3. Mappa delle schermate (Home, Progetti, Progetto, Chat, Persone, Settings, extra)
4. Dati e permessi
5. Motore delle task da Markdown
6. Prompt, esecuzioni e tracciamento delle PR
7. Realtime
8. Notifiche
9. Frontend e UX
10. Accessibilità
11. PWA e offline
12. Test e qualità
13. Punti aperti
14. Chiarimenti e decisioni

---

## 1. Contesto e obiettivo

Utenti: 4 amici sviluppatori, tra cui l'admin (Valerio) e Christian. Primo uso concreto: gestire task e prompt per Claude Code del progetto **Biohybrid** (repo "allenamento"), poi estendere ad altri progetti. Ognuno ha un account, collega GitHub e sceglie quali repo mostrare e a chi. In un progetto si vedono le task (lette dai `.md` della repo), si scrivono i prompt per ogni task, si lanciano su Claude Code e **Kyon riconosce la PR che ne risulta** e la segue fino al merge. In più c'è la chat del gruppo.

**Esempio reale di repo**: Biohybrid è una PWA su Cloudflare Pages + Supabase con molti `.md` in italiano (es. `PROSSIMI-PASSI.md`, `prossimi_passi_clan.md`, `DECISIONI.md`, `DECISIONI-APERTE.md`, `PIANO.md`, `DESIGN.md`, `CLAUDE.md`). Questi file sono in gran parte **prosa con titoli numerati, tabelle di stato con emoji (✅ 🟢 🟡 ⚪) e paragrafi con etichette in grassetto** (`**Cosa.**`, `**Perché.**`, `**È finita quando.**`), con **pochissime checkbox**. Il parser deve gestire bene questo tipo di documenti (§5).

UX: semplice come un'app Apple, bella con Liquid Glass, rapida su telefono, accessibile.

## 2. Utenti, ruoli, accesso

- **Registrazione chiusa**: ingresso solo con **link/codice invito** generato da un admin (`/join/<codice>`). Monouso, scadenza (default 7 giorni), salvato come hash, tracciato (chi l'ha creato, chi l'ha usato, revoca).
- **Bootstrap admin**: il primo account si crea con `ADMIN_BOOTSTRAP_CODE` (secret) oppure `pnpm admin:create-invite`. Documentalo in `SETUP.md`. Il primo utente è `admin`.
- Login **email + password**. Nessuna passkey, nessun 2FA, verifica email non obbligatoria. Reset password: l'admin genera un link di reset per un utente.
- **Sessione fino a logout esplicito**, con le compensazioni di sicurezza di `CLAUDE.md` §7 (elenco dispositivi, revoca singola/totale, revoca da admin).
- GitHub si collega **dopo**, da Settings; non è un metodo di login.
- Ruoli globali `admin`/`user`. Ruoli di progetto: `owner` (tutto: impostazioni, commit mode, membri, archiviazione/eliminazione, trasferimento), `member` (legge, spunta/aggiunge task, scrive prompt, lancia esecuzioni, scrive messaggi), `viewer` (sola lettura; può commentare solo se l'owner lo consente, default no).

## 3. Mappa delle schermate

Navigazione: **tab bar a pillola in basso (mobile)**; **sidebar a pillola flottante in vetro (desktop)**. Voci: **Home, Progetti, Chat, Settings**. Ricerca globale accessibile dall'intestazione e con **Cmd/Ctrl+K** su desktop.

### 3.1 Home (personalizzabile)

Blocchi in vetro in griglia adattiva (1 colonna su mobile). L'utente può **riordinare e nascondere** i blocchi (salvato per utente).

1. **Orologio** in alto a sinistra: **analogico** (SVG con lancette fluide) o **digitale**, scelto in Settings. Fuso Europe/Rome. Etichetta testuale per screen reader aggiornata al minuto, non al secondo.
2. **Ultimi contributi** accanto all'orologio (widget stile Apple): ultimi commit/azioni dei membri (avatar, repo, messaggio, tempo relativo), solo da progetti visibili all'utente.
3. **"Ritorna dove hai lasciato"** in alto: riporta a ultima schermata, scheda attiva e posizione. Salvataggio su navigazione (debounce, mai a ogni scroll) in `localStorage` e in D1 (`user_last_location`).
4. **Ultimi commenti**: blocchi rettangolari con gli ultimi commenti di thread di progetto e di task; mostrano autore, estratto, progetto/task e portano al punto esatto.
5. **Le mie task**: assegnate a me e in scadenza.
6. **Esecuzioni in corso e PR da verificare**: prompt lanciati, PR aperte, CI rosse, merge da confermare.
7. **Chi è online adesso**: presenza dei 4 membri.

### 3.2 Progetti

Elenco di blocchi rettangolari in vetro: **nome del progetto a sinistra**, **ultima task completata a destra** (testo, chi, quando). Pulsante "Nuovo progetto" (sceglie tra le tue repo esposte). Stato vuoto curato. Progetti archiviati in una sezione separata, ripristinabili.

### 3.3 Dentro un progetto

Pagina con **3 schede in alto: Task · Prompt · Status**. Intestazione con nome, repo, membri, indicatore di sincronizzazione con la repo e menu progetto.

**Menu progetto (solo owner dove indicato)**: impostazioni (commit mode, esclusioni, sezioni "di piano", viewer che possono commentare), gestione membri e ruoli, **abbandona progetto**, **trasferisci proprietà**, **archivia/ripristina**, **elimina progetto** (conferma forte; elimina i dati di Kyon e **mai** la repo su GitHub).

**Scheda Task** (un'area per ogni file `.md` che contiene task, come una scaletta)

- Viste: **Kanban**, **Lista** (raggruppata per file e sezione), **Calendario** (mese, agenda, settimana; trascinare una task cambia la scadenza, con alternativa accessibile).
- **Colonne di default: Da fare · In corso · Fatto**, personalizzabili per progetto. La colonna "Fatto" (`is_done`) è legata allo stato completato della task.
- **Card kanban**: titolo, assegnatario, priorità (colore **e** simbolo), **scadenza solo se impostata**, label, avanzamento sottotask, numero commenti, **stato esecuzione** (icona PR aperta, check CI verdi/rossi, mergiata).
- **Spostamento**: drag & drop su touch/desktop **e** menu **"Sposta in…"** + frecce da tastiera.
- Filtri (assegnatario, label, priorità, stato, file), ricerca. **Aggiornamento live** via WebSocket.
- **Dettaglio task** (bottom sheet su mobile, pannello laterale su desktop/iPad): descrizione/note e sottotask, **thread di commenti**, **prompt collegati** con stato, **cronologia** (creata, spuntata, spostata, esecuzioni, chi e quando).
- Azioni sulla repo: spuntare, aggiungere (scegli file e sezione), rinominare (§5.6).
- **Repo senza task**: stato vuoto con proposta "Crea TASKS.md" da template (richiede conferma, un tap).

**Scheda Prompt**

- Per **ogni task** esiste uno spazio per scrivere uno o più prompt per Claude Code. Editor Markdown con anteprima, **cronologia versioni** (chi, cosa, confronto, ripristino), **template con variabili** (§6.4), stato prompt: bozza / pronto / usato.
- Libreria di **template** a livello utente, progetto, gruppo, con 4 predefiniti: **Implementa la task · Correggi bug · Scrivi test / aumenta copertura · Refactor e review**.
- Pulsante **"Copia prompt per Claude"** → crea un'**esecuzione** (§6). Pulsante **"Genera CLAUDE.md"** per il progetto (anteprima, copia/scarica; **non** scrive sulla repo senza conferma esplicita).
- Elenco **esecuzioni** del prompt con timeline e note (§6.5).

**Scheda Status**

- **Commit recenti** (autore, messaggio, data, link), **PR e issue aperte**, **esito CI / Actions** (check run del branch di default e delle PR), **task completate di recente** (da differenze tra snapshot e da merge di PR), **storico** (timeline unificata), pulsante **"Sincronizza ora"**.

### 3.4 Chat

- Pagina con **lista conversazioni**: chat principale del gruppo in cima, poi una chat per ogni progetto di cui l'utente fa parte (per attività recente, badge non letti). Tocco → chat a schermo intero, come Messaggi di Apple.
- **Nessun messaggio diretto 1:1.**
- Nei progetti: **thread di progetto** e **thread per task** (commenti; i recenti alimentano la Home).
- Funzioni: tempo reale, **menzioni @**, **reazioni emoji**, **rispondi a un messaggio (citazione)**, **modifica ed elimina i propri messaggi** (con "modificato"), **messaggi fissati (pin)**, **Markdown e blocchi di codice** con pulsante copia, **anteprima dei link** per GitHub (PR, issue, commit) e link interni a Kyon, **allegati** (§3.4.1), **ricerca nei messaggi**, "sta scrivendo", presenza, stato di lettura, **mute per chat**.
- Peso sul DB: ogni stanza è un **Durable Object con SQLite**; i messaggi recenti stanno nel DO, quelli vecchi sono **archiviati su D1** a lotti (alarm del DO); la **retention è illimitata** con compattazione. Ricerca: FTS5 su D1 + messaggi recenti del DO. Documenta soglie in `docs/ARCHITECTURE.md`.
- **3.4.1 Allegati**: immagini e screenshot, PDF/documenti, file di codice/testo, zip. **Le immagini sono compresse sul telefono prima dell'upload** (ridimensionamento e qualità ragionevoli). Qualunque file sopra **10 MB viene rifiutato** con messaggio chiaro (niente compressione lato Worker: costa troppa CPU). Anteprima per immagini; testo alternativo opzionale.

### 3.5 Persone

Raggiungibile da Home e chat. **Profilo ricco** per ogni membro: avatar, nome, bio, **stato** (es. "in focus"), repo esposte (secondo visibilità), progetti in comune, attività recente, statistiche semplici (task chiuse, esecuzioni).

### 3.6 Settings

- **Account**: nome, avatar (R2), bio e stato, email, password, sessioni/dispositivi con revoca.
- **Grafica**: tema chiaro/scuro/sistema, **accento dalla palette Apple**, orologio analogico/digitale, **modalità Leggera** del vetro.
- **Accessibilità**: dimensione del testo, alto contrasto, riduci trasparenza, riduci movimento, "non solo colore", annunci dello screen reader (messaggi, eventi live).
- **GitHub**: collega/scollega, elenco delle tue repo, per ciascuna **esposizione e visibilità** (§4.3).
- **Notifiche**: matrice evento × canale, mute, **orari silenziosi (default 23:00–08:00, modificabili)** e opzione "consenti menzioni dirette" (default spenta).
- **Installazione**: guida e pulsante per installare la PWA.
- **Calendario**: feed **.ics** delle scadenze con URL segreto rigenerabile.
- **Admin** (solo admin): inviti (crea, revoca, elenco), utenti e ruoli, link di reset password, revoca sessioni, **esportazione dati JSON/Markdown** (prompt, commenti, metadati), **pagina "Salute"** (stato webhook, ultimo sync per repo, errori recenti, uso di quote), istruzioni di ripristino con **D1 Time Travel** in `SETUP.md`.

### 3.7 Extra trasversali

- **Ricerca globale** (progetti, task, prompt, messaggi) con risultati raggruppati e **palette comandi** Cmd/Ctrl+K su desktop.
- **Scorciatoie da tastiera** in kanban/lista (spuntare, assegnare, cambiare priorità, spostare).
- **Tour iniziale** al primo accesso (pochi passaggi, saltabile, riapribile da Settings).
- **Cronologia attività globale** del gruppo (timeline di tutto ciò che succede nei progetti visibili).

## 4. Dati e permessi

### 4.1 Tabelle principali (Drizzle, D1) — schema indicativo, rifinisci e documenta

- Better Auth: `user` (+ `role`, `displayName`, `bio`, `statusText`, `avatarKey`, `accent`, `clockStyle`, `theme`, preferenze a11y, `homeLayout`), `session`, `account`, `verification`.
- `invite`, `github_connection` (token cifrati), `github_repo` (esposizione, visibilità, installation), `github_repo_share`.
- `project` (nome, `repo_id` unico, `commit_mode`, `work_branch`, `viewers_can_comment`, `plan_headings`, `ignore_globs`, `archived_at`), `project_member`.
- `task_meta` (progetto, `stable_id`, file, assegnatario, priorità, scadenza, `column_id`, `position`, note, `orphaned`), `task_label`, `task_label_link`, `kanban_column` (`is_done`).
- `task_snapshot` (progetto, commit sha, JSON task parsate).
- `prompt`, `prompt_version`, `prompt_template`.
- **`prompt_run`**: `id` (breve, leggibile, es. `k7f3a9`), progetto, task `stable_id`, prompt, `prompt_version_id`, lanciata da, `copied_at`, `state` (`copied | pr_open | ci_running | ci_failed | ci_passed | merged | closed | abandoned`), `pr_number`, `pr_url`, `branch`, `link_source` (`marker | suggested | manual`), `merged_at`, `result_notes`, `task_closed_by_run` (per l'annullamento).
- `thread`, `comment`, `chat_room`, `chat_archive_message` (FTS5), `chat_read_state`, `chat_mute`, `chat_pin`, `attachment`, `reaction`, `link_preview_cache`.
- `activity_event`, `notification`, `notification_pref`, `push_subscription`, `user_last_location`, `calendar_feed_token`, `onboarding_state`.
  Indici sulle query calde.

### 4.2 Permessi

`can(user, action, resource)` in `packages/core`, con **tabella di verità testata** (azione × ruolo × visibilità), usata ovunque: route, azioni server, DO, download allegati, feed `.ics`, export. Nessun utente può dedurre l'esistenza di repo o progetti a cui non ha accesso.

### 4.3 Esposizione e visibilità delle repo

1. L'utente collega GitHub e installa la **GitHub App** sulle repo che vuole.
2. In Settings → GitHub, per ogni repo sceglie: **non esposta** (default) oppure esposta con visibilità `self` / `selected` / `group`.
3. Solo repo esposte possono diventare **progetto**; membri iniziali: chi può vedere la repo (`member`), creatore `owner`. Cambiare la visibilità non rimuove membri già presenti, ma avvisa l'owner.
4. Lettura/scrittura sulla repo: con il token dell'utente che agisce se ha accesso; altrimenti con quello del proprietario della repo, con trailer `Co-authored-by` dell'utente. Documenta e testa.

## 5. Motore delle task da Markdown

### 5.1 Cosa è una task (`packages/core`, puro e testato)

- **Checkbox GFM** (`- [ ]`, `- [x]`, con `-`, `*`, `+`) in qualsiasi `.md` della repo.
- **Elenchi (puntati/numerati) sotto sezioni "di piano"**: titoli (`#`…`######`) il cui testo contiene parole chiave configurabili, default: _piano, todo, to-do, da fare, fasi, roadmap, prossimi passi, backlog, task, attività_. Le voci di quegli elenchi sono task anche senza checkbox. Configurabile per progetto.
- **Non sono task**: la prosa, i paragrafi con etichette in grassetto (`**Cosa.**`, `**È finita quando.**`…), le **tabelle**, i blocchi di codice. Le **tabelle** vengono mostrate **come tabelle** nella descrizione/anteprima del file, senza trasformarle in task e **senza scriverci sopra**.
- **Sottotask**: righe con checkbox/lista indentate sotto una task. Le righe di lista non-task sono note della task.
- **Un'area per ogni file**: la UI raggruppa per file e, dentro, per percorso dei titoli. Un file senza task non compare nelle viste task.
- **File ignorati**: percorsi in `docs/archivio/**` e `**/archivio/**`, oppure file con intestazione/front-matter `kyon: ignore`; più `node_modules`, `.git`, `vendor`, e i glob in `ignore_globs`. Opzione per progetto "mostra archivio" in una sezione separata, di sola lettura.
- Ignora checkbox dentro blocchi di codice. Gestisci CRLF, tab, numerazione, liste annidate miste.

### 5.2 Stato "fatto"

- Checkbox: `[x]` = fatto.
- Voce senza checkbox con segno di stato già usato nel file: **✅ o 🟢** (anche all'inizio del testo della voce o del titolo) = fatto; altri segni (🟡 ⚪ …) = non fatto.
- Completamento da Kyon: se la voce usa già un segno emoji di stato, **scrive lo stesso segno** (✅); altrimenti **converte la riga in checkbox spuntata** `- [x]`. Modifica minima della riga, mai riformattare il resto del file.

### 5.3 Identità e riconciliazione

`stable_id` = hash di percorso file + percorso titoli + testo normalizzato (senza segno di stato/checkbox) + indice di occorrenza. Alla rilettura **riconcilia** coi metadati: chiave esatta; altrimenti stesso file+sezione con testo molto simile (soglia documentata); altrimenti nuova. Le task che spariscono diventano `orphaned` (area "archivio", 30 giorni).
**Test unitari estesi**, incluso un file **fixture sintetico che imita la struttura reale di Biohybrid** (`## 1 · Titolo`, tabelle con ✅🟢🟡⚪, paragrafi con etichette in grassetto, sezione "Ordine di priorità", intestazione di archivio): atteso che ne escano poche task e che le tabelle restino tabelle. Quando l'utente fornisce un `.md` reale, aggiungilo alle fixture.

### 5.4 Lettura e cache

Via GitHub API con ETag/conditional request, albero Git per trovare i `.md`, contenuti scaricati solo se cambiati. Stato parsato in D1 (`task_snapshot`), ricalcolo incrementale.

### 5.5 Aggiornamenti: webhook + cron

- **Webhook** della GitHub App (`push`, `pull_request`, `pull_request_review`, `issues`, `check_run`, `check_suite`, `installation`, `installation_repositories`) con verifica firma. Su `push`: rielabora i `.md` modificati, calcola differenze tra snapshot, genera `activity_event`, notifica i client via DO.
- **Cron** a bassa frequenza (es. 15 minuti, nei limiti Free) per riconciliare webhook persi e promemoria scadenza. Rispetta i 10 ms di CPU: poche repo per invocazione.

### 5.6 Scrittura sulla repo (bidirezionale)

- **Spuntare/deselezionare**, **aggiungere** (file e sezione) e **rinominare**: modifica minima della riga e commit via Contents API con `sha` per concorrenza. Su conflitto (409): rileggi, riapplica sulla versione fresca, riprova **una volta**; se fallisce, errore chiaro senza perdere l'azione (UI ottimistica con rollback).
- `commit_mode` per progetto: **direct** (commit sul branch di default, messaggio `chore(tasks): complete "<task>" via Kyon`) oppure **branch_pr** (branch dedicato, PR aperta/aggiornata).
- Spostare una task **nella colonna "Fatto" o fuori** scrive sulla repo, con **raggruppamento** (debounce di pochi secondi) per evitare raffiche di commit. Le altre colonne sono metadati di Kyon.
- Tutte le scritture sono tracciate in `activity_event`, idempotenti, con **toast "Annulla"** dove ha senso (l'annullamento produce un commit inverso).

## 6. Prompt, esecuzioni e tracciamento delle PR (funzione distintiva)

### 6.1 Flusso

1. Si crea/seleziona una task e si scrive il prompt.
2. Si preme **"Copia prompt per Claude"**. Se la task ha già un'esecuzione attiva di un altro membro, **avviso morbido** "già in lavorazione da X" (non blocca).
3. Kyon crea una `prompt_run` con ID breve, fissa la **versione esatta del prompt**, sposta la task in **In corso** e copia negli appunti il prompt **completo** (§6.2).
4. L'utente incolla in Claude Code, che lavora e apre una **PR**.
5. Kyon riconosce la PR (§6.3), mostra stato e CI sulla card, e al **merge chiude la task** (§6.6).

### 6.2 Contenuto del prompt copiato

Testo scritto dall'utente (template risolto) **più** un blocco automatico finale con:

- **Titolo, sezione e sottotask** della task.
- **File `.md` di origine e percorso** nella repo.
- **Promemoria di leggere il `CLAUDE.md` della repo** e rispettarlo.
- **Istruzioni su branch e PR** (nome branch suggerito, es. `claude/<id>-<slug>`, PR verso il branch di default o di lavoro).
- **Istruzione sul marcatore**, chiara e in imperativo, per esempio:
  > Quando apri la PR, scrivi nella sua descrizione una riga esatta: `Kyon-Run: k7f3a9`. Aggiungi la stessa riga come trailer in ogni messaggio di commit. Non modificare questo identificativo.
  > Il testo e il formato del blocco sono template modificabili dall'admin, ma l'ID e la riga `Kyon-Run:` sono sempre presenti.

### 6.3 Riconoscimento della PR

- **Marcatore**: `Kyon-Run: <id>` nella **descrizione della PR** e nei **trailer dei commit**. Il webhook `pull_request` (opened/edited/synchronize) e `push` cercano il marcatore e collegano la PR alla `prompt_run` (`link_source = marker`).
- **Ripiego**: se dopo un tempo ragionevole non c'è marcatore, Kyon **suggerisce la PR più probabile** (stesso repo, aperta dopo la copia del prompt, branch simile, file toccati coerenti con la task, autore) e chiede **conferma con un tap** (`link_source = suggested`). Sempre disponibile il **collegamento manuale** (`manual`).
- Il parsing del marcatore vive in `packages/core` (regex rigorosa, ID non indovinabile ma leggibile, test su varianti di formato, maiuscole, spazi, commit multipli).

### 6.4 Template con variabili

`{{project}}`, `{{repo}}`, `{{task}}`, `{{file}}`, `{{section}}`, `{{branch}}`, `{{assignee}}`, `{{subtasks}}`, `{{run_id}}`. Variabili sconosciute evidenziate nell'editor, mai silenziosamente vuote.

### 6.5 Storico delle esecuzioni

Per ogni esecuzione: **timeline di stato** (copiato → PR aperta → CI → mergiata), **chi l'ha lanciata e quando**, **versione esatta del prompt**, **PR collegata con esito CI**, **note sul risultato** (campo libero). Visibile nella scheda Prompt, nel dettaglio task e nella Home (esecuzioni in corso).

### 6.6 Merge, chiusura e verifica

- **Se la PR collegata viene mergiata**, la task si **chiude automaticamente** (spunta/segno di stato sul `.md` con le regole di §5.2, colonna **Fatto**, evento nella cronologia). Il riconoscimento dev'essere certo (PR collegata via marcatore o confermata).
- **Annullabile**: toast e pulsante "Annulla chiusura" (riapre la task, commit inverso, esecuzione torna a stato `pr_open`/`merged` senza chiusura).
- Pulsante **"Verifica stato PR"** su esecuzione e task: rilegge da GitHub lo stato reale di PR/CI/merge e riallinea Kyon (utile se un webhook è andato perso).
- **Colonne automatiche**: copia prompt → **In corso**; merge → **Fatto**. Lo stato PR/CI è mostrato sulla card (non c'è una colonna "In review"). PR chiusa senza merge → la task resta in **In corso** con avviso.
- Notifiche: PR collegata, CI fallita, merge avvenuto/chiusura automatica.

## 7. Realtime (Durable Objects, `workers/realtime`)

- `ProjectRoom` (uno per progetto): chat, thread, eventi board live, presenza, "sta scrivendo". `GeneralRoom`: chat del gruppo.
- WebSocket **Hibernation API**. Autenticazione con token breve firmato dal Worker web; ogni evento verifica i permessi.
- Messaggi in SQLite del DO; `alarm()` per archiviare su D1 e pulire. Idempotenza (id client), ordine garantito dal DO, riconnessione con recupero dei messaggi mancanti.

## 8. Notifiche

- Eventi: **menzione**, **task assegnata a te**, **scadenza in arrivo** (24 h prima e il giorno stesso), **nuovi messaggi** nelle chat di progetto, **eventi di esecuzione** (PR collegata, CI fallita, merge).
- Canali: **in-app**, **email** (Cloudflare Email Service via `EmailProvider`, vedi limite Free), **push PWA** (Web Push + VAPID). Su iOS le push funzionano solo con PWA installata (iOS 16.4+): guida contestuale.
- Anti-rumore: mute per chat, raggruppamento in finestra di tempo, niente push se l'utente è online sulla stessa chat, **orari silenziosi di default 23:00–08:00** (senza eccezioni a meno che l'utente attivi "consenti menzioni dirette").
- Preferenze evento × canale in Settings.

## 9. Frontend e UX

Le regole visive e di interazione sono in `CLAUDE.md` §8–§9 e valgono come specifica. In aggiunta:

- Costruisci **prima il design system** (Fase 1) con una pagina `/dev/ui` (solo sviluppo) che mostra ogni componente in tutti gli stati e temi: `GlassCard`, `GlassButton`, `GlassInput`, `TabBarPill`, `SidebarPill`, `BottomSheet`/`Dialog`, `Segmented`, `Avatar`, `Badge`, `PriorityBadge` (colore + simbolo), `Toast` con azione, `Skeleton`, `ColorSwatchPicker`, `ClockAnalog`, `ClockDigital`, `SyncIndicator`, `CommandPalette`, `EmptyState`.
- Gli stati sono sempre curati: caricamento (skeleton), vuoto (testo amichevole), errore (con "Riprova"), offline.
- Il **degrado automatico** a modalità Leggera usa segnali misurabili (frame persi, hardware debole) e registra la scelta; l'utente può forzare.
- Rispetta i token: nessun valore magico di spaziatura/colore nei componenti.
- Il tono dei testi: amichevole, diretto, "tu", brevi. Nessun gergo.

## 10. Accessibilità

Implementa **tutto** `CLAUDE.md` §9. Obblighi di fase:

- Contrasto AA garantito sotto il testo, accenti con variante di testo derivata, alto contrasto, riduci trasparenza/movimento, non solo colore.
- Alternative a trascinamento e gesti, focus management, annunci `aria-live` configurabili, orologio accessibile, bersagli ≥ 44px.
- CI: **axe-core** nei test Playwright, **test dei contrasti** accento × tema × alto contrasto, **Lighthouse CI** (a11y ≥ 95, soglie prestazioni mobile).
- `docs/A11Y.md` con le scelte e una breve guida per provare con VoiceOver/TalkBack.

## 11. PWA e offline

- Manifest completo (icone dal logo, `display: standalone`, `theme_color` dinamico), splash e icone Apple.
- Service worker: precache dell'app shell, cache runtime dei dati principali (progetti, task, thread recenti) in **sola lettura offline**; banner "Sei offline, dati salvati" e blocco gentile delle scritture; gestione degli aggiornamenti.
- **Installazione guidata**: guida visiva "Aggiungi a Home" per iPhone/iPad, pulsante "Installa" su Chrome/Edge (Windows/Android), promemoria discreto dopo alcuni giorni d'uso (disattivabile).

## 12. Test e qualità

- Unit (`packages/core`): parser, riconciliazione, stato fatto, marcatore `Kyon-Run`, permessi, template prompt, calcolo contrasti.
- Integrazione: route chiave con D1 locale; webhook con payload firmati finti; flusso di scrittura GitHub contro un **server GitHub finto** (include PR, check run, merge).
- E2E (Playwright, mobile + desktop): registrazione con invito, login, collegamento GitHub (mock), creazione progetto, spunta task con commit, **ciclo completo prompt → copia → PR con marcatore → CI → merge → task chiusa → annulla chiusura**, ripiego con suggerimento PR, chat realtime con due contesti, cambio accento/tema/alto contrasto, "ritorna dove hai lasciato", ricerca e Cmd+K, navigazione da tastiera del kanban.
- Nessun test chiama GitHub reale o invia email reali.

## 13. Punti aperti (da decidere con l'utente, non bloccano il lavoro)

1. Dominio personalizzato (per ora `.workers.dev`): influisce anche sull'invio email.
2. Passaggio a Workers Paid se bundle/CPU/email non entrano nel Free.
3. Un `.md` reale di Biohybrid da aggiungere alle fixture del parser.
4. Verifica sul campo dell'invio email sul Free (solo destinatari verificati).
5. Eventuali passkey, 2FA e verifica email in futuro; eventuale integrazione AI nell'app (non prevista).

## 14. Chiarimenti e decisioni

- **Prima versione utilizzabile = tutto il perimetro**: auth, task e kanban bidirezionali, prompt con tracciamento PR, chat realtime, home, notifiche, PWA. Le fasi indicano solo l'ordine di costruzione.
- **L'app parte vuota**: nessun dato di esempio; fixture solo nei test.
- **Indirizzi con query string**: `/join?code=…`, `/reset?token=…`, `/progetti?id=…&tab=…` (invece di `/join/<codice>` e simili), così ogni pagina resta statica e non consuma CPU del Worker.
- **GitHub con soli token utente** (niente token di installazione né chiave privata dell'app).
- **Prerender serviti dagli asset statici** (Fase 0): le pagine statiche non vengono ri-renderizzate dal Worker a ogni richiesta (`staticAssetsIncrementalCache` di OpenNext). Niente ISR/revalidate finché non serve davvero.
