// Five DebateOwl mascot concepts. Each owl is drawn in a 400x400 box,
// centred on x=200, from flat shapes only (no text, no fonts, no raster).
//
// Shared style: one outline weight (W) in each owl's dark ink, a body filled
// with its shade colour and overlaid with the main colour shifted up-left
// (leaving a flat rim shadow), one flat highlight, a lighter belly/face,
// big glossy eyes with a coloured iris and two highlights.

const W = 10;
const n = (v) => Math.round(v * 10) / 10;
const MIRROR = 'matrix(-1 0 0 1 400 0)';
const mirror = (s) => `${s}<g transform="${MIRROR}">${s}</g>`;

// Upper eyelid: a circular cap cut by a straight line. Offsets are in eye
// radii from the centre; negative is up. s=-1 is the viewer's left eye.
function lidPath(cx, cy, r, s, outer, inner) {
  const yl = cy + (s < 0 ? outer : inner) * r;
  const yr = cy + (s < 0 ? inner : outer) * r;
  const lx = cx - Math.sqrt(Math.max(0, r * r - (yl - cy) ** 2));
  const rx = cx + Math.sqrt(Math.max(0, r * r - (yr - cy) ** 2));
  const large = (yl + yr) / 2 > cy ? 1 : 0;
  return `M${n(lx)} ${n(yl)} A${r} ${r} 0 ${large} 1 ${n(rx)} ${n(yr)} Z`;
}

// Expression presets, in eye radii. look[0] points inward unless absolute.
const EXPR = {
  neutral: { look: [0.1, 0.05] },
  happy: { arc: true, brows: [[-0.32, -0.5], [-0.32, -0.5]] },
  thinking: {
    look: [0.26, -0.24], absolute: true,
    lids: [[-0.2, -0.2], null],
    brows: [[0.12, 0.12], [-0.5, -0.32]],
  },
  sad: {
    look: [0.04, 0.26],
    lids: [[-0.05, -0.55], [-0.05, -0.55]],
    brows: [[0.22, -0.32], [0.22, -0.32]],
  },
};

function eyes(o, expr) {
  const e = o.eyes, c = o.colors, x = EXPR[expr];
  let out = '';
  e.pos.forEach(([cx, cy], i) => {
    const s = i === 0 ? -1 : 1;
    const r = e.r;
    if (x.arc) {
      out += `<path d="M${n(cx - r * 0.66)} ${n(cy + r * 0.3)} Q${cx} ${n(cy - r * 0.72)} ${n(cx + r * 0.66)} ${n(cy + r * 0.3)}" fill="none" stroke="${e.arcColor ?? c.ink}" stroke-width="15" stroke-linecap="round"/>`;
      return;
    }
    const clip = `${o.uid}-eye${i}`;
    const dx = (x.absolute ? x.look[0] : -s * x.look[0]) * r;
    const dy = x.look[1] * r;
    const ir = r * e.iris, px = cx + dx, py = cy + dy;
    out += `<clipPath id="${clip}"><circle cx="${cx}" cy="${cy}" r="${r}"/></clipPath>`;
    out += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#FFFFFF"/>`;
    out += `<g clip-path="url(#${clip})">`
      + `<circle cx="${n(px)}" cy="${n(py)}" r="${n(ir)}" fill="${c.iris}"/>`
      + `<circle cx="${n(px)}" cy="${n(py)}" r="${n(ir * 0.56)}" fill="${c.ink}"/>`
      + `<circle cx="${n(px + ir * 0.34)}" cy="${n(py - ir * 0.36)}" r="${n(ir * 0.3)}" fill="#FFFFFF"/>`
      + `<circle cx="${n(px - ir * 0.42)}" cy="${n(py + ir * 0.4)}" r="${n(ir * 0.13)}" fill="#FFFFFF"/>`;
    const lids = expr === 'neutral' ? [e.neutralLid, e.neutralLid] : (x.lids ?? [null, null]);
    const l = lids[i];
    if (l) out += `<path d="${lidPath(cx, cy, r + W, s, l[0] * (r / (r + W)), l[1] * (r / (r + W)))}" fill="${e.lidFill ?? c.main}" stroke="${c.ink}" stroke-width="${W - 1}" stroke-linejoin="round"/>`;
    out += '</g>';
    if (e.outline !== false) out += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${c.ink}" stroke-width="${W - 1}"/>`;
  });
  if (o.brows) {
    const b = o.brows;
    e.pos.forEach(([cx, cy], i) => {
      const s = i === 0 ? -1 : 1;
      const [od, id] = (expr === 'neutral' ? b.neutral : x.brows)[i];
      const R = b.r ?? e.r;
      const by = cy - R - b.gap;
      const ox = cx + s * R * 0.72, ix = cx - s * R * 0.42;
      out += `<path d="M${n(ox)} ${n(by + od * R)} L${n(ix)} ${n(by + id * R)}" stroke="${b.color ?? c.ink}" stroke-width="${b.w ?? 16}" stroke-linecap="round" fill="none"/>`;
    });
  }
  return out;
}

