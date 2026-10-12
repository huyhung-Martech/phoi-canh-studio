import { drawFrame, timeline, sceneAt, handles, FONT, TRANSITIONS } from './render.js';

const $ = id => document.getElementById(id);
const stage = $('stage'), ctx = stage.getContext('2d');
const COLOR = { pin: '#E9B23C', route: '#41E8FF', callout: '#2BD47A', highlight: '#FFE600', tag: '#C6E000', ptext: '#FFE34D' };
const NAME = { pin: 'Ghim', route: 'Tuyến sáng', callout: 'Nhãn', highlight: 'Tô khối', tag: 'Thông số', ptext: 'Chữ nghiêng' };
const HINT = {
  select: 'Bấm vào lớp để chọn · kéo <b>điểm</b> để sửa · giữ <b>Shift</b> khi kéo để dời cả lớp · <b>Delete</b> để xoá',
  pin: 'Bấm lên ảnh để đặt <b>ghim</b>',
  route: 'Bấm lần lượt các điểm dọc con đường · <b>Enter</b> hoặc bấm đúp để xong · <b>Esc</b> để huỷ',
  callout: 'Bấm vào vị trí tiện ích để đặt <b>nhãn</b>',
  highlight: 'Bấm các góc quanh khối nhà · <b>Enter</b> hoặc bấm đúp để xong',
  tag: 'Bấm vào chỗ đặt <b>mép phải</b> của thẻ thông số',
  ptext: 'Bấm 4 góc mặt phẳng theo thứ tự <b>trái trên → phải trên → phải dưới → trái dưới</b>',
  focus: 'Bấm vào điểm camera sẽ đẩy vào',
};
const KEYS = { v: 'select', g: 'pin', t: 'route', n: 'callout', k: 'highlight', s: 'tag', p: 'ptext', c: 'focus' };

let P = { w: 1920, h: 1080, fps: 30, scenes: [] };
let cur = 0, sel = null, tool = 'select', draft = [], mode = 'edit', t = 0, playing = false, camM = new DOMMatrix(), drag = null, replacing = false, exporting = null;
const imgs = {};
const uid = () => Math.random().toString(36).slice(2, 9);
const scene = () => P.scenes[cur];

// ---------- Lưu tự động vào trình duyệt (IndexedDB chứa được ảnh nặng, localStorage thì không)
const dbp = new Promise(res => {
  const q = indexedDB.open('phoi-canh-studio', 1);
  q.onupgradeneeded = () => q.result.createObjectStore('kv');
  q.onsuccess = () => res(q.result); q.onerror = () => res(null);
});
async function idb(value) {
  const d = await dbp;
  if (!d) return;
  return new Promise(res => {
    const st = d.transaction('kv', value ? 'readwrite' : 'readonly').objectStore('kv');
    const q = value ? st.put(value, 'project') : st.get('project');
    q.onsuccess = () => res(q.result); q.onerror = () => res();
  });
}
let saveTimer;
const save = () => { clearTimeout(saveTimer); saveTimer = setTimeout(() => idb(P), 400); };

// ---------- Vẽ
function syncImgs() {
  for (const sc of P.scenes) if (imgs[sc.id]?.dataset.src !== sc.image) {
    const im = new Image();
    im.dataset.src = sc.image; im.onload = redraw; im.src = sc.image;
    imgs[sc.id] = im;
  }
}
function redraw() {
  if (stage.width !== P.w || stage.height !== P.h) { stage.width = P.w; stage.height = P.h; }
  camM = drawFrame(ctx, P, t, imgs, { edit: mode === 'edit', scene: cur, selected: mode === 'edit' ? sel : null, draft });
  const { total } = timeline(P);
  $('clock').innerHTML = `${t.toFixed(1)} <small>/ ${total.toFixed(1)} s</small>`;
  $('head').style.left = `${total ? t / total * 100 : 0}%`;
  $('head').style.display = mode === 'view' || playing ? '' : 'none';
  $('strip').querySelectorAll('.seg').forEach((s, i) => s.classList.toggle('on', i === cur));
  $('total').textContent = `${P.scenes.length} cảnh · ${total.toFixed(1)}s`;
}
function renderAll() {
  syncImgs();
  const has = P.scenes.length > 0;
  $('empty').hidden = has; $('tools').hidden = !has; $('hint').hidden = !has; stage.hidden = !has;
  document.querySelector('.modeSwitch').hidden = !has;
  $('aspect').value = `${P.w}x${P.h}`; $('fps').value = P.fps;
  renderScenes(); renderStrip(); renderInspector(); setTool(tool); setMode(mode);
}

