# Kyon — Passi manuali

Qui c'è tutto quello che va fatto a mano (da te, non da Claude Code). Ogni passo dice **dove andare**, **cosa cliccare** e **cosa copiare**. I passi delle fasi future sono segnati con la fase in cui servono: puoi farli quando arrivano.

---

## A. Cloudflare (serve per il primo deploy, Fase 0)

### A1. Account e sottodominio `workers.dev`

1. Accedi a <https://dash.cloudflare.com> (crea l'account se non ce l'hai; il piano **Free** basta per partire).
2. Nel menu a sinistra apri **Compute (Workers) → Workers & Pages**.
3. Se è la prima volta, Cloudflare ti chiede di scegliere un **sottodominio `workers.dev`** (es. `cerbero`). Sceglilo e conferma. L'app sarà su `https://kyon-web.<sottodominio>.workers.dev`.

### A2. Attiva R2

1. Nel menu a sinistra apri **Storage & databases → R2 Object Storage**.
2. Premi **Attiva R2** / **Purchase R2 Plan** e scegli il piano gratuito (10 GB inclusi). Cloudflare potrebbe chiederti un metodo di pagamento anche per il piano gratuito: non viene addebitato nulla finché resti nei limiti.
3. Non serve creare il bucket: lo crea il deploy (`kyon-files`).

### A3. Account ID

1. Apri **Workers & Pages**: a destra, nel riquadro dell'account, c'è **Account ID**.
2. Premi l'icona di copia. Ti serve al passo A5 come `CLOUDFLARE_ACCOUNT_ID`.

### A4. Token API

1. Vai su <https://dash.cloudflare.com/profile/api-tokens> → **Create Token**.
2. Scegli il modello **Edit Cloudflare Workers** → **Use template**.
3. In **Permissions** premi **+ Add more** e aggiungi: **Account → D1 → Edit**.
   Controlla che ci siano anche: Account → Workers Scripts → Edit, Account → Workers KV Storage → Edit, Account → Workers R2 Storage → Edit, Account → Account Settings → Read, User → User Details → Read, User → Memberships → Read.
4. In **Account Resources** scegli **Include → il tuo account**. In **Zone Resources** lascia **All zones** (non usiamo domini per ora).
5. **Continue to summary → Create Token** e copia il token: viene mostrato **una sola volta**. Ti serve al passo A5 come `CLOUDFLARE_API_TOKEN`.

### A5. Secrets su GitHub

1. Apri la repo `kyon` su GitHub → **Settings → Secrets and variables → Actions**.
2. **New repository secret** due volte:

   | Name                    | Secret             |
   | ----------------------- | ------------------ |
   | `CLOUDFLARE_API_TOKEN`  | il token di A4     |
   | `CLOUDFLARE_ACCOUNT_ID` | l'Account ID di A3 |

3. (Facoltativo, consigliato) Aggiungi anche **`ADMIN_BOOTSTRAP_CODE`**: una frase lunga a tua scelta (almeno 12 caratteri), per esempio `cerbero-tre-teste-2026`. Vedi A6.
4. Fatto. Al prossimo push su `main`, dopo la CI verde, il workflow **Deploy** crea D1, KV e R2 (se mancano), applica le migrazioni e pubblica i tre Worker. Puoi rilanciarlo da **Actions → CI → Re-run** sull'ultimo commit di `main`.

**Come verificare**: apri `https://kyon-web.<sottodominio>.workers.dev/api/health`: deve rispondere `{"ok":true,"db":"up"}`.

Il deploy genera da solo il segreto di firma delle sessioni (`BETTER_AUTH_SECRET`): non devi fare nulla.

### A6. Primo account (admin)

Il primo account creato è l'admin del gruppo. Due modi:

- **Dal telefono** (consigliato): se hai messo il secret `ADMIN_BOOTSTRAP_CODE` (A5), dopo il deploy apri `https://kyon-web.<sottodominio>.workers.dev/join?code=<il tuo codice>` e crea l'account. Il codice smette di funzionare appena esiste un account.
- **Da un computer** con la repo e Node: `CLOUDFLARE_API_TOKEN=… CLOUDFLARE_ACCOUNT_ID=… pnpm admin:create-invite --remote --url https://kyon-web.<sottodominio>.workers.dev` stampa un link di invito.

Poi, da **Settings → Admin → Inviti**, crei un invito per ciascun amico e gli mandi il link (vale 7 giorni, una volta sola). Se qualcuno dimentica la password: **Settings → Admin → Persone → Link per nuova password**.

**Misura della CPU reale** (facoltativo ma utile): Cloudflare → Workers & Pages → `kyon-web` → **Metrics** → **CPU Time**. Se vedi valori vicini a 10 ms segnalalo in chat.

