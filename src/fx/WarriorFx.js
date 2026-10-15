// Efeitos do guerreiro: o rastro da lâmina (uma fita de luz que segue o fio da espada durante o golpe e some),
// as faíscas de metal onde o golpe acerta, o impacto pesado do Golpe Devastador (onda pequena no chão, poeira,
// fragmentos) e a guarda quebrada (estilhaços), a poeira da Investida, o clarão de aparar e o anel do
// Contra-ataque armado, o brilho que percorre a borda do escudo (Guarda de Ferro) e a Onda de Choque (anéis de
// energia pelas casas em volta, poeira, faíscas, fragmentos e rachadura). Tudo reaproveitado: um rastro só, um
// cometa só no escudo; o resto usa as partículas, os anéis e a terra que o jogo já tem (src/fx/MagicFx.js,
// src/fx/EarthFx.js).
import * as THREE from 'three';
import { shieldOutline, SHIELD_BEND } from '../character/WarriorBuilder.js';

const SAMPLES = 40;
const COMET = 16;

export class WarriorFx {
  constructor(engine, fx, spellFx = null) {
    this.engine = engine;
    this.fx = fx;
    this.spellFx = spellFx;
    this.comet = null;      // brilho na borda do escudo
    this.timers = [];       // efeitos atrasados
    this.statusAcc = { guard: 0, parry: 0 };
    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(SAMPLES * 2 * 3);
    this.col = new Float32Array(SAMPLES * 2 * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    const idx = [];
    for (let i = 0; i < SAMPLES - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    geo.setIndex(idx);
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e4);
    this.trail = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }));
    this.trail.frustumCulled = false;
    this.trail.renderOrder = 7;
    this.trail.visible = false;
    this.trail.name = 'RastroDaLamina';
    engine.scene.add(this.trail);
    this.samples = []; // { base, tip, age }
    this.recording = false;
    this.color = [0.55, 0.75, 1.5];
  }

  // Começa a gravar o rastro (chame record() a cada quadro com a base e a ponta da lâmina).
  // life: quanto cada pedaço do rastro dura (s); golpes de arco grande usam rastro mais curto (senão vira um lençol)
  // keep(ponta): quais pedaços entram (o arco grande só grava a parte do golpe na frente do corpo)
  start(color = [0.55, 0.75, 1.5], life = 0.28, keep = null) { this.samples.length = 0; this.recording = true; this.trail.visible = true; this.color = color; this.life = life; this.keep = keep; this.last = null; }
  stop() { this.recording = false; }

  record(base, tip) {
    if (!this.recording) return;
    // golpe rápido: a ponta anda muito de um quadro para o outro; preenche o meio girando a lâmina em torno do
    // punho (assim o rastro sai em arco, não em pedaços retos)
    const L = this.last, steps = L ? Math.min(10, Math.ceil(L.tip.distanceTo(tip) / 0.1)) : 1;
    for (let k = 1; k <= steps; k++) {
      let b = base, t = tip;
      if (k < steps) {
        const u = k / steps, d0 = L.tip.clone().sub(L.base), d1 = tip.clone().sub(base);
        const len = d0.length() + (d1.length() - d0.length()) * u;
        b = L.base.clone().lerp(base, u);
        t = b.clone().add(d0.normalize().lerp(d1.normalize(), u).normalize().multiplyScalar(len));
      }
      if (!this.keep || this.keep(t)) this.samples.unshift({ base: b.clone(), tip: t.clone(), age: 0 });
    }
    this.last = { base: base.clone(), tip: tip.clone() };
    while (this.samples.length > SAMPLES) this.samples.pop();
  }

  later(sec, fn) { this.timers.push({ t: sec, fn }); }

  // Faíscas de metal onde o golpe acerta.
  sparks(p, n = 26) {
    for (let i = 0; i < n; i++) {
      const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, k = Math.sqrt(1 - u * u), sp = 2 + Math.random() * 3;
      this.fx.spawn({ p: [p.x, p.y, p.z], v: [k * Math.cos(a) * sp, Math.abs(u) * sp + 0.8, k * Math.sin(a) * sp],
        life: 0.25 + Math.random() * 0.3, size: 0.03 + Math.random() * 0.03, color: [3, 2.4, 1.2], color2: [1.2, 0.4, 0.1], drag: 2.5, gravity: -7 });
    }
  }

  // Golpe Devastador: a lâmina bate no chão diante do alvo (onda pequena, poeira, fragmentos, faíscas).
  slamImpact(p) {
    this.sparks({ x: p.x, y: 0.5, z: p.z }, 40);
    this.fx.shockwave(p.x, p.z, { color: [2.4, 1.3, 0.45], radius: 0.95, duration: 0.45 });
    this.later(0.08, () => this.fx.shockwave(p.x, p.z, { color: [1.4, 0.8, 0.3], radius: 1.35, duration: 0.5 }));
    const E = this.spellFx && this.spellFx.earth;
    if (E) { E.dust(p, { count: 18, radius: 0.35, up: 0.8 }); E.debris({ x: p.x, y: 0.1, z: p.z }, { count: 24, speed: 2.5 }); E.chunksBurst({ x: p.x, y: 0.1, z: p.z }, 5, 2.2); E.crack(p.x, p.z, 1.1, 3); }
    this.engine.shake(0.065, 0.35);
  }

  // Guarda quebrada: estilhaços cinza-azulados saindo do alvo.
  guardBreak(p) {
    for (let i = 0; i < 22; i++) {
      const a = Math.random() * Math.PI * 2, sp = 1.5 + Math.random() * 2.5;
      this.fx.spawn({ p: [p.x, 1.1, p.z], v: [Math.cos(a) * sp, 0.6 + Math.random() * 2, Math.sin(a) * sp], life: 0.5 + Math.random() * 0.4, size: 0.04 + Math.random() * 0.04, color: [1.2, 1.5, 2.2], color2: [0.25, 0.3, 0.45], drag: 2, gravity: -6 });
    }
  }

  // Investida: poeira nos pés enquanto ele arranca.
  dashDust(p, dt) {
    const E = this.spellFx && this.spellFx.earth;
    if (E && Math.random() < dt * 30) E.dust({ x: p.x, z: p.z }, { count: 2, radius: 0.2, up: 0.4, size: 0.3 });
  }

  // Investida: o choque do ombro e do escudo no alvo.
  bashImpact(p) {
    this.sparks({ x: p.x, y: 0.9, z: p.z }, 30);
    this.fx.shockwave(p.x, p.z, { color: [1.6, 1.4, 1.0], radius: 0.7, duration: 0.35 });
    const E = this.spellFx && this.spellFx.earth;
    if (E) E.dust(p, { count: 10, radius: 0.3 });
    this.engine.shake(0.05, 0.3);
  }

  // Contra-ataque: o clarão do golpe aparado.
  parryFlash(p) {
    this.fx.sparkle(new THREE.Vector3(p.x, 1.15, p.z), { color: [2.6, 2.6, 3.0], count: 34, speed: 2.2, size: 0.05 });
    this.fx.shockwave(p.x, p.z, { color: [1.8, 2.0, 2.6], radius: 0.6, duration: 0.3, y: 0.03 });
    if (this.spellFx && this.spellFx.lights) this.spellFx.lights.acquire({ color: '#dfe8ff', intensity: 9, distance: 5, duration: 0.25, position: new THREE.Vector3(p.x, 1.2, p.z) });
  }

  // Onda de Choque: anéis de energia correndo pelas casas em volta, poeira, faíscas, fragmentos e rachadura.
  shockwave(p) {
    const blue = [1.2, 1.7, 2.8], gold = [2.4, 1.5, 0.5];
    this.fx.shockwave(p.x, p.z, { color: gold, radius: 1.0, duration: 0.4 });
    this.later(0.06, () => this.fx.shockwave(p.x, p.z, { color: blue, radius: 1.75, duration: 0.6 }));
    this.later(0.16, () => this.fx.shockwave(p.x, p.z, { color: [0.8, 1.1, 2.0], radius: 2.0, duration: 0.7 }));
    for (let i = 0; i < 36; i++) { // faíscas rente ao chão, para fora
      const a = (i / 36) * Math.PI * 2, sp = 3 + Math.random() * 2;
      this.fx.spawn({ p: [p.x + Math.cos(a) * 0.3, 0.08, p.z + Math.sin(a) * 0.3], v: [Math.cos(a) * sp, 0.4 + Math.random() * 0.6, Math.sin(a) * sp], life: 0.35 + Math.random() * 0.25, size: 0.05, color: [2.6, 2.0, 1.0], color2: [1.0, 0.4, 0.1], drag: 2.2 });
    }
    const E = this.spellFx && this.spellFx.earth;
    if (E) { E.dust(p, { count: 40, radius: 1.0, up: 0.9, size: 0.55 }); E.debris({ x: p.x, y: 0.1, z: p.z }, { count: 45, speed: 3.5 }); E.chunksBurst({ x: p.x, y: 0.1, z: p.z }, 10, 3.2); E.crack(p.x, p.z, 2.4, 4); }
    if (this.spellFx && this.spellFx.lights) this.spellFx.lights.acquire({ color: '#9fc3ff', intensity: 12, distance: 7, duration: 0.45, position: new THREE.Vector3(p.x, 0.5, p.z) });
    this.engine.shake(0.09, 0.6);
  }

  // Guarda de Ferro: um brilho percorre a borda do escudo (shield: o grupo 'Escudo' do modelo). k: força.
  // O brilho do escudo, criado de uma vez e já na cena (escondido), para entrar na pré-compilação do carregamento:
  // criado só no primeiro uso, o shader dele compilava no meio do jogo e travava a tela (0,2 a 3 s).
  ensureComet() {
    if (!this.comet) {
      // o contorno do escudo, na frente da borda e curvado como ele
      const pts = shieldOutline(1).getSpacedPoints(120).map(v => new THREE.Vector3(v.x, v.y, 0.045 - SHIELD_BEND * v.x * v.x));
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(COMET * 3), 3).setUsage(THREE.DynamicDrawUsage));
      geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(COMET * 3), 3).setUsage(THREE.DynamicDrawUsage));
      const c = document.createElement('canvas'); c.width = c.height = 32;
      const g = c.getContext('2d'), gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
      gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 32, 32);
      const mat = new THREE.PointsMaterial({ size: 0.07, map: new THREE.CanvasTexture(c), vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
      const mesh = new THREE.Points(geo, mat);
      mesh.frustumCulled = false;
      mesh.name = 'BrilhoDoEscudo';
      mesh.visible = false;
      this.engine.scene.add(mesh); // vai para o escudo no primeiro brilho
      this.comet = { mesh, pts, t: 0, dur: 0.9, k: 0, on: false };
    }
    return this.comet.mesh;
  }

  shieldGlow(shield, k = 1) {
    if (!shield || !shield.group) return;
    this.ensureComet();
    if (this.comet.mesh.parent !== shield.group) shield.group.add(this.comet.mesh);
    Object.assign(this.comet, { t: 0, k, on: true });
    this.comet.mesh.visible = true;
  }

  updateComet(dt) {
    const C = this.comet;
    if (!C || !C.on) return;
    C.t += dt;
    const u = C.t / C.dur;
    if (u >= 1) { C.on = false; C.mesh.visible = false; return; }
    const n = C.pts.length, head = u * (n - 1), pos = C.mesh.geometry.attributes.position, col = C.mesh.geometry.attributes.color;
    const fade = u < 0.15 ? u / 0.15 : u > 0.85 ? (1 - u) / 0.15 : 1;
    for (let i = 0; i < COMET; i++) {
      const p = C.pts[Math.max(0, Math.round(head - i * 1.4)) % n];
      pos.setXYZ(i, p.x, p.y, p.z);
      const b = (1 - i / COMET) * fade * C.k;
      col.setXYZ(i, 1.2 * b, 1.7 * b, 2.6 * b);
    }
    pos.needsUpdate = col.needsUpdate = true;
  }

  // Efeitos que ficam enquanto o efeito de status dura: o escudo brilha de tempos em tempos (guarda erguida) e um
  // anel claro pulsa no chão (contra-ataque armado). pos: onde o guerreiro está.
  statusFx(dt, { guard = false, parry = false, pos = null, shield = null } = {}) {
    const A = this.statusAcc;
    if (guard) { A.guard -= dt; if (A.guard <= 0) { A.guard = 2.2; this.shieldGlow(shield, 0.6); } } else A.guard = 0.6;
    if (parry && pos) { A.parry -= dt; if (A.parry <= 0) { A.parry = 1.3; this.fx.shockwave(pos.x, pos.z, { color: [0.6, 0.75, 1.1], radius: 0.55, duration: 0.6, y: 0.025 }); } } else A.parry = 0.4;
  }

  update(dt) {
    for (const it of [...this.timers]) { it.t -= dt; if (it.t <= 0) { this.timers.splice(this.timers.indexOf(it), 1); it.fn(); } }
    this.updateComet(dt);
    if (!this.trail.visible) return;
    for (const s of this.samples) s.age += dt;
    const life = this.life || 0.28;
    while (this.samples.length && this.samples[this.samples.length - 1].age > life) this.samples.pop();
    if (!this.recording && !this.samples.length) { this.trail.visible = false; return; }
    const [r, g, b] = this.color, n = this.samples.length;
    for (let i = 0; i < SAMPLES; i++) {
      const s = this.samples[Math.min(i, n - 1)];
      const k = i < n ? Math.max(0, 1 - s.age / life) * (1 - i / SAMPLES) : 0;
      const j = i * 6;
      if (s) {
        // a fita vai do meio da lâmina até a ponta (a parte de perto do punho não deixa rastro)
        this.pos[j] = s.base.x + (s.tip.x - s.base.x) * 0.55; this.pos[j + 1] = s.base.y + (s.tip.y - s.base.y) * 0.55; this.pos[j + 2] = s.base.z + (s.tip.z - s.base.z) * 0.55;
        this.pos[j + 3] = s.tip.x; this.pos[j + 4] = s.tip.y; this.pos[j + 5] = s.tip.z;
      }
      this.col[j] = r * k * 0.15; this.col[j + 1] = g * k * 0.15; this.col[j + 2] = b * k * 0.15; // perto do punho, quase nada
      this.col[j + 3] = r * k; this.col[j + 4] = g * k; this.col[j + 5] = b * k;
    }
    const a = this.trail.geometry.attributes;
    a.position.needsUpdate = a.color.needsUpdate = true;
  }
}
