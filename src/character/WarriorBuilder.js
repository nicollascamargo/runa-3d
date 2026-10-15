// Modelo do guerreiro, feito em código como o mago: armadura de placas de aço escurecido com bordas douradas,
// tecido azul-escuro entre as placas, ombreiras em camadas, elmo de grade com pluma, tabardo azul na frente e
// atrás, cinto com bolsas, luvas e botas de placas. A espada longa (com runas acesas na lâmina) vai presa à mão
// direita e o escudo ornamentado ao antebraço esquerdo.
//
// Usa o mesmo esqueleto do mago (src/character/skeleton.js): as mesmas poses, animações em código e exportação
// para .glb funcionam. As placas são rígidas (cada uma segue um osso); o tecido entre elas dobra com a pele.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { loft, smoothRings, pathRings, prepare, setWeights } from './geometry.js';
import { buildSkeleton } from './skeleton.js';
import { weightsTools, velvet, hand, applyPose } from './MageBuilder.js';
import { clothTextures, leatherTextures, makeCanvas, toTexture, readHeight, heightToNormal, makeGlyphs, drawGlyph } from '../fx/textures.js';
import { rng } from '../fx/random.js';

const TAU = Math.PI * 2;
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const q = (x, y, z) => new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z, 'XYZ'));

// ---------- texturas ----------
// Aço: arranhões finos, manchas de uso e volutas em relevo (como as placas trabalhadas da referência).
function plateTextures(size = 512, seed = 41) {
  const r = rng(seed);
  const [c, cx] = makeCanvas(size), [hc, hx] = makeCanvas(size);
  const g = cx.createLinearGradient(0, 0, 0, size);
  g.addColorStop(0, '#8a8f9c'); g.addColorStop(1, '#6c7280');
  cx.fillStyle = g; cx.fillRect(0, 0, size, size);
  hx.fillStyle = '#808080'; hx.fillRect(0, 0, size, size);
  for (let i = 0; i < 160; i++) { // manchas
    const x = r() * size, y = r() * size, rr = 10 + r() * 50;
    const gg = cx.createRadialGradient(x, y, 0, x, y, rr);
    gg.addColorStop(0, `rgba(${r() < 0.5 ? '40,44,54' : '160,166,178'},${0.05 + r() * 0.08})`); gg.addColorStop(1, 'rgba(0,0,0,0)');
    cx.fillStyle = gg; cx.fillRect(x - rr, y - rr, rr * 2, rr * 2);
  }
  // volutas em relevo: curvas grossas no mapa de altura, com o brilho da crista no mapa de cor
  for (let i = 0; i < 9; i++) {
    const x0 = r() * size, y0 = r() * size, a0 = r() * TAU, len = 60 + r() * 90;
    hx.lineCap = cx.lineCap = 'round';
    for (const [ctx, w, col] of [[hx, 9, '#c8c8c8'], [hx, 4, '#f0f0f0'], [cx, 2.5, 'rgba(225,230,240,0.35)']]) {
      ctx.strokeStyle = col; ctx.lineWidth = w;
      ctx.beginPath();
      let x = x0, y = y0, a = a0;
      ctx.moveTo(x, y);
      for (let k = 0; k < 24; k++) { a += 0.18 + k * 0.012; x += Math.cos(a) * len / 24; y += Math.sin(a) * len / 24; ctx.lineTo(x, y); }
      ctx.stroke();
    }
  }
  cx.strokeStyle = 'rgba(210,215,225,0.18)'; cx.lineWidth = 0.6; // arranhões
  for (let i = 0; i < 140; i++) { const x = r() * size, y = r() * size, a = r() * TAU, l = 6 + r() * 26; cx.beginPath(); cx.moveTo(x, y); cx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); cx.stroke(); }
  return { map: toTexture(c), normal: toTexture(heightToNormal(readHeight(hx, size, size), size, size, 3), { color: false }) };
}

// Runas da lâmina: glifos acesos numa faixa estreita (cor emissiva).
function bladeRunes(seed = 77) {
  const w = 64, h = 512;
  const [c, cx] = makeCanvas(w, h);
  cx.fillStyle = '#000'; cx.fillRect(0, 0, w, h);
  const glyphs = makeGlyphs(10, seed);
  cx.strokeStyle = '#ffffff'; cx.lineCap = 'round';
  glyphs.forEach((gl, i) => drawGlyph(cx, gl, 14, 16 + i * 49, 36, 40, 3.2));
  const t = toTexture(c);
  return t;
}

