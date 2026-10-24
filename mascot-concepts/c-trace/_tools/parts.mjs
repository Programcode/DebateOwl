// Owl "C" traced from /home/codex/mascot-ref/c-blue-hero.jpg.
// All coordinates are the hero reference's own pixels (1024x1024), so a part
// can be checked against the reference 1:1. Expression poses reuse these parts
// through transforms. Colours were sampled from the reference.

export const C = {
  body: '#0A6FF0', bodyHi: '#2B9BFF', bodyLo: '#0052CC', crease: '#013FAE',
  face: '#1E8DFB', rim: '#4CB0FD', rimEdge: '#0A63DD', lensShadow: '#0F4FA8',
  belly1: '#C9E5FE', belly2: '#B3D8FC', belly3: '#82BBF6', spot: '#EEF7FF',
  white: '#FEFEFD', lid: '#0B2A6E', iris1: '#6CC4FF', iris2: '#1A7BE6', iris3: '#0B4FB8', pupil: '#031B47',
  beak1: '#F8D132', beak2: '#EE9F0C', beak3: '#DD8E18', mouth: '#061442', tongue: '#DE3A40', tongue2: '#B3212B',
  foot1: '#FFC414', foot2: '#F39A00', footLine: '#E38E06',
};

// Gradients. `id` prefix keeps several owls in one file apart.
export function defs(id) {
  return `<defs>
  <radialGradient id="${id}-body" cx="0.46" cy="0.26" r="0.8">
    <stop offset="0" stop-color="${C.bodyHi}"/><stop offset="0.38" stop-color="${C.body}"/><stop offset="0.7" stop-color="#0661E2"/><stop offset="0.9" stop-color="#044FC6"/><stop offset="1" stop-color="#0344B6"/>
  </radialGradient>
  <radialGradient id="${id}-face" cx="0.5" cy="0.45" r="0.55">
    <stop offset="0" stop-color="${C.face}" stop-opacity="0.9"/><stop offset="0.75" stop-color="${C.face}" stop-opacity="0.55"/><stop offset="1" stop-color="${C.face}" stop-opacity="0"/>
  </radialGradient>
  <linearGradient id="${id}-belly" x1="0" y1="0" x2="0.15" y2="1">
    <stop offset="0" stop-color="${C.belly1}"/><stop offset="0.5" stop-color="${C.belly2}"/><stop offset="1" stop-color="${C.belly3}"/>
  </linearGradient>
  <linearGradient id="${id}-wing" x1="0" y1="0" x2="0.6" y2="1">
    <stop offset="0" stop-color="#1A86FB"/><stop offset="0.6" stop-color="#0664E6"/><stop offset="1" stop-color="#034CC4"/>
  </linearGradient>
  <linearGradient id="${id}-hand" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#2190FC"/><stop offset="1" stop-color="#0663E4"/>
  </linearGradient>
  <radialGradient id="${id}-iris" cx="0.5" cy="0.75" r="0.75">
    <stop offset="0" stop-color="${C.iris1}"/><stop offset="0.55" stop-color="${C.iris2}"/><stop offset="1" stop-color="${C.iris3}"/>
  </radialGradient>
  <linearGradient id="${id}-beak" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="${C.beak1}"/><stop offset="1" stop-color="${C.beak2}"/>
  </linearGradient>
  <linearGradient id="${id}-foot" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="${C.foot1}"/><stop offset="1" stop-color="${C.foot2}"/>
  </linearGradient>
</defs>`;
}

export const BODY_D = 'M520 96 C600 94 680 110 735 150 C775 185 790 240 792 300 C795 380 785 440 785 500 C790 600 795 700 760 760 C730 820 660 868 540 872 C430 872 360 840 320 790 C290 750 285 690 280 620 C274 520 268 420 272 330 C274 240 290 180 330 145 C380 108 450 98 520 96 Z';

export function body(id) {
  return `<clipPath id="${id}-bodyclip"><path d="${BODY_D}"/></clipPath>`
    + `<path d="${BODY_D}" fill="url(#${id}-body)"/>`
    + `<g clip-path="url(#${id}-bodyclip)" fill="none" stroke-linejoin="round">`
    + `<path d="${BODY_D}" stroke="#0242B0" stroke-width="90" opacity="0.22"/>`
    + `<path d="${BODY_D}" stroke="#023C9E" stroke-width="40" opacity="0.3"/></g>`;
}

