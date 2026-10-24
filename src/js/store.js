// Hero bank persistence. Uses the artifact's private per-user store when the
// page runs inside Claude, and mirrors to localStorage so the bank also works
// when the page is opened on its own (GitHub Pages, a local file server).

import { local, debounce, clamp, toInt } from './util.js';
import { ASCENSIONS, LIMITS, CLASSES, ELDER_MAX } from './data.js';

const LOCAL_KEY = 'afk-codex-bank-v1';
const LOCAL_FORMATIONS = 'afk-codex-formations-v1';

const listeners = new Set();

export const bank = {
  version: 1,
  updatedAt: 0,
  settings: { sharedLevel: true, crystalLevel: 240, elderTree: emptyElderTree() },
  heroes: {},
};

export function emptyElderTree() {
  return { core: null, Warrior: null, Tank: null, Ranger: null, Mage: null, Support: null, updated: null, source: null };
}

function sanitizeElderTree(t) {
  const out = { ...emptyElderTree(), ...(t || {}) };
  for (const k of ['core', ...CLASSES]) {
    const v = out[k];
    out[k] = v === null || v === undefined || v === '' ? null : clamp(toInt(v, 0), 0, ELDER_MAX);
  }
  return out;
}

export const formations = { updatedAt: 0, items: [] };

export const sync = { mode: 'local', status: 'idle' }; // mode: local | cloud

let remote = null; // { bankRef, formationsRef }

export function defaultEntry() {
  return {
    owned: true,
    asc: 'Ascended',
    stars: 0,
    level: 240,
    crystal: true,
    si: 0,
    furniture: 0,
    engrave: 0,
    gear: 0,
    notes: '',
    source: 'manual',
    updated: Date.now(),
  };
}

// null means "not recorded" (for example a hero read from the hero list,
// which does not show signature item, furniture or engraving).
const optNum = (v, max) => (v === null || v === undefined || v === '' ? null : clamp(toInt(v, 0), 0, max));

export function sanitizeEntry(e) {
  const d = defaultEntry();
  const out = { ...d, ...e };
  out.owned = !!out.owned;
  out.asc = ASCENSIONS.includes(out.asc) ? out.asc : d.asc;
  out.stars = out.asc === 'Ascended' ? clamp(toInt(out.stars, 0), 0, LIMITS.stars) : 0;
  out.level = clamp(toInt(out.level, d.level), 1, LIMITS.level);
  out.crystal = out.crystal !== false;
  out.si = optNum(out.si, LIMITS.si);
  out.furniture = optNum(out.furniture, LIMITS.furniture);
  out.engrave = optNum(out.engrave, LIMITS.engrave);
  out.gear = optNum(out.gear, LIMITS.gear);
  out.notes = String(out.notes || '').slice(0, 500);
  return out;
}

export function onBankChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit() {
  for (const fn of listeners) fn(bank);
}

export function ownedIds() {
  return Object.keys(bank.heroes).filter((id) => bank.heroes[id]?.owned);
}

export function entry(id) {
  return bank.heroes[id] || null;
}

// Level the game actually uses for a hero: the shared crystal level when the
// "all heroes share the same level" setting is on, unless this hero sits
// outside the crystal (crystal: false) and keeps its own level.
export function effectiveLevel(id) {
  const e = bank.heroes[id];
  if (!e) return 0;
  return bank.settings.sharedLevel && e.crystal !== false ? bank.settings.crystalLevel : e.level;
}

export function updateHeroes(patches, source = 'manual') {
  const now = Date.now();
  for (const [id, patch] of Object.entries(patches)) {
    const prev = bank.heroes[id] || { ...defaultEntry(), owned: false };
    bank.heroes[id] = sanitizeEntry({ ...prev, ...patch, source, updated: now });
  }
  touch();
}

export function removeHeroes(ids) {
  for (const id of ids) delete bank.heroes[id];
  touch();
}

export function updateSettings(patch) {
  bank.settings = { ...bank.settings, ...patch };
  bank.settings.crystalLevel = clamp(toInt(bank.settings.crystalLevel, 240), 1, LIMITS.level);
  bank.settings.elderTree = sanitizeElderTree(bank.settings.elderTree);
  touch();
}

export function updateElderTree(patch, source = 'manual') {
  updateSettings({ elderTree: { ...bank.settings.elderTree, ...patch, updated: Date.now(), source } });
}

export function replaceBank(next) {
  bank.settings = { ...bank.settings, ...(next.settings || {}) };
  bank.settings.elderTree = sanitizeElderTree(bank.settings.elderTree);
  bank.heroes = {};
  for (const [id, e] of Object.entries(next.heroes || {})) bank.heroes[id] = sanitizeEntry(e);
  touch();
}

function touch() {
  bank.updatedAt = Date.now();
  local.set(LOCAL_KEY, bank);
  emit();
  pushRemote();
}

