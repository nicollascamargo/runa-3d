// Efeitos de raio: relâmpagos ramificados (fitas de luz viradas para a câmera, que mudam de forma várias
// vezes por segundo), faíscas, descargas no cajado durante a carga, luz azul e violeta e um clarão curto na tela.
// Os relâmpagos vêm de uma reserva fixa de fitas: nenhum objeto novo por lançamento.
import * as THREE from 'three';

const SEGS = 26;          // segmentos do traço principal
const BRANCH_SEGS = 8;    // segmentos de cada ramo
const MAX_BRANCHES = 3;
const POINTS = SEGS + 1 + MAX_BRANCHES * (BRANCH_SEGS + 1);
export const MAX_BOLTS = 16; // teto da reserva: cheia, o relâmpago mais velho é reaproveitado

export class LightningFx {
  constructor(sfx) {
    this.sfx = sfx;
    this.bolts = [];
    this.tmp = { a: new THREE.Vector3(), b: new THREE.Vector3(), t: new THREE.Vector3(), v: new THREE.Vector3(), s: new THREE.Vector3() };
    // clarão de tela: uma camada branca que pisca e some
    this.flashEl = document.createElement('div');
    this.flashEl.className = 'screen-flash';
    this.flashEl.addEventListener('animationend', () => this.flashEl.classList.remove('on')); // some da composição
    document.body.appendChild(this.flashEl);
  }

  // fita: 2 vértices por ponto, montada a cada quadro de frente para a câmera
  makeRibbon(widthK, color) {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(POINTS * 2 * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    // triângulos só dentro de cada trecho (o traço principal e cada ramo), nunca ligando um trecho ao outro
    const idx = [];
    const strip = (start, count) => { for (let i = start; i < start + count - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } };
    strip(0, SEGS + 1);
    for (let r = 0; r < MAX_BRANCHES; r++) strip(SEGS + 1 + r * (BRANCH_SEGS + 1), BRANCH_SEGS + 1);
    geo.setIndex(idx);
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e4);
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(...color), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = 7;
    this.sfx.group.add(mesh);
    return { mesh, widthK };
  }

  // Um relâmpago de 'from' até 'to'. duration: quanto dura; width: grossura; flicker: vezes que muda de forma por segundo.
  // from/to podem ser funções (o cajado se mexe durante a carga).
  bolt(from, to, { duration = 0.35, width = 0.07, color = [1.6, 1.7, 3.6], glow = [0.5, 0.35, 1.4], branches = 2, jitter = 0.32, flicker = 22 } = {}) {
    let b = this.bolts.find(o => !o.busy);
    if (!b && this.bolts.length >= MAX_BOLTS) b = this.bolts.reduce((x, y) => (x.t / x.duration > y.t / y.duration ? x : y));
    if (!b) {
      b = { glow: this.makeRibbon(3, glow), core: this.makeRibbon(0.6, color), pts: [], runs: [] };
      for (let i = 0; i < POINTS; i++) b.pts.push(new THREE.Vector3());
      this.bolts.push(b);
    }
    Object.assign(b, { busy: true, t: 0, duration, width, branches, jitter, flicker, from, to, regen: 0 });
    b.core.mesh.material.color.setRGB(...color);
    b.glow.mesh.material.color.setRGB(...glow);
    b.core.mesh.visible = b.glow.mesh.visible = true;
    this.shape(b);
    return b;
  }

  // Desenha um caminho em zigue-zague (deslocamento do ponto médio) e alguns ramos.
  shape(b) {
    const A = typeof b.from === 'function' ? b.from() : b.from, B = typeof b.to === 'function' ? b.to() : b.to;
    const len = A.distanceTo(B), J = b.jitter * Math.min(1.2, len * 0.35);
    const { t: dir, v, s } = this.tmp;
    dir.subVectors(B, A).normalize();
    v.set(0, 1, 0); if (Math.abs(dir.y) > 0.9) v.set(1, 0, 0);
    s.crossVectors(dir, v).normalize(); v.crossVectors(s, dir).normalize();
    const offs = new Float32Array((SEGS + 1) * 2);
    // ruído de várias escalas, preso nas pontas
    for (let o = 1, amp = 1; o <= 8; o *= 2, amp *= 0.5) {
      const ph1 = Math.random() * 6.28, ph2 = Math.random() * 6.28;
      for (let i = 0; i <= SEGS; i++) {
        const u = i / SEGS;
        offs[i * 2] += Math.sin(u * Math.PI * o + ph1) * amp * (Math.random() * 0.6 + 0.7);
        offs[i * 2 + 1] += Math.sin(u * Math.PI * o * 1.3 + ph2) * amp * (Math.random() * 0.6 + 0.7);
      }
    }
    b.runs = [[0, SEGS + 1, true]];
    for (let i = 0; i <= SEGS; i++) {
      const u = i / SEGS, env = Math.sin(Math.PI * u);
      b.pts[i].lerpVectors(A, B, u).addScaledVector(s, offs[i * 2] * J * env * 0.5).addScaledVector(v, offs[i * 2 + 1] * J * env * 0.5);
    }
    let k = SEGS + 1;
    for (let r = 0; r < MAX_BRANCHES; r++) {
      if (r >= b.branches) { for (let i = 0; i <= BRANCH_SEGS; i++) b.pts[k + i].copy(B); b.runs.push([k, BRANCH_SEGS + 1, false]); k += BRANCH_SEGS + 1; continue; }
      const start = 3 + Math.floor(Math.random() * (SEGS - 8)), P = b.pts[start];
      const bl = len * (0.15 + Math.random() * 0.2);
      const bd = dir.clone().addScaledVector(s, (Math.random() - 0.5) * 1.6).addScaledVector(v, (Math.random() - 0.3) * 1.2).normalize();
      for (let i = 0; i <= BRANCH_SEGS; i++) {
        const u = i / BRANCH_SEGS;
        b.pts[k + i].copy(P).addScaledVector(bd, u * bl).addScaledVector(s, (Math.random() - 0.5) * 0.08 * u).addScaledVector(v, (Math.random() - 0.5) * 0.08 * u);
      }
      b.runs.push([k, BRANCH_SEGS + 1, true]);
      k += BRANCH_SEGS + 1;
    }
  }

