// Modelo do mago, feito em código: manto aberto com forro, túnica, capelete, capuz com o rosto em sombra
// e olhos que brilham, mangas largas, luvas, botas, faixa, medalhão e o cajado de madeira torcida com cristal.
// Tudo vira uma única malha com pele (SkinnedMesh) presa a um esqueleto de verdade.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { loft, smoothRings, pathRings, liningOf, ribbon, prepare, setWeights, segmentDistance } from './geometry.js';
import { buildSkeleton } from './skeleton.js';
import { buildStaff } from './Staff.js';
import { clothTextures, leatherTextures } from '../fx/textures.js';
import { smoothstep, clamp } from '../fx/random.js';

const TAU = Math.PI * 2;
const V = (x, y, z) => new THREE.Vector3(x, y, z);

// ---------- pesos ----------
export function weightsTools(spec) {
  const idx = n => spec[n].index;
  // perto dos ossos listados; 'bias' aumenta a influência de alguns
  const capsule = (names, sharp = 4, bias = {}) => p => names.map(n => {
    const d = segmentDistance(p, spec[n].head, spec[n].tail);
    return [idx(n), (bias[n] ?? 1) / Math.pow(d + 0.015, sharp)];
  });
  const rigid = name => () => [[idx(name), 1]];
  // saia: cada lado do pano segue a sua corrente de ossos, e o alto da saia segue o quadril
  const skirt = chains => p => {
    const t = clamp((0.98 - p.y) / 0.98, 0, 1);
    const a = Math.atan2(p.x, p.z);
    const dir = { front: Math.max(0, Math.cos(a)) ** 2, back: Math.max(0, -Math.cos(a)) ** 2, left: Math.max(0, Math.sin(a)) ** 2, right: Math.max(0, -Math.sin(a)) ** 2 };
    const hips = 1 - smoothstep(0, 0.22, t);
    const s1 = smoothstep(0, 0.22, t) * (1 - smoothstep(0.42, 0.78, t));
    const s2 = smoothstep(0.42, 0.78, t);
    const out = [[idx('Hips'), hips]];
    for (const k of Object.keys(dir)) {
      if (!chains[k]) continue;
      out.push([idx(chains[k][0]), dir[k] * s1], [idx(chains[k][1]), dir[k] * s2]);
    }
    return out;
  };
  // mistura de duas funções conforme a altura (tronco em cima, saia embaixo)
  const byHeight = (upper, lower, y0, y1) => p => {
    const w = smoothstep(y0, y1, p.y);
    const U = upper(p), Lw = lower(p);
    const nu = 1 / (U.reduce((s, [, x]) => s + x, 0) || 1), nl = 1 / (Lw.reduce((s, [, x]) => s + x, 0) || 1);
    const m = new Map();
    for (const [b, x] of U) m.set(b, (m.get(b) || 0) + x * nu * w);
    for (const [b, x] of Lw) m.set(b, (m.get(b) || 0) + x * nl * (1 - w));
    return [...m.entries()];
  };
  return { capsule, rigid, skirt, byHeight };
}

// ---------- materiais ----------
export function velvet(tex, sheenColor, extra = {}) {
  return new THREE.MeshPhysicalMaterial({
    map: tex.map, roughnessMap: tex.orm, metalnessMap: tex.orm, normalMap: tex.normal,
    normalScale: new THREE.Vector2(0.55, 0.55), roughness: 1, metalness: 1, vertexColors: true,
    sheen: 0.5, sheenRoughness: 0.55, sheenColor: new THREE.Color(sheenColor), ...extra,
  });
}

