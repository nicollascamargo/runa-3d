// O guerreiro em cena: o modelo, o esqueleto, a respiração, a caminhada e a corrida (em código, nos ossos),
// o tabardo e a pluma balançando, o brilho das runas da espada e o brilho de borda de quando está selecionado.
// Os golpes vêm por cima, na mesma camada de poses do mago (castPose, src/character/CastAnimator.js).
// Telecinese: a camada 'flight' (a mesma do mago, preenchida por src/gameplay/Telekinesis.js) vira a pose de voo
// dele: pernas pesadas penduradas, escudo e espada abertos para equilibrar, susto ao ser pego e pouso agachado.
import * as THREE from 'three';
import { buildWarrior } from './WarriorBuilder.js';

const GLOWING = new WeakSet();

export class Warrior {
  // 'built' vem de buildWarrior() (modelo em código) ou de loadWarriorGLB() (arquivo .glb).
  constructor({ scale = 0.97, built = null } = {}) {
    Object.assign(this, built || buildWarrior());
    this.fromFile = !!(built && built.source);
    this.object = new THREE.Group();
    this.object.name = 'GuerreiroRaiz';
    this.object.add(this.root);
    this.root.scale.setScalar(scale);
    this.scale = scale;
    this.rest = {};
    for (const [name, bone] of Object.entries(this.bones)) this.rest[name] = bone.quaternion.clone();
    this.restHips = this.bones.Hips.position.clone();
    this.castPose = null;   // golpes (CastAnimator)
    this.castHips = 0;
    this.loco = { speed: 0, phase: 0 }; // caminhada: velocidade (m/s) e fase do passo
    this.flight = { air: 0, grab: 0, land: 0, pitch: 0, roll: 0, fwd: 0, side: 0, speed: 0 }; // telecinese
    // posturas que ficam enquanto o efeito durar (o controlador diz o alvo; o peso chega suave): escudo erguido
    // (Guarda de Ferro) e espada atravessada para aparar (Contra-ataque armado)
    this.stance = { guard: 0, parry: 0 };
    this.stanceTarget = { guard: 0, parry: 0 };
    this.pickHeight = 1.75 * scale / 0.97; // altura da cápsula usada para apontar o guerreiro
    this.dead = 0;
    this._tmp = new THREE.Quaternion();
    this._euler = new THREE.Euler();
    this.installGlow();
  }