  // Monta as fitas de frente para a câmera.
  build(b, rib, fade) {
    const cam = this.sfx.engine.camera.position, arr = rib.mesh.geometry.attributes.position.array;
    const { t: tan, v: view, s: side } = this.tmp;
    for (const [start, count, active] of b.runs) {
      for (let j = 0; j < count; j++) {
        const i = start + j, p = b.pts[i], n = i * 6;
        const next = b.pts[Math.min(start + count - 1, i + 1)], prev = b.pts[Math.max(start, i - 1)];
        tan.subVectors(next, prev); if (tan.lengthSq() < 1e-8) tan.set(0, 1, 0);
        view.subVectors(cam, p);
        side.crossVectors(tan, view).normalize();
        const taper = start > SEGS ? 1 - j / count : 1; // ramos afinam
        const w = active ? b.width * rib.widthK * fade * (0.5 + 0.5 * taper) : 0; // ramo desligado: largura zero
        arr[n] = p.x + side.x * w; arr[n + 1] = p.y + side.y * w; arr[n + 2] = p.z + side.z * w;
        arr[n + 3] = p.x - side.x * w; arr[n + 4] = p.y - side.y * w; arr[n + 5] = p.z - side.z * w;
      }
    }
    rib.mesh.geometry.attributes.position.needsUpdate = true;
  }

  // ---------- extras ----------
  sparks(pos, { count = 40, color = [2.2, 2.4, 4], speed = 4 } = {}) {
    for (let i = 0; i < this.sfx.count(count); i++) {
      const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, k = Math.sqrt(1 - u * u), sp = speed * (0.3 + Math.random() * 0.7);
      this.sfx.fx.spawn({ p: [pos.x, pos.y, pos.z], v: [k * Math.cos(a) * sp, u * sp + 1, k * Math.sin(a) * sp],
        life: 0.18 + Math.random() * 0.3, size: 0.03 + Math.random() * 0.03, color, color2: [0.5, 0.3, 1.6], drag: 3, gravity: -5 });
    }
  }

  // Clarão no impacto: luz forte e um piscar curto na tela (fraco, para não incomodar).
  flash(pos, strength = 1) {
    this.sfx.lights.acquire({ color: '#9a8cff', intensity: 45 * strength, distance: 9, duration: 0.3, position: new THREE.Vector3(pos.x, pos.y + 0.4, pos.z) });
    const el = this.flashEl;
    el.style.setProperty('--k', (0.22 * strength).toFixed(2));
    el.classList.remove('on'); void el.offsetWidth; el.classList.add('on');
  }

  // Descargas pequenas saindo de um ponto (o cristal do cajado, as mãos) durante a carga.
  crackle(center, dt, amount = 1, acc = { v: 0 }) {
    acc.v += dt * 9 * amount;
    while (acc.v >= 1) {
      acc.v -= 1;
      const p = typeof center === 'function' ? center() : center;
      const d = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.3, Math.random() - 0.5).normalize().multiplyScalar(0.25 + Math.random() * 0.3);
      this.bolt(p.clone(), p.clone().add(d), { duration: 0.09, width: 0.015, branches: 0, jitter: 0.5, flicker: 40 });
      this.sparks(p, { count: 4, speed: 1.5 });
    }
    return acc;
  }

  update(dt) {
    for (const b of this.bolts) {
      if (!b.busy) continue;
      b.t += dt;
      b.regen += dt;
      if (b.regen > 1 / b.flicker) { b.regen = 0; this.shape(b); }
      const u = b.t / b.duration;
      const fade = u < 0.15 ? 1 : Math.max(0, 1 - (u - 0.15) / 0.85) * (0.75 + 0.25 * Math.random()); // pisca enquanto some
      this.build(b, b.glow, fade);
      this.build(b, b.core, fade);
      if (u >= 1) { b.busy = false; b.core.mesh.visible = b.glow.mesh.visible = false; }
    }
  }
}