function makeMaterials() {
  const plate = plateTextures();
  const cloth = clothTextures({ size: 512, base: '#1b2b6e', seed: 31, trims: [] });
  const tabard = clothTextures({ size: 512, base: '#22378c', seed: 33, trims: [
    { u0: 0, u1: 0.06, v0: 0, v1: 1, axis: 'v', pattern: 'plain' },
    { u0: 0.94, u1: 1, v0: 0, v1: 1, axis: 'v', pattern: 'plain' },
  ] });
  const leather = leatherTextures(5, '#4b3020');
  const mats = {
    // a caverna é escura: o metal pede mais reflexo do ambiente (envMapIntensity) e menos "metalidade",
    // senão vira quase preto; assim fica prata envelhecida, como na referência
    steel: new THREE.MeshStandardMaterial({ map: plate.map, normalMap: plate.normal, normalScale: new THREE.Vector2(0.9, 0.9), color: '#e4e8ef', metalness: 0.55, roughness: 0.32, envMapIntensity: 3.2, vertexColors: true }),
    darkSteel: new THREE.MeshStandardMaterial({ map: plate.map, normalMap: plate.normal, color: '#a9afbb', metalness: 0.6, roughness: 0.4, envMapIntensity: 3, vertexColors: true }),
    gold: new THREE.MeshStandardMaterial({ color: '#d9a94c', metalness: 0.9, roughness: 0.3, envMapIntensity: 2.6, vertexColors: true }),
    cloth: velvet(cloth, '#5c76d4'),
    tabard: velvet(tabard, '#6f89e6', { side: THREE.DoubleSide }),
    leather: new THREE.MeshStandardMaterial({ map: leather.map, normalMap: leather.normal, roughness: 0.6, metalness: 0, vertexColors: true }),
    visor: new THREE.MeshStandardMaterial({ color: '#05060a', roughness: 0.9, metalness: 0, vertexColors: true }),
    eyes: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.8, 1.9, 4.2), toneMapped: false }),
  };
  const names = { steel: 'aco', darkSteel: 'aco_escuro', gold: 'ouro', cloth: 'tecido', tabard: 'tabardo', leather: 'couro', visor: 'visor', eyes: 'olhos' };
  for (const [k, m] of Object.entries(mats)) m.name = names[k];
  return mats;
}

// ---------- peças ----------
// anéis sempre de cima para baixo: na ordem contrária, as faces do loft ficam viradas para dentro (e somem)
const band = (keys, n, opts = {}) => loft(smoothRings([...keys].sort((a, b) => b.y - a.y), n), { segments: 40, ...opts });
const tube = (pts, radii, n = 10, front = V(0, 0, 1)) => loft(pathRings(pts, radii, n, front), { segments: 20, aoStrength: 0 });
const lerpV = (a, b, t) => a.clone().lerp(b, t);

function cuirass() {
  const keys = [
    { y: 1.03, rx: 0.176, rz: 0.13, cz: 0 }, { y: 1.12, rx: 0.183, rz: 0.135, cz: 0.004 },
    { y: 1.23, rx: 0.2, rz: 0.15, cz: 0.012 }, { y: 1.33, rx: 0.222, rz: 0.158, cz: 0.016 },
    { y: 1.41, rx: 0.218, rz: 0.15, cz: 0.012 }, { y: 1.47, rx: 0.19, rz: 0.132, cz: 0.006 },
    { y: 1.505, rx: 0.135, rz: 0.104, cz: 0.004 },
  ];
  // quilha na frente (a placa do peito faz uma crista no meio)
  const fold = theta => 1 + 0.07 * Math.max(0, Math.cos(theta)) ** 12 + 0.02 * Math.max(0, Math.cos(theta)) ** 2;
  const body = band(keys, 22, { fold });
  const trimTop = band([{ y: 1.488, rx: 0.172, rz: 0.124, cz: 0.006 }, { y: 1.512, rx: 0.14, rz: 0.108, cz: 0.004 }], 3, { segments: 48 });
  const trimBottom = band([{ y: 1.045, rx: 0.183, rz: 0.137 }, { y: 1.02, rx: 0.183, rz: 0.137 }], 3, { segments: 48, fold });
  // faixa dourada no meio do peito, e as volutas do relevo ficam na textura
  const chestRib = band([{ y: 1.36, rx: 0.226, rz: 0.162, cz: 0.016 }, { y: 1.335, rx: 0.228, rz: 0.163, cz: 0.016 }], 3, { segments: 48, fold, gap: () => Math.PI * 0.62 });
  return { body, gold: [trimTop, trimBottom, chestRib] };
}

