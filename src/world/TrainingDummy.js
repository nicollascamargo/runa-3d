// Boneco de treino: poste, saco de palha com alvo pintado, braços de madeira e cabeça de juta.
// Tem barra de vida e mostra o dano: pisca em vermelho, balança e solta o número de dano.
// Variante 'automato': o mesmo boneco, escurecido e com olhos roxos acesos. É o inimigo da arena de treino:
// pula de casa em casa e investe contra o mago (quem decide é o combate, src/combat/).
// Reações aos efeitos: camada de gelo (lento, preso), choque elétrico (treme e pisca azul), tombar e levantar
// (derrubado), e o clarão do golpe na cor do elemento.
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { dummyTextures, woodTextures } from '../fx/textures.js';

// cor do clarão de cada elemento
const HIT_COLORS = { normal: '#ff2a1a', fisico: '#ff2a1a', fogo: '#ff5a1a', gelo: '#5ab8ff', raio: '#8a7cff', terra: '#ffb04a', arcano: '#b07cff' };
const BURN = new THREE.Color('#ff5a1a');

let shared = null;
function materials() {
  if (shared) return shared;
  const straw = dummyTextures(), wood = woodTextures(8);
  shared = {
    straw: () => new THREE.MeshStandardMaterial({ map: straw.map, roughness: 0.95, emissive: '#ff2a1a', emissiveIntensity: 0 }),
    wood: () => new THREE.MeshStandardMaterial({ map: wood.map, normalMap: wood.normal, roughness: 0.85, emissive: '#ff2a1a', emissiveIntensity: 0 }),
    rope: new THREE.MeshStandardMaterial({ color: '#8a6a3c', roughness: 1 }),
    stitch: new THREE.MeshStandardMaterial({ color: '#1a1008', roughness: 1 }),
  };
  return shared;
}