function renderScenes() {
  $('scenes').innerHTML = '';
  P.scenes.forEach((sc, i) => {
    const b = document.createElement('button');
    b.className = 'scene' + (i === cur ? ' on' : '');
    b.innerHTML = `<img alt=""><div class="meta"><span></span><span>${sc.dur.toFixed(1)}s</span></div>`;
    b.querySelector('img').src = sc.image;
    b.querySelector('.meta span').textContent = sc.name;
    b.onclick = () => openScene(i);
    $('scenes').appendChild(b);
  });
}
function renderStrip() {
  const strip = $('strip'), { starts, total } = timeline(P);
  strip.querySelectorAll('.seg,.tick').forEach(e => e.remove());
  P.scenes.forEach((sc, i) => {
    const s = document.createElement('div');
    s.className = 'seg';
    Object.assign(s.style, { left: `${starts[i] / total * 100}%`, width: `${sc.dur / total * 100}%`, backgroundImage: `url("${sc.image}")` });
    s.innerHTML = `<b></b>`; s.firstChild.textContent = sc.name;
    strip.insertBefore(s, $('head'));
    for (const L of sc.layers) {
      const k = document.createElement('div');
      k.className = 'tick';
      Object.assign(k.style, { left: `${(starts[i] + (L.at || 0)) / total * 100}%`, background: COLOR[L.type] });
      strip.insertBefore(k, $('head'));
    }
  });
}