function gambeson() {
  // tecido azul por baixo de tudo: aparece no pescoço, nos vãos das placas e abaixo da cintura
  return band([
    { y: 0.84, rx: 0.17, rz: 0.13 }, { y: 0.98, rx: 0.172, rz: 0.125 }, { y: 1.2, rx: 0.185, rz: 0.135 },
    { y: 1.4, rx: 0.2, rz: 0.135 }, { y: 1.5, rx: 0.12, rz: 0.1 }, { y: 1.58, rx: 0.075, rz: 0.075 },
  ], 18);
}

function faulds() {
  const steel = [], gold = [];
  for (let k = 0; k < 3; k++) {
    const y0 = 1.02 - k * 0.052, y1 = y0 - 0.068, rx = 0.188 + k * 0.016, rz = 0.14 + k * 0.012;
    steel.push(band([{ y: y0, rx, rz }, { y: y1, rx: rx + 0.012, rz: rz + 0.01 }], 4, { segments: 44 }));
    if (k === 2) gold.push(band([{ y: y1 + 0.012, rx: rx + 0.013, rz: rz + 0.011 }, { y: y1 - 0.004, rx: rx + 0.015, rz: rz + 0.012 }], 3, { segments: 44 }));
  }
  return { steel, gold };
}

// Tabardo: um pano azul com ponta, na frente (side 1) e atrás (side -1), com borda dourada.
function tabard(side) {
  const cols = 10, rows = 16, pos = [], uv = [], idx = [];
  for (let j = 0; j <= rows; j++) {
    const v = j / rows, y = 0.97 - v * 0.6;
    const half = 0.1 + 0.035 * Math.sin(Math.min(1, v * 1.4) * Math.PI * 0.5);
    for (let i = 0; i <= cols; i++) {
      const u = i / cols, x = (u - 0.5) * 2 * half;
      // ponta: os lados sobem perto do fim
      const tip = v > 0.8 ? (Math.abs(u - 0.5) * 2) * (v - 0.8) * 0.5 : 0;
      const z = side * (0.195 + 0.035 * v - 0.08 * (x / 0.15) ** 2 * (0.3 + v * 0.7));
      pos.push(x, y + tip, z);
      uv.push(u, v);
    }
  }
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const a = j * (cols + 1) + i, b = a + 1, c = a + cols + 1, d = c + 1;
    if (side > 0) idx.push(a, c, b, b, c, d); else idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  // borda dourada de baixo, seguindo a ponta
  const edge = [];
  for (let i = 0; i <= cols; i++) { const k = (rows) * (cols + 1) + i; edge.push(V(pos[k * 3], pos[k * 3 + 1] + 0.01, pos[k * 3 + 2] + side * 0.004)); }
  const trim = tube(edge, [[0.007, 0.007], [0.007, 0.007]], 14);
  return { cloth: g, trim };
}

function belt() {
  const strap = band([{ y: 1.005, rx: 0.205, rz: 0.152 }, { y: 0.965, rx: 0.205, rz: 0.152 }], 3, { segments: 48 });
  const pouches = [-1, 1].map(s => new THREE.BoxGeometry(0.075, 0.07, 0.04, 2, 2, 2).translate(s * 0.13, 0.955, 0.155).rotateY(-s * 0.35));
  const flaps = [-1, 1].map(s => new THREE.BoxGeometry(0.08, 0.03, 0.046).translate(s * 0.13, 0.98, 0.156).rotateY(-s * 0.35));
  const buckle = [new THREE.BoxGeometry(0.06, 0.05, 0.012).translate(0, 0.985, 0.166), new THREE.BoxGeometry(0.035, 0.026, 0.016).translate(0, 0.985, 0.168)];
  return { leather: [strap, ...pouches, ...flaps], gold: [buckle[0]], steel: [buckle[1]] };
}

function gorget() {
  const steel = band([{ y: 1.47, rx: 0.15, rz: 0.12 }, { y: 1.53, rx: 0.1, rz: 0.09 }, { y: 1.57, rx: 0.082, rz: 0.08 }], 6, { segments: 36 });
  const gold = band([{ y: 1.565, rx: 0.086, rz: 0.084 }, { y: 1.58, rx: 0.084, rz: 0.082 }], 3, { segments: 36 });
  return { steel, gold };
}