// Hooked owl beak (or Axiom's diamond), outlined. Open shows mouth and tongue.
function beak(o, mode) {
  const b = o.beak, c = o.colors;
  const { x, y } = b;
  const k = mode === 'small' ? 0.82 : 1;
  const w = b.w * k, h = b.h * k;
  const stroke = `stroke="${c.ink}" stroke-width="${W - 1}" stroke-linejoin="round"`;
  const upper = (top, ww, hh) => b.diamond
    ? `<path d="M${x} ${n(top)} L${n(x + ww / 2)} ${n(top + hh * 0.5)} L${x} ${n(top + hh)} L${n(x - ww / 2)} ${n(top + hh * 0.5)} Z" fill="${c.beak}" ${stroke}/>`
      + `<path d="M${x} ${n(top + hh * 0.5)} L${n(x + ww / 2)} ${n(top + hh * 0.5)} L${x} ${n(top + hh)} Z" fill="${c.beak2}"/>`
    : `<path d="M${n(x - ww / 2)} ${n(top)} Q${x} ${n(top - hh * 0.28)} ${n(x + ww / 2)} ${n(top)} Q${n(x + ww * 0.36)} ${n(top + hh * 0.62)} ${x} ${n(top + hh)} Q${n(x - ww * 0.36)} ${n(top + hh * 0.62)} ${n(x - ww / 2)} ${n(top)} Z" fill="${c.beak}" ${stroke}/>`
      + `<path d="M${x} ${n(top + hh * 0.08)} Q${n(x + ww * 0.32)} ${n(top + hh * 0.1)} ${n(x + ww * 0.36)} ${n(top + hh * 0.18)} Q${n(x + ww * 0.26)} ${n(top + hh * 0.6)} ${x} ${n(top + hh * 0.86)} Z" fill="${c.beak2}"/>`;
  if (mode === 'open') {
    const my = y + h * (b.diamond ? 0.42 : 0.2);
    return `<path d="M${n(x - w * 0.5)} ${n(my)} Q${n(x - w * 0.5)} ${n(my + h * 1.3)} ${x} ${n(my + h * 1.35)} Q${n(x + w * 0.5)} ${n(my + h * 1.3)} ${n(x + w * 0.5)} ${n(my)} Z" fill="#4A1426" ${stroke}/>`
      + `<path d="M${n(x - w * 0.3)} ${n(my + h * 1.12)} Q${x} ${n(my + h * 0.7)} ${n(x + w * 0.3)} ${n(my + h * 1.12)} Q${x} ${n(my + h * 1.32)} ${n(x - w * 0.3)} ${n(my + h * 1.12)} Z" fill="#FF7E95"/>`
      + upper(y - 4, w * 1.08, h * 0.78);
  }
  return upper(y + (1 - k) * 6, w, h);
}

// Three-toed foot, outlined.
function foot(o, cx, cy) {
  const c = o.colors, w = 62, r = w / 6;
  const x0 = cx - w / 2, x1 = cx + w / 2;
  return `<path d="M${x0} ${cy} Q${cx} ${cy - 34} ${x1} ${cy} A${r} ${r} 0 0 1 ${n(x1 - 2 * r)} ${cy} A${r} ${r} 0 0 1 ${n(x1 - 4 * r)} ${cy} A${r} ${r} 0 0 1 ${x0} ${cy} Z" fill="${c.beak}" stroke="${c.ink}" stroke-width="${W - 1}" stroke-linejoin="round"/>`;
}