export function tufts(id) {
  const shadow = `<g transform="translate(6 10)" opacity="0.55" fill="${C.crease}"><path d="M474 142 C440 120 402 108 374 96 L362 92 C340 84 318 70 303 57 C288 62 279 84 279 108 C279 136 294 156 320 166 C350 174 404 162 474 142 Z"/><path d="M612 132 C640 110 664 94 677 84 C690 86 708 66 718 48 C736 54 749 84 752 118 C755 150 748 172 738 184 C700 162 660 142 612 132 Z"/></g>`;
  return shadow + `<path d="M300 224 C278 206 262 180 260 152 C259 140 262 132 266 128 C280 134 296 144 316 156 C334 170 330 198 300 224 Z" fill="url(#${id}-wing)"/>`
    + `<path d="M268 136 C284 146 300 156 314 168" fill="none" stroke="${C.rim}" stroke-width="7" stroke-linecap="round" opacity="0.6"/>`
    + `<path d="M474 142 C440 120 402 108 374 96 L371 80 L362 92 C340 84 318 70 303 57 C288 62 279 84 279 108 C279 136 294 156 320 166 C350 174 404 162 474 142 Z" fill="url(#${id}-wing)"/>`
    + `<path d="M306 64 C326 84 380 104 456 126 C412 132 362 128 332 116 C312 104 302 84 306 64 Z" fill="${C.rim}" opacity="0.85"/>`
    + `<path d="M612 132 C640 110 664 94 677 84 L673 98 C690 86 708 66 718 48 C736 54 749 84 752 118 C755 150 748 172 738 184 C700 162 660 142 612 132 Z" fill="url(#${id}-wing)"/>`
    + `<path d="M638 122 C668 106 698 84 714 58 C726 78 720 110 702 130 C682 136 660 132 638 122 Z" fill="${C.rim}" opacity="0.85"/>`
    + `<path d="M742 206 C764 188 774 162 772 138 C770 126 766 117 762 113 C750 122 746 142 746 162 Z" fill="url(#${id}-wing)"/>`;
}

export function cheeks(id) {
  return `<path d="M290 312 C270 316 250 324 236 336 C250 354 268 364 288 370 Z" fill="url(#${id}-wing)"/>`
    + `<path d="M292 362 C272 368 256 378 246 392 C262 404 280 410 296 410 Z" fill="${C.body}"/>`
    + `<path d="M784 306 C808 312 826 324 832 342 C826 358 806 366 784 368 Z" fill="url(#${id}-wing)"/>`
    + `<path d="M782 368 C804 374 820 388 824 404 C816 420 798 426 780 426 Z" fill="url(#${id}-wing)"/>`
    + `<path d="M778 426 C794 432 806 442 808 456 C800 466 786 468 774 466 Z" fill="${C.body}"/>`;
}

export function face(id) {
  return `<clipPath id="${id}-head"><path d="${BODY_D}"/></clipPath>`
    + `<g clip-path="url(#${id}-head)"><ellipse cx="545" cy="300" rx="270" ry="170" fill="url(#${id}-face)"/>`
    + `<path d="M330 196 C380 160 470 150 540 170 C480 168 400 176 342 206 Z" fill="${C.rim}" opacity="0.55"/>`
    + `<path d="M612 168 C670 146 744 156 780 200 C740 178 680 170 620 182 Z" fill="${C.rim}" opacity="0.55"/>`
    + `<path d="M300 760 C320 820 400 868 520 874 C430 880 330 850 296 780 Z" fill="${C.bodyLo}" opacity="0.6"/></g>`;
}

export function belly(id) {
  return `<path d="M590 505 C650 505 700 515 727 555 C750 590 757 640 755 690 C752 750 720 800 680 825 C640 848 590 852 560 850 C510 845 465 820 440 790 C410 755 400 715 403 680 C406 640 425 610 445 580 C455 550 470 520 500 510 C530 505 560 505 590 505 Z" fill="url(#${id}-belly)"/>`
    + [[521, 592, -30], [614, 608, -25], [691, 601, 25], [552, 665, -30], [663, 675, 30], [475, 706, -30], [604, 737, 30], [675, 758, 35]]
      .map(([x, y, a]) => `<ellipse cx="${x}" cy="${y}" rx="13" ry="21" transform="rotate(${a} ${x} ${y})" fill="${C.spot}" opacity="0.85"/>`).join('');
}

