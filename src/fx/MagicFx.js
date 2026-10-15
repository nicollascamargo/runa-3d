// Efeitos de magia reaproveitáveis: faíscas (partículas) e ondas de choque no chão.
// Um único sistema de partículas com reserva fixa: emitir não cria objetos novos durante o jogo.
// As magias (src/fx/SpellFx.js) usam o mesmo sistema para fogo, brasas, fumaça e faíscas.
import * as THREE from 'three';
import { softDotTexture } from './textures.js';

const MAX = 2600;

const VERT = /* glsl */`
  attribute float size;
  attribute float alpha;
  attribute vec3 tint;
  varying vec3 vTint;
  varying float vAlpha;
  uniform float uScale;
  void main() {
    vTint = tint;
    vAlpha = alpha;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = size * uScale / max(0.1, -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;
const FRAG = /* glsl */`
  uniform sampler2D map;
  varying vec3 vTint;
  varying float vAlpha;
  void main() {
    float a = texture2D(map, gl_PointCoord).a * vAlpha;
    if (a < 0.003) discard;
    gl_FragColor = vec4(vTint * a, a);
  }
`;

// anel macio: transparente no meio, uma borda clara que se apaga para fora
function ringTexture(size = 256) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const cx = c.getContext('2d');
  const g = cx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(0.62, 'rgba(255,255,255,0)');
  g.addColorStop(0.86, 'rgba(255,255,255,.55)');
  g.addColorStop(0.93, 'rgba(255,255,255,1)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  cx.fillStyle = g;
  cx.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class MagicFx {
  constructor(engine) {
    this.engine = engine;
    this.group = new THREE.Group();
    this.group.name = 'EfeitosMagicos';
    engine.scene.add(this.group);

    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(MAX * 3);
    this.tint = new Float32Array(MAX * 3);
    this.size = new Float32Array(MAX);
    this.alpha = new Float32Array(MAX);
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('tint', new THREE.BufferAttribute(this.tint, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e4);
    this.material = new THREE.ShaderMaterial({
      uniforms: { map: { value: softDotTexture() }, uScale: { value: 400 } },
      vertexShader: VERT, fragmentShader: FRAG,
      // cor já multiplicada pela opacidade: soma luz sem escurecer o que está atrás
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
      transparent: true, depthWrite: false,
    });
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    this.group.add(this.points);

    // estado de cada partícula
    this.vel = new Float32Array(MAX * 3);
    this.life = new Float32Array(MAX);  // tempo restante
    this.span = new Float32Array(MAX);  // vida total
    this.size0 = new Float32Array(MAX);
    this.drag = new Float32Array(MAX);
    this.grav = new Float32Array(MAX);
    this.base = new Float32Array(MAX * 3); // cor no começo da vida
    this.end = new Float32Array(MAX * 3);  // cor no fim da vida (igual à do começo, se não for dada)
    this.cursor = 0;

    this.rings = [];
    this.ringGeo = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);
    this.ringTex = ringTexture();
  }

  // Uma partícula. o: { p:[x,y,z], v:[x,y,z], life, size, color:[r,g,b], color2 (cor no fim da vida), drag, gravity }
  spawn(o) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % MAX;
    const k = i * 3;
    this.pos[k] = o.p[0]; this.pos[k + 1] = o.p[1]; this.pos[k + 2] = o.p[2];
    this.vel[k] = o.v[0]; this.vel[k + 1] = o.v[1]; this.vel[k + 2] = o.v[2];
    this.base[k] = o.color[0]; this.base[k + 1] = o.color[1]; this.base[k + 2] = o.color[2];
    const c2 = o.color2 || o.color;
    this.end[k] = c2[0]; this.end[k + 1] = c2[1]; this.end[k + 2] = c2[2];
    this.life[i] = this.span[i] = o.life;
    this.size0[i] = o.size;
    this.drag[i] = o.drag ?? 1.5;
    this.grav[i] = o.gravity ?? 0;
  }

  // Onda de choque: anel no chão que cresce e some.
  shockwave(x, z, { color = [0.5, 0.8, 2.2], radius = 1.1, duration = 0.55, y = 0.02 } = {}) {
    let r = this.rings.find(o => !o.mesh.visible);
    if (!r) {
      const mat = new THREE.MeshBasicMaterial({ map: this.ringTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
      r = { mesh: new THREE.Mesh(this.ringGeo, mat) };
      r.mesh.renderOrder = 4;
      this.group.add(r.mesh);
      this.rings.push(r);
    }
    Object.assign(r, { t: 0, duration, radius, color });
    r.mesh.position.set(x, y, z);
    r.mesh.visible = true;
  }

  // Pouso mágico: anel de faíscas rente ao chão, faíscas subindo, poeira e duas ondas.
  landing(x, z, { color = [0.45, 0.75, 2.4], accent = [2.2, 1.6, 0.7] } = {}) {
    for (let i = 0; i < 70; i++) {
      const a = (i / 70) * Math.PI * 2 + Math.random() * 0.1, s = 2.2 + Math.random() * 1.6;
      this.spawn({ p: [x + Math.cos(a) * 0.18, 0.05, z + Math.sin(a) * 0.18], v: [Math.cos(a) * s, 0.25 + Math.random() * 0.5, Math.sin(a) * s],
        life: 0.45 + Math.random() * 0.3, size: 0.07 + Math.random() * 0.05, color, drag: 4.2, gravity: -1.5 });
    }
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.random() * 0.4;
      this.spawn({ p: [x + Math.cos(a) * r, 0.05 + Math.random() * 0.2, z + Math.sin(a) * r], v: [Math.cos(a) * 0.3, 1.0 + Math.random() * 1.6, Math.sin(a) * 0.3],
        life: 0.7 + Math.random() * 0.6, size: 0.05 + Math.random() * 0.05, color: Math.random() < 0.3 ? accent : color, drag: 1.6, gravity: -0.4 });
    }
    for (let i = 0; i < 24; i++) {
      const a = Math.random() * Math.PI * 2, s = 0.6 + Math.random() * 0.8;
      this.spawn({ p: [x + Math.cos(a) * 0.25, 0.06, z + Math.sin(a) * 0.25], v: [Math.cos(a) * s, 0.15 + Math.random() * 0.2, Math.sin(a) * s],
        life: 0.9 + Math.random() * 0.5, size: 0.2 + Math.random() * 0.15, color: [0.16, 0.18, 0.26], drag: 2.5 });
    }
    this.shockwave(x, z, { color, radius: 1.25, duration: 0.5 });
    this.shockwave(x, z, { color: accent, radius: 0.75, duration: 0.38, y: 0.025 });
  }

  // Brilho que sobe em espiral em volta de quem está levitando. Chame a cada quadro com 'amount' de 0 a 1.
  aura(center, amount, dt, color = [0.45, 0.7, 2.2]) {
    this._auraAcc = (this._auraAcc || 0) + dt * 46 * amount;
    while (this._auraAcc >= 1) {
      this._auraAcc -= 1;
      const a = Math.random() * Math.PI * 2, r = 0.25 + Math.random() * 0.25;
      this.spawn({ p: [center.x + Math.cos(a) * r, center.y - 0.05 + Math.random() * 0.25, center.z + Math.sin(a) * r],
        v: [-Math.sin(a) * 0.45, 0.5 + Math.random() * 0.7, Math.cos(a) * 0.45],
        life: 0.7 + Math.random() * 0.6, size: 0.035 + Math.random() * 0.04, color, drag: 0.6 });
    }
  }

  // Faíscas soltas num ponto (pegar o mago, erro).
  sparkle(p, { color = [0.6, 0.85, 2.4], count = 26, speed = 1.4, size = 0.05 } = {}) {
    for (let i = 0; i < count; i++) {
      const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, s = speed * (0.4 + Math.random() * 0.6);
      const k = Math.sqrt(1 - u * u);
      this.spawn({ p: [p.x, p.y, p.z], v: [k * Math.cos(a) * s, u * s, k * Math.sin(a) * s],
        life: 0.35 + Math.random() * 0.35, size: size * (0.6 + Math.random() * 0.8), color, drag: 3 });
    }
  }

  get liveCount() { let n = 0; for (let i = 0; i < MAX; i++) if (this.life[i] > 0) n++; return n; }

  update(dt) {
    const h = this.engine.renderer.getDrawingBufferSize(this._sz || (this._sz = new THREE.Vector2())).y;
    this.material.uniforms.uScale.value = h * this.engine.camera.projectionMatrix.elements[5] * 0.5;
    for (let i = 0; i < MAX; i++) {
      if (this.life[i] <= 0) { this.alpha[i] = 0; continue; }
      this.life[i] -= dt;
      const k = i * 3, d = Math.exp(-this.drag[i] * dt);
      this.vel[k] *= d; this.vel[k + 1] = this.vel[k + 1] * d + this.grav[i] * dt; this.vel[k + 2] *= d;
      this.pos[k] += this.vel[k] * dt; this.pos[k + 1] += this.vel[k + 1] * dt; this.pos[k + 2] += this.vel[k + 2] * dt;
      if (this.pos[k + 1] < 0.02) { this.pos[k + 1] = 0.02; this.vel[k + 1] *= -0.3; }
      const u = Math.max(0, this.life[i] / this.span[i]); // 1 -> 0
      const fade = Math.min(1, u * 3) * Math.min(1, (1 - u) * 12 + 0.2);
      this.alpha[i] = fade;
      this.size[i] = this.size0[i] * (0.6 + 0.4 * u);
      this.tint[k] = this.end[k] + (this.base[k] - this.end[k]) * u;
      this.tint[k + 1] = this.end[k + 1] + (this.base[k + 1] - this.end[k + 1]) * u;
      this.tint[k + 2] = this.end[k + 2] + (this.base[k + 2] - this.end[k + 2]) * u;
    }
    const g = this.points.geometry.attributes;
    g.position.needsUpdate = g.tint.needsUpdate = g.size.needsUpdate = g.alpha.needsUpdate = true;

    for (const r of this.rings) {
      if (!r.mesh.visible) continue;
      r.t += dt;
      const u = Math.min(1, r.t / r.duration);
      const e = 1 - (1 - u) ** 3;
      r.mesh.scale.setScalar(0.15 + r.radius * e);
      const a = (1 - u) ** 1.5 * 0.8;
      r.mesh.material.color.setRGB(r.color[0] * a, r.color[1] * a, r.color[2] * a);
      if (u >= 1) r.mesh.visible = false;
    }
  }
}