// Wings: one path drawn for the viewer's left side, rotated about a shoulder
// pivot, then mirrored. Positive angles raise the wing outward.
function wing(o, a) {
  const w = o.wing, c = o.colors;
  return `<g transform="rotate(${a} ${w.px} ${w.py})"><path d="${w.d}" fill="${w.fill ?? c.shade}" stroke="${c.ink}" stroke-width="${W}" stroke-linejoin="round"/>${w.detail ? `<path d="${w.detail}" fill="none" stroke="${c.ink}" stroke-width="${W - 3}" stroke-linecap="round" stroke-linejoin="round"/>` : ''}</g>`;
}
const leftWing = (o, a) => wing(o, a);
const rightWing = (o, a) => `<g transform="${MIRROR}">${wing(o, a)}</g>`;

const POSE = {
  neutral: { wings: [0, 0], beak: 'closed' },
  happy: { wings: [126, 126], beak: 'open' },
  thinking: { wings: [0, 112], beak: 'closed' },
  sad: { wings: [-6, -6], beak: 'small' },
};

function extra(o, expr) {
  const c = o.colors;
  if (expr === 'happy') {
    const bits = [
      [56, 64, 'rect', o.confetti[0], 25], [348, 56, 'rect', o.confetti[1], -20],
      [34, 176, 'circle', o.confetti[2]], [374, 168, 'rect', o.confetti[0], 40],
      [112, 20, 'circle', o.confetti[1]], [290, 16, 'rect', o.confetti[2], 60],
      [370, 262, 'circle', o.confetti[0]], [28, 270, 'rect', o.confetti[1], -35],
    ];
    return bits.map(([x, y, t, col, rot]) => t === 'rect'
      ? `<rect x="${x - 10}" y="${y - 6}" width="20" height="12" rx="4" fill="${col}" stroke="${c.ink}" stroke-width="4" transform="rotate(${rot} ${x} ${y})"/>`
      : `<circle cx="${x}" cy="${y}" r="8" fill="${col}" stroke="${c.ink}" stroke-width="4"/>`).join('');
  }
  if (expr === 'thinking') {
    const [bx, by] = o.thought ?? [54, 46];
    return `<circle cx="${bx + 36}" cy="${by + 54}" r="6" fill="#FFFFFF" stroke="${c.ink}" stroke-width="5"/>`
      + `<circle cx="${bx + 20}" cy="${by + 36}" r="9" fill="#FFFFFF" stroke="${c.ink}" stroke-width="5"/>`
      + `<rect x="${bx - 46}" y="${by - 30}" width="92" height="52" rx="26" fill="#FFFFFF" stroke="${c.ink}" stroke-width="6"/>`
      + [-22, 0, 22].map((d) => `<circle cx="${bx + d}" cy="${by - 4}" r="7" fill="${c.ink}"/>`).join('');
  }
  if (expr === 'sad') {
    const [x, y] = o.sweat ?? [336, 100];
    return `<path d="M${x} ${y} C${x - 8} ${y + 16} ${x - 15} ${y + 26} ${x - 15} ${y + 35} A15 15 0 0 0 ${x + 15} ${y + 35} C${x + 15} ${y + 26} ${x + 8} ${y + 16} ${x} ${y} Z" fill="#7FD0FF" stroke="${c.ink}" stroke-width="5" stroke-linejoin="round"/>`
      + `<ellipse cx="${x - 5}" cy="${y + 32}" rx="4" ry="6" fill="#FFFFFF"/>`;
  }
  return '';
}

export function owlMarkup(base, expr, opts = {}) {
  const o = { ...base, uid: `${base.id}-${expr}${opts.icon ? '-icon' : ''}` };
  const c = o.colors, p = POSE[expr];
  const bodyClip = `${o.uid}-body`;
  const [la, ra] = p.wings;
  const raised = (a) => a > 60;
  const back = (raised(la) ? leftWing(o, la) : '') + (raised(ra) ? rightWing(o, ra) : '');
  const front = (raised(la) ? '' : leftWing(o, la)) + (raised(ra) ? '' : rightWing(o, ra));
  return `<clipPath id="${bodyClip}"><path d="${o.bodyD}"/></clipPath>`
    + back
    + (o.behind?.(expr) ?? '')
    + `<path d="${o.bodyD}" fill="${c.shade}"/>`
    + `<g clip-path="url(#${bodyClip})"><path d="${o.bodyD}" fill="${c.main}" transform="translate(-16 -12)"/>${o.tones}</g>`
    + `<path d="${o.bodyD}" fill="none" stroke="${c.ink}" stroke-width="${W}" stroke-linejoin="round"/>`
    + (o.overBody?.(expr) ?? '')
    + o.feet.map(([x, y]) => foot(o, x, y)).join('')
    + front
    + eyes(o, expr)
    + beak(o, p.beak)
    + (o.front?.(expr) ?? '')
    + (opts.icon ? '' : extra(o, expr));
}

