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
  const wrap = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': label });
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

export function button(label, onClick, opts = {}) {
  return h('button', { type: 'button', class: opts.class || 'btn', id: opts.id, title: opts.title, disabled: opts.disabled, onclick: onClick }, opts.icon ? icon(opts.icon) : null, label ? h('span', null, label) : null);
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
