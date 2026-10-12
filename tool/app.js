import { drawFrame, timeline, sceneAt, handles, imageBox, textBox, FONTS, FONT_SAMPLE, TRANSITIONS, setOnMediaLoad, preloadMedia } from './render.js';
import { SFX, SFX_DEFAULT, playSfx, sfxCues, musicGain, mixAudio } from './audio.js';

const $ = id => document.getElementById(id);
const stage = $('stage'), ctx = stage.getContext('2d');
const COLOR = { pin: '#E9B23C', route: '#41E8FF', callout: '#2BD47A', highlight: '#FFE600', tag: '#C6E000', ptext: '#FFE34D', image: '#B9C6FF', text: '#F4F6FF' };
const NAME = { pin: 'Ghim', route: 'Tuyến sáng', callout: 'Nhãn', highlight: 'Tô khối', tag: 'Thông số', ptext: 'Chữ nghiêng', image: 'Ảnh chèn', text: 'Chữ tiêu đề' };
const HINT = {
  select: 'Bấm vào lớp để chọn · kéo <b>điểm</b> để sửa · giữ <b>Shift</b> khi kéo để dời cả lớp · <b>Delete</b> để xoá',
  pin: 'Bấm lên ảnh để đặt <b>ghim</b>',
  route: 'Bấm lần lượt các điểm dọc con đường · <b>Enter</b> hoặc bấm đúp để xong · <b>Esc</b> để huỷ',
  callout: 'Bấm vào vị trí tiện ích để đặt <b>nhãn</b>',
  highlight: 'Bấm các góc quanh khối nhà · <b>Enter</b> hoặc bấm đúp để xong',
  tag: 'Bấm vào chỗ đặt <b>mép phải</b> của thẻ thông số',
  ptext: 'Bấm 4 góc mặt phẳng theo thứ tự <b>trái trên → phải trên → phải dưới → trái dưới</b>',
  image: 'Bấm vào chỗ muốn đặt ảnh rồi <b>chọn tệp ảnh</b> · kéo chấm góc để đổi cỡ',
  text: 'Bấm vào chỗ đặt <b>chữ tiêu đề</b> (điểm bấm là mép trái dòng chữ lớn)',
  focus: 'Bấm vào điểm camera sẽ đẩy vào',
};
const KEYS = { v: 'select', g: 'pin', t: 'route', n: 'callout', k: 'highlight', s: 'tag', p: 'ptext', a: 'image', x: 'text', c: 'focus' };

let P = { w: 1920, h: 1080, fps: 30, scenes: [] };
let panel = null, cur = 0, sel = null, tool = 'select', draft = [], mode = 'edit', t = 0, playing = false, camM = new DOMMatrix(), drag = null, replacing = false, exporting = null, imgAt = null;
const imgs = {};
const uid = () => Math.random().toString(36).slice(2, 9);
const scene = () => P.scenes[cur];
const thumbOf = sc => sc.thumb || sc.image;

// ---------- Lưu tự động vào trình duyệt (IndexedDB chứa được ảnh, video nặng; localStorage thì không)
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
// Hoàn tác / Làm lại: chụp trạng thái dự án sau mỗi lần sửa (các thay đổi liên tiếp trong 0,4 giây gộp làm một).
// Ảnh, video, nhạc (chuỗi dài, Blob) được giữ một bản dùng chung, ảnh chụp chỉ lưu mã tham chiếu nên rất nhẹ.
const pool = new Map(), poolRev = new Map();
const ref = v => { if (!poolRev.has(v)) { const id = `#${pool.size}`; pool.set(id, v); poolRev.set(v, id); } return poolRev.get(v); };
const snap = () => JSON.stringify(P, (k, v) => v instanceof Blob || (typeof v === 'string' && v.length > 2000) ? { $ref: ref(v) } : v);
const unsnap = str => JSON.parse(str, (k, v) => v && typeof v === 'object' && v.$ref ? pool.get(v.$ref) : v);
let saveTimer = null, undoStack = [], redoStack = [], lastSnap = null;
function commit() {
  clearTimeout(saveTimer); saveTimer = null;
  const now = snap();
  if (lastSnap !== null && now !== lastSnap) { undoStack.push(lastSnap); if (undoStack.length > 100) undoStack.shift(); redoStack = []; }
  lastSnap = now; idb(P); updateUndo();
}
const save = () => { clearTimeout(saveTimer); saveTimer = setTimeout(commit, 400); };
const step = fn => { if (saveTimer) commit(); fn(); commit(); };
function undoRedo(from, to) {
  if (saveTimer) commit();
  if (!from.length) return;
  to.push(lastSnap); lastSnap = from.pop(); P = unsnap(lastSnap);
  cur = Math.min(cur, Math.max(0, P.scenes.length - 1)); sel = null; draft = [];
  idb(P); renderAll(); redraw(); updateUndo();
}
const undo = () => undoRedo(undoStack, redoStack), redo = () => undoRedo(redoStack, undoStack);
function updateUndo() { $('undoBtn').disabled = !undoStack.length && !saveTimer; $('redoBtn').disabled = !redoStack.length; }

