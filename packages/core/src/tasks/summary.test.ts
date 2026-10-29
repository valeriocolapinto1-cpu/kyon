import { describe, expect, it } from 'vitest';
import { SUMMARY_MAX, summarizeTask } from './summary';

describe('summarizeTask', () => {
  it('drops asides and the final period', () => {
    expect(summarizeTask('Checkbox GFM (- [ ], con -, *, +) in qualsiasi .md della repo.')).toBe(
      'Checkbox GFM in qualsiasi .md della repo',
    );
  });

  it('keeps only the first clause', () => {
    expect(
      summarizeTask(
        'Cron a bassa frequenza. Riconcilia webhook persi e promemoria scadenza, rispetta i 10 ms.',
      ),
    ).toBe('Cron a bassa frequenza');
    expect(summarizeTask('Webhook della GitHub App: push, pull_request, issues e altro')).toBe(
      'Webhook della GitHub App',
    );
  });

  it('removes Markdown, links and status marks', () => {
    expect(summarizeTask('✅ **Aggiungi** il [parser](https://x.test) in `core`')).toBe(
      'Aggiungi il parser in core',
    );
  });

  it('cuts long text at a word boundary with an ellipsis', () => {
    const text =
      'Spuntare e deselezionare aggiungere righe rinominare e riordinare le task senza toccare il resto del file';
    const short = summarizeTask(text);
    expect(short.length).toBeLessThanOrEqual(SUMMARY_MAX);
    expect(short.endsWith('…')).toBe(true);
    expect(text.startsWith(short.slice(0, -1))).toBe(true);
    expect(short).not.toMatch(/\s…$/);
  });

  it('does not cut abbreviations or short heads', () => {
    expect(summarizeTask('Es. 15 minuti di attesa tra un controllo e l’altro')).toBe(
      'Es. 15 minuti di attesa tra un controllo e l’altro',
    );
    expect(summarizeTask('Fix: login')).toBe('Fix: login');
  });

  it('returns short tasks unchanged', () => {
    expect(summarizeTask('Scrivi i test')).toBe('Scrivi i test');
    expect(summarizeTask('')).toBe('');
  });
});
