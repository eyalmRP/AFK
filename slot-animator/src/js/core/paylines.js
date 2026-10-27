// Payline generator for any reel x row grid. Lines are arrays of row
// indices, one per reel (row 0 = top). Order follows the convention most
// video slots use: straight lines (middle first), then V shapes, zigzags,
// W shapes and steps.

const range = (n) => Array.from({ length: n }, (_, i) => i);

function tri(c, n) {
  if (n <= 1) return 0;
  return 1 - Math.abs((2 * c) / (n - 1) - 1);
}

export function generatePaylines(reels, rows, max = 25) {
  const lines = [];
  const seen = new Set();
  const add = (line) => {
    if (line.length !== reels || line.some((r) => r < 0 || r >= rows)) return;
    const k = line.join(',');
    if (seen.has(k)) return;
    seen.add(k);
    lines.push(line);
  };
  const mid = Math.floor((rows - 1) / 2);
  [mid, 0, rows - 1, ...range(rows)].forEach((r) => add(range(reels).map(() => r)));
  if (rows > 1 && reels > 1) {
    const pairs = [];
    pairs.push([0, rows - 1], [rows - 1, 0]);
    for (let a = 0; a < rows; a++) for (let b = 0; b < rows; b++) if (a !== b) pairs.push([a, b]);
    // V shapes: start at row a on the outside reels, dip to row b in the middle.
    for (const [a, b] of pairs) add(range(reels).map((c) => Math.round(a + (b - a) * tri(c, reels))));
    // Zigzags between neighbouring rows.
    for (let a = 0; a < rows - 1; a++) {
      add(range(reels).map((c) => (c % 2 ? a + 1 : a)));
      add(range(reels).map((c) => (c % 2 ? a : a + 1)));
    }
    // W shapes: two V periods.
    for (const [a, b] of pairs) {
      add(range(reels).map((c) => (c % 4 === 0 ? a : c % 4 === 2 ? a : b)));
    }
    // Shallow V across a single row step.
    for (let a = 0; a < rows; a++) {
      for (const d of [1, -1]) {
        add(range(reels).map((c) => (tri(c, reels) > 0.5 ? a + d : a)));
        add(range(reels).map((c) => (tri(c, reels) < 0.5 ? a + d : a)));
      }
    }
    // Steps: first half on one row, second half on another.
    for (const [a, b] of pairs) add(range(reels).map((c) => (c < reels / 2 ? a : b)));
  }
  return lines.slice(0, max);
}

export const LINE_COLORS = [
  '#ffd447', '#ff4f6d', '#3fe0ff', '#7cff6b', '#c77dff', '#ff9f1c', '#2ef2b4', '#ff5fd2',
  '#5c9dff', '#f6ff4f', '#ff7a59', '#9bffea', '#ffb3c7', '#b4ff3f', '#8f8cff', '#ffcf9b',
];

export function lineColor(i) {
  return LINE_COLORS[i % LINE_COLORS.length];
}
