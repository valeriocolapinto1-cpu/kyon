import { markerLine } from './marker';

export interface ClaudeMdInput {
  project: string;
  repo: string;
  defaultBranch: string;
  workBranch: string | null;
  commitMode: 'direct' | 'branch_pr';
  /** .md files Kyon reads tasks from. */
  taskFiles: string[];
  planHeadings: string[];
}

/**
 * A starting CLAUDE.md for the project's repo: how Kyon reads tasks and tracks PRs, so Claude
 * Code keeps the `.md` files and the `Kyon-Run` marker working. Shown as a preview: Kyon never
 * writes it to the repo without an explicit confirmation.
 */
export function claudeMdFor(input: ClaudeMdInput): string {
  const files = input.taskFiles.length
    ? input.taskFiles.map((f) => `- \`${f}\``).join('\n')
    : '- (ancora nessuno: Kyon propone `TASKS.md`)';
  const target = input.workBranch || input.defaultBranch;
  return `# CLAUDE.md — ${input.project}

Repo \`${input.repo}\`, gestita con **Kyon** (il gestionale del gruppo Cerbero). Leggi questo file all'inizio di ogni sessione.

## Task

Kyon legge le task da questi file Markdown:

${files}

- Una task è una casella \`- [ ]\` / \`- [x]\`, oppure una voce di elenco sotto un titolo "di piano" (${input.planHeadings.map((h) => `"${h}"`).join(', ') || 'Prossimi passi, TODO'}).
- Quando completi una task, cambia **solo** la sua riga: \`- [ ]\` → \`- [x]\` (o il segno di stato ✅ se il file usa gli emoji). Non riscrivere né riordinare le altre righe: Kyon riconosce le task dal testo e dalla sezione.
- Per una nuova task aggiungi una riga in fondo all'elenco della sezione giusta.

## Branch e pull request

- Lavora su un branch dedicato (es. \`claude/<id>-<descrizione>\`) e apri la PR verso \`${target}\`.
- ${input.commitMode === 'branch_pr' ? 'Kyon scrive le sue modifiche alle task sul branch `kyon/tasks` con una PR propria: non modificarlo.' : `Kyon fa commit diretti su \`${target}\` quando qualcuno spunta una task dall'app.`}
- Se il prompt contiene una riga \`${markerLine('<id>')}\`, scrivila **identica** nella descrizione della PR e come trailer di ogni commit. Serve a Kyon per collegare la PR alla task e chiuderla al merge.

## Qualità

- Prima di aprire la PR esegui test, lint e controllo dei tipi del progetto.
- Commit piccoli con messaggi chiari (Conventional Commits: \`feat:\`, \`fix:\`, \`test:\`…).
`;
}