// ---------- Bảng thuộc tính
const SCENE_FIELDS = [
  ['name', 'Tên cảnh', 'text'], ['dur', 'Thời lượng (s)', 'num', 1, 60, .1],
  ['trans', 'Chuyển vào', 'select', TRANSITIONS], ['transDur', 'Độ dài chuyển (s)', 'range', .2, 1.5, .05],
  ['cam.zoom', 'Đẩy camera', 'range', 0, .4, .01], ['cam.dx', 'Trôi ngang', 'range', -300, 300, 1], ['cam.dy', 'Trôi dọc', 'range', -300, 300, 1],
  ['cam.rot', 'Xoay (°)', 'range', -6, 6, .1],
  ['look.bright', 'Độ sáng', 'range', .5, 1.5, .01], ['look.contrast', 'Tương phản', 'range', .5, 1.6, .01], ['look.sat', 'Độ đậm màu', 'range', 0, 2, .01],
];
const AT = ['at', 'Bắt đầu sau (s)', 'num', 0, 60, .05];
const LAYER_FIELDS = {
  pin: [AT, ['label', 'Mã lô / chữ', 'text'], ['labelAt', 'Chữ hiện sau (s)', 'num', 0, 10, .1], ['size', 'Cỡ ghim', 'range', .5, 3, .05], ['badge', 'Màu lõi ghim', 'color'], ['focus', 'Làm tối xung quanh', 'check']],
  route: [AT, ['dur', 'Thời gian chạy (s)', 'num', .2, 10, .1], ['color', 'Màu tia sáng', 'color'], ['width', 'Độ dày', 'range', .4, 3, .05]],
  callout: [AT, ['text', 'Nội dung', 'text'], ['stem', 'Độ dài chân', 'range', 0, 320, 1], ['color', 'Màu nhãn', 'color']],
  highlight: [AT, ['color', 'Màu tô', 'color'], ['blink', 'Nháy khi hiện', 'check']],
  tag: [AT, ['title', 'Tiêu đề', 'text'], ['rowsText', 'Dòng số liệu', 'area'], ['rot', 'Độ nghiêng (°)', 'range', -30, 30, .5]],
  ptext: [AT, ['text', 'Nội dung', 'area'], ['style', 'Kiểu chữ', 'select', [['road', 'Tên đường (vàng)'], ['water', 'Trên mặt nước'], ['white', 'Trắng đậm']]]],
};
const getK = (o, k) => k === 'rowsText' ? (o.rows || []).map(r => [r.label, r.value, r.unit].join(' | ')).join('\n') : k.split('.').reduce((a, x) => a?.[x], o);
function setK(o, k, v) {
  if (k === 'rowsText') { o.rows = v.split('\n').filter(Boolean).map(l => { const [label = '', value = '0', unit = ''] = l.split('|').map(s => s.trim()); return { label, value: parseFloat(value.replace(',', '.')) || 0, unit }; }); return; }
  const ks = k.split('.'), last = ks.pop();
  ks.reduce((a, x) => a[x] ||= {}, o)[last] = v;
}
const DEF = { transDur: .6, badge: '#0F7A45', 'cam.zoom': 0, 'cam.dx': 0, 'cam.dy': 0, 'cam.rot': 0, 'look.bright': 1, 'look.contrast': 1, 'look.sat': 1 };
function form(obj, defs) {
  const box = document.createElement('div');
  for (const [k, label, kind, a, b, step] of defs) {
    const row = document.createElement('label');
    row.className = 'field';
    row.innerHTML = `<span>${label}</span>`;
    let input, val = getK(obj, k) ?? DEF[k];
    if (kind === 'select') {
      input = document.createElement('select');
      for (const [v, l] of a) input.add(new Option(l, v, false, v === val));
    } else if (kind === 'area') {
      input = document.createElement('textarea'); input.value = val ?? '';
      if (k === 'rowsText') input.placeholder = 'DT đất | 109.3 | m²';
    } else {
      input = document.createElement('input');
      input.type = { num: 'number', range: 'range', color: 'color', check: 'checkbox' }[kind] || 'text';
      if (a !== undefined) { input.min = a; input.max = b; input.step = step; }
      if (kind === 'check') input.checked = val !== false && !!(val ?? true); else input.value = val ?? (kind === 'color' ? '#ffffff' : '');
    }
    let out;
    if (kind === 'range') {
      const wrap = document.createElement('div'); wrap.className = 'rangeRow';
      out = document.createElement('span'); out.className = 'val'; out.textContent = val;
      wrap.append(input, out); row.appendChild(wrap);
    } else row.appendChild(input);
    input.addEventListener('input', () => {
      const v = kind === 'check' ? input.checked : ['num', 'range'].includes(kind) ? parseFloat(input.value) : input.value;
      if (['num', 'range'].includes(kind) && Number.isNaN(v)) return;
      setK(obj, k, v);
      if (out) out.textContent = v;
      save(); redraw();
      if (k === 'dur' || k === 'at' || k === 'name') { renderStrip(); renderScenes(); }
    });
    box.appendChild(row);
  }
  return box;
}
// Xác nhận ngay trên nút: lần bấm đầu đổi nút sang đỏ, bấm lần nữa trong 3 giây mới thực hiện.
// Không dùng confirm() vì Chrome đang bị điều khiển tự động sẽ tự đóng hộp thoại, coi như bấm Huỷ.
function armed(b, label, fn) {
  return () => {
    if (b.dataset.armed) { clearTimeout(b._t); delete b.dataset.armed; b.classList.remove('armed'); return fn(); }
    const old = b.textContent;
    b.dataset.armed = 1; b.textContent = label; b.classList.add('armed');
    b._t = setTimeout(() => { delete b.dataset.armed; b.textContent = old; b.classList.remove('armed'); }, 3000);
  };
}
const btn = (text, fn, cls = '') => { const b = document.createElement('button'); b.textContent = text; b.onclick = fn; if (cls) b.className = cls; return b; };
const layerLabel = L => (L.label || L.text || L.title || NAME[L.type]).split('\n')[0].slice(0, 22);

