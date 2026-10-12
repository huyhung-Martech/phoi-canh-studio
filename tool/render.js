// Bộ vẽ dùng chung cho xem trước và xuất MP4: mọi thứ tính từ thời gian t nên khung nào cũng dựng lại được y hệt
export const TRANS = 0.6;
export const FONT = "'Be Vietnam Pro', sans-serif";
export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const prog = (t, a, b) => clamp((t - a) / (b - a));
const easeOut = x => 1 - (1 - x) ** 3;
const easeInOut = x => x < .5 ? 4 * x ** 3 : 1 - (-2 * x + 2) ** 3 / 2;
const backOut = x => 1 + 2.7 * (x - 1) ** 3 + 1.7 * (x - 1) ** 2;
const bell = (k, a, m, b) => k < m ? prog(k, a, m) : 1 - prog(k, m, b);
const PIN = new Path2D('M0 0 C-14-22 -42-46 -42-78 A42 42 0 1 1 42-78 C42-46 14-22 0 0Z');
const STAR = new Path2D('M0-70 L7-7 L70 0 L7 7 L0 70 L-7 7 L-70 0 L-7-7Z');

export function timeline(p) {
  let s = 0;
  const starts = p.scenes.map(sc => { const a = s; s += sc.dur; return a; });
  return { starts, total: s };
}

export function sceneAt(p, t) {
  const { starts } = timeline(p);
  let i = 0;
  while (i < starts.length - 1 && t >= starts[i + 1]) i++;
  return { i, u: t - starts[i] };
}

function camMatrix(sc, u, W, H) {
  const c = easeInOut(prog(u, 0, sc.dur)), k = sc.cam || {}, ox = k.ox ?? W / 2, oy = k.oy ?? H / 2;
  return new DOMMatrix().translate(ox + (k.dx || 0) * c, oy + (k.dy || 0) * c).rotate(k.rot * c || 0).scale(1 + (k.zoom || 0) * c).translate(-ox, -oy);
}

// ---------- Ảnh dùng trong lớp (logo lõi ghim, ảnh chèn): nạp một lần, vẽ khi đã sẵn sàng
const media = new Map();
let onMediaLoad = () => {};
export const setOnMediaLoad = f => { onMediaLoad = f; };
function pic(src) {
  if (!src) return null;
  let im = media.get(src);
  if (!im) { im = new Image(); im.onload = () => onMediaLoad(); im.src = src; media.set(src, im); }
  return im.naturalWidth ? im : null;
}
// Gọi trước khi xuất video để chắc mọi ảnh trong lớp đã giải mã xong
export function preloadMedia(p) {
  for (const sc of p.scenes) for (const L of sc.layers) { pic(L.src); pic(L.iconImg); }
  return Promise.all([...media.values()].map(i => i.decode().catch(() => {})));
}
function shade(hex, f) {
  const n = parseInt((hex || '#888888').slice(1), 16), to = f < 0 ? 0 : 255, a = Math.abs(f);
  const [r, g, b] = [n >> 16, n >> 8 & 255, n & 255].map(v => Math.round(v + (to - v) * a));
  return `rgb(${r},${g},${b})`;
}
const rad = d => (d || 0) * Math.PI / 180;

