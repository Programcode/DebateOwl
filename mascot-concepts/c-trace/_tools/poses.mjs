// The four expressions from /home/codex/mascot-ref/c-blue-expressions.jpg.
// Each pose is a 512x512 quadrant in its own local coordinates. Shared hero
// parts are placed with a transform fitted to the quadrant's glasses and belly;
// wings, hands, tail, feet placement and confetti are traced in local space.
import * as P from './parts.mjs';

const { C } = P;
const g = (t, s) => `<g transform="${t}">${s}</g>`;
const T = ({ x, y, s, r = 0, ox = 256, oy = 256 }) => `${r ? `rotate(${r} ${ox} ${oy}) ` : ''}translate(${x} ${y}) scale(${s})`;

// Rounded feather: from a root point out to a tip, with a given width.
function feather(id, x1, y1, x2, y2, w, fill = `url(#${id}-wing)`) {
  const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy);
  const nx = -dy / len * w / 2, ny = dx / len * w / 2;
  const r = (v) => Math.round(v * 10) / 10;
  return `<path d="M${r(x1 + nx)} ${r(y1 + ny)} C${r(x1 + nx + dx * 0.5)} ${r(y1 + ny + dy * 0.5)} ${r(x2 + nx * 1.1)} ${r(y2 + ny * 1.1)} ${r(x2)} ${r(y2)} C${r(x2 - nx * 1.1)} ${r(y2 - ny * 1.1)} ${r(x1 - nx + dx * 0.5)} ${r(y1 - ny + dy * 0.5)} ${r(x1 - nx)} ${r(y1 - ny)} Z" fill="${fill}"/>`
    + `<path d="M${r(x1 + dx * 0.25)} ${r(y1 + dy * 0.25)} L${r(x1 + dx * 0.8)} ${r(y1 + dy * 0.8)}" stroke="${C.crease}" stroke-width="${r(w * 0.08)}" stroke-linecap="round" opacity="0.35"/>`;
}
const tail = (id, root, tips, w) => tips.map(([x, y]) => feather(id, root[0], root[1], x, y, w)).join('');

function head(id, eyes, beak, extra = '') {
  return P.tufts(id) + P.cheeks(id) + P.face(id) + P.glasses() + P.eyes(id, eyes) + extra + beak;
}
const torso = (id) => P.body(id) + P.belly(id);

// ------------------------------------------------------------- 1: idea
export function idea(id) {
  const t = T({ x: 38, y: 10, s: 0.484, r: 1.5, ox: 300, oy: 160 });
  return P.defs(id)
    + tail(id, [196, 372], [[140, 386], [150, 410], [180, 428]], 26)
    + g(T({ x: 26, y: 14, s: 0.484 }), P.footL(id)) + g(T({ x: 30, y: 14, s: 0.484 }), P.footR(id))
    + g(t, torso(id))
    // hip wing (viewer's right)
    + `<path d="M398 236 C438 254 466 292 464 330 C462 356 448 372 432 380 C438 392 446 398 452 402 C434 408 416 402 404 392 C402 398 404 404 408 408 C394 404 390 392 392 380 C396 330 402 280 398 236 Z" fill="url(#${id}-wing)"/>`
    + `<path d="M404 262 C432 282 446 314 440 350" fill="none" stroke="${C.bodyHi}" stroke-width="5" stroke-linecap="round" opacity="0.6"/>`
    + g(t, head(id, P.HERO_EYES, P.beakClosed(id, 'smile')))
    // raised wing: feathers under the fist, forearm, fist, thumb, index finger
    + tail(id, [232, 292], [[102, 280], [126, 312], [164, 334]], 30)
    + `<path d="M150 236 C176 214 214 218 236 236 C250 256 244 290 222 302 C196 312 164 304 150 286 C138 272 140 248 150 236 Z" fill="url(#${id}-wing)"/>`
    + `<path d="M96 214 C100 196 120 186 140 190 C162 194 180 206 186 226 C192 250 182 274 160 282 C136 290 108 280 96 262 C88 248 90 228 96 214 Z" fill="${C.crease}" opacity="0.7"/>`
    + `<path d="M94 210 C98 192 118 182 138 186 C160 190 178 202 184 222 C190 246 180 268 158 276 C134 284 106 274 94 256 C86 242 88 224 94 210 Z" fill="url(#${id}-hand)"/>`
    + `<path d="M96 232 C112 242 132 244 150 238 M98 254 C114 262 134 264 150 258" fill="none" stroke="${C.crease}" stroke-width="4" stroke-linecap="round" opacity="0.6"/>`
    + `<path d="M136 212 C152 200 176 204 184 222 C188 238 178 250 162 252 C146 252 134 242 132 228 C132 220 132 216 136 212 Z" fill="url(#${id}-hand)"/>`
    + `<path d="M138 214 C150 206 168 208 176 220" fill="none" stroke="${C.bodyHi}" stroke-width="4" stroke-linecap="round" opacity="0.6"/>`
    + `<path d="M94 144 C96 130 112 124 124 132 L174 200 C182 214 174 230 158 232 C148 232 140 226 136 216 Z" fill="url(#${id}-hand)"/>`
    + `<path d="M108 138 L154 208" stroke="${C.bodyHi}" stroke-width="5" stroke-linecap="round" opacity="0.6"/>`;
}

