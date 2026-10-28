// A small stand-in for the After Effects scripting DOM: enough to run the
// generated .jsx end to end and inspect the layers, keys and expressions it
// creates. It throws on matchNames the exporter is not expected to use.

const KNOWN_MATCH = new Set([
  'ADBE Transform Group', 'ADBE Position', 'ADBE Position_0', 'ADBE Position_1', 'ADBE Scale', 'ADBE Rotate Z', 'ADBE Opacity', 'ADBE Anchor Point',
  'ADBE Effect Parade', 'ADBE Slider Control', 'ADBE Motion Blur', 'ADBE Glo2', 'ADBE Drop Shadow', 'CC Light Sweep',
  'ADBE Time Remapping', 'ADBE Text Properties', 'ADBE Text Document',
  'ADBE Root Vectors Group', 'ADBE Vector Group', 'ADBE Vectors Group', 'ADBE Vector Shape - Group', 'ADBE Vector Shape',
  'ADBE Vector Shape - Rect', 'ADBE Vector Rect Size', 'ADBE Vector Rect Position', 'ADBE Vector Rect Roundness',
  'ADBE Vector Shape - Ellipse', 'ADBE Vector Ellipse Size', 'ADBE Vector Ellipse Position',
  'ADBE Vector Graphic - Stroke', 'ADBE Vector Stroke Color', 'ADBE Vector Stroke Width', 'ADBE Vector Stroke Line Cap', 'ADBE Vector Stroke Line Join',
  'ADBE Vector Graphic - Fill', 'ADBE Vector Fill Color', 'ADBE Vector Fill Opacity',
  'ADBE Vector Filter - Trim', 'ADBE Vector Trim End',
  'ADBE Drop Shadow-0002', 'ADBE Drop Shadow-0004', 'ADBE Drop Shadow-0005',
]);

