// Efeitos visuais das magias. Tudo é criado uma vez e reaproveitado: as luzes vêm de uma reserva fixa,
// as esferas e as marcas no chão também. Nada é criado nem destruído a cada lançamento, então a memória
// não cresce com o tempo de jogo.
//
// Fogo aqui (esfera flamejante, explosão, marca de queimadura, chamas em quem está queimando); gelo, raio,
// terra e a parede de chamas nos módulos IceFx, LightningFx, EarthFx e FireWallFx, que usam as mesmas reservas.
import * as THREE from 'three';
import { softDotTexture } from './textures.js';
import { GFX } from '../core/Settings.js';
import { IceFx } from './IceFx.js';
import { LightningFx } from './LightningFx.js';
import { EarthFx } from './EarthFx.js';
import { FireWallFx } from './FireWallFx.js';
import { NOISE } from './glsl.js';

// Esfera de fogo: a superfície ondula com ruído subindo, o centro é quase branco e a borda vermelha.
const FIRE_VERT = /* glsl */`
  uniform float uTime; uniform float uWobble;
  varying vec3 vN; varying vec3 vView; varying float vNoise;
  ${NOISE}
  void main() {
    float n = fbm(normal * 2.2 + vec3(0.0, -uTime * 3.2, uTime * 0.7));
    vNoise = n;
    vec3 p = position * (1.0 + uWobble * (n - 0.45) * 0.55);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vView = -mv.xyz;
    vN = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * mv;
  }
`;
const FIRE_FRAG = /* glsl */`
  uniform float uOpacity; uniform float uHeat;
  varying vec3 vN; varying vec3 vView; varying float vNoise;
  void main() {
    float facing = abs(dot(normalize(vN), normalize(vView)));
    float heat = clamp(facing * 1.15 - 0.15 + (vNoise - 0.5) * 0.9, 0.0, 1.0) * uHeat;
    vec3 red = vec3(1.0, 0.1, 0.02), orange = vec3(2.2, 0.75, 0.12), white = vec3(2.8, 1.9, 0.8);
    vec3 col = mix(red, orange, smoothstep(0.1, 0.5, heat));
    col = mix(col, white, smoothstep(0.82, 1.0, heat));
    float a = uOpacity * clamp(0.25 + facing * 0.9, 0.0, 1.0);
    gl_FragColor = vec4(col * a, a);
  }
`;

// Marca de queimadura: carvão no meio, borda irregular, e uma camada de brasas que se apaga antes.
function scorchTextures(size = 256) {
  const mk = () => { const c = document.createElement('canvas'); c.width = c.height = size; return c; };
  const char = mk(), glow = mk();
  const cx = char.getContext('2d'), gx = glow.getContext('2d');
  const h = size / 2;
  for (let i = 0; i < 26; i++) { // manchas sobrepostas: borda irregular
    const a = Math.random() * Math.PI * 2, r = Math.random() * h * 0.45, rr = h * (0.25 + Math.random() * 0.35);
    const x = h + Math.cos(a) * r, y = h + Math.sin(a) * r;
    const g = cx.createRadialGradient(x, y, 0, x, y, rr);
    g.addColorStop(0, 'rgba(8,5,4,0.55)'); g.addColorStop(0.6, 'rgba(14,9,6,0.3)'); g.addColorStop(1, 'rgba(20,12,8,0)');
    cx.fillStyle = g; cx.fillRect(0, 0, size, size);
  }
  for (let i = 0; i < 70; i++) { // brasas
    const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * h * 0.7, x = h + Math.cos(a) * r, y = h + Math.sin(a) * r, rr = 2 + Math.random() * 6;
    const g = gx.createRadialGradient(x, y, 0, x, y, rr);
    g.addColorStop(0, 'rgba(255,170,60,1)'); g.addColorStop(1, 'rgba(255,60,10,0)');
    gx.fillStyle = g; gx.fillRect(x - rr, y - rr, rr * 2, rr * 2);
  }
  const t = c => { const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace; return tx; };
  return { char: t(char), glow: t(glow) };
}