// ---------- Ghim + tia sáng + quầng + vòng sóng + nhãn chữ
const ICON = {
  house: new Path2D('M-15-74 L0-92 L15-74 M-10-76 V-64 H10 V-76'),
  building: new Path2D('M-13-64 V-95 H3 V-64 M3-84 H13 V-64 M-8-88 H-2 M-8-80 H-2 M-8-72 H-2'),
  star: new Path2D('M0-97 L5-86 L17-85 L8-77 L11-65 L0-71 L-11-65 L-8-77 L-17-85 L-5-86Z'),
};
const LABEL = { gold: ['#FFF6C8', '#F5C451', '#B8801F', '#FBE08A'], white: ['#FFFFFF', '#FFFFFF', '#E8E8E8', '#FFFFFF'] };
function pin(ctx, L, u) {
  if (u < 0) return;
  const A0 = ctx.globalAlpha, { x, y } = L, s = L.size || 1.3, falls = L.drop !== false, drop = prog(u, 0, falls ? .8 : .45), col = L.pinColor || '#E9B23C';
  if (L.rings !== false && u > .8) for (let k = 0; k < 3; k++) {
    const p = ((u - .8) / 2.4 + k / 3) % 1;
    ctx.beginPath(); ctx.ellipse(x, y, (30 + 170 * p) * s / 1.5, (11 + 62 * p) * s / 1.5, 0, 0, 7);
    ctx.globalAlpha = A0 * .8 * (1 - p); ctx.strokeStyle = L.ringColor || '#FFE08A'; ctx.lineWidth = 3; ctx.stroke();
  }
  ctx.globalAlpha = A0;
  const bm = easeOut(prog(u, .4, 1.2));
  if (L.beam !== false && bm) {
    const g = ctx.createLinearGradient(0, y - y * bm, 0, y);
    g.addColorStop(0, 'rgba(255,215,106,0)'); g.addColorStop(1, 'rgba(255,233,168,.95)');
    ctx.save(); ctx.globalAlpha = A0 * (.55 + .25 * Math.sin(u * 5)); ctx.filter = 'blur(2px)'; ctx.fillStyle = g;
    ctx.fillRect(x - 6, y - y * bm, 12, y * bm); ctx.restore();
  }
  const fl = s / 1.5 * easeOut(prog(u, .65, 1.3)) * (1 + .06 * Math.sin(u * 4));
  if (L.flare !== false && fl > 0) {
    ctx.save(); ctx.translate(x, y); ctx.scale(fl, fl);
    ctx.save(); ctx.scale(1, .4);
    const r = ctx.createRadialGradient(0, 0, 0, 0, 0, 150);
    r.addColorStop(0, '#fff'); r.addColorStop(.25, 'rgba(255,194,240,.9)'); r.addColorStop(.6, 'rgba(178,107,255,.35)'); r.addColorStop(1, 'rgba(178,107,255,0)');
    ctx.fillStyle = r; ctx.beginPath(); ctx.arc(0, 0, 150, 0, 7); ctx.fill(); ctx.restore();
    const ss = .7 + .3 * Math.sin(u * 3);
    ctx.rotate(u * .7); ctx.scale(ss, ss); ctx.filter = 'blur(2px)'; ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.fill(STAR);
    ctx.restore();
  }
  ctx.save(); ctx.globalAlpha = A0 * clamp(drop * 3);
  ctx.translate(x, y - (falls ? 320 * (1 - easeOut(drop)) : 0));
  const k = s * (.4 + .6 * backOut(drop)); ctx.scale(k, k);
  if (L.style === 'dot') {
    const pu = (u * .8) % 1;
    ctx.beginPath(); ctx.arc(0, -14, 14 + 26 * pu, 0, 7); ctx.strokeStyle = col; ctx.globalAlpha *= 1 - pu; ctx.lineWidth = 4; ctx.stroke();
    ctx.globalAlpha = A0 * clamp(drop * 3); ctx.shadowColor = col; ctx.shadowBlur = 24;
    ctx.beginPath(); ctx.arc(0, -14, 13, 0, 7); ctx.fillStyle = '#fff'; ctx.fill();
    ctx.beginPath(); ctx.arc(0, -14, 8, 0, 7); ctx.fillStyle = col; ctx.fill();
  } else {
    const g = ctx.createLinearGradient(-42, -120, 42, 0);
    g.addColorStop(0, shade(col, .65)); g.addColorStop(.45, col); g.addColorStop(1, shade(col, -.45));
    ctx.fillStyle = g; ctx.fill(PIN); ctx.strokeStyle = shade(col, .8); ctx.lineWidth = 2.5; ctx.stroke(PIN);
    ctx.beginPath(); ctx.arc(0, -80, 29, 0, 7); ctx.fillStyle = L.badge || '#0F7A45'; ctx.fill();
    const icon = L.icon || 'house', logo = icon === 'image' && pic(L.iconImg);
    if (logo) {
      ctx.save(); ctx.beginPath(); ctx.arc(0, -80, 27, 0, 7); ctx.clip();
      const sc = 54 / Math.min(logo.naturalWidth, logo.naturalHeight);
      ctx.drawImage(logo, -logo.naturalWidth * sc / 2, -80 - logo.naturalHeight * sc / 2, logo.naturalWidth * sc, logo.naturalHeight * sc); ctx.restore();
    } else if (icon === 'text') {
      ctx.fillStyle = '#FFF1B5'; ctx.font = `900 30px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText((L.iconText || 'A').slice(0, 3), 0, -79);
    } else if (icon === 'star') { ctx.fillStyle = '#FFF1B5'; ctx.fill(ICON.star); }
    else if (ICON[icon]) { ctx.strokeStyle = '#FFF1B5'; ctx.lineWidth = 4; ctx.lineJoin = ctx.lineCap = 'round'; ctx.stroke(ICON[icon]); }
  }
  ctx.restore();
  if (!L.label) return;
  const at = L.labelAt ?? 1, w = easeOut(prog(u, at, at + .9));
  if (!w) return;
  const fs = L.labelSize || 92, pos = L.labelPos || 'above', top = L.style === 'dot' ? 40 * s : 125 * s;
  ctx.save(); ctx.globalAlpha = A0; ctx.font = `900 ${fs}px ${FONT}`; ctx.letterSpacing = '2px';
  const tw = ctx.measureText(L.label).width;
  const [lx, by] = pos === 'below' ? [x - tw / 2, y + fs * .9 + 24 - 18 * (1 - w)] : pos === 'right' ? [x + 50 * s + 24, y - top / 2 + fs * .35] : [x - tw / 2, y - top - 30 - 18 * w];
  ctx.beginPath(); ctx.rect(lx - 20, by - fs * 1.4, (tw + 40) * w, fs * 2); ctx.clip();
  const c = L.labelStyle === 'color' ? [shade(L.labelColor, .5), L.labelColor, shade(L.labelColor, -.25), shade(L.labelColor, .3)] : LABEL[L.labelStyle] || LABEL.gold;
  const lg = ctx.createLinearGradient(0, by - fs * .8, 0, by);
  c.forEach((v, i) => lg.addColorStop([0, .45, .6, 1][i], v));
  ctx.shadowColor = 'rgba(0,0,0,.55)'; ctx.shadowBlur = 10; ctx.shadowOffsetY = 4;
  ctx.fillStyle = lg; ctx.fillText(L.label, lx, by); ctx.restore();
}

// ---------- Tuyến sáng: đường cong mượt qua các điểm, vẽ dần rồi có hạt sáng chạy liên tục
const curves = new WeakMap();
function curve(pts) {
  const hit = curves.get(pts);
  if (hit && hit.key === JSON.stringify(pts)) return hit;
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    for (let s = 0; s < 16; s++) {
      const t = s / 16, t2 = t * t, t3 = t2 * t;
      out.push([0, 1].map(j => .5 * (2 * p1[j] + (p2[j] - p0[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (3 * p1[j] - p0[j] - 3 * p2[j] + p3[j]) * t3)));
    }
  }
  out.push(pts.at(-1));
  const cum = [0];
  for (let i = 1; i < out.length; i++) cum.push(cum[i - 1] + Math.hypot(out[i][0] - out[i - 1][0], out[i][1] - out[i - 1][1]));
  const c = { key: JSON.stringify(pts), pts: out, cum, len: cum.at(-1) };
  curves.set(pts, c);
  return c;
}
function pointAt(c, d) {
  let i = 1;
  while (i < c.cum.length - 1 && c.cum[i] < d) i++;
  const k = clamp((d - c.cum[i - 1]) / (c.cum[i] - c.cum[i - 1] || 1)), a = c.pts[i - 1], b = c.pts[i];
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
}
function partPath(ctx, c, d) {
  ctx.beginPath(); ctx.moveTo(...c.pts[0]);
  for (let i = 1; i < c.pts.length && c.cum[i] <= d; i++) ctx.lineTo(...c.pts[i]);
  ctx.lineTo(...pointAt(c, d));
}
const VEHICLE = { car: '🚗', bus: '🚌', train: '🚆', plane: '✈️', boat: '🛥️', bike: '🛵' };
function route(ctx, L, u) {
  if (u <= 0 || L.pts.length < 2) return;
  const A0 = ctx.globalAlpha, c = curve(L.pts), dur = L.dur || 1.2, show = L.reveal === 'show';
  const p = show ? 1 : easeInOut(prog(u, 0, dur)), d = c.len * p, w = L.width || 1, gl = L.glow ?? 1, sp = L.speed ?? 1;
  const fade = show ? prog(u, 0, .5) : 1, done = show ? fade : prog(u, dur, dur + .5);
  ctx.save(); ctx.lineCap = ctx.lineJoin = 'round';
  const stroke = (color, width, alpha, blur, dash, full) => {
    ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = width; ctx.globalAlpha = A0 * alpha * fade;
    if (blur) ctx.filter = `blur(${blur}px)`;
    if (dash) { ctx.setLineDash(dash); ctx.lineDashOffset = -u * 90 * sp; }
    partPath(ctx, c, full ? c.len : d); ctx.stroke(); ctx.restore();
  };
  if (gl > 0) { stroke(L.color, 44 * w * gl, Math.min(1, .8 * gl), 9 * gl); stroke(L.color, 13 * w, .95, 2); }
  const line = L.line || 'solid';
  stroke(L.coreColor || '#E9FDFF', (line === 'dots' ? 7 : 5) * w, 1, 0, line === 'dash' ? [26 * w, 18 * w] : line === 'dots' ? [1, 16 * w] : null);
  if (done && L.particles !== false) {
    stroke('#fff', 4 * w, done * .8, 0, [18, 26], true);
    ctx.fillStyle = '#fff'; ctx.globalAlpha = A0 * done; ctx.filter = 'blur(2px)';
    for (let i = 0; i < 7; i++) { ctx.beginPath(); ctx.arc(...pointAt(c, (u * 160 * sp + i * c.len / 7) % c.len), 5 * w, 0, 7); ctx.fill(); }
    ctx.filter = 'none';
  }
  if (p < 1) { ctx.globalAlpha = A0; ctx.filter = 'blur(9px)'; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(...pointAt(c, d), 16 * w, 0, 7); ctx.fill(); ctx.filter = 'none'; }
  const v = L.vehicle;
  if (v && v !== 'none') {
    // phương tiện chạy theo đầu tuyến; chạy xong thì đỗ ở cuối hoặc chạy lặp lại
    const at = p < 1 ? d : L.loop ? ((u - dur) * 140 * sp) % c.len : c.len, [vx, vy] = pointAt(c, at);
    ctx.globalAlpha = A0 * fade;
    if (v === 'dot') { ctx.shadowColor = L.color; ctx.shadowBlur = 20; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(vx, vy, 11 * w, 0, 7); ctx.fill(); }
    else { ctx.font = `${Math.round(54 * (L.vehicleSize || 1))}px "Segoe UI Emoji","Apple Color Emoji",sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowBlur = 8; ctx.fillText(VEHICLE[v] || '🚗', vx, vy - 18); }
  }
  ctx.restore();
}

