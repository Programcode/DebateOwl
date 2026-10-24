// Builds the C trace SVGs and 512px PNG renders.
// Run: node mascot-concepts/c-trace/_tools/build.mjs
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import * as P from './parts.mjs';
import { POSES } from './poses.mjs';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..');
const svg = (w, h, title, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><title>${title}</title>${body}</svg>\n`;

const id = 'h';
const hero = svg(1024, 1024, 'DebateOwl C, pointing',
  P.defs(id)
  + P.rightWingHanging(id)
  + P.feet(id)
  + P.body(id)
  + P.tufts(id)
  + P.cheeks(id)
  + P.face(id)
  + P.belly(id)
  + P.glasses()
  + P.eyes(id)
  + P.beakOpen(id)
  + P.pointingHand(id));

const files = { 'c-hero': hero };
const TITLES = { 'c-idea': 'idea, pointing up', 'c-skeptical': 'skeptical, arms crossed', 'c-surprised': 'surprised, pointing at you', 'c-celebrating': 'celebrating' };
files['c-icon'] = svg(1024, 1024, 'DebateOwl C app icon', P.defs('i') + P.icon('i'));
for (const [name, fn] of Object.entries(POSES)) files[name] = svg(512, 512, `DebateOwl C, ${TITLES[name]}`, fn('q'));
for (const [name, s] of Object.entries(files)) writeFileSync(join(OUT, `${name}.svg`), s);

const only = process.argv[2];
const b = await chromium.launch();
const page = await b.newPage({ viewport: { width: 512, height: 512 } });
for (const [name, s] of Object.entries(files)) {
  if (only && only !== name) continue;
  await page.setContent(`<body style="margin:0;background:#fff"><img src="data:image/svg+xml;base64,${Buffer.from(s).toString('base64')}" width="512" height="512" style="display:block"></body>`);
  await page.locator('img').evaluate((i) => i.decode());
  await page.locator('img').screenshot({ path: join(OUT, `${name}.png`) });
}
await b.close();
console.log('built', Object.keys(files).join(', '));

// comparison.png: each reference crop next to its SVG render, plus the icon at 64/48/24px.
import { readFileSync } from 'node:fs';
const REF = '/home/codex/mascot-ref';
const PAIRS = [
  ['c-hero', 'c-blue-hero.jpg', 0, 0, 1024], ['c-idea', 'c-blue-expressions.jpg', 0, 0, 512], ['c-skeptical', 'c-blue-expressions.jpg', 512, 0, 512],
  ['c-surprised', 'c-blue-expressions.jpg', 0, 512, 512], ['c-celebrating', 'c-blue-expressions.jpg', 512, 512, 512],
];
const b2 = await chromium.launch();
const pg = await b2.newPage({ viewport: { width: 1100, height: 800 } });
const enc = (s) => `data:image/svg+xml;base64,${Buffer.from(s).toString('base64')}`;
const refs = Object.fromEntries(['c-blue-hero.jpg', 'c-blue-expressions.jpg'].map((f) => [f, `data:image/jpeg;base64,${readFileSync(join(REF, f)).toString('base64')}`]));
const crop = (f, x, y, size) => `<div style="width:420px;height:420px;background:url(${refs[f]}) -${x * 420 / size}px -${y * 420 / size}px / ${1024 * 420 / size}px ${1024 * 420 / size}px no-repeat"></div>`;
const cell = 'display:flex;flex-direction:column;align-items:center;gap:6px;font:600 15px ui-sans-serif,system-ui,sans-serif;color:#334';
const html = `<body style="margin:0;background:#F4F6FA"><div id="sheet" style="width:1000px;padding:28px 40px;box-sizing:border-box;font-family:ui-sans-serif,system-ui,sans-serif">
<div style="font-size:26px;font-weight:800;color:#0B2A6E">Owl C: reference vs SVG trace</div>
<div style="font-size:15px;color:#556;margin:4px 0 20px">Left: original raster crop. Right: hand-written SVG render.</div>
${PAIRS.map(([n, f, x, y, size]) => `<div style="display:flex;gap:40px;align-items:flex-start;margin-bottom:22px">
  <div style="${cell}">${crop(f, x, y, size)}<span>reference</span></div>
  <div style="${cell}"><img src="${enc(files[n])}" width="420" height="420" style="background:#fff"><span>${n}.svg</span></div></div>`).join('')}
<div style="display:flex;gap:36px;align-items:flex-end;padding-top:20px;border-top:2px solid #DDE3EE">
  <div style="${cell}"><img src="${enc(files['c-icon'])}" width="180" height="180" style="border-radius:40px"><span>c-icon.svg</span></div>
  ${[64, 48, 24].map((px) => `<div style="${cell}"><img src="${enc(files['c-icon'])}" width="${px}" height="${px}" style="border-radius:${px * 0.22}px"><span>${px}px</span></div>`).join('')}
  <div style="${cell}"><div style="background:#14161F;border-radius:12px;padding:12px;display:flex;gap:14px;align-items:flex-end">${[64, 48, 24].map((px) => `<img src="${enc(files['c-icon'])}" width="${px}" height="${px}" style="border-radius:${px * 0.22}px">`).join('')}</div><span>on dark</span></div>
</div></div></body>`;
await pg.setContent(html);
await pg.evaluate(() => Promise.all([...document.images].map((i) => i.decode())));
await pg.locator('#sheet').screenshot({ path: join(OUT, 'comparison.png') });
await b2.close();
console.log('comparison.png written');
