// Fonts: the built-in display fonts plus any the user uploads (TTF, OTF,
// WOFF). Uploaded fonts live in the project as data URLs; the preview
// registers them, and After Effects asks for them by PostScript name, read
// here from the font file's name table. Pure.

export const BUILTIN_FONTS = ['Bungee', 'Lilita One', 'Russo One', 'Cinzel Decorative'];

// Google Fonts that suit slot titles and counters, by look. w: the weight
// the page loads and draws (one weight each); ps: the PostScript name After
// Effects asks for when it is not "<Family>-Regular".
export const FONT_CATS = [
  { id: 'bold', label: 'Bold' },
  { id: 'tech', label: 'Tech & retro' },
  { id: 'classic', label: 'Classic' },
  { id: 'script', label: 'Script' },
  { id: 'fun', label: 'Fun' },
];
const F = (cat, list) => list.map((x) => (typeof x === 'string' ? { family: x, cat } : { cat, ...x }));
export const FONT_CATALOG = [
  ...F('bold', [
    'Bungee', 'Lilita One', 'Luckiest Guy', 'Titan One', 'Bangers', 'Russo One', 'Black Ops One', 'Righteous', 'Passion One', 'Changa One',
    'Alfa Slab One', 'Bowlby One SC', 'Bowlby One', 'Rubik Mono One', 'Paytone One', 'Carter One', 'Sigmar One', 'Rammetto One', 'Ultra',
    'Archivo Black', 'Anton', 'Bebas Neue', 'Staatliches', 'Squada One', 'Black Han Sans', 'Knewave', 'Patua One', 'Concert One', 'Days One',
    'Graduate', 'Holtwood One SC', 'Bungee Inline', 'Bungee Shade',
    { family: 'Montserrat', w: 900, ps: 'Montserrat-Black' }, { family: 'Poppins', w: 800, ps: 'Poppins-ExtraBold' },
    { family: 'Rubik', w: 800, ps: 'Rubik-ExtraBold' }, { family: 'Nunito', w: 900, ps: 'Nunito-Black' },
    { family: 'Kanit', w: 800, ps: 'Kanit-ExtraBold' }, { family: 'Oswald', w: 700, ps: 'Oswald-Bold' },
    { family: 'Fredoka', w: 700, ps: 'Fredoka-Bold' }, { family: 'Baloo 2', w: 800, ps: 'Baloo2-ExtraBold' },
    { family: 'Teko', w: 600, ps: 'Teko-SemiBold' },
  ]),
  ...F('tech', [
    { family: 'Orbitron', w: 900, ps: 'Orbitron-Black' }, 'Audiowide', 'Monoton', 'Press Start 2P', 'Faster One', 'Racing Sans One', 'Michroma',
    'Wallpoet', 'Zen Dots', 'Silkscreen', 'Major Mono Display', { family: 'Exo 2', w: 900, ps: 'Exo2-Black' },
    { family: 'Syncopate', w: 700, ps: 'Syncopate-Bold' }, { family: 'Turret Road', w: 800, ps: 'TurretRoad-ExtraBold' },
  ]),
  ...F('classic', [
    { family: 'Cinzel Decorative', w: 900, ps: 'CinzelDecorative-Black' }, { family: 'Cinzel', w: 900, ps: 'Cinzel-Black' },
    { family: 'Playfair Display', w: 900, ps: 'PlayfairDisplay-Black' }, 'Abril Fatface', 'Bevan', 'Rye', 'Ewert', 'Diplomata SC', 'Yeseva One',
    'Rozha One', 'Marcellus SC', 'Pirata One', 'Uncial Antiqua', 'MedievalSharp', 'Almendra Display', 'Metamorphous', 'Limelight', 'Federo',
    'Shrikhand',
  ]),
  ...F('script', [
    'Lobster', 'Pacifico', 'Yellowtail', 'Kaushan Script', 'Satisfy', 'Permanent Marker', 'Courgette', 'Damion', 'Leckerli One', 'Sonsie One',
    'Great Vibes', { family: 'Dancing Script', w: 700, ps: 'DancingScript-Bold' }, 'Caveat Brush', 'Marck Script', 'Grand Hotel', 'Cookie', 'Sriracha',
  ]),
  ...F('fun', [
    'Chewy', 'Creepster', 'Nosifer', 'Metal Mania', 'Butcherman', 'Eater', 'Frijole', 'Fascinate', 'Fascinate Inline', 'Margarine', 'Spicy Rice',
    'Emilys Candy', 'Mountains of Christmas', 'Henny Penny', 'Ribeye Marrow', 'Lemon', 'Modak', 'Bubblegum Sans', 'Chicle', 'Coiny', 'Galindo',
  ]),
];