function makeMaterials() {
  const blueSheen = '#5c76d4', purpleSheen = '#a378e6';
  const cloak = clothTextures({ size: 1024, base: '#172668', seed: 3, trims: [
    { u0: 0, u1: 0.075, v0: 0, v1: 1, axis: 'v', seed: 0 },
    { u0: 0.925, u1: 1, v0: 0, v1: 1, axis: 'v', seed: 7 },
    { u0: 0, u1: 1, v0: 0.958, v1: 0.988, axis: 'u', pattern: 'ornament' },
  ] });
  const robe = clothTextures({ size: 1024, base: '#35175f', seed: 5, trims: [
    { u0: 0, u1: 0.035, v0: 0.3, v1: 0.94, axis: 'v', pattern: 'ornament' },
    { u0: 0.965, u1: 1, v0: 0.3, v1: 0.94, axis: 'v', pattern: 'ornament' },
    { u0: 0, u1: 1, v0: 0.94, v1: 0.975, axis: 'u', pattern: 'ornament' },
  ] });
  const capelet = clothTextures({ size: 1024, base: '#18286c', seed: 9, trims: [
    { u0: 0, u1: 1, v0: 0.8, v1: 0.96, axis: 'u', seed: 3 },
    { u0: 0, u1: 0.03, v0: 0, v1: 0.8, axis: 'v', pattern: 'plain' },
    { u0: 0.97, u1: 1, v0: 0, v1: 0.8, axis: 'v', pattern: 'plain' },
  ] });
  const sleeve = clothTextures({ size: 512, base: '#172668', seed: 13, trims: [
    { u0: 0, u1: 1, v0: 0.855, v1: 0.955, axis: 'u', pattern: 'ornament' },
  ] });
  const hood = clothTextures({ size: 512, base: '#162463', seed: 17, shade: 0.45 });
  const lining = clothTextures({ size: 512, base: '#2c1154', seed: 19 });
  const sash = clothTextures({ size: 256, base: '#5a2696', seed: 23, weave: 2, trims: [
    { u0: 0, u1: 1, v0: 0, v1: 0.12, axis: 'u', pattern: 'plain' },
    { u0: 0, u1: 1, v0: 0.88, v1: 1, axis: 'u', pattern: 'plain' },
  ] });
  const leather = leatherTextures(3, '#4a2c19');

  const mats = {
    cloak: velvet(cloak, blueSheen),
    robe: velvet(robe, purpleSheen),
    capelet: velvet(capelet, blueSheen),
    sleeve: velvet(sleeve, blueSheen),
    hood: velvet(hood, blueSheen),
    lining: velvet(lining, purpleSheen, { sheenRoughness: 0.55 }),
    hoodInside: new THREE.MeshStandardMaterial({ color: '#06070f', roughness: 1, vertexColors: true }),
    sash: velvet(sash, purpleSheen),
    leather: new THREE.MeshStandardMaterial({ map: leather.map, normalMap: leather.normal, roughness: 0.62, metalness: 0, vertexColors: true }),
    gold: new THREE.MeshStandardMaterial({ color: '#d2a24c', metalness: 1, roughness: 0.3, vertexColors: true }),
    gem: new THREE.MeshStandardMaterial({ color: '#1a5fff', emissive: '#3f8cff', emissiveIntensity: 3.2, roughness: 0.15, metalness: 0 }),
    void: new THREE.MeshBasicMaterial({ color: '#000000' }),
    eyes: new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 2.4, 5.6), toneMapped: false }),
  };
  // nomes em português: aparecem no Blender e servem para achar as peças num .glb carregado
  const names = { cloak: 'manto', robe: 'tunica', capelet: 'capelete', sleeve: 'manga', hood: 'capuz', lining: 'forro', hoodInside: 'capuz_dentro',
    sash: 'faixa', leather: 'couro', gold: 'ouro', gem: 'gema', void: 'rosto_sombra', eyes: 'olhos' };
  for (const [k, m] of Object.entries(mats)) m.name = names[k] || k;
  return mats;
}

// ---------- peças ----------
const foldsFn = (amp, waves = [[5, 0.7, 0.55], [9, 2.1, 0.3], [17, 0.4, 0.15]]) => (theta, v) => {
  const a = amp(v);
  let s = 0;
  for (const [k, ph, w] of waves) s += w * Math.sin(k * theta + ph);
  return 1 + a * s;
};

