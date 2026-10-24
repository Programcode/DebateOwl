// Measurement helpers for tracing the C reference images in Chromium.
// Usage:
//   node lab.mjs grid <img> <x> <y> <w> <h> <scale> <out.png> [step]
//   node lab.mjs sample <img> "x,y x,y ..."
//   node lab.mjs rows <img> <x> <y> <w> <h> <step>   (left/right extents of non-background per row)
//   node lab.mjs overlay <img> <svg> <x> <y> <w> <h> <out.png> [mode]  (svg drawn into the crop box)
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';

const [cmd, img, ...a] = process.argv.slice(2);
const dataUrl = (p, mime) => `data:${mime};base64,${readFileSync(p).toString('base64')}`;
const b = await chromium.launch();
const page = await b.newPage({ viewport: { width: 1400, height: 1400 } });
await page.setContent(`<img id="ref" src="${dataUrl(img, 'image/jpeg')}"><canvas id="c"></canvas>`);
await page.evaluate(() => document.getElementById('ref').decode());

if (cmd === 'grid') {
  const [x, y, w, h, s, out, step = 20] = a;
  const url = await page.evaluate(([x, y, w, h, s, step]) => {
    const im = document.getElementById('ref'), c = document.getElementById('c');
    c.width = w * s; c.height = h * s;
    const g = c.getContext('2d'); g.imageSmoothingEnabled = true;
    g.drawImage(im, x, y, w, h, 0, 0, w * s, h * s);
    g.font = '11px monospace';
    for (let gx = Math.ceil(x / step) * step; gx <= x + w; gx += step) {
      const px = (gx - x) * s; g.strokeStyle = gx % (step * 5) ? 'rgba(255,0,0,.35)' : 'rgba(255,0,0,.8)';
      g.beginPath(); g.moveTo(px, 0); g.lineTo(px, h * s); g.stroke();
      g.fillStyle = 'red'; g.fillText(gx, px + 2, 11);
    }
    for (let gy = Math.ceil(y / step) * step; gy <= y + h; gy += step) {
      const py = (gy - y) * s; g.strokeStyle = gy % (step * 5) ? 'rgba(255,0,0,.35)' : 'rgba(255,0,0,.8)';
      g.beginPath(); g.moveTo(0, py); g.lineTo(w * s, py); g.stroke();
      g.fillStyle = 'red'; g.fillText(gy, 2, py - 2);
    }
    return c.toDataURL('image/png');
  }, [x, y, w, h, s, step].map(Number));
  const { writeFileSync } = await import('node:fs');
  writeFileSync(out, Buffer.from(url.split(',')[1], 'base64'));
}

if (cmd === 'sample') {
  const pts = a[0].trim().split(/\s+/).map((p) => p.split(',').map(Number));
  const res = await page.evaluate((pts) => {
    const im = document.getElementById('ref'), c = document.getElementById('c');
    c.width = im.naturalWidth; c.height = im.naturalHeight;
    const g = c.getContext('2d'); g.drawImage(im, 0, 0);
    return pts.map(([x, y]) => {
      const d = g.getImageData(x - 2, y - 2, 5, 5).data; let r = 0, gg = 0, bb = 0;
      for (let i = 0; i < d.length; i += 4) { r += d[i]; gg += d[i + 1]; bb += d[i + 2]; }
      const hx = (v) => Math.round(v / 25).toString(16).padStart(2, '0');
      return `${x},${y} #${hx(r)}${hx(gg)}${hx(bb)}`.toUpperCase();
    });
  }, pts);
  console.log(res.join('\n'));
}

if (cmd === 'rows') {
  const [x, y, w, h, step] = a.slice(0, 5).map(Number);
  const pred = a[5] ?? '(r + g + b) / 3 < 225 || Math.abs(r - b) > 30';
  const res = await page.evaluate(([x, y, w, h, step, pred]) => {
    const test = new Function('r', 'g', 'b', `return ${pred};`);
    const im = document.getElementById('ref'), c = document.getElementById('c');
    c.width = im.naturalWidth; c.height = im.naturalHeight;
    const g = c.getContext('2d'); g.drawImage(im, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    const fg = (px, py) => { const i = (py * c.width + px) * 4; return test(d[i], d[i + 1], d[i + 2]); };
    const out = [];
    for (let yy = y; yy < y + h; yy += step) {
      const runs = []; let start = -1;
      for (let xx = x; xx < x + w; xx++) {
        const f = fg(xx, yy);
        if (f && start < 0) start = xx;
        if (!f && start >= 0) { if (xx - start > 3) runs.push(`${start}-${xx - 1}`); start = -1; }
      }
      if (start >= 0) runs.push(`${start}-${x + w - 1}`);
      out.push(`y${yy}: ${runs.join(' ')}`);
    }
    return out;
  }, [x, y, w, h, step, pred]);
  console.log(res.join('\n'));
}

if (cmd === 'overlay') {
  const [svgPath, x, y, w, h, out, mode = 'side'] = a;
  const svg = dataUrl(svgPath, 'image/svg+xml');
  const url = await page.evaluate(async ([svg, x, y, w, h, mode]) => {
    const im = document.getElementById('ref'), c = document.getElementById('c');
    const s = new Image(); s.src = svg; await s.decode();
    const S = 512 / Math.max(w, h);
    const W = Math.round(w * S), H = Math.round(h * S);
    const g = c.getContext('2d');
    if (mode === 'side') {
      c.width = W * 2 + 10; c.height = H; g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
      g.drawImage(im, x, y, w, h, 0, 0, W, H); g.drawImage(s, W + 10, 0, W, H);
    } else {
      c.width = W; c.height = H; g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
      g.drawImage(im, x, y, w, h, 0, 0, W, H);
      if (mode === 'onion') { g.globalAlpha = 0.5; g.drawImage(s, 0, 0, W, H); }
      if (mode === 'diff') { g.globalCompositeOperation = 'difference'; g.drawImage(s, 0, 0, W, H); }
    }
    return c.toDataURL('image/png');
  }, [svg, ...[x, y, w, h].map(Number), mode]);
  const { writeFileSync } = await import('node:fs');
  writeFileSync(out, Buffer.from(url.split(',')[1], 'base64'));
}
await b.close();