// ------------------------------------------------------------- 2: skeptical
export function skeptical(id) {
  const t = T({ x: -25.4, y: 22.2, s: 0.473 });
  return P.defs(id)
    + tail(id, [150, 380], [[88, 398], [100, 420], [128, 434]], 28)
    + g(T({ x: -24, y: 28.5, s: 0.473 }), P.footL(id)) + g(T({ x: -21, y: 26, s: 0.473 }), P.footR(id))
    + g('translate(228 0) scale(0.95 1) translate(-228 0)', g(t, torso(id)))
    + g(t, head(id, P.SKEPTIC_EYES, P.beakClosed(id, 'frown'), P.skepticLids(id) + P.skepticBrows()))
    // crossed arms: puffy lower arm (viewer's left), upper arm crossing over with fingers on the left
    + '<g transform="translate(0 12)">'
    + `<path d="M104 300 C98 268 116 244 146 242 C200 240 270 250 320 262 C350 272 352 300 334 318 C296 336 220 344 160 346 C126 346 108 330 104 300 Z" fill="url(#${id}-wing)"/>`
    + `<path d="M116 262 C134 248 160 246 184 250" fill="none" stroke="${C.bodyHi}" stroke-width="6" stroke-linecap="round" opacity="0.6"/>`
    + `<path d="M150 342 C210 342 280 332 330 318" fill="none" stroke="${C.crease}" stroke-width="5" stroke-linecap="round" opacity="0.5"/>`
    + `<path d="M358 296 C364 264 352 244 330 244 C290 246 230 260 188 270 C166 276 160 300 174 314 C188 326 214 326 244 322 C282 318 304 326 318 346 C328 360 342 364 352 352 C362 336 356 316 358 296 Z" fill="${C.crease}" opacity="0.6" transform="translate(2 6)"/>`
    + `<path d="M358 296 C364 264 352 244 330 244 C290 246 230 260 188 270 C166 276 160 300 174 314 C188 326 214 326 244 322 C282 318 304 326 318 346 C328 360 342 364 352 352 C362 336 356 316 358 296 Z" fill="url(#${id}-hand)"/>`
    + `<path d="M190 274 C236 264 296 250 340 250" fill="none" stroke="${C.bodyHi}" stroke-width="6" stroke-linecap="round" opacity="0.6"/>`
    + [[166, 262, 26, 12, -8], [158, 282, 26, 12, -4], [166, 302, 24, 11, 4]].map(([x, y, rx, ry, a]) =>
      `<ellipse cx="${x + 1}" cy="${y + 4}" rx="${rx}" ry="${ry}" transform="rotate(${a} ${x} ${y})" fill="${C.crease}" opacity="0.7"/>`
      + `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" transform="rotate(${a} ${x} ${y})" fill="url(#${id}-hand)"/>`).join('')
    + `<path d="M324 340 C336 352 346 360 358 364 C348 370 334 366 326 358 Z" fill="url(#${id}-wing)"/>`
    + '</g>';
}

