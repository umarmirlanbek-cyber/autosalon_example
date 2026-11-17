import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const $ = (s) => document.querySelector(s);
const fmt = (n) => '$' + n.toLocaleString('en-US');

/* ---------- сцена ---------- */
const stage = $('#stage');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
stage.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#dde0e2');
scene.fog = new THREE.Fog('#dde0e2', 14, 26);
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;

const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
camera.position.set(5.5, 1.9, 5.2);
const controls = new OrbitControls(camera, renderer.domElement);
Object.assign(controls, { enableDamping: true, minDistance: 4, maxDistance: 12,
  maxPolarAngle: Math.PI / 2 - 0.03, autoRotate: true, autoRotateSpeed: 1.2 });
controls.target.set(0, 0.7, 0);
controls.addEventListener('start', () => (controls.autoRotate = false));

const sun = new THREE.DirectionalLight('#fff', 1.6);
sun.position.set(4, 7, 5);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4 });
scene.add(sun);

const floor = new THREE.Mesh(new THREE.CircleGeometry(16, 64),
  new THREE.MeshStandardMaterial({ color: '#d3d6d9', roughness: 0.9 }));
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

new ResizeObserver(() => {
  const { clientWidth: w, clientHeight: h } = stage;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}).observe(stage);

renderer.setAnimationLoop(() => { controls.update(); renderer.render(scene, camera); });

const CAMS = { front: [6, 1.5, 2.4], side: [0, 1.3, 7], rear: [-6, 1.8, -2.4] };
document.querySelectorAll('[data-cam]').forEach((b) => b.addEventListener('click', () => {
  controls.autoRotate = false;
  camera.position.set(...CAMS[b.dataset.cam]);
}));

/* ---------- материалы и хелперы ---------- */
// Ось X — длина (перед = +X), Y — высота, Z — ширина
const paint = new THREE.MeshPhysicalMaterial({ color: '#1b3fa0', metalness: 0.55, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.05 });
const carbon = new THREE.MeshStandardMaterial({ color: '#16181b', roughness: 0.45, metalness: 0.35 });
const glass = new THREE.MeshPhysicalMaterial({ color: '#0c131f', roughness: 0.05, metalness: 0.3 });
const tireMat = new THREE.MeshStandardMaterial({ color: '#0d0d0e', roughness: 0.9 });

function box(w, h, d, mat, x = 0, y = 0, z = 0, rz = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.rotation.z = rz;
  m.castShadow = true;
  return m;
}
const group = (...kids) => { const g = new THREE.Group(); g.add(...kids); return g; };
const extrude = (pts, depth, bevel, mat) => {
  const s = new THREE.Shape();
  pts.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
  const geo = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: bevel,
    bevelSize: bevel, bevelSegments: 6, curveSegments: 8 });
  geo.translate(0, 0, -depth / 2);
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  return m;
};

/* ---------- базовый кузов (заглушка — замените на .glb) ---------- */
function buildStub() {
  const body = extrude([[-2.3, 0.3], [-2.3, 0.85], [-1.6, 0.92], [-0.7, 1.4], [0.4, 1.4],
    [1.0, 0.98], [2.2, 0.8], [2.3, 0.6], [2.3, 0.3]], 1.5, 0.1, paint);
  const cabin = extrude([[-1.52, 0.97], [-0.78, 1.34], [0.38, 1.34], [0.92, 1.0]], 1.55, 0.11, glass);
  const under = box(4.5, 0.12, 1.5, carbon, 0, 0.2, 0);
  const lights = group(
    box(0.05, 0.1, 0.35, new THREE.MeshStandardMaterial({ color: '#f4f1d8', emissive: '#f4f1d8', emissiveIntensity: 0.6 }), 2.4, 0.68, 0.55),
    box(0.05, 0.1, 0.35, new THREE.MeshStandardMaterial({ color: '#f4f1d8', emissive: '#f4f1d8', emissiveIntensity: 0.6 }), 2.4, 0.68, -0.55),
    box(0.05, 0.1, 0.4, new THREE.MeshStandardMaterial({ color: '#b01020', emissive: '#b01020', emissiveIntensity: 0.5 }), -2.4, 0.78, 0.55),
    box(0.05, 0.1, 0.4, new THREE.MeshStandardMaterial({ color: '#b01020', emissive: '#b01020', emissiveIntensity: 0.5 }), -2.4, 0.78, -0.55));
  return group(body, cabin, under, lights);
}