// Reserva fixa de luzes pontuais. Pedir uma luz nunca cria outra: se todas estão ocupadas, reaproveita a mais antiga.
// Cada pedido ganha um número (gen): quem guardou a luz só mexe nela enquanto o número for o mesmo
// (se a luz foi reaproveitada por outro efeito, o dono antigo larga sem apagar a do novo).
export class LightPool {
  constructor(scene, count) {
    this.items = Array.from({ length: count }, () => {
      const light = new THREE.PointLight(0xffffff, 0, 6, 2);
      light.castShadow = false;
      scene.add(light);
      return { light, busy: false, t: 0, dur: 0, peak: 0, follow: null, since: 0, gen: 0 };
    });
    this.clock = 0;
  }

  // follow: objeto 3D ou função que devolve a posição. duration: some sozinha (Infinity = até release()).
  acquire({ color = '#ffffff', intensity = 5, distance = 6, duration = Infinity, follow = null, position = null }) {
    if (!this.items.length) return null;
    let it = this.items.find(i => !i.busy);
    if (!it) it = this.items.reduce((a, b) => (a.since < b.since ? a : b));
    Object.assign(it, { busy: true, t: 0, dur: duration, peak: intensity, follow, since: this.clock, gen: it.gen + 1 });
    it.mine = it.gen;
    it.light.color.set(color);
    it.light.distance = distance;
    it.light.intensity = intensity;
    if (position) it.light.position.copy(position);
    return it;
  }

  // gen: o número do pedido; se a luz já é de outro efeito, não faz nada
  release(it, gen = it && it.gen) { if (it && it.gen === gen) { it.busy = false; it.follow = null; it.light.intensity = 0; } }
  owns(it, gen) { return !!it && it.busy && it.gen === gen; }

  update(dt) {
    this.clock += dt;
    for (const it of this.items) {
      if (!it.busy) continue;
      it.t += dt;
      if (it.follow) { if (typeof it.follow === 'function') it.light.position.copy(it.follow()); else it.follow.getWorldPosition(it.light.position); }
      if (Number.isFinite(it.dur)) {
        const u = Math.min(1, it.t / it.dur);
        it.light.intensity = it.peak * (1 - u) ** 2;
        if (u >= 1) this.release(it);
      }
    }
  }

  get busyCount() { return this.items.filter(i => i.busy).length; }
}