// ---------- Ảnh / video nền của các cảnh
// Video phải nằm trong trang (dù rất nhỏ) thì trình duyệt mới báo đúng lúc khung hình đã sẵn sàng sau khi tua
const vbox = document.createElement('div');
vbox.style.cssText = 'position:fixed;right:0;bottom:0;width:2px;height:2px;overflow:hidden;opacity:.01;pointer-events:none';
document.body.append(vbox);
function syncMedia() {
  for (const sc of P.scenes) {
    const old = imgs[sc.id];
    if (sc.kind === 'video') {
      if (old?._blob === sc.video) continue;
      const v = document.createElement('video');
      Object.assign(v, { muted: true, playsInline: true, preload: 'auto', _blob: sc.video, src: URL.createObjectURL(sc.video) });
      v.onloadeddata = v.onseeked = () => { if (!playing && !exporting) redraw(); };
      vbox.append(v); old?.remove?.(); imgs[sc.id] = v;
    } else if (old?.dataset?.src !== sc.image) {
      const im = new Image();
      im.dataset.src = sc.image; im.onload = redraw; im.src = sc.image;
      old?.remove?.(); imgs[sc.id] = im;
    }
  }
}
function activeScenes(time) {
  if (mode === 'edit' && !exporting) return [[cur, 0]];
  const { i, u } = sceneAt(P, time), sc = P.scenes[i], out = [[i, u]];
  if (i > 0 && sc.trans !== 'cut' && u < (sc.transDur || .6)) out.push([i - 1, P.scenes[i - 1].dur + u]);
  return out;
}
const videoTime = (sc, u, v) => Math.max(0, Math.min((sc.trim || 0) + u, (v.duration || 1e9) - .05));
function syncVideos() {
  const act = new Map(activeScenes(t));
  P.scenes.forEach((sc, i) => {
    const v = imgs[sc.id];
    if (sc.kind !== 'video' || !v) return;
    if (!act.has(i)) { if (!v.paused) v.pause(); return; }
    const target = videoTime(sc, act.get(i), v);
    v.muted = !(playing && sc.audio); v.volume = Math.min(1, sc.audioVol ?? 1);
    if (playing) { if (v.paused) v.play().catch(() => {}); if (Math.abs(v.currentTime - target) > .3) v.currentTime = target; }
    else { if (!v.paused) v.pause(); if (Math.abs(v.currentTime - target) > .03) v.currentTime = target; }
  });
}
// Khi xuất: tua video đến đúng khung rồi chờ trình duyệt dựng xong khung đó
async function seekVideos(time) {
  await Promise.all(activeScenes(time).map(([i, u]) => {
    const sc = P.scenes[i], v = imgs[sc.id];
    if (sc.kind !== 'video' || !v) return;
    const target = videoTime(sc, u, v);
    if (Math.abs(v.currentTime - target) < 1e-3) return;
    return new Promise(res => {
      let done = false;
      const fin = () => { if (!done) { done = true; res(); } };
      v.requestVideoFrameCallback?.(fin);
      v.addEventListener('seeked', () => setTimeout(fin, 120), { once: true });
      setTimeout(fin, 2000);
      v.currentTime = target;
    });
  }));
}

