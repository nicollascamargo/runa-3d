// O mago em cena: o modelo, o esqueleto, o tecido que balança, o brilho dos olhos e do cristal,
// e as poses de teste que mostram que a malha acompanha os ossos.
import * as THREE from 'three';
import { buildMage, applyPose } from './MageBuilder.js';

const GLOWING = new WeakSet();
const q = (x, y, z) => new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z, 'XYZ'));

// Poses só para testar o rig (as animações de verdade vêm na Etapa C).
export const TEST_POSES = [
  { name: 'Repouso', pose: {} },
  { name: 'Braços erguidos', pose: { LeftArm: q(0, 0, 2.2), LeftForeArm: q(0, 0, 0.5), RightArm: q(-0.2, 0, -2.0), RightForeArm: q(-0.3, 0, -0.3), Head: q(-0.25, 0, 0), Spine2: q(-0.12, 0, 0) } },
  { name: 'Olhando de lado', pose: { Head: q(0.05, 0.9, 0), Neck: q(0, 0.3, 0), Spine2: q(0, 0.35, 0), Spine1: q(0, 0.2, 0) } },
  { name: 'Curvado', pose: { Spine: q(0.25, 0, 0), Spine1: q(0.25, 0, 0), Spine2: q(0.2, 0, 0), Head: q(0.25, 0, 0), LeftArm: q(-0.9, 0, 0.3), LeftForeArm: q(-1.1, 0, 0) } },
  { name: 'Passo largo', pose: { LeftUpLeg: q(-0.7, 0, 0.05), LeftLeg: q(0.5, 0, 0), RightUpLeg: q(0.45, 0, -0.05), RobeFront: q(-0.35, 0, 0), RobeFront1: q(-0.1, 0, 0), RobeBack: q(0.2, 0, 0), Hips: q(0, 0.2, 0) } },
];

export class Mage {
  // 'built' vem de buildMage() (modelo em código) ou de loadMageGLB() (arquivo .glb).
  constructor({ scale = 0.95, built = null } = {}) {
    Object.assign(this, built || buildMage());
    this.fromFile = !!(built && built.source);
    this.object = new THREE.Group();
    this.object.name = 'MagoRaiz';
    this.object.add(this.root);
    this.root.scale.setScalar(scale);
    this.scale = scale;
    this.rest = {};
    for (const [name, bone] of Object.entries(this.bones)) this.rest[name] = bone.quaternion.clone();
    this.wind = true;
    this.poseIndex = 0;
    this.helper = new THREE.SkeletonHelper(this.root);
    this.helper.visible = false;
    this.helper.material.depthTest = false;
    this.helper.material.transparent = true;
    this.helper.material.opacity = 0.9;
    this.helper.renderOrder = 10;
    // juntas visíveis quando o esqueleto aparece
    this.joints = new THREE.InstancedMesh(new THREE.SphereGeometry(0.018, 10, 8), new THREE.MeshBasicMaterial({ color: '#ffd27a', depthTest: false, transparent: true, opacity: 0.95 }), this.skeleton.bones.length);
    this.joints.renderOrder = 11;
    this.joints.visible = false;
    this.joints.frustumCulled = false;
    this._tmp = new THREE.Quaternion();
    this._euler = new THREE.Euler();
    // camada de voo (telecinese): quem controla é src/gameplay/Telekinesis.js
    this.flight = { air: 0, grab: 0, land: 0, pitch: 0, roll: 0, fwd: 0, side: 0, speed: 0 };
    // camada de conjuração e reações (src/character/CastAnimator.js): { osso: [x, y, z] } em radianos, por cima de tudo
    this.castPose = null;
    this.castHips = 0;
    this.restHips = this.bones.Hips ? this.bones.Hips.position.clone() : null;
    this.installGlow();
  }