function innerRobe() {
  const keys = [
    { y: 1.42, rx: 0.155, rz: 0.115 }, { y: 1.32, rx: 0.175, rz: 0.125 }, { y: 1.2, rx: 0.172, rz: 0.125 },
    { y: 1.08, rx: 0.165, rz: 0.125 }, { y: 0.98, rx: 0.19, rz: 0.145 }, { y: 0.8, rx: 0.225, rz: 0.175 },
    { y: 0.55, rx: 0.258, rz: 0.205 }, { y: 0.3, rx: 0.288, rz: 0.232 }, { y: 0.1, rx: 0.312, rz: 0.252 },
    { y: 0.0, rx: 0.322, rz: 0.262 },
  ];
  return loft(smoothRings(keys, 46), {
    segments: 72,
    shade: v => 0.72 + 0.28 * smoothstep(0.0, 0.3, v),
    fold: foldsFn(v => 0.004 + 0.045 * smoothstep(0.35, 1, v)),
    // a barra sobe um pouco na frente, para as botas aparecerem
    yJitter: (theta, v) => (v > 0.9 ? smoothstep(0.9, 1, v) * (0.05 * Math.max(0, Math.cos(theta)) ** 3 + 0.008 * Math.sin(theta * 11)) : 0),
  });
}

function outerCloak() {
  const keys = [
    { y: 1.47, rx: 0.22, rz: 0.155, cz: -0.005 }, { y: 1.38, rx: 0.27, rz: 0.182, cz: 0 }, { y: 1.2, rx: 0.268, rz: 0.192, cz: 0 },
    { y: 1.0, rx: 0.272, rz: 0.205, cz: 0 }, { y: 0.75, rx: 0.305, rz: 0.238, cz: -0.01 }, { y: 0.45, rx: 0.348, rz: 0.278, cz: -0.03 },
    { y: 0.15, rx: 0.395, rz: 0.325, cz: -0.055 }, { y: 0.0, rx: 0.415, rz: 0.348, cz: -0.07 },
  ];
  return loft(smoothRings(keys, 48), {
    segments: 72,
    gap: v => 0.4 + 0.42 * v,
    shade: v => 0.7 + 0.3 * smoothstep(0.08, 0.3, v),
    fold: foldsFn(v => 0.012 + 0.09 * smoothstep(0.12, 1, v), [[5, 0.7, 0.5], [9, 2.1, 0.3], [14, 0.4, 0.2]]),
    yJitter: (theta, v) => (v > 0.93 ? Math.max(0.004 - 0, 0.004) + smoothstep(0.93, 1, v) * 0.012 * Math.sin(theta * 7 + 1) : 0),
  });
}

function capelet() {
  const keys = [
    { y: 1.56, rx: 0.11, rz: 0.1 }, { y: 1.535, rx: 0.17, rz: 0.13 }, { y: 1.5, rx: 0.25, rz: 0.17 },
    { y: 1.455, rx: 0.3, rz: 0.2 }, { y: 1.39, rx: 0.335, rz: 0.222 }, { y: 1.33, rx: 0.348, rz: 0.234 }, { y: 1.285, rx: 0.352, rz: 0.238 },
  ];
  return loft(smoothRings(keys, 22), {
    segments: 72,
    gap: v => 0.42 + 0.32 * v,
    fold: foldsFn(v => 0.004 + 0.035 * smoothstep(0.3, 1, v), [[8, 0.3, 0.6], [13, 1.7, 0.4]]),
  });
}

// Abertura do capuz (meia-largura em radianos) conforme a altura: rosto, queixo e a gola em V.
function hoodGap(y) {
  if (y >= 1.775) return 0;
  if (y >= 1.655) return 0.95 * Math.sin(((1.775 - y) / 0.12) * Math.PI / 2) ** 0.7;
  if (y >= 1.54) return 0.95 - 0.62 * smoothstep(1.655, 1.54, y);
  return 0.33 + 0.3 * smoothstep(1.54, 1.42, y);
}