function renderInspector() {
  const box = $('inspector');
  box.innerHTML = '';
  const sc = scene();
  if (!sc) { box.innerHTML = '<div class="eyebrow">Thuộc tính</div><p style="color:var(--mute);margin-top:10px">Chưa có cảnh nào.</p>'; return; }
  if (sel) {
    const top = document.createElement('div'); top.className = 'eyebrow';
    top.append(btn(`← ${sc.name}`, () => select(null), 'ghost'));
    box.append(top);
    const h = document.createElement('h3'); h.textContent = NAME[sel.type]; h.style.color = COLOR[sel.type];
    box.append(h, form(sel, LAYER_FIELDS[sel.type]));
    const i = sc.layers.indexOf(sel), row = document.createElement('div'); row.className = 'row';
    row.append(
      btn(sel.hidden ? 'Hiện lớp' : 'Ẩn lớp', () => { sel.hidden = !sel.hidden; save(); renderInspector(); redraw(); }),
      btn('Đưa lên', () => moveLayer(i, 1)), btn('Đưa xuống', () => moveLayer(i, -1)),
      btn('Xoá lớp', deleteSel, 'danger'));
    box.append(document.createElement('hr'), row);
    return;
  }
  const eb = document.createElement('div'); eb.className = 'eyebrow'; eb.textContent = 'Cảnh';
  box.append(eb, form(sc, SCENE_FIELDS));
  const r = document.createElement('div'); r.className = 'row';
  if (cur > 0) r.append(btn('▶ Xem thử chuyển cảnh', previewTrans));
  r.append(btn('Đổi ảnh', () => { replacing = true; $('imgInput').multiple = false; $('imgInput').click(); }),
    btn('↑', () => moveScene(-1)), btn('↓', () => moveScene(1)));
  const del = btn('Xoá cảnh', null, 'danger'); del.onclick = armed(del, 'Bấm lần nữa để xoá', deleteScene); r.append(del);
  box.append(r, document.createElement('hr'));
  const le = document.createElement('div'); le.className = 'eyebrow'; le.textContent = `Lớp (${sc.layers.length})`;
  const list = document.createElement('div'); list.className = 'layers';
  [...sc.layers].reverse().forEach(L => {
    const b = btn('', () => select(L), 'layer');
    b.innerHTML = `<i style="background:${COLOR[L.type]}"></i><span></span><em>${(L.at || 0).toFixed(2)}s</em>`;
    b.querySelector('span').textContent = layerLabel(L) + (L.hidden ? ' (ẩn)' : '');
    list.append(b);
  });
  if (!sc.layers.length) list.innerHTML = '<p style="color:var(--mute)">Chọn một công cụ bên trái khung xem rồi bấm lên ảnh.</p>';
  box.append(le, list);
}

// ---------- Thao tác
function openScene(i) {
  cur = i; sel = null; draft = []; stop();
  t = timeline(P).starts[i] || 0;
  setMode('edit'); renderScenes(); renderInspector(); redraw();
}
function select(L) { sel = L; renderInspector(); redraw(); }
function add(L) { scene().layers.push(L); sel = L; save(); renderInspector(); renderStrip(); redraw(); }
function deleteSel() {
  if (!sel) return;
  const ls = scene().layers; ls.splice(ls.indexOf(sel), 1); sel = null;
  save(); renderInspector(); renderStrip(); redraw();
}
function moveLayer(i, d) {
  const ls = scene().layers, j = i + d;
  if (j < 0 || j >= ls.length) return;
  [ls[i], ls[j]] = [ls[j], ls[i]]; save(); redraw();
}
function moveScene(d) {
  const j = cur + d;
  if (j < 0 || j >= P.scenes.length) return;
  [P.scenes[cur], P.scenes[j]] = [P.scenes[j], P.scenes[cur]]; cur = j;
  save(); renderAll(); redraw();
}
function deleteScene() {
  P.scenes.splice(cur, 1); cur = Math.max(0, cur - 1); sel = null;
  save(); renderAll(); redraw();
}
function finishDraft() {
  if (tool === 'route' && draft.length >= 2) add({ type: 'route', pts: draft, color: '#41E8FF', width: 1, at: .3, dur: 1.2 });
  else if (tool === 'highlight' && draft.length >= 3) add({ type: 'highlight', pts: draft, color: '#FFE600', blink: true, at: 0 });
  draft = []; redraw();
}
function setTool(name) {
  tool = name; draft = [];
  document.querySelectorAll('#tools button').forEach(b => b.classList.toggle('on', b.dataset.tool === name));
  $('hint').innerHTML = HINT[name];
  stage.classList.toggle('draw', name !== 'select');
  redraw();
}
function setMode(m) {
  mode = m;
  $('editMode').classList.toggle('on', m === 'edit'); $('viewMode').classList.toggle('on', m === 'view');
  redraw();
}

