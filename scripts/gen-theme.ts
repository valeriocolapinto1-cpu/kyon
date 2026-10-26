/** Writes the 44 theme blocks (accent × scheme × contrast) as static CSS. Run after editing theme.ts. */
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { buildThemeCss } from '../packages/core/src/theme';
import { repoRoot } from './lib/run';

const target = path.join(repoRoot, 'apps', 'web', 'src', 'styles', 'themes.generated.css');
writeFileSync(target, buildThemeCss());
console.log(`Wrote ${path.relative(repoRoot, target)}`);