// Ombreira: três lâminas em cúpula, cada uma mais larga e mais baixa, viradas para fora; borda dourada em cada.
function pauldron(s) {
  const steel = [], gold = [];
  for (let k = 0; k < 3; k++) {
    const sc = 1 + k * 0.1, cx = s * (0.21 + k * 0.03), cy = 1.5 - k * 0.055;
    const dome = new THREE.SphereGeometry(1, 26, 10, 0, TAU, 0, Math.PI * (k ? 0.36 : 0.5)).scale(0.135 * sc, 0.1 * sc, 0.128 * sc).rotateZ(-s * (0.5 + k * 0.12)).translate(cx, cy, 0.0);
    steel.push(dome);
    const rimR = k ? Math.sin(Math.PI * 0.36) : 1;
    const rimY = k ? Math.cos(Math.PI * 0.36) : 0;
    const rim = new THREE.TorusGeometry(1, 0.06, 6, 40).rotateX(Math.PI / 2).scale(0.135 * sc * rimR, 0.1 * sc, 0.128 * sc * rimR).translate(0, rimY * 0.1 * sc, 0).rotateZ(-s * (0.5 + k * 0.12)).translate(cx, cy, 0.0);
    gold.push(rim);
  }
  // espigão dourado em cima, como a ombreira da referência
  gold.push(new THREE.ConeGeometry(0.03, 0.08, 8).rotateZ(-s * 0.9).translate(s * 0.27, 1.57, 0));
  return { steel, gold };
}

function armPlates(spec, side) {
  const A = spec[`${side}Arm`], F = spec[`${side}ForeArm`], H = spec[`${side}Hand`];
  const sh = A.head, el = F.head, wr = H.head;
  const steel = [], gold = [], cloth = [];
  cloth.push(tube([lerpV(sh, el, -0.05), el, lerpV(el, wr, 0.5), wr], [[0.06, 0.062], [0.05, 0.052], [0.045, 0.045], [0.04, 0.04]], 12));
  steel.push(tube([lerpV(sh, el, 0.28), lerpV(sh, el, 0.62), lerpV(sh, el, 0.9)], [[0.064, 0.066], [0.06, 0.062], [0.056, 0.058]], 6));   // braçal de cima
  steel.push(tube([lerpV(el, wr, 0.14), lerpV(el, wr, 0.55), lerpV(el, wr, 0.9)], [[0.057, 0.058], [0.053, 0.055], [0.05, 0.051]], 7));  // braçal de baixo
  gold.push(tube([lerpV(el, wr, 0.86), lerpV(el, wr, 0.95)], [[0.054, 0.055], [0.055, 0.056]], 3));
  // cotoveleira: concha com leque para fora
  const sgn = side === 'Left' ? 1 : -1;
  steel.push(new THREE.SphereGeometry(0.058, 16, 10).scale(1, 1, 0.9).translate(el.x, el.y, el.z - 0.01));
  gold.push(new THREE.CylinderGeometry(0.055, 0.055, 0.012, 16).rotateZ(Math.PI / 2).scale(1, 1, 0.8).translate(el.x + sgn * 0.045, el.y, el.z - 0.01));
  // manopla: punho de aço que abre
  steel.push(new THREE.CylinderGeometry(0.052, 0.042, 0.06, 16, 1, true).translate(wr.x, wr.y + 0.005, wr.z));
  return { steel, gold, cloth };
}

