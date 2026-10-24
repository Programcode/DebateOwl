// Writes every mascot SVG, renders 512px PNGs with Playwright Chromium, and
// builds contact-sheet.png and index.html. Run: node mascot-concepts/_build/build.mjs
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { OWLS, EXPRESSIONS, owlMarkup } from './owls.mjs';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..');
const XMLNS = 'xmlns="http://www.w3.org/2000/svg"';

const NOTES = {
  'v1-ember': 'A confident competitor: horn-like tufts, half-lidded ice-blue eyes under level brows, and a navy bow tie. It walks to the podium like it has already won.',
  'v2-sage': 'A patient, bookish mentor in round glasses and a coral scarf. The pear shape, soft tufts and warm amber eyes read as safe and kind, which suits onboarding and empty states.',
  'v3-axiom': "A precise thinker with a rounded shield body, yellow owl eyes and a diamond beak. The chevron belly and straight edges survive at favicon size, and the sky blue stays close to today's brand.",
  'v4-quip': 'A quick-witted heckler whose body is a speech bubble with a tail, with violet eyes, a deadpan brow and quote marks on its belly. Debate is part of its shape.',
  'v5-spark': 'A gold hype owl with a lightning-bolt crest, a hero mask and a star on its chest. It is built for streaks, wins and big celebration moments.',
};

const files = {};
for (const o of OWLS) {
  const neutral = `<svg ${XMLNS} width="400" height="400" viewBox="0 0 400 400"><title>DebateOwl ${o.name}</title>${owlMarkup(o, 'neutral')}</svg>\n`;
  const sheet = `<svg ${XMLNS} width="1200" height="400" viewBox="0 0 1200 400"><title>DebateOwl ${o.name}: happy, thinking, sad</title>`
    + EXPRESSIONS.map((e, i) => `<g transform="translate(${i * 400 + 40} 40) scale(0.8)">${owlMarkup(o, e)}</g>`).join('')
    + '</svg>\n';
  const f = o.iconFrame;
  const tx = 512 - f.cx * f.scale, ty = 512 - f.cy * f.scale;
  const icon = `<svg ${XMLNS} width="1024" height="1024" viewBox="0 0 1024 1024"><title>DebateOwl ${o.name} app icon</title>`
    + `<rect width="1024" height="1024" fill="${o.colors.iconBg ?? o.hex}"/>`
    + `<g transform="translate(${tx.toFixed(1)} ${ty.toFixed(1)}) scale(${f.scale})">${owlMarkup(o, 'neutral', { icon: true })}</g></svg>\n`;
  files[o.id] = { neutral, sheet, icon };
  writeFileSync(join(OUT, `${o.id}.svg`), neutral);
  writeFileSync(join(OUT, `${o.id}-expressions.svg`), sheet);
  writeFileSync(join(OUT, `${o.id}-icon.svg`), icon);
}

const uri = (svg) => `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });

async function png(svg, w, h, path) {
  await page.setViewportSize({ width: w, height: h });
  await page.setContent(`<html><body style="margin:0"><img src="${uri(svg)}" width="${w}" height="${h}" style="display:block"></body></html>`);
  await page.locator('img').evaluate((img) => img.decode());
  await page.locator('img').screenshot({ path, omitBackground: true });
}

for (const o of OWLS) {
  const f = files[o.id];
  await png(f.neutral, 512, 512, join(OUT, `${o.id}.png`));
  await png(f.sheet, 1536, 512, join(OUT, `${o.id}-expressions.png`));
  await png(f.icon, 512, 512, join(OUT, `${o.id}-icon.png`));
}

// Contact sheet: neutral owls with name and hex, then a 48px and 24px row.
const FONT = 'font-family: ui-sans-serif, system-ui, "DejaVu Sans", sans-serif;';
const contact = `<html><body style="margin:0;background:#FBF8F3;${FONT}color:#1A1A2E">
<div id="sheet" style="width:1600px;padding:48px 40px 40px;box-sizing:border-box">
  <div style="font-size:30px;font-weight:800;letter-spacing:-0.5px">DebateOwl mascot concepts</div>
  <div style="font-size:16px;color:#6B6B7B;margin-top:6px">Five directions, neutral pose. Bottom rows: 48px and 24px legibility, plus app icons at 64px.</div>
  <div style="display:flex;justify-content:space-between;margin-top:36px">
  ${OWLS.map((o) => `<div style="width:290px;text-align:center">
    <img src="${uri(files[o.id].neutral)}" width="270" height="270">
    <div style="font-size:26px;font-weight:800;margin-top:8px">${o.name}</div>
    <div style="font-size:15px;color:#6B6B7B;margin-top:2px">${o.tagline}</div>
    <div style="display:inline-flex;align-items:center;gap:8px;margin-top:10px;font-size:17px;font-weight:600;font-family:ui-monospace,'DejaVu Sans Mono',monospace">
      <span style="width:22px;height:22px;border-radius:6px;background:${o.hex};display:inline-block"></span>${o.hex}</div>
  </div>`).join('')}
  </div>
  <div style="display:flex;justify-content:space-between;margin-top:36px;padding-top:24px;border-top:2px solid #E8E2D8">
  ${OWLS.map((o) => `<div style="width:290px;display:flex;justify-content:center;align-items:center;gap:22px">
    <img src="${uri(files[o.id].neutral)}" width="48" height="48">
    <img src="${uri(files[o.id].neutral)}" width="24" height="24">
    <img src="${uri(files[o.id].icon)}" width="64" height="64" style="border-radius:14px">
    <div style="background:#13132A;border-radius:10px;padding:6px;display:flex;gap:8px;align-items:center">
      <img src="${uri(files[o.id].neutral)}" width="48" height="48"><img src="${uri(files[o.id].neutral)}" width="24" height="24"></div>
  </div>`).join('')}
  </div>