export function saveFormation(item) {
  formations.items = [{ ...item, id: 'f' + Date.now().toString(36), saved: Date.now() }, ...formations.items].slice(0, 60);
  touchFormations();
}

export function deleteFormation(id) {
  formations.items = formations.items.filter((f) => f.id !== id);
  touchFormations();
}

function touchFormations() {
  formations.updatedAt = Date.now();
  local.set(LOCAL_FORMATIONS, formations);
  emit();
  pushFormations();
}

// ---- remote (Claude artifact db) ------------------------------------------

let writing = false;
let dirty = false;

const pushRemote = debounce(async () => {
  if (!remote) return;
  if (writing) {
    dirty = true;
    return;
  }
  writing = true;
  sync.status = 'saving';
  emitSync();
  try {
    await remote.bankRef.set(JSON.parse(JSON.stringify(bank)));
    sync.status = 'saved';
  } catch (e) {
    sync.status = 'error';
    sync.error = e?.code || 'unavailable';
  } finally {
    writing = false;
    emitSync();
    if (dirty) {
      dirty = false;
      pushRemote();
    }
  }
}, 700);

const pushFormations = debounce(async () => {
  if (!remote) return;
  try {
    await remote.formationsRef.set(JSON.parse(JSON.stringify(formations)));
  } catch {
    /* surfaced through bank status */
  }
}, 700);

const syncListeners = new Set();
export function onSyncChange(fn) {
  syncListeners.add(fn);
}
function emitSync() {
  for (const fn of syncListeners) fn(sync);
}

export function loadLocal() {
  const saved = local.get(LOCAL_KEY);
  if (saved && saved.heroes) {
    bank.updatedAt = saved.updatedAt || 0;
    bank.settings = { ...bank.settings, ...(saved.settings || {}) };
    bank.settings.elderTree = sanitizeElderTree(bank.settings.elderTree);
    for (const [id, e] of Object.entries(saved.heroes)) bank.heroes[id] = sanitizeEntry(e);
  }
  const f = local.get(LOCAL_FORMATIONS);
  if (f && Array.isArray(f.items)) Object.assign(formations, f);
}

export async function connectRemote() {
  const claude = window.claude;
  if (!claude?.use) return;
  try {
    const [db, user] = await Promise.all([claude.use('db'), claude.use('user')]);
    if (!db || !user) return;
    const uid = await user.id();
    if (!uid) return;
    const bankRef = db.doc(`data/users/${uid}/bank`);
    const formationsRef = db.doc(`data/users/${uid}/formations`);
    const [snap, fsnap] = await Promise.all([bankRef.get(), formationsRef.get()]);
    remote = { bankRef, formationsRef };
    sync.mode = 'cloud';
    const cloud = snap.exists ? snap.data() : null;
    if (cloud && (cloud.updatedAt || 0) >= bank.updatedAt) {
      bank.updatedAt = cloud.updatedAt || 0;
      bank.settings = { ...bank.settings, ...(cloud.settings || {}) };
      bank.settings.elderTree = sanitizeElderTree(bank.settings.elderTree);
      bank.heroes = {};
      for (const [id, e] of Object.entries(cloud.heroes || {})) bank.heroes[id] = sanitizeEntry(e);
      local.set(LOCAL_KEY, bank);
      emit();
    } else if (Object.keys(bank.heroes).length) {
      pushRemote();
    }
    const fc = fsnap.exists ? fsnap.data() : null;
    if (fc && (fc.updatedAt || 0) >= formations.updatedAt) {
      formations.updatedAt = fc.updatedAt || 0;
      formations.items = Array.isArray(fc.items) ? fc.items : [];
      local.set(LOCAL_FORMATIONS, formations);
      emit();
    } else if (formations.items.length) {
      pushFormations();
    }
    // Pick up edits made on another device while this page is open.
    bankRef.onSnapshot(
      (s) => {
        if (!s.exists || s.metadata.hasPendingWrites) return;
        const d = s.data();
        if ((d.updatedAt || 0) > bank.updatedAt) {
          bank.updatedAt = d.updatedAt;
          bank.settings = { ...bank.settings, ...(d.settings || {}) };
          bank.settings.elderTree = sanitizeElderTree(bank.settings.elderTree);
          bank.heroes = {};
          for (const [id, e] of Object.entries(d.heroes || {})) bank.heroes[id] = sanitizeEntry(e);
          local.set(LOCAL_KEY, bank);
          emit();
        }
      },
      () => {}
    );
    sync.status = 'saved';
    emitSync();
  } catch {
    remote = null;
    sync.mode = 'local';
    emitSync();
  }
}

export function exportBank() {
  return JSON.stringify({ app: 'afk-arena-codex', exported: new Date().toISOString(), ...bank }, null, 2);
}