/* ---------- настоящая модель Impreza (.glb) ---------- */
const USE_REAL_MODEL = true;                 // false — вернуть процедурную заглушку
const MODEL_URL = '/static/models/impreza.glb';
let MODEL_ROT = Math.PI / 2;                 // если машина смотрит не носом вправо — нажмите R на сайте
const CAR_LENGTH = 4.6;                      // длина машины в сценe
// Подгонка положения деталей [x, y, z]. + x = вперёд, + y = вверх. Меняйте и обновляйте страницу.
const TUNE = { spoiler: [0, 0, 0], hood: [0, 0, 0], bumper: [0, 0, 0], skirts: [0, 0, 0] };

const NOT_BODY = /glass|window|tire|tyre|rubber|wheel|rim|light|lamp|chrome|interior|seat|plastic|grill|mirror|plate|brake|disc|black|carbon/i;
const IS_BODY = /body|paint|carpaint|lacquer|exterior|shell|kuzov/i;

function preparePaint(model) {
  const stat = new Map(); // материал -> число вершин
  model.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    const list = Array.isArray(o.material) ? o.material : [o.material];
    list.forEach((mat) => stat.set(mat, (stat.get(mat) || 0) + o.geometry.attributes.position.count));
  });
  const all = [...stat.entries()];
  console.table(all.map(([m, n]) => ({ material: m.name, vertices: n })));
  let body = all.filter(([m]) => IS_BODY.test(m.name));
  if (!body.length) {
    const rest = all.filter(([m]) => !NOT_BODY.test(m.name)).sort((a, b) => b[1] - a[1]);
    body = rest.slice(0, 1);
  }
  const bodyMats = new Set(body.map(([m]) => m));
  console.log('Красим как кузов:', [...bodyMats].map((m) => m.name));
  model.traverse((o) => {
    if (!o.isMesh) return;
    o.material = Array.isArray(o.material)
      ? o.material.map((m) => (bodyMats.has(m) ? paint : m))
      : bodyMats.has(o.material) ? paint : o.material;
  });
}

function buildBase() {
  if (!USE_REAL_MODEL) return buildStub();
  const holder = new THREE.Group();
  new GLTFLoader().load(MODEL_URL, (gltf) => {
    const m = gltf.scene;
    preparePaint(m);
    holder.add(m);
    const fit = () => {
      m.rotation.set(0, MODEL_ROT, 0);
      m.scale.setScalar(1);
      m.position.set(0, 0, 0);
      m.updateMatrixWorld(true);
      let b = new THREE.Box3().setFromObject(m);
      const size = b.getSize(new THREE.Vector3());
      m.scale.setScalar(CAR_LENGTH / Math.max(size.x, size.z));
      m.updateMatrixWorld(true);
      b = new THREE.Box3().setFromObject(m);
      const c = b.getCenter(new THREE.Vector3());
      m.position.set(-c.x, -b.min.y, -c.z); // по центру, колёса на полу
    };
    fit();
    addEventListener('keydown', (e) => {
      if (e.key.toLowerCase() !== 'r') return;
      MODEL_ROT += Math.PI / 2;
      fit();
      console.log('MODEL_ROT =', MODEL_ROT.toFixed(3), `(${Math.round((MODEL_ROT * 180) / Math.PI) % 360}°)`);
    });
  }, undefined, (err) => console.error('Не удалось загрузить модель', MODEL_URL, err));
  return holder;
}

