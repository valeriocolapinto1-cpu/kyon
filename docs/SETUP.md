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

3. Fatto. Al prossimo push su `main`, dopo la CI verde, il workflow **Deploy** crea D1, KV e R2 (se mancano), applica le migrazioni e pubblica i tre Worker. Puoi rilanciarlo da **Actions → CI → Re-run** sull'ultimo commit di `main`.

**Come verificare**: apri `https://kyon-web.<sottodominio>.workers.dev/api/health`: deve rispondere `{"ok":true,"db":"up"}`.

**Misura della CPU reale** (facoltativo ma utile): Cloudflare → Workers & Pages → `kyon-web` → **Metrics** → **CPU Time**. Se vedi valori vicini a 10 ms segnalalo in chat.

---

## B. Sviluppo in locale (facoltativo, macOS / Linux / Windows)

Non serve per usare Kyon, solo se vuoi provare il codice sul tuo computer.

1. Installa **Node.js 22** o più recente (<https://nodejs.org>).
2. Apri un terminale nella cartella della repo ed esegui:
   ```
   corepack enable
   pnpm install
   pnpm dev
   ```
3. Apri <http://localhost:3000>. Database, file e realtime sono simulati in locale: nessun login Cloudflare.

---

## C. Passi delle fasi successive

Questi passi verranno dettagliati qui quando arriva la fase relativa.

- **Fase 2 — Primo admin**: secret `ADMIN_BOOTSTRAP_CODE` su Cloudflare, oppure `pnpm admin:create-invite`.
- **Fase 3 — GitHub App**: creazione dell'app su GitHub (permessi, eventi webhook, URL di callback), chiave privata e segreti (`GITHUB_APP_ID`, `GITHUB_APP_CLIENT_ID`, `GITHUB_APP_CLIENT_SECRET`, `GITHUB_APP_PRIVATE_KEY`, `GITHUB_WEBHOOK_SECRET`), chiave di cifratura dei token.
- **Fase 9 — Notifiche**: chiavi VAPID per le push, verifica dell'invio email sul piano Free.
- **Fase 10 — Ripristino dati**: istruzioni per D1 Time Travel.