function legPlates(spec, side) {
  const U = spec[`${side}UpLeg`], L = spec[`${side}Leg`], Fo = spec[`${side}Foot`];
  const hip = U.head, kn = L.head, an = Fo.head;
  const steel = [], gold = [], cloth = [], leather = [];
  cloth.push(tube([lerpV(hip, kn, -0.05), kn, an], [[0.085, 0.09], [0.06, 0.062], [0.048, 0.05]], 12));
  steel.push(tube([lerpV(hip, kn, 0.2), lerpV(hip, kn, 0.55), lerpV(hip, kn, 0.88)], [[0.092, 0.095], [0.082, 0.086], [0.07, 0.072]], 7)); // coxote
  steel.push(tube([lerpV(kn, an, 0.12), lerpV(kn, an, 0.5), lerpV(kn, an, 0.88)], [[0.066, 0.07], [0.06, 0.064], [0.054, 0.056]], 7));     // grevas
  gold.push(tube([lerpV(kn, an, 0.82), lerpV(kn, an, 0.9)], [[0.058, 0.06], [0.058, 0.06]], 3));
  // joelheira com leque e ponta
  steel.push(new THREE.SphereGeometry(0.065, 16, 10).scale(1, 1.1, 0.75).translate(kn.x, kn.y, kn.z + 0.05));
  gold.push(new THREE.ConeGeometry(0.035, 0.07, 4).rotateX(Math.PI / 2).translate(kn.x, kn.y, kn.z + 0.105));
  // pé: bota de couro e escarpes de aço em lâminas, com bico
  const x = an.x;
  leather.push(new THREE.SphereGeometry(1, 20, 12, 0, TAU, 0, Math.PI * 0.62).scale(0.055, 0.08, 0.15).translate(x, 0.0, 0.08));
  for (let k = 0; k < 3; k++) steel.push(new THREE.SphereGeometry(1, 18, 8, 0, TAU, 0, Math.PI * 0.42).scale(0.06, 0.06 - k * 0.008, 0.075).translate(x, 0.05 - k * 0.012, 0.06 + k * 0.05));
  gold.push(new THREE.ConeGeometry(0.022, 0.07, 6).rotateX(Math.PI / 2).translate(x, 0.025, 0.215));
  return { steel, gold, cloth, leather };
}

// Elmo fechado de grade: cúpula, viseira escura com barras douradas, coroa e crista douradas, pluma azul.
function helmet() {
  // perfil de baixo para cima (assim as faces do torno ficam viradas para fora)
  const prof = [[0.112, 1.545], [0.118, 1.555], [0.13, 1.595], [0.137, 1.665], [0.138, 1.745], [0.128, 1.81], [0.1, 1.855], [0.06, 1.878], [0.0, 1.885]].map(([r, y]) => new THREE.Vector2(r, y));
  const dome = new THREE.LatheGeometry(prof, 36).scale(1, 1, 1.12).translate(0, 0, 0.005);
  const steel = [dome];
  const gold = [], visor = [];
  // viseira: uma faixa escura na frente, com barras douradas por cima
  visor.push(new THREE.CylinderGeometry(0.139, 0.139, 0.11, 24, 1, true, -0.62, 1.24).scale(1, 1, 1.12).translate(0, 1.685, 0.008));
  for (let i = -2; i <= 2; i++) {
    const a = i * 0.2;
    gold.push(new THREE.BoxGeometry(0.012, 0.115, 0.012).rotateY(a).translate(Math.sin(a) * 0.142, 1.685, Math.cos(a) * 0.142 * 1.12 + 0.008));
  }
  gold.push(new THREE.TorusGeometry(0.14, 0.008, 6, 40, Math.PI * 0.9).rotateZ(Math.PI * 0.05).rotateX(Math.PI / 2).rotateY(-Math.PI / 2 + Math.PI * 0.45).scale(1, 1, 1.12).translate(0, 1.742, 0.008)); // aba de cima da viseira
  gold.push(new THREE.TorusGeometry(0.14, 0.008, 6, 40, Math.PI * 0.9).rotateZ(Math.PI * 0.05).rotateX(Math.PI / 2).rotateY(-Math.PI / 2 + Math.PI * 0.45).scale(1, 1, 1.12).translate(0, 1.628, 0.008));
  gold.push(new THREE.TorusGeometry(0.135, 0.009, 6, 44).rotateX(Math.PI / 2).scale(1, 1, 1.12).translate(0, 1.79, 0.006)); // coroa
  // crista: um arco dourado da testa até a nuca
  const crest = new THREE.CatmullRomCurve3([V(0, 1.77, 0.16), V(0, 1.86, 0.1), V(0, 1.893, 0.0), V(0, 1.86, -0.1), V(0, 1.77, -0.15)]);
  gold.push(new THREE.TubeGeometry(crest, 24, 0.011, 6, false).scale(1, 1, 1));
  // olhos acesos atrás da grade
  const eyes = [-1, 1].map(s => new THREE.SphereGeometry(1, 10, 8).scale(0.016, 0.007, 0.006).translate(s * 0.042, 1.7, 0.135));
  // pluma azul saindo do alto e caindo para trás
  const plume = loft(pathRings([V(0, 1.885, 0.02), V(0, 1.96, -0.06), V(0, 1.97, -0.17), V(0, 1.9, -0.28), V(0, 1.74, -0.33)],
    [[0.022, 0.034], [0.03, 0.05], [0.026, 0.05], [0.018, 0.034], [0.006, 0.012]], 18, V(0, 1, 0)), { segments: 16, aoStrength: 2 });
  return { steel, gold, visor, eyes, plume };
}