/* ---------- детали. Ключи = поле builder в каталоге ---------- */
const SLOPE = -0.13; // наклон капота: перед ниже
const BUILDERS = {
  spoiler_lip: () => box(0.28, 0.05, 1.5, paint, -2.27, 1.03, 0, -0.15),
  spoiler_ducktail: () => box(0.55, 0.06, 1.55, paint, -2.12, 1.05, 0, -0.22),
  spoiler_gt: () => group(
    box(0.07, 0.3, 0.06, carbon, -2.12, 1.1, 0.5), box(0.07, 0.3, 0.06, carbon, -2.12, 1.1, -0.5),
    box(0.42, 0.05, 1.7, carbon, -2.17, 1.3, 0, -0.12),
    box(0.46, 0.22, 0.03, carbon, -2.17, 1.28, 0.85), box(0.46, 0.22, 0.03, carbon, -2.17, 1.28, -0.85)),
  hood_scoop: () => group(
    box(0.7, 0.13, 0.55, paint, 1.5, 1.08, 0, SLOPE),
    box(0.04, 0.08, 0.42, carbon, 1.85, 1.07, 0, SLOPE)),
  hood_vents: () => group(
    box(0.5, 0.02, 0.2, carbon, 1.5, 1.03, 0.42, SLOPE), box(0.5, 0.02, 0.2, carbon, 1.5, 1.03, -0.42, SLOPE)),
  hood_carbon: () => box(1.2, 0.03, 1.4, carbon, 1.55, 1.03, 0, SLOPE),
  bumper_sport: () => group(
    box(0.4, 0.04, 1.6, carbon, 2.42, 0.25, 0),
    box(0.22, 0.14, 0.03, carbon, 2.42, 0.36, 0.82), box(0.22, 0.14, 0.03, carbon, 2.42, 0.36, -0.82)),
  bumper_aggressive: () => group(
    box(0.55, 0.05, 1.7, carbon, 2.5, 0.23, 0),
    box(0.06, 0.22, 1.2, carbon, 2.4, 0.45, 0),
    box(0.25, 0.18, 0.03, paint, 2.45, 0.4, 0.86), box(0.25, 0.18, 0.03, paint, 2.45, 0.4, -0.86),
    box(0.05, 0.1, 0.5, paint, 2.38, 0.68, 0)),
  skirts_paint: () => group(box(1.7, 0.12, 0.05, paint, 0, 0.3, 0.88), box(1.7, 0.12, 0.05, paint, 0, 0.3, -0.88)),
  skirts_carbon: () => group(box(1.8, 0.14, 0.07, carbon, 0, 0.3, 0.88), box(1.8, 0.14, 0.07, carbon, 0, 0.3, -0.88)),
  wheels: ({ color, spokes }) => {
    const rimMat = new THREE.MeshStandardMaterial({ color, metalness: 0.9, roughness: 0.25 });
    const g = new THREE.Group();
    for (const [x, z] of [[1.45, 0.86], [1.45, -0.86], [-1.35, 0.86], [-1.35, -0.86]]) {
      const w = new THREE.Group();
      const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.24, 40), tireMat);
      const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.25, 40), rimMat);
      tire.rotation.x = rim.rotation.x = Math.PI / 2;
      tire.castShadow = true;
      w.add(tire, rim);
      const side = Math.sign(z) * 0.13;
      for (let i = 0; i < spokes; i++) {
        const sp = box(0.46, spokes > 5 ? 0.025 : 0.05, 0.02, rimMat, 0, 0, side, (i * Math.PI) / spokes);
        w.add(sp);
      }
      w.add(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.27, 16), carbon).rotateX(Math.PI / 2));
      w.position.set(x, 0.34, z);
      g.add(w);
    }
    return g;
  },
};

/* ---------- состояние и слоты ---------- */
const car = new THREE.Group();
car.add(buildBase());
scene.add(car);
const slots = {};
const loader = new GLTFLoader();
let catalog, state = {};

function applyOption(cat, opt) {
  const slot = (slots[cat.id] ??= car.add(new THREE.Group()) && car.children.at(-1));
  slot.clear();
  slot.position.set(...(TUNE[cat.id] || [0, 0, 0]));
  const ver = (slot.userData.v = (slot.userData.v || 0) + 1); // защита от быстрых кликов
  if (opt.glb) {
    loader.load(opt.glb, (gltf) => {
      if (slot.userData.v !== ver) return;
      const m = gltf.scene;
      m.traverse((o) => {
        if (!o.isMesh) return;
        o.castShadow = true;
        if (opt.paint === true) o.material = paint; // вся деталь красится в цвет кузова
        else if (typeof opt.paint === 'string' && new RegExp(opt.paint, 'i').test(o.material.name)) o.material = paint;
      });
      if (opt.scale) m.scale.setScalar(opt.scale);
      if (opt.rot) m.rotation.set(...opt.rot);   // в радианах: [0, Math.PI/2, 0] -> [0, 1.571, 0]
      if (opt.pos) m.position.set(...opt.pos);
      slot.add(m);
    });
  }
  else if (opt.builder) slot.add(BUILDERS[opt.builder](opt.params || {}));
}

