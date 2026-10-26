import { spawn, type SpawnOptions } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Shared local state for every Worker, so web, realtime and cron see the same D1/KV/R2. */
export const localStateDir = path.join(repoRoot, '.wrangler', 'state');

// On Windows, `pnpm` is a .cmd shim and needs a shell to be resolved.
const useShell = process.platform === 'win32';

export interface RunOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  /** Capture stdout instead of inheriting it. */
  capture?: boolean;
}

export function run(command: string, args: string[], options: RunOptions = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    const spawnOptions: SpawnOptions = {
      cwd: options.cwd ?? repoRoot,
      env: { ...process.env, ...options.env },
      stdio: options.capture ? ['ignore', 'pipe', 'inherit'] : 'inherit',
      shell: useShell,
    };
    const child = spawn(command, args, spawnOptions);
    let stdout = '';
    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`${command} ${args.join(' ')} exited with code ${code}`));
    });
  });
}

export function spawnLong(name: string, command: string, args: string[], cwd: string) {
  const child = spawn(command, args, {
    cwd,
    env: process.env,
    stdio: ['inherit', 'pipe', 'pipe'],
    shell: useShell,
  });
  const prefix = `[${name}] `;
  const forward = (stream: NodeJS.WriteStream) => (chunk: Buffer) => {
    for (const line of chunk.toString().split(/\r?\n/)) {
      if (line.length > 0) stream.write(prefix + line + '\n');
    }
  };
  child.stdout?.on('data', forward(process.stdout));
  child.stderr?.on('data', forward(process.stderr));
  return child;
}