export class SpellFx {
  constructor(engine, fx) {
    this.engine = engine;
    this.fx = fx;                 // partículas (src/fx/MagicFx.js)
    this.group = new THREE.Group();
    this.group.name = 'EfeitosDasMagias';
    engine.scene.add(this.group);
    this.lights = new LightPool(engine.scene, GFX.bootLights);

    this.fireMat = () => new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uWobble: { value: 1 }, uOpacity: { value: 1 }, uHeat: { value: 1 } },
      vertexShader: FIRE_VERT, fragmentShader: FIRE_FRAG,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
      transparent: true, depthWrite: false, toneMapped: false,
    });
    this.sphereGeo = new THREE.IcosahedronGeometry(1, 4);
    this.haloTex = softDotTexture(128);
    this.orbs = [];
    this.bursts = [];   // esferas de explosão (crescem e somem)
    this.decals = [];
    this.scorchTex = scorchTextures();
    this.decalGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    this.time = 0;
    this.ice = new IceFx(this);
    this.lightning = new LightningFx(this);
    this.earth = new EarthFx(this);
    this.fireWall = new FireWallFx(this);
  }

  // Pré-compilação: cada material dos efeitos é compilado na primeira vez que aparece, e compilar um shader
  // trava a tela por 0,2 a 0,8 s. Aqui, durante a tela de carregamento, uma peça de cada efeito aparece
  // escondida embaixo do chão, a cena é compilada e desenhada uma vez, e tudo volta para as reservas.
  // extra: objetos de fora (camadas de gelo dos bonecos, marcadores de alvo) que também precisam compilar.
  async prewarm(extra = []) {
    const far = new THREE.Vector3(0, -60, 0), r = this.engine.renderer;
    const orb = this.takeOrb(); orb.size = 0.1; this.updateOrb(orb, 0); orb.group.position.copy(far);
    this.explodeFire(far, { radius: 0.5 });
    this.engine.shakeState.amp = 0;
    const ring = this.ice.takeRing(1); this.ice.updateRing(ring, far, 0.016); ring.grow = 1;
    const spear = this.ice.takeSpear(); spear.position.copy(far); spear.scale.set(1, 1, 1);
    this.ice.impact(far);
    const prison = this.ice.makePrison(far);
    const bolt = this.lightning.bolt(far.clone(), far.clone().add(new THREE.Vector3(1, 0, 0)), { duration: 0.05 });
    this.lightning.build(bolt, bolt.glow, 1); this.lightning.build(bolt, bolt.core, 1);
    const fakeWall = { hp: 1, maxHp: 1 }, fakeFire = { group: 'aquecimento' };
    const wall = this.earth.raiseWall(fakeWall, 0, 0, false); wall.mesh.position.copy(far);
    this.earth.chunksBurst(far, 1); this.earth.crack(0, 0, 0.01); for (const c of this.earth.cracks) { c.dark.position.y = c.glow.position.y = -60; }
    const flame = this.fireWall.ignite(fakeFire, 0, 0); flame.group.position.copy(far); flame.group.scale.set(1, 1, 1);
    const shown = extra.map(o => [o, o.visible]);
    for (const [o] of shown) o.visible = true;
    // o desenho de verdade pula o que está fora da câmera: aqui tudo é desenhado (escondido embaixo do chão),
    // para compilar a mesma versão de shader que o jogo usa (com o pós-processamento e as sombras)
    const culled = [];
    const uncull = root => root.traverse(o => { if (o.isMesh || o.isPoints || o.isSprite) { culled.push([o, o.frustumCulled]); o.frustumCulled = false; } });
    uncull(this.group); for (const o of extra) uncull(o);
    try {
      if (r.compileAsync) await r.compileAsync(this.engine.scene, this.engine.camera);
      this.engine.composer.render(); // desenha uma vez: compila também sombras e pós-processamento
    } finally {
      for (const [o, f] of culled) o.frustumCulled = f;
      for (const [o, v] of shown) o.visible = v;
      this.freeOrb(orb); this.ice.freeRing(ring); this.ice.freeSpear(spear);
      prison.busy = false; prison.group.visible = false;
      bolt.busy = false; bolt.core.mesh.visible = bolt.glow.mesh.visible = false;
      this.earth.walls.delete(fakeWall); wall.busy = false; wall.mesh.visible = false; wall.hud.visible = false; wall.hud.element.style.display = 'none';
      this.fireWall.extinguish(fakeFire); flame.out = 1; this.fireWall.update(0);
      for (const b of this.bursts) b.mesh.visible = false;
      for (const d of this.decals) { d.char.visible = false; d.glow.visible = false; }
      for (const c of this.earth.cracks) { c.dark.visible = false; c.glow.visible = false; }
      for (const c of this.earth.chunks) c.mesh.visible = false;
      for (const s of this.ice.shards) s.mesh.visible = false;
      for (const x of this.fx.rings) x.mesh.visible = false;
      this.fx.life.fill(0);
      for (const it of this.lights.items) this.lights.release(it);
    }
  }

  get density() { return GFX.particles; }
  count(n) { return Math.max(1, Math.round(n * this.density)); }

  // ---------- esfera de fogo ----------
  // Devolve uma esfera (reaproveitada). Mexa em orb.group.position e orb.size; chame freeOrb(orb) no fim.
  takeOrb() {
    let orb = this.orbs.find(o => !o.busy);
    if (!orb) {
      const core = new THREE.Mesh(this.sphereGeo, this.fireMat());
      core.renderOrder = 6;
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.haloTex, color: new THREE.Color(2.2, 0.75, 0.2), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false }));
      halo.renderOrder = 6;
      const group = new THREE.Group();
      group.add(core, halo);
      this.group.add(group);
      orb = { group, core, halo, busy: false };
      this.orbs.push(orb);
    }
    Object.assign(orb, { busy: true, size: 0, emitAcc: 0, light: null });
    orb.group.visible = true;
    orb.core.material.uniforms.uOpacity.value = 1;
    orb.light = this.lights.acquire({ color: '#ff8a3a', intensity: 0, distance: 5, follow: orb.group });
    orb.lightGen = orb.light && orb.light.gen;
    return orb;
  }

  freeOrb(orb) {
    if (!orb || !orb.busy) return;
    orb.busy = false;
    orb.group.visible = false;
    this.lights.release(orb.light, orb.lightGen);
    orb.light = null;
  }

  updateOrb(orb, dt, { trail = 0 } = {}) {
    const s = orb.size;
    orb.core.scale.setScalar(Math.max(0.001, s));
    orb.halo.scale.setScalar(Math.max(0.001, s * 3.4));
    orb.core.material.uniforms.uTime.value = this.time;
    if (this.lights.owns(orb.light, orb.lightGen)) orb.light.light.intensity = 6 * Math.min(1, s / 0.16) * (0.9 + 0.1 * Math.sin(this.time * 31));
    // chamas subindo e faíscas soltas; em voo, um rastro
    orb.emitAcc += dt * (40 + trail * 160) * this.density * Math.min(1, s / 0.1);
    const p = orb.group.position;
    while (orb.emitAcc >= 1) {
      orb.emitAcc -= 1;
      const a = Math.random() * Math.PI * 2, r = s * (0.4 + Math.random() * 0.6);
      const hot = Math.random() < 0.7;
      this.fx.spawn({
        p: [p.x + Math.cos(a) * r, p.y + (Math.random() - 0.5) * s, p.z + Math.sin(a) * r],
        v: [(Math.random() - 0.5) * 0.4, 0.5 + Math.random() * 0.9, (Math.random() - 0.5) * 0.4],
        life: 0.25 + Math.random() * 0.35, size: (hot ? 0.09 : 0.05) * (0.6 + s * 4),
        color: hot ? [2.6, 1.3, 0.35] : [2.8, 2.0, 0.8], color2: [0.7, 0.08, 0.02], drag: 1.2, gravity: 0.6,
      });
    }
  }

  // ---------- explosão ----------
  explodeFire(pos, { radius = 1.5 } = {}) {
    const fx = this.fx, n = k => this.count(k);
    for (let i = 0; i < n(110); i++) { // bola de fogo que se expande
      const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, k = Math.sqrt(1 - u * u), sp = 1.2 + Math.random() * 3.2;
      fx.spawn({ p: [pos.x, pos.y, pos.z], v: [k * Math.cos(a) * sp, Math.abs(u) * sp * 0.8 + 0.6, k * Math.sin(a) * sp],
        life: 0.45 + Math.random() * 0.5, size: 0.16 + Math.random() * 0.2, color: [2.8, 1.5, 0.45], color2: [0.55, 0.06, 0.02], drag: 3.2, gravity: 1.2 });
    }
    for (let i = 0; i < n(70); i++) { // faíscas rápidas que caem
      const u = Math.random(), a = Math.random() * Math.PI * 2, sp = 3 + Math.random() * 4;
      fx.spawn({ p: [pos.x, pos.y, pos.z], v: [Math.cos(a) * sp * (1 - u * 0.5), 1.5 + u * 3.5, Math.sin(a) * sp * (1 - u * 0.5)],
        life: 0.5 + Math.random() * 0.6, size: 0.035 + Math.random() * 0.03, color: [3.0, 2.2, 0.9], color2: [1.4, 0.3, 0.05], drag: 1.4, gravity: -6 });
    }
    for (let i = 0; i < n(26); i++) { // fumaça escura subindo devagar
      const a = Math.random() * Math.PI * 2, r = Math.random() * 0.6;
      fx.spawn({ p: [pos.x + Math.cos(a) * r, pos.y + 0.1, pos.z + Math.sin(a) * r], v: [Math.cos(a) * 0.3, 0.6 + Math.random() * 0.6, Math.sin(a) * 0.3],
        life: 1.4 + Math.random() * 0.8, size: 0.45 + Math.random() * 0.35, color: [0.22, 0.12, 0.07], color2: [0.03, 0.03, 0.04], drag: 1.2, gravity: 0.25 });
    }
    // chamas rasteiras pela área atingida
    for (let i = 0; i < n(60); i++) {
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * radius;
      fx.spawn({ p: [pos.x + Math.cos(a) * r, 0.06, pos.z + Math.sin(a) * r], v: [Math.cos(a) * 0.4, 0.6 + Math.random() * 1.2, Math.sin(a) * 0.4],
        life: 0.35 + Math.random() * 0.45, size: 0.12 + Math.random() * 0.12, color: [2.6, 1.1, 0.25], color2: [0.6, 0.05, 0.02], drag: 2, gravity: 0.8 });
    }
    fx.shockwave(pos.x, pos.z, { color: [2.6, 0.9, 0.2], radius: radius * 1.15, duration: 0.5 });
    fx.shockwave(pos.x, pos.z, { color: [3.0, 2.0, 0.8], radius: radius * 0.6, duration: 0.3, y: 0.03 });
    // a esfera da explosão: cresce rápido e se apaga
    let b = this.bursts.find(o => !o.mesh.visible);
    if (!b) { b = { mesh: new THREE.Mesh(this.sphereGeo, this.fireMat()) }; b.mesh.renderOrder = 6; this.group.add(b.mesh); this.bursts.push(b); }
    Object.assign(b, { t: 0, dur: 0.42, r: radius * 0.75 });
    b.mesh.position.copy(pos);
    b.mesh.visible = true;
    this.lights.acquire({ color: '#ff7a2a', intensity: 40, distance: 9, duration: 0.7, position: new THREE.Vector3(pos.x, pos.y + 0.4, pos.z) });
    this.engine.shake(0.045, 0.4);
    this.scorch(pos.x, pos.z, radius * 1.6);
  }

  // ---------- marca no chão ----------
  scorch(x, z, size = 2.4, { life = 18 } = {}) {
    let d = this.decals.find(o => !o.char.visible);
    if (!d) {
      if (this.decals.length >= 8) d = this.decals.reduce((a, b) => (a.t > b.t ? a : b)); // reaproveita a mais velha
      else {
        const char = new THREE.Mesh(this.decalGeo, new THREE.MeshBasicMaterial({ map: this.scorchTex.char, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
        const glow = new THREE.Mesh(this.decalGeo, new THREE.MeshBasicMaterial({ map: this.scorchTex.glow, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, color: new THREE.Color(2, 0.8, 0.3) }));
        char.renderOrder = 2; glow.renderOrder = 3;
        this.group.add(char, glow);
        d = { char, glow };
        this.decals.push(d);
      }
    }
    Object.assign(d, { t: 0, life });
    for (const m of [d.char, d.glow]) { m.position.set(x, 0.014, z); m.scale.setScalar(size); m.rotation.y = Math.random() * Math.PI * 2; m.visible = true; }
  }

  // ---------- quem está queimando ----------
  // Chamas saindo do corpo. Chame a cada quadro enquanto a queimadura durar.
  burnEmit(center, dt, height = 1.3, acc = { v: 0 }) {
    acc.v += dt * 52 * this.density;
    while (acc.v >= 1) {
      acc.v -= 1;
      const a = Math.random() * Math.PI * 2, r = 0.12 + Math.random() * 0.1, y = 0.35 + Math.random() * height;
      const spark = Math.random() < 0.2;
      this.fx.spawn({ p: [center.x + Math.cos(a) * r, y, center.z + Math.sin(a) * r], v: [Math.cos(a) * 0.18, 0.7 + Math.random() * (spark ? 1.6 : 0.7), Math.sin(a) * 0.18],
        life: spark ? 0.6 + Math.random() * 0.4 : 0.32 + Math.random() * 0.3, size: spark ? 0.035 : 0.11 + Math.random() * 0.1,
        color: spark ? [3, 2, 0.8] : [2.4, 0.95, 0.22], color2: [0.45, 0.04, 0.02], drag: 1.6, gravity: spark ? -0.5 : 0.9 });
    }
    return acc;
  }

  update(dt) {
    this.time += dt;
    this.lights.update(dt);
    this.ice.update(dt);
    this.lightning.update(dt);
    this.earth.update(dt);
    this.fireWall.update(dt);
    for (const b of this.bursts) {
      if (!b.mesh.visible) continue;
      b.t += dt;
      const u = Math.min(1, b.t / b.dur);
      b.mesh.scale.setScalar(0.2 + b.r * (1 - (1 - u) ** 3));
      const m = b.mesh.material.uniforms;
      m.uTime.value = this.time; m.uOpacity.value = (1 - u) ** 1.6; m.uHeat.value = 1 - u * 0.5;
      if (u >= 1) b.mesh.visible = false;
    }
    for (const d of this.decals) {
      if (!d.char.visible) continue;
      d.t += dt;
      d.char.material.opacity = Math.min(1, (d.life - d.t) / 4);
      d.glow.material.opacity = Math.max(0, 1 - d.t / 3.5) * (0.75 + 0.25 * Math.sin(this.time * 9 + d.t));
      if (d.t >= d.life) { d.char.visible = false; d.glow.visible = false; }
    }
  }
}