// ------------------------------------------------------------- 3: surprised
export function surprised(id) {
  const t = T({ x: 24.6, y: -20.8, s: 0.473, r: 1.2, ox: 290, oy: 120 });
  return P.defs(id)
    + tail(id, [176, 364], [[112, 366], [124, 388], [154, 404]], 26)
    + g(T({ x: -2.9, y: 0.5, s: 0.473 }), P.footL(id)) + g(T({ x: 11.3, y: -2, s: 0.473 }), P.footR(id))
    + g('translate(0 120) scale(1 1.07) translate(0 -120)', g(t, torso(id)))
    + `<path d="M380 208 C416 226 442 262 442 300 C442 326 430 346 414 358 C420 366 428 370 434 372 C414 378 396 372 386 362 C384 368 386 374 390 378 C374 374 368 362 370 350 C376 300 382 250 380 208 Z" fill="url(#${id}-wing)"/>`
    + `<path d="M386 232 C412 252 424 282 420 316" fill="none" stroke="${C.bodyHi}" stroke-width="5" stroke-linecap="round" opacity="0.6"/>`
    + g(t, head(id, P.HERO_EYES, `<g transform="translate(0 -60) scale(1 1.14)">${P.beakOpen(id)}</g>`))
    // fist seen from the front, index finger pointing at the viewer
    + `<g transform="translate(160 250) scale(1.14) translate(-160 -250)">`
    + tail(id, [190, 300], [[102, 298], [124, 312]], 22)
    + `<path d="M214 214 C232 236 236 280 222 300 C204 316 160 316 128 304 C102 292 94 262 98 238 C102 214 122 196 146 190 C176 186 200 196 214 214 Z" fill="url(#${id}-wing)"/>`
    + [[122, 226, 24, 17, 20], [116, 254, 22, 17, 10], [124, 282, 26, 16, 0]].map(([x, y, rx, ry, a]) =>
      `<ellipse cx="${x + 2}" cy="${y + 4}" rx="${rx}" ry="${ry}" transform="rotate(${a} ${x} ${y})" fill="${C.crease}" opacity="0.7"/>`
      + `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" transform="rotate(${a} ${x} ${y})" fill="url(#${id}-hand)"/>`).join('')
    + `<path d="M172 244 C190 232 216 236 226 254 C232 270 222 284 204 288 C186 290 172 282 168 268 C166 258 166 250 172 244 Z" fill="${C.crease}" opacity="0.6"/>`
    + `<path d="M172 240 C190 228 216 232 226 250 C232 266 222 280 204 284 C186 286 172 278 168 264 C166 254 166 246 172 240 Z" fill="url(#${id}-hand)"/>`
    + `<ellipse cx="183" cy="214" rx="28" ry="26" fill="${C.crease}" opacity="0.65"/>`
    + `<circle cx="180" cy="206" r="26" fill="url(#${id}-hand)"/>`
    + `<ellipse cx="174" cy="196" rx="14" ry="9" fill="${C.bodyHi}" opacity="0.6"/>`
    + '</g>';
}