// ---------------------------------------------------------------- V1 Ember
const ember = (() => {
  const c = {
    main: '#FF4A26', shade: '#CF2E12', light: '#FFE7DA', hi: '#FF8A6B', ink: '#2A1330',
    beak: '#FFC21A', beak2: '#E89A00', iris: '#38B6FF',
  };
  return {
    id: 'v1-ember', name: 'Ember', hex: c.main, colors: c,
    tagline: 'The sharp closer',
    confetti: ['#FFC21A', '#38B6FF', '#FFFFFF'],
    iconFrame: { scale: 2.35, cx: 200, cy: 200 },
    bodyD: 'M200 96 Q158 82 120 40 Q104 98 84 140 C64 186 62 252 76 298 C92 352 146 372 200 372 C254 372 308 352 324 298 C338 252 336 186 316 140 Q296 98 280 40 Q242 82 200 96 Z',
    tones: `<ellipse cx="124" cy="112" rx="10" ry="26" transform="rotate(32 124 112)" fill="${c.hi}"/>`
      + `<path d="M200 252 C150 252 120 290 122 326 C126 360 166 372 200 372 C234 372 274 360 278 326 C280 290 250 252 200 252 Z" fill="${c.light}"/>`
      + `<path d="M200 130 C178 102 106 98 96 160 C88 214 140 240 200 246 C260 240 312 214 304 160 C294 98 222 102 200 130 Z" fill="${c.light}"/>`,
    feet: [[166, 374], [234, 374]],
    front: () => `<path d="M200 268 L162 250 Q156 268 162 286 Z M200 268 L238 250 Q244 268 238 286 Z" fill="#2E2C66" stroke="${c.ink}" stroke-width="${W - 1}" stroke-linejoin="round"/>`
      + `<rect x="188" y="257" width="24" height="22" rx="8" fill="#4A47A0" stroke="${c.ink}" stroke-width="${W - 1}"/>`,
    eyes: { pos: [[154, 170], [246, 170]], r: 40, iris: 0.62, neutralLid: [-0.62, -0.3] },
    brows: { gap: 12, neutral: [[-0.12, 0.16], [-0.12, 0.16]] },
    beak: { x: 200, y: 212, w: 38, h: 34 },
    wing: {
      px: 88, py: 196,
      d: 'M88 196 C56 232 52 292 84 342 L98 326 L114 344 C130 290 120 232 88 196 Z',
    },
  };
})();

// ----------------------------------------------------------------- V2 Sage
const sage = (() => {
  const c = {
    main: '#7B3FF2', shade: '#5522C4', light: '#FFF1DC', hi: '#A57BFF', ink: '#22124A',
    beak: '#FFCF4A', beak2: '#EBA614', iris: '#C9842C', scarf: '#FF6B8B', scarf2: '#E0446A',
  };
  return {
    id: 'v2-sage', name: 'Sage', hex: c.main, colors: c,
    tagline: 'The cozy scholar',
    confetti: ['#FFCF4A', '#FF6B8B', '#38B6FF'],
    iconFrame: { scale: 2.45, cx: 200, cy: 184 },
    sweat: [334, 116],
    bodyD: 'M200 76 C176 76 156 66 132 44 C116 64 112 94 116 130 C92 170 70 222 72 284 C74 346 130 378 200 378 C270 378 326 346 328 284 C330 222 308 170 284 130 C288 94 284 64 268 44 C244 66 224 76 200 76 Z',
    tones: `<ellipse cx="136" cy="96" rx="10" ry="22" transform="rotate(28 136 96)" fill="${c.hi}"/>`
      + `<ellipse cx="200" cy="312" rx="92" ry="72" fill="${c.light}"/>`
      + mirror(`<circle cx="160" cy="156" r="52" fill="${c.light}"/>`),
    feet: [[166, 378], [234, 378]],
    front: () => mirror(`<circle cx="160" cy="156" r="40" fill="none" stroke="${c.ink}" stroke-width="12"/>`)
      + `<path d="M190 152 Q200 142 210 152" fill="none" stroke="${c.ink}" stroke-width="11" stroke-linecap="round"/>`
      + `<path d="M246 252 L282 244 L296 326 L260 334 Z" fill="${c.scarf}" stroke="${c.ink}" stroke-width="${W - 1}" stroke-linejoin="round"/>`
      + `<path d="M253 280 L288 272 M258 306 L292 298" stroke="${c.light}" stroke-width="9" stroke-linecap="round"/>`
      + `<path d="M96 216 Q200 254 304 216 L310 248 Q200 290 90 248 Z" fill="${c.scarf}" stroke="${c.ink}" stroke-width="${W - 1}" stroke-linejoin="round"/>`
      + `<path d="M132 232 L129 260 M168 241 L166 270 M232 241 L234 270 M268 232 L271 260" stroke="${c.light}" stroke-width="9" stroke-linecap="round"/>`,
    eyes: { pos: [[160, 156], [240, 156]], r: 34, iris: 0.62, neutralLid: [-0.66, -0.66], outline: false },
    brows: { gap: 14, r: 40, w: 14, neutral: [[0.02, -0.1], [0.02, -0.1]] },
    beak: { x: 200, y: 196, w: 30, h: 28 },
    wing: {
      px: 96, py: 254,
      d: 'M96 254 C62 278 58 334 94 366 C118 338 124 290 96 254 Z',
    },
  };
})();