// One lens: outer light rim, darker inner band, inner shadow crescent, lens.
function lens(cx, cy, rx, ry) {
  return `<ellipse cx="${cx}" cy="${cy}" rx="${rx + 3}" ry="${ry + 3}" fill="${C.rimEdge}"/>`
    + `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${C.rim}"/>`
    + `<ellipse cx="${cx}" cy="${cy}" rx="${rx - 15}" ry="${ry - 15}" fill="#2392FC"/>`
    + `<ellipse cx="${cx + 1}" cy="${cy + 1}" rx="${rx - 21}" ry="${ry - 21}" fill="${C.rimEdge}"/>`
    + `<ellipse cx="${cx + 3}" cy="${cy + 4}" rx="${rx - 26}" ry="${ry - 26}" fill="${C.face}"/>`;
}

export function glasses() {
  return lens(430, 302, 112, 118) + lens(686, 293, 106, 114)
    + `<path d="M536 306 C548 286 572 284 584 300" fill="none" stroke="${C.rim}" stroke-width="15" stroke-linecap="round"/>`;
}

// eye: navy lid crescent behind a white, iris, pupil, two highlights.
function eye(id, e) {
  const { lid, w, i, p, h1, h2 } = e;
  return `<ellipse cx="${lid[0]}" cy="${lid[1]}" rx="${lid[2]}" ry="${lid[3]}" fill="${C.lid}"/>`
    + `<ellipse cx="${w[0]}" cy="${w[1]}" rx="${w[2]}" ry="${w[3]}" fill="${C.white}"/>`
    + `<ellipse cx="${w[0]}" cy="${w[1] - w[3] * 0.62}" rx="${w[2] * 0.6}" ry="${w[3] * 0.22}" fill="#DCEBFA" opacity="0.5"/>`
    + `<ellipse cx="${i[0]}" cy="${i[1]}" rx="${i[2]}" ry="${i[3]}" fill="url(#${id}-iris)"/>`
    + `<ellipse cx="${p[0]}" cy="${p[1]}" rx="${p[2]}" ry="${p[3]}" fill="${C.pupil}"/>`
    + `<circle cx="${h1[0]}" cy="${h1[1]}" r="${h1[2]}" fill="#FFFFFF"/>`
    + `<circle cx="${h2[0]}" cy="${h2[1]}" r="${h2[2]}" fill="#FFFFFF"/>`;
}

export const HERO_EYES = [
  { lid: [433, 308, 69, 76], w: [441, 316, 65, 69], i: [453, 318, 43, 56], p: [458, 315, 30, 36], h1: [437, 293, 16], h2: [473, 344, 8] },
  { lid: [668, 308, 64, 76], w: [665, 316, 59, 69], i: [647, 317, 41, 55], p: [646, 314, 29, 34], h1: [630, 289, 15], h2: [663, 340, 8] },
];

export function eyes(id, list = HERO_EYES) {
  return list.map((e) => eye(id, e)).join('');
}

export function beakOpen(id) {
  return `<path d="M567 322 C590 324 606 340 607 362 C607 372 600 380 594 388 L588 440 C584 462 570 478 555 478 C535 478 522 462 518 440 C515 410 516 385 524 366 C532 345 548 324 567 322 Z" fill="${C.beak3}"/>`
    + `<path d="M524 372 C545 368 575 372 591 382 L584 440 C580 455 565 460 550 458 C535 455 525 445 523 425 Z" fill="${C.mouth}"/>`
    + `<path d="M526 432 C530 414 562 410 580 424 C582 444 566 456 548 456 C536 455 528 446 526 432 Z" fill="${C.tongue}"/>`
    + `<path d="M570 321 C588 324 604 338 608 358 C609 372 602 384 594 390 C580 378 552 370 523 372 C528 352 540 330 552 325 C558 322 564 321 570 321 Z" fill="url(#${id}-beak)"/>`
    + `<path d="M526 370 C552 366 578 372 592 386 C600 380 606 372 607 362" fill="none" stroke="${C.beak3}" stroke-width="5" stroke-linecap="round" opacity="0.8"/>`
    + `<ellipse cx="582" cy="338" rx="12" ry="6" transform="rotate(30 582 338)" fill="#FCEB93"/>`;
}