// Capuz arredondado; a ponta cai para trás (ver 'warp' em hood()).
const HOOD_KEYS = [
  { y: 1.846, rx: 0.0005, rz: 0.0005, cz: -0.05 }, { y: 1.836, rx: 0.05, rz: 0.055, cz: -0.045 },
  { y: 1.815, rx: 0.088, rz: 0.094, cz: -0.032 }, { y: 1.775, rx: 0.113, rz: 0.12, cz: -0.02 },
  { y: 1.72, rx: 0.125, rz: 0.134, cz: -0.01 }, { y: 1.655, rx: 0.128, rz: 0.138, cz: -0.004 },
  { y: 1.6, rx: 0.13, rz: 0.14, cz: -0.002 }, { y: 1.54, rx: 0.145, rz: 0.15, cz: -0.006 },
  { y: 1.5, rx: 0.185, rz: 0.172, cz: -0.012 }, { y: 1.46, rx: 0.235, rz: 0.19, cz: -0.018 },
  { y: 1.43, rx: 0.28, rz: 0.205, cz: -0.02 },
];

function hood() {
  const rings = smoothRings(HOOD_KEYS, 44);
  const geo = loft(rings, {
    segments: 64,
    gap: (v, r) => hoodGap(r.y),
    fold: foldsFn(v => 0.006 + 0.03 * smoothstep(0.6, 1, v), [[6, 0.2, 0.6], [11, 1.3, 0.4]]),
    // a parte de trás do alto do capuz escorre para trás e para baixo, numa ponta mole
    warp: (p, theta, v, r) => {
      const s = smoothstep(1.66, 1.845, r.y), back = Math.max(0, -Math.cos(theta)) ** 1.6;
      p.z -= 0.12 * s ** 1.4 * back;
      p.y -= 0.035 * s ** 2 * back;
    },
  });
  // borda dourada em volta da abertura
  const left = [], right = [];
  for (const r of rings) {
    const g = hoodGap(r.y);
    if (g < 0.02 && r.y > 1.7) continue;
    const at = th => V((r.cx || 0) + Math.sin(th) * r.rx * 1.02, r.y, (r.cz || 0) + Math.cos(th) * r.rz * 1.02);
    left.push(at(g));
    right.push(at(TAU - g));
  }
  const top = rings.filter(r => hoodGap(r.y) < 0.02 && r.y > 1.7).pop();
  const path = [...left.reverse(), V(0, top ? top.y - 0.004 : 1.8, (top ? top.rz : 0.126) * 1.02 + (top?.cz || 0)), ...right];
  const rim = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(path, false, 'centripetal'), 160, 0.0085, 8, false);
  return { geo, rim };
}

function sleeve(sign) {
  const f = x => sign * x;
  const pts = [V(f(0.15), 1.47, 0), V(f(0.2), 1.36, 0), V(f(0.242), 1.19, 0), V(f(0.275), 1.07, 0.01), V(f(0.305), 0.955, 0.02), V(f(0.324), 0.875, 0.038)];
  const radii = [[0.075, 0.07], [0.072, 0.068], [0.07, 0.066], [0.082, 0.078], [0.106, 0.1], [0.142, 0.132]];
  const rings = pathRings(pts, radii, 34);
  return loft(rings, {
    segments: 40,
    fold: foldsFn(v => 0.012 + 0.07 * smoothstep(0.55, 1, v), [[6, 1, 0.6], [11, 0.2, 0.4]]),
  });
}

function sash() {
  const keys = [{ y: 1.075, rx: 0.178, rz: 0.139 }, { y: 1.03, rx: 0.187, rz: 0.147 }, { y: 0.985, rx: 0.197, rz: 0.156 }];
  const band = loft(smoothRings(keys, 6), { segments: 64, fold: (t, v) => 1 + 0.012 * Math.sin(t * 14 + v * 5) });
  const knot = new THREE.SphereGeometry(1, 14, 10).scale(0.036, 0.03, 0.024).translate(0.065, 1.03, 0.152);
  const tailA = ribbon([V(0.06, 1.01, 0.163), V(0.07, 0.9, 0.172), V(0.075, 0.78, 0.183), V(0.08, 0.66, 0.198)], 0.045, V(0, 0, 1), 20, 0.06);
  const tailB = ribbon([V(0.08, 1.01, 0.158), V(0.105, 0.92, 0.164), V(0.12, 0.82, 0.18), V(0.13, 0.73, 0.19)], 0.04, V(0.3, 0, 1).normalize(), 18, 0.052);
  return { band, knot, tails: [tailA, tailB] };
}