function redraw() {
  if (stage.width !== P.w || stage.height !== P.h) { stage.width = P.w; stage.height = P.h; }
  syncVideos();
  camM = drawFrame(ctx, P, t, imgs, { edit: mode === 'edit', scene: cur, selected: mode === 'edit' ? sel : null, draft });
  const { total } = timeline(P);
  $('clock').innerHTML = `${t.toFixed(1)} <small>/ ${total.toFixed(1)} s</small>`;
  $('head').style.left = `${total ? t / total * 100 : 0}%`;
  $('head').style.display = mode === 'view' || playing ? '' : 'none';
  $('strip').querySelectorAll('.seg').forEach((s, i) => s.classList.toggle('on', i === cur));
  $('total').textContent = `${P.scenes.length} · ${total.toFixed(1)}s`;
}
setOnMediaLoad(() => { if (!playing && !exporting) redraw(); });
function renderAll() {
  syncMedia();
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
    b.innerHTML = `<img alt=""><div class="meta"><span></span><span>${sc.kind === 'video' ? '▶ ' : ''}${sc.dur.toFixed(1)}s</span></div>`;
    b.querySelector('img').src = thumbOf(sc);
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
    Object.assign(s.style, { left: `${starts[i] / total * 100}%`, width: `${sc.dur / total * 100}%`, backgroundImage: `url("${thumbOf(sc)}")` });
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
// Mỗi trường: [khoá, nhãn, kiểu, min|danh sách chọn, max, bước, điều kiện hiện]; ['#', 'Tên nhóm'] là tiêu đề nhóm
const SCENE_FIELDS = [
  ['name', 'Tên cảnh', 'text'], ['dur', 'Thời lượng (s)', 'num', 1, 120, .1],
  ['trim', 'Video bắt đầu từ (s)', 'num', 0, 3600, .1, sc => sc.kind === 'video'],
  ['audio', 'Giữ tiếng gốc của video', 'check', , , , sc => sc.kind === 'video'], ['audioVol', 'Âm lượng tiếng gốc', 'range', 0, 2, .05, sc => sc.kind === 'video' && sc.audio],
  ['trans', 'Chuyển vào', 'select', TRANSITIONS], ['transDur', 'Độ dài chuyển (s)', 'range', .2, 1.5, .05],
  ['#', 'Camera'],
  ['cam.zoom', 'Đẩy camera', 'range', 0, .4, .01], ['cam.dx', 'Trôi ngang', 'range', -300, 300, 1], ['cam.dy', 'Trôi dọc', 'range', -300, 300, 1],
  ['cam.rot', 'Xoay (°)', 'range', -6, 6, .1],
  ['#', 'Màu ảnh'],
  ['look.bright', 'Độ sáng', 'range', .5, 1.5, .01], ['look.contrast', 'Tương phản', 'range', .5, 1.6, .01], ['look.sat', 'Độ đậm màu', 'range', 0, 2, .01],
];
const TIME = [['#', 'Thời gian'], ['at', 'Bắt đầu sau (s)', 'num', 0, 120, .05], ['end', 'Ẩn sau (s) · 0 = giữ đến hết', 'num', 0, 120, .1], ['opacity', 'Độ trong suốt', 'range', .05, 1, .01],
  ['#', 'Âm thanh'], ['sfx', 'Khi hiện phát', 'select', SFX], ['sfxVol', 'Âm lượng', 'range', 0, 2, .05, L => L.sfx && L.sfx !== 'none']];
const notDot = L => L.style !== 'dot';
const LAYER_FIELDS = {
  pin: [
    ['#', 'Ghim'], ['style', 'Kiểu ghim', 'select', [['pin', 'Ghim giọt nước'], ['dot', 'Chấm nhấp nháy']]], ['pinColor', 'Màu ghim', 'color'], ['size', 'Cỡ ghim', 'range', .5, 3, .05],
    ['icon', 'Biểu tượng lõi', 'select', [['house', 'Ngôi nhà'], ['building', 'Toà nhà'], ['star', 'Ngôi sao'], ['text', 'Chữ / số'], ['image', 'Logo tải lên']], , , notDot],
    ['iconText', 'Chữ trong lõi', 'text', , , , L => notDot(L) && L.icon === 'text'], ['iconImg', 'Logo lõi ghim', 'file', , , , L => notDot(L) && L.icon === 'image'],
    ['badge', 'Màu lõi', 'color', , , , notDot],
    ['#', 'Hiệu ứng'], ['drop', 'Rơi từ trên xuống', 'check'], ['beam', 'Tia sáng chiếu xuống', 'check'], ['flare', 'Quầng sáng chân ghim', 'check'],
    ['rings', 'Vòng sóng lan', 'check'], ['ringColor', 'Màu vòng sóng', 'color', , , , L => L.rings !== false], ['focus', 'Làm tối xung quanh', 'check'],
    ['#', 'Chữ trên ghim (mã lô)'], ['label', 'Nội dung', 'text'], ['labelAt', 'Hiện sau (s)', 'num', 0, 10, .1],
    ['labelPos', 'Vị trí', 'select', [['above', 'Trên ghim'], ['below', 'Dưới ghim'], ['right', 'Bên phải']]], ['labelSize', 'Cỡ chữ', 'range', 30, 180, 1],
    ['labelStyle', 'Màu chữ', 'select', [['gold', 'Vàng kim'], ['white', 'Trắng'], ['color', 'Màu tự chọn']]], ['labelColor', 'Chọn màu', 'color', , , , L => L.labelStyle === 'color'],
  ],
  route: [
    ['#', 'Tuyến'], ['color', 'Màu tia sáng', 'color'], ['coreColor', 'Màu lõi', 'color'], ['width', 'Độ dày', 'range', .4, 3, .05], ['glow', 'Độ toả sáng', 'range', 0, 2, .05],
    ['line', 'Kiểu nét', 'select', [['solid', 'Liền'], ['dash', 'Nét đứt chạy'], ['dots', 'Chấm tròn']]],
    ['#', 'Chuyển động'], ['reveal', 'Cách hiện', 'select', [['draw', 'Vẽ dần theo đường'], ['show', 'Hiện cả tuyến']]],
    ['dur', 'Thời gian vẽ (s)', 'num', .2, 20, .1, L => L.reveal !== 'show'], ['particles', 'Hạt sáng chạy', 'check'], ['speed', 'Tốc độ chạy', 'range', .2, 3, .05],
    ['#', 'Phương tiện'],
    ['vehicle', 'Chạy theo tuyến', 'select', [['none', 'Không'], ['dot', 'Chấm sáng'], ['car', 'Ô tô 🚗'], ['bus', 'Xe buýt 🚌'], ['train', 'Tàu điện 🚆'], ['plane', 'Máy bay ✈️'], ['boat', 'Ca nô 🛥️'], ['bike', 'Xe máy 🛵']]],
    ['vehicleSize', 'Cỡ phương tiện', 'range', .4, 3, .05, L => !['none', 'dot', undefined].includes(L.vehicle)], ['loop', 'Chạy lặp sau khi đến nơi', 'check', , , , L => L.vehicle && L.vehicle !== 'none'],
  ],
  callout: [
    ['#', 'Nhãn'], ['text', 'Nội dung', 'text'], ['icon', 'Biểu tượng đầu (emoji)', 'text'],
    ['style', 'Kiểu nhãn', 'select', [['green', 'Viên màu (tự chọn màu)'], ['dark', 'Nền tối chữ vàng'], ['glass', 'Trắng mờ'], ['gold', 'Vàng kim']]],
    ['color', 'Màu nhãn', 'color', , , , L => (L.style || 'green') === 'green'], ['textColor', 'Màu chữ', 'color'], ['fontSize', 'Cỡ chữ', 'range', 14, 56, 1], ['square', 'Góc vuông', 'check'],
    ['#', 'Chân & hiệu ứng'], ['dir', 'Nhãn nằm', 'select', [['up', 'Phía trên điểm'], ['down', 'Phía dưới điểm']]], ['stem', 'Độ dài chân', 'range', 0, 320, 1],
    ['anim', 'Kiểu hiện', 'select', [['pop', 'Bật nảy'], ['slide', 'Trượt vào'], ['fade', 'Mờ dần']]],
  ],
  highlight: [
    ['#', 'Tô khối'], ['style', 'Kiểu', 'select', [['fill', 'Tô đặc'], ['outline', 'Viền phát sáng'], ['both', 'Tô + viền']]],
    ['color', 'Màu tô', 'color', , , , L => L.style !== 'outline'], ['strength', 'Độ đậm', 'range', .1, 1, .01, L => L.style !== 'outline'],
    ['lineColor', 'Màu viền', 'color', , , , L => (L.style || 'fill') !== 'fill'], ['lineWidth', 'Độ dày viền', 'range', 1, 24, 1, L => (L.style || 'fill') !== 'fill'],
    ['#', 'Hiệu ứng'], ['blinks', 'Số lần nháy', 'range', 0, 6, 1], ['pulse', 'Nhịp sáng liên tục', 'check'],
  ],
  tag: [
    ['#', 'Tiêu đề'], ['title', 'Nội dung', 'text'],
    ['titleStyle', 'Màu', 'select', [['lime', 'Xanh chanh'], ['gold', 'Vàng kim'], ['white', 'Trắng'], ['color', 'Màu tự chọn']]], ['titleColor', 'Chọn màu', 'color', , , , L => L.titleStyle === 'color'],
    ['titleSize', 'Cỡ chữ', 'range', 40, 180, 1], ['titleAnim', 'Kiểu hiện', 'select', [['pop', 'Bật từng chữ'], ['type', 'Gõ chữ'], ['fade', 'Mờ dần']]],
    ['#', 'Số liệu'], ['rowsText', 'Các dòng', 'area'], ['numSize', 'Cỡ số', 'range', 30, 140, 1], ['rowColor', 'Màu số', 'color'], ['count', 'Số chạy đếm lên', 'check'],
    ['#', 'Bố cục'], ['align', 'Căn theo', 'select', [['right', 'Mép phải (điểm đặt)'], ['left', 'Mép trái (điểm đặt)']]], ['rot', 'Độ nghiêng (°)', 'range', -30, 30, .5],
  ],
  ptext: [
    ['#', 'Chữ'], ['text', 'Nội dung', 'area'], ['style', 'Kiểu có sẵn', 'select', [['road', 'Tên đường (vàng)'], ['water', 'Trên mặt nước'], ['white', 'Trắng đậm']]],
    ['color', 'Màu chữ', 'color'], ['weight', 'Độ đậm', 'select', [['', 'Theo kiểu'], ['600', 'Vừa'], ['800', 'Đậm'], ['900', 'Rất đậm']]],
    ['glow', 'Độ phát sáng', 'range', 0, 60, 1], ['blend', 'Hoà màu', 'select', [['', 'Theo kiểu'], ['normal', 'Bình thường'], ['screen', 'Hoà sáng (hợp mặt nước)']]],
    ['anim', 'Kiểu hiện', 'select', [['', 'Theo kiểu'], ['spread', 'Giãn rồi thu'], ['chars', 'Hiện từng ký tự'], ['fade', 'Mờ dần']]],
  ],
  text: [
    ['#', 'Chữ'], ['kicker', 'Dòng viết tay (nhỏ, phía trên)', 'text'], ['text', 'Dòng chính', 'text'], ['upper', 'Viết hoa dòng chính', 'check'],
    ['font', 'Font dòng chính', 'select', [['sans', 'Be Vietnam Pro (hiện đại)'], ['display', 'Montserrat (mạnh)'], ['serif', 'Playfair (sang trọng)']]],
    ['size', 'Cỡ chữ', 'range', 24, 260, 1], ['kickerScale', 'Cỡ dòng viết tay', 'range', .3, 1.2, .01], ['spacing', 'Giãn chữ', 'range', -4, 30, .5],
    ['color', 'Màu dòng chính', 'color'], ['kickerColor', 'Màu dòng viết tay', 'color'],
    ['#', 'Bố cục & hiệu ứng'], ['align', 'Căn theo điểm đặt', 'select', [['left', 'Trái'], ['center', 'Giữa'], ['right', 'Phải']]],
    ['anim', 'Kiểu hiện', 'select', [['rise', 'Trượt lên + rõ dần'], ['mask', 'Quét lộ từ trái'], ['type', 'Gõ chữ'], ['letters', 'Bật từng chữ'], ['zoom', 'Phóng nhẹ']]],
    ['bg', 'Nền chữ', 'select', [['none', 'Không'], ['bar', 'Dải tối mờ phía sau']]], ['shadow', 'Bóng đổ', 'check'], ['screen', 'Cố định trên màn hình (không theo camera)', 'check'],
  ],
  image: [
    ['#', 'Ảnh'], ['src', 'Tệp ảnh', 'file'], ['w', 'Chiều rộng (px)', 'range', 40, 1920, 1], ['rot', 'Xoay (°)', 'range', -45, 45, .5],
    ['frame', 'Khung', 'select', [['none', 'Không khung (giữ nền trong suốt)'], ['round', 'Bo góc'], ['white', 'Viền trắng kiểu ảnh in'], ['circle', 'Hình tròn']]],
    ['radius', 'Độ bo góc', 'range', 0, 160, 1, L => L.frame === 'round'], ['border', 'Viền (px)', 'range', 0, 20, 1, L => (L.frame || 'none') !== 'none'],
    ['borderColor', 'Màu viền', 'color', , , , L => L.border > 0], ['shadow', 'Bóng đổ', 'check'],
    ['#', 'Chuyển động'], ['anim', 'Kiểu hiện', 'select', [['fade', 'Mờ dần'], ['zoom', 'Phóng to dần'], ['slide', 'Trượt lên'], ['pop', 'Bật nảy']]],
    ['float', 'Nhấp nhô nhẹ', 'check'], ['screen', 'Cố định trên màn hình (không theo camera)', 'check'],
  ],
};
// Giá trị mặc định để ô nhập hiển thị đúng khi lớp chưa đặt giá trị (bộ vẽ cũng dùng đúng các mặc định này)
const DEF = {
  transDur: .6, 'cam.zoom': 0, 'cam.dx': 0, 'cam.dy': 0, 'cam.rot': 0, 'look.bright': 1, 'look.contrast': 1, 'look.sat': 1, trim: 0, end: 0, opacity: 1,
  'pin:style': 'pin', 'pin:pinColor': '#E9B23C', 'pin:icon': 'house', 'pin:badge': '#0F7A45', 'pin:drop': true, 'pin:beam': true, 'pin:flare': true, 'pin:rings': true,
  'pin:ringColor': '#FFE08A', 'pin:focus': false, 'pin:labelPos': 'above', 'pin:labelSize': 92, 'pin:labelStyle': 'gold', 'pin:labelColor': '#FFFFFF',
  'route:coreColor': '#E9FDFF', 'route:glow': 1, 'route:line': 'solid', 'route:reveal': 'draw', 'route:particles': true, 'route:speed': 1, 'route:vehicle': 'none', 'route:vehicleSize': 1, 'route:loop': false,
  'callout:style': 'green', 'callout:color': '#2BD47A', 'callout:textColor': '#FFFFFF', 'callout:fontSize': 22, 'callout:square': false, 'callout:dir': 'up', 'callout:stem': 90, 'callout:anim': 'pop',
  'highlight:style': 'fill', 'highlight:strength': .9, 'highlight:lineColor': '#FFF27A', 'highlight:lineWidth': 6, 'highlight:blinks': 2, 'highlight:pulse': false,
  'tag:titleStyle': 'lime', 'tag:titleColor': '#FFFFFF', 'tag:titleSize': 96, 'tag:titleAnim': 'pop', 'tag:numSize': 78, 'tag:rowColor': '#FFFFFF', 'tag:count': true, 'tag:align': 'right', 'tag:rot': -9,
  'ptext:color': '#FFE34D', 'ptext:weight': '', 'ptext:glow': 24, 'ptext:blend': '', 'ptext:anim': '',
  'text:upper': true, 'text:font': 'sans', 'text:size': 96, 'text:kickerScale': .6, 'text:spacing': 2, 'text:color': '#FFFFFF', 'text:kickerColor': '#FFFFFF', 'text:align': 'left', 'text:anim': 'rise', 'text:bg': 'none', 'text:shadow': true, 'text:screen': true,
  sfx: 'none', sfxVol: 1, audio: false, audioVol: 1, musicVol: .8, musicOffset: 0, musicFadeIn: 1, musicFadeOut: 2, musicLoop: true, sfxOn: true, 'project:sfxVol': .8,
  'image:w': 360, 'image:rot': 0, 'image:frame': 'none', 'image:radius': 24, 'image:border': 0, 'image:borderColor': '#FFFFFF', 'image:shadow': true, 'image:anim': 'fade', 'image:float': false, 'image:screen': false,
};
const defOf = (o, k) => DEF[`${o.type || (o === P ? 'project' : 'scene')}:${k}`] ?? DEF[k];
const getK = (o, k) => k === 'rowsText' ? (o.rows || []).map(r => [r.label, r.value, r.unit].join(' | ')).join('\n') : k.split('.').reduce((a, x) => a?.[x], o);
function setK(o, k, v) {
  if (k === 'rowsText') { o.rows = v.split('\n').filter(Boolean).map(l => { const [label = '', value = '0', unit = ''] = l.split('|').map(s => s.trim()); return { label, value: parseFloat(value.replace(',', '.')) || 0, unit }; }); return; }
  const ks = k.split('.'), last = ks.pop();
  ks.reduce((a, x) => a[x] ||= {}, o)[last] = v;
}
// Nhóm đang thu gọn trong bảng thuộc tính, nhớ giữa các lần mở (chỉ là tiện ích cho người dùng)
const closed = new Set((() => { try { return JSON.parse(localStorage.getItem('pcs-closed') || '[]'); } catch { return []; } })());
function form(obj, defs) {
  const box = document.createElement('div');
  let hide = false;
  for (const [k, label, kind, a, b, step, show] of defs) {
    if (k === '#') {
      const key = `${obj.type || (obj === P ? 'project' : 'scene')}:${label}`, h = btn(label, () => {
        closed.has(key) ? closed.delete(key) : closed.add(key);
        try { localStorage.setItem('pcs-closed', JSON.stringify([...closed])); } catch {}
        renderInspector();
      }, 'group');
      hide = closed.has(key); h.classList.toggle('closed', hide); h.setAttribute('aria-expanded', !hide);
      box.appendChild(h); continue;
    }
    if (hide || (show && !show(obj))) continue;
    const row = document.createElement('label');
    row.className = kind === 'check' ? 'field check' : 'field';
    row.innerHTML = `<span>${label}</span>`;
    let input, val = getK(obj, k) ?? defOf(obj, k);
    if (kind === 'file') {
      const wrap = document.createElement('div'); wrap.className = 'row';
      const audio = a === 'audio/*';
      wrap.append(btn(val ? (audio ? 'Đổi nhạc…' : 'Đổi ảnh…') : (audio ? 'Chọn tệp nhạc…' : 'Chọn ảnh…'), () => pickFile(a || 'image/*', async f => {
        setK(obj, k, audio ? f : await fileToDataURL(f, { alpha: true, max: 1600 }));
        if (audio) obj.musicName = f.name;
        save(); renderInspector(); redraw();
      })));
      if (audio && val) { const n = document.createElement('small'); n.className = 'fname'; n.textContent = obj.musicName || 'đã chọn'; wrap.append(n); }
      if (val && k !== 'src') wrap.append(btn('Bỏ', () => { delete obj[k]; if (audio) delete obj.musicName; save(); renderInspector(); redraw(); }, 'ghost'));
      row.appendChild(wrap); box.appendChild(row); continue;
    }
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
      if (kind === 'check') input.checked = !!val; else input.value = val ?? (kind === 'color' ? '#ffffff' : '');
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
      // các ô phụ thuộc (vd. chọn "Màu tự chọn" mới hiện ô chọn màu) cần dựng lại bảng
      if (kind === 'select' || kind === 'check') renderInspector();
    });
    box.appendChild(row);
  }
  return box;
}
// Xác nhận ngay trên nút: lần bấm đầu đổi nút sang đỏ, bấm lần nữa trong 3 giây mới thực hiện.
// Không dùng confirm() vì Chrome đang bị điều khiển tự động sẽ tự đóng hộp thoại, coi như bấm Huỷ.
function armed(b, label, fn) {
  const reset = () => { clearTimeout(b._t); delete b.dataset.armed; b.textContent = b._label; b.classList.remove('armed'); };
  return () => {
    if (b.dataset.armed) { reset(); return fn(); }
    b._label = b.textContent; b.dataset.armed = 1; b.textContent = label; b.classList.add('armed');
    b._t = setTimeout(reset, 3000);
  };
}
const btn = (text, fn, cls = '') => { const b = document.createElement('button'); b.type = 'button'; b.textContent = text; b.onclick = fn; if (cls) b.className = cls; return b; };
const layerLabel = L => (L.label || L.text || L.title || NAME[L.type]).split('\n')[0].slice(0, 22);