// ---------- Nhãn tiện ích: viên nhãn + chân chỉ vào điểm
const CALLOUT = {
  green: c => ({ bg: [c || '#2BD47A', shade(c || '#2BD47A', -.38)], border: 'rgba(255,255,255,.85)', text: '#fff', glow: c || '#2BD47A' }),
  dark: () => ({ bg: ['#1E1E1E', '#060606'], border: '#E9B23C', text: '#F5C451', glow: 'rgba(233,178,60,.6)' }),
  glass: () => ({ bg: ['rgba(255,255,255,.95)', 'rgba(230,236,242,.88)'], border: '#fff', text: '#0E1622', glow: 'rgba(255,255,255,.6)' }),
  gold: () => ({ bg: ['#FFE7A0', '#D49A2A'], border: '#FFF6D0', text: '#3A2405', glow: 'rgba(233,178,60,.8)' }),
};
function callout(ctx, L, u) {
  const a = prog(u, 0, .55);
  if (a <= 0) return;
  const A0 = ctx.globalAlpha, { x, y } = L, stem = L.stem ?? 90, fs = L.fontSize || 22, down = L.dir === 'down';
  const st = (CALLOUT[L.style] || CALLOUT.green)(L.color), text = (L.icon ? `${L.icon}  ` : '') + L.text;
  ctx.save(); ctx.globalAlpha = A0 * clamp(a * 4);
  ctx.font = `800 ${fs}px ${FONT}`; ctx.letterSpacing = `${fs * .07}px`;
  const tw = ctx.measureText(text).width, w = tw + fs * 2.2, h = fs * 2, cy = down ? y + stem + h / 2 : y - stem - h / 2;
  const sl = stem * easeOut(prog(u, 0, .4)), sg = ctx.createLinearGradient(0, y, 0, down ? y + stem : y - stem);
  sg.addColorStop(0, 'rgba(255,255,255,.2)'); sg.addColorStop(1, '#fff');
  ctx.fillStyle = sg; ctx.fillRect(x - 1, down ? y : y - sl, 2, sl);
  ctx.save(); ctx.shadowColor = st.glow; ctx.shadowBlur = 14; ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(x, y, 6, 0, 7); ctx.fill(); ctx.restore();
  const anim = L.anim || 'pop', k = anim === 'pop' ? backOut(a) : 1;
  ctx.translate(x, cy + (anim === 'slide' ? 30 * (1 - easeOut(a)) * (down ? -1 : 1) : 0)); ctx.scale(k, k);
  if (anim !== 'pop') ctx.globalAlpha = A0 * easeOut(a);
  const pg = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
  pg.addColorStop(0, st.bg[0]); pg.addColorStop(1, st.bg[1]);
  ctx.beginPath(); ctx.roundRect(-w / 2, -h / 2, w, h, L.square ? 6 : h / 2);
  ctx.save(); ctx.shadowColor = st.glow; ctx.shadowBlur = 18; ctx.fillStyle = pg; ctx.fill(); ctx.restore();
  ctx.strokeStyle = st.border; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = L.textColor || st.text; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, 0, 1);
  ctx.restore();
}