function foot(id, d, creases, hi, shade) {
  return `<path d="${d}" fill="url(#${id}-foot)"/>`
    + `<path d="${creases}" fill="none" stroke="${C.footLine}" stroke-width="5" stroke-linecap="round" opacity="0.8"/>`
    + `<path d="${hi}" fill="none" stroke="#FFE070" stroke-width="7" stroke-linecap="round" opacity="0.5"/>`
    + `<path d="${shade}" fill="#C9740A" opacity="0.25"/>`;
}

export function footL(id) {
  return foot(id, 'M352 896 C356 840 460 836 470 888 C476 904 476 926 470 942 C464 958 440 962 432 942 C428 958 404 964 396 944 C390 960 364 962 352 948 C340 934 340 912 352 896 Z',
    'M432 942 C432 926 434 914 436 904 M396 944 C396 928 398 916 402 906', 'M356 912 C362 900 374 894 388 894',
    'M352 892 C380 878 444 876 468 890 L466 902 C440 892 384 892 348 906 Z');
}

export function footR(id) {
  return foot(id, 'M606 888 C610 832 722 832 730 880 C738 896 738 920 732 934 C726 950 702 954 694 934 C690 950 666 956 658 936 C652 952 626 954 614 940 C602 926 600 906 606 888 Z',
    'M694 934 C694 918 696 906 698 896 M658 936 C658 920 660 908 664 898', 'M620 902 C626 890 638 884 652 884',
    'M608 884 C636 870 702 872 730 888 L732 900 C704 888 640 886 606 900 Z');
}

export function feet(id) {
  return footL(id) + footR(id);
}

// Closed beak with a smile (idea pose) or a frown (skeptical pose).
export function beakClosed(id, mood) {
  const line = mood === 'frown'
    ? 'M522 410 Q562 386 606 404'
    : 'M520 386 Q560 424 612 408';
  const bottom = mood === 'frown' ? 432 : 452;
  return `<path d="M548 326 C576 320 608 334 620 358 C630 380 618 402 602 420 C590 ${bottom - 14} 578 ${bottom} 566 ${bottom} C552 ${bottom - 2} 538 ${bottom - 22} 528 410 C514 388 512 360 520 342 C528 332 538 328 548 326 Z" fill="url(#${id}-beak)"/>`
    + `<path d="M520 400 C540 ${bottom - 10} 560 ${bottom} 572 ${bottom} C590 ${bottom - 6} 604 432 612 410" fill="none" stroke="${C.beak3}" stroke-width="6" stroke-linecap="round" opacity="0.6"/>`
    + `<path d="${line}" fill="none" stroke="#B5660C" stroke-width="7" stroke-linecap="round"/>`
    + `<ellipse cx="584" cy="342" rx="14" ry="7" transform="rotate(25 584 342)" fill="#FCEB93"/>`;
}

// Skeptical face: lids drawn down at an angle over both eyes, plus brows.
export const SKEPTIC_EYES = [
  { lid: [437, 318, 66, 64], w: [445, 330, 62, 56], i: [449, 326, 40, 46], p: [452, 324, 28, 32], h1: [425, 303, 15], h2: [467, 336, 8] },
  { lid: [664, 314, 62, 64], w: [664, 326, 58, 56], i: [640, 322, 38, 45], p: [642, 318, 27, 31], h1: [624, 297, 14], h2: [659, 330, 8] },
];

