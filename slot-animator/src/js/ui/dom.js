// Tiny DOM helpers and form fields. Every control gets a stable id so the
// page keeps focus and values across republishes.

export function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') {
      for (const [sk, sv] of Object.entries(v)) {
        if (sk.startsWith('--')) el.style.setProperty(sk, sv);
        else el.style[sk] = sv;
      }
    }
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'html') el.innerHTML = v;
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
}

export function clear(el, ...children) {
  el.replaceChildren();
  append(el, children);
  return el;
}

const clampTo = (v, min, max) => Math.min(max, Math.max(min, v));

export function rangeField({ id, label, value, min, max, step = 0.01, unit, hint, onInput }) {
  const rng = h('input', { type: 'range', id, min, max, step, value, 'aria-label': label });
  const num = h('input', { type: 'number', id: `${id}-num`, min, max, step, value, class: 'num', 'aria-label': `${label} value` });
  rng.addEventListener('input', () => {
    num.value = rng.value;
    onInput(Number(rng.value));
  });
  num.addEventListener('change', () => {
    const v = clampTo(Number(num.value) || 0, Number(min), Number(max));
    num.value = v;
    rng.value = v;
    onInput(v);
  });
  return h(
    'div',
    { class: 'field' },
    h('label', { for: id }, label, unit ? h('span', { class: 'unit' }, unit) : null),
    h('div', { class: 'range-row' }, rng, num),
    hint ? h('p', { class: 'hint' }, hint) : null
  );
}

export function selectField({ id, label, value, options, onChange, hint }) {
  const sel = h(
    'select',
    { id },
    options.map((o) => h('option', { value: o.value, selected: String(o.value) === String(value) }, o.label))
  );
  sel.addEventListener('change', () => onChange(sel.value));
  return h('div', { class: 'field' }, label ? h('label', { for: id }, label) : null, sel, hint ? h('p', { class: 'hint' }, hint) : null);
}

export function segmented({ id, label, value, options, onChange }) {
  const wrap = h('div', { class: 'seg', id, role: 'radiogroup', 'aria-label': label });
  options.forEach((o) => {
    const b = h('button', { type: 'button', id: `${id}-${o.value}`, class: String(o.value) === String(value) ? 'on' : '', role: 'radio', 'aria-checked': String(String(o.value) === String(value)), title: o.hint || null }, o.label);
    b.addEventListener('click', () => {
      wrap.querySelectorAll('button').forEach((x) => {
        x.classList.toggle('on', x === b);
        x.setAttribute('aria-checked', String(x === b));
      });
      onChange(o.value);
    });
    wrap.append(b);
  });
  return h('div', { class: 'field' }, label ? h('span', { class: 'label' }, label) : null, wrap);
}

export function toggleField({ id, label, checked, onChange, hint }) {
  const input = h('input', { type: 'checkbox', id, checked: !!checked });
  input.addEventListener('change', () => onChange(input.checked));
  return h('div', { class: 'field toggle' }, h('label', { for: id }, input, h('span', { class: 'switch', 'aria-hidden': 'true' }), h('span', null, label)), hint ? h('p', { class: 'hint' }, hint) : null);
}

export function textField({ id, label, value, onChange, placeholder, type = 'text', hint }) {
  const input = h('input', { type, id, value: value ?? '', placeholder });
  input.addEventListener(type === 'number' ? 'change' : 'input', () => onChange(type === 'number' ? (input.value === '' ? null : Number(input.value)) : input.value));
  return h('div', { class: 'field' }, label ? h('label', { for: id }, label) : null, input, hint ? h('p', { class: 'hint' }, hint) : null);
}

export function section(title, ...children) {
  return h('section', { class: 'group' }, h('h3', null, title), children);
}

// Extra children (a thumbnail, say) go after the icon and label.
export function button(label, onClick, opts = {}, ...extra) {
  return h('button', { type: 'button', class: opts.class || 'btn', id: opts.id, title: opts.title, 'aria-label': label ? null : opts.title, disabled: opts.disabled, onclick: onClick }, opts.icon ? icon(opts.icon) : null, label ? h('span', null, label) : null, ...extra);
}

