import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS } from '../src/js/core/defaults.js';
import { buildTimeline } from '../src/js/core/timeline.js';
import { computeLayout } from '../src/js/core/layout.js';
import { aeAssetFiles, buildAEData, buildAEScript, exportFormats, projectForFormat } from '../src/js/core/ae-export.js';
import { FilePack, remapPaths } from '../src/js/core/pack.js';
import { encodeWav } from '../src/js/core/wav.js';
import { createAE, runScript } from './ae-mock.js';

const preset = (id) => PRESETS.find((p) => p.id === id).make();
const TITLE_KEYS = (p) => [...p.tiers.map((t) => t.id), 'total', 'bonus', 'freespins', 'wheel', 'nearmiss', 'grand', 'retrigger', 'holdspin'];

// The data of every format, as the package builder makes it.
function formatsData(project) {
  const tl = buildTimeline(project);
  return exportFormats(project).map((fmt) => {
    const p = projectForFormat(project, fmt);
    return buildAEData(p, tl, computeLayout(p), { assetDir: `assets/${fmt[0]}x${fmt[1]}`, titleKeys: TITLE_KEYS(p), hasBulbs: true, hasLogo: true, sfx: true });
  });
}

const usedFiles = (list) => new Set(list.flatMap((d) => [...aeAssetFiles(d)]));

// Runs the script with exactly these files next to it.
function runWith(list, files) {
  const { env, log } = createAE({ files: new Set([...files].map((f) => `/pkg/${f}`)) });
  runScript(buildAEScript(list), env);
  return { alerts: log.alerts, imports: new Set(log.imports.map((p) => p.replace('/pkg/', ''))) };
}

const ascii = (u8, a, n) => String.fromCharCode(...u8.slice(a, a + n));

test('soundtrack WAV: 16-bit stereo PCM with a valid header, as long as the mix', () => {
  const sr = 48000;
  const n = sr * 2 + 17;
  const left = new Float32Array(n).map((_, i) => Math.sin(i / 20));
  const right = new Float32Array(n).fill(2); // clipped to full scale
  const wav = encodeWav([left, right], sr);
  const v = new DataView(wav.buffer);
  assert.equal(ascii(wav, 0, 4), 'RIFF');
  assert.equal(ascii(wav, 8, 4), 'WAVE');
  assert.equal(ascii(wav, 12, 4), 'fmt ');
  assert.equal(ascii(wav, 36, 4), 'data');
  assert.equal(v.getUint32(16, true), 16);
  assert.equal(v.getUint16(20, true), 1, 'PCM');
  assert.equal(v.getUint16(22, true), 2, 'stereo');
  assert.equal(v.getUint32(24, true), 48000);
  assert.equal(v.getUint32(28, true), 48000 * 4, 'byte rate');
  assert.equal(v.getUint16(32, true), 4, 'block align');
  assert.equal(v.getUint16(34, true), 16, 'bits');
  assert.equal(v.getUint32(40, true), n * 4, 'data length');
  assert.equal(v.getUint32(4, true), 36 + n * 4, 'RIFF length');
  assert.equal(wav.length, 44 + n * 4);
  assert.equal(v.getInt16(44 + 2, true), 0x7fff, 'clipped right sample');
  assert.equal(v.getInt16(44 + 4 * 100, true), Math.trunc(Math.fround(Math.sin(5)) * 0x8000), 'left sample 100, negative');
  // A cue clip: from and to in seconds.
  const clip = encodeWav([left, right], sr, 0.5, 1);
  assert.equal(new DataView(clip.buffer).getUint32(40, true), (sr / 2) * 4);
  assert.equal(encodeWav([left, right], sr, 5, 9).length, 44, 'past the end: empty');
});

