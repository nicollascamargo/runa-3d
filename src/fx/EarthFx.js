// Efeitos de terra: a muralha de pedra (brota do chão, treme e escurece ao apanhar, desmorona quando a vida
// acaba, afunda quando o tempo acaba), fragmentos de rocha, poeira, rachaduras no chão e a onda sísmica.
// Blocos, fragmentos e rachaduras vêm de reservas fixas.
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { rockTextures } from './textures.js';
import { rng } from './random.js';

const DUST = [0.3, 0.24, 0.17], GOLD = [2.4, 1.6, 0.5];

function rockGeometry(seed) {
  const g = new THREE.BoxGeometry(0.92, 1.15, 0.42, 6, 8, 3);
  const p = g.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = Math.sin(v.x * 9.1 + seed) * Math.cos(v.y * 7.3 + seed * 2) * 0.5 + Math.sin(v.z * 13 + v.y * 5 + seed * 3) * 0.5;
    const top = v.y > 0.5 ? 1 - (v.y - 0.5) * 1.2 : 1; // o alto mais estreito e irregular
    v.x = v.x * top + n * 0.04; v.z = v.z * (0.85 + 0.15 * top) + n * 0.05; v.y += Math.abs(n) * 0.06 * (v.y > 0 ? 1 : 0);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.translate(0, 0.575, 0);
  g.computeVertexNormals();
  return g;
}

function crackTextures(size = 512) {
  const mk = () => { const c = document.createElement('canvas'); c.width = c.height = size; return c; };
  const dark = mk(), glow = mk(), dx = dark.getContext('2d'), gx = glow.getContext('2d');
  const h = size / 2;
  // cada rachadura sai de um sorteio com semente: a camada escura e a camada acesa seguem o mesmo traço
  const crack = (ctx, rnd, x, y, a, len, w, depth) => {
    ctx.lineWidth = w;
    ctx.beginPath(); ctx.moveTo(x, y);
    let cx = x, cy = y;
    for (let i = 0; i < 8; i++) {
      a += (rnd() - 0.5) * 0.7;
      cx += Math.cos(a) * len / 8; cy += Math.sin(a) * len / 8;
      ctx.lineTo(cx, cy);
      if (depth > 0 && rnd() < 0.25) { ctx.stroke(); crack(ctx, rnd, cx, cy, a + (rnd() - 0.5) * 1.6, len * 0.45, w * 0.6, depth - 1); ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(cx, cy); }
    }
    ctx.stroke();
  };
  dx.strokeStyle = 'rgba(8,6,5,0.85)'; dx.lineCap = 'round';
  gx.strokeStyle = 'rgba(255,190,80,1)'; gx.lineCap = 'round';
  const pick = rng(61);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + pick() * 0.4, len = h * (0.55 + pick() * 0.4);
    crack(dx, rng(100 + i), h, h, a, len, 7, 2);
    crack(gx, rng(100 + i), h, h, a, len, 2.5, 2);
  }
  const t = c => { const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace; return tx; };
  return { dark: t(dark), glow: t(glow) };
}

export class EarthFx {
  constructor(sfx) {
    this.sfx = sfx;
    const rock = rockTextures(27);
    this.rockMat = new THREE.MeshStandardMaterial({ map: rock.map, normalMap: rock.normal, color: '#a7a2a0', roughness: 0.95 });
    this.rockGeos = [rockGeometry(1.3), rockGeometry(4.7), rockGeometry(8.2)];
    this.chunkGeo = new THREE.DodecahedronGeometry(0.07, 0);
    this.walls = new Map();  // obstáculo -> bloco
    this.pool = [];
    this.chunks = [];
    this.cracks = [];
    this.crackTex = crackTextures();
    this.decalGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    this.queue = [];         // efeitos atrasados (anéis em sequência)
  }

