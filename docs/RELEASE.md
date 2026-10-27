# Kyon — Checklist di rilascio

Da ripassare prima di dire "è pronto" e dopo ogni cambiamento importante. Le voci automatiche sono controllate dalla CI a ogni push; quelle manuali richiedono una persona e un telefono.

## 1. Automatico (CI su `main` e sui branch `claude/**`)

- [x] `pnpm format:check`, `pnpm typecheck`, `pnpm lint` (zero warning)
- [x] `pnpm test`: logica pura, tabella di verità di `can()`, integrazione con D1 locale, GitHub ed email finti
- [x] **Audit dei permessi**: ogni route dell'API rifiuta chi non ha una sessione, tranne una lista esplicita e motivata (`access-audit.integration.test.ts`); scritture da un'altra origine rifiutate
- [x] Visibilità: chi non è membro di un progetto non ne vede task, commenti, attività, esecuzioni, risultati di ricerca né conteggi (test di Home, ricerca, persone, export, salute)
- [x] `pnpm size`: ogni Worker sotto 2,4 MB gzip (oggi `kyon-web` 1809 KiB)
- [x] `pnpm e2e`: telefono, tablet, desktop, con axe (WCAG 2.2 AA) e controllo del **reflow** su schermi stretti; offline in sola lettura
- [x] `pnpm lighthouse`: accessibilità ≥ 95, prestazioni mobile ≥ 80, misurate da loggato con una sessione nuova per pagina
- [x] CSP e HSTS identici su Worker e asset statici (test)
- [x] Il deploy parte solo da `main` e solo se la CI è verde; le migrazioni D1 vengono applicate dal deploy

## 2. Una volta, a mano (vedi `docs/SETUP.md`)

- [ ] Cloudflare: account, sottodominio `workers.dev`, R2 attivo, token API e secrets su GitHub (§A)
- [ ] Primo account admin (§A6)
- [ ] GitHub App creata e secrets copiati (§B)
- [ ] (Facoltativo) Email: dominio su Email Service e `KYON_EMAIL_FROM` (§D2)
- [ ] Dopo il primo deploy: `/api/health` risponde `ok`; **Settings → Admin → Salute** mostra GitHub App attiva, ultimo webhook e ultimo giro del cron (entro 15 minuti)

## 3. Prova sui dispositivi del gruppo

Su **iPhone (Safari e app installata)**, **Mac o iPad**, **Windows/Linux (Chrome o Edge, Firefox)**:

- [ ] Accesso, sessioni in Settings, uscita
- [ ] Collega GitHub, esponi una repo, crea un progetto, sposta una task tra le colonne e controlla il commit
- [ ] Copia un prompt per Claude, apri una PR con il marcatore, verifica che si colleghi e che il merge chiuda la task (poi "Annulla chiusura")
- [ ] Chat: messaggio, menzione, reazione, allegato immagine con testo alternativo, ricerca
- [ ] Notifiche: attiva le push (su iPhone solo dall'app installata) e premi **Invia una prova**; una menzione arriva in push, ma non se hai la chat aperta; negli orari silenziosi solo in Kyon
- [ ] Installa la PWA; apri Kyon offline: vedi i dati salvati e il banner, una modifica viene rifiutata con il messaggio
- [ ] VoiceOver (iPhone) e TalkBack o NVDA: titoli, focus all'apertura e chiusura dei fogli, annunci dei messaggi (vedi `docs/A11Y.md`)
- [ ] Riduci movimento, alto contrasto, testo grande (160%): niente si sovrappone o esce dallo schermo
- [ ] Tastiera: Cmd/Ctrl+K, "?", kanban con le frecce e "Sposta in…"

## 4. Piano Free: dove siamo (audit della Fase 10)

| Risorsa           | Limite Free                                      | Uso stimato per 4 persone                                   | Note                                                                                                                                       |
| ----------------- | ------------------------------------------------ | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Dimensione Worker | 3 MB gzip                                        | 1,81 MB (`kyon-web`)                                        | soglia di allarme 2,4 MB                                                                                                                   |
| CPU per richiesta | 10 ms                                            | route tipiche 1–5 ms su workerd locale                      | password: PBKDF2 pesante nel browser (Fase 2); da confermare in **Metrics → CPU Time** dopo il deploy                                      |
| Richieste Worker  | 100.000/giorno                                   | ~10.000 (≈ 250 pagine × 10 chiamate × 4)                    | le pagine sono statiche e servite dalla cache                                                                                              |
| Durable Objects   | 100.000 richieste/giorno                         | ~10.000 (connessioni, broadcast, ping ogni 25 s per socket) | Hibernation: nessuna durata a stanza ferma; i messaggi WebSocket in arrivo contano come frazione di richiesta (da verificare in dashboard) |
| D1                | 5 M righe lette, 100.000 scritte al giorno, 5 GB | lontano dai limiti                                          | dimensione visibile in Salute                                                                                                              |
| R2                | 10 GB, 1 M operazioni A/mese                     | allegati max 10 MB, immagini ridotte nel browser            | pulizia degli allegati mai inviati nel cron                                                                                                |
| Email             | solo destinatari verificati                      | spenta per default                                          | serve Workers Paid per scrivere a chiunque                                                                                                 |

Conclusione: **sul piano Free Kyon rientra** con ampio margine per 4 persone. Il passaggio a Workers Paid serve solo per l'email verso indirizzi non verificati o se le misure reali della CPU superassero i 10 ms (il Piano B è in `CLAUDE.md` §6).