function medallion() {
  const parts = [];
  const profile = [V(0, 0.006, 0), V(0.028, 0.006, 0), V(0.035, 0.0045, 0), V(0.04, 0, 0), V(0.035, -0.004, 0), V(0, -0.004, 0)].map(p => new THREE.Vector2(p.x, p.y));
  parts.push(new THREE.LatheGeometry(profile, 32).rotateX(Math.PI / 2));
  parts.push(new THREE.TorusGeometry(0.027, 0.0032, 8, 32).translate(0, 0, 0.006));
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    const ray = new THREE.ConeGeometry(0.0065, 0.022, 4).rotateZ(-Math.PI / 2).translate(0.049, 0, 0).rotateZ(a);
    parts.push(ray);
  }
  const loop = new THREE.TorusGeometry(0.008, 0.0022, 6, 16).translate(0, 0.047, 0);
  parts.push(loop);
  const m = new THREE.Matrix4().makeRotationX(-0.16).setPosition(0, 1.315, 0.136);
  const gold = mergeGeometries(parts.map(p => prepare(p.toNonIndexed ? p : p)).map(g => g.applyMatrix4(m)), false);
  const gem = new THREE.SphereGeometry(0.0145, 16, 12).scale(1, 1, 0.6).applyMatrix4(new THREE.Matrix4().makeRotationX(-0.16).setPosition(0, 1.315, 0.143));
  // corrente: dois arcos do pescoço até o medalhão, por fora da túnica
  const chainPts = s => [V(s * 0.06, 1.47, 0.112), V(s * 0.05, 1.42, 0.122), V(s * 0.032, 1.38, 0.131), V(s * 0.012, 1.36, 0.138)];
  const chains = [-1, 1].map(s => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(chainPts(s)), 24, 0.0022, 5, false));
  return { gold, gem, chains };
}

function buckle() {
  const plate = new THREE.BoxGeometry(0.06, 0.05, 0.01, 2, 2, 1).translate(0, 1.03, 0.158);
  const frame = new THREE.TorusGeometry(0.021, 0.004, 6, 4).rotateZ(Math.PI / 4).scale(1.25, 1, 1).translate(0, 1.03, 0.165);
  return [plate, frame];
}

