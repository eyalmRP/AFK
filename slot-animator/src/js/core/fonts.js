// Fonts: the built-in display fonts plus any the user uploads (TTF, OTF,
// WOFF). Uploaded fonts live in the project as data URLs; the preview
// registers them, and After Effects asks for them by PostScript name, read
// here from the font file's name table. Pure.

export const BUILTIN_FONTS = ['Bungee', 'Lilita One', 'Russo One', 'Cinzel Decorative'];

export function projectFonts(project) {
  return [...BUILTIN_FONTS, ...(project.fonts || []).map((f) => f.family)];
}

// The name After Effects knows a font by.
export function fontPostScript(project, family) {
  const up = (project.fonts || []).find((f) => f.family === family);
  if (up && up.ps) return up.ps;
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
