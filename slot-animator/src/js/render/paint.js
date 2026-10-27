// Built-in sample art, painted with Canvas 2D at 512 px so it stays crisp
// at any cell size. These stand in until real slot assets are uploaded.

export const METALS = {
  gold: ['#fff7cf', '#ffd86b', '#c98a17', '#ffe9a3', '#b06f0d', '#5c3500'],
  chrome: ['#ffffff', '#dfe4ec', '#8d97a6', '#f4f7fb', '#6b7686', '#2b323c'],
  neon: ['#e8ffff', '#7ff6ff', '#14b8d6', '#bafcff', '#0c7fa8', '#063247'],
  rose: ['#fff0f6', '#ff9ccf', '#c2186b', '#ffd1e8', '#8f0d4f', '#3d0020'],
  violet: ['#f6efff', '#c9a2ff', '#6f2bd6', '#e4d1ff', '#4a1499', '#1c0642'],
};

export function metalGradient(ctx, x0, y0, x1, y1, metal = 'gold') {
  const s = METALS[metal] || METALS.gold;
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  [0, 0.2, 0.42, 0.56, 0.78, 1].forEach((p, i) => g.addColorStop(p, s[i]));
  return g;
}

export function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

export function starPath(ctx, cx, cy, outer, inner, points = 5, rot = -Math.PI / 2) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 ? inner : outer;
    const a = rot + (i * Math.PI) / points;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    if (i) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
  }
  ctx.closePath();
}