function toStage(e) {
  const r = stage.getBoundingClientRect();
  const q = camM.inverse().transformPoint({ x: (e.clientX - r.left) * P.w / r.width, y: (e.clientY - r.top) * P.h / r.height });
  return [Math.round(q.x), Math.round(q.y)];
}
const near = (a, b, tol) => Math.hypot(a[0] - b[0], a[1] - b[1]) < tol;
function inPoly(pts, [x, y]) {
  let ins = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) ins = !ins;
  }
  return ins;
}
function hit(L, p, tol) {
  const hs = handles(L), [x, y] = p;
  if (hs.some(h => near(h, p, tol))) return true;
  if (L.type === 'pin') return Math.abs(x - L.x) < 50 * (L.size || 1.3) && y < L.y + 10 && y > L.y - 130 * (L.size || 1.3);
  if (L.type === 'callout') return Math.abs(x - L.x) < 130 && y < L.y && y > L.y - (L.stem ?? 90) - 50;
  if (L.type === 'tag') return x < L.x + 20 && x > L.x - 560 && y > L.y - 110 && y < L.y + 200;
  if (L.type === 'route') return hs.some((h, i) => i && segDist(hs[i - 1], h, p) < tol);
  return inPoly(hs, p);
}
function segDist(a, b, p) {
  const dx = b[0] - a[0], dy = b[1] - a[1], k = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(p[0] - a[0] - k * dx, p[1] - a[1] - k * dy);
}
function setHandle(L, i, [x, y]) {
  if (L.pts) L.pts[i] = [x, y]; else if (L.quad) L.quad[i] = [x, y]; else { L.x = x; L.y = y; }
}

stage.addEventListener('pointerdown', e => {
  if (!scene() || e.button) return;
  if (mode === 'view') { stop(); setMode('edit'); }
  const p = toStage(e), sc = scene(), tol = 22 * P.w / stage.getBoundingClientRect().width;
  switch (tool) {
    case 'pin': return add({ type: 'pin', x: p[0], y: p[1], size: 1.3, at: .3, label: '', labelAt: 1, focus: false });
    case 'callout': return add({ type: 'callout', x: p[0], y: p[1], text: 'TIỆN ÍCH', stem: 90, color: '#2BD47A', at: .5 + .35 * sc.layers.filter(l => l.type === 'callout').length });
    case 'tag': return add({ type: 'tag', x: p[0], y: p[1], rot: -9, title: 'LIỀN KỀ GÓC', rows: [{ label: 'DT đất', value: 109.3, unit: 'm²' }, { label: 'DTXD', value: 323.2, unit: 'm²' }], at: .5 });
    case 'focus':
      sc.cam = { ...sc.cam, ox: p[0], oy: p[1] }; save(); setTool('select'); return;
    case 'route': case 'highlight':
      draft.push(p); return redraw();
    case 'ptext':
      draft.push(p);
      if (draft.length === 4) { add({ type: 'ptext', quad: draft, text: 'TÊN ĐƯỜNG', style: 'road', at: 1 }); draft = []; }
      return redraw();
  }
  if (sel) {
    const i = handles(sel).findIndex(h => near(h, p, tol));
    if (i >= 0 && !e.shiftKey) { drag = { L: sel, i }; stage.setPointerCapture(e.pointerId); return; }
  }
  const L = [...sc.layers].reverse().find(l => !l.hidden && hit(l, p, tol)) || null;
  select(L);
  if (L) { drag = { L, whole: true, last: p }; stage.setPointerCapture(e.pointerId); }
});
stage.addEventListener('pointermove', e => {
  if (!drag) return;
  const p = toStage(e);
  if (drag.whole) {
    const dx = p[0] - drag.last[0], dy = p[1] - drag.last[1];
    handles(drag.L).forEach((h, i) => setHandle(drag.L, i, [h[0] + dx, h[1] + dy]));
    drag.last = p;
  } else setHandle(drag.L, drag.i, p);
  redraw();
});
stage.addEventListener('pointerup', () => { if (drag) { drag = null; save(); } });
stage.addEventListener('dblclick', () => { if (tool === 'route' || tool === 'highlight') { draft.pop(); finishDraft(); } });