// Espada longa: lâmina com sulco de runas acesas, guarda dourada, punho de couro e pomo. Eixo +Y = lâmina.
function buildSword(mats) {
  const group = new THREE.Group();
  group.name = 'Espada';
  const s = new THREE.Shape();
  s.moveTo(-0.027, 0.12); s.lineTo(0.027, 0.12); s.lineTo(0.023, 0.93); s.lineTo(0, 1.07); s.lineTo(-0.023, 0.93); s.closePath();
  const blade = new THREE.ExtrudeGeometry(s, { depth: 0.004, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.007, bevelSegments: 2, curveSegments: 4 }).translate(0, 0, -0.002);
  const bladeMat = new THREE.MeshStandardMaterial({ name: 'lamina', color: '#e6e9ef', metalness: 0.85, roughness: 0.16, envMapIntensity: 4 });
  const runeTex = bladeRunes();
  const runeMat = new THREE.MeshStandardMaterial({ name: 'runas', color: '#566b90', emissive: '#4f8cff', emissiveMap: runeTex, emissiveIntensity: 2.2, metalness: 1, roughness: 0.25 });
  // prepare(): os materiais usam cor por vértice; sem esse dado, a peça sairia preta
  const add = (geo, mat) => { const m = new THREE.Mesh(prepare(geo), mat); m.castShadow = true; group.add(m); return m; };
  add(blade, bladeMat);
  for (const z of [-1, 1]) add(new THREE.PlaneGeometry(0.018, 0.62).rotateY(z < 0 ? Math.PI : 0).translate(0, 0.47, z * 0.0065), runeMat);
  add(new THREE.BoxGeometry(0.21, 0.024, 0.034).translate(0, 0.108, 0), mats.gold);                         // guarda
  for (const x of [-1, 1]) add(new THREE.SphereGeometry(0.02, 12, 8).translate(x * 0.108, 0.112, 0), mats.gold);
  add(new THREE.CylinderGeometry(0.016, 0.018, 0.19, 12).translate(0, 0, 0), mats.leather);                 // punho
  add(new THREE.SphereGeometry(0.026, 14, 10).scale(1, 1.1, 1).translate(0, -0.118, 0), mats.gold);          // pomo
  return { group, runeMat, tip: V(0, 1.07, 0), base: V(0, 0.14, 0) };
}

// Escudo de cavaleiro (ponta embaixo), curvo, com moldura dourada, campo de aço com volutas e bossa no meio.
// Frente virada para +Z.
// Contorno do escudo (o mesmo do modelo): também usado pelo brilho que percorre a borda (src/fx/WarriorFx.js).
export function shieldOutline(k = 1, dy = 0) {
  const sh = new THREE.Shape();
  sh.moveTo(-0.25 * k, 0.31 * k + dy); sh.quadraticCurveTo(0, 0.35 * k + dy, 0.25 * k, 0.31 * k + dy);
  sh.lineTo(0.25 * k, 0.04 * k + dy); sh.quadraticCurveTo(0.23 * k, -0.2 * k + dy, 0, -0.37 * k + dy);
  sh.quadraticCurveTo(-0.23 * k, -0.2 * k + dy, -0.25 * k, 0.04 * k + dy); sh.closePath();
  return sh;
}
export const SHIELD_BEND = 1.2; // o escudo é curvo: z -= SHIELD_BEND × x²

function buildShield(mats) {
  const group = new THREE.Group();
  group.name = 'Escudo';
  const outline = shieldOutline;
  const bend = (g, amount) => { // curva o escudo (o meio para a frente)
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setZ(i, p.getZ(i) - amount * p.getX(i) ** 2);
    g.computeVertexNormals();
    return g;
  };
  const rim = bend(new THREE.ExtrudeGeometry(outline(1), { depth: 0.02, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.012, bevelSegments: 2, curveSegments: 16 }), 1.2);
  const field = bend(new THREE.ExtrudeGeometry(outline(0.86, -0.005), { depth: 0.012, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.006, bevelSegments: 1, curveSegments: 16 }).translate(0, 0, 0.026), 1.2);
  const add = (geo, mat) => { const m = new THREE.Mesh(prepare(geo), mat); m.castShadow = true; m.receiveShadow = true; group.add(m); return m; };
  add(rim, mats.gold);
  // campo de aço com UV planar (a textura com volutas cobre o campo inteiro)
  const p = field.attributes.position, uv = field.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) + 0.5, p.getY(i) + 0.5);
  add(field, mats.steel);
  add(new THREE.SphereGeometry(0.06, 20, 12, 0, TAU, 0, Math.PI / 2).rotateX(Math.PI / 2).scale(1, 1, 0.55).translate(0, 0.02, 0.045), mats.gold); // bossa
  const cross = new THREE.BoxGeometry(0.03, 0.5, 0.012).translate(0, -0.02, 0.04);
  add(bend(cross, 1.2), mats.gold);
  add(bend(new THREE.BoxGeometry(0.36, 0.028, 0.012).translate(0, 0.12, 0.04), 1.2), mats.gold);
  return { group };
}