### A7. Se il deploy avvisa "Cron schedule not set"

Il piano Free permette **5 cron trigger per account**, condivisi con tutti i tuoi Worker. Se ne usi già 5 per altri progetti, il deploy pubblica Kyon lo stesso ma senza la pianificazione ogni 15 minuti: l'app funziona (gli aggiornamenti arrivano dai webhook), però mancano riconciliazione con GitHub, promemoria delle scadenze e pulizia degli allegati.

Per sistemare: Cloudflare → **Workers & Pages** → apri un Worker che non ti serve più (o di cui non ti serve la pianificazione) → **Settings → Trigger events** → elimina il suo cron. Poi rilancia il deploy (**Actions → CI → Re-run all jobs** sull'ultimo commit di `main`). In **Settings → Admin → Salute** di Kyon comparirà "ultimo giro del cron" entro 15 minuti.

---

## B. GitHub App (serve per collegare le repo, Fase 3)

Kyon usa una **GitHub App** tua: ognuno del gruppo la installa sulle proprie repo e poi, in Kyon, preme "Collega GitHub". Sostituisci `<sito>` con `https://kyon-web.<sottodominio>.workers.dev`.

### B1. Crea l'app

1. Su GitHub: foto profilo → **Settings → Developer settings → GitHub Apps → New GitHub App** (<https://github.com/settings/apps/new>).
2. Compila:

   | Campo                                                  | Valore                                                                                             |
   | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
   | GitHub App name                                        | `Kyon Cerbero` (deve essere unico su GitHub: aggiungi qualcosa se è preso)                         |
   | Homepage URL                                           | `<sito>`                                                                                           |
   | Callback URL                                           | `<sito>/api/github/callback`                                                                       |
   | Expire user authorization tokens                       | ✅ (lascialo attivo)                                                                               |
   | Request user authorization (OAuth) during installation | ❌ (lascialo spento)                                                                               |
   | Setup URL                                              | `<sito>/api/github/setup` e spunta **Redirect on update**                                          |
   | Webhook → Active                                       | ✅                                                                                                 |
   | Webhook URL                                            | `<sito>/api/github/webhook`                                                                        |
   | Webhook secret                                         | una stringa casuale lunga (es. genera 40 caratteri con un password manager) e **tienila da parte** |

3. **Repository permissions**:

   | Permesso        | Accesso                                               |
   | --------------- | ----------------------------------------------------- |
   | Contents        | Read and write (leggere e spuntare le task nei `.md`) |
   | Pull requests   | Read and write                                        |
   | Issues          | Read-only                                             |
   | Checks          | Read-only                                             |
   | Commit statuses | Read-only                                             |
   | Metadata        | Read-only (obbligatorio)                              |

4. **Subscribe to events**: Push, Pull request, Pull request review, Issues, Check run, Check suite.
5. **Where can this GitHub App be installed?** → **Any account** (così anche gli amici la installano sulle loro repo).
6. **Create GitHub App**.

### B2. Copia i valori

Nella pagina dell'app appena creata:

1. Copia il **Client ID**.
2. Premi **Generate a new client secret** e copialo (si vede una sola volta).
3. Lo **slug** è l'ultima parte dell'indirizzo della pagina pubblica dell'app (`https://github.com/apps/<slug>`), es. `kyon-cerbero`.
4. Non serve generare la "private key".

### B3. Mettili nella repo `kyon`

**Settings → Secrets and variables → Actions**:

- Scheda **Secrets** → **New repository secret**:

  | Name                     | Secret                  |
  | ------------------------ | ----------------------- |
  | `KYON_GH_CLIENT_ID`      | il Client ID            |
  | `KYON_GH_CLIENT_SECRET`  | il client secret        |
  | `KYON_GH_WEBHOOK_SECRET` | il webhook secret di B1 |

- Scheda **Variables** → **New repository variable**: `KYON_GH_APP_SLUG` = lo slug.

(GitHub non permette secret che iniziano con `GITHUB_`, per questo si chiamano `KYON_GH_…`.)

Al deploy successivo Kyon li riceve da solo. La chiave che cifra i token GitHub (`TOKEN_ENCRYPTION_KEY`) la genera il deploy: non devi fare nulla.

### B4. Usala

1. Installa l'app sulle repo che vuoi: `https://github.com/apps/<slug>/installations/new` (lo trovi anche in Kyon: **Settings → GitHub → Scegli le repo su GitHub**).
2. In Kyon: **Settings → GitHub → Collega GitHub** → autorizza.
3. Per ogni repo scegli la visibilità: **Non esposta** (default), **Solo io**, **Persone scelte**, **Tutto il gruppo**.
4. **Progetti → Nuovo progetto** → scegli la repo.

Ogni amico fa i passi 1–3 con il proprio account GitHub (l'app è la stessa).

## C. Sviluppo in locale (facoltativo, macOS / Linux / Windows)

Non serve per usare Kyon, solo se vuoi provare il codice sul tuo computer.

1. Installa **Node.js 22** o più recente (<https://nodejs.org>).
2. Apri un terminale nella cartella della repo ed esegui:
   ```
   corepack enable
   pnpm install
   pnpm dev
   ```
3. Apri il link `/join?code=…` che `pnpm dev` stampa nel terminale per creare il primo account locale, poi <http://localhost:3000>. Database, file e realtime sono simulati in locale: nessun login Cloudflare.

---

## D. Notifiche (Fase 9)

### D1. Push: niente da fare

Le chiavi VAPID per le notifiche push vengono **generate una volta sola dal primo deploy** e restano solo nei secrets di Cloudflare (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`). Non rigenerarle: tutti i dispositivi dovrebbero riattivare le push.

Ogni persona attiva le push da **Settings → Notifiche → Attiva le push**, su ogni dispositivo.

- **iPhone e iPad (iOS/iPadOS 16.4 o successivo)**: le push funzionano solo dall'app installata. In Safari tocca **Condividi → Aggiungi alla schermata Home**, apri Kyon dall'icona e attiva le push da lì. Kyon lo spiega anche nella pagina, se apri Settings da Safari.
- **Mac (Safari, Chrome), Windows/Linux (Chrome, Edge, Firefox), Android**: basta il browser.
- Se il browser ha bloccato le notifiche per Kyon, riattivale dalle impostazioni del sito.

### D2. Email (facoltativo)

Senza questo passo l'app funziona comunque: le notifiche arrivano in Kyon e come push, e la colonna Email in Settings è disattivata con una spiegazione.

1. Cloudflare → **Email Service** → aggiungi un dominio di invio (serve un dominio tuo: con il solo `workers.dev` non si può). Segui la verifica DNS che ti propone.
2. Sul piano **Free** l'invio arriva solo agli **indirizzi verificati** del tuo account: aggiungi lì le email delle 4 persone (Email Service → indirizzi di destinazione). Con **Workers Paid** puoi scrivere a chiunque.
3. Su GitHub → repo `kyon` → Settings → Secrets and variables → Actions → **Variables** → **New repository variable**:
   - Nome: `KYON_EMAIL_FROM`
   - Valore: per esempio `kyon@tuodominio.it` (deve essere sul dominio del punto 1).
4. Al deploy successivo Kyon aggiunge il binding `EMAIL` e attiva la colonna Email in Settings. Prova con **Settings → Notifiche → Invia una prova** e attivando l'email su un evento.

L'indirizzo del sito usato nei link delle email (`KYON_URL`) viene letto in automatico dal tuo sottodominio `workers.dev`. Se un giorno userai un dominio personalizzato, aggiungi anche la variabile `KYON_URL` (es. `https://kyon.tuodominio.it`).

---

## E. Ripristino dei dati (D1 Time Travel)

Il database D1 tiene in automatico la cronologia degli ultimi **7 giorni** sul piano Free (30 su Paid): puoi riportarlo a un minuto qualsiasi di quel periodo. Le task stanno comunque nelle repo GitHub: il ripristino riguarda metadati, prompt, chat e notifiche. Gli allegati (R2) non sono coperti.

Prima di ripristinare, scarica un export da **Settings → Admin → Salute → Esporta JSON** (contiene i progetti di cui fai parte e la chat del gruppo).

I comandi vanno lanciati da un computer con Node e il repo clonato, con le stesse variabili della CI (`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`): mai `wrangler login`.

1. Guarda il punto attuale (da copiare, ti serve per tornare indietro):
   ```
   pnpm --filter @kyon/web exec wrangler d1 time-travel info kyon-db
   ```
2. Ripristina a un'ora precisa (UTC, formato RFC 3339):
   ```
   pnpm --filter @kyon/web exec wrangler d1 time-travel restore kyon-db --timestamp=2026-10-27T08:00:00Z
   ```
   Wrangler stampa il **bookmark** di prima del ripristino: annotalo.
3. Hai sbagliato momento? Torna indietro con il bookmark del punto 2:
   ```
   pnpm --filter @kyon/web exec wrangler d1 time-travel restore kyon-db --bookmark=<bookmark>
   ```
4. Apri Kyon, poi **Settings → Admin → Salute**: controlla che i numeri tornino. Su ogni progetto premi **Sincronizza ora** per riallineare le task con le repo.

Le migrazioni non vanno rifatte: il ripristino riporta anche lo schema di quel momento, e al deploy successivo la CI applica quelle mancanti.

---

## F. Prima del rilascio

La checklist completa è in `docs/RELEASE.md`.