// Mão de luva: palma e dedos em cápsulas. 'curl' fecha os dedos (o mago segura o cajado com a direita).
export function hand(spec, sideName, curl) {
  const s = spec[`${sideName}Hand`];
  const head = s.head.clone(), d = s.tail.clone().sub(s.head).normalize();
  const sign = sideName === 'Left' ? 1 : -1;
  let n = V(-sign, 0, 0.25).normalize();
  n.addScaledVector(d, -n.dot(d)).normalize();
  const a = new THREE.Vector3().crossVectors(d, n).normalize();
  const thumbSide = sideName === 'Right' ? 1 : -1;
  const basis = new THREE.Matrix4().makeBasis(a, d, n); // x = atravessa a palma, y = dedos, z = sai da palma
  const parts = [];
  const place = (g, pos, rot = null) => {
    if (rot) g.applyMatrix4(rot);
    g.applyMatrix4(basis);
    g.translate(pos.x, pos.y, pos.z);
    parts.push(g);
  };
  // punho de couro e palma
  place(new THREE.CylinderGeometry(0.036, 0.04, 0.05, 14).scale(1, 1, 0.75), head.clone().addScaledVector(d, -0.005));
  place(new THREE.SphereGeometry(1, 18, 12).scale(0.041, 0.05, 0.02), head.clone().addScaledVector(d, 0.045));
  // dedos: três falanges cada, dobrando em volta do eixo 'a'
  const joints = [];
  const fingers = [[-0.026, 0.044], [-0.009, 0.048], [0.009, 0.046], [0.026, 0.04]];
  fingers.forEach(([off, len], fi) => {
    // o indicador fica do lado do polegar
    const p0 = head.clone().addScaledVector(d, 0.082).addScaledVector(a, -off * thumbSide);
    let p = p0.clone();
    const dir = d.clone();
    const segs = [len * 0.48, len * 0.32, len * 0.26];
    const chain = [p.clone()];
    segs.forEach((L, k) => {
      // girar em volta de 'a' leva o dedo para o lado da palma (+n)
      const bend = curl[k] + (fi === 3 ? 0.08 : 0);
      dir.applyAxisAngle(a, bend);
      const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), dir.clone());
      const r = 0.0095 - k * 0.0012;
      const g = new THREE.CapsuleGeometry(r, L, 4, 10);
      g.applyQuaternion(q);
      const mid = p.clone().addScaledVector(dir, L / 2);
      g.translate(mid.x, mid.y, mid.z);
      parts.push(g);
      p = p.addScaledVector(dir, L);
      chain.push(p.clone());
    });
    joints.push(chain);
  });
  // polegar
  {
    let p = head.clone().addScaledVector(d, 0.03).addScaledVector(a, 0.03 * thumbSide).addScaledVector(n, 0.012);
    let dir = d.clone().multiplyScalar(0.55).addScaledVector(a, 0.55 * thumbSide).addScaledVector(n, 0.45).normalize();
    for (let k = 0; k < 2; k++) {
      const L = k ? 0.022 : 0.028;
      if (curl[0] > 0.8) dir.lerp(n.clone().addScaledVector(a, -0.6 * thumbSide).normalize(), 0.45).normalize();
      const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), dir);
      const g = new THREE.CapsuleGeometry(0.0105 - k * 0.0015, L, 4, 10).applyQuaternion(q);
      const mid = p.clone().addScaledVector(dir, L / 2);
      g.translate(mid.x, mid.y, mid.z);
      parts.push(g);
      p = p.addScaledVector(dir, L);
    }
  }
  // centro da pegada: o círculo que passa pelas juntas do dedo médio
  const [p1, p2, p3] = [joints[1][0], joints[1][1], joints[1][2]];
  const grip = circumcenter(p1, p2, p3);
  return { geo: mergeGeometries(parts.map(g => prepare(g)), false), basis: { a, d, n }, grip, joints: joints[1] };
}

function circumcenter(a, b, c) {
  const ab = b.clone().sub(a), ac = c.clone().sub(a);
  const abXac = new THREE.Vector3().crossVectors(ab, ac);
  const toC = new THREE.Vector3().crossVectors(abXac, ab).multiplyScalar(ac.lengthSq())
    .add(new THREE.Vector3().crossVectors(ac, abXac).multiplyScalar(ab.lengthSq()))
    .divideScalar(2 * abXac.lengthSq());
  return a.clone().add(toC);
}

function boot(sign) {
  const x = sign * 0.105;
  const shoe = new THREE.SphereGeometry(1, 20, 14, 0, TAU, 0, Math.PI * 0.62).scale(0.05, 0.075, 0.14).translate(x, 0.0, 0.1);
  const shaft = new THREE.CylinderGeometry(0.047, 0.052, 0.2, 16, 1, true).translate(x, 0.15, 0.0);
  const cuff = new THREE.TorusGeometry(0.049, 0.008, 6, 18).rotateX(Math.PI / 2).translate(x, 0.25, 0.0);
  return [shoe, shaft, cuff];
}

