// Parede de Chamas: em cada casa, duas lâminas de fogo cruzadas (shader com ruído subindo), chamas e brasas
// soltas, fumaça e a casa acesa no chão (perigosa). Uma luz alaranjada tremeluz no meio da parede enquanto
// ela existe. As chamas vêm de uma reserva: acender e apagar não cria objetos novos.
import * as THREE from 'three';
import { NOISE } from './glsl.js';

const VERT = /* glsl */`
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
const FRAG = /* glsl */`
  uniform float uTime; uniform float uSeed; uniform float uK;
  varying vec2 vUv;
  ${NOISE}
  void main() {
    vec2 uv = vUv;
    float n = fbm(vec3(uv.x * 3.2 + uSeed, uv.y * 2.4 - uTime * 2.6, uSeed + uTime * 0.3));
    float n2 = fbm(vec3(uv.x * 7.0 - uSeed, uv.y * 1.6 - uTime * 3.6, uSeed * 2.0));   // línguas de fogo
    float side = 1.0 - pow(abs(uv.x - 0.5) * 2.0, 1.5);                               // mais forte no meio da lâmina
    float h = uv.y + (n * 0.6 + n2 * 0.4 - 0.5) * 0.7;                                // borda de cima recortada
    float body = (1.0 - smoothstep(0.3, 0.92, h)) * side * smoothstep(0.0, 0.1, uv.y);
    float heat = clamp(body * (0.5 + n * 0.9), 0.0, 1.0) * uK;
    vec3 col = mix(vec3(0.55, 0.05, 0.01), vec3(1.5, 0.5, 0.08), smoothstep(0.2, 0.6, heat));
    col = mix(col, vec3(1.8, 1.2, 0.5), smoothstep(0.82, 1.0, heat));
    float a = smoothstep(0.15, 0.6, heat) * 0.7;
    gl_FragColor = vec4(col * a, a);
  }
