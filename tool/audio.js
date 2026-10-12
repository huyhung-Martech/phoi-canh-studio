// Âm thanh: hiệu ứng tự tổng hợp (không cần tệp, không lo bản quyền) + trộn nhạc nền, tiếng video khi xuất
import { timeline } from './render.js';

export const SFX = [['none', 'Không'], ['ting', 'Ting (chạm nhẹ)'], ['pop', 'Bụp (bật lên)'], ['whoosh', 'Vút (lướt qua)'], ['shimmer', 'Lấp lánh'], ['boom', 'Bùm trầm (nhấn mạnh)']];
// Âm thanh của từng loại lớp khớp với lúc hiệu ứng "chạm": ghim kêu khi rơi chạm đất
const SFX_DELAY = { pin: .72, callout: .05 };
export const SFX_DEFAULT = { pin: 'ting', route: 'whoosh', callout: 'pop', image: 'pop', text: 'whoosh' };

let noiseBuf;
const noise = ac => {
  if (noiseBuf?.sampleRate === ac.sampleRate) return noiseBuf;
  noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return noiseBuf;
};
function tone(ac, out, when, freq, dur, vol, type = 'sine', freqEnd) {
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, when);
  if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, when + dur);
  g.gain.setValueAtTime(0, when); g.gain.linearRampToValueAtTime(vol, when + .008); g.gain.exponentialRampToValueAtTime(.0001, when + dur);
  o.connect(g).connect(out); o.start(when); o.stop(when + dur + .05);
}
function hiss(ac, out, when, dur, vol, f0, f1, q = 1.2) {
  const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
  s.buffer = noise(ac); f.type = 'bandpass'; f.Q.value = q;
  f.frequency.setValueAtTime(f0, when); f.frequency.exponentialRampToValueAtTime(f1, when + dur);
  g.gain.setValueAtTime(0, when); g.gain.linearRampToValueAtTime(vol, when + dur * .35); g.gain.exponentialRampToValueAtTime(.0001, when + dur);
  s.connect(f).connect(g).connect(out); s.start(when, Math.random() * .5); s.stop(when + dur + .05);
}
export function playSfx(ac, out, when, kind, vol = 1) {
  if (!kind || kind === 'none' || vol <= 0) return;
  if (kind === 'ting') { tone(ac, out, when, 1568, .9, .32 * vol); tone(ac, out, when, 2349, .6, .12 * vol); tone(ac, out, when + .06, 3136, .4, .06 * vol); }
  if (kind === 'pop') { tone(ac, out, when, 880, .12, .45 * vol, 'sine', 220); hiss(ac, out, when, .06, .15 * vol, 3000, 1500); }
  if (kind === 'whoosh') hiss(ac, out, when, .7, .55 * vol, 280, 3200, .9);
  if (kind === 'shimmer') [2093, 2637, 3136, 3951, 4699].forEach((f, i) => tone(ac, out, when + i * .055, f, .55, .09 * vol, 'triangle'));
  if (kind === 'boom') { tone(ac, out, when, 110, 1.1, .7 * vol, 'sine', 38); hiss(ac, out, when, .5, .25 * vol, 900, 120, .7); }
}
// Mốc thời gian (trên toàn video) của mọi hiệu ứng âm thanh
export function sfxCues(p) {
  if (p.sfxOn === false) return [];
  const { starts } = timeline(p), cues = [];
  p.scenes.forEach((sc, i) => sc.layers.forEach(L => {
    if (!L.hidden && L.sfx && L.sfx !== 'none') cues.push({ t: starts[i] + (L.at || 0) + (SFX_DELAY[L.type] || 0), kind: L.sfx, vol: (L.sfxVol ?? 1) * (p.sfxVol ?? .8) });
  }));
  return cues;
}
// Âm lượng nhạc nền tại thời điểm t (mờ vào đầu, mờ ra cuối video)
export function musicGain(p, t, total) {
  const v = p.musicVol ?? .8, fi = p.musicFadeIn ?? 1, fo = p.musicFadeOut ?? 2;
  return v * Math.min(fi ? t / fi : 1, fo ? (total - t) / fo : 1, 1);
}

// Trộn toàn bộ âm thanh thành một bản (dùng khi xuất MP4). Trả về null nếu dự án không có tiếng nào
export async function mixAudio(p, sampleRate = 48000) {
  const { starts, total } = timeline(p), cues = sfxCues(p);
  const voiced = p.scenes.map((sc, i) => [sc, i]).filter(([sc]) => sc.kind === 'video' && sc.audio);
  if (!p.music && !voiced.length && !cues.length) return null;
  const ac = new OfflineAudioContext(2, Math.ceil(total * sampleRate), sampleRate), warn = [];
  if (p.music) {
    try {
      const buf = await ac.decodeAudioData(await p.music.arrayBuffer()), src = ac.createBufferSource(), g = ac.createGain();
      src.buffer = buf; src.loop = p.musicLoop !== false; src.loopStart = 0; src.loopEnd = buf.duration;
      const v = p.musicVol ?? .8, fi = Math.min(p.musicFadeIn ?? 1, total / 2), fo = Math.min(p.musicFadeOut ?? 2, total / 2);
      g.gain.setValueAtTime(fi ? 0 : v, 0); if (fi) g.gain.linearRampToValueAtTime(v, fi);
      g.gain.setValueAtTime(v, Math.max(fi, total - fo)); if (fo) g.gain.linearRampToValueAtTime(0, total);
      src.connect(g).connect(ac.destination); src.start(0, Math.min(p.musicOffset || 0, buf.duration - .01));
    } catch { warn.push('Không đọc được tệp nhạc nền, video được xuất không có nhạc.'); }
  }
  for (const [sc, i] of voiced) {
    try {
      const buf = await ac.decodeAudioData(await sc.video.arrayBuffer()), src = ac.createBufferSource(), g = ac.createGain();
      src.buffer = buf; g.gain.value = sc.audioVol ?? 1;
      src.connect(g).connect(ac.destination); src.start(starts[i], Math.min(sc.trim || 0, buf.duration), sc.dur);
    } catch { warn.push(`Cảnh "${sc.name}": video không có tiếng hoặc không đọc được tiếng.`); }
  }
  for (const c of cues) if (c.t < total) playSfx(ac, ac.destination, c.t, c.kind, c.vol);
  return { buffer: await ac.startRendering(), warn };
}
