# Prossimi passi — Biohybrid

Documento vivo: cosa facciamo dopo, in ordine. Aggiornato a ogni sessione.

## Stato generale

| Area               | Stato | Note                |
| ------------------ | ----- | ------------------- |
| Login e profili    | ✅    | Supabase auth ok    |
| Schede allenamento | 🟢    | manca solo l'export |
| Grafici progressi  | 🟡    | in corso            |
| Notifiche          | ⚪    | da iniziare         |

## 1 · Grafici dei progressi

**Cosa.** Un grafico per ogni esercizio con i carichi nel tempo.

**Perché.** È la cosa che chiedono tutti dopo due settimane d'uso.

**È finita quando.** Il grafico si vede su telefono, con i dati degli ultimi 3 mesi.

- [x] Query dei carichi per esercizio
- [ ] Componente grafico leggero
  - [ ] Asse dei tempi in italiano
  - nota: niente librerie pesanti
- [ ] Vista "ultimi 3 mesi"

## 2 · Esportazione delle schede

**Cosa.** Esportare una scheda in PDF da condividere.

**Perché.** I personal trainer la vogliono stampata.

Dettagli tecnici, da non confondere con le task:

- usare la stampa del browser
- niente server

## 3 · Prossimi passi della community

1. 🟢 Pagina pubblica del clan
2. 🟡 Classifica settimanale
3. ⚪ Sfide tra clan
4. **Nota.** le sfide aspettano la classifica

## Ordine di priorità

1. Grafici
2. Esportazione
3. Community

```md
- [ ] questa non è una task: è dentro un blocco di codice
```

## Archivio

> Le sezioni sotto sono chiuse. Restano per memoria.

### ✅ Migrazione a Supabase

Fatta a settembre.
