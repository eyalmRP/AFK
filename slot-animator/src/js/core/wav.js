// 16-bit PCM WAV encoding for the sound track and the After Effects cue
// clips. Pure: channel data in, file bytes out.

// channels: one Float32Array per channel, all the same length. from and to
// are in seconds and clamp to the data.
export function encodeWav(channels, sampleRate, from = 0, to = Infinity) {
  const ch = channels.length;
  const total = ch ? channels[0].length : 0;
  const a = Math.min(total, Math.max(0, Math.floor(from * sampleRate)));
  const b = Math.max(a, Math.min(total, Math.ceil(to * sampleRate)));
  const n = b - a;
  const bytes = n * ch * 2;
  const out = new DataView(new ArrayBuffer(44 + bytes));
  const tag = (o, s) => {
    for (let i = 0; i < 4; i++) out.setUint8(o + i, s.charCodeAt(i));
  };
  tag(0, 'RIFF');
  out.setUint32(4, 36 + bytes, true);
  tag(8, 'WAVE');
  tag(12, 'fmt ');
  out.setUint32(16, 16, true);
  out.setUint16(20, 1, true);
  out.setUint16(22, ch, true);
  out.setUint32(24, sampleRate, true);
  out.setUint32(28, sampleRate * ch * 2, true);
  out.setUint16(32, ch * 2, true);
  out.setUint16(34, 16, true);
  tag(36, 'data');
  out.setUint32(40, bytes, true);
  let o = 44;
  for (let i = a; i < b; i++) {
    for (let c = 0; c < ch; c++) {
      const v = Math.max(-1, Math.min(1, channels[c][i] || 0));
      out.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7fff, true);
      o += 2;
    }
  }
  return new Uint8Array(out.buffer);
}
