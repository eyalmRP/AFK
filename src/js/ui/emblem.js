// Faction emblem with the in-game upgrade ornaments, read the way the card
// guide describes: the ring around the emblem shows the signature item tier
// (plain ring 0, four studs +10, eight points +20, wings +30), the pendant
// under it shows furniture (one diamond 3F, two 9F, a banner and crown 36F).
// Past +30 the game adds a crown: golden wings and a crown from +40, white
// wings and a crown at +50 (confirmed on the player's heroes; the guide stops
// at +30).

import { esc } from '../util.js';
import { upgradeUnlocked } from '../data.js';
import { factionIcon } from './icons.js';

export function siTier(e) {
  if (!e?.owned || !upgradeUnlocked(e, 'si') || e.si === null || e.si === undefined) return null;
  return [50, 40, 30, 20, 10].find((t) => e.si >= t) ?? 0;
}

export function furnitureTier(e) {
  if (!e?.owned || !upgradeUnlocked(e, 'furniture') || !e.furniture) return 0;
  return e.furniture >= 36 ? 36 : e.furniture >= 9 ? 9 : e.furniture >= 3 ? 3 : 0;
}

// Drawn in user units where the faction icon is a circle of radius 26 at
// 50,50; the proportions follow the card guide's ornaments. Outlines are 1px
// at any size (non-scaling strokes).
const VB = { x: -8, y: 0, w: 116, h: 128 };
const LINE = '#2a2118';
const ln = (w = 1) => `stroke="${LINE}" stroke-width="${w}" vector-effect="non-scaling-stroke" stroke-linejoin="round"`;
const poly = (pts) => pts.map((p) => p.join(',')).join(' ');

// A gold diamond cut into four facets lit from the top left.
function gem([cx, cy], hw, ht, hb = ht) {
  const T = [cx, cy - ht];
  const R = [cx + hw, cy];
  const B = [cx, cy + hb];
  const L = [cx - hw, cy];
  const C = [cx, cy];
  return `<polygon points="${poly([T, R, B, L])}" fill="#e9b843" ${ln()}/>
    <polygon points="${poly([L, T, C])}" fill="#fff4d6"/><polygon points="${poly([T, R, C])}" fill="#f7d77e"/><polygon points="${poly([L, C, B])}" fill="#f3c65a"/>
    <polygon points="${poly([T, R, B, L])}" fill="none" ${ln()}/>`;
}

// Three feathers per wing, drawn to the guide's proportions (left wing, top to
// bottom): pointed tips up and out, rounded where they tuck under the ring.
// The right wing is the mirror image.
const FEATHERS = [
  'M5.5 2C1.5 9 0 17 1.5 24C3 30.5 9 35.5 15.5 35.5L21 31V20C14.5 16 9 10 5.5 2Z',
  'M-3.5 19C-6.5 25.5 -6.5 34.5 -3.5 40.5C-1 45.5 4 48.5 9.5 47L21 41.5V33C10.5 31.5 2 27 -3.5 19Z',
  'M-1.5 45.5C-4.5 50.5 -3.5 57 0.5 60.5C3.5 63.5 8.5 64.5 13 63L21 58.5V52.5C12 52.5 4.5 50 -1.5 45.5Z',
];

function wings(gold) {
  const fill = gold ? 'url(#orn-wing-gold)' : 'url(#orn-wing)';
  const one = [...FEATHERS].reverse().map((d) => `<path d="${d}" fill="${fill}" ${ln()}/>`).join('');
  return `<g>${one}</g><g transform="translate(100 0) scale(-1 1)">${one}</g>`;
}

const RING = `<circle cx="50" cy="50" r="29" fill="none" stroke="url(#orn-gold)" stroke-width="7"/><circle cx="50" cy="50" r="32.5" fill="none" ${ln()}/><circle cx="50" cy="50" r="25.6" fill="none" ${ln()}/>`;

function ring(si) {
  if (si === 0) return RING;
  if (si === 10) return RING + gem([50, 18], 6, 7.5) + gem([82, 50], 7.5, 6) + gem([50, 82], 6, 7.5) + gem([18, 50], 7.5, 6);
  // +20 and above: a square plate with a diamond on each side and a long point below.
  const plate = `<rect x="19" y="19" width="62" height="62" fill="url(#orn-plate)" ${ln()}/><circle cx="50" cy="50" r="25.6" fill="#9b7424" ${ln()}/>`;
  const seams = `<path d="M30 30L19 19M70 30L81 19M30 70L19 81M70 70L81 81" ${ln(0.8)} opacity=".55"/>`;
  return plate + seams + gem([50, 16.5], 7.5, 10) + gem([16, 53], 9, 9.5) + gem([84, 53], 9, 9.5) + gem([50, 86], 10.5, 12, 21.5);
}

// The crown on top of the ring: signature item +40 and up, or furniture 36 (guide).
const CROWN = `<path d="M32 23C30 16 34 10 40 11.5C42 6.5 46 4 50 4C54 4 58 6.5 60 11.5C66 10 70 16 68 23C65 19 61.5 18 58.5 20.5H41.5C38.5 18 35 19 32 23Z" fill="url(#orn-gold)" ${ln()}/>
  <path d="M40 11.5C41.5 14.5 41.5 17.5 41.5 20.5M60 11.5C58.5 14.5 58.5 17.5 58.5 20.5" fill="none" ${ln(0.8)}/><circle cx="50" cy="13.5" r="3.2" fill="#e84a4a" ${ln()}/>`;