test('package files: identical content is stored once and every reference follows it', () => {
  const pack = new FilePack();
  const a = new Uint8Array([1, 2, 3, 4]);
  assert.equal(pack.add('assets/1920x1080/rays.png', a), 'assets/1920x1080/rays.png');
  assert.equal(pack.add('assets/1080x1080/rays.png', a.slice()), 'assets/1920x1080/rays.png');
  assert.equal(pack.add('assets/1080x1080/logo.png', new Uint8Array([1, 2, 3, 5])), 'assets/1080x1080/logo.png', 'same length, other bytes');
  assert.throws(() => pack.add('assets/1080x1080/rays.png', a), /twice/);
  assert.deepEqual([...pack.files.keys()], ['assets/1920x1080/rays.png', 'assets/1080x1080/logo.png']);
  assert.equal(pack.saved, 4);
  const data = { assets: { rays: 'assets/1080x1080/rays.png', titles: { tier1: 'assets/1080x1080/rays.png' } }, list: [['assets/1080x1080/rays.png', 3]], name: 'Rays' };
  assert.deepEqual(remapPaths(data, (p) => pack.resolve(p)), { assets: { rays: 'assets/1920x1080/rays.png', titles: { tier1: 'assets/1920x1080/rays.png' } }, list: [['assets/1920x1080/rays.png', 3]], name: 'Rays' });
});

test('package files: only what the script imports, for slots and the wheel game', () => {
  for (const id of PRESETS.map((p) => p.id)) {
    const list = formatsData(preset(id));
    const used = usedFiles(list);
    const { alerts, imports } = runWith(list, used);
    assert.deepEqual(alerts, [], `${id}: missing files`);
    assert.deepEqual([...used].filter((f) => !imports.has(f)), [], `${id}: files the script never imports`);
  }
  const slot = [...usedFiles(formatsData(preset('ways')))];
  assert.ok(!slot.some((f) => /wheel_/.test(f)), 'a slot with no wheel round ships no wheel art');
  assert.ok([...usedFiles(formatsData(preset('classic')))].some((f) => /wheel_segments/.test(f)), 'one with a wheel bonus does');
  assert.ok(slot.some((f) => /symbols\/symbol_/.test(f)));
  const fruit = [...usedFiles(formatsData(preset('fruit')))];
  assert.ok(!fruit.some((f) => /title_(bonus|freespins|wheel|grand)/.test(f)), 'titles of features the animation does not have stay out');
  const wheel = [...usedFiles(formatsData(preset('wheel')))];
  assert.ok(!wheel.some((f) => /symbols\/|machine_|hud_panel|bulbs_a|logo/.test(f.replace(/wheel_bulbs/, ''))), 'the wheel game ships no symbols or machine art');
  assert.ok(wheel.some((f) => /wheel_segments/.test(f)));
});

test('package files: shared across formats, deduplicated, and the script still finds every file', () => {
  for (const id of ['classic', 'slot-wheel', 'wheel']) {
    const project = preset(id);
    project.output.formats = ['1920x1080', '1080x1920', '1080x1080'];
    const list = formatsData(project);
    // Stand-in bytes: the same art in every format (named alike) is
    // identical, as rays and same-size titles are in a real package.
    const pack = new FilePack();
    for (const f of usedFiles(list)) pack.add(f, new TextEncoder().encode(f.replace(/^assets\/\d+x\d+\//, 'assets/F/')));
    assert.ok(pack.alias.size > 0, `${id}: formats share files`);
    const stored = [...pack.files.values()].map((b) => new TextDecoder().decode(b));
    assert.equal(new Set(stored).size, stored.length, `${id}: no file stored twice`);
    const remapped = list.map((d) => remapPaths(d, (p) => pack.resolve(p)));
    const { alerts, imports } = runWith(remapped, pack.files.keys());
    assert.deepEqual(alerts, [], `${id}: every reference resolves to a stored file`);
    assert.deepEqual([...pack.files.keys()].filter((f) => !imports.has(f)), [], `${id}: every stored file is imported`);
    assert.ok([...imports].every((f) => pack.files.has(f)), `${id}: imports only stored files`);
  }
});
