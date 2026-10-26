/**
 * Renders the PWA/Apple PNG icons from the SVG logo with headless Chromium (Playwright).
 * Run after changing apps/web/public/brand/*.svg: `pnpm icons:gen`.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { repoRoot } from './lib/run';

const brand = path.join(repoRoot, 'apps', 'web', 'public', 'brand');
const out = path.join(repoRoot, 'apps', 'web', 'public', 'icons');

const targets = [
  { svg: 'kyon-icon.svg', file: 'icon-192.png', size: 192 },
  { svg: 'kyon-icon.svg', file: 'icon-512.png', size: 512 },
  { svg: 'kyon-icon-maskable.svg', file: 'icon-maskable-512.png', size: 512 },
  // Apple touch icons must be opaque and square: iOS applies its own mask.
  { svg: 'kyon-icon-maskable.svg', file: 'apple-touch-icon.png', size: 180 },
  { svg: 'kyon-icon.svg', file: 'favicon-32.png', size: 32 },
];

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  for (const target of targets) {
    const svg = readFileSync(path.join(brand, target.svg), 'utf8');
    await page.setViewportSize({ width: target.size, height: target.size });
    await page.setContent(
      `<html><body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${target.size}" height="${target.size}" `)}</body></html>`,
    );
    await page.screenshot({
      path: path.join(out, target.file),
      omitBackground: true,
      clip: { x: 0, y: 0, width: target.size, height: target.size },
    });
    console.log(`icons/${target.file}`);
  }
} finally {
  await browser.close();
}