// ------------------------------------------------------------- 4: celebrating
const CONFETTI = [
  [70, 8, 30], [174, 11, -20], [244, 5, 40], [327, 8, -30], [382, 15, 50], [15, 42, 20], [75, 59, -15], [355, 59, 25], [450, 40, 15],
  [10, 217, -30], [37, 260, 10], [85, 287, -25], [20, 315, 35], [50, 355, -10], [82, 405, 30], [127, 440, -20], [272, 415, 20],
  [302, 445, -15], [372, 425, 40], [415, 382, -30], [450, 310, 25], [387, 297, -40], [420, 255, 15], [460, 210, -20],
];

export function celebrating(id) {
  const t = T({ x: 9.3, y: 4.8, s: 0.418, r: -2, ox: 240, oy: 130 });
  const bodyT = T({ x: 9.3, y: 4.8, s: 0.418, r: -5, ox: 250, oy: 300 });
  const wingL = [[30, 68], [12, 104], [16, 146], [34, 184], [62, 220], [92, 244], [120, 260]];
  const wingR = [[420, 56], [444, 88], [444, 130], [430, 174], [410, 210], [380, 238], [352, 254]];
  return P.defs(id)
    + CONFETTI.map(([x, y, a]) => `<g transform="rotate(${a} ${x} ${y}) translate(${x} ${y}) scale(1.4)"><path d="M-10 -5 C-3 -9 4 -6 10 -4 L8 6 C2 3 -4 2 -10 5 Z" fill="#F4B10F"/>`
      + `<path d="M-10 -5 C-3 -9 4 -6 10 -4 L9 0 C3 -2 -3 -3 -10 0 Z" fill="#FFD24A"/></g>`).join('')
    + wingL.map(([x, y]) => feather(id, 162, 232, x, y, 46)).join('')
    + wingR.map(([x, y]) => feather(id, 328, 230, x, y, 44)).join('')
    + wingL.slice(1, 6).map(([x, y]) => feather(id, 166, 236, 166 + (x - 166) * 0.62, 236 + (y - 236) * 0.62, 40, '#1E8CFC')).join('')
    + wingR.slice(1, 6).map(([x, y]) => feather(id, 326, 234, 326 + (x - 326) * 0.62, 234 + (y - 234) * 0.62, 38, '#1E8CFC')).join('')
    + tail(id, [160, 356], [[94, 340], [106, 362], [134, 380]], 26)
    // standing foot, toes toward the viewer
    + `<path d="M176 386 C190 380 208 382 214 392 C218 404 216 418 214 426 C222 432 222 444 214 448 C208 452 200 450 196 446 C192 452 182 452 178 446 C172 450 164 448 162 440 C158 432 162 424 168 420 C166 408 168 394 176 386 Z" fill="url(#${id}-foot)"/>`
    + `<path d="M187 448 C186 436 188 426 190 418 M174 444 C174 434 176 426 178 420 M204 446 C206 436 206 428 204 420" fill="none" stroke="${C.footLine}" stroke-width="3" stroke-linecap="round" opacity="0.8"/>`
    + `<ellipse cx="200" cy="364" rx="66" ry="34" transform="rotate(-8 200 364)" fill="#0558D8"/>`
    + g(bodyT, torso(id))
    // kicking leg and foot, sole toward the viewer
    + `<ellipse cx="322" cy="336" rx="34" ry="36" fill="url(#${id}-wing)"/>`
    + `<path d="M318 362 C312 344 322 328 338 326 C344 316 356 314 364 322 C372 316 384 320 384 332 C392 340 388 356 376 366 C364 382 344 396 326 392 C314 388 314 374 318 362 Z" fill="url(#${id}-foot)"/>`
    + `<path d="M338 328 C340 340 344 348 350 354 M364 324 C364 338 366 346 370 352" fill="none" stroke="${C.footLine}" stroke-width="3" stroke-linecap="round" opacity="0.8"/>`
    + g(t, head(id, P.HERO_EYES, P.beakOpen(id)));
}

export const POSES = { 'c-idea': idea, 'c-skeptical': skeptical, 'c-surprised': surprised, 'c-celebrating': celebrating };
