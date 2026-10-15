// Ferramentas de modelagem: superfícies "loft" (anéis ligados, como tecido em volta do corpo),
// fitas, tubos e o cálculo dos pesos de pele (quanto cada osso puxa cada vértice).
import * as THREE from 'three';

const TAU = Math.PI * 2;

// Interpola uma lista de anéis-chave (Catmull-Rom) para ter muitos anéis suaves.
export function smoothRings(keys, count) {
  const out = [];
  const n = keys.length;
  const get = i => keys[Math.max(0, Math.min(n - 1, i))];
  for (let s = 0; s < count; s++) {
    const t = (s / (count - 1)) * (n - 1);
    const i = Math.min(n - 2, Math.floor(t)), f = t - i;
    const p0 = get(i - 1), p1 = get(i), p2 = get(i + 1), p3 = get(i + 2);
    const ring = {};
    for (const k of Object.keys(p1)) {
      if (typeof p1[k] !== 'number') { ring[k] = p1[k]; continue; }
      const a = p0[k] ?? p1[k], b = p1[k], c = p2[k] ?? p1[k], d = p3[k] ?? p2[k] ?? p1[k];
      ring[k] = 0.5 * ((2 * b) + (-a + c) * f + (2 * a - 5 * b + 4 * c - d) * f * f + (-a + 3 * b - 3 * c + d) * f * f * f);
    }
    out.push(ring);
  }
  return out;
}