// Furniture: a hanger bar under the ring with one red diamond (3), two (9),
// or two between red banners with a crown on the ring (36).
function redGem(cx) {
  return `<polygon points="${poly([[cx, 88], [cx + 14, 107], [cx, 125], [cx - 14, 107]])}" fill="url(#orn-gold-v)" ${ln()}/>
    <polygon points="${poly([[cx, 94.5], [cx + 8.5, 107], [cx, 119], [cx - 8.5, 107]])}" fill="url(#orn-red)" ${ln()}/>`;
}

function pendant(f) {
  if (!f) return '';
  // The bar's ends curl up, as on the guide's pendant.
  const bar =
    f === 36
      ? `<path d="M17 83.5L21 86H79L83 83.5V89.5H17Z" fill="url(#orn-gold)" ${ln()}/>`
      : `<path d="M30 83L35 86H65L70 83L67 90H33Z" fill="url(#orn-gold)" ${ln()}/>`;
  const banners =
    f === 36
      ? `<path d="M19.5 89.5H30.5V113L25 117.5L19.5 113Z" fill="#d83a22" ${ln()}/><path d="M69.5 89.5H80.5V113L75 117.5L69.5 113Z" fill="#d83a22" ${ln()}/><path d="M19.5 109L25 117.5L19.5 113ZM80.5 109L75 117.5L80.5 113Z" fill="#f4c45a"/>`
      : '';
  const gems = f === 3 ? redGem(50) : redGem(40) + redGem(60);
  return banners + gems + bar;
}

export function emblemSvg(si, f) {
  if (si === null && !f) return '';
  const winged = si >= 30;
  const crowned = si >= 40 || f === 36;
  return `<svg class="emb-orn" viewBox="${VB.x} ${VB.y} ${VB.w} ${VB.h}" aria-hidden="true" focusable="false">${winged ? wings(si >= 40 && si < 50) : ''}${pendant(f)}${si === null ? '' : ring(si)}${crowned ? CROWN : ''}</svg>`;
}

// The emblem as a positioned box the size of the faction icon; the ornament overflows it.
export function emblem(h, e, { cls = '' } = {}) {
  const si = siTier(e);
  const f = furnitureTier(e);
  const label = [si !== null ? `signature item +${si}` : '', f ? `${f} furniture` : ''].filter(Boolean).join(', ');
  return `<span class="emb ${cls}" title="${esc(h.faction)}${label ? ` · ${esc(label)}` : ''}">${emblemSvg(si, f)}${factionIcon(h.faction)}</span>`;
}

export const EMBLEM_DEFS = `<linearGradient id="orn-gold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff5d8"/><stop offset=".45" stop-color="#f6d478"/><stop offset="1" stop-color="#dca437"/></linearGradient>
<linearGradient id="orn-gold-v" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff1d2"/><stop offset="1" stop-color="#eebd55"/></linearGradient>
<linearGradient id="orn-plate" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff8e6"/><stop offset=".5" stop-color="#f7dc8f"/><stop offset="1" stop-color="#e8b444"/></linearGradient>
<linearGradient id="orn-red" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#c8241a"/><stop offset=".6" stop-color="#ec5a3c"/><stop offset="1" stop-color="#ffd2bf"/></linearGradient>
<linearGradient id="orn-wing" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".5" stop-color="#eeedf7"/><stop offset="1" stop-color="#c9c4e8"/></linearGradient>
<linearGradient id="orn-wing-gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fffaeb"/><stop offset=".5" stop-color="#f7e8c2"/><stop offset="1" stop-color="#dfc07a"/></linearGradient>`;

// "+" ascension tiers: a gold cap in the top-right and bottom-left corners of
// the frame holding a cut gem (purple on Rare+, orange on Elite+ and
// Legendary+, pale cyan on Mythic+), as in the card guide.
const CAP_GEM = { 'Rare+': ['#c4b8fb', '#8f7fe6'], 'Elite+': ['#f8b06a', '#e0742a'], 'Legendary+': ['#f8b06a', '#e0742a'], 'Mythic+': ['#ffffff', '#cdf3ef'] };
export function plusCorners(asc) {
  const g = CAP_GEM[asc];
  if (!g) return '';
  const cap = (pos) =>
    `<svg class="fr-cap ${pos}" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M0 0H20V20Q16 9 0 0Z" fill="url(#orn-gold)" ${ln()}/><path d="M9 2.5L17.5 2.5L17.5 11L12 7.5Z" fill="${g[1]}" ${ln()}/><path d="M9 2.5L17.5 2.5L12 7.5Z" fill="${g[0]}" opacity=".85"/></svg>`;
  return cap('tr') + cap('bl');
}

// An upgrade as text for cards and lists: "n/a" before it unlocks, "–" when
// not recorded, "30+" or "<30" when the value is a minimum read from the card
// icon rather than an exact number.
const NEXT = { si: [10, 20, 30, 40, 50], furniture: [3, 9, 36], engrave: [30, 60, 80] };
export function upgradeText(e, f) {
  if (!e) return '–';
  if (NEXT[f] && !upgradeUnlocked(e, f)) return 'n/a';
  const v = e[f];
  if (v === null || v === undefined) return '–';
  if (e.est?.includes(f)) return v ? `${v}+` : `<${NEXT[f][0]}`;
  return String(v);
}