  // Brilho de borda (Fresnel): a silhueta acende quando o mago é selecionado ou segurado pela telecinese.
  // Injeta umas linhas no shader dos materiais do Three.js; vale também para um mago vindo de .glb.
  installGlow() {
    this.glow = { color: new THREE.Color(0, 0, 0), target: new THREE.Color(0, 0, 0) };
    const uniforms = { uRimColor: { value: this.glow.color }, uRimPower: { value: 2.4 } };
    this.root.traverse(o => {
      if (!o.isMesh) return;
      for (const m of [].concat(o.material)) {
        if (!m || !m.isMeshStandardMaterial || GLOWING.has(m)) continue;
        GLOWING.add(m); // marca fora do userData, que iria parar no .glb exportado
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

  // cor do brilho (pode passar de 1 para acender o bloom) e intensidade
  setGlow(r, g, b, k = 1) { this.glow.target.setRGB(r * k, g * k, b * k); }

  get boneCount() { return this.skeleton.bones.length; }

  get triangleCount() {
    let n = 0;
    this.root.traverse(o => { if (o.isMesh) n += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; });
    return Math.round(n);
  }

  // Coloca o mago no chão, na posição dada (coordenadas do mundo).
  placeAt(x, z, facing = 0) {
    this.object.position.set(x, 0, z);
    this.object.rotation.y = facing;
  }

  showSkeleton(on) { this.helper.visible = on; this.joints.visible = on; }

  nextTestPose() {
    this.poseIndex = (this.poseIndex + 1) % TEST_POSES.length;
    return TEST_POSES[this.poseIndex].name;
  }

  // Pose de voo por cima da pose atual. Cada peso vai de 0 a 1:
  //   air: levitando (pernas soltas e dobradas, pés apontando para baixo, braço livre aberto para equilibrar, olhar para o chão)
  //   grab: o susto de ser agarrado (peito para trás, cabeça para cima, braço abre)
  //   land: o agachamento do pouso (joelhos dobram, quadril desce, manto se abre)
  //   pitch/roll: inclinação do corpo inteiro na direção do movimento
  applyFlight(t) {
    const b = this.bones, F = this.flight;
    if (this.restHips) b.Hips.position.copy(this.restHips);
    const A = F.air, G = F.grab, L = F.land;
    if (A < 1e-3 && G < 1e-3 && L < 1e-3 && Math.abs(F.pitch) < 1e-3 && Math.abs(F.roll) < 1e-3) return;
    const rot = (name, x, y, z) => {
      const bone = b[name];
      if (!bone) return;
      this._euler.set(x, y, z);
      bone.quaternion.multiply(this._tmp.setFromEuler(this._euler));
    };
    const dangle = Math.sin(t * 1.7) * 0.06 * A, dangle2 = Math.sin(t * 1.7 + 1.3) * 0.05 * A;
    // tronco
    rot('Hips', F.pitch, 0, F.roll);
    rot('Spine', 0.1 * L, 0, 0);
    rot('Spine1', -0.06 * A - 0.16 * G + 0.08 * L, 0, -0.3 * F.roll);
    rot('Spine2', -0.04 * A, 0, 0);
    rot('Neck', 0.05 * A, 0, 0);
    rot('Head', 0.16 * A - 0.28 * G - 0.06 * L - 0.4 * F.pitch, 0, -0.5 * F.roll);
    // braço livre abre para equilibrar; o do cajado abre um pouco
    rot('LeftArm', -0.15 * A - 0.1 * G, 0, 0.55 * A + 0.35 * G + 0.25 * L);
    rot('LeftForeArm', -0.25 * A, 0, 0);
    rot('LeftHand', 0, 0, 0.2 * A);
    rot('RightArm', 0, 0, -0.12 * A - 0.12 * G);
    // pernas: no ar ficam soltas e dobradas; no pouso agacham
    rot('LeftUpLeg', -0.28 * A - 0.45 * L + dangle, 0, 0.04 * A);
    rot('LeftLeg', 0.55 * A + 0.9 * L - dangle, 0, 0);
    rot('LeftFoot', 0.35 * A - 0.45 * L, 0, 0);
    rot('RightUpLeg', -0.06 * A - 0.45 * L + dangle2, 0, -0.04 * A);
    rot('RightLeg', 0.32 * A + 0.9 * L - dangle2, 0, 0);
    rot('RightFoot', 0.3 * A - 0.45 * L, 0, 0);
    if (this.restHips) b.Hips.position.y -= 0.085 * L;
    // manto: abre para os lados no pouso; no ar fica para trás conforme a velocidade
    const trail = THREE.MathUtils.clamp(F.fwd * 0.1, -0.35, 0.35) * A, slide = THREE.MathUtils.clamp(F.side * 0.1, -0.3, 0.3) * A;
    const flare = 0.36 * L + 0.08 * A;
    rot('RobeFront', -flare + trail, 0, 0);
    rot('RobeBack', flare + trail, 0, 0);
    rot('RobeLeft', trail * 0.5, 0, flare - slide);
    rot('RobeRight', trail * 0.5, 0, -flare - slide);
    rot('RobeFront1', 0.5 * trail, 0, 0);
    rot('RobeBack1', 0.5 * trail, 0, 0);
    rot('Cape', 0.1 * A + 0.55 * trail + 0.2 * L, 0, -slide);
    rot('Cape1', 0.06 * A + 0.3 * trail, 0, -0.5 * slide);
    rot('Cape2', 0.05 * A + 0.2 * trail, 0, 0);
    rot('HoodTip', 0.3 * trail - 0.2 * G, 0, 0);
  }

  // Pose de conjuração por cima da pose atual (girada no espaço de cada osso, como a pose de voo).
  applyCast() {
    const P = this.castPose;
    if (!P) return;
    for (const name in P) {
      const bone = this.bones[name], r = P[name];
      if (!bone) continue;
      this._euler.set(r[0], r[1], r[2]);
      bone.quaternion.multiply(this._tmp.setFromEuler(this._euler));
    }
    if (this.restHips && this.castHips) this.bones.Hips.position.y += this.castHips;
  }

  update(dt, t) {
    // volta todos os ossos para a pose de repouso e aplica a pose de teste por cima
    for (const [name, bone] of Object.entries(this.bones)) bone.quaternion.copy(this.rest[name]);
    applyPose(this.bones, TEST_POSES[this.poseIndex].pose);
    this.applyFlight(t);
    this.applyCast();

    // tecido ao vento: cada corrente balança com ondas sobrepostas, a ponta mais que a raiz
    const F = this.flight;
    if (this.wind || F.air > 0.01) {
      // no ar o tecido balança mais e mais rápido, e fica para trás na direção do movimento
      const k = this.wind ? 1 + 1.3 * F.air + 0.5 * Math.min(1, F.speed / 3) : 1.3 * F.air;
      const tt = t * (1 + 0.8 * F.air);
      const sway = (bone, ax, az, ph) => {
        if (!bone) return; // um modelo vindo de arquivo pode não ter os ossos do tecido
        const w = Math.sin(tt * 0.9 + ph) * 0.6 + Math.sin(tt * 1.7 + ph * 2.1) * 0.3 + Math.sin(tt * 3.1 + ph * 0.7) * 0.1;
        this._euler.set(ax * w * k, 0, az * w * k);
        bone.quaternion.multiply(this._tmp.setFromEuler(this._euler));
      };
      const b = this.bones;
      sway(b.RobeFront, -0.05, 0, 0.0); sway(b.RobeFront1, -0.08, 0, 0.6);
      sway(b.RobeBack, 0.05, 0, 1.3); sway(b.RobeBack1, 0.09, 0, 1.9);
      sway(b.RobeLeft, 0, 0.04, 2.4); sway(b.RobeLeft1, 0, 0.05, 3.0);
      sway(b.RobeRight, 0, -0.04, 3.5); sway(b.RobeRight1, 0, -0.05, 4.1);
      sway(b.Cape, 0.04, 0.012, 0.4); sway(b.Cape1, 0.08, 0.02, 1.0); sway(b.Cape2, 0.12, 0.03, 1.6);
      sway(b.HoodTip, 0.08, 0.06, 2.2);
    }

    if (this.joints.visible) {
      this.root.updateMatrixWorld(true);
      const m = new THREE.Matrix4(), p = new THREE.Vector3();
      this.skeleton.bones.forEach((bone, i) => { bone.getWorldPosition(p); this.joints.setMatrixAt(i, m.makeTranslation(p.x, p.y, p.z)); });
      this.joints.instanceMatrix.needsUpdate = true;
    }

    // brilho de borda vai suave até o alvo
    this.glow.color.lerp(this.glow.target, 1 - Math.exp(-10 * dt));

    // olhos e cristal pulsam de leve
    const pulse = (0.88 + 0.12 * Math.sin(t * 2.3) + 0.04 * Math.sin(t * 7.1)) * (1 + 0.5 * F.air + 0.8 * F.grab);
    if (this.materials && this.materials.eyes) this.materials.eyes.color.setRGB(1.0 * pulse, 2.4 * pulse, 5.6 * pulse);
    const st = this.staff;
    if (st) {
      if (st.crystalMat) st.crystalMat.emissiveIntensity = 2.1 + 0.6 * Math.sin(t * 1.6);
      if (st.light) st.light.intensity = 1.9 + 0.5 * Math.sin(t * 1.6);
      if (st.crystal) st.crystal.rotation.y += dt * 0.4;
    }
  }
}