// ---------- Tô khối: nháy vài lần rồi giữ; tô đặc, viền phát sáng hoặc cả hai
function highlight(ctx, L, u) {
  if (L.pts.length < 3 || u < .15) return;
  const A0 = ctx.globalAlpha, blinks = L.blinks ?? (L.blink === false ? 0 : 2), k = (u - .15) / .25;
  if (k < blinks && k % 1 > .55) return;
  const pulse = L.pulse ? .7 + .3 * Math.sin(u * 5) : 1, style = L.style || 'fill';
  ctx.save(); ctx.beginPath(); L.pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath();
  if (style !== 'outline') {
    ctx.fillStyle = L.color; ctx.globalCompositeOperation = 'multiply'; ctx.globalAlpha = A0 * (L.strength ?? .9) * pulse; ctx.fill();
    ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = A0 * (.28 + .08 * Math.sin(u * 4)) * pulse; ctx.fill();
  }
  if (style !== 'fill') {
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = A0 * pulse; ctx.lineJoin = 'round';
    ctx.strokeStyle = L.lineColor || '#FFF27A'; ctx.lineWidth = L.lineWidth || 6; ctx.shadowColor = L.lineColor || '#FFF27A'; ctx.shadowBlur = 22; ctx.stroke();
  }
  ctx.restore();
}

// ---------- Thẻ thông số: tiêu đề + các dòng số đếm lên. Neo tại mép phải (hoặc trái) dòng tiêu đề
const TITLE = { lime: ['#F4FF6A', '#C6E000', '#9FC400'], gold: ['#FFF6C8', '#F5C451', '#B8801F'], white: ['#FFFFFF', '#F4F4F4', '#D8D8D8'] };
function tag(ctx, L, u) {
  if (u < 0) return;
  const A0 = ctx.globalAlpha, ts = L.titleSize || 96, ns = L.numSize || 78, left = L.align === 'left', anim = L.titleAnim || 'pop';
  const tc = L.titleStyle === 'color' ? [shade(L.titleColor, .5), L.titleColor, shade(L.titleColor, -.3)] : TITLE[L.titleStyle] || TITLE.lime;
  ctx.save(); ctx.translate(L.x, L.y); ctx.rotate(rad(L.rot ?? -9));
  ctx.font = `900 ${ts}px ${FONT}`; ctx.letterSpacing = '1px'; ctx.textBaseline = 'alphabetic';
  const chars = [...(L.title || '')], ws = chars.map(ch => ctx.measureText(ch).width);
  let cx = left ? 0 : -ws.reduce((a, b) => a + b, 0);
  chars.forEach((ch, i) => {
    const a = anim === 'type' ? (u >= .25 + i * .06 ? 1 : 0) : anim === 'fade' ? prog(u, .25, .85) : prog(u, .25 + i * .07, .45 + i * .07);
    if (a > 0) {
      const e = easeOut(a), sc = anim === 'pop' ? 1.5 - .5 * e : 1;
      ctx.save(); ctx.translate(cx + ws[i] / 2, anim === 'type' ? 0 : -30 * (1 - e)); ctx.scale(sc, sc);
      ctx.globalAlpha = A0 * a; ctx.textAlign = 'center';
      const g = ctx.createLinearGradient(0, -ts * .83, 0, ts * .06);
      g.addColorStop(0, tc[0]); g.addColorStop(.6, tc[1]); g.addColorStop(1, tc[2]);
      ctx.shadowColor = 'rgba(0,0,0,.45)'; ctx.shadowBlur = 6; ctx.shadowOffsetY = 4;
      ctx.fillStyle = g; ctx.fillText(ch, 0, 0); ctx.restore();
    }
    cx += ws[i];
  });
  const f = ns / 78;
  (L.rows || []).forEach((r, i) => {
    const at = 1.15 + i * .35, a = prog(u, at, at + .7);
    if (!a) return;
    const dec = (String(r.value).split('.')[1] || '').length, num = (Number(r.value) * (L.count === false ? 1 : easeOut(a))).toFixed(dec);
    ctx.save(); ctx.globalAlpha = A0 * clamp(a * 3); ctx.translate(40 * (1 - easeOut(a)) * (left ? -1 : 1), ts + i * ns * 1.15);
    ctx.fillStyle = L.rowColor || '#fff'; ctx.letterSpacing = '0px';
    ctx.shadowColor = 'rgba(0,0,0,.6)'; ctx.shadowBlur = 5; ctx.shadowOffsetY = 3;
    const parts = [[r.label || '', `600 ${30 * f}px ${FONT}`, 10 * f], [num, `900 ${ns}px ${FONT}`, 6 * f], [r.unit || '', `800 ${40 * f}px ${FONT}`, 0]];
    let rx = 0;
    ctx.textAlign = left ? 'left' : 'right';
    if (left) for (const [txt, font, gap] of parts) { ctx.font = font; ctx.fillText(txt, rx, 0); rx += ctx.measureText(txt).width + gap; }
    else for (let j = 2; j >= 0; j--) { ctx.font = parts[j][1]; ctx.fillText(parts[j][0], rx, 0); rx -= ctx.measureText(parts[j][0]).width + (parts[j - 1]?.[2] ?? 0); }
    ctx.restore();
  });
  ctx.restore();
}