// ---------- montagem ----------
export function buildMage() {
  const { bones, byName, spec } = buildSkeleton();
  const W = weightsTools(spec);
  const mats = makeMaterials();
  const parts = []; // { geo, mat, weights }
  const add = (geo, mat, weights) => parts.push({ geo: prepare(geo), mat, weights });

  const torsoCloak = W.capsule(['Spine1', 'Spine2', 'Cape', 'LeftShoulder', 'RightShoulder'], 3, { Cape: 0.8 });
  const torso = W.capsule(['Hips', 'Spine', 'Spine1', 'Spine2'], 3);
  const robeSkirt = W.skirt({ front: ['RobeFront', 'RobeFront1'], back: ['RobeBack', 'RobeBack1'], left: ['RobeLeft', 'RobeLeft1'], right: ['RobeRight', 'RobeRight1'] });
  const cloakSkirt = W.skirt({ front: ['RobeFront', 'RobeFront1'], back: ['Cape1', 'Cape2'], left: ['RobeLeft', 'RobeLeft1'], right: ['RobeRight', 'RobeRight1'] });

  const robe = innerRobe();
  add(robe, mats.robe, W.byHeight(torso, robeSkirt, 0.9, 1.04));

  const cloak = outerCloak();
  const cloakW = W.byHeight(torsoCloak, cloakSkirt, 0.88, 1.06);
  add(cloak, mats.cloak, cloakW);
  add(liningOf(cloak, 0.005), mats.lining, cloakW);

  const shoulders = W.capsule(['Spine2', 'Neck', 'LeftShoulder', 'RightShoulder', 'LeftArm', 'RightArm'], 3, { LeftArm: 0.45, RightArm: 0.45 });
  const cap = capelet();
  add(cap, mats.capelet, shoulders);
  add(liningOf(cap, 0.005), mats.lining, shoulders);

  const headW = W.capsule(['Head', 'HoodTip', 'Neck', 'Spine2'], 4, { HoodTip: 0.5, Spine2: 0.35 });
  const h = hood();
  add(h.geo, mats.hood, headW);
  add(liningOf(h.geo, 0.006), mats.hoodInside, headW);
  add(h.rim, mats.gold, headW);
  // rosto em sombra e os olhos
  add(new THREE.SphereGeometry(0.106, 24, 18).scale(1, 1.12, 1).translate(0, 1.655, -0.002), mats.void, W.rigid('Head'));
  for (const s of [-1, 1]) {
    add(new THREE.SphereGeometry(1, 16, 10).scale(0.0135, 0.0062, 0.005).rotateZ(s * 0.22).translate(s * 0.035, 1.67, 0.105), mats.eyes, W.rigid('Head'));
  }

  let rightHand = null;
  for (const [sign, name] of [[1, 'Left'], [-1, 'Right']]) {
    const sl = sleeve(sign);
    const arm = W.capsule([`${name}Arm`, `${name}ForeArm`, `${name}Hand`, 'Spine2'], 4, { Spine2: 0.25, [`${name}Hand`]: 0.6 });
    add(sl, mats.sleeve, arm);
    add(liningOf(sl, 0.005), mats.lining, arm);
    const curl = name === 'Right' ? [1.0, 1.05, 0.9] : [0.32, 0.38, 0.3];
    const hd = hand(spec, name, curl);
    add(hd.geo, mats.leather, W.capsule([`${name}Hand`, `${name}ForeArm`], 4, { [`${name}ForeArm`]: 0.2 }));
    if (name === 'Right') rightHand = hd;
    for (const g of boot(sign)) add(g, mats.leather, W.capsule([`${name}Foot`, `${name}ToeBase`, `${name}Leg`], 4, { [`${name}Leg`]: 0.5 }));
  }

  const sh = sash();
  add(sh.band, mats.sash, W.capsule(['Hips', 'Spine'], 3));
  add(sh.knot, mats.sash, W.capsule(['Hips', 'Spine'], 3));
  for (const t of sh.tails) add(t, mats.sash, robeSkirt);
  for (const g of buckle()) add(g, mats.gold, W.rigid('Hips'));

  const med = medallion();
  add(med.gold, mats.gold, W.rigid('Spine2'));
  add(med.gem, mats.gem, W.rigid('Spine2'));
  for (const c of med.chains) add(c, mats.gold, W.capsule(['Spine2', 'Neck'], 3));

  // pesos e junção: uma malha, um grupo por material
  const matList = [];
  const geos = parts.map(({ geo, mat, weights }) => {
    setWeights(geo, weights);
    let mi = matList.indexOf(mat);
    if (mi < 0) { matList.push(mat); mi = matList.length - 1; }
    geo.userData = { mi }; // objeto novo: clone() de geometria compartilha o userData
    return geo;
  });
  // agrupa por material para ter um grupo (e uma chamada de desenho) por material
  const byMat = matList.map((_, i) => geos.filter(g => g.userData.mi === i));
  const merged = mergeGeometries(byMat.map(list => mergeGeometries(list, false)), true);
  merged.computeBoundingSphere();

  const mesh = new THREE.SkinnedMesh(merged, matList);
  mesh.name = 'MagoCorpo';
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;

  const root = new THREE.Group();
  root.name = 'Mago';
  root.add(byName.Hips);
  root.add(mesh);
  root.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(bones);
  mesh.bind(skeleton);

  // pose de repouso do jogo: braço direito segura o cajado de pé, esquerdo solto ao lado
  const pose = idlePose(byName);
  applyPose(byName, pose);
  root.updateMatrixWorld(true);
  orientGrip(byName, rightHand);
  root.updateMatrixWorld(true);

  // cajado preso à mão direita, de pé, passando pelo centro da pegada; a grossura acompanha a mão fechada
  const loopR = rightHand.grip.distanceTo(rightHand.joints[0]);
  const staff = buildStaff({ radius: THREE.MathUtils.clamp(loopR - 0.0105, 0.012, 0.024) });
  const handBone = byName.RightHand;
  const gripWorld = handBone.localToWorld(rightHand.grip.clone().sub(spec.RightHand.head));
  staff.group.position.set(gripWorld.x, 0, gripWorld.z);
  root.add(staff.group);
  root.updateMatrixWorld(true);
  handBone.attach(staff.group);
  pose.RightHand = handBone.quaternion.clone();

  return { root, mesh, skeleton, bones: byName, spec, materials: mats, staff, idle: pose, gripHeight: gripWorld.y, gripLoop: loopR };
}

