// The first-run guide: a short tour of the editor. Each step lights one
// area (the rest of the screen darkens) and explains it in a card beside
// it. A step whose area is not on screen (a phone layout, a folded panel)
// is left out. It shows itself once; Project › Take the tour runs it again.
import { h, clear, icon, button } from './dom.js';

export const GUIDE_AGAIN = 'Take it again any time: Project › Take the tour, or search “tour”.';

// target: selectors whose visible matches are lit together; fallback:
// the same, used when none of those shows (phones, tablets).
export const GUIDE_STEPS = [
  {
    id: 'welcome',
    title: 'Welcome to Reel Studio',
    text: 'Build the winning moments of a slot game (spins, big wins, free spins, Hold & Spin, bonus wheels), watch them here, and take them to After Effects as a project you can edit. This tour takes about a minute.',
  },
  {
    id: 'preview',
    target: ['.stage .viewport'],
    title: 'The preview',
    text: 'Your animation, drawn live. Every change shows here at once, and the After Effects project follows the same timing.',
  },
  {
    id: 'transport',
    target: ['.top .transport'],
    fallback: ['.stage .phone-tp'],
    title: 'Play it',
    text: 'Play or pause (Space), jump between rounds, loop, play one round alone, turn the sound on and slow it down. Reel Studio opens paused.',
  },
  {
    id: 'timeline',
    target: ['.stage .timeline'],
    title: 'The timeline',
    text: 'Every round is a block in its colour. Click or drag to scrub; the round under the playhead is selected.',
  },
  {
    id: 'rounds',
    target: ['.side.right .list-head', '#round-list'],
    title: 'Spin rounds',
    text: 'The animation is a list of rounds: a small win, a near miss, free spins, a big win. Add one by its outcome and drag a round to reorder. The quick sequence above builds a whole run in one go.',
  },
  {
    id: 'inspector',
    target: ['#round-inspector'],
    title: 'The selected round',
    text: 'Its outcome, symbol and amount, and the features it uses (wilds, multipliers, tumbles, boosters and more). Add a feature brings in another.',
  },
  {
    id: 'settings',
    target: ['.rail', '.side.left'],
    fallback: ['#pb-settings'],
    title: 'Settings',
    text: 'Everything that is the same for the whole animation, by topic: the machine, the spin, features, wins, effects, sound and export. Hover an underlined option for a tip, many with a small demo. “More settings” links jump to related settings, and Fold all tidies a long panel.',
  },
  {
    id: 'search',
    target: ['#top-search'],
    title: 'Search',
    text: 'Cannot find a setting? Search every one by name or by what it does (Ctrl K or /). A result opens the right tab and lights the setting.',
  },
  {
    id: 'bank',
    target: ['#top-bank', '#rail-bank'],
    fallback: ['#pb-assets'],
    title: 'The Asset Bank',
    text: 'Everything you can replace: symbols, coins, particle art, the wheel, the scene (with the pots and jackpot boxes), sounds and fonts (B). In After Effects every piece is its own comp or layer, easy to swap.',
  },
  {
    id: 'export',
    target: ['#top-mp4', '#top-ae'],
    title: 'Take it out',
    text: 'After Effects downloads the project package: comps, replaceable placeholders, effect controls and the sounds. Preview MP4 renders a quick video to share.',
  },
  {
    id: 'finish',
    target: ['#top-project', '#top-presets'],
    title: 'You are set',
    text: 'Start from a preset to see what Reel Studio can do, or carry on with this one. Your work is kept in this browser; the Project menu also saves it as a file.',
    last: true,
  },
];

const PAD = 6;
const GAP = 12;

function visible(node) {
  if (!node || !node.isConnected) return false;
  const r = node.getBoundingClientRect();
  if (r.width < 8 || r.height < 8) return false;
  const cs = getComputedStyle(node);
  return cs.visibility !== 'hidden' && cs.display !== 'none';
}

function targetsOf(step) {
  const find = (sels) => (sels || []).flatMap((sel) => [...document.querySelectorAll(sel)]).filter(visible);
  const nodes = find(step.target);
  return nodes.length ? nodes : find(step.fallback);
}

// The lit box: every target together, padded, kept on screen.
function holeOf(nodes) {
  const rs = nodes.map((n) => n.getBoundingClientRect());
  const x0 = Math.max(4, Math.min(...rs.map((r) => r.left)) - PAD);
  const y0 = Math.max(4, Math.min(...rs.map((r) => r.top)) - PAD);
  const x1 = Math.min(innerWidth - 4, Math.max(...rs.map((r) => r.right)) + PAD);
  const y1 = Math.min(innerHeight - 4, Math.max(...rs.map((r) => r.bottom)) + PAD);
  return { x: x0, y: y0, w: Math.max(0, x1 - x0), h: Math.max(0, y1 - y0) };
}

