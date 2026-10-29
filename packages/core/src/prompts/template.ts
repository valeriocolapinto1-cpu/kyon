import { markerLine, parseMarkers } from './marker';

export const TEMPLATE_VARIABLES = [
  'project',
  'repo',
  'task',
  'file',
  'section',
  'branch',
  'assignee',
  'subtasks',
  'claude_md',
  'run_id',
] as const;
export type TemplateVariable = (typeof TEMPLATE_VARIABLES)[number];
export type TemplateValues = Record<TemplateVariable, string>;

const VARIABLE = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;

/** Every `{{name}}` used, split into known and unknown (shown highlighted in the editor). */
export function templateVariables(text: string): { known: TemplateVariable[]; unknown: string[] } {
  const known = new Set<TemplateVariable>();
  const unknown = new Set<string>();
  for (const [, name = ''] of text.matchAll(VARIABLE)) {
    if ((TEMPLATE_VARIABLES as readonly string[]).includes(name))
      known.add(name as TemplateVariable);
    else unknown.add(name);
  }
  return { known: [...known], unknown: [...unknown] };
}

/** Value shown for a known variable with nothing in it: never silently empty. */
export const EMPTY_VALUE = '(nessuno)';

/**
 * Replaces known variables; unknown ones stay as written (`{{nome}}`) and are reported, so a typo
 * is visible in the copied text instead of disappearing.
 */
export function renderTemplate(text: string, values: Partial<TemplateValues>) {
  const unknown: string[] = [];
  const rendered = text.replace(VARIABLE, (whole, name: string) => {
    if (!(TEMPLATE_VARIABLES as readonly string[]).includes(name)) {
      if (!unknown.includes(name)) unknown.push(name);
      return whole;
    }
    const value = values[name as TemplateVariable];
    return value && value.trim() ? value : EMPTY_VALUE;
  });
  return { text: rendered, unknown };
}

export interface BuiltinTemplate {
  key: string;
  name: string;
  body: string;
}

/** The four templates every project starts with (in code, not seeded in the database). */
export const BUILTIN_TEMPLATES: BuiltinTemplate[] = [
  {
    key: 'implement',
    name: 'Implementa la task',
    body: `Implementa questa task del progetto {{project}}: **{{task}}**.

Sottotask:
{{subtasks}}

Procedi a piccoli passi, aggiungi i test che servono e lascia il codice più pulito di come l'hai trovato.`,
  },
  {
    key: 'bugfix',
    name: 'Correggi bug',
    body: `C'è un bug legato a: **{{task}}** ({{file}}, sezione "{{section}}").

1. Riproducilo con un test che fallisce.
2. Trova la causa, non solo il sintomo.
3. Correggilo e verifica che il test passi, senza rompere il resto.

Descrivi nella PR la causa e la correzione.`,
  },
  {
    key: 'tests',
    name: 'Scrivi test / aumenta copertura',
    body: `Aumenta la copertura dei test per la parte di {{project}} che riguarda: **{{task}}**.

Concentrati sui casi limite e sui percorsi di errore. Non cambiare il comportamento del codice: se trovi un bug, segnalalo nella descrizione della PR.`,
  },
  {
    key: 'refactor',
    name: 'Refactor e review',
    body: `Fai una revisione e un refactor mirato del codice legato a: **{{task}}**.

- Semplifica dove possibile, elimina duplicazioni e codice morto.
- Mantieni invariato il comportamento (i test esistenti devono passare).
- Elenca nella PR cosa hai cambiato e perché.`,
  },
];

/**
 * The automatic block appended to every copied prompt. Admins can change its wording; the
 * `Kyon-Run:` line is always present whatever the template says (see buildFullPrompt).
 */
export const DEFAULT_FOOTER = `---

## Contesto da Kyon

- Task: **{{task}}**
- Sezione: {{section}}
- File: \`{{file}}\` nella repo {{repo}}
- Sottotask:
{{subtasks}}

Prima di iniziare leggi il \`CLAUDE.md\` della repo (se c'è) e rispettalo.

Lavora sul branch \`{{branch}}\` e apri una pull request verso il branch di lavoro del progetto.

Quando apri la PR, scrivi nella sua descrizione questa riga esatta (da sola, senza modificarla):

Kyon-Run: {{run_id}}

Aggiungi la stessa riga come trailer in ogni messaggio di commit. Non modificare questo identificativo.`;

/**
 * The repo's CLAUDE.md as pasted in a prompt: a marker line copied from it must not be taken for
 * this run's marker (it would link PRs to the wrong run), so those lines are left out.
 */
export function claudeMdForPrompt(content: string): string {
  return content
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => (parseMarkers(line).length ? '(riga con un marcatore Kyon-Run omessa)' : line))
    .join('\n')
    .trim();
}

/**
 * Body (already chosen by the user) + footer, with the marker guaranteed. When the repo has a
 * CLAUDE.md that Kyon has read, it goes in automatically between body and footer, unless the
 * template already places it with `{{claude_md}}`.
 */
export function buildFullPrompt(body: string, footer: string, values: TemplateValues) {
  const claudeMd = claudeMdForPrompt(values.claude_md);
  const safe = { ...values, claude_md: claudeMd };
  const main = renderTemplate(body.trim(), safe);
  const tail = renderTemplate((footer.trim() || DEFAULT_FOOTER).trim(), safe);
  const placed = templateVariables(`${body}\n${footer}`).known.includes('claude_md');
  const context =
    claudeMd && !placed ? `## CLAUDE.md della repo (letto da Kyon)\n\n${claudeMd}\n\n` : '';
  let text = `${main.text}\n\n${context}${tail.text}`;
  if (!parseMarkers(text).includes(values.run_id))
    text += `\n\nScrivi questa riga esatta nella descrizione della PR e come trailer di ogni commit:\n\n${markerLine(values.run_id)}`;
  return { text: `${text}\n`, unknown: [...new Set([...main.unknown, ...tail.unknown])] };
}

/** Subtasks as a Markdown list ("(nessuno)" when there are none). */
export function subtaskList(subtasks: { text: string; done: boolean }[]): string {
  if (!subtasks.length) return EMPTY_VALUE;
  return subtasks.map((s) => `  - [${s.done ? 'x' : ' '}] ${s.text}`).join('\n');
}
