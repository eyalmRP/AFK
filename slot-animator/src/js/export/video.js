// Frame-accurate MP4 export: every frame is rendered at its exact time and
// encoded with WebCodecs (H.264), then muxed with mp4-muxer. Faster than
// real time on most machines, and never drops frames.

import { renderFrame } from '../render/renderer.js';

const CODECS = ['avc1.640033', 'avc1.640032', 'avc1.640028', 'avc1.4d0033', 'avc1.4d0028', 'avc1.42e01f'];

export function canEncodeVideo() {
  return typeof window !== 'undefined' && 'VideoEncoder' in window && 'VideoFrame' in window && !!window.Mp4Muxer;
}

export async function exportMP4(scene, { from = 0, to = scene.tl.duration, bitrate = 16e6, onProgress, signal } = {}) {
  if (!('VideoEncoder' in window)) throw new Error('This browser cannot encode video. Use a current Chrome, Edge or Safari, or export the After Effects package.');
  const Mp4Muxer = window.Mp4Muxer;
  if (!Mp4Muxer) throw new Error('The MP4 writer did not load. Check your connection and reload the page.');
  const fps = scene.tl.fps;
  const W = scene.L.W - (scene.L.W % 2);
  const H = scene.L.H - (scene.L.H % 2);
  let config = null;
  for (const codec of CODECS) {
    const c = { codec, width: W, height: H, bitrate, framerate: fps, avc: { format: 'avc' } };
    try {
      const s = await VideoEncoder.isConfigSupported(c);
      if (s.supported) {
        config = c;
        break;
      }
    } catch {
      // try the next profile
    }
  }
  if (!config) throw new Error(`This browser cannot encode H.264 at ${W}×${H}. Try a smaller canvas size.`);
  const muxer = new Mp4Muxer.Muxer({
    target: new Mp4Muxer.ArrayBufferTarget(),
    video: { codec: 'avc', width: W, height: H, frameRate: fps },
    fastStart: 'in-memory',
  });
  let failure = null;
  const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => {
      failure = e;
    },
  });
  encoder.configure(config);
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  const first = Math.max(0, Math.round(from * fps));
  const last = Math.min(Math.ceil(scene.tl.duration * fps), Math.ceil(to * fps));
  const total = Math.max(1, last - first);
  for (let i = 0; i < total; i++) {
    if (signal?.aborted) {
      encoder.close();
      throw new DOMException('Export cancelled', 'AbortError');
    }
    if (failure) throw failure;
    renderFrame(ctx, scene, (first + i) / fps);
    const frame = new VideoFrame(canvas, { timestamp: Math.round((i * 1e6) / fps), duration: Math.round(1e6 / fps) });
    encoder.encode(frame, { keyFrame: i % (fps * 2) === 0 });
    frame.close();
    while (encoder.encodeQueueSize > 6) await new Promise((r) => setTimeout(r, 2));
    if (i % 4 === 0) {
      onProgress?.(i / total);
      await new Promise((r) => setTimeout(r, 0));
    }
  }
  await encoder.flush();
  if (failure) throw failure;
  encoder.close();
  muxer.finalize();
  onProgress?.(1);
  return new Blob([muxer.target.buffer], { type: 'video/mp4' });
}

export function frameToPNG(scene, t) {
  const c = document.createElement('canvas');
  c.width = scene.L.W;
  c.height = scene.L.H;
  renderFrame(c.getContext('2d'), scene, t);
  return new Promise((resolve) => c.toBlob(resolve, 'image/png'));
}