  // ---------- poeira, fragmentos ----------
  dust(pos, { count = 20, radius = 0.4, up = 0.6, size = 0.45 } = {}) {
    for (let i = 0; i < this.sfx.count(count); i++) {
      const a = Math.random() * Math.PI * 2, r = Math.random() * radius;
      this.sfx.fx.spawn({ p: [pos.x + Math.cos(a) * r, 0.1 + Math.random() * 0.2, pos.z + Math.sin(a) * r], v: [Math.cos(a) * 0.7, up * (0.4 + Math.random()), Math.sin(a) * 0.7],
        life: 1 + Math.random() * 0.9, size: size * (0.6 + Math.random() * 0.8), color: DUST, color2: [0.04, 0.035, 0.03], drag: 1.6 });
    }
  }

  debris(pos, { count = 30, speed = 3 } = {}) {
    for (let i = 0; i < this.sfx.count(count); i++) {
      const a = Math.random() * Math.PI * 2, sp = speed * (0.3 + Math.random() * 0.7);
      this.sfx.fx.spawn({ p: [pos.x, pos.y ?? 0.2, pos.z], v: [Math.cos(a) * sp, 1.5 + Math.random() * 3, Math.sin(a) * sp],
        life: 0.8 + Math.random() * 0.6, size: 0.04 + Math.random() * 0.04, color: [0.5, 0.42, 0.32], color2: [0.15, 0.12, 0.1], drag: 0.8, gravity: -9 });
    }
  }

  chunksBurst(pos, n = 8, speed = 3) {
    for (let i = 0; i < n; i++) {
      let c = this.chunks.find(o => !o.mesh.visible);
      if (!c) {
        if (this.chunks.length >= 28) break;
        c = { mesh: new THREE.Mesh(this.chunkGeo, this.rockMat) };
        c.mesh.castShadow = true;
        this.sfx.group.add(c.mesh);
        this.chunks.push(c);
      }
      const a = Math.random() * Math.PI * 2, sp = speed * (0.3 + Math.random() * 0.7);
      Object.assign(c, { v: new THREE.Vector3(Math.cos(a) * sp, 2 + Math.random() * 3, Math.sin(a) * sp), spin: Math.random() * 12, t: 0, life: 1.2 + Math.random() * 0.6 });
      c.mesh.position.set(pos.x + (Math.random() - 0.5) * 0.3, (pos.y ?? 0.2), pos.z + (Math.random() - 0.5) * 0.3);
      c.mesh.scale.setScalar(0.6 + Math.random() * 1.2);
      c.mesh.visible = true;
    }
  }

  // ---------- golpe do cajado e terremoto ----------
  strike(pos, k = 1) {
    this.sfx.fx.shockwave(pos.x, pos.z, { color: GOLD, radius: 1.0 * k, duration: 0.45 });
    this.dust(pos, { count: 14 * k, radius: 0.3 });
    this.chunksBurst(pos, Math.round(4 * k), 2);
    this.sfx.engine.shake(0.03 * k, 0.3);
  }

  // A frente da onda, a cada quadro, enquanto ela anda do mago até a área.
  waveFront(pos, dt) {
    if (Math.random() < dt * 40) this.dust(pos, { count: 2, radius: 0.35, up: 1, size: 0.35 });
    if (Math.random() < dt * 60) this.debris({ x: pos.x, y: 0.05, z: pos.z }, { count: 2, speed: 1.5 });
    if (Math.random() < dt * 12) this.sfx.fx.shockwave(pos.x, pos.z, { color: [1.6, 1.0, 0.35], radius: 0.6, duration: 0.35 });
  }