`;

export class FireWallFx {
  constructor(sfx) {
    this.sfx = sfx;
    this.planeGeo = new THREE.PlaneGeometry(0.98, 1.55).translate(0, 0.74, 0);
    this.tileGeo = new THREE.PlaneGeometry(0.9, 0.9).rotateX(-Math.PI / 2);
    this.flames = [];          // reserva
    this.byHazard = new Map(); // perigo -> chama
    this.groups = new Map();   // parede -> { light, tiles }
  }

  make() {
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uSeed: { value: Math.random() * 10 }, uK: { value: 0 } },
      vertexShader: VERT, fragmentShader: FRAG,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
      transparent: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide,
    });
    const group = new THREE.Group();
    const a = new THREE.Mesh(this.planeGeo, mat), b = new THREE.Mesh(this.planeGeo, mat);
    b.rotation.y = Math.PI / 2;
    a.renderOrder = b.renderOrder = 6;
    const tileMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0, 0, 0), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    const tile = new THREE.Mesh(this.tileGeo, tileMat);
    tile.position.y = 0.015;
    group.add(a, b, tile);
    this.sfx.group.add(group);
    return { group, mat, tileMat, busy: false };
  }

  // Acende a chama da casa do perigo. delay: as casas acendem uma depois da outra.
  ignite(hazard, x, z, delay = 0) {
    let f = this.flames.find(o => !o.busy);
    if (!f) { f = this.make(); this.flames.push(f); }
    Object.assign(f, { busy: true, hazard, t: -delay, out: -1, acc: 0, x, z });
    f.group.position.set(x, 0, z);
    f.group.scale.set(1, 0.001, 1);
    f.group.visible = true;
    this.byHazard.set(hazard, f);
    const g = this.groups.get(hazard.group) || { tiles: new Set(), light: null, x: 0, z: 0 };
    g.tiles.add(f);
    if (!g.light) { g.light = this.sfx.lights.acquire({ color: '#ff7a2a', intensity: 0, distance: 6 }); g.gen = g.light && g.light.gen; }
    let sx = 0, sz = 0; for (const t of g.tiles) { sx += t.x; sz += t.z; }
    g.x = sx / g.tiles.size; g.z = sz / g.tiles.size;
    if (this.sfx.lights.owns(g.light, g.gen)) g.light.light.position.set(g.x, 0.9, g.z);
    this.groups.set(hazard.group, g);
    return f;
  }

  extinguish(hazard) {
    const f = this.byHazard.get(hazard);
    if (!f) return;
    this.byHazard.delete(hazard);
    f.out = 0;
  }

  update(dt) {
    const fx = this.sfx.fx, time = this.sfx.time;
    for (const f of this.flames) {
      if (!f.busy) continue;
      f.t += dt;
      if (f.t < 0) continue;
      let k = Math.min(1, f.t / 0.3);                           // sobe
      if (f.out >= 0) { f.out += dt; k *= Math.max(0, 1 - f.out / 0.5); } // apaga
      const flick = 0.92 + 0.08 * Math.sin(time * 17 + f.x * 3) + 0.05 * Math.sin(time * 31 + f.z);
      f.group.scale.set(1, Math.max(0.001, k * flick), 1);
      f.mat.uniforms.uTime.value = time;
      f.mat.uniforms.uK.value = k;
      const pulse = (0.55 + 0.2 * Math.sin(time * 5 + f.x)) * k;
      f.tileMat.color.setRGB(0.55 * pulse, 0.16 * pulse, 0.03 * pulse); // casa perigosa acesa no chão
      // chamas soltas, brasas flutuando e fumaça
      f.acc += dt * 26 * this.sfx.density * k;
      while (f.acc >= 1) {
        f.acc -= 1;
        const r = Math.random();
        const px = f.x + (Math.random() - 0.5) * 0.8, pz = f.z + (Math.random() - 0.5) * 0.8;
        if (r < 0.55) fx.spawn({ p: [px, 0.1, pz], v: [0, 1.2 + Math.random() * 1.2, 0], life: 0.35 + Math.random() * 0.3, size: 0.12 + Math.random() * 0.1, color: [1.6, 0.6, 0.12], color2: [0.4, 0.03, 0.01], drag: 1.2, gravity: 0.8 });
        else if (r < 0.8) fx.spawn({ p: [px, 0.4 + Math.random() * 0.8, pz], v: [(Math.random() - 0.5) * 0.4, 0.5 + Math.random() * 0.6, (Math.random() - 0.5) * 0.4], life: 1.2 + Math.random() * 1, size: 0.03, color: [3, 1.8, 0.6], color2: [1.2, 0.2, 0.05], drag: 0.6, gravity: 0.1 });
        else fx.spawn({ p: [px, 1.2 + Math.random() * 0.4, pz], v: [(Math.random() - 0.5) * 0.2, 0.5 + Math.random() * 0.4, (Math.random() - 0.5) * 0.2], life: 1.5 + Math.random(), size: 0.5 + Math.random() * 0.3, color: [0.14, 0.09, 0.07], color2: [0.02, 0.02, 0.025], drag: 0.8 });
      }
      if (f.out >= 0.5) {
        f.busy = false; f.group.visible = false;
        for (const [id, g] of this.groups) if (g.tiles.delete(f) && !g.tiles.size) { this.sfx.lights.release(g.light, g.gen); this.groups.delete(id); }
      }
    }
    for (const g of this.groups.values()) {
      if (!this.sfx.lights.owns(g.light, g.gen)) continue;
      let k = 0; for (const f of g.tiles) k = Math.max(k, f.t > 0 ? Math.min(1, f.t / 0.3) * (f.out >= 0 ? Math.max(0, 1 - f.out / 0.5) : 1) : 0);
      g.light.light.intensity = k * (3.5 + 1.2 * Math.sin(time * 13) + 0.8 * Math.sin(time * 23));
    }
  }
}