const optOf = (cat) => cat.options.find((o) => o.id === state[cat.id]);
const total = () => catalog.base_price + catalog.categories.reduce((s, c) => s + optOf(c).price, 0);

function refresh() {
  $('#total').textContent = fmt(total());
  document.querySelectorAll('[data-cat]').forEach((b) =>
    b.setAttribute('aria-pressed', String(state[b.dataset.cat] === b.dataset.opt)));
  document.querySelectorAll('[data-color]').forEach((b) =>
    b.setAttribute('aria-pressed', String(state.color === b.dataset.color)));
  try { history.replaceState(null, '', '#' + encodeURIComponent(JSON.stringify(state))); } catch {}
}

function render() {
  const wrap = $('#options');
  wrap.innerHTML = '';
  const colors = document.createElement('div');
  colors.className = 'group';
  colors.innerHTML = '<h3>Цвет кузова</h3><div class="swatches"></div>';
  catalog.colors.forEach((c) => {
    const b = document.createElement('button');
    b.className = 'sw'; b.style.background = c.hex; b.title = c.name; b.ariaLabel = c.name;
    b.dataset.color = c.id;
    b.onclick = () => { state.color = c.id; paint.color.set(c.hex); refresh(); };
    colors.querySelector('.swatches').append(b);
  });
  wrap.append(colors);

  catalog.categories.forEach((cat) => {
    const g = document.createElement('div');
    g.className = 'group';
    g.innerHTML = `<h3>${cat.title}</h3><div class="opts"></div>`;
    cat.options.forEach((o) => {
      const b = document.createElement('button');
      b.className = 'opt'; b.dataset.cat = cat.id; b.dataset.opt = o.id;
      b.innerHTML = `<span>${o.name}</span><small>${o.price ? '+' + fmt(o.price) : 'в комплекте'}</small>`;
      b.onclick = () => { state[cat.id] = o.id; applyOption(cat, o); refresh(); };
      g.querySelector('.opts').append(b);
    });
    wrap.append(g);
  });
}

/* ---------- заявка ---------- */
const dlg = $('#lead');
$('#open-lead').onclick = () => {
  const lines = catalog.categories.map((c) => optOf(c)).filter((o) => o.price).map((o) => o.name);
  $('#lead-summary').textContent = `${catalog.name}, ${fmt(total())}. ${lines.join(', ') || 'Базовая комплектация'}.`;
  $('#lead-msg').textContent = '';
  dlg.showModal();
};
$('#lead-close').onclick = () => dlg.close();
$('#lead-form').onsubmit = async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  const msg = $('#lead-msg');
  try {
    const r = await fetch('/api/leads', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: f.get('name'), phone: f.get('phone'), comment: f.get('comment') || '', config: state }) });
    if (!r.ok) throw new Error();
    msg.textContent = 'Заявка отправлена. Менеджер свяжется с вами.';
    e.target.reset();
  } catch { msg.textContent = 'Не удалось отправить. Проверьте данные и попробуйте ещё раз.'; }
};

/* ---------- старт ---------- */
(async () => {
  catalog = await (await fetch('/api/catalog')).json();
  // у настоящей модели свои колёса — процедурные диски отключаем
  if (USE_REAL_MODEL) catalog.categories = catalog.categories.filter((c) => c.id !== 'wheels');
  catalog.categories.forEach((c) => (state[c.id] = c.options[0].id));
  state.color = catalog.colors[0].id;
  try { Object.assign(state, JSON.parse(decodeURIComponent(location.hash.slice(1)))); } catch {}
  render();
  paint.color.set(catalog.colors.find((c) => c.id === state.color)?.hex || '#1b3fa0');
  catalog.categories.forEach((c) => applyOption(c, optOf(c) || c.options[0]));
  refresh();

  const inv = await (await fetch('/api/inventory')).json();
  $('#inventory').innerHTML = inv.map((c) =>
    `<li><strong>${c.name}</strong><span>${c.year}, ${c.km.toLocaleString('ru-RU')} км</span><strong>${fmt(c.price)}</strong></li>`).join('');
})();