// Pose de repouso do guerreiro: em guarda, espada baixa na direita, escudo à frente na esquerda.
export function warriorIdlePose() {
  return {
    Hips: q(0, 0, 0), Spine: q(0.03, 0, 0), Spine2: q(0.02, 0, 0), Head: q(0.06, 0, 0), Neck: q(0.03, 0, 0),
    LeftShoulder: q(0, 0, 0.05), RightShoulder: q(0, 0, -0.05),
    LeftArm: q(-0.42, 0.1, 0.32), LeftForeArm: q(-1.15, 0.35, 0.1), LeftHand: q(0, 0, -0.2),
    RightArm: q(-0.18, 0, -0.26), RightForeArm: q(-0.62, -0.1, 0), RightHand: q(0.1, 0, 0),
    LeftUpLeg: q(-0.06, 0, 0.07), RightUpLeg: q(0.06, 0, -0.07), LeftLeg: q(0.08, 0, 0), RightLeg: q(0.06, 0, 0),
  };
}

// ---------- montagem ----------
export function buildWarrior() {
  const { bones, byName, spec } = buildSkeleton();
  const W = weightsTools(spec);
  const mats = makeMaterials();
  const parts = [];
  const add = (geo, mat, weights) => parts.push({ geo: prepare(geo), mat, weights });
  const addAll = (list, mat, weights) => { for (const g of list) add(g, mat, weights); };

  const torso = W.capsule(['Hips', 'Spine', 'Spine1', 'Spine2'], 3);
  const chest = W.capsule(['Spine1', 'Spine2'], 4, { Spine1: 0.6 });
  const neck = W.capsule(['Spine2', 'Neck'], 4, { Spine2: 0.6 });
  const head = W.capsule(['Head', 'HoodTip'], 5, { HoodTip: 0.15 });

  add(gambeson(), mats.cloth, W.capsule(['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'LeftUpLeg', 'RightUpLeg'], 3, { Neck: 0.5, LeftUpLeg: 0.35, RightUpLeg: 0.35 }));
  const c = cuirass();
  add(c.body, mats.steel, chest);
  addAll(c.gold, mats.gold, chest);
  const f = faulds();
  addAll(f.steel, mats.darkSteel, W.rigid('Hips'));
  addAll(f.gold, mats.gold, W.rigid('Hips'));
  const b = belt();
  addAll(b.leather, mats.leather, W.rigid('Hips'));
  addAll(b.gold, mats.gold, W.rigid('Hips'));
  addAll(b.steel, mats.steel, W.rigid('Hips'));
  for (const side of [1, -1]) {
    const tb = tabard(side);
    const chain = side > 0 ? W.skirt({ front: ['RobeFront', 'RobeFront1'] }) : W.skirt({ back: ['RobeBack', 'RobeBack1'] });
    add(tb.cloth, mats.tabard, chain);
    add(tb.trim, mats.gold, chain);
  }
  const gg = gorget();
  add(gg.steel, mats.steel, neck);
  add(gg.gold, mats.gold, neck);

  for (const [s, side] of [[1, 'Left'], [-1, 'Right']]) {
    const p = pauldron(s);
    const pw = W.capsule([`${side}Shoulder`, `${side}Arm`], 4, { [`${side}Arm`]: 0.55 });
    addAll(p.steel, mats.steel, pw);
    addAll(p.gold, mats.gold, pw);
    const a = armPlates(spec, side);
    const armW = W.capsule([`${side}Arm`, `${side}ForeArm`, `${side}Hand`], 5, { [`${side}Hand`]: 0.5 });
    addAll(a.cloth, mats.cloth, W.capsule([`${side}Arm`, `${side}ForeArm`, `${side}Hand`, 'Spine2'], 4, { Spine2: 0.25, [`${side}Hand`]: 0.6 }));
    addAll(a.steel, mats.steel, armW);
    addAll(a.gold, mats.gold, armW);
    const hd = hand(spec, side, side === 'Right' ? [1.0, 1.05, 0.95] : [0.85, 0.9, 0.85]);
    add(hd.geo, mats.leather, W.capsule([`${side}Hand`, `${side}ForeArm`], 4, { [`${side}ForeArm`]: 0.2 }));
    const l = legPlates(spec, side);
    addAll(l.cloth, mats.cloth, W.capsule([`${side}UpLeg`, `${side}Leg`, `${side}Foot`, 'Hips'], 4, { Hips: 0.3 }));
    addAll(l.steel.slice(0, 1), mats.steel, W.capsule([`${side}UpLeg`], 4));
    addAll(l.steel.slice(1, 3), mats.steel, W.capsule([`${side}Leg`], 4));
    addAll(l.steel.slice(3), mats.steel, W.capsule([`${side}Foot`, `${side}ToeBase`], 4));
    addAll(l.gold.slice(0, 2), mats.gold, W.capsule([`${side}Leg`], 4));
    addAll(l.gold.slice(2), mats.gold, W.capsule([`${side}Foot`, `${side}ToeBase`], 4));
    addAll(l.leather, mats.leather, W.capsule([`${side}Foot`, `${side}ToeBase`, `${side}Leg`], 4, { [`${side}Leg`]: 0.4 }));
  }

  const hm = helmet();
  addAll(hm.steel, mats.steel, W.rigid('Head'));
  addAll(hm.gold, mats.gold, W.rigid('Head'));
  addAll(hm.visor, mats.visor, W.rigid('Head'));
  addAll(hm.eyes, mats.eyes, W.rigid('Head'));
  add(hm.plume, mats.tabard, head); // material dos dois lados: a pluma é fina e aparece de qualquer ângulo

  // pesos e junção: uma malha, um grupo (e uma chamada de desenho) por material
  const matList = [];
  const geos = parts.map(({ geo, mat, weights }) => {
    setWeights(geo, weights);
    let mi = matList.indexOf(mat);
    if (mi < 0) { matList.push(mat); mi = matList.length - 1; }
    geo.userData = { mi };
    return geo;
  });
  const merged = mergeGeometries(matList.map((_, i) => mergeGeometries(geos.filter(g => g.userData.mi === i), false)), true);
  merged.computeBoundingSphere();
  const mesh = new THREE.SkinnedMesh(merged, matList);
  mesh.name = 'GuerreiroCorpo';
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;

  const root = new THREE.Group();
  root.name = 'Guerreiro';
  root.add(byName.Hips);
  root.add(mesh);
  root.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(bones);
  mesh.bind(skeleton);

  const pose = warriorIdlePose();
  applyPose(byName, pose);
  root.updateMatrixWorld(true);

  // espada na mão direita: o punho passa pelo centro da pegada, a lâmina para a frente e para baixo
  const sword = buildSword(mats);
  const rh = byName.RightHand, gripLocal = V(-0.012, -0.075, 0.02); // pegada, perto da palma
  const grip = rh.localToWorld(gripLocal.clone());
  sword.group.position.copy(grip);
  sword.group.quaternion.setFromUnitVectors(V(0, 1, 0), V(-0.18, -0.42, 0.89).normalize());
  sword.group.rotateY(Math.PI / 2); // o fio da lâmina de lado, a parte chata para fora
  root.add(sword.group);
  root.updateMatrixWorld(true);
  rh.attach(sword.group);

  // escudo no antebraço esquerdo, de frente para fora e um pouco para a frente
  const shield = buildShield(mats);
  const lf = byName.LeftForeArm, mid = lf.localToWorld(spec.LeftForeArm.tail.clone().sub(spec.LeftForeArm.head).multiplyScalar(0.55));
  shield.group.position.copy(mid).add(V(0.13, -0.02, 0.1)); // por fora do braço: a mão fica atrás do escudo
  shield.group.lookAt(shield.group.position.clone().add(V(0.6, 0, 0.8)));
  shield.group.rotateZ(0.12);
  root.add(shield.group);
  root.updateMatrixWorld(true);
  lf.attach(shield.group);

  return { root, mesh, skeleton, bones: byName, spec, materials: mats, sword, shield, idle: pose };
}