</div></body></html>`;
await page.setViewportSize({ width: 1600, height: 900 });
await page.setContent(contact);
await page.evaluate(() => Promise.all([...document.images].map((i) => i.decode())));
await page.locator('#sheet').screenshot({ path: join(OUT, 'contact-sheet.png') });
await browser.close();

// Preview page. Uses the files in this folder by relative path.
const index = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>DebateOwl mascot concepts</title>
<style>
  :root { color-scheme: light dark; --bg:#FBF8F3; --fg:#1A1A2E; --muted:#6B6B7B; --card:#FFFFFF; --line:#E8E2D8; }
  @media (prefers-color-scheme: dark) { :root { --bg:#12121F; --fg:#F2F0EB; --muted:#A3A3B5; --card:#1C1C2E; --line:#2E2E44; } }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--fg); font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; }
  main { max-width:1180px; margin:0 auto; padding:40px 24px 80px; }
  h1 { font-size:34px; margin:0 0 6px; letter-spacing:-0.5px; }
  .lead { color:var(--muted); margin:0 0 28px; max-width:70ch; line-height:1.5; }
  .strip { display:flex; flex-wrap:wrap; gap:12px; margin-bottom:40px; }
  .strip a { display:flex; flex-direction:column; align-items:center; text-decoration:none; color:inherit; background:var(--card); border:1px solid var(--line); border-radius:16px; padding:12px 16px; }
  section { background:var(--card); border:1px solid var(--line); border-radius:24px; padding:28px; margin-bottom:28px; }
  .head { display:flex; align-items:baseline; gap:14px; flex-wrap:wrap; }
  .head h2 { margin:0; font-size:28px; }
  .chip { display:inline-flex; align-items:center; gap:8px; font: 600 15px ui-monospace, monospace; }
  .chip i { width:18px; height:18px; border-radius:5px; display:inline-block; }
  .tag { color:var(--muted); }
  .note { line-height:1.55; max-width:75ch; }
  .grid { display:grid; grid-template-columns: 260px 1fr; gap:24px; align-items:center; margin-top:16px; }
  .grid img.main { width:260px; height:260px; }
  .exp { width:100%; height:auto; }
  .row { display:flex; align-items:center; gap:22px; flex-wrap:wrap; margin-top:18px; padding-top:18px; border-top:1px solid var(--line); }
  .row small { color:var(--muted); display:block; text-align:center; margin-top:4px; }
  .icon { border-radius:22%; display:block; }
  .dark { background:#13132A; border-radius:12px; padding:8px; display:flex; gap:10px; align-items:center; }
  @media (max-width: 760px) { .grid { grid-template-columns: 1fr; } }
</style></head>
<body><main>
<h1>DebateOwl mascot concepts</h1>
<p class="lead">Five owl directions for a possible DebateLab to DebateOwl rename. Each has a neutral pose, three expressions (happy, thinking, sad) and an app icon. None is green, and none uses Duo's round body with an orange beak.</p>
<div class="strip">
${OWLS.map((o) => `<a href="#${o.id}"><img src="${o.id}.svg" width="96" height="96" alt="${o.name}"><b>${o.name}</b><span class="chip"><i style="background:${o.hex}"></i>${o.hex}</span></a>`).join('\n')}
<a href="contact-sheet.png"><img src="contact-sheet.png" height="96" alt="Contact sheet"><b>Contact sheet</b><span class="tag">PNG</span></a>
</div>
${OWLS.map((o) => `<section id="${o.id}">
  <div class="head"><h2>${o.id.slice(0, 2).toUpperCase()} · ${o.name}</h2><span class="tag">${o.tagline}</span><span class="chip"><i style="background:${o.hex}"></i>${o.hex}</span></div>
  <p class="note">${NOTES[o.id]}</p>
  <div class="grid"><img class="main" src="${o.id}.svg" alt="${o.name}, neutral"><img class="exp" src="${o.id}-expressions.svg" alt="${o.name}: happy, thinking, sad"></div>
  <div class="row">
    <div><img class="icon" src="${o.id}-icon.svg" width="180" height="180" alt="${o.name} app icon"><small>icon 180</small></div>
    <div><img class="icon" src="${o.id}-icon.svg" width="64" height="64" alt=""><small>icon 64</small></div>
    <div><img class="icon" src="${o.id}-icon.svg" width="32" height="32" alt=""><small>32</small></div>
    <div><img src="${o.id}.svg" width="48" height="48" alt=""><small>48</small></div>
    <div><img src="${o.id}.svg" width="24" height="24" alt=""><small>24</small></div>
    <div class="dark"><img src="${o.id}.svg" width="48" height="48" alt=""><img src="${o.id}.svg" width="24" height="24" alt=""></div>
    <div class="tag">Files: <a href="${o.id}.svg">svg</a> · <a href="${o.id}-expressions.svg">expressions</a> · <a href="${o.id}-icon.svg">icon</a> · <a href="${o.id}.png">png</a></div>
  </div>
</section>`).join('\n')}
</main></body></html>
`;
writeFileSync(join(OUT, 'index.html'), index);
console.log('built', OWLS.map((o) => o.id).join(', '));