// ---------------------------------------------------------------- V3 Axiom
const axiom = (() => {
  const c = {
    main: '#0EA0F5', shade: '#0670BC', light: '#DDF2FF', hi: '#6CCBFF', ink: '#0B1D3F',
    beak: '#FFC93C', beak2: '#E8A200', iris: '#FFB800',
  };
  return {
    id: 'v3-axiom', name: 'Axiom', hex: c.main, colors: c,
    tagline: 'The logician',
    confetti: ['#FFC93C', '#FF4F8B', '#FFFFFF'],
    iconFrame: { scale: 2.4, cx: 200, cy: 196 },
    sweat: [338, 96],
    bodyD: 'M200 100 L132 56 Q114 46 112 66 L98 148 Q92 170 92 192 L92 270 Q92 292 110 306 L182 360 Q200 374 218 360 L290 306 Q308 292 308 270 L308 192 Q308 170 302 148 L288 66 Q286 46 268 56 Z',
    tones: `<path d="M120 76 L132 72 L120 140 L112 140 Z" fill="${c.hi}" stroke="${c.hi}" stroke-width="6" stroke-linejoin="round"/>`
      + `<path d="M98 122 L200 146 L302 122 L302 204 L200 268 L98 204 Z" fill="${c.light}" stroke="${c.light}" stroke-width="16" stroke-linejoin="round"/>`
      + [290, 318].map((y) => `<path d="M162 ${y} L200 ${y + 22} L238 ${y}" fill="none" stroke="${c.light}" stroke-width="13" stroke-linejoin="round" stroke-linecap="round"/>`).join(''),
    feet: [[170, 362], [230, 362]],
    eyes: { pos: [[152, 180], [248, 180]], r: 40, iris: 0.6, neutralLid: null },
    brows: { gap: 12, w: 16, neutral: [[-0.05, 0.05], [-0.05, 0.05]] },
    beak: { x: 200, y: 214, w: 34, h: 40, diamond: true },
    wing: {
      px: 96, py: 170,
      d: 'M96 170 Q86 160 82 176 L74 296 Q74 308 86 306 L138 296 Q150 292 144 282 Z',
    },
  };
})();

