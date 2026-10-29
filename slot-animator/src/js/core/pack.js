// A package's files, each identical file stored once. Adding a file whose
// bytes match one already stored makes its path an alias of that file;
// remapPaths then points every reference in the data at the stored copy.
// Pure: bytes in, paths out.

// Two 32-bit FNV-1a variants and the length; equal keys are confirmed byte
// by byte before two files are treated as one.
function contentKey(bytes) {
  let a = 0x811c9dc5;
  let b = 0x01000193;
  for (let i = 0; i < bytes.length; i++) {
    a = Math.imul(a ^ bytes[i], 16777619);
    b = Math.imul(b ^ bytes[i], 2246822519);
  }
  return `${bytes.length}:${(a >>> 0).toString(36)}:${(b >>> 0).toString(36)}`;
}

function sameBytes(x, y) {
  if (x.length !== y.length) return false;
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return false;
  return true;
}

export class FilePack {
  constructor() {
    this.files = new Map(); // stored path -> bytes
    this.alias = new Map(); // path -> stored path, for paths not stored
    this.byKey = new Map(); // content key -> stored paths
    this.saved = 0; // bytes not stored twice
  }

  // Returns the path the file is stored under.
  add(path, bytes) {
    if (this.files.has(path) || this.alias.has(path)) throw new Error(`${path} was added twice`);
    const key = contentKey(bytes);
    const same = (this.byKey.get(key) || []).find((p) => sameBytes(this.files.get(p), bytes));
    if (same) {
      this.alias.set(path, same);
      this.saved += bytes.length;
      return same;
    }
    this.files.set(path, bytes);
    if (!this.byKey.has(key)) this.byKey.set(key, []);
    this.byKey.get(key).push(path);
    return path;
  }

  resolve(path) {
    return this.alias.get(path) || path;
  }
}

// A copy of data with every string that names an aliased path replaced by
// the stored one.
export function remapPaths(data, resolve) {
  if (typeof data === 'string') return resolve(data);
  if (Array.isArray(data)) return data.map((v) => remapPaths(v, resolve));
  if (data && typeof data === 'object') return Object.fromEntries(Object.entries(data).map(([k, v]) => [k, remapPaths(v, resolve)]));
  return data;
}
