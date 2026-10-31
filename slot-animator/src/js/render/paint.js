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
  // label and ribbon colours: the bonus symbol is the same star, BONUS.
  scatter(ctx, font, label = 'SCATTER', ribbon3 = ['#ff5a7a', '#c4002d', '#5c0014']) {
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
    rg.addColorStop(0, ribbon3[0]);
    rg.addColorStop(0.5, ribbon3[1]);
    rg.addColorStop(1, ribbon3[2]);
    layered(ctx, ribbon, { fill: rg, rim: metalGradient(ctx, 0, 100, 0, 210, 'gold'), rimWidth: 14, outlineWidth: 30, outline: '#2a0008' });
    ctx.font = `72px ${font}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 14;
    ctx.strokeStyle = '#3a0010';
    ctx.strokeText(label, 0, 160);
    ctx.fillStyle = metalGradient(ctx, 0, 125, 0, 195, 'gold');
    ctx.fillText(label, 0, 160);
    sparkle(ctx, 120, -190, 70, 1);
    sparkle(ctx, -150, -60, 40, 0.8);
  },
  bonus(ctx, font) {
    PAINTERS.scatter(ctx, font, 'BONUS', ['#c08cff', '#6a1fd0', '#26074f']);
  },
};


function radial(ctx, x, y, r, stops) {
  const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.05, x, y, r * 1.1);
  stops.forEach((c, i) => g.addColorStop(i / (stops.length - 1), c));
  return g;
}

function shine(ctx, path, x, y, rx, ry, rot = -0.5, a = 0.6) {
  ctx.save();
  path();
  ctx.clip();
  ctx.fillStyle = `rgba(255,255,255,${a})`;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

Object.assign(PAINTERS, {
  candyHeart(ctx) {
    const path = () => {
      ctx.beginPath();
      ctx.moveTo(0, 190);
      ctx.bezierCurveTo(-210, 50, -240, -120, -115, -175);
      ctx.bezierCurveTo(-45, -200, 0, -150, 0, -115);
      ctx.bezierCurveTo(0, -150, 45, -200, 115, -175);
      ctx.bezierCurveTo(240, -120, 210, 50, 0, 190);
      ctx.closePath();
    };
    layered(ctx, path, { fill: radial(ctx, -30, -30, 230, ['#ffd0dc', '#ff3d6e', '#c8002f', '#5c0016']), outline: '#4a0014', outlineWidth: 30 });
    shine(ctx, path, -95, -105, 60, 34, -0.7, 0.7);
    shine(ctx, path, 60, 90, 70, 18, -0.5, 0.18);
    sparkle(ctx, 120, -150, 60, 0.9);
  },
  candyPurple(ctx) {
    const path = () => roundRect(ctx, -190, -190, 380, 380, 95);
    layered(ctx, path, { fill: radial(ctx, -20, -20, 260, ['#f6d3ff', '#c25cff', '#7f1fd1', '#33075c']), outline: '#2a0548', outlineWidth: 30 });
    ctx.save();
    roundRect(ctx, -140, -140, 280, 280, 70);
    ctx.lineWidth = 10;
    ctx.strokeStyle = 'rgba(255,255,255,0.28)';
    ctx.stroke();
    ctx.restore();
    shine(ctx, path, -90, -110, 80, 38, -0.6, 0.6);
    sparkle(ctx, 140, -150, 56, 0.9);
  },
  candyGreen(ctx) {
    const path = () => {
      ctx.beginPath();
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
        const x = Math.cos(a) * 210;
        const y = Math.sin(a) * 210 + 10;
        if (i) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
      }
      ctx.closePath();
    };
    ctx.lineJoin = 'round';
    layered(ctx, path, { fill: radial(ctx, -10, -20, 240, ['#e4ffd0', '#5be04a', '#17a32b', '#06430f']), outline: '#063a10', outlineWidth: 54, rim: '#0f6d1f', rimWidth: 40 });
    shine(ctx, path, -70, -90, 70, 32, -0.6, 0.6);
    sparkle(ctx, 120, -140, 56, 0.9);
  },
  candyBlue(ctx) {
    const path = () => {
      ctx.beginPath();
      ctx.ellipse(0, 0, 225, 165, -0.45, 0, Math.PI * 2);
    };
    layered(ctx, path, { fill: radial(ctx, -30, -30, 240, ['#e2f8ff', '#3fb4ff', '#0d63d6', '#062a6b']), outline: '#041f52', outlineWidth: 30 });
    shine(ctx, path, -80, -70, 80, 34, -0.45, 0.65);
    sparkle(ctx, 140, -120, 56, 0.9);
  },
  banana(ctx) {
    const path = () => {
      ctx.beginPath();
      ctx.moveTo(-205, -95);
      ctx.bezierCurveTo(-160, 150, 140, 215, 235, 40);
      ctx.bezierCurveTo(150, 115, -70, 105, -135, -110);
      ctx.closePath();
    };
    const g = ctx.createLinearGradient(-200, -100, 200, 200);
    g.addColorStop(0, '#fff8b0');
    g.addColorStop(0.45, '#ffd21f');
    g.addColorStop(1, '#c78600');
    layered(ctx, path, { fill: g, outline: '#5a3d00', outlineWidth: 30 });
    ctx.strokeStyle = 'rgba(150,95,0,0.5)';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(-170, -80);
    ctx.bezierCurveTo(-120, 110, 120, 165, 220, 45);
    ctx.stroke();
    ctx.fillStyle = '#4a2c00';
    for (const [x, y] of [[-172, -103], [232, 40]]) {
      ctx.beginPath();
      ctx.arc(x, y, 20, 0, Math.PI * 2);
      ctx.fill();
    }
    shine(ctx, path, -110, -10, 26, 70, -0.5, 0.55);
  },
  grapes(ctx) {
    const pts = [[-110, -60], [0, -75], [110, -60], [-55, 30], [55, 30], [-110, 115], [0, 120], [110, 115], [-55, 200], [55, 200]];
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#3b2a0a';
    ctx.lineWidth = 22;
    ctx.beginPath();
    ctx.moveTo(0, -110);
    ctx.quadraticCurveTo(10, -170, 50, -215);
    ctx.stroke();
    const leaf = () => {
      ctx.beginPath();
      ctx.moveTo(20, -150);
      ctx.bezierCurveTo(80, -240, 190, -220, 215, -160);
      ctx.bezierCurveTo(150, -110, 80, -120, 20, -150);
      ctx.closePath();
    };
    const lg = ctx.createLinearGradient(20, -230, 215, -120);
    lg.addColorStop(0, '#b6f26a');
    lg.addColorStop(1, '#2f7d1d');
    layered(ctx, leaf, { fill: lg, outlineWidth: 22, outline: '#0f2405', shadow: false });
    for (const [x, y] of pts) {
      const b = () => {
        ctx.beginPath();
        ctx.arc(x, y, 64, 0, Math.PI * 2);
      };
      layered(ctx, b, { fill: radial(ctx, x, y, 64, ['#f1c9ff', '#a43ce0', '#5a0f9a', '#22003f']), outline: '#1d0035', outlineWidth: 18, shadow: false });
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.beginPath();
      ctx.ellipse(x - 22, y - 24, 14, 9, -0.6, 0, Math.PI * 2);
      ctx.fill();
    }
  },
  watermelon(ctx) {
    const rind = () => {
      ctx.beginPath();
      ctx.moveTo(-230, -70);
      ctx.arc(0, -70, 230, Math.PI, 0, true);
      ctx.closePath();
    };
    const flesh = () => {
      ctx.beginPath();
      ctx.moveTo(-190, -70);
      ctx.arc(0, -70, 190, Math.PI, 0, true);
      ctx.closePath();
    };
    layered(ctx, rind, { fill: radial(ctx, 0, 40, 230, ['#b8ff8a', '#2fa83a', '#0b5317']), outline: '#06300d', outlineWidth: 30 });
    ctx.fillStyle = '#f4ffe4';
    ctx.beginPath();
    ctx.moveTo(-205, -70);
    ctx.arc(0, -70, 205, Math.PI, 0, true);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = radial(ctx, 0, -10, 190, ['#ffc2c2', '#ff3b4f', '#c8102b']);
    flesh();
    ctx.fill();
    ctx.fillStyle = '#2a0a0a';
    for (const [x, y, a] of [[-90, -30, 0.4], [-20, 20, 0], [60, -20, -0.3], [110, -55, -0.6], [-140, -55, 0.7], [20, 70, 0.1], [-60, 60, 0.3]]) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(a);
      ctx.beginPath();
      ctx.ellipse(0, 0, 10, 18, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    shine(ctx, flesh, -90, -50, 60, 18, -0.2, 0.35);
  },
  apple(ctx) {
    const path = () => {
      ctx.beginPath();
      ctx.moveTo(0, -115);
      ctx.bezierCurveTo(-60, -170, -215, -150, -212, 20);
      ctx.bezierCurveTo(-210, 145, -112, 222, -40, 205);
      ctx.bezierCurveTo(-15, 196, 15, 196, 40, 205);
      ctx.bezierCurveTo(112, 222, 210, 145, 212, 20);
      ctx.bezierCurveTo(215, -150, 60, -170, 0, -115);
      ctx.closePath();
    };
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#3b2a0a';
    ctx.lineWidth = 20;
    ctx.beginPath();
    ctx.moveTo(0, -110);
    ctx.quadraticCurveTo(-5, -170, 25, -215);
    ctx.stroke();
    layered(ctx, path, { fill: radial(ctx, -40, -30, 240, ['#ffc9b8', '#ff3a2a', '#c41010', '#560404']), outline: '#3a0202', outlineWidth: 30 });
    const leaf = () => {
      ctx.beginPath();
      ctx.moveTo(15, -170);
      ctx.bezierCurveTo(60, -240, 170, -235, 190, -185);
      ctx.bezierCurveTo(130, -140, 60, -140, 15, -170);
      ctx.closePath();
    };
    const lg = ctx.createLinearGradient(15, -235, 190, -150);
    lg.addColorStop(0, '#b6f26a');
    lg.addColorStop(1, '#2f7d1d');
    layered(ctx, leaf, { fill: lg, outlineWidth: 20, outline: '#0f2405', shadow: false });
    shine(ctx, path, -110, -50, 34, 70, 0.3, 0.55);
  },
  lollipop(ctx) {
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 20;
    ctx.shadowOffsetY = 10;
    roundRect(ctx, -20, 60, 40, 190, 18);
    ctx.fillStyle = '#fff4fb';
    ctx.fill();
    ctx.restore();
    roundRect(ctx, -20, 60, 40, 190, 18);
    ctx.lineWidth = 8;
    ctx.strokeStyle = '#c86aa4';
    ctx.stroke();
    const disc = () => {
      ctx.beginPath();
      ctx.arc(0, -55, 190, 0, Math.PI * 2);
    };
    layered(ctx, disc, { fill: '#ffffff', outline: '#5a1a52', outlineWidth: 32 });
    ctx.save();
    disc();
    ctx.clip();
    const cols = ['#ff3d8b', '#ffd23f', '#3fd0ff', '#9b4dff', '#45e07a', '#ff7a2e'];
    ctx.lineWidth = 36;
    ctx.lineCap = 'round';
    cols.forEach((col, k) => {
      ctx.strokeStyle = col;
      ctx.beginPath();
      for (let i = 0; i <= 80; i++) {
        const th = (i / 80) * Math.PI * 4 + (k * Math.PI * 2) / cols.length;
        const r = 6 + (i / 80) * 210;
        const x = Math.cos(th) * r;
        const y = -55 + Math.sin(th) * r;
        if (i) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
      }
      ctx.stroke();
    });
    const sh = ctx.createRadialGradient(-60, -120, 10, 0, -55, 200);
    sh.addColorStop(0, 'rgba(255,255,255,0.65)');
    sh.addColorStop(0.5, 'rgba(255,255,255,0.05)');
    sh.addColorStop(1, 'rgba(0,0,0,0.25)');
    ctx.fillStyle = sh;
    ctx.fillRect(-200, -250, 400, 400);
    ctx.restore();
    sparkle(ctx, 120, -190, 64, 1);
  },
  orb(ctx) {
    const glow = ctx.createRadialGradient(0, 0, 60, 0, 0, 256);
    glow.addColorStop(0, 'rgba(255,190,60,0.7)');
    glow.addColorStop(1, 'rgba(255,90,0,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(-256, -256, 512, 512);
    const ball = () => {
      ctx.beginPath();
      ctx.arc(0, 0, 195, 0, Math.PI * 2);
    };
    layered(ctx, ball, { fill: radial(ctx, -20, -30, 200, ['#fff6cf', '#ffc53d', '#ff6a12', '#a01d00', '#3d0800']), rim: metalGradient(ctx, 0, -200, 0, 200, 'gold'), rimWidth: 18, outline: '#2a0700', outlineWidth: 34 });
    ctx.save();
    ball();
    ctx.clip();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = 'rgba(255,240,180,0.35)';
    ctx.lineWidth = 14;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.ellipse(0, 0, 190, 70, (i * Math.PI) / 3, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
    shine(ctx, ball, -70, -90, 70, 40, -0.6, 0.6);
    sparkle(ctx, 120, -140, 70, 1);
  },
});

// Stand-ins for the mystery block and the collector (core/coins.js).
Object.assign(PAINTERS, {
  mystery(ctx, font) {
    const glow = ctx.createRadialGradient(0, 0, 90, 0, 0, 262);
    glow.addColorStop(0, 'rgba(190,120,255,0.75)');
    glow.addColorStop(1, 'rgba(120,40,255,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(-256, -256, 512, 512);
    const box = () => roundRect(ctx, -200, -200, 400, 400, 70);
    layered(ctx, box, { fill: radial(ctx, -20, -30, 220, ['#f3e6ff', '#b47cff', '#6a22d6', '#3a0c8a', '#16033d']), rim: metalGradient(ctx, 0, -210, 0, 210, 'gold'), rimWidth: 22, outline: '#14022e', outlineWidth: 36 });
    roundRect(ctx, -158, -158, 316, 316, 46);
    ctx.lineWidth = 8;
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.stroke();
    ctx.font = `300px ${font}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 34;
    ctx.strokeStyle = '#1c0442';
    ctx.strokeText('?', 0, 22);
    ctx.lineWidth = 12;
    ctx.strokeStyle = metalGradient(ctx, 0, -120, 0, 150, 'gold');
    ctx.strokeText('?', 0, 22);
    const tg = ctx.createLinearGradient(0, -120, 0, 150);
    tg.addColorStop(0, '#ffffff');
    tg.addColorStop(0.5, '#fff0a8');
    tg.addColorStop(1, '#ffb52e');
    ctx.fillStyle = tg;
    ctx.fillText('?', 0, 22);
    shine(ctx, box, -80, -135, 150, 55, -0.3, 0.28);
    sparkle(ctx, 150, -160, 62, 1);
    sparkle(ctx, -150, 140, 40, 0.8);
  },
  collector(ctx, font) {
    const glow = ctx.createRadialGradient(0, 20, 80, 0, 20, 262);
    glow.addColorStop(0, 'rgba(255,210,90,0.7)');
    glow.addColorStop(1, 'rgba(255,150,0,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(-256, -256, 512, 512);
    const sack = ['#fff1c4', '#e8b860', '#b4782a', '#6e4210', '#2e1a04'];
    const bag = () => {
      ctx.beginPath();
      ctx.moveTo(-72, -118);
      ctx.bezierCurveTo(-130, -60, -218, 10, -204, 100);
      ctx.bezierCurveTo(-192, 196, -100, 214, 0, 214);
      ctx.bezierCurveTo(100, 214, 192, 196, 204, 100);
      ctx.bezierCurveTo(218, 10, 130, -60, 72, -118);
      ctx.closePath();
    };
    layered(ctx, bag, { fill: radial(ctx, -30, 40, 230, sack), outline: '#2a1400', outlineWidth: 34 });
    const top = () => {
      ctx.beginPath();
      ctx.moveTo(-72, -118);
      ctx.lineTo(-128, -204);
      ctx.quadraticCurveTo(-62, -176, 0, -222);
      ctx.quadraticCurveTo(62, -176, 128, -204);
      ctx.lineTo(72, -118);
      ctx.closePath();
    };
    layered(ctx, top, { fill: radial(ctx, -20, -170, 120, sack), outline: '#2a1400', outlineWidth: 28 });
    const band = () => roundRect(ctx, -96, -142, 192, 44, 20);
    layered(ctx, band, { fill: metalGradient(ctx, 0, -142, 0, -98, 'gold'), outline: '#2a1400', outlineWidth: 22, shadow: false });
    shine(ctx, bag, -90, -10, 60, 110, 0.3, 0.25);
    ctx.font = `200px ${font}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 30;
    ctx.strokeStyle = '#2a1400';
    ctx.strokeText('$', 0, 52);
    ctx.fillStyle = metalGradient(ctx, 0, -40, 0, 140, 'gold');
    ctx.fillText('$', 0, 52);
    const ribbon = () => roundRect(ctx, -236, 150, 472, 92, 28);
    const rg = ctx.createLinearGradient(0, 150, 0, 242);
    rg.addColorStop(0, '#5aa8ff');
    rg.addColorStop(0.5, '#0b5cd6');
    rg.addColorStop(1, '#03285e');
    layered(ctx, ribbon, { fill: rg, rim: metalGradient(ctx, 0, 146, 0, 246, 'gold'), rimWidth: 14, outlineWidth: 30, outline: '#021430' });
    ctx.font = `64px ${font}`;
    ctx.lineWidth = 14;
    ctx.strokeStyle = '#021430';
    ctx.strokeText('COLLECT', 0, 198);
    ctx.fillStyle = metalGradient(ctx, 0, 165, 0, 230, 'gold');
    ctx.fillText('COLLECT', 0, 198);
    sparkle(ctx, 150, -170, 60, 1);
    sparkle(ctx, -160, -60, 38, 0.8);
  },
});

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

// ---- Pots above the machine ----
// A pot heaped with treasure, on a square canvas centred on the pot (see
// core/pots.js POT_BOX: rim at -0.06, bottom at 0.49, the heap's top at
// -0.44 of the size). Gold: a black cauldron of coins; gems: a deep blue
// pot of jewels; fruits: a copper pot of fruit.
const POT_STYLES = {
  gold: { body: ['#6b7080', '#2c2f3a', '#101118', '#050508'], rim: 'gold', inside: '#120b02', band: 'gold' },
  gems: { body: ['#7fa4ff', '#2a3fa8', '#101d5c', '#050a24'], rim: 'chrome', inside: '#050a20', band: 'violet' },
  fruit: { body: ['#ffb27a', '#c2551d', '#6e2508', '#2a0c02'], rim: 'gold', inside: '#1c0802', band: 'gold' },
};

function seeded(n) {
  let x = n * 9301 + 49297;
  return () => {
    x = (x * 9301 + 49297) % 233280;
    return x / 233280;
  };
}

export function paintPot(art, size = 512) {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');
  ctx.translate(size / 2, size / 2);
  ctx.scale(size / 512, size / 512);
  const st = POT_STYLES[art] || POT_STYLES.gold;
  const rimY = -31;
  const body = () => {
    ctx.beginPath();
    ctx.moveTo(-200, rimY + 6);
    ctx.bezierCurveTo(-262, 40, -262, 170, -160, 236);
    ctx.quadraticCurveTo(0, 262, 160, 236);
    ctx.bezierCurveTo(262, 170, 262, 40, 200, rimY + 6);
    ctx.closePath();
  };
  // Feet, then the body.
  for (const fx of [-150, 150]) {
    ctx.beginPath();
    ctx.moveTo(fx - 34, 222);
    ctx.lineTo(fx + 34, 222);
    ctx.lineTo(fx + 22, 252);
    ctx.lineTo(fx - 22, 252);
    ctx.closePath();
    ctx.fillStyle = '#0a0a0e';
    ctx.fill();
  }
  layered(ctx, body, { fill: radial(ctx, -60, 60, 250, st.body), outline: '#05050a', outlineWidth: 22, shadow: false });
  // A metal band round the belly.
  ctx.save();
  body();
  ctx.clip();
  ctx.fillStyle = metalGradient(ctx, 0, 92, 0, 128, st.band);
  ctx.beginPath();
  ctx.ellipse(0, 40, 300, 92, 0, 0.12, Math.PI - 0.12);
  ctx.ellipse(0, 76, 300, 92, 0, Math.PI - 0.12, 0.12, true);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  shine(ctx, body, -120, 40, 46, 120, 0.25, 0.22);
  // The rim's back half and the dark inside.
  const ring = (y0, y1) => {
    ctx.beginPath();
    ctx.ellipse(0, rimY, 216, 44, 0, y0, y1);
  };
  ctx.lineWidth = 34;
  ctx.strokeStyle = metalGradient(ctx, 0, rimY - 44, 0, rimY + 44, st.rim);
  ring(Math.PI, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = st.inside;
  ctx.beginPath();
  ctx.ellipse(0, rimY, 200, 34, 0, 0, Math.PI * 2);
  ctx.fill();
  // The heap: rows of treasure piled from the rim up.
  const rnd = seeded(art === 'gems' ? 7 : art === 'fruit' ? 13 : 3);
  if (art === 'gems') {
    const gems = ['diamond', 'ruby', 'emerald', 'candyPurple', 'diamond', 'ruby', 'emerald', 'candyBlue', 'diamond'];
    const spots = [[-150, -40, 0.3], [150, -42, 0.3], [-80, -70, 0.34], [80, -74, 0.34], [0, -60, 0.36], [-40, -138, 0.34], [52, -140, 0.33], [-110, -112, 0.28], [6, -190, 0.36]];
    spots.forEach(([x, y, k], i) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate((rnd() - 0.5) * 0.7);
      ctx.scale(k, k);
      PAINTERS[gems[i % gems.length]](ctx);
      ctx.restore();
    });
  } else if (art === 'fruit') {
    const spots = [['banana', -130, -52, 0.34, -0.4], ['apple', 128, -56, 0.34, 0.2], ['watermelon', 0, -66, 0.38, 0], ['grapes', -66, -128, 0.36, -0.2], ['cherry', 78, -134, 0.36, 0.25], ['apple', -8, -186, 0.32, 0.1]];
    for (const [k, x, y, sc, rot] of spots) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rot);
      ctx.scale(sc, sc);
      PAINTERS[k](ctx);
      ctx.restore();
    }
  } else {
    // Gold coins, flat ones in a mound with a few on their edge.
    const coin = (x, y, rx, tilt) => {
      const ry = rx * tilt;
      ctx.beginPath();
      ctx.ellipse(x, y + ry * 0.35, rx, ry, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#7a4a00';
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
      ctx.fillStyle = radial(ctx, x, y, rx, ['#fffbe0', '#ffd75e', '#e39a12', '#9a5a00']);
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#5c3500';
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(x, y, rx * 0.72, ry * 0.72, 0, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,255,255,0.45)';
      ctx.lineWidth = 3;
      ctx.stroke();
    };
    const rows = [[-36, 190, 7], [-70, 160, 6], [-104, 124, 5], [-136, 88, 4], [-166, 54, 3], [-192, 22, 2]];
    for (const [y, half, n] of rows) {
      for (let i = 0; i < n; i++) {
        const x = -half + (n > 1 ? (i / (n - 1)) * half * 2 : half) + (rnd() - 0.5) * 18;
        coin(x, y + (rnd() - 0.5) * 12, 40 + rnd() * 8, 0.42 + rnd() * 0.12);
      }
    }
    // Coins standing on their edge.
    for (const [x, y, rot] of [[-96, -150, -0.35], [104, -128, 0.4], [10, -206, 0.1]]) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rot);
      ctx.beginPath();
      ctx.ellipse(0, 0, 18, 46, 0, 0, Math.PI * 2);
      ctx.fillStyle = metalGradient(ctx, -18, 0, 18, 0, 'gold');
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#5c3500';
      ctx.stroke();
      ctx.restore();
    }
  }
  // The rim's front half over the heap.
  ctx.lineWidth = 46;
  ctx.strokeStyle = '#05050a';
  ring(0, Math.PI);
  ctx.stroke();
  ctx.lineWidth = 32;
  ctx.strokeStyle = metalGradient(ctx, 0, rimY - 10, 0, rimY + 50, st.rim);
  ring(0.02, Math.PI - 0.02);
  ctx.stroke();
  ctx.lineWidth = 6;
  ctx.strokeStyle = 'rgba(255,255,255,0.6)';
  ctx.beginPath();
  ctx.ellipse(0, rimY + 4, 216, 44, 0, 0.35, Math.PI - 0.35);
  ctx.stroke();
  sparkle(ctx, -120, -150, 46, 1);
  sparkle(ctx, 140, -96, 34, 0.9);
  sparkle(ctx, 30, -220, 26, 0.8);
  return c;
}

// ---- Hold & Spin coins and the empty cell ----

const COIN_COLORS = {
  gold: { face: ['#fffbe0', '#ffd75e', '#e39a12', '#9a5a00', '#4a2600'], metal: 'gold', ribbon: ['#ff3b46', '#9a0714'], glow: 'rgba(255,190,60,' },
  fire: { face: ['#ffe9d0', '#ff9a3c', '#e8321a', '#8a0e08', '#3a0402'], metal: 'gold', ribbon: ['#ffe27a', '#c27a00'], glow: 'rgba(255,90,30,' },
  violet: { face: ['#f6ecff', '#c993ff', '#8a3ae0', '#4a1488', '#1c0640'], metal: 'violet', ribbon: ['#ffe27a', '#c27a00'], glow: 'rgba(180,90,255,' },
  aqua: { face: ['#ecfdff', '#8aeaff', '#1fa8e0', '#0a5a8a', '#03243a'], metal: 'neon', ribbon: ['#ff6fc1', '#9a0d55'], glow: 'rgba(60,210,255,' },
  emerald: { face: ['#eafff2', '#86ffb9', '#16b866', '#0a5e34', '#022a14'], metal: 'gold', ribbon: ['#ffe27a', '#c27a00'], glow: 'rgba(60,255,150,' },
  rose: { face: ['#fff2f8', '#ffa6d4', '#e0247a', '#8f0d4f', '#3d0020'], metal: 'rose', ribbon: ['#ffe27a', '#c27a00'], glow: 'rgba(255,90,180,' },
  silver: { face: ['#ffffff', '#eef2f7', '#aab4c4', '#5b6676', '#232a33'], metal: 'chrome', ribbon: ['#3b7bff', '#0a2a80'], glow: 'rgba(200,220,255,' },
};

function sized(size) {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');
  ctx.translate(size / 2, size / 2);
  ctx.scale((size / 512) * 0.94, (size / 512) * 0.94);
  return { c, ctx };
}

// A coin with a metal rim and an embossed face. The value is drawn over it
// at render time; a label (MEGA, SUPER...) rides on a ribbon across the
// lower half, so the value sits a little higher on labelled coins.
export function paintCoinSymbol(size = 512, palette = 'gold', label = '', font = 'Bungee, "Arial Black", Impact, sans-serif') {
  const { c, ctx } = sized(size);
  const P = COIN_COLORS[palette] || COIN_COLORS.gold;
  if (label) {
    const glow = ctx.createRadialGradient(0, 0, 120, 0, 0, 262);
    glow.addColorStop(0, `${P.glow}0.75)`);
    glow.addColorStop(1, `${P.glow}0)`);
    ctx.fillStyle = glow;
    ctx.fillRect(-262, -262, 524, 524);
  }
  const disc = () => {
    ctx.beginPath();
    ctx.arc(0, 0, 205, 0, Math.PI * 2);
  };
  layered(ctx, disc, { fill: radial(ctx, -30, -40, 215, P.face), rim: metalGradient(ctx, 0, -215, 0, 215, P.metal), rimWidth: 30, outline: '#140800', outlineWidth: 34 });
  // Reeded edge and an embossed inner ring.
  ctx.save();
  disc();
  ctx.clip();
  ctx.strokeStyle = 'rgba(0,0,0,0.18)';
  ctx.lineWidth = 3;
  for (let i = 0; i < 72; i++) {
    const a = (i / 72) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * 178, Math.sin(a) * 178);
    ctx.lineTo(Math.cos(a) * 205, Math.sin(a) * 205);
    ctx.stroke();
  }
  // Faint sunburst on the face.
  ctx.globalCompositeOperation = 'soft-light';
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, 170, a, a + Math.PI / 32);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
  ctx.lineWidth = 9;
  ctx.strokeStyle = 'rgba(255,255,255,0.45)';
  ctx.beginPath();
  ctx.arc(0, 0, 166, Math.PI * 0.9, Math.PI * 2.1);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.arc(0, 0, 166, Math.PI * 0.1, Math.PI * 0.9);
  ctx.stroke();
  shine(ctx, disc, -80, -110, 80, 40, -0.6, 0.55);
  sparkle(ctx, 140, -150, 60, 1);
  if (label) {
    const y0 = 70;
    const h = 92;
    const ribbon = () => {
      ctx.beginPath();
      ctx.moveTo(-238, y0 + h * 0.08);
      ctx.lineTo(-206, y0 + h * 0.5);
      ctx.lineTo(-238, y0 + h * 0.92);
      ctx.lineTo(238, y0 + h * 0.92);
      ctx.lineTo(206, y0 + h * 0.5);
      ctx.lineTo(238, y0 + h * 0.08);
      ctx.closePath();
    };
    const g = ctx.createLinearGradient(0, y0, 0, y0 + h);
    g.addColorStop(0, P.ribbon[0]);
    g.addColorStop(1, P.ribbon[1]);
    layered(ctx, ribbon, { fill: g, outline: '#140800', outlineWidth: 16, shadow: true });
    gloss(ctx, ribbon, -238, y0, 476, h, 0.4);
    let px = 64;
    ctx.font = `${px}px ${font}`;
    const w = ctx.measureText(label).width;
    if (w > 380) px = Math.floor((px * 380) / w);
    ctx.font = `${px}px ${font}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = px * 0.22;
    ctx.strokeStyle = '#1a0600';
    ctx.strokeText(label, 0, y0 + h * 0.52);
    ctx.fillStyle = metalGradient(ctx, 0, y0 + h * 0.2, 0, y0 + h * 0.85, 'gold');
    ctx.fillText(label, 0, y0 + h * 0.52);
  }
  return c;
}

// An empty cell: a dark, slightly sunken socket that lets the reel show.
export function paintEmptyCell(size = 512) {
  const { c, ctx } = sized(size);
  const path = () => roundRect(ctx, -236, -236, 472, 472, 70);
  const g = ctx.createRadialGradient(0, -40, 40, 0, 0, 330);
  g.addColorStop(0, 'rgba(255,255,255,0.05)');
  g.addColorStop(1, 'rgba(0,0,0,0.42)');
  path();
  ctx.fillStyle = g;
  ctx.fill();
  ctx.save();
  path();
  ctx.clip();
  ctx.shadowColor = 'rgba(0,0,0,0.75)';
  ctx.shadowBlur = 50;
  ctx.lineWidth = 40;
  ctx.strokeStyle = 'rgba(0,0,0,0.6)';
  path();
  ctx.stroke();
  ctx.restore();
  path();
  ctx.lineWidth = 6;
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.stroke();
  return c;
}