export function sparkle(ctx, x, y, r, alpha = 1, color = '#ffffff') {
  ctx.save();
  ctx.globalAlpha *= alpha;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color);
  g.addColorStop(0.25, color);
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.quadraticCurveTo(x, y, x, y + r);
  ctx.quadraticCurveTo(x, y, x - r, y);
  ctx.quadraticCurveTo(x, y, x, y - r);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x, y, r * 0.18, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function gloss(ctx, path, x, y, w, h, alpha = 0.45) {
  ctx.save();
  path();
  ctx.clip();
  const g = ctx.createLinearGradient(0, y, 0, y + h * 0.55);
  g.addColorStop(0, `rgba(255,255,255,${alpha})`);
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(x + w * 0.5, y + h * 0.12, w * 0.62, h * 0.42, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function layered(ctx, path, { fill, outline = '#1a0a02', rim, rimWidth = 22, outlineWidth = 40, shadow = true }) {
  if (shadow) {
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = 26;
    ctx.shadowOffsetY = 14;
    path();
    ctx.fillStyle = '#000';
    ctx.fill();
    ctx.restore();
  }
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  path();
  ctx.lineWidth = outlineWidth;
  ctx.strokeStyle = outline;
  ctx.stroke();
  if (rim) {
    path();
    ctx.lineWidth = rimWidth;
    ctx.strokeStyle = rim;
    ctx.stroke();
  }
  path();
  ctx.fillStyle = fill;
  ctx.fill();
}

function facetGem(ctx, polys, shades, outline) {
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 26;
  ctx.shadowOffsetY = 14;
  ctx.beginPath();
  const hull = polys.hull;
  hull.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  ctx.fillStyle = '#000';
  ctx.fill();
  ctx.restore();
  ctx.lineJoin = 'round';
  ctx.beginPath();
  hull.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  ctx.lineWidth = 30;
  ctx.strokeStyle = outline;
  ctx.stroke();
  polys.faces.forEach((face, i) => {
    ctx.beginPath();
    face.forEach(([x, y], j) => (j ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.fillStyle = shades[i % shades.length];
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.stroke();
  });
  ctx.beginPath();
  hull.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  ctx.lineWidth = 6;
  ctx.strokeStyle = 'rgba(255,255,255,0.75)';
  ctx.stroke();
}

const PAINTERS = {
  seven(ctx) {
    const path = () => {
      ctx.beginPath();
      ctx.moveTo(-160, -200);
      ctx.lineTo(170, -200);
      ctx.lineTo(170, -128);
      ctx.bezierCurveTo(70, -40, 10, 60, -2, 205);
      ctx.lineTo(-118, 205);
      ctx.bezierCurveTo(-100, 60, -20, -40, 52, -112);
      ctx.lineTo(-160, -112);
      ctx.closePath();
    };
    const fill = ctx.createLinearGradient(0, -200, 0, 205);
    fill.addColorStop(0, '#ff8a7a');
    fill.addColorStop(0.45, '#ff1a2d');
    fill.addColorStop(0.5, '#d4001a');
    fill.addColorStop(1, '#6a0010');
    layered(ctx, path, { fill, rim: metalGradient(ctx, 0, -220, 0, 220, 'gold'), rimWidth: 30, outlineWidth: 52, outline: '#2a0404' });
    gloss(ctx, path, -160, -200, 330, 405, 0.55);
    sparkle(ctx, 150, -205, 70, 0.9);
  },
  bar(ctx, font) {
    const path = () => roundRect(ctx, -220, -100, 440, 200, 46);
    const fill = ctx.createLinearGradient(0, -100, 0, 100);
    fill.addColorStop(0, '#3a3a46');
    fill.addColorStop(0.5, '#121218');
    fill.addColorStop(1, '#000000');
    layered(ctx, path, { fill, rim: metalGradient(ctx, 0, -110, 0, 110, 'gold'), rimWidth: 26, outlineWidth: 44, outline: '#1a0e02' });
    ctx.save();
    ctx.font = `150px ${font}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 18;
    ctx.strokeStyle = '#3a1d00';
    ctx.strokeText('BAR', 0, 8);
    ctx.fillStyle = metalGradient(ctx, 0, -70, 0, 80, 'gold');
    ctx.fillText('BAR', 0, 8);
    ctx.restore();
    gloss(ctx, path, -220, -100, 440, 200, 0.28);
  },
  bell(ctx) {
    const path = () => {
      ctx.beginPath();
      ctx.moveTo(0, -170);
      ctx.bezierCurveTo(112, -170, 138, -64, 142, 38);
      ctx.bezierCurveTo(146, 98, 176, 124, 206, 146);
      ctx.bezierCurveTo(218, 162, 206, 178, 186, 178);
      ctx.lineTo(-186, 178);
      ctx.bezierCurveTo(-206, 178, -218, 162, -206, 146);
      ctx.bezierCurveTo(-176, 124, -146, 98, -142, 38);
      ctx.bezierCurveTo(-138, -64, -112, -170, 0, -170);
      ctx.closePath();
    };
    const knob = () => {
      ctx.beginPath();
      ctx.arc(0, -184, 30, 0, Math.PI * 2);
    };
    const clap = () => {
      ctx.beginPath();
      ctx.arc(0, 204, 40, 0, Math.PI * 2);
    };
    const radial = (x, y, r) => {
      const g = ctx.createRadialGradient(x - r * 0.4, y - r * 0.5, r * 0.05, x, y, r * 1.2);
      g.addColorStop(0, '#fffbe0');
      g.addColorStop(0.3, '#ffd65a');
      g.addColorStop(0.7, '#c27f0e');
      g.addColorStop(1, '#5a3300');
      return g;
    };
    layered(ctx, clap, { fill: radial(0, 204, 40), outlineWidth: 30 });
    layered(ctx, knob, { fill: radial(0, -184, 30), outlineWidth: 30 });
    layered(ctx, path, { fill: radial(-20, -20, 230), outlineWidth: 40 });
    ctx.save();
    path();
    ctx.clip();
    const band = ctx.createLinearGradient(0, 130, 0, 180);
    band.addColorStop(0, 'rgba(120,60,0,0.0)');
    band.addColorStop(0.4, 'rgba(120,60,0,0.55)');
    band.addColorStop(1, 'rgba(60,30,0,0.8)');
    ctx.fillStyle = band;
    ctx.fillRect(-220, 120, 440, 60);
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.beginPath();
    ctx.ellipse(-72, -40, 22, 105, 0.12, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    sparkle(ctx, -88, -120, 60, 0.9);
  },
  cherry(ctx) {
    const cherry = (x, y, r) => () => {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
    };
    const red = (x, y, r) => {
      const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.05, x, y, r * 1.05);
      g.addColorStop(0, '#ffb3b3');
      g.addColorStop(0.25, '#ff2a3d');
      g.addColorStop(0.75, '#a3001d');
      g.addColorStop(1, '#4d000c');
      return g;
    };
    ctx.lineCap = 'round';
    const stems = () => {
      ctx.beginPath();
      ctx.moveTo(-92, 40);
      ctx.bezierCurveTo(-70, -60, -10, -140, 40, -190);
      ctx.moveTo(98, 70);
      ctx.bezierCurveTo(100, -30, 70, -120, 40, -190);
    };
    stems();
    ctx.lineWidth = 34;
    ctx.strokeStyle = '#102806';
    ctx.stroke();
    stems();
    ctx.lineWidth = 18;
    ctx.strokeStyle = '#5fae2e';
    ctx.stroke();
    const leaf = () => {
      ctx.beginPath();
      ctx.moveTo(40, -190);
      ctx.bezierCurveTo(110, -250, 210, -220, 230, -170);
      ctx.bezierCurveTo(170, -120, 90, -130, 40, -190);
      ctx.closePath();
    };
    const lg = ctx.createLinearGradient(40, -240, 230, -140);
    lg.addColorStop(0, '#b6f26a');
    lg.addColorStop(1, '#2f7d1d');
    layered(ctx, leaf, { fill: lg, outlineWidth: 24, outline: '#0f2405', shadow: false });
    ctx.beginPath();
    ctx.moveTo(52, -186);
    ctx.quadraticCurveTo(140, -200, 214, -172);
    ctx.lineWidth = 5;
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.stroke();
    layered(ctx, cherry(-100, 110, 102), { fill: red(-100, 110, 102), outlineWidth: 34, outline: '#2a0006' });
    layered(ctx, cherry(104, 128, 98), { fill: red(104, 128, 98), outlineWidth: 34, outline: '#2a0006' });
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.beginPath();
    ctx.ellipse(-138, 64, 22, 34, -0.6, 0, Math.PI * 2);
    ctx.ellipse(66, 84, 20, 32, -0.6, 0, Math.PI * 2);
    ctx.fill();
  },
  diamond(ctx) {
    const top = -150;
    const gird = -55;
    const hull = [[-120, top], [120, top], [205, gird], [0, 205], [-205, gird]];
    const T = [-120, -40, 40, 120];
    const G = [-205, -102, 0, 102, 205];
    const faces = [];
    faces.push([[T[0], top], [G[1], gird], [G[0], gird]]);
    faces.push([[T[0], top], [T[1], top], [G[1], gird]]);
    faces.push([[T[1], top], [G[2], gird], [G[1], gird]]);
    faces.push([[T[1], top], [T[2], top], [G[2], gird]]);
    faces.push([[T[2], top], [G[3], gird], [G[2], gird]]);
    faces.push([[T[2], top], [T[3], top], [G[3], gird]]);
    faces.push([[T[3], top], [G[4], gird], [G[3], gird]]);
    for (let i = 0; i < 4; i++) faces.push([[G[i], gird], [G[i + 1], gird], [0, 205]]);
    const shades = ['#bff6ff', '#58d8ff', '#e9fdff', '#1fa8e8', '#9eefff', '#46c6f5', '#d8fbff', '#2b9fe0', '#7fe3ff', '#1677c9', '#5fd0ff'];
    facetGem(ctx, { hull, faces }, shades, '#04203a');
    sparkle(ctx, -70, -120, 80, 1);
    sparkle(ctx, 120, 10, 46, 0.8);
  },
  emerald(ctx) {
    const o = [[-110, -200], [110, -200], [170, -140], [170, 140], [110, 200], [-110, 200], [-170, 140], [-170, -140]];
    const i = [[-62, -120], [62, -120], [92, -90], [92, 90], [62, 120], [-62, 120], [-92, 90], [-92, -90]];
    const faces = [];
    for (let k = 0; k < 8; k++) {
      const k2 = (k + 1) % 8;
      faces.push([o[k], o[k2], i[k2], i[k]]);
    }
    faces.push(i);
    const shades = ['#7dffbc', '#16b866', '#0b7a43', '#2fd884', '#0a5e34', '#14a35b', '#5cf0a8', '#1bc673', '#3fe596'];
    facetGem(ctx, { hull: o, faces }, shades, '#02210f');
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(-62, -120);
    ctx.lineTo(20, -120);
    ctx.lineTo(-92, 40);
    ctx.lineTo(-92, -90);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    sparkle(ctx, 70, -150, 70, 1);
  },
  ruby(ctx) {
    const R = 215;
    const r = 110;
    const outer = [];
    const inner = [];
    for (let k = 0; k < 8; k++) {
      const a = -Math.PI / 2 + (k * Math.PI) / 4 + Math.PI / 8;
      outer.push([Math.cos(a) * R, Math.sin(a) * R]);
      const b = -Math.PI / 2 + (k * Math.PI) / 4;
      inner.push([Math.cos(b) * r, Math.sin(b) * r]);
    }
    const faces = [];
    for (let k = 0; k < 8; k++) {
      const k2 = (k + 1) % 8;
      faces.push([outer[k], inner[k2], inner[k]]);
      faces.push([outer[k], outer[k2], inner[k2]]);
    }
    faces.push(inner);
    const shades = ['#ff5a7a', '#b0002c', '#ff9db1', '#7a001d', '#ff2d55', '#d1003a', '#ff7f98', '#91001f', '#ff3d63', '#c20034', '#ffb3c2', '#6b0018', '#ff4d6e', '#a8002a', '#ff8aa1', '#850020', '#e8163f'];
    facetGem(ctx, { hull: outer, faces }, shades, '#2a0010');
    sparkle(ctx, -60, -120, 78, 1);
  },
  crown(ctx) {
    const body = () => {
      ctx.beginPath();
      ctx.moveTo(-190, 70);
      ctx.lineTo(-215, -110);
      ctx.lineTo(-108, -18);
      ctx.lineTo(0, -168);
      ctx.lineTo(108, -18);
      ctx.lineTo(215, -110);
      ctx.lineTo(190, 70);
      ctx.closePath();
    };
    const band = () => roundRect(ctx, -200, 60, 400, 100, 22);
    const g = metalGradient(ctx, 0, -170, 0, 170, 'gold');
    layered(ctx, body, { fill: g, outlineWidth: 40, outline: '#2a1600' });
    layered(ctx, band, { fill: metalGradient(ctx, 0, 60, 0, 160, 'gold'), outlineWidth: 36, outline: '#2a1600' });
    const balls = [[-215, -110], [0, -168], [215, -110]];
    for (const [x, y] of balls) {
      const ball = () => {
        ctx.beginPath();
        ctx.arc(x, y, 26, 0, Math.PI * 2);
      };
      const bg = ctx.createRadialGradient(x - 8, y - 10, 2, x, y, 30);
      bg.addColorStop(0, '#ffffff');
      bg.addColorStop(0.4, '#ffe28a');
      bg.addColorStop(1, '#9a5d00');
      layered(ctx, ball, { fill: bg, outlineWidth: 22, outline: '#2a1600', shadow: false });
    }
    const jewels = [[-120, 110, '#ff2d55'], [0, 110, '#2fb4ff'], [120, 110, '#2fd884']];
    for (const [x, y, c] of jewels) {
      const jg = ctx.createRadialGradient(x - 10, y - 12, 2, x, y, 40);
      jg.addColorStop(0, '#ffffff');
      jg.addColorStop(0.35, c);
      jg.addColorStop(1, '#100010');
      ctx.fillStyle = jg;
      ctx.beginPath();
      ctx.ellipse(x, y, 34, 30, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 6;
      ctx.strokeStyle = '#5a3300';
      ctx.stroke();
    }
    const jg = ctx.createRadialGradient(-6, -60, 2, 0, -50, 40);
    jg.addColorStop(0, '#ffffff');
    jg.addColorStop(0.35, '#c06bff');
    jg.addColorStop(1, '#1a0030');
    ctx.fillStyle = jg;
    ctx.beginPath();
    ctx.moveTo(0, -95);
    ctx.lineTo(32, -50);
    ctx.lineTo(0, -5);
    ctx.lineTo(-32, -50);
    ctx.closePath();
    ctx.fill();
    gloss(ctx, body, -200, -170, 400, 240, 0.35);
    sparkle(ctx, 0, -168, 64, 0.9);
  },
  wild(ctx, font) {
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 30;
    ctx.shadowOffsetY = 14;
    starPath(ctx, 0, 0, 236, 150, 12, -Math.PI / 2);
    ctx.fillStyle = '#000';
    ctx.fill();
    ctx.restore();
    starPath(ctx, 0, 0, 236, 150, 12, -Math.PI / 2);
    ctx.lineJoin = 'round';
    ctx.lineWidth = 26;
    ctx.strokeStyle = '#2a0a3a';
    ctx.stroke();
    ctx.fillStyle = metalGradient(ctx, 0, -236, 0, 236, 'gold');
    ctx.fill();
    const disc = ctx.createRadialGradient(-50, -70, 10, 0, 0, 190);
    disc.addColorStop(0, '#e2a6ff');
    disc.addColorStop(0.45, '#8a1ee0');
    disc.addColorStop(1, '#2c0057');
    ctx.beginPath();
    ctx.arc(0, 0, 172, 0, Math.PI * 2);
    ctx.fillStyle = disc;
    ctx.fill();
    ctx.lineWidth = 12;
    ctx.strokeStyle = '#3d0a5c';
    ctx.stroke();
    ctx.font = `128px ${font}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.save();
    ctx.rotate(-0.12);
    ctx.lineWidth = 26;
    ctx.strokeStyle = '#25003d';
    ctx.strokeText('WILD', 0, 10);
    ctx.lineWidth = 10;
    ctx.strokeStyle = metalGradient(ctx, 0, -60, 0, 70, 'gold');
    ctx.strokeText('WILD', 0, 10);
    const tg = ctx.createLinearGradient(0, -50, 0, 70);
    tg.addColorStop(0, '#ffffff');
    tg.addColorStop(0.45, '#fff0a8');
    tg.addColorStop(0.55, '#ffc437');
    tg.addColorStop(1, '#ff8a00');
    ctx.fillStyle = tg;
    ctx.fillText('WILD', 0, 10);
    ctx.restore();
    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, 172, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.beginPath();
    ctx.ellipse(0, -120, 190, 110, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    sparkle(ctx, 150, -150, 76, 1);
  },
  scatter(ctx, font) {
    const glow = ctx.createRadialGradient(0, -20, 10, 0, -20, 250);
    glow.addColorStop(0, 'rgba(255,220,120,0.9)');
    glow.addColorStop(0.5, 'rgba(255,120,40,0.35)');
    glow.addColorStop(1, 'rgba(255,80,0,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(-256, -256, 512, 512);
    const star = () => starPath(ctx, 0, -30, 220, 92, 5);
    const sg = ctx.createRadialGradient(-30, -90, 10, 0, -30, 240);
    sg.addColorStop(0, '#fffbe6');
    sg.addColorStop(0.35, '#ffd447');
    sg.addColorStop(0.75, '#ff8a00');
    sg.addColorStop(1, '#a33a00');
    layered(ctx, star, { fill: sg, rim: metalGradient(ctx, 0, -250, 0, 200, 'gold'), rimWidth: 18, outlineWidth: 38, outline: '#3a1200' });
    ctx.save();
    star();
    ctx.clip();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath();
    ctx.moveTo(0, -250);
    ctx.lineTo(60, -30);
    ctx.lineTo(-60, -30);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    const ribbon = () => roundRect(ctx, -236, 104, 472, 104, 30);
    const rg = ctx.createLinearGradient(0, 104, 0, 208);
    rg.addColorStop(0, '#ff5a7a');
    rg.addColorStop(0.5, '#c4002d');
    rg.addColorStop(1, '#5c0014');
    layered(ctx, ribbon, { fill: rg, rim: metalGradient(ctx, 0, 100, 0, 210, 'gold'), rimWidth: 14, outlineWidth: 30, outline: '#2a0008' });
    ctx.font = `72px ${font}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 14;
    ctx.strokeStyle = '#3a0010';
    ctx.strokeText('SCATTER', 0, 160);
    ctx.fillStyle = metalGradient(ctx, 0, 125, 0, 195, 'gold');
    ctx.fillText('SCATTER', 0, 160);
    sparkle(ctx, 120, -190, 70, 1);
    sparkle(ctx, -150, -60, 40, 0.8);
  },
};

export const BUILTIN_KEYS = Object.keys(PAINTERS);

export function paintBuiltin(key, size = 512, font = 'Bungee, "Arial Black", Impact, sans-serif') {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');
  ctx.translate(size / 2, size / 2);
  ctx.scale(size / 512 * 0.94, size / 512 * 0.94);
  (PAINTERS[key] || PAINTERS.seven)(ctx, font);
  return c;
}