const PROJECT_FIELDS = [
  ['#', 'Nhạc nền'], ['music', 'Tệp nhạc', 'file', 'audio/*'], ['musicVol', 'Âm lượng nhạc', 'range', 0, 1, .01, o => o.music],
  ['musicOffset', 'Bắt đầu từ giây (trong bài)', 'num', 0, 3600, .5, o => o.music], ['musicFadeIn', 'Mờ vào đầu (s)', 'range', 0, 6, .1, o => o.music],
  ['musicFadeOut', 'Mờ ra cuối (s)', 'range', 0, 10, .1, o => o.music], ['musicLoop', 'Lặp lại nếu bài ngắn hơn video', 'check', , , , o => o.music],
  ['#', 'Hiệu ứng âm thanh'], ['sfxOn', 'Bật hiệu ứng âm thanh', 'check'], ['sfxVol', 'Âm lượng chung', 'range', 0, 1.5, .01, o => o.sfxOn !== false],
];
function renderInspector() {
  const box = $('inspector'), keep = box.scrollTop;
  box.innerHTML = '';
  $('audioBtn').classList.toggle('on', panel === 'audio');
  if (panel === 'audio') {
    const top = document.createElement('div'); top.className = 'eyebrow';
    top.append(btn('← Về cảnh', () => { panel = null; renderInspector(); }, 'ghost'));
    const h = document.createElement('h3'); h.textContent = 'Âm thanh của video';
    const tip = document.createElement('p'); tip.className = 'tip';
    tip.textContent = 'Tiếng gốc của từng video nền bật trong bảng của cảnh đó. Âm thanh khi hiện của mỗi ghim, nhãn, tuyến… chỉnh trong bảng của lớp, nhóm "Âm thanh".';
    box.append(top, h, form(P, PROJECT_FIELDS));
    box.append(document.createElement('hr'), tip);
    return;
  }
  const sc = scene();
  if (!sc) { box.innerHTML = '<div class="eyebrow">Thuộc tính</div><p style="color:var(--mute);margin-top:10px">Chưa có cảnh nào.</p>'; return; }
  if (sel) {
    const top = document.createElement('div'); top.className = 'eyebrow';
    top.append(btn(`← ${sc.name}`, () => select(null), 'ghost'));
    box.append(top);
    const h = document.createElement('h3'); h.textContent = NAME[sel.type]; h.style.color = COLOR[sel.type];
    box.append(h, form(sel, [...LAYER_FIELDS[sel.type], ...TIME]));
    const i = sc.layers.indexOf(sel), row = document.createElement('div'); row.className = 'row';
    row.append(
      btn(sel.hidden ? 'Hiện lớp' : 'Ẩn lớp', () => { sel.hidden = !sel.hidden; save(); renderInspector(); redraw(); }),
      btn('Nhân đôi', () => { const c = structuredClone(sel); handles(c).forEach((h, j) => setHandle(c, j, [h[0] + 40, h[1] + 40])); add(c); }),
      btn('Đưa lên', () => moveLayer(i, 1)), btn('Đưa xuống', () => moveLayer(i, -1)),
      btn('Xoá lớp', deleteSel, 'danger'));
    box.append(document.createElement('hr'), row);
    box.scrollTop = keep;
    return;
  }
  const eb = document.createElement('div'); eb.className = 'eyebrow'; eb.textContent = sc.kind === 'video' ? 'Cảnh · video' : 'Cảnh · ảnh';
  box.append(eb, form(sc, SCENE_FIELDS));
  const r = document.createElement('div'); r.className = 'row';
  if (cur > 0) r.append(btn('▶ Xem thử chuyển cảnh', previewTrans));
  r.append(btn('Đổi ảnh / video', () => { replacing = true; $('imgInput').multiple = false; $('imgInput').click(); }),
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
  box.scrollTop = keep;
}

// ---------- Thao tác
function openScene(i) {
  cur = i; sel = null; panel = null; draft = []; stop();
  t = timeline(P).starts[i] || 0;
  setMode('edit'); renderScenes(); renderInspector(); redraw();
}
function select(L) { sel = L; if (L) panel = null; $('inspector').scrollTop = 0; renderInspector(); redraw(); }
function add(L) { L.sfx ??= SFX_DEFAULT[L.type] || 'none'; step(() => scene().layers.push(L)); sel = L; $('inspector').scrollTop = 0; renderInspector(); renderStrip(); redraw(); }
function deleteSel() {
  if (!sel) return;
  const ls = scene().layers; step(() => ls.splice(ls.indexOf(sel), 1)); sel = null;
  renderInspector(); renderStrip(); redraw();
}
function moveLayer(i, d) {
  const ls = scene().layers, j = i + d;
  if (j < 0 || j >= ls.length) return;
  step(() => { [ls[i], ls[j]] = [ls[j], ls[i]]; }); redraw();
}
function moveScene(d) {
  const j = cur + d;
  if (j < 0 || j >= P.scenes.length) return;
  step(() => { [P.scenes[cur], P.scenes[j]] = [P.scenes[j], P.scenes[cur]]; }); cur = j;
  renderAll(); redraw();
}
function deleteScene() {
  step(() => P.scenes.splice(cur, 1)); cur = Math.max(0, cur - 1); sel = null;
  renderAll(); redraw();
}
function finishDraft() {
  if (tool === 'route' && draft.length >= 2) add({ type: 'route', pts: draft, color: '#41E8FF', width: 1, at: .3, dur: 1.2 });
  else if (tool === 'highlight' && draft.length >= 3) add({ type: 'highlight', pts: draft, color: '#FFE600', blinks: 2, at: 0 });
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
  const hs = handles(L), [x, y] = p, s = L.size || 1.3;
  if (hs.some(h => near(h, p, tol))) return true;
  if (L.type === 'pin') return Math.abs(x - L.x) < 50 * s && y < L.y + 10 && y > L.y - 130 * s;
  if (L.type === 'callout') { const st = L.stem ?? 90, f = (L.fontSize || 22) / 22; return Math.abs(x - L.x) < 140 * f && (L.dir === 'down' ? y > L.y && y < L.y + st + 50 * f : y < L.y && y > L.y - st - 50 * f); }
  if (L.type === 'tag') { const f = (L.titleSize || 96) / 96; return (L.align === 'left' ? x > L.x - 20 && x < L.x + 560 * f : x < L.x + 20 && x > L.x - 560 * f) && y > L.y - 110 * f && y < L.y + 200 * f; }
  if (L.type === 'image') { const [w, h] = imageBox(L); return Math.abs(x - L.x) < w / 2 && Math.abs(y - L.y) < h / 2; }
  if (L.type === 'text') { const [x0, y0, w, h] = textBox(L); return x > x0 - 10 && x < x0 + w + 10 && y > y0 - 10 && y < y0 + h + 10; }
  if (L.type === 'route') return hs.some((h, i) => i && segDist(hs[i - 1], h, p) < tol);
  return inPoly(hs, p);
}
function segDist(a, b, p) {
  const dx = b[0] - a[0], dy = b[1] - a[1], k = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(p[0] - a[0] - k * dx, p[1] - a[1] - k * dy);
}
function setHandle(L, i, [x, y]) {
  if (L.pts) L.pts[i] = [x, y];
  else if (L.quad) L.quad[i] = [x, y];
  else if (L.type === 'image' && i === 1) L.w = Math.max(40, Math.round(2 * Math.abs(x - L.x)));
  else { L.x = x; L.y = y; }
}

stage.addEventListener('pointerdown', e => {
  if (!scene() || e.button) return;
  if (mode === 'view') { stop(); setMode('edit'); }
  const p = toStage(e), sc = scene(), tol = 22 * P.w / stage.getBoundingClientRect().width;
  switch (tool) {
    case 'pin': return add({ type: 'pin', x: p[0], y: p[1], size: 1.3, at: .3, label: '', labelAt: 1, focus: false });
    case 'callout': return add({ type: 'callout', x: p[0], y: p[1], text: 'TIỆN ÍCH', stem: 90, color: '#2BD47A', at: .5 + .35 * sc.layers.filter(l => l.type === 'callout').length });
    case 'tag': return add({ type: 'tag', x: p[0], y: p[1], rot: -9, title: 'LIỀN KỀ GÓC', rows: [{ label: 'DT đất', value: 109.3, unit: 'm²' }, { label: 'DTXD', value: 323.2, unit: 'm²' }], at: .5 });
    case 'text': return add({ type: 'text', x: p[0], y: p[1], kicker: 'Tiện ích', text: 'Đẳng cấp', size: 96, align: 'left', anim: 'rise', screen: true, at: .3 });
    case 'image':
      imgAt = p;
      return pickFile('image/*', async f => add({ type: 'image', x: imgAt[0], y: imgAt[1], w: 360, src: await fileToDataURL(f, { alpha: true, max: 1600 }), frame: 'none', at: .4 }));
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
  const mod = e.ctrlKey || e.metaKey, key = e.key.toLowerCase();
  if (mod && key === 'z') { e.preventDefault(); return e.shiftKey ? redo() : undo(); }
  if (mod && key === 'y') { e.preventDefault(); return redo(); }
  if (e.key === 'Enter') return finishDraft();
  if (e.key === 'Escape') { if (draft.length) { draft = []; redraw(); } else setTool('select'); return; }
  if ((e.key === 'Delete' || e.key === 'Backspace') && sel) { e.preventDefault(); return deleteSel(); }
  if (e.key === ' ') { e.preventDefault(); return playing ? stop() : play(); }
  if (KEYS[e.key.toLowerCase()] && !e.ctrlKey && !e.metaKey && scene()) setTool(KEYS[e.key.toLowerCase()]);
});
$('tools').addEventListener('click', e => { const b = e.target.closest('button'); if (b) setTool(b.dataset.tool); });
$('editMode').onclick = () => { stop(); setMode('edit'); };
$('undoBtn').onclick = undo; $('redoBtn').onclick = redo;
$('audioBtn').onclick = () => { panel = panel === 'audio' ? null : 'audio'; sel = null; renderInspector(); redraw(); };
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
let ac, musicEl;
const audioCtx = () => ac ||= new AudioContext();
function syncMusic() {
  if (!P.music || !playing) { musicEl?.pause(); return; }
  if (musicEl?._blob !== P.music) { musicEl?.pause(); musicEl = new Audio(URL.createObjectURL(P.music)); musicEl._blob = P.music; }
  const d = musicEl.duration, total = timeline(P).total;
  let target = (P.musicOffset || 0) + t;
  if (d && target >= d) { if (P.musicLoop === false) { musicEl.pause(); return; } target %= d; }
  musicEl.volume = Math.max(0, Math.min(1, musicGain(P, t, total)));
  if (Math.abs(musicEl.currentTime - target) > .3) musicEl.currentTime = target;
  if (musicEl.paused) musicEl.play().catch(() => {});
}
function play() {
  const { total } = timeline(P);
  if (!total || exporting) return;
  if (t >= total - .01) t = 0;
  playing = true; $('play').textContent = '❚❚'; $('play').setAttribute('aria-label', 'Tạm dừng');
  sel = null; setMode('view');
  let last = performance.now();
  const cues = sfxCues(P), a = cues.length ? audioCtx() : null;
  a?.resume();
  const loop = now => {
    if (!playing) return;
    const prev = t;
    t = Math.min(total, t + (now - last) / 1000); last = now;
    for (const c of cues) if (c.t > prev && c.t <= t) playSfx(a, a.destination, a.currentTime, c.kind, c.vol);
    syncMusic();
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
function stop() {
  playing = false; $('play').textContent = '▶'; $('play').setAttribute('aria-label', 'Phát');
  Object.values(imgs).forEach(v => v.pause?.()); musicEl?.pause();
}
$('play').onclick = () => playing ? stop() : play();

// ---------- Ảnh, video, tệp dự án
function pickFile(accept, fn) {
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = accept;
  inp.onchange = () => inp.files[0] && fn(inp.files[0]);
  inp.click();
}
// Thu nhỏ ảnh quá lớn để dự án nhẹ; ảnh có nền trong suốt (PNG/WebP/SVG) giữ định dạng PNG
async function fileToDataURL(f, { alpha = false, max = 3840 } = {}) {
  const url = URL.createObjectURL(f);
  const im = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Không đọc được tệp ảnh này.')); i.src = url; });
  const s = Math.min(1, max / Math.max(im.naturalWidth, im.naturalHeight)), c = document.createElement('canvas');
  c.width = Math.round(im.naturalWidth * s); c.height = Math.round(im.naturalHeight * s);
  c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
  URL.revokeObjectURL(url);
  return alpha && f.type !== 'image/jpeg' ? c.toDataURL('image/png') : c.toDataURL('image/jpeg', .92);
}
async function videoInfo(f) {
  const url = URL.createObjectURL(f), v = document.createElement('video');
  v.muted = true; v.preload = 'auto'; v.src = url;
  await new Promise((res, rej) => { v.onloadeddata = res; v.onerror = () => rej(new Error(`Trình duyệt không đọc được video "${f.name}". Hãy dùng MP4 (H.264) hoặc WebM.`)); });
  v.currentTime = Math.min(.2, v.duration / 2);
  await new Promise(r => { v.onseeked = r; });
  const c = document.createElement('canvas');
  c.width = 480; c.height = Math.round(480 * v.videoHeight / v.videoWidth);
  c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
  URL.revokeObjectURL(url);
  return { kind: 'video', video: f, thumb: c.toDataURL('image/jpeg', .8), trim: 0, dur: Math.max(1, Math.min(30, Math.round(v.duration * 10) / 10)) };
}
async function mediaScene(f) {
  if (f.type.startsWith('video/')) return videoInfo(f);
  return { kind: 'image', image: await fileToDataURL(f), video: undefined, thumb: undefined };
}
$('imgInput').addEventListener('change', async e => {
  const files = [...e.target.files].filter(f => /^(image|video)\//.test(f.type));
  e.target.value = '';
  if (!files.length) return;
  try {
    if (replacing) { replacing = false; Object.assign(scene(), await mediaScene(files[0])); }
    else for (const f of files) {
      P.scenes.push({ id: uid(), name: f.name.replace(/\.[^.]+$/, '').slice(0, 24), dur: 4, trans: P.scenes.length ? 'fade' : 'cut', cam: { zoom: .08 }, look: {}, layers: [], ...await mediaScene(f) });
      cur = P.scenes.length - 1;
    }
  } catch (err) { alert(err.message); }
  sel = null; save(); renderAll(); openScene(cur);
});
const pickImages = () => { replacing = false; $('imgInput').multiple = true; $('imgInput').click(); };
$('addScene').onclick = pickImages; $('emptyAdd').onclick = pickImages;

const blobToDataURL = b => new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(b); });
async function load(data) {
  if (!Array.isArray(data?.scenes)) throw new Error('Tệp này không phải dự án Phối Cảnh Studio.');
  // video trong tệp .json được lưu dạng chuỗi; đổi lại thành Blob để phát và lưu trong trình duyệt
  for (const sc of data.scenes) if (typeof sc.video === 'string') sc.video = await (await fetch(sc.video)).blob();
  if (typeof data.music === 'string') data.music = await (await fetch(data.music)).blob();
  P = { w: 1920, h: 1080, fps: 30, ...data }; cur = 0; sel = null; t = 0; draft = [];
  save(); renderAll(); openScene(0);
}
$('demoBtn').onclick = async () => load(await (await fetch('demo.json', { cache: 'no-cache' })).json());
$('saveBtn').onclick = async () => {
  const data = { ...P, scenes: await Promise.all(P.scenes.map(async sc => sc.video instanceof Blob ? { ...sc, video: await blobToDataURL(sc.video) } : sc)) };
  if (P.music instanceof Blob) data.music = await blobToDataURL(P.music);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }));
  a.download = `${P.scenes[0]?.name || 'du-an'}.json`; a.click();
  // giữ đường dẫn thêm một lúc: huỷ ngay có thể làm hỏng lượt tải trên một số trình duyệt
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
};
$('openBtn').onclick = () => $('jsonInput').click();
$('jsonInput').addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = '';
  if (!f) return;
  try { await load(JSON.parse(await f.text())); } catch (err) { alert(`Không mở được tệp: ${err.message}`); }
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
    await Promise.all([...Object.values(imgs).map(i => i.decode?.().catch(() => {})), preloadMedia(P), ...FONTS.map(f => document.fonts.load(f, FONT_SAMPLE))]);
    let cfg;
    for (const codec of ['avc1.64002A', 'avc1.4D402A', 'avc1.42002A']) {
      const c = { codec, width: W, height: H, bitrate: fps > 30 ? 16e6 : 12e6, framerate: fps };
      if ((await VideoEncoder.isConfigSupported(c)).supported) { cfg = c; break; }
    }
    if (!cfg) throw new Error('Máy này không mã hoá được H.264 ở độ phân giải này.');
    b.textContent = 'Đang trộn âm thanh…';
    const mix = await mixAudio(P);
    let acfg;
    if (mix) for (const codec of ['mp4a.40.2', 'opus']) {
      const c = { codec, sampleRate: 48000, numberOfChannels: 2, bitrate: 192000 };
      if ((await AudioEncoder.isConfigSupported(c)).supported) { acfg = c; break; }
    }
    const muxer = new Muxer({ target: new ArrayBufferTarget(), video: { codec: 'avc', width: W, height: H },
      audio: acfg && { codec: acfg.codec === 'opus' ? 'opus' : 'aac', numberOfChannels: 2, sampleRate: 48000 }, fastStart: 'in-memory' });
    let fail;
    if (acfg) {
      // âm thanh đã trộn sẵn → cắt thành từng đoạn 0,1 giây đưa vào bộ mã hoá
      const aenc = new AudioEncoder({ output: (chunk, meta) => muxer.addAudioChunk(chunk, meta), error: err => fail = err });
      aenc.configure(acfg);
      const buf = mix.buffer, N = buf.length, c0 = buf.getChannelData(0), c1 = buf.getChannelData(1);
      for (let off = 0; off < N; off += 4800) {
        const n = Math.min(4800, N - off), data = new Float32Array(n * 2);
        data.set(c0.subarray(off, off + n), 0); data.set(c1.subarray(off, off + n), n);
        const ad = new AudioData({ format: 'f32-planar', sampleRate: 48000, numberOfFrames: n, numberOfChannels: 2, timestamp: Math.round(off / 48000 * 1e6), data });
        aenc.encode(ad); ad.close();
      }
      await aenc.flush();
    }
    const enc = new VideoEncoder({ output: (chunk, meta) => muxer.addVideoChunk(chunk, meta), error: err => fail = err });
    enc.configure(cfg);
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const c2 = cv.getContext('2d');
    for (let f = 0; f < n; f++) {
      if (exporting.cancel) throw new Error('cancel');
      if (fail) throw fail;
      await seekVideos(f / fps);
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
    if (mix?.warn.length) alert(`Đã xuất video. Lưu ý:\n• ${mix.warn.join('\n• ')}`);
  } catch (err) {
    if (err.message !== 'cancel') alert(`Xuất video không thành công: ${err.message}`);
  } finally {
    exporting = null; b.textContent = 'Xuất MP4'; redraw();
  }
};

// ---------- Khởi động: chờ font để chữ trên canvas vẽ đúng, rồi mở lại dự án đã lưu
Promise.all(FONTS.map(f => document.fonts.load(f, FONT_SAMPLE))).then(redraw);
idb().then(saved => { if (saved?.scenes) P = saved; lastSnap = snap(); updateUndo(); renderAll(); if (P.scenes.length) openScene(0); });
renderAll();