// Loft: cada anel tem centro (cx, y, cz) e raios (rx, rz), em volta do eixo vertical; ou, se tiver
// 'frame', um centro e dois eixos quaisquer (para mangas, que seguem o braço).
// gap(v) = meia abertura na frente, em radianos (0 = fechado). fold(theta, v) = multiplica o raio.
// u corre em volta (0 a 1 dentro da parte com pano), v corre do primeiro ao último anel.
// Cada vértice também ganha uma cor de sombra (oclusão falsa): o fundo das dobras escurece,
// a crista clareia um pouco. 'shade(v)' escurece faixas inteiras (onde um pano encosta no outro).
export function loft(rings, { segments = 48, gap = () => 0, fold = () => 1, yJitter = null, warp = null, shade = null, aoStrength = 8 } = {}) {
  const pos = [], uv = [], idx = [], col = [];
  const nR = rings.length;
  // comprimento ao longo dos anéis para o v
  const centers = rings.map(r => (r.frame ? r.frame.c : new THREE.Vector3(r.cx || 0, r.y, r.cz || 0)));
  const lens = [0];
  for (let i = 1; i < nR; i++) lens.push(lens[i - 1] + centers[i].distanceTo(centers[i - 1]) + Math.abs((rings[i].rx || 0) - (rings[i - 1].rx || 0)) * 0.5);
  const total = lens[nR - 1] || 1;
  const p = new THREE.Vector3();
  for (let i = 0; i < nR; i++) {
    const r = rings[i], v = lens[i] / total;
    const g = Math.max(0, gap(v, r));
    const X = r.frame ? r.frame.x : new THREE.Vector3(1, 0, 0);
    const Z = r.frame ? r.frame.z : new THREE.Vector3(0, 0, 1);
    for (let j = 0; j <= segments; j++) {
      const u = j / segments;
      const theta = g + (TAU - 2 * g) * u; // 0 = frente
      const k = fold(theta, v, r);
      p.copy(centers[i])
        .addScaledVector(X, Math.sin(theta) * r.rx * k)
        .addScaledVector(Z, Math.cos(theta) * r.rz * k);
      if (yJitter) p.y += yJitter(theta, v);
      if (warp) warp(p, theta, v, r);
      pos.push(p.x, p.y, p.z);
      uv.push(u, v);
      const ao = Math.min(1.08, Math.max(0.55, 1 + (k - 1) * aoStrength)) * (shade ? shade(v, theta) : 1);
      col.push(ao, ao, ao);
    }
  }
  const row = segments + 1;
  for (let i = 0; i < nR - 1; i++) {
    for (let j = 0; j < segments; j++) {
      const a = i * row + j, b = a + 1, c = a + row, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  fixSeamNormals(geo);
  return geo;
}

// Anéis ao longo de um caminho (mangas): cada anel fica perpendicular ao caminho, com a "frente"
// apontando para 'front'.
export function pathRings(points, radii, count, front = new THREE.Vector3(0, 0, 1)) {
  const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
  const rad = t => {
    const s = t * (radii.length - 1), i = Math.min(radii.length - 2, Math.floor(s)), f = s - i;
    const a = radii[i], b = radii[i + 1];
    return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
  };
  const rings = [];
  for (let s = 0; s < count; s++) {
    const t = s / (count - 1);
    const c = curve.getPointAt(t), T = curve.getTangentAt(t).normalize();
    const Z = front.clone().addScaledVector(T, -front.dot(T)).normalize();
    const X = new THREE.Vector3().crossVectors(T, Z).normalize().negate();
    const [rx, rz] = rad(t);
    rings.push({ frame: { c, x: X, z: Z }, rx, rz });
  }
  return rings;
}

// Vértices duplicados na costura têm normais diferentes; aqui elas viram a média.
export function fixSeamNormals(geo, eps = 1e-5) {
  const p = geo.attributes.position, n = geo.attributes.normal;
  const map = new Map();
  const key = i => `${Math.round(p.getX(i) / eps)}|${Math.round(p.getY(i) / eps)}|${Math.round(p.getZ(i) / eps)}`;
  for (let i = 0; i < p.count; i++) {
    const k = key(i);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(i);
  }
  const v = new THREE.Vector3();
  for (const list of map.values()) {
    if (list.length < 2) continue;
    v.set(0, 0, 0);
    for (const i of list) v.x += n.getX(i), v.y += n.getY(i), v.z += n.getZ(i);
    v.normalize();
    for (const i of list) n.setXYZ(i, v.x, v.y, v.z);
  }
  n.needsUpdate = true;
}

// Cópia da superfície para dentro (forro), com as faces viradas.
export function liningOf(geo, inset = 0.006) {
  const g = geo.clone();
  const p = g.attributes.position, n = g.attributes.normal;
  for (let i = 0; i < p.count; i++) {
    p.setXYZ(i, p.getX(i) - n.getX(i) * inset, p.getY(i) - n.getY(i) * inset, p.getZ(i) - n.getZ(i) * inset);
    n.setXYZ(i, -n.getX(i), -n.getY(i), -n.getZ(i));
  }
  const idx = g.index.array;
  for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
  g.index.needsUpdate = true;
  return g;
}

// Fita achatada ao longo de um caminho (pontas da faixa). 'out' aponta para fora do corpo.
export function ribbon(points, width, out, segments = 24, widthEnd = width) {
  const curve = new THREE.CatmullRomCurve3(points);
  const pos = [], uv = [], idx = [];
  for (let s = 0; s <= segments; s++) {
    const t = s / segments, c = curve.getPointAt(t), T = curve.getTangentAt(t);
    const side = new THREE.Vector3().crossVectors(T, out).normalize();
    const w = (width + (widthEnd - width) * t) / 2;
    pos.push(c.x - side.x * w, c.y - side.y * w, c.z - side.z * w, c.x + side.x * w, c.y + side.y * w, c.z + side.z * w);
    uv.push(0, t, 1, t);
    if (s < segments) { const a = s * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// Deixa a geometria pronta para ser juntada: sem índice compartilhado estranho, com uv e normal.
export function prepare(geo) {
  let g = geo.index ? geo : geo;
  if (!g.attributes.uv) {
    const n = g.attributes.position.count;
    g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2));
  }
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.color) {
    const n = g.attributes.position.count;
    g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(n * 3).fill(1), 3));
  }
  for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color', 'skinIndex', 'skinWeight'].includes(name)) g.deleteAttribute(name);
  if (!g.index) {
    const n = g.attributes.position.count;
    g.setIndex([...Array(n).keys()]);
  }
  return g;
}

// ---------- pesos de pele ----------
// Cada osso vira um segmento (cabeça até a ponta). Um vértice é puxado pelos ossos mais perto,
// com peso que cai rápido com a distância. Até 4 ossos por vértice, como o glTF pede.
export function segmentDistance(p, a, b) {
  const ab = b.clone().sub(a), t = THREE.MathUtils.clamp(p.clone().sub(a).dot(ab) / Math.max(1e-9, ab.lengthSq()), 0, 1);
  return p.distanceTo(a.clone().addScaledVector(ab, t));
}

export function setWeights(geo, fn) {
  const p = geo.attributes.position, n = p.count;
  const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
  const v = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    v.fromBufferAttribute(p, i);
    const list = fn(v) // [[boneIndex, weight], ...]
      .filter(([, w]) => w > 1e-4)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4);
    const sum = list.reduce((s, [, w]) => s + w, 0) || 1;
    list.forEach(([b, w], k) => { si[i * 4 + k] = b; sw[i * 4 + k] = w / sum; });
    if (!list.length) sw[i * 4] = 1;
  }
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  return geo;
}