export class TrainingDummy {
  constructor({ name = 'Boneco de treino', maxHp = 100, variant = 'boneco' } = {}) {
    const M = materials();
    this.name = name;
    this.variant = variant;
    this.maxHp = maxHp;
    this.hp = maxHp;
    this.object = new THREE.Group();
    this.object.name = 'BonecoDeTreino';
    this.body = new THREE.Group();
    this.object.add(this.body);
    this.mats = [M.straw(), M.wood()];
    const [straw, wood] = this.mats;
    if (variant === 'automato') { straw.color.set('#6b5a7a'); wood.color.set('#5a4a5e'); }
    const add = (geo, mat, parent = this.body) => {
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = m.receiveShadow = true;
      parent.add(m);
      return m;
    };
    // base em cruz e poste
    add(new THREE.BoxGeometry(0.7, 0.08, 0.12).translate(0, 0.04, 0), wood, this.object);
    add(new THREE.BoxGeometry(0.12, 0.08, 0.7).translate(0, 0.04, 0), wood, this.object);
    add(new THREE.CylinderGeometry(0.045, 0.055, 1.55, 10).translate(0, 0.78, 0), wood);
    // saco de palha
    const prof = [[0, 0], [0.13, 0.01], [0.17, 0.1], [0.18, 0.3], [0.165, 0.48], [0.12, 0.56], [0, 0.58]].map(([x, y]) => new THREE.Vector2(x, y));
    const sack = add(new THREE.LatheGeometry(prof, 24), straw);
    sack.position.y = 0.72;
    sack.rotation.y = -Math.PI / 2; // o alvo pintado (u = 0,5) fica para a frente
    // camada de gelo (lentidão, prisão): uma casca translúcida por cima do saco e da cabeça, escondida
    this.frostMat = new THREE.MeshStandardMaterial({ color: '#9fd6ff', emissive: '#2f8fe0', emissiveIntensity: 0.25, roughness: 0.05, metalness: 0, transparent: true, opacity: 0, depthWrite: false });
    this.frostShell = new THREE.Group();
    const frostSack = new THREE.Mesh(new THREE.LatheGeometry(prof.map(p => new THREE.Vector2(p.x * 1.12 + 0.01, p.y * 1.04 - 0.01)), 20), this.frostMat);
    frostSack.position.y = 0.72;
    const frostHead = new THREE.Mesh(new THREE.SphereGeometry(0.152, 14, 10).scale(1, 1.08, 0.97).translate(0, 1.47, 0), this.frostMat);
    this.frostShell.add(frostSack, frostHead);
    this.frostShell.visible = false;
    this.body.add(this.frostShell);
    for (const [y, r] of [[0.78, 0.172], [1.0, 0.18], [1.2, 0.17]]) add(new THREE.TorusGeometry(r, 0.012, 6, 24).rotateX(Math.PI / 2).translate(0, y, 0), M.rope);
    // braços
    add(new THREE.CylinderGeometry(0.03, 0.03, 0.86, 8).rotateZ(Math.PI / 2).translate(0, 1.18, 0), wood);
    for (const s of [-1, 1]) add(new THREE.ConeGeometry(0.06, 0.14, 8).rotateZ(s * Math.PI / 2).translate(s * 0.49, 1.18, 0), straw);
    // cabeça de juta com olhos costurados
    add(new THREE.SphereGeometry(0.135, 18, 14).scale(1, 1.08, 0.95).translate(0, 1.47, 0), straw);
    for (const s of [-1, 1]) for (const r of [0.6, -0.6]) {
      add(new THREE.BoxGeometry(0.05, 0.008, 0.008).rotateZ(r).translate(s * 0.045, 1.49, 0.125), M.stitch);
    }
    add(new THREE.BoxGeometry(0.08, 0.007, 0.007).translate(0, 1.42, 0.127), M.stitch);
    if (variant === 'automato') {
      // olhos de energia roxa (passam do branco: o bloom acende)
      const eyeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 0.6, 4.2), toneMapped: false });
      for (const sx of [-1, 1]) add(new THREE.SphereGeometry(0.022, 10, 8).translate(sx * 0.045, 1.49, 0.128), eyeMat).castShadow = false;
    }

    // barra de vida
    const el = document.createElement('div');
    el.className = `dummy-hud ${variant}`;
    el.innerHTML = `<span class="dname">${name}</span><span class="hpbar"><i></i></span><span class="hpnum"></span>`;
    this.hud = new CSS2DObject(el);
    this.hud.position.set(0, 1.95, 0);
    this.object.add(this.hud);
    this.hpBar = el.querySelector('.hpbar i');
    this.hpNum = el.querySelector('.hpnum');
    this.flash = 0;
    this.shake = 0;
    this.fall = 0;
    this.heat = 0;       // brilho de queimadura (0 a 1), ligado pelo combate
    this.frost = 0; this.frostTarget = 0;   // camada de gelo
    this.shockT = 0; this.stunned = false;  // choque elétrico; atordoado treme de leve o tempo todo
    this.rising = 0;     // levantando depois de derrubado
    this.flashColor = new THREE.Color('#ff2a1a');
    this.hop = null;     // pulo entre casas
    this.lungeT = 0;     // investida de ataque
    this.statusEl = el.appendChild(document.createElement('span'));
    this.statusEl.className = 'dstatus';
    this.refresh();
  }

  // ---------- usados pelo combate (a vida de verdade fica em src/combat/Combat.js) ----------
  setHp(hp) { this.hp = hp; this.refresh(); }

  // Mostra o golpe (pisca na cor do elemento, balança, número) sem mexer na vida.
  showHit(amount, kind = 'normal') {
    this.flash = 1;
    this.shake = 1;
    this.flashColor.set(HIT_COLORS[kind] || HIT_COLORS.normal);
    const tag = document.createElement('div');
    tag.className = `dmg ${kind}`;
    tag.textContent = `-${amount}`;
    const obj = new CSS2DObject(tag);
    obj.position.set((Math.random() - 0.5) * 0.3, 1.7, 0);
    this.object.add(obj);
    setTimeout(() => { this.object.remove(obj); tag.remove(); }, 1100);
  }

  // Texto curto sobre a barra de vida (efeitos ativos).
  setStatusText(text) { if (this.statusEl.textContent !== text) this.statusEl.textContent = text; }

  knockDown() { this.rising = 0; if (this.fall <= 0) this.fall = 0.0001; }
  standUp() { this.fall = 0; this.rising = 0; this.body.rotation.set(0, 0, 0); }
  // levanta devagar (fim do "derrubado")
  getUp() { if (this.fall > 0) { this.rising = this.fall; this.fall = 0; } }

  setFrost(k) { this.frostTarget = k; }
  // choque elétrico: treme e pisca em azul; k muda a força (a Corrente Elétrica perde força a cada salto)
  shock(k = 1) { this.shockT = 0.65 * k; this.shockK = k; this.flash = Math.max(this.flash, 0.8 * k); this.flashColor.set(HIT_COLORS.raio); }

  // Pulo até (x, z) em 'dur' segundos, virando para onde vai.
  hopTo(x, z, dur = 0.34) {
    const from = this.object.position.clone();
    this.hop = { from, to: new THREE.Vector3(x, 0, z), t: 0, dur };
    this.object.rotation.y = Math.atan2(x - from.x, z - from.z);
  }

  // Investida rápida na direção de (x, z), e volta.
  lunge(x, z) { this.object.rotation.y = Math.atan2(x - this.object.position.x, z - this.object.position.z); this.lungeT = 1; }

  placeAt(x, z, facing = 0) {
    this.object.position.set(x, 0, z);
    this.object.rotation.y = facing;
  }

  refresh() {
    this.hpBar.style.width = `${(this.hp / this.maxHp) * 100}%`;
    this.hpNum.textContent = `${Math.ceil(this.hp)}/${this.maxHp}`;
    this.hud.element.classList.toggle('low', this.hp / this.maxHp < 0.3);
  }

  // Dano com retorno visual. 'kind' muda a cor do número (fogo, gelo, raio, arcano).
  takeDamage(amount, kind = 'normal') {
    if (this.hp <= 0) return;
    this.hp = Math.max(0, this.hp - amount);
    this.flash = 1;
    this.shake = 1;
    this.refresh();
    const tag = document.createElement('div');
    tag.className = `dmg ${kind}`;
    tag.textContent = `-${amount}`;
    const obj = new CSS2DObject(tag);
    obj.position.set((Math.random() - 0.5) * 0.3, 1.7, 0);
    this.object.add(obj);
    setTimeout(() => { this.object.remove(obj); tag.remove(); }, 1100);
    if (this.hp <= 0) {
      this.fall = 0.0001;
      setTimeout(() => { this.hp = this.maxHp; this.fall = 0; this.body.rotation.set(0, 0, 0); this.refresh(); }, 2600);
    }
  }

  update(dt, t = 0) {
    if (this.flash > 0 || this.heat > 0 || this._glowOn) {
      this.flash = Math.max(0, this.flash - dt * 4);
      // queimando: só a palha tremeluz, bem de leve (quem mostra o fogo são as chamas; na madeira escura vira tinta vermelha)
      const burn = this.heat * (0.035 + 0.02 * Math.sin(t * 13) + 0.01 * Math.sin(t * 29));
      const flashing = this.flash * 1.6 > burn;
      this.mats.forEach((m, i) => {
        m.emissive.copy(flashing ? this.flashColor : BURN);
        m.emissiveIntensity = Math.max(this.flash * 1.6, i === 0 ? burn : 0);
      });
      this._glowOn = this.flash > 0 || this.heat > 0;
    }
    // camada de gelo aparece e some devagar
    if (this.frost !== this.frostTarget) {
      this.frost += (this.frostTarget - this.frost) * (1 - Math.exp(-6 * dt));
      if (Math.abs(this.frost - this.frostTarget) < 0.01) this.frost = this.frostTarget;
      this.frostMat.opacity = 0.3 * this.frost;
      this.frostShell.visible = this.frost > 0.01;
    }
    if (this.frostShell.visible) this.frostMat.emissiveIntensity = 0.2 + 0.06 * Math.sin(t * 3);
    if (this.rising > 0) { // levantando
      this.rising = Math.max(0, this.rising - dt * 1.8);
      this.body.rotation.x = -this.rising * 1.35 * (1 - (1 - this.rising) ** 3);
      if (this.rising === 0) this.body.rotation.x = 0;
    }
    if (this.hop) {
      const h = this.hop;
      h.t += dt;
      const u = Math.min(1, h.t / h.dur), e = u * u * (3 - 2 * u);
      this.object.position.lerpVectors(h.from, h.to, e);
      this.object.position.y = Math.sin(Math.PI * u) * 0.22;
      this.body.scale.set(1, 1 - 0.12 * Math.sin(Math.PI * Math.min(1, u * 2)) * (u < 0.5 ? 1 : 0), 1);
      if (u >= 1) { this.hop = null; this.object.position.y = 0; this.body.scale.set(1, 1, 1); }
    }
    if (this.lungeT > 0) {
      this.lungeT = Math.max(0, this.lungeT - dt * 2.6);
      const k = Math.sin((1 - this.lungeT) * Math.PI);
      this.body.rotation.x = k * 0.45;
      if (this.lungeT === 0) this.body.rotation.x = 0;
    }
    if (this.fall > 0) {
      this.fall = Math.min(1, this.fall + dt * 2.5);
      this.body.rotation.x = -this.fall * 1.35 * (1 - (1 - this.fall) ** 3);
      return;
    }
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 2.2);
      const s = this.shake;
      this.body.rotation.z = Math.sin(s * 28) * 0.12 * s;
      this.body.rotation.x = Math.sin(s * 21) * 0.06 * s;
    }
    if (this.shockT > 0 || this.stunned) { // choque: tremedeira rápida e desencontrada
      this.shockT = Math.max(0, this.shockT - dt);
      const k = this.shockT > 0 ? Math.min(1, this.shockT * 2) * (this.shockK || 1) : 0.25;
      this.body.rotation.z = (Math.random() - 0.5) * 0.12 * k;
      this.body.position.x = (Math.random() - 0.5) * 0.03 * k;
      if (this.shockT === 0 && !this.stunned) { this.body.rotation.z = 0; this.body.position.x = 0; }
    }
  }
}