addEventListener('keydown', e => {
  if (e.target.closest?.('input,textarea,select')) return;
  if (e.key === 'Enter') return finishDraft();
  if (e.key === 'Escape') { if (draft.length) { draft = []; redraw(); } else setTool('select'); return; }
  if ((e.key === 'Delete' || e.key === 'Backspace') && sel) { e.preventDefault(); return deleteSel(); }
  if (e.key === ' ') { e.preventDefault(); return playing ? stop() : play(); }
  if (KEYS[e.key.toLowerCase()] && !e.ctrlKey && !e.metaKey && scene()) setTool(KEYS[e.key.toLowerCase()]);
});
$('tools').addEventListener('click', e => { const b = e.target.closest('button'); if (b) setTool(b.dataset.tool); });
$('editMode').onclick = () => { stop(); setMode('edit'); };
$('viewMode').onclick = () => setMode('view');

// ---------- Timeline & phát
function seekFromStrip(e) {
  const r = $('strip').getBoundingClientRect(), { total } = timeline(P);
  if (!total) return;
  t = Math.max(0, Math.min(total, (e.clientX - r.left) / r.width * total));
  const i = sceneAt(P, t).i;
  if (i !== cur) { cur = i; sel = null; renderScenes(); renderInspector(); }
  setMode('view');
}
$('strip').addEventListener('pointerdown', e => {
  stop(); seekFromStrip(e);
  const mv = ev => seekFromStrip(ev), up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); };
  addEventListener('pointermove', mv); addEventListener('pointerup', up);
});
function play() {
  const { total } = timeline(P);
  if (!total || exporting) return;
  if (t >= total - .01) t = 0;
  playing = true; $('play').textContent = '❚❚'; $('play').setAttribute('aria-label', 'Tạm dừng');
  sel = null; setMode('view');
  let last = performance.now();
  const loop = now => {
    if (!playing) return;
    t = Math.min(total, t + (now - last) / 1000); last = now;
    const i = sceneAt(P, t).i;
    if (i !== cur) { cur = i; renderScenes(); renderInspector(); }
    redraw();
    if (t >= total) stop(); else requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}
function previewTrans() {
  stop(); sel = null;
  t = Math.max(0, timeline(P).starts[cur] - .4); play();
  const end = timeline(P).starts[cur] + (scene().transDur || .6) + .6;
  const watch = () => { if (!playing) return; if (t >= end) { stop(); setMode('view'); } else requestAnimationFrame(watch); };
  requestAnimationFrame(watch);
}
function stop() { playing = false; $('play').textContent = '▶'; $('play').setAttribute('aria-label', 'Phát'); }
$('play').onclick = () => playing ? stop() : play();

// ---------- Ảnh, tệp dự án
async function fileToDataURL(f) {
  const url = URL.createObjectURL(f);
  const im = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
  const s = Math.min(1, 3840 / Math.max(im.naturalWidth, im.naturalHeight)), c = document.createElement('canvas');
  c.width = Math.round(im.naturalWidth * s); c.height = Math.round(im.naturalHeight * s);
  c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
  URL.revokeObjectURL(url);
  return c.toDataURL('image/jpeg', .92);
}
$('imgInput').addEventListener('change', async e => {
  const files = [...e.target.files].filter(f => f.type.startsWith('image/'));
  e.target.value = '';
  if (!files.length) return;
  if (replacing) { replacing = false; scene().image = await fileToDataURL(files[0]); }
  else for (const f of files) {
    P.scenes.push({ id: uid(), name: f.name.replace(/\.[^.]+$/, '').slice(0, 24), image: await fileToDataURL(f), dur: 4, trans: P.scenes.length ? 'fade' : 'cut', cam: { zoom: .08 }, look: {}, layers: [] });
    cur = P.scenes.length - 1;
  }
  sel = null; save(); renderAll(); openScene(cur);
});
const pickImages = () => { replacing = false; $('imgInput').multiple = true; $('imgInput').click(); };
$('addScene').onclick = pickImages; $('emptyAdd').onclick = pickImages;

function load(data) {
  if (!Array.isArray(data?.scenes)) throw new Error('Tệp này không phải dự án Phối Cảnh Studio.');
  P = { w: 1920, h: 1080, fps: 30, ...data }; cur = 0; sel = null; t = 0; draft = [];
  save(); renderAll(); openScene(0);
}
$('demoBtn').onclick = async () => load(await (await fetch('demo.json')).json());
$('saveBtn').onclick = () => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(P)], { type: 'application/json' }));
  a.download = `${scene()?.name || 'du-an'}.json`; a.click(); URL.revokeObjectURL(a.href);
};
$('openBtn').onclick = () => $('jsonInput').click();
$('jsonInput').addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = '';
  if (!f) return;
  try { load(JSON.parse(await f.text())); } catch (err) { alert(`Không mở được tệp: ${err.message}`); }
});
$('newBtn').onclick = armed($('newBtn'), 'Bấm lần nữa: bỏ dự án đang mở', () => {
  P = { w: P.w, h: P.h, fps: P.fps, scenes: [] }; cur = 0; sel = null; t = 0; save(); renderAll();
});
$('aspect').onchange = e => {
  const [w, h] = e.target.value.split('x').map(Number);
  P.w = w; P.h = h; save(); redraw();
};
$('fps').onchange = e => { P.fps = Number(e.target.value); save(); };