// ---------- Chữ phối cảnh: dựng chữ phẳng rồi bẻ vào 4 góc [TL,TR,BR,BL] bằng homography
const STYLES = {
  road: { weight: '900', color: '#FFE34D', glow: 'rgba(255,200,0,.6)', blend: 'normal', anim: 'spread' },
  water: { weight: '600', color: '#C9FAFF', glow: 'rgba(120,230,255,.9)', blend: 'screen', anim: 'chars' },
  white: { weight: '800', color: '#FFFFFF', glow: 'rgba(0,0,0,.5)', blend: 'normal', anim: 'spread' },
};
const textBuf = typeof document !== 'undefined' && document.createElement('canvas');
function homography(src, dst) {
  const A = [], b = [];
  src.forEach(([x, y], i) => { const [X, Y] = dst[i];
    A.push([x, y, 1, 0, 0, 0, -X * x, -X * y]); b.push(X);
    A.push([0, 0, 0, x, y, 1, -Y * x, -Y * y]); b.push(Y); });
  for (let c = 0; c < 8; c++) {
    let p = c; for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]]; [b[c], b[p]] = [b[p], b[c]];
    for (let r = 0; r < 8; r++) if (r !== c) { const f = A[r][c] / A[c][c]; for (let k = c; k < 8; k++) A[r][k] -= f * A[c][k]; b[r] -= f * b[c]; }
  }
  const h = b.map((v, i) => v / A[i][i]);
  return (x, y) => { const z = h[6] * x + h[7] * y + 1; return [(h[0] * x + h[1] * y + h[2]) / z, (h[3] * x + h[4] * y + h[5]) / z]; };
}
function tri(ctx, img, s, d) {
  const [[x0, y0], [x1, y1], [x2, y2]] = s, [[X0, Y0], [X1, Y1], [X2, Y2]] = d;
  const det = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
  const a = ((X1 - X0) * (y2 - y0) - (X2 - X0) * (y1 - y0)) / det, c = ((X2 - X0) * (x1 - x0) - (X1 - X0) * (x2 - x0)) / det;
  const b = ((Y1 - Y0) * (y2 - y0) - (Y2 - Y0) * (y1 - y0)) / det, e = ((Y2 - Y0) * (x1 - x0) - (Y1 - Y0) * (x2 - x0)) / det;
  // nới tam giác ra 1px để không lộ đường nối giữa các mảnh
  const mx = (X0 + X1 + X2) / 3, my = (Y0 + Y1 + Y2) / 3, grow = ([X, Y]) => { const l = Math.hypot(X - mx, Y - my) || 1; return [X + (X - mx) / l, Y + (Y - my) / l]; };
  ctx.save(); ctx.beginPath(); d.map(grow).forEach((p, i) => i ? ctx.lineTo(...p) : ctx.moveTo(...p)); ctx.clip();
  ctx.transform(a, b, c, e, X0 - a * x0 - c * y0, Y0 - b * x0 - e * y0); ctx.drawImage(img, 0, 0); ctx.restore();
}
function ptext(ctx, L, u) {
  if (u < 0 || L.quad.length < 4) return;
  const st = { ...(STYLES[L.style] || STYLES.road) };
  for (const k of ['weight', 'color', 'blend', 'anim']) if (L[k]) st[k] = L[k];
  const lines = L.text.split('\n'), fs = 100, g = textBuf.getContext('2d'), font = `${st.weight} ${fs}px ${FONT}`;
  g.font = font; g.letterSpacing = '6px';
  const W = Math.ceil(Math.max(...lines.map(l => g.measureText(l).width)) + 80), H = lines.length * fs * 1.15 + 60;
  textBuf.width = W; textBuf.height = H;
  g.font = font; g.textBaseline = 'middle'; g.fillStyle = st.color; g.shadowColor = L.color ? L.color : st.glow; g.shadowBlur = L.glow ?? 24;
  let n = 0;
  if (st.anim === 'chars') {
    lines.forEach((l, li) => {
      g.letterSpacing = '6px';
      let x = (W - g.measureText(l).width) / 2;
      for (const ch of l) { g.globalAlpha = .9 * prog(u, n * .045, .4 + n++ * .045); g.fillText(ch, x, 30 + fs * 1.15 * (li + .5)); x += g.measureText(ch).width; }
    });
  } else {
    g.globalAlpha = prog(u, 0, st.anim === 'fade' ? .9 : .5); g.textAlign = 'center';
    g.letterSpacing = `${6 + (st.anim === 'spread' ? 16 * (1 - easeOut(prog(u, 0, .6))) : 0)}px`;
    lines.forEach((l, li) => g.fillText(l, W / 2, 30 + fs * 1.15 * (li + .5)));
  }
  const map = homography([[0, 0], [W, 0], [W, H], [0, H]], L.quad), NX = 16, NY = Math.max(4, lines.length * 4);
  ctx.save(); ctx.globalCompositeOperation = st.blend === 'screen' ? 'screen' : 'source-over';
  for (let i = 0; i < NX; i++) for (let j = 0; j < NY; j++) {
    const s = [[i, j], [i + 1, j], [i + 1, j + 1], [i, j + 1]].map(([a, b]) => [a * W / NX, b * H / NY]), d = s.map(p => map(...p));
    tri(ctx, textBuf, [s[0], s[1], s[2]], [d[0], d[1], d[2]]);
    tri(ctx, textBuf, [s[0], s[2], s[3]], [d[0], d[2], d[3]]);
  }
  ctx.restore();
}