// ----------------------------------------------------------------- V4 Quip
const quip = (() => {
  const c = {
    main: '#FF2D7A', shade: '#CC0F57', light: '#FFD7E6', hi: '#FF79AB', ink: '#2A0F24',
    beak: '#9B6BFF', beak2: '#7444E6', iris: '#7A3CF0',
  };
  const tuftD = 'M116 104 C110 78 98 58 80 40 C106 48 128 64 146 88 Z';
  const quote = (x, y) => `<circle cx="${x}" cy="${y}" r="10" fill="${c.main}"/><path d="M${x + 9} ${y + 2} Q${x + 8} ${y + 22} ${x - 8} ${y + 28} Q${x - 1} ${y + 18} ${x - 4} ${y + 8} Z" fill="${c.main}"/>`;
  return {
    id: 'v4-quip', name: 'Quip', hex: c.main, colors: c,
    tagline: 'The quick-witted rebutter',
    confetti: ['#FFD23F', '#38B6FF', '#FFFFFF'],
    iconFrame: { scale: 2.3, cx: 200, cy: 196 },
    sweat: [356, 92],
    bodyD: 'M200 66 C292 66 334 104 334 190 L334 236 C334 314 292 346 200 346 L160 346 L106 384 L116 334 C84 316 66 286 66 236 L66 190 C66 104 108 66 200 66 Z',
    behind: () => mirror(`<path d="${tuftD}" fill="${c.main}" stroke="${c.ink}" stroke-width="${W}" stroke-linejoin="round"/>`),
    tones: `<ellipse cx="108" cy="122" rx="11" ry="26" transform="rotate(35 108 122)" fill="${c.hi}"/>`
      + `<path d="M118 296 C134 262 266 262 282 296 C288 322 262 338 200 338 C138 338 112 322 118 296 Z" fill="${c.light}"/>`
      + quote(186, 288) + quote(216, 288)
      + mirror(`<circle cx="150" cy="172" r="60" fill="${c.light}"/>`),
    feet: [[174, 350], [234, 350]],
    eyes: { pos: [[150, 170], [250, 170]], r: 46, iris: 0.56, neutralLid: null },
    brows: { gap: 14, w: 15, neutral: [[-0.08, -0.16], [-0.08, -0.16]] },
    beak: { x: 200, y: 222, w: 36, h: 32 },
    wing: {
      px: 74, py: 220,
      d: 'M74 212 C38 226 28 282 56 310 C80 292 88 250 74 212 Z',
    },
  };
})();

// ---------------------------------------------------------------- V5 Spark
const spark = (() => {
  const c = {
    main: '#FFBB12', shade: '#E08A00', light: '#FFF4D1', hi: '#FFDB6E', ink: '#1F1A4D',
    beak: '#FF5A8A', beak2: '#D93468', iris: '#38B6FF', mask: '#2B2670',
  };
  const crestD = 'M174 96 L190 24 L212 26 L202 54 L236 46 L212 104 Z';
  const earD = 'M90 128 L34 112 Q26 112 32 120 L74 182 Z';
  const star = (cx, cy, R, r) => {
    const pts = [];
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const k = i % 2 ? r : R;
      pts.push(`${n(cx + k * Math.cos(a))} ${n(cy + k * Math.sin(a))}`);
    }
    return `M${pts.join(' L')} Z`;
  };
  return {
    id: 'v5-spark', name: 'Spark', hex: c.main, colors: c,
    tagline: 'The streak hype-owl',
    confetti: ['#FF5A8A', '#38B6FF', '#FFFFFF'],
    iconFrame: { scale: 2.3, cx: 200, cy: 200 },
    sweat: [350, 100],
    bodyD: 'M200 78 C122 78 68 112 68 188 C68 272 122 356 200 370 C278 356 332 272 332 188 C332 112 278 78 200 78 Z',
    behind: () => `<path d="${crestD}" fill="${c.main}" stroke="${c.ink}" stroke-width="${W}" stroke-linejoin="round"/>`
      + mirror(`<path d="${earD}" fill="${c.shade}" stroke="${c.ink}" stroke-width="${W}" stroke-linejoin="round"/>`),
    tones: `<ellipse cx="124" cy="116" rx="11" ry="26" transform="rotate(50 124 116)" fill="${c.hi}"/>`
      + `<path d="M200 244 C152 244 124 276 128 312 C138 350 178 366 200 366 C222 366 262 350 272 312 C276 276 248 244 200 244 Z" fill="${c.light}"/>`
      + `<path d="${star(200, 306, 30, 13)}" fill="${c.main}" stroke="${c.main}" stroke-width="6" stroke-linejoin="round"/>`,
    overBody: () => `<path d="M72 146 C118 120 282 120 328 146 L322 208 C274 230 126 230 78 208 Z" fill="${c.mask}" stroke="${c.ink}" stroke-width="${W}" stroke-linejoin="round"/>`,
    feet: [[170, 372], [230, 372]],
    eyes: { pos: [[150, 176], [250, 176]], r: 34, iris: 0.62, neutralLid: null, lidFill: c.mask, arcColor: '#FFFFFF' },
    brows: { gap: 22, w: 15, neutral: [[-0.12, -0.3], [-0.12, -0.3]] },
    beak: { x: 200, y: 222, w: 34, h: 30 },
    wing: {
      px: 76, py: 224,
      d: 'M76 216 C44 252 48 306 88 336 C104 300 102 254 76 216 Z',
    },
  };
})();

export const OWLS = [ember, sage, axiom, quip, spark];
export const EXPRESSIONS = ['happy', 'thinking', 'sad'];