  // Brilho de borda (o mesmo do mago): dourado quando o ponteiro está em cima, azul quando selecionado.
  installGlow() {
    this.glow = { color: new THREE.Color(0, 0, 0), target: new THREE.Color(0, 0, 0) };
    const uniforms = { uRimColor: { value: this.glow.color }, uRimPower: { value: 2.4 } };
    this.object.traverse(o => {
      if (!o.isMesh) return;
      for (const m of [].concat(o.material)) {
        if (!m || !m.isMeshStandardMaterial || GLOWING.has(m)) continue;
        GLOWING.add(m);
        m.onBeforeCompile = shader => {
          Object.assign(shader.uniforms, uniforms);
          shader.fragmentShader = shader.fragmentShader
            .replace('#include <common>', '#include <common>\nuniform vec3 uRimColor;\nuniform float uRimPower;')
            .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
            {
              float rim = 1.0 - saturate(dot(normal, normalize(vViewPosition)));
              totalEmissiveRadiance += uRimColor * pow(rim, uRimPower);
            }`);
        };
        m.customProgramCacheKey = () => 'runa-rim';
        m.needsUpdate = true;
      }
    });
  }

  setGlow(r, g, b, k = 1) { this.glow.target.setRGB(r * k, g * k, b * k); }

  get triangleCount() {
    let n = 0;
    this.object.traverse(o => { if (o.isMesh) n += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; });
    return Math.round(n);
  }

  placeAt(x, z, facing = 0) {
    this.object.position.set(x, 0, z);
    this.object.rotation.y = facing;
  }

  rot(name, x, y, z) {
    const bone = this.bones[name];
    if (!bone) return;
    this._euler.set(x, y, z);
    bone.quaternion.multiply(this._tmp.setFromEuler(this._euler));
  }

  // Respiração e passo. a = quanto anda (0 parado, 1 andando, 2 correndo).
  applyLocomotion(t) {
    const L = this.loco, b = this.bones;
    b.Hips.position.copy(this.restHips);
    const breath = Math.sin(t * 1.7);
    this.rot('Spine1', 0.012 * breath, 0, 0);
    this.rot('Spine2', 0.012 * Math.sin(t * 1.7 + 0.5), 0, 0);
    this.rot('LeftShoulder', 0, 0, 0.012 * breath);
    this.rot('RightShoulder', 0, 0, -0.012 * breath);
    this.rot('Head', 0.01 * Math.sin(t * 0.9), 0.02 * Math.sin(t * 0.43), 0);
    const a = Math.min(2, L.speed / 1.7), w = Math.min(1, a), run = Math.max(0, a - 1);
    if (w < 0.001) return;
    const p = L.phase, s = Math.sin(p), cw = Math.cos(p);
    const stride = 0.42 * w + 0.22 * run, knee = 0.75 * w + 0.45 * run;
    this.rot('LeftUpLeg', -s * stride, 0, 0);
    this.rot('RightUpLeg', s * stride, 0, 0);
    this.rot('LeftLeg', Math.max(0, cw) * knee, 0, 0);
    this.rot('RightLeg', Math.max(0, -cw) * knee, 0, 0);
    this.rot('LeftFoot', -Math.max(0, cw) * 0.25 * w, 0, 0);
    this.rot('RightFoot', -Math.max(0, -cw) * 0.25 * w, 0, 0);
    this.rot('LeftArm', s * 0.12 * w, 0, 0);            // o braço do escudo balança pouco
    this.rot('RightArm', -s * (0.28 * w + 0.15 * run), 0, 0);
    this.rot('Spine', 0.05 * run + 0.02 * w, s * 0.07 * w, 0);
    this.rot('Spine2', 0.04 * run, -s * 0.05 * w, 0);
    b.Hips.position.y -= Math.abs(cw) * (0.025 * w + 0.02 * run) + 0.015 * run;
  }

  // Pose de voo (telecinese), por cima da locomoção. Pesos de 0 a 1, como no mago (src/character/Mage.js):
  //   air: no ar (armadura pesada: pernas quase retas, penduradas; braços abertos para equilibrar)
  //   grab: o susto de ser agarrado; land: o agachamento do pouso; pitch/roll: inclinação do corpo inteiro
  applyFlight(t) {
    const F = this.flight, A = F.air, G = F.grab, L = F.land;
    if (A < 1e-3 && G < 1e-3 && L < 1e-3 && Math.abs(F.pitch) < 1e-3 && Math.abs(F.roll) < 1e-3) return;
    const sw = Math.sin(t * 1.3) * 0.05 * A, sw2 = Math.sin(t * 1.3 + 1.1) * 0.04 * A;
    const trail = THREE.MathUtils.clamp(F.fwd * 0.07, -0.28, 0.28) * A, slide = THREE.MathUtils.clamp(F.side * 0.06, -0.2, 0.2) * A;
    this.rot('Hips', F.pitch, 0, F.roll);
    this.rot('Spine', 0.04 * A + 0.16 * L, 0, 0);
    this.rot('Spine1', -0.05 * A - 0.18 * G + 0.1 * L, 0, -0.25 * F.roll);
    this.rot('Spine2', -0.03 * A, 0, 0);
    this.rot('Head', 0.2 * A - 0.3 * G - 0.1 * L - 0.4 * F.pitch, 0, -0.4 * F.roll);
    // escudo para fora e espada baixa e aberta: equilíbrio no ar; no pouso, os braços descem para amortecer
    this.rot('LeftArm', -0.12 * A - 0.12 * G, 0, 0.42 * A + 0.3 * G + 0.18 * L);
    this.rot('LeftForeArm', -0.18 * A, 0, 0);
    this.rot('RightArm', 0.04 * A, 0, -0.34 * A - 0.26 * G - 0.15 * L);
    this.rot('RightForeArm', -0.14 * A, 0, 0);
    this.rot('RightHand', 0.15 * A, 0, 0);
    // pernas: penduradas e quase retas (a armadura pesa), ficam para trás no movimento; no pouso, agacha fundo
    this.rot('LeftUpLeg', -0.12 * A - 0.55 * L + sw + trail, 0, 0.03 * A + slide);
    this.rot('LeftLeg', 0.3 * A + 1.05 * L - sw * 0.5, 0, 0);
    this.rot('LeftFoot', 0.42 * A - 0.5 * L, 0, 0);
    this.rot('RightUpLeg', -0.03 * A - 0.55 * L + sw2 + trail, 0, -0.03 * A + slide);
    this.rot('RightLeg', 0.2 * A + 1.05 * L - sw2 * 0.5, 0, 0);
    this.rot('RightFoot', 0.38 * A - 0.5 * L, 0, 0);
    this.bones.Hips.position.y -= 0.11 * L;
    // tabardo e pluma ficam para trás no ar e se abrem no pouso
    const tt = THREE.MathUtils.clamp(F.fwd * 0.1, -0.35, 0.35) * A;
    this.rot('RobeFront', -0.28 * L + tt + 0.06 * A, 0, 0);
    this.rot('RobeBack', 0.28 * L + tt, 0, 0);
    this.rot('RobeFront1', 0.5 * tt, 0, 0);
    this.rot('RobeBack1', 0.5 * tt, 0, 0);
    this.rot('HoodTip', 0.45 * tt - 0.2 * G + 0.12 * A, 0, -slide);
  }

  // Posturas seguradas, por cima da locomoção e do voo; os golpes vêm por cima delas.
  applyStance(t, dt) {
    const S = this.stance, T = this.stanceTarget, k = 1 - Math.exp(-6 * dt);
    S.guard += (T.guard - S.guard) * k; S.parry += (T.parry - S.parry) * k;
    const g = S.guard, p = S.parry;
    if (g < 1e-3 && p < 1e-3) return;
    const br = Math.sin(t * 2.1) * 0.015; // respiração firme
    // escudo erguido na frente do peito, joelhos flexionados, peso baixo
    this.rot('Spine', 0.08 * g + 0.05 * p + br, 0, 0);
    this.rot('Spine1', 0.03 * g, 0.18 * g + 0.1 * p, 0);
    this.rot('Head', 0.06 * g, -0.1 * g - 0.06 * p, 0);
    // (ângulos do escudo achados por busca na cena: na frente do peito, virado para a frente)
    this.rot('LeftArm', -0.6 * g - 0.12 * p, -0.74 * g - 0.42 * p, -0.8 * g - 0.6 * p);
    this.rot('LeftForeArm', 0.06 * g, -0.89 * g - 0.39 * p, 0);
    this.rot('RightArm', 0.15 * g - 0.95 * p, 0.3 * p, -0.1 * g + 0.5 * p);
    this.rot('RightForeArm', 0.12 * g + 0.05 * p, 0, 0);
    this.rot('RightHand', 0.1 * g + 0.15 * p, 0, -0.85 * p);
    const knee = 0.42 * g + 0.32 * p;
    this.rot('LeftUpLeg', -0.26 * g - 0.2 * p, 0, 0.12 * (g + p));
    this.rot('LeftLeg', knee, 0, 0);
    this.rot('RightUpLeg', -0.04 * g - 0.02 * p, 0, -0.12 * (g + p));
    this.rot('RightLeg', knee * 0.9, 0, 0);
    this.bones.Hips.position.y -= 0.075 * g + 0.055 * p;
  }

  applyCast() {
    const P = this.castPose;
    if (P) for (const name in P) { const r = P[name]; this.rot(name, r[0], r[1], r[2]); }
    if (this.castHips) this.bones.Hips.position.y += this.castHips;
  }

  // tabardo e pluma: balançam com o vento e ficam para trás quando ele anda
  applyCloth(t) {
    const k = 1 + Math.min(2, this.loco.speed / 1.7) * 1.5;
    const sway = (name, ax, ph) => { const w = Math.sin(t * 1.3 + ph) * 0.6 + Math.sin(t * 2.3 + ph * 2) * 0.4; this.rot(name, ax * w * k, 0, 0); };
    sway('RobeFront', -0.035, 0); sway('RobeFront1', -0.06, 0.7);
    sway('RobeBack', 0.035, 1.4); sway('RobeBack1', 0.06, 2.1);
    const lag = Math.min(0.5, this.loco.speed * 0.12);
    this.rot('RobeFront', -lag * 0.6, 0, 0); this.rot('RobeBack', lag * 0.4, 0, 0);
    this.rot('HoodTip', 0.04 * Math.sin(t * 1.7) + lag * 0.5, 0, 0);
  }

  update(dt, t) {
    for (const [name, bone] of Object.entries(this.bones)) bone.quaternion.copy(this.rest[name]);
    if (!this.bones.Hips) return; // modelo sem esqueleto reconhecido: fica parado
    this.applyLocomotion(t);
    this.applyFlight(t);
    this.applyStance(t, dt);
    this.applyCast();
    this.applyCloth(t);
    this.glow.color.lerp(this.glow.target, 1 - Math.exp(-10 * dt));
    if (this.sword && this.sword.runeMat) this.sword.runeMat.emissiveIntensity = 1.8 + 0.5 * Math.sin(t * 2.1);
  }
}