// ---------- Ảnh chèn: logo, ảnh tiện ích, ảnh thực tế… có khung, bóng đổ, hiệu ứng hiện
const imgSize = L => { const im = pic(L.src), w = L.w || 360; return [w, im ? w * im.naturalHeight / im.naturalWidth : w * .66]; };
function framePath(ctx, L, w, h) {
  ctx.beginPath();
  if (L.frame === 'circle') ctx.arc(0, 0, Math.min(w, h) / 2, 0, 7);
  else ctx.roundRect(-w / 2, -h / 2, w, h, L.frame === 'round' ? L.radius ?? 24 : L.frame === 'white' ? 6 : 0);
}
function image(ctx, L, u) {
  const im = pic(L.src);
  if (u < 0 || !im) return;
  const A0 = ctx.globalAlpha, [w, h] = imgSize(L), a = prog(u, 0, .6), e = easeOut(a), anim = L.anim || 'fade';
  ctx.save();
  if (L.screen) ctx.setTransform(1, 0, 0, 1, 0, 0);
  const dy = (anim === 'slide' ? 70 * (1 - e) : 0) + (L.float ? Math.sin(u * 2) * 8 : 0);
  const s = anim === 'zoom' ? .6 + .4 * e : anim === 'pop' ? backOut(a) : 1;
  ctx.translate(L.x, L.y + dy); ctx.rotate(rad(L.rot)); ctx.scale(s, s); ctx.globalAlpha = A0 * clamp(a * 1.6);
  const frame = L.frame || 'none', side = Math.min(w, h);
  const [dw, dh] = frame === 'circle' ? [side, side] : [w, h];
  const cover = () => { const k = Math.max(dw / im.naturalWidth, dh / im.naturalHeight); ctx.drawImage(im, -im.naturalWidth * k / 2, -im.naturalHeight * k / 2, im.naturalWidth * k, im.naturalHeight * k); };
  if (L.shadow !== false) { ctx.shadowColor = 'rgba(0,0,0,.45)'; ctx.shadowBlur = 26; ctx.shadowOffsetY = 12; }
  if (frame === 'none') { ctx.drawImage(im, -w / 2, -h / 2, w, h); ctx.restore(); return; }
  if (frame === 'white') { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.roundRect(-w / 2 - 14, -h / 2 - 14, w + 28, h + 28, 10); ctx.fill(); }
  else { framePath(ctx, L, dw, dh); ctx.fillStyle = '#fff'; ctx.fill(); }
  ctx.shadowColor = 'transparent';
  ctx.save(); framePath(ctx, L, dw, dh); ctx.clip(); cover(); ctx.restore();
  if (L.border) { framePath(ctx, L, dw, dh); ctx.strokeStyle = L.borderColor || '#ffffff'; ctx.lineWidth = L.border; ctx.stroke(); }
  ctx.restore();
}

const DRAW = { pin, route, callout, highlight, tag, ptext, image };

// Các điểm có thể kéo của một lớp (dùng cho trình chỉnh sửa). Ảnh chèn: tâm + góc dưới phải để đổi cỡ
export function handles(L) {
  if (L.pts) return L.pts;
  if (L.quad) return L.quad;
  if (L.type === 'image') { const [w, h] = imgSize(L); return [[L.x, L.y], [L.x + w / 2, L.y + h / 2]]; }
  return [[L.x, L.y]];
}
export const imageBox = L => imgSize(L);