// ---------- Xuất MP4 ngay trên trình duyệt: dựng từng khung → WebCodecs H.264 → đóng gói MP4
$('exportBtn').onclick = async () => {
  if (exporting) { exporting.cancel = true; return; }
  if (!P.scenes.length) return alert('Thêm ít nhất một cảnh trước khi xuất video.');
  if (!('VideoEncoder' in window)) return alert('Trình duyệt này chưa hỗ trợ xuất video. Hãy mở bằng Chrome hoặc Edge bản mới.');
  stop();
  const b = $('exportBtn'), W = P.w, H = P.h, fps = P.fps || 30, n = Math.round(timeline(P).total * fps);
  exporting = { cancel: false };
  b.textContent = 'Đang chuẩn bị…';
  try {
    const { Muxer, ArrayBufferTarget } = await import('https://cdn.jsdelivr.net/npm/mp4-muxer@5.2.1/build/mp4-muxer.mjs');
    await Promise.all([...Object.values(imgs).map(i => i.decode().catch(() => {})), ...['600', '800', '900'].map(w => document.fonts.load(`${w} 40px ${FONT}`))]);
    let cfg;
    for (const codec of ['avc1.64002A', 'avc1.4D402A', 'avc1.42002A']) {
      const c = { codec, width: W, height: H, bitrate: fps > 30 ? 16e6 : 12e6, framerate: fps };
      if ((await VideoEncoder.isConfigSupported(c)).supported) { cfg = c; break; }
    }
    if (!cfg) throw new Error('Máy này không mã hoá được H.264 ở độ phân giải này.');
    const muxer = new Muxer({ target: new ArrayBufferTarget(), video: { codec: 'avc', width: W, height: H }, fastStart: 'in-memory' });
    let fail;
    const enc = new VideoEncoder({ output: (chunk, meta) => muxer.addVideoChunk(chunk, meta), error: err => fail = err });
    enc.configure(cfg);
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const c2 = cv.getContext('2d');
    for (let f = 0; f < n; f++) {
      if (exporting.cancel) throw new Error('cancel');
      if (fail) throw fail;
      drawFrame(c2, P, f / fps, imgs);
      const frame = new VideoFrame(cv, { timestamp: Math.round(f * 1e6 / fps), duration: Math.round(1e6 / fps) });
      enc.encode(frame, { keyFrame: f % (fps * 2) === 0 }); frame.close();
      while (enc.encodeQueueSize > 6) await new Promise(r => setTimeout(r, 2));
      if (f % 6 === 0) { b.textContent = `Đang xuất ${Math.round(f / n * 100)}% · Huỷ`; await new Promise(r => setTimeout(r)); }
    }
    await enc.flush(); muxer.finalize();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([muxer.target.buffer], { type: 'video/mp4' }));
    a.download = `${P.scenes[0].name || 'video'}.mp4`; a.click();
    window.lastExport = a.href;
  } catch (err) {
    if (err.message !== 'cancel') alert(`Xuất video không thành công: ${err.message}`);
  } finally {
    exporting = null; b.textContent = 'Xuất MP4';
  }
};

// ---------- Khởi động: chờ font để chữ trên canvas vẽ đúng, rồi mở lại dự án đã lưu
Promise.all(['600', '800', '900'].map(w => document.fonts.load(`${w} 40px ${FONT}`))).then(redraw);
idb().then(saved => { if (saved?.scenes) P = saved; renderAll(); if (P.scenes.length) openScene(0); });
renderAll();
