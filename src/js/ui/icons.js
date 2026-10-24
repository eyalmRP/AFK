// Inline SVG icons: faction emblems, class marks and UI glyphs.

const svg = (body, vb = '0 0 24 24', extra = '') =>
  `<svg viewBox="${vb}" aria-hidden="true" focusable="false" ${extra}>${body}</svg>`;

const FACTION = {
  Lightbearer: svg('<circle cx="12" cy="12" r="4.2" fill="currentColor"/><g stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/></g>'),
  Mauler: svg('<g fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 4c3 4 3.5 10 1 16"/><path d="M12 3c2.6 5 2.6 12 0 18"/><path d="M18 4c-3 4-3.5 10-1 16"/></g>'),
  Wilder: svg('<path fill="currentColor" d="M19.5 4.5C11 4.5 5 9 5 15.5c0 1.4.4 2.7 1 3.8L4.3 21l1.2 1.2 1.8-1.8c1 .6 2.3 1 3.7 1 6.5 0 9.5-7 8.5-16.9zM8.5 18.5c2-4 5-7 8-9-2.5 2.6-4.8 5.6-6.6 9.6z"/>'),
  Graveborn: svg('<path fill="currentColor" d="M12 2.5c-4.7 0-8 3.2-8 7.7 0 2.6 1.1 4.4 2.8 5.6V19c0 .8.7 1.5 1.5 1.5h.9v-2h1.6v2h2.4v-2h1.6v2h.9c.8 0 1.5-.7 1.5-1.5v-3.2c1.7-1.2 2.8-3 2.8-5.6 0-4.5-3.3-7.7-8-7.7zM8.6 13.6a2 2 0 1 1 0-4 2 2 0 0 1 0 4zm6.8 0a2 2 0 1 1 0-4 2 2 0 0 1 0 4z"/>'),
  Celestial: svg('<path fill="currentColor" d="M12 2l2.2 7.3L21.5 12l-7.3 2.7L12 22l-2.2-7.3L2.5 12l7.3-2.7z"/>'),
  Hypogean: svg('<path fill="currentColor" d="M4 3c.5 4.5 2.6 7.3 5.2 8.6C7.9 13 7.3 14.7 7.3 16.5 7.3 19.5 9.4 22 12 22s4.7-2.5 4.7-5.5c0-1.8-.6-3.5-1.9-4.9C17.4 10.3 19.5 7.5 20 3c-2.3 3-5 4.4-8 4.4S6.3 6 4 3z"/>'),
  Draconis: svg('<path fill="currentColor" d="M3 4c3.2.4 5.6 1.6 7.3 3.4L12 5l1.7 2.4C15.4 5.6 17.8 4.4 21 4c-1.3 2.3-2.2 4.5-2.4 6.8l2.4 1.7-3 1.1c-.6 3.6-2.8 6.3-6 8.4-3.2-2.1-5.4-4.8-6-8.4l-3-1.1 2.4-1.7C5.2 8.5 4.3 6.3 3 4zm6.3 9.2l1.6.6-.2-1.8zm5.4 0l-1.4-1.2-.2 1.8z"/>'),
  Dimensional: svg('<g fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 2.5l8.2 4.75v9.5L12 21.5l-8.2-4.75v-9.5z"/><circle cx="12" cy="12" r="3.2" fill="currentColor" stroke="none"/></g>'),
};

const CLASS = {
  Warrior: svg('<path fill="currentColor" d="M14.5 3H21v6.5l-9.6 9.6 1.6 1.6-1.4 1.4-2.3-2.3-3 3-1.4-1.4 3-3-2.3-2.3 1.4-1.4 1.6 1.6zM16 5l-8.8 8.8.9.9L17 6h2V5z"/>'),
  Tank: svg('<path fill="currentColor" d="M12 2l8 3v6.2c0 5-3.4 9.3-8 10.8-4.6-1.5-8-5.8-8-10.8V5z"/>'),
  Ranger: svg('<g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 3c7 2 12 8 14 15"/><path d="M6 3v14"/><path d="M20 18H6"/><path d="M4 21L16 9"/><path d="M16 9h-3M16 9v3"/></g>'),
  Mage: svg('<g fill="currentColor"><circle cx="16" cy="7" r="4"/><path d="M13.5 10.3l1.4 1.4L5.4 21.2 4 19.8z"/></g>'),
  Support: svg('<path fill="currentColor" d="M9.5 3h5v6.5H21v5h-6.5V21h-5v-6.5H3v-5h6.5z"/>'),
};

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
  stop: svg('<rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor"/>'),
};

export const BRAND = svg(
  '<g fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M16 2.5l11 6.2v12.6L16 29.5 5 21.3V8.7z"/><path d="M16 7.5l6.5 3.7v7.6L16 24.5l-6.5-5.7v-7.6z" fill="currentColor" fill-opacity=".18"/><path d="M16 2.5v5M27 8.7l-4.5 2.5M5 8.7l4.5 2.5M16 24.5v5"/></g>',
  '0 0 32 32',
  'class="brand-mark"'
);

export function factionIcon(f) {
  return FACTION[f] || FACTION.Dimensional;
}

export function classIcon(c) {
  return CLASS[c] || CLASS.Warrior;
}