const ICONS = {
  play: 'M7 4.5v15l12-7.5z',
  pause: 'M6 4h4v16H6zM14 4h4v16h-4z',
  prev: 'M6 5h2v14H6zM20 5v14L9 12z',
  next: 'M16 5h2v14h-2zM4 5v14l11-7z',
  loop: 'M7 7h10v3l4-4-4-4v3H5v6h2zM17 17H7v-3l-4 4 4 4v-3h12v-6h-2z',
  plus: 'M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z',
  up: 'M12 6l-6 6h4v6h4v-6h4z',
  down: 'M12 18l6-6h-4V6h-4v6H6z',
  copy: 'M8 8h11v11H8zM5 5h11v2H7v9H5z',
  trash: 'M9 4h6l1 2h4v2H4V6h4zM6 9h12l-1 11H7z',
  upload: 'M12 4l5 5h-3v6h-4V9H7zM5 18h14v2H5z',
  download: 'M10 4h4v6h3l-5 5-5-5h3zM5 18h14v2H5z',
  film: 'M4 5h16v14H4zM6 7v2h2V7zm0 4v2h2v-2zm0 4v2h2v-2zm10-8v2h2V7zm0 4v2h2v-2zm0 4v2h2v-2z',
  dice: 'M5 5h14v14H5zm3 2a1.5 1.5 0 100 3 1.5 1.5 0 000-3zm8 7a1.5 1.5 0 100 3 1.5 1.5 0 000-3zm-4-3.5a1.5 1.5 0 100 3 1.5 1.5 0 000-3z',
  eye: 'M12 6c5 0 9 6 9 6s-4 6-9 6-9-6-9-6 4-6 9-6zm0 3a3 3 0 100 6 3 3 0 000-6z',
  x: 'M6.4 5L12 10.6 17.6 5 19 6.4 13.4 12l5.6 5.6-1.4 1.4-5.6-5.6L6.4 19 5 17.6 10.6 12 5 6.4z',
  sound: 'M3 9h4l5-4v14l-5-4H3zM15 8.5a5 5 0 010 7l-1.4-1.4a3 3 0 000-4.2zM17.8 5.7a9 9 0 010 12.6l-1.4-1.4a7 7 0 000-9.8z',
  mute: 'M3 9h4l5-4v14l-5-4H3zM15.2 9.4l1.4-1.4 2.1 2.1 2.1-2.1 1.4 1.4-2.1 2.1 2.1 2.1-1.4 1.4-2.1-2.1-2.1 2.1-1.4-1.4 2.1-2.1z',
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  minus: 'M5 11h14v2H5z',
  window: 'M4 5h16v14H4zm2 4v8h12V9z',
  sparkle: 'M12 2l1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8zM19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9z',
  target: 'M11 2h2v3.1a7 7 0 016.9 6.9H23v2h-3.1a7 7 0 01-6.9 6.9V23h-2v-3.1A7 7 0 014.1 13H1v-2h3.1A7 7 0 0111 4.1zm1 4a6 6 0 100 12 6 6 0 000-12zm0 4a2 2 0 110 4 2 2 0 010-4z',
  chevron: 'M8.6 5.6L15 12l-6.4 6.4L7.2 17l5-5-5-5z',
  arrow: 'M4 11h12.2l-5.6-5.6L12 4l8 8-8 8-1.4-1.4 5.6-5.6H4z',
  foldAll: 'M7.4 18.6L8.8 20l3.2-3.2 3.2 3.2 1.4-1.4L12 14zM16.6 5.4L15.2 4 12 7.2 8.8 4 7.4 5.4 12 10z',
  unfoldAll: 'M12 5.8L15.2 9l1.4-1.4L12 3 7.4 7.6 8.8 9zM12 18.2L8.8 15l-1.4 1.4L12 21l4.6-4.6-1.4-1.4z',
  folder: 'M3 5h6l2 2h10v12H3z',
  undo: 'M8 5L3 10l5 5v-3.5h6.5a4.5 4.5 0 010 9H11v2h3.5a6.5 6.5 0 000-13H8z',
  redo: 'M16 5l5 5-5 5v-3.5H9.5a4.5 4.5 0 000 9H13v2H9.5a6.5 6.5 0 010-13H16z',
  search: 'M10 3a7 7 0 015.6 11.2l5.1 5.1-1.4 1.4-5.1-5.1A7 7 0 1110 3zm0 2a5 5 0 100 10 5 5 0 000-10z',
  keyboard: 'M2 6h20v12H2zm2 2v2h2V8zm3 0v2h2V8zm3 0v2h2V8zm3 0v2h2V8zm3 0v2h2V8zM4 11v2h2v-2zm3 0v2h2v-2zm3 0v2h2v-2zm3 0v2h2v-2zm3 0v2h2v-2zM7 14v2h10v-2z',
  reels: 'M3 4h5v16H3zm6.5 0h5v16h-5zM16 4h5v16h-5z',
  palette: 'M12 3a9 9 0 100 18c1.1 0 2-.9 2-2 0-.5-.2-1-.5-1.3-.3-.4-.5-.8-.5-1.2 0-1.1.9-2 2-2h2.4A4.6 4.6 0 0022 9.9C22 6.1 17.5 3 12 3zM6.5 12a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm3-4a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm5 0a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm3 4a1.5 1.5 0 110-3 1.5 1.5 0 010 3z',
  clock: 'M12 3a9 9 0 110 18 9 9 0 010-18zm0 2a7 7 0 100 14 7 7 0 000-14zm-1 2h2v5.4l3.3 2-1 1.7L11 13.5z',
  text: 'M5 5h14v3h-2V7h-4v10h2v2H9v-2h2V7H7v1H5z',
  wheel: 'M12 2a10 10 0 110 20 10 10 0 010-20zm0 2a8 8 0 100 16 8 8 0 000-16zm1 2.1V11h4.9A6 6 0 0013 6.1zM11 6.1A6 6 0 006.1 11H11zM6.1 13A6 6 0 0011 17.9V13zm6.9 4.9A6 6 0 0017.9 13H13z',
  bolt: 'M13 2L4 14h6l-1 8 9-12h-6z',
  trophy: 'M7 3h10v2h3v3a4 4 0 01-4 4h-.3A5 5 0 0113 14.9V17h3v3H8v-3h3v-2.1A5 5 0 018.3 12H8a4 4 0 01-4-4V5h3zm-1 4v1a2 2 0 002 2V7zm12 0h-2v3a2 2 0 002-2z',
  order: 'M4 6h10v2H4zm0 5h7v2H4zm0 5h4v2H4zm12-9l3 3h-2v8h-2v-8h-2z',
  curve: 'M3 19c4 0 5-14 9-14s5 14 9 14v-2c-2.5 0-3.5-14-9-14S5.5 17 3 17z',
  pointer: 'M12 22l-5-9a5 5 0 1110 0z',
  coin: 'M12 3a9 9 0 110 18 9 9 0 010-18zm0 2a7 7 0 100 14 7 7 0 000-14zm1 2v1.1c1.3.3 2.2 1.1 2.4 2.4h-2c-.1-.5-.6-.8-1.4-.8-.9 0-1.4.4-1.4.9 0 .6.6.8 1.8 1.1 1.8.4 3.1 1 3.1 2.7 0 1.3-1 2.3-2.5 2.6V17h-2v-1.1c-1.5-.3-2.5-1.2-2.6-2.6h2c.1.6.7 1 1.6 1 1 0 1.5-.4 1.5-1 0-.6-.5-.8-1.9-1.1-1.6-.4-3-.9-3-2.6 0-1.2.9-2.2 2.4-2.5V7z',
  block: 'M12 3a9 9 0 110 18 9 9 0 010-18zm-5.3 4.1A7 7 0 0016.9 17.3zM12 5a7 7 0 00-3.9 1.2l9.7 9.7A7 7 0 0012 5z',
};

export function icon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('ic');
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute('d', ICONS[name] || '');
  p.setAttribute('fill', 'currentColor');
  svg.append(p);
  return svg;
}

export function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

export function pickFiles(accept, multiple = false) {
  return new Promise((resolve) => {
    const input = h('input', { type: 'file', accept, multiple, style: { display: 'none' } });
    input.addEventListener('change', () => {
      resolve([...(input.files || [])]);
      input.remove();
    });
    document.body.append(input);
    input.click();
  });
}
