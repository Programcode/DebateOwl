/**
 * Renders the tab icons in src/components/icon-paths.ts to template PNGs at
 * 1x, 2x and 3x for the native tab bar. iOS tints template images, so they
 * are drawn in black on transparent. Run from the repository root after
 * changing a tab icon:
 *
 *   npx tsx apps/mobile/scripts/render-tab-icons.ts
 */
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { iconSvg, type IconName } from '../src/components/icon-paths';

const TAB_ICONS: IconName[] = ['target', 'sparkles', 'swords', 'library', 'user'];
// The mock's tab icons are 22pt in a 320pt-wide frame; iOS tab bar glyphs are about 25pt.
const POINTS = 25;
const outDir = join(__dirname, '../assets/tab-icons');

async function main() {
  const browser = await chromium.launch();
  try {
    await mkdir(outDir, { recursive: true });
    for (const scale of [1, 2, 3]) {
      const page = await browser.newPage({ deviceScaleFactor: scale, viewport: { width: POINTS, height: POINTS } });
      for (const name of TAB_ICONS) {
        await page.setContent(`<body style="margin:0;background:transparent">${iconSvg(name, '#000', POINTS, 1.8)}</body>`);
        const png = await page.locator('svg').screenshot({ omitBackground: true });
        await writeFile(join(outDir, `${name}${scale === 1 ? '' : `@${scale}x`}.png`), png);
      }
      await page.close();
    }
  } finally {
    await browser.close();
  }
}

void main();