export function catalogFont(family) {
  return FONT_CATALOG.find((f) => f.family === family) || null;
}

// The Google Fonts stylesheet for a catalogue font (its one weight).
export function googleFontURL(family) {
  const f = catalogFont(family);
  if (!f) return null;
  return `https://fonts.googleapis.com/css2?family=${encodeURIComponent(f.family).replace(/%20/g, '+')}${f.w ? `:wght@${f.w}` : ''}&display=swap`;
}

export function projectFonts(project) {
  return [...BUILTIN_FONTS, ...(project.fonts || []).map((f) => f.family)];
}

// The name After Effects knows a font by.
export function fontPostScript(project, family) {
  const up = (project.fonts || []).find((f) => f.family === family);
  if (up && up.ps) return up.ps;
  const cat = catalogFont(family);
  if (cat && cat.ps) return cat.ps;
  return `${String(family || 'Bungee').replace(/\s+/g, '')}-Regular`;
}

// Family, style and PostScript names from a TrueType or OpenType file (an
// ArrayBuffer or Uint8Array). WOFF files with an uncompressed name table
// work too; anything else gives null.
export function parseFontNames(buf) {
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  if (u8.length < 12) return null;
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const tag = String.fromCharCode(u8[0], u8[1], u8[2], u8[3]);
  let nameOff = -1;
  let nameLen = 0;
  if (tag === 'wOFF') {
    const n = dv.getUint16(12);
    for (let i = 0; i < n; i++) {
      const p = 44 + i * 20;
      if (p + 20 > u8.length) return null;
      const t = String.fromCharCode(u8[p], u8[p + 1], u8[p + 2], u8[p + 3]);
      if (t !== 'name') continue;
      const comp = dv.getUint32(p + 8);
      const orig = dv.getUint32(p + 12);
      if (comp !== orig) return null;
      nameOff = dv.getUint32(p + 4);
      nameLen = orig;
    }
  } else if (tag === 'OTTO' || tag === 'true' || dv.getUint32(0) === 0x00010000) {
    const n = dv.getUint16(4);
    for (let i = 0; i < n; i++) {
      const p = 12 + i * 16;
      if (p + 16 > u8.length) return null;
      const t = String.fromCharCode(u8[p], u8[p + 1], u8[p + 2], u8[p + 3]);
      if (t !== 'name') continue;
      nameOff = dv.getUint32(p + 8);
      nameLen = dv.getUint32(p + 12);
    }
  } else return null;
  if (nameOff < 0 || nameOff + 6 > u8.length) return null;
  const count = dv.getUint16(nameOff + 2);
  const strings = nameOff + dv.getUint16(nameOff + 4);
  const found = {};
  for (let i = 0; i < count; i++) {
    const r = nameOff + 6 + i * 12;
    if (r + 12 > nameOff + nameLen || r + 12 > u8.length) break;
    const platform = dv.getUint16(r);
    const id = dv.getUint16(r + 6);
    const len = dv.getUint16(r + 8);
    const off = strings + dv.getUint16(r + 10);
    if (![1, 2, 4, 6, 16, 17].includes(id) || off + len > u8.length) continue;
    let s = '';
    if (platform === 3 || platform === 0) for (let j = 0; j + 1 < len; j += 2) s += String.fromCharCode(dv.getUint16(off + j));
    else if (platform === 1) for (let j = 0; j < len; j++) s += String.fromCharCode(u8[off + j]);
    else continue;
    // Prefer the Windows (Unicode) record; keep the first of each id.
    if (s && (!found[id] || platform === 3)) found[id] = s;
  }
  const family = found[16] || found[1];
  if (!family) return null;
  return { family, style: found[17] || found[2] || 'Regular', postscript: found[6] || `${family.replace(/\s+/g, '')}-${(found[17] || found[2] || 'Regular').replace(/\s+/g, '')}` };
}
