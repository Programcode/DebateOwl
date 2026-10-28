/**
 * Renders the website's owl (Ollie) to PNGs for the app: every pose in
 * src/assets/owl and the owl mark in public/owl-mark.svg, on transparent
 * 512 px squares, plus the app icon, splash image and web favicon. React Native
 * cannot draw the hand-traced SVGs reliably, so the app ships these. Run from
 * the repository root after the website's owl changes:
 *
 *   npx tsx apps/mobile/scripts/render-owls.ts
 */
import { chromium } from '@playwright/test';
import { copyFile, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const root = join(__dirname, '../../..');
const poseDir = join(root, 'src/assets/owl');
const owlDir = join(__dirname, '../assets/owl');
const imageDir = join(__dirname, '../assets/images');
const SIZE = 512;

async function render(page: import('@playwright/test').Page, svg: string, size: number, background = 'transparent', inset = 0, filter = 'none') {
  await page.setViewportSize({ width: size, height: size });
  const inner = size - inset * 2;
  await page.setContent(
    `<body style="margin:0;background:${background}"><div style="width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center">` +
      `<img style="width:${inner}px;height:${inner}px;filter:${filter}" src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}"></div></body>`,
  );
  await page.locator('img').evaluate((img: HTMLImageElement) => img.decode());
  return page.screenshot({ omitBackground: background === 'transparent' });
}

async function main() {
  const browser = await chromium.launch();
  try {
    await mkdir(owlDir, { recursive: true });
    const page = await browser.newPage();
    for (const file of (await readdir(poseDir)).filter((name) => name.startsWith('owl-') && name.endsWith('.svg') && name !== 'owl-favicon.svg')) {
      const svg = await readFile(join(poseDir, file), 'utf8');
      await writeFile(join(owlDir, file.replace(/^owl-/, '').replace(/\.svg$/, '.png')), await render(page, svg, SIZE));
    }
    const mark = await readFile(join(root, 'public/owl-mark.svg'), 'utf8');
    await writeFile(join(owlDir, 'mark.png'), await render(page, mark, SIZE));
    // The splash shows the whole owl, pointing, on the splash background colour (app.config.ts).
    const point = await readFile(join(poseDir, 'owl-point.svg'), 'utf8');
    await writeFile(join(imageDir, 'splash-icon.png'), await render(page, point, 1024));
    // Android's adaptive icon: the mark's owl without its tile, on the tile's colour.
    const owlOnly = mark.replace('<rect width="1024" height="1024" fill="#DDF0FF"/>', '');
    if (owlOnly === mark) throw new Error('The owl mark no longer has the tile rect this script removes');
    await writeFile(join(imageDir, 'android-icon-foreground.png'), await render(page, owlOnly, 1024, 'transparent', 160));
    await writeFile(join(imageDir, 'android-icon-background.png'), await render(page, '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>', 1024, '#DDF0FF'));
    await writeFile(join(imageDir, 'android-icon-monochrome.png'), await render(page, owlOnly, 1024, 'transparent', 160, 'brightness(0)'));
    // The App Store icon is the website's: the same owl on its own background, square and opaque.
    await copyFile(join(root, 'public/icon-1024.png'), join(imageDir, 'icon.png'));
    await copyFile(join(root, 'public/favicon.png'), join(imageDir, 'favicon.png'));
  } finally {
    await browser.close();
  }
}

void main();