export function skepticLids(id) {
  const lids = [
    { clip: [441, 326, 70, 68], poly: 'M350 200 L540 200 L534 312 L350 286 Z', line: 'M354 290 L528 312', lash: 'M360 290 C350 282 344 276 340 266' },
    { clip: [664, 322, 66, 68], poly: 'M590 200 L760 200 L760 254 L596 300 Z', line: 'M602 298 L748 258', lash: 'M742 260 C754 254 760 246 764 236' },
  ];
  return lids.map((l, k) => `<clipPath id="${id}-lid${k}"><ellipse cx="${l.clip[0]}" cy="${l.clip[1]}" rx="${l.clip[2]}" ry="${l.clip[3]}"/></clipPath>`
    + `<path d="${l.poly}" fill="${C.face}" clip-path="url(#${id}-lid${k})"/>`
    + `<path d="${l.line}" fill="none" stroke="${C.lid}" stroke-width="12" stroke-linecap="round"/>`
    + `<path d="${l.lash}" fill="none" stroke="${C.lid}" stroke-width="9" stroke-linecap="round"/>`).join('');
}

export function skepticBrows() {
  return `<path d="M346 168 C410 160 486 188 534 222 C540 232 532 240 522 236 C474 214 410 196 352 196 C334 192 332 172 346 168 Z" fill="#3DA5FD"/>`
    + `<path d="M356 196 C412 196 474 212 524 236" fill="none" stroke="${C.lid}" stroke-width="10" stroke-linecap="round" opacity="0.85"/>`
    + `<path d="M760 146 C700 140 630 176 590 214 C584 224 592 232 602 228 C640 204 700 178 754 174 C772 170 774 150 760 146 Z" fill="#3DA5FD"/>`
    + `<path d="M752 174 C700 178 646 200 602 228" fill="none" stroke="${C.lid}" stroke-width="10" stroke-linecap="round" opacity="0.85"/>`;
}

// Hero pose: right wing hanging behind, left wing pointing at the viewer.
export function rightWingHanging(id) {
  return `<path d="M784 478 C820 504 862 550 890 610 C915 662 925 720 922 770 C920 800 906 815 890 812 C880 810 872 805 866 800 C860 806 848 808 840 802 C820 790 796 772 776 760 Z" fill="url(#${id}-wing)"/>`
    + `<path d="M808 560 C840 620 862 690 872 770 M790 640 C812 690 830 740 846 790" fill="none" stroke="${C.crease}" stroke-width="7" stroke-linecap="round" opacity="0.45"/>`
    + `<path d="M800 500 C840 530 872 580 892 640" fill="none" stroke="${C.bodyHi}" stroke-width="9" stroke-linecap="round" opacity="0.6"/>`
    + `<path d="M866 800 C872 770 870 740 862 714 M840 802 C836 776 826 752 812 734 M892 812 C902 790 904 760 900 730" fill="none" stroke="${C.crease}" stroke-width="6" stroke-linecap="round" opacity="0.55"/>`;
}

export function pointingHand(id) {
  // Fingers: light bulge with a soft crease shadow only along the lower edge.
  const fin = (d, crease, hi) => `<path d="${crease}" fill="${C.crease}" opacity="0.7"/><path d="${d}" fill="url(#${id}-hand)"/>`
    + (hi ? `<path d="${hi}" fill="none" stroke="${C.bodyHi}" stroke-width="9" stroke-linecap="round" opacity="0.5"/>` : '');
  return `<path d="M262 418 C220 414 170 418 150 426 C136 446 126 470 122 500 C116 520 114 546 124 562 C136 584 146 610 158 630 C176 650 200 664 222 684 C250 700 300 704 340 692 C392 672 428 630 440 560 C446 500 436 462 404 434 C366 412 312 410 262 418 Z" fill="url(#${id}-wing)"/>`
    + fin('M224 650 C250 640 296 638 330 646 C340 660 330 680 300 688 C268 694 232 688 216 674 C212 662 216 654 224 650 Z',
      'M220 662 C250 654 300 652 336 662 C340 682 320 694 292 698 C262 700 230 694 214 682 Z')
    + fin('M150 572 C190 556 270 560 326 584 C344 600 340 626 318 638 C280 650 220 646 174 628 C150 616 140 590 150 572 Z',
      'M150 590 C200 600 280 610 336 612 C340 636 320 652 290 656 C240 660 190 650 160 632 Z', 'M168 576 C210 566 260 570 300 584')
    + fin('M126 510 C150 494 200 494 234 508 C248 524 246 548 230 560 C200 572 158 568 132 556 C114 544 114 522 126 510 Z',
      'M124 532 C160 548 210 556 240 548 C240 566 220 580 190 582 C160 582 134 572 120 556 Z', 'M138 510 C164 500 196 500 222 508')
    + fin('M158 470 C178 456 214 458 236 474 C246 490 240 512 224 520 C204 528 176 524 160 512 C148 500 148 480 158 470 Z',
      'M152 490 C172 512 210 524 240 504 C244 524 228 538 206 540 C182 540 162 530 152 516 Z', 'M168 470 C186 462 208 464 224 472')
    + fin('M250 446 C278 430 326 434 352 462 C366 484 358 512 334 524 C308 534 274 528 256 510 C240 494 238 460 250 446 Z',
      'M246 470 C262 500 300 520 344 510 C350 530 330 548 300 548 C270 546 248 532 240 512 Z', 'M262 446 C290 438 322 444 342 462')
    + fin('M126 338 C150 334 202 356 264 388 C284 400 290 424 278 440 C264 454 240 452 216 440 C172 418 136 398 120 380 C108 364 110 342 126 338 Z',
      'M124 388 C150 410 186 428 222 446 C246 456 270 458 282 444 C284 462 264 472 238 468 C198 458 152 434 126 406 C118 398 118 392 124 388 Z',
      'M134 348 C164 354 214 376 258 400');
}