// Rotações (em radianos) de cada osso na pose de repouso.
export function idlePose(b) {
  const q = (x, y, z) => new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z, 'XYZ'));
  return {
    Head: q(0.1, 0, 0),
    Neck: q(0.04, 0, 0),
    Spine2: q(-0.02, 0, 0),
    LeftArm: q(-0.06, 0, 0.16),
    LeftForeArm: q(-0.32, 0, 0.05),
    LeftHand: q(-0.1, 0, 0.05),
    RightArm: q(-0.32, 0, -0.32),
    RightForeArm: q(-1.0, 0.2, 0),
  };
}

export function applyPose(byName, pose) {
  for (const [name, quat] of Object.entries(pose)) if (byName[name]) byName[name].quaternion.copy(quat);
}

// Gira a mão direita para o eixo da pegada ficar de pé, com os dedos para a frente.
function orientGrip(byName, rightHand) {
  const { a, d, n } = rightHand.basis;
  const A = V(0, 1, 0);
  const D = V(0.45, 0, 1).normalize();
  const N = new THREE.Vector3().crossVectors(A, D).normalize();
  const D2 = new THREE.Vector3().crossVectors(N, A).normalize();
  const from = new THREE.Matrix4().makeBasis(a, d, n);
  const to = new THREE.Matrix4().makeBasis(A, D2, N);
  const R = to.multiply(from.clone().invert());
  const want = new THREE.Quaternion().setFromRotationMatrix(R);
  const parent = byName.RightForeArm;
  const pq = new THREE.Quaternion();
  parent.getWorldQuaternion(pq);
  byName.RightHand.quaternion.copy(pq.invert().multiply(want));
}