  quakeImpact(pos, radius) {
    for (let i = 0; i < 3; i++) this.queue.push({ t: i * 0.14, fn: () => this.sfx.fx.shockwave(pos.x, pos.z, { color: i ? [1.6, 1.1, 0.4] : GOLD, radius: radius * (0.8 + i * 0.25), duration: 0.6 }) });
    this.dust(pos, { count: 50, radius: radius * 0.8, up: 0.9, size: 0.6 });
    this.debris(pos, { count: 70, speed: 4 });
    this.chunksBurst(pos, 14, 4);
    this.crack(pos.x, pos.z, radius * 2.3);
    this.sfx.lights.acquire({ color: '#ffb35a', intensity: 14, distance: 9, duration: 0.6, position: new THREE.Vector3(pos.x, 0.6, pos.z) });
    this.sfx.engine.shake(0.13, 1.1); // tremor de cinema
  }

  crack(x, z, size, life = 6) {
    let d = this.cracks.find(o => !o.dark.visible);
    if (!d && this.cracks.length >= 3) d = this.cracks.reduce((a, b) => (a.t > b.t ? a : b)); // no máximo 3 rachaduras
    if (!d) {
      const dark = new THREE.Mesh(this.decalGeo, new THREE.MeshBasicMaterial({ map: this.crackTex.dark, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
      const glow = new THREE.Mesh(this.decalGeo, new THREE.MeshBasicMaterial({ map: this.crackTex.glow, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, color: new THREE.Color(2.2, 1.3, 0.4) }));
      dark.renderOrder = 2; glow.renderOrder = 3;
      this.sfx.group.add(dark, glow);
      d = { dark, glow };
      this.cracks.push(d);
    }
    Object.assign(d, { t: 0, life });
    for (const m of [d.dark, d.glow]) { m.position.set(x, 0.016, z); m.scale.setScalar(size); m.rotation.y = Math.random() * Math.PI * 2; m.visible = true; }
  }

  // ---------- muralha ----------
  // Um bloco brota na casa do obstáculo. faceX: a muralha fica em pé na direção z (o mago está para o lado de x).
  raiseWall(obstacle, x, z, faceX, delay = 0) {
    let w = this.pool.find(o => !o.busy);
    if (!w) {
      const mat = this.rockMat.clone();
      const mesh = new THREE.Mesh(this.rockGeos[this.pool.length % 3], mat);
      mesh.castShadow = mesh.receiveShadow = true;
      const el = document.createElement('div');
      el.className = 'wall-hud';
      el.innerHTML = '<span class="hpbar"><i></i></span>';
      const hud = new CSS2DObject(el);
      hud.position.set(0, 1.45, 0);
      mesh.add(hud);
      this.sfx.group.add(mesh);
      w = { mesh, mat, hud, bar: el.querySelector('i') };
      this.pool.push(w);
    }
    Object.assign(w, { busy: true, obstacle, t: -delay, state: 'rising', hitT: 0, endT: 0, x, z });
    w.mesh.position.set(x, -1.3, z);
    w.mesh.rotation.set(0, (faceX ? Math.PI / 2 : 0) + (Math.random() - 0.5) * 0.12, 0);
    w.mesh.scale.set(1, 1, 1);
    w.mesh.visible = true;
    w.hud.visible = true;
    w.hud.element.style.display = '';
    w.mat.color.set('#a7a2a0');
    w.bar.style.width = '100%';
    this.walls.set(obstacle, w);
    return w;
  }

  hitWall(obstacle) {
    const w = this.walls.get(obstacle);
    if (!w || w.state === 'breaking') return;
    w.hitT = 0.3;
    const k = obstacle.hp / obstacle.maxHp;
    w.mat.color.setRGB(0.65 * (0.55 + 0.45 * k), 0.63 * (0.55 + 0.45 * k), 0.62 * (0.55 + 0.45 * k)); // racha e escurece
    w.bar.style.width = `${k * 100}%`;
    this.debris({ x: w.x, y: 0.7, z: w.z }, { count: 12, speed: 2 });
    this.chunksBurst({ x: w.x, y: 0.7, z: w.z }, 2, 1.5);
  }

  // reason: 'destruido' (desmorona) ou 'expirou' (afunda de volta no chão)
  endWall(obstacle, reason) {
    const w = this.walls.get(obstacle);
    if (!w) return;
    this.walls.delete(obstacle);
    w.state = reason === 'destruido' ? 'breaking' : 'sinking';
    w.endT = 0;
    w.hud.visible = false;
    w.hud.element.style.display = 'none';
    if (reason === 'destruido') {
      this.chunksBurst({ x: w.x, y: 0.6, z: w.z }, 10, 3);
      this.debris({ x: w.x, y: 0.6, z: w.z }, { count: 40, speed: 3 });
      this.dust({ x: w.x, z: w.z }, { count: 22, radius: 0.5 });
      this.sfx.engine.shake(0.04, 0.35);
    } else this.dust({ x: w.x, z: w.z }, { count: 12, radius: 0.5, up: 0.4 });
  }

  update(dt) {
    for (const q of [...this.queue]) { q.t -= dt; if (q.t <= 0) { this.queue.splice(this.queue.indexOf(q), 1); q.fn(); } }
    for (const c of this.chunks) {
      if (!c.mesh.visible) continue;
      c.t += dt;
      c.v.y -= 9.5 * dt;
      c.mesh.position.addScaledVector(c.v, dt);
      if (c.mesh.position.y < 0.05) { c.mesh.position.y = 0.05; c.v.multiplyScalar(0.45); c.v.y = Math.abs(c.v.y) * 0.35; }
      c.mesh.rotation.x += c.spin * dt; c.mesh.rotation.z += c.spin * 0.7 * dt;
      if (c.t > c.life) c.mesh.scale.multiplyScalar(Math.exp(-8 * dt));
      if (c.t > c.life + 0.5) c.mesh.visible = false;
    }
    for (const d of this.cracks) {
      if (!d.dark.visible) continue;
      d.t += dt;
      d.dark.material.opacity = Math.min(1, (d.life - d.t) / 2) * Math.min(1, d.t * 6);
      d.glow.material.opacity = Math.max(0, 1 - d.t / 1.6) * Math.min(1, d.t * 8);
      if (d.t >= d.life) { d.dark.visible = false; d.glow.visible = false; }
    }
    for (const w of this.pool) {
      if (!w.busy) continue;
      w.t += dt;
      const m = w.mesh;
      if (w.state === 'rising') {
        if (w.t < 0) continue;
        const u = Math.min(1, w.t / 0.45);
        const back = 1 + 2.2 * (u - 1) ** 3 + 1.2 * (u - 1) ** 2; // passa um pouco e assenta
        m.position.y = -1.3 * (1 - back);
        if (u < 1 && Math.random() < dt * 40) this.dust({ x: w.x, z: w.z }, { count: 1, radius: 0.45, up: 1.1, size: 0.35 });
        if (w.t - dt < 0.02 && w.t >= 0) { this.chunksBurst({ x: w.x, y: 0.1, z: w.z }, 3, 2); this.sfx.engine.shake(0.035, 0.4); }
        if (u >= 1) { w.state = 'standing'; m.position.y = 0; }
      }
      if (w.hitT > 0) { // tremida ao levar golpe
        w.hitT = Math.max(0, w.hitT - dt);
        m.position.x = w.x + Math.sin(w.hitT * 90) * 0.03 * w.hitT * 3;
      } else m.position.x = w.x;
      if (w.state === 'breaking') {
        w.endT += dt;
        const u = Math.min(1, w.endT / 0.5);
        m.position.y = -0.9 * u * u;
        m.scale.set(1 - 0.5 * u, 1 - 0.6 * u, 1 - 0.5 * u);
        m.rotation.z = 0.25 * u;
        if (u >= 1) { w.busy = false; m.visible = false; }
      } else if (w.state === 'sinking') {
        w.endT += dt;
        const u = Math.min(1, w.endT / 0.7);
        m.position.y = -1.3 * u * u;
        if (u >= 1) { w.busy = false; m.visible = false; }
      }
    }
  }
}