// The card goes below, above, right or left of the lit box, the first
// place it fits; failing that, at the foot of the lit box.
function placeCard(card, hole) {
  const cw = card.offsetWidth;
  const ch = card.offsetHeight;
  const clampX = (x) => Math.min(innerWidth - cw - 12, Math.max(12, x));
  const clampY = (y) => Math.min(innerHeight - ch - 12, Math.max(12, y));
  const cx = clampX(hole.x + hole.w / 2 - cw / 2);
  const cy = clampY(hole.y);
  const spots = [
    [cx, hole.y + hole.h + GAP, hole.y + hole.h + GAP + ch <= innerHeight - 8],
    [cx, hole.y - GAP - ch, hole.y - GAP - ch >= 8],
    [hole.x + hole.w + GAP, cy, hole.x + hole.w + GAP + cw <= innerWidth - 8],
    [hole.x - GAP - cw, cy, hole.x - GAP - cw >= 8],
  ];
  const fit = spots.find((s) => s[2]);
  const [x, y] = fit || [cx, clampY(hole.y + hole.h - ch - 16)];
  card.style.left = `${Math.round(x)}px`;
  card.style.top = `${Math.round(y)}px`;
}

// Runs the tour. onPresets opens the presets gallery; onClose(how) is told
// whether it was finished or skipped.
export function runGuide({ steps = GUIDE_STEPS, onPresets, onClose } = {}) {
  const shown = steps.filter((s) => !s.target || targetsOf(s).length);
  const before = document.activeElement;
  let at = 0;
  const hole = h('div', { class: 'guide-hole' });
  const card = h('div', { class: 'guide-card', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'guide-title', 'aria-describedby': 'guide-text' });
  const back = h('div', { class: 'guide', id: 'guide' }, hole, card);

  const close = (how) => {
    if (!back.isConnected) return;
    back.remove();
    document.removeEventListener('keydown', onKey, true);
    removeEventListener('resize', place);
    if (before?.isConnected) before.focus({ preventScroll: true });
    onClose?.(how);
  };
  const go = (i) => {
    at = Math.min(shown.length - 1, Math.max(0, i));
    render();
  };
  function place() {
    const step = shown[at];
    const nodes = targetsOf(step);
    back.classList.toggle('bare', !nodes.length);
    if (!nodes.length) {
      card.style.left = `${Math.round((innerWidth - card.offsetWidth) / 2)}px`;
      card.style.top = `${Math.round(Math.max(12, (innerHeight - card.offsetHeight) / 2.4))}px`;
      return;
    }
    const r = holeOf(nodes);
    Object.assign(hole.style, { left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px` });
    placeCard(card, r);
  }
  function render() {
    const step = shown[at];
    const first = at === 0;
    const last = at === shown.length - 1;
    targetsOf(step)[0]?.scrollIntoView({ block: 'nearest' });
    const dots = h('div', { class: 'guide-dots', 'aria-hidden': 'true' }, shown.map((_, i) => h('span', { class: i === at ? 'on' : i < at ? 'done' : '' })));
    const actions = first
      ? [button('Skip', () => close('skipped'), { class: 'btn small ghost', id: 'guide-skip' }), button('Start from a preset', () => { close('presets'); onPresets?.(); }, { class: 'btn small', id: 'guide-presets' }), button('Show me around', () => go(1), { class: 'btn small primary', id: 'guide-next' })]
      : last
        ? [button('Back', () => go(at - 1), { class: 'btn small ghost', id: 'guide-back' }), button('Start from a preset', () => { close('presets'); onPresets?.(); }, { class: 'btn small', id: 'guide-presets' }), button('Done', () => close('done'), { class: 'btn small primary', id: 'guide-next' })]
        : [button('Skip', () => close('skipped'), { class: 'btn small ghost', id: 'guide-skip' }), button('Back', () => go(at - 1), { class: 'btn small ghost', id: 'guide-back' }), button('Next', () => go(at + 1), { class: 'btn small primary', id: 'guide-next' }, icon('arrow'))];
    clear(
      card,
      h('div', { class: 'guide-head' }, h('span', { class: 'guide-count' }, first ? 'First run guide' : `${at} of ${shown.length - 1}`), button('', () => close('skipped'), { class: 'icon-btn tiny', icon: 'x', id: 'guide-close', title: 'Close the tour (Esc)' })),
      h('h2', { id: 'guide-title' }, step.title),
      h('p', { id: 'guide-text' }, step.text),
      first || last ? h('p', { class: 'guide-again' }, GUIDE_AGAIN) : null,
      dots,
      h('div', { class: 'guide-actions' }, actions)
    );
    // Measured after the card has its text.
    requestAnimationFrame(() => {
      place();
      card.querySelector('#guide-next')?.focus({ preventScroll: true });
    });
  }
  // Keys stay in the tour: arrows and Enter move, Esc closes, Tab stays
  // in the card, and the editor's own shortcuts wait.
  function onKey(e) {
    e.stopPropagation();
    if (e.key === 'Escape') close('skipped');
    else if (e.key === 'ArrowRight' && at < shown.length - 1) go(at + 1);
    else if (e.key === 'ArrowLeft' && at > 0) go(at - 1);
    else if (e.key === 'Tab') {
      const items = [...card.querySelectorAll('button')];
      const i = items.indexOf(document.activeElement);
      items[(i + (e.shiftKey ? -1 : 1) + items.length) % items.length]?.focus();
    } else return;
    e.preventDefault();
  }
  document.body.append(back);
  document.addEventListener('keydown', onKey, true);
  addEventListener('resize', place);
  render();
  return { close: () => close('closed'), get step() { return shown[at]?.id; } };
}