export function createAE({ files = new Set(), fileName = '/pkg/slot.jsx' } = {}) {
  const log = { comps: [], expressions: [], keys: [], alerts: [], imports: [] };

  class Prop {
    constructor(name, layer) {
      this.name = name;
      this.matchName = name;
      this.layer = layer;
      this.children = [];
      this._value = name === 'ADBE Position' || name === 'ADBE Anchor Point' ? [0, 0] : name === 'ADBE Scale' ? [100, 100] : name === 'ADBE Text Document' ? { fontSize: 0 } : 0;
      this.keys = [];
      this._expr = '';
    }
    get value() {
      return this._value;
    }
    set expression(e) {
      this._expr = e;
      log.expressions.push({ layer: this.layer?.name, comp: this.layer?.comp?.name, prop: this.name, expr: e, ref: this });
    }
    get expression() {
      return this._expr;
    }
    get numKeys() {
      return this.keys.length;
    }
    property(n) {
      if (typeof n === 'number') {
        if (!this.children[n - 1]) this.children[n - 1] = new Prop(`${this.name}-${n}`, this.layer);
        return this.children[n - 1];
      }
      if (/^ADBE|^CC /.test(n) && !KNOWN_MATCH.has(n)) throw new Error(`Unknown matchName ${n}`);
      let c = this.children.find((x) => x && x.name === n);
      if (!c) {
        c = new Prop(n, this.layer);
        this.children.push(c);
      }
      return c;
    }
    addProperty(n) {
      if (!KNOWN_MATCH.has(n)) throw new Error(`Unknown matchName ${n}`);
      const c = new Prop(n, this.layer);
      this.children.push(c);
      return c;
    }
    setValue(v) {
      this._value = v;
    }
    setValuesAtTimes(times, vals) {
      if (times.length !== vals.length) throw new Error('times/values length mismatch');
      for (let i = 1; i < times.length; i++) if (!(times[i] > times[i - 1])) throw new Error(`Key times not ascending on ${this.name}: ${times[i - 1]} -> ${times[i]}`);
      this.keys = times.map((t, i) => ({ t, v: vals[i] }));
      log.keys.push({ layer: this.layer?.name, prop: this.name, keys: this.keys, ref: this });
    }
    setInterpolationTypeAtKey(i, a, b) {
      if (!this.keys[i - 1]) throw new Error('No key ' + i);
      this.keys[i - 1].interp = [a, b];
    }
    setTemporalEaseAtKey(i, inE, outE) {
      const k = this.keys[i - 1];
      if (!k) throw new Error('No key ' + i);
      for (const e of [...inE, ...outE]) if (!(e.influence >= 0.1 && e.influence <= 100)) throw new Error(`Bad influence ${e.influence}`);
      k.inEase = inE;
      k.outEase = outE;
    }
    setTemporalContinuousAtKey() {}
    setTemporalAutoBezierAtKey() {}
  }

  class Layer {
    constructor(comp, name, source) {
      this.comp = comp;
      this.name = name;
      this.source = source || null;
      this._in = 0;
      this._out = source && source.duration ? Math.min(comp.duration, source.duration) : comp.duration;
      this._start = 0;
      this.props = new Prop('root', this);
      this.parent = null;
    }
    property(n) {
      return this.props.property(n);
    }
    // Like After Effects: in must stay before out, and moving the start time
    // moves both.
    get inPoint() {
      return this._in;
    }
    set inPoint(v) {
      if (!(v < this._out)) throw new Error(`inPoint ${v} not before outPoint ${this._out} on ${this.name}`);
      this._in = v;
    }
    get outPoint() {
      return this._out;
    }
    set outPoint(v) {
      if (!(v > this._in)) throw new Error(`outPoint ${v} not after inPoint ${this._in} on ${this.name}`);
      this._out = v;
    }
    get startTime() {
      return this._start;
    }
    set startTime(v) {
      const d = v - this._start;
      this._start = v;
      this._in += d;
      this._out += d;
    }
    set timeRemapEnabled(v) {
      this._tr = v;
    }
    get timeRemapEnabled() {
      return this._tr;
    }
    moveToEnd() {}
  }

  class Layers {
    constructor(comp) {
      this.comp = comp;
      this.list = [];
    }
    _push(l) {
      this.list.unshift(l);
      return l;
    }
    add(item) {
      return this._push(new Layer(this.comp, item.name, item));
    }
    addSolid(color, name, w, h) {
      if (!(w >= 4 && h >= 4 && w <= 30000 && h <= 30000)) throw new Error(`Bad solid size ${w}x${h}`);
      return this._push(new Layer(this.comp, name, { width: w, height: h }));
    }
    addNull(d) {
      return this._push(new Layer(this.comp, 'Null', { width: 100, height: 100, duration: d }));
    }
    addShape() {
      return this._push(new Layer(this.comp, 'Shape', null));
    }
    addText(t) {
      const l = new Layer(this.comp, 'Text', null);
      l.text = t;
      return this._push(l);
    }
  }

  class Comp {
    constructor(name, w, h, par, dur, fps) {
      if (!(w >= 4 && h >= 4 && w <= 30000 && h <= 30000)) throw new Error(`Bad comp size ${w}x${h}`);
      if (!(dur > 0 && dur <= 10800)) throw new Error(`Bad comp duration ${dur}`);
      this.name = name;
      this.width = w;
      this.height = h;
      this.duration = dur;
      this.frameRate = fps;
      this.frameDuration = 1 / fps;
      this.layers = new Layers(this);
      this.markerProperty = new Prop('markers', null);
      this.markerProperty.setValueAtTime = () => {};
      log.comps.push(this);
    }
    openInViewer() {}
  }

  const items = [];
  const project = {
    items: {
      addFolder: (name) => {
        const f = { name };
        items.push(f);
        return f;
      },
      addComp: (...a) => {
        const c = new Comp(...a);
        items.push(c);
        return c;
      },
    },
    importFile: (io) => {
      const p = io.file.fsName;
      log.imports.push(p);
      const f = { name: p.split('/').pop(), width: 512, height: 512, duration: 0 };
      items.push(f);
      return f;
    },
    get numItems() {
      return items.length;
    },
    item: (i) => items[i - 1],
  };

  class File {
    constructor(p) {
      this.fsName = p;
    }
    get parent() {
      return new File(this.fsName.split('/').slice(0, -1).join('/'));
    }
    get exists() {
      return files.has(this.fsName);
    }
  }

  const env = {
    app: { project, beginUndoGroup() {}, endUndoGroup() {}, newProject() {} },
    File,
    ImportOptions: function ImportOptions(f) {
      this.file = f;
    },
    KeyframeEase: function KeyframeEase(speed, influence) {
      this.speed = speed;
      this.influence = influence;
    },
    KeyframeInterpolationType: { BEZIER: 6613, HOLD: 6614, LINEAR: 6612 },
    BlendingMode: { ADD: 'add', SCREEN: 'screen', NORMAL: 'normal' },
    ParagraphJustification: { CENTER_JUSTIFY: 'center' },
    Shape: function Shape() {},
    MarkerValue: function MarkerValue(c) {
      this.comment = c;
    },
    alert: (m) => log.alerts.push(String(m)),
    $: { fileName },
  };
  return { env, log };
}

export function runScript(src, env) {
  const names = Object.keys(env);
  const fn = new Function(...names, `"use strict";\n${src}`);
  fn(...names.map((n) => env[n]));
}