// App icon: a simplified bust on a pale sky square. Same glasses, eyes,
// tufts and beak, with fewer tones so it reads at 24px.
export function icon(id) {
  const lensL = [364, 470], lensR = [660, 470];
  const lens = ([x, y]) => `<circle cx="${x}" cy="${y}" r="142" fill="${C.rim}"/><circle cx="${x}" cy="${y}" r="118" fill="${C.rimEdge}"/><circle cx="${x + 4}" cy="${y + 6}" r="110" fill="${C.face}"/>`;
  const eyeL = (x, y, ix) => `<ellipse cx="${x}" cy="${y - 6}" rx="92" ry="100" fill="${C.lid}"/><ellipse cx="${x}" cy="${y + 4}" rx="88" ry="92" fill="${C.white}"/>`
    + `<circle cx="${ix}" cy="${y + 12}" r="60" fill="url(#${id}-iris)"/><circle cx="${ix + 4}" cy="${y + 8}" r="40" fill="${C.pupil}"/>`
    + `<circle cx="${ix - 18}" cy="${y - 16}" r="20" fill="#FFFFFF"/><circle cx="${ix + 22}" cy="${y + 40}" r="9" fill="#FFFFFF"/>`;
  return `<rect width="1024" height="1024" fill="#DDF0FF"/>`
    + `<path d="M512 170 C700 170 828 262 848 440 C866 600 884 820 900 1024 L124 1024 C140 820 158 600 176 440 C196 262 324 170 512 170 Z" fill="url(#${id}-body)"/>`
    + `<path d="M470 196 C400 170 330 136 270 72 C238 120 232 196 262 262 C300 250 390 224 470 196 Z" fill="url(#${id}-wing)"/>`
    + `<path d="M284 104 C316 150 380 180 440 196" fill="none" stroke="${C.rim}" stroke-width="22" stroke-linecap="round" opacity="0.8"/>`
    + `<path d="M554 196 C624 170 694 136 754 72 C786 120 792 196 762 262 C724 250 634 224 554 196 Z" fill="url(#${id}-wing)"/>`
    + `<path d="M740 104 C708 150 644 180 584 196" fill="none" stroke="${C.rim}" stroke-width="22" stroke-linecap="round" opacity="0.8"/>`
    + `<ellipse cx="512" cy="1020" rx="260" ry="200" fill="url(#${id}-belly)"/>`
    + lens(lensL) + lens(lensR)
    + `<path d="M494 470 C502 444 522 444 530 470" fill="none" stroke="${C.rim}" stroke-width="26" stroke-linecap="round"/>`
    + eyeL(372, 478, 396) + eyeL(652, 478, 630)
    + `<path d="M462 596 C488 576 540 576 566 596 C580 628 548 676 514 700 C478 676 448 628 462 596 Z" fill="url(#${id}-beak)"/>`
    + `<path d="M470 628 Q514 664 560 628" fill="none" stroke="#B5660C" stroke-width="12" stroke-linecap="round"/>`
    + `<ellipse cx="530" cy="598" rx="20" ry="10" fill="#FCEB93"/>`;
}