export function drawScene(ctx, sc, u, img, W, H, opts = {}) {
  const m = opts.edit ? new DOMMatrix() : camMatrix(sc, u, W, H);
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.filter = 'none';
  ctx.fillStyle = '#0b1119'; ctx.fillRect(0, 0, W, H);
  ctx.setTransform(m);
  const iw = img?.naturalWidth || img?.videoWidth, ih = img?.naturalHeight || img?.videoHeight;
  if (iw) {
    const s = Math.max(W / iw, H / ih), w = iw * s, h = ih * s, f = sc.look || {};
    ctx.filter = `brightness(${f.bright ?? 1}) contrast(${f.contrast ?? 1}) saturate(${f.sat ?? 1})`;
    ctx.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
    ctx.filter = 'none';
  }
  const lu = L => opts.edit ? 50 : u - (L.at || 0);
  // ghim bật "làm tối nền" → phủ tối viền màn hình để ghim nổi lên
  for (const L of sc.layers) if (L.type === 'pin' && L.focus && !L.hidden && lu(L) >= 0) {
    const a = .25 + .5 * easeOut(prog(lu(L), .6, 1.6));
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
    const v = ctx.createRadialGradient(W * .56, H * .42, H * .25, W * .56, H * .42, W * .62);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, `rgba(0,0,0,${.55 * a / .75})`);
    ctx.fillStyle = v; ctx.fillRect(0, 0, W, H); ctx.restore();
  }
  for (const L of sc.layers) {
    if (L.hidden) continue;
    // "Ẩn sau (s)": mờ dần trong 0,4 giây rồi biến mất
    const out = !opts.edit && L.end > 0 ? 1 - prog(lu(L), L.end, L.end + .4) : 1;
    if (out <= 0) continue;
    ctx.save(); ctx.globalAlpha = out * (L.opacity ?? 1); DRAW[L.type](ctx, L, lu(L)); ctx.restore();
  }
  const S = opts.selected;
  if (S) {
    ctx.save(); ctx.lineWidth = 3; ctx.strokeStyle = '#41E8FF'; ctx.fillStyle = 'rgba(14,22,34,.85)';
    const hs = handles(S);
    if (S.type === 'image') { const [w, h] = imgSize(S); ctx.setLineDash([8, 6]); ctx.strokeRect(S.x - w / 2, S.y - h / 2, w, h); ctx.setLineDash([]); }
    else if (hs.length > 1) { ctx.setLineDash([8, 6]); ctx.beginPath(); hs.forEach((p, i) => i ? ctx.lineTo(...p) : ctx.moveTo(...p)); if (S.type !== 'route') ctx.closePath(); ctx.stroke(); ctx.setLineDash([]); }
    for (const p of hs) { ctx.beginPath(); ctx.arc(...p, 10, 0, 7); ctx.fill(); ctx.stroke(); }
    ctx.restore();
  }
  if (opts.draft?.length) {
    ctx.save(); ctx.strokeStyle = '#E9B23C'; ctx.lineWidth = 3; ctx.setLineDash([10, 6]);
    ctx.beginPath(); opts.draft.forEach((p, i) => i ? ctx.lineTo(...p) : ctx.moveTo(...p)); ctx.stroke();
    ctx.setLineDash([]); ctx.fillStyle = '#E9B23C';
    opts.draft.forEach((p, i) => { ctx.beginPath(); ctx.arc(...p, 8, 0, 7); ctx.fill(); ctx.fillStyle = '#0E1622'; ctx.font = `800 13px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(i + 1, ...p); ctx.fillStyle = '#E9B23C'; });
    ctx.restore();
  }
  ctx.restore();
  return m;
}

const bufs = [];
const buf = (i, W, H) => { const c = bufs[i] ||= document.createElement('canvas'); if (c.width !== W || c.height !== H) { c.width = W; c.height = H; } return c; };

// Các kiểu chuyển cảnh: A = cảnh trước (đang chạy tiếp), B = cảnh mới, k = tiến độ 0→1
export const TRANSITIONS = [
  ['cut', 'Cắt thẳng'], ['fade', 'Mờ dần'], ['black', 'Tối dần'], ['flash', 'Lóe trắng'], ['leak', 'Lóe sáng tím'], ['gold', 'Lóe vàng'],
  ['swipe', 'Trượt xuống'], ['swipeUp', 'Trượt lên'], ['whipL', 'Lia trái'], ['whipR', 'Lia phải'],
  ['zoom', 'Phóng nhòe'], ['iris', 'Mở tròn'], ['sweep', 'Quét sáng'], ['stripes', 'Lật sọc'],
];
function glowBlobs(ctx, W, H, k, blobs) {
  ctx.save(); ctx.globalAlpha = bell(k, 0, .5, 1); ctx.globalCompositeOperation = 'screen';
  const dx = (k - .5) * W * .3;
  for (const [cx, cy, r, c] of blobs) {
    const g = ctx.createRadialGradient(cx * W + dx, cy * H, 0, cx * W + dx, cy * H, r * W);
    g.addColorStop(0, `rgba(${c},.95)`); g.addColorStop(1, `rgba(${c},0)`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }
  ctx.restore();
}
function slide(ctx, A, B, e, ax, ay, bx, by, blur) {
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, A.width, A.height);
  ctx.filter = `blur(${e * blur}px)`; ctx.drawImage(A, ax, ay);
  ctx.filter = `blur(${(1 - e) * blur}px)`; ctx.drawImage(B, bx, by);
  ctx.filter = 'none';
}
function composite(ctx, tr, A, B, k, W, H, focus) {
  const e = easeInOut(k);
  switch (tr) {
    case 'swipe': return slide(ctx, A, B, e, 0, e * H, 0, (e - 1) * H, 22);
    case 'swipeUp': return slide(ctx, A, B, e, 0, -e * H, 0, (1 - e) * H, 22);
    case 'whipL': return slide(ctx, A, B, e, -e * W, 0, (1 - e) * W, 0, 34);
    case 'whipR': return slide(ctx, A, B, e, e * W, 0, (e - 1) * W, 0, 34);
    case 'flash':
      ctx.drawImage(k < .5 ? A : B, 0, 0);
      ctx.globalAlpha = .85 * bell(k, 0, .5, 1); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H); return;
    case 'black':
      ctx.drawImage(k < .5 ? A : B, 0, 0);
      ctx.globalAlpha = bell(k, 0, .5, 1); ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); return;
    case 'zoom': {
      const draw = (img, s, blur, a) => { ctx.save(); ctx.globalAlpha = a; ctx.filter = `blur(${blur}px)`; ctx.translate(W / 2, H / 2); ctx.scale(s, s); ctx.drawImage(img, -W / 2, -H / 2); ctx.restore(); };
      draw(A, 1 + e * .6, e * 20, 1); draw(B, 1.25 - .25 * e, (1 - e) * 20, e); return;
    }
    case 'iris': {
      const [fx, fy] = focus, r = e * Math.hypot(Math.max(fx, W - fx), Math.max(fy, H - fy));
      ctx.drawImage(A, 0, 0);
      ctx.save(); ctx.beginPath(); ctx.arc(fx, fy, r, 0, 7); ctx.clip(); ctx.drawImage(B, 0, 0); ctx.restore();
      ctx.save(); ctx.globalAlpha = 1 - e; ctx.strokeStyle = '#FFE9A8'; ctx.lineWidth = 10; ctx.shadowColor = '#E9B23C'; ctx.shadowBlur = 30;
      ctx.beginPath(); ctx.arc(fx, fy, r, 0, 7); ctx.stroke(); ctx.restore(); return;
    }
    case 'sweep': {
      // vệt sáng chéo chạy từ trái sang phải; phía sau vệt là cảnh mới
      const x = -H * .4 + e * (W + H * .8), tilt = H * .4;
      ctx.drawImage(A, 0, 0);
      ctx.save(); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(x + tilt, 0); ctx.lineTo(x - tilt, H); ctx.lineTo(0, H); ctx.closePath(); ctx.clip(); ctx.drawImage(B, 0, 0); ctx.restore();
      ctx.save(); ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = bell(k, 0, .15, 1) || .001;
      const g = ctx.createLinearGradient(x - 140, 0, x + 140, 0);
      g.addColorStop(0, 'rgba(255,240,200,0)'); g.addColorStop(.5, 'rgba(255,248,225,.95)'); g.addColorStop(1, 'rgba(255,240,200,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(x - 140 + tilt, 0); ctx.lineTo(x + 140 + tilt, 0); ctx.lineTo(x + 140 - tilt, H); ctx.lineTo(x - 140 - tilt, H); ctx.closePath();
      ctx.filter = 'blur(12px)'; ctx.fill(); ctx.restore(); return;
    }
    case 'stripes': {
      const n = 8, w = W / n;
      ctx.drawImage(A, 0, 0);
      for (let i = 0; i < n; i++) {
        const a = easeInOut(prog(k, i * .06, .58 + i * .06));
        if (!a) continue;
        ctx.save(); ctx.beginPath(); ctx.rect(i * w + w * (1 - a) / 2, 0, w * a + 1, H); ctx.clip(); ctx.drawImage(B, 0, 0); ctx.restore();
      }
      return;
    }
    default: // fade, leak, gold
      ctx.drawImage(A, 0, 0); ctx.globalAlpha = e; ctx.drawImage(B, 0, 0); ctx.globalAlpha = 1;
      if (tr === 'leak') glowBlobs(ctx, W, H, k, [[.3, .4, .45, '255,120,220'], [.7, .6, .5, '170,110,255'], [.5, .5, .38, '255,240,250']]);
      if (tr === 'gold') glowBlobs(ctx, W, H, k, [[.25, .35, .45, '255,190,80'], [.72, .62, .5, '255,140,40'], [.5, .5, .36, '255,245,215']]);
  }
}

// Vẽ khung tại thời điểm t của cả dự án; trả về ma trận camera của cảnh đang hiện (để đổi toạ độ chuột)
export function drawFrame(ctx, p, t, imgs, opts = {}) {
  const W = p.w, H = p.h;
  if (!p.scenes.length) { ctx.fillStyle = '#0b1119'; ctx.fillRect(0, 0, W, H); return new DOMMatrix(); }
  const { i, u } = opts.edit ? { i: opts.scene, u: 0 } : sceneAt(p, t), sc = p.scenes[i], tr = sc.trans || 'cut', T = sc.transDur || TRANS;
  if (opts.edit || !i || tr === 'cut' || u >= T) return drawScene(ctx, sc, u, imgs[sc.id], W, H, opts);
  const prev = p.scenes[i - 1], A = buf(0, W, H), B = buf(1, W, H);
  drawScene(A.getContext('2d'), prev, prev.dur + u, imgs[prev.id], W, H);
  const m = drawScene(B.getContext('2d'), sc, u, imgs[sc.id], W, H);
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
  composite(ctx, tr, A, B, u / T, W, H, [sc.cam?.ox ?? W / 2, sc.cam?.oy ?? H / 2]);
  ctx.restore();
  return m;
}
