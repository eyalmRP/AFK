// Inline SVG icons: faction emblems, class marks and UI glyphs.

const svg = (body, vb = '0 0 24 24', extra = '') =>
  `<svg viewBox="${vb}" aria-hidden="true" focusable="false" ${extra}>${body}</svg>`;

// Faction, class and type icons are the game's own art (via AFK Calc),
// bundled under img/icons/.
const gameIcon = (dir, name, label) =>
  `<img class="gi" src="img/icons/${dir}/${String(name || '').toLowerCase()}.webp" alt="${label ? String(name) : ''}" loading="lazy" draggable="false">`;

export const ICON = {
  chevron: svg('<path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M6 9l6 6 6-6"/>', '0 0 24 24', 'class="fold-icon"'),
  search: svg('<g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/></g>'),
  star: svg('<path fill="currentColor" d="M12 2.8l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4L2.8 9.5l6.4-.8z"/>'),
  check: svg('<path fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" d="M5 12.5l4.5 4.5L19 7.5"/>'),
  close: svg('<path fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" d="M6 6l12 12M18 6L6 18"/>'),
  people: svg('<g fill="currentColor"><circle cx="8" cy="8" r="3.2"/><circle cx="16.5" cy="9" r="2.6"/><path d="M2 19c0-3.3 2.7-6 6-6s6 2.7 6 6z"/><path d="M14.5 19c0-1.8-.6-3.4-1.6-4.6.9-.6 2.1-1 3.4-1 2.8 0 5.2 2.3 5.2 5.6z"/></g>'),
  spark: svg('<path fill="currentColor" d="M12 2l1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8zM19 15l.9 2.6 2.6.9-2.6.9L19 22l-.9-2.6-2.6-.9 2.6-.9z"/>'),
  upload: svg('<g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3a1.5 1.5 0 0 0 1.5 1.5h13A1.5 1.5 0 0 0 20 19v-3"/></g>'),
  edit: svg('<path fill="currentColor" d="M4 17.2V20h2.8l9.6-9.6-2.8-2.8zM19.7 7.1a1 1 0 0 0 0-1.4l-1.4-1.4a1 1 0 0 0-1.4 0l-1.6 1.6 2.8 2.8z"/>'),
  swords: svg('<g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 4l10 10M4 4h3.5M4 4v3.5"/><path d="M20 4L10 14M20 4h-3.5M20 4v3.5"/><path d="M8 17l-3 3M16 17l3 3M7 14l3 3M17 14l-3 3"/></g>'),
  save: svg('<path fill="currentColor" d="M5 3h11l3 3v13a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2zm2 2v4h8V5zm5 8a3 3 0 1 0 0 6 3 3 0 0 0 0-6z"/>'),
  trash: svg('<path fill="currentColor" d="M9 3h6l1 2h4v2H4V5h4zm-3 6h12l-1 12H7z"/>'),
  copy: svg('<g fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="8.5" y="8.5" width="11" height="11" rx="2"/><path d="M15.5 8.5V6a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5"/></g>'),
  tabMeta: svg('<g fill="currentColor"><rect x="3" y="4" width="5" height="4" rx="1"/><rect x="10" y="4.5" width="11" height="3" rx="1.5" opacity=".55"/><rect x="3" y="10" width="5" height="4" rx="1"/><rect x="10" y="10.5" width="8" height="3" rx="1.5" opacity=".55"/><rect x="3" y="16" width="5" height="4" rx="1"/><rect x="10" y="16.5" width="5" height="3" rx="1.5" opacity=".55"/></g>'),
  tabBank: svg('<g fill="currentColor"><rect x="3" y="3" width="8" height="8" rx="2"/><rect x="13" y="3" width="8" height="8" rx="2" opacity=".55"/><rect x="3" y="13" width="8" height="8" rx="2" opacity=".55"/><rect x="13" y="13" width="8" height="8" rx="2"/></g>'),
  tabBuild: svg('<g fill="currentColor"><circle cx="8" cy="7" r="3"/><circle cx="16" cy="7" r="3"/><circle cx="5" cy="16" r="2.6" opacity=".6"/><circle cx="12" cy="16" r="2.6" opacity=".6"/><circle cx="19" cy="16" r="2.6" opacity=".6"/></g>'),
  tabCounter: svg('<g fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M4 4l10 10M4 4h3.5M4 4v3.5"/><path d="M20 4L10 14M20 4h-3.5M20 4v3.5"/><path d="M8 17l-3 3M16 17l3 3M7 14l3 3M17 14l-3 3"/></g>'),
  tabCodes: svg('<g fill="currentColor"><path d="M3 10h18v3H3z"/><path d="M4.5 14h6.5v7H6a1.5 1.5 0 0 1-1.5-1.5zM13 14h6.5v5.5A1.5 1.5 0 0 1 18 21h-5z" opacity=".7"/><path d="M12 9.5C10.5 6 7 5 6.3 6.6 5.6 8.3 9 9.5 12 9.5zm0 0c1.5-3.5 5-4.5 5.7-2.9.7 1.7-2.7 2.9-5.7 2.9z" fill="none" stroke="currentColor" stroke-width="1.8"/></g>'),
  stop: svg('<rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor"/>'),
};

export const BRAND = svg(
  '<g fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M16 2.5l11 6.2v12.6L16 29.5 5 21.3V8.7z"/><path d="M16 7.5l6.5 3.7v7.6L16 24.5l-6.5-5.7v-7.6z" fill="currentColor" fill-opacity=".18"/><path d="M16 2.5v5M27 8.7l-4.5 2.5M5 8.7l4.5 2.5M16 24.5v5"/></g>',
  '0 0 32 32',
  'class="brand-mark"'
);

export function factionIcon(f, label = false) {
  return gameIcon('factions', f || 'dimensional', label);
}

export function classIcon(c, label = false) {
  return gameIcon('classes', c || 'warrior', label);
}

export function typeIcon(t, label = false) {
  return gameIcon('types', t || 'strength', label);
}
