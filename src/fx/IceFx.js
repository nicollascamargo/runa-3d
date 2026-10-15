// Efeitos de gelo: cristais crescendo em volta da mão, a lança, estilhaços e névoa no impacto, e a prisão
// de cristais gigantes que brota do chão e se quebra quando o efeito acaba.
// Tudo vem de reservas: os mesmos cristais e prisões são reaproveitados a cada lançamento.
import * as THREE from 'three';
import { crystalGeometry } from '../character/Staff.js';

const ICE_COLOR = [0.55, 1.4, 2.8];
export const ICE_LIMITS = { small: 12, spears: 2, shards: 30 }; // teto das reservas

export class IceFx {
  constructor(sfx) {
    this.sfx = sfx; // SpellFx: partículas, luzes, grupo, densidade
    this.mat = new THREE.MeshStandardMaterial({ color: '#cfeeff', emissive: '#3aa0ff', emissiveIntensity: 0.9, roughness: 0.12, metalness: 0, transparent: true, opacity: 0.9 });
    this.smallGeo = crystalGeometry(0.16, 0.03);
    this.spearGeo = crystalGeometry(0.9, 0.055, 0.22).rotateX(Math.PI / 2); // deitada: aponta para +Z
    this.bigGeo = crystalGeometry(1.1, 0.13, 0.3);
    this.shardGeo = crystalGeometry(0.1, 0.022);
    this.small = []; this.spears = []; this.shards = []; this.prisons = [];
  }

  mesh(geo) { const m = new THREE.Mesh(geo, this.mat); m.castShadow = false; this.sfx.group.add(m); return m; }

  // ---------- cristais em volta da mão ----------
  // Um anel de cristais que crescem devagar e giram em volta de 'center'. Devolve o anel; mexa em ring.grow (0 a 1).
  takeRing(count = 6) {
    const ring = { items: [], grow: 0, t: 0 };
    for (let i = 0; i < count; i++) {
      let m = this.small.find(o => !o.visible);
      if (!m) { if (this.small.length >= ICE_LIMITS.small) break; m = this.mesh(this.smallGeo); this.small.push(m); }
      m.visible = true;
      ring.items.push(m);
    }
    return ring;
  }

  updateRing(ring, center, dt) {
    ring.t += dt;
    ring.items.forEach((m, i) => {
      const a = ring.t * 1.6 + (i / ring.items.length) * Math.PI * 2, r = 0.2 + 0.05 * Math.sin(ring.t * 3 + i);
      m.position.set(center.x + Math.cos(a) * r, center.y + Math.sin(ring.t * 2 + i) * 0.06, center.z + Math.sin(a) * r);
      m.rotation.set(ring.t + i, a, 0.4);
      m.scale.setScalar(Math.max(0.001, ring.grow * (0.7 + 0.3 * Math.sin(i * 1.7))));
    });
    // partículas congelantes subindo devagar
    if (Math.random() < dt * 30 * this.sfx.density * ring.grow) {
      const a = Math.random() * Math.PI * 2;
      this.sfx.fx.spawn({ p: [center.x + Math.cos(a) * 0.25, center.y - 0.05, center.z + Math.sin(a) * 0.25], v: [0, 0.25 + Math.random() * 0.3, 0],
        life: 0.6 + Math.random() * 0.5, size: 0.04, color: [1.2, 2.2, 3.0], color2: [0.2, 0.5, 1.2], drag: 1 });
    }
  }

  freeRing(ring) { for (const m of ring.items) m.visible = false; ring.items.length = 0; }

  // ---------- lança ----------
  takeSpear() {
    let m = this.spears.find(o => !o.visible);
    if (!m) { m = this.spears.length >= ICE_LIMITS.spears ? this.spears[0] : this.mesh(this.spearGeo); if (!this.spears.includes(m)) this.spears.push(m); }
    m.visible = true;
    m.scale.set(1, 1, 0.001);
    return m;
  }

  freeSpear(m) { if (m) m.visible = false; }

  // Rastro frio da lança em voo.
  trail(p, dt) {
    const n = Math.round(dt * 160 * this.sfx.density);
    for (let i = 0; i < n; i++) {
      this.sfx.fx.spawn({ p: [p.x + (Math.random() - 0.5) * 0.08, p.y + (Math.random() - 0.5) * 0.08, p.z + (Math.random() - 0.5) * 0.08], v: [(Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.3],
        life: 0.3 + Math.random() * 0.3, size: 0.05 + Math.random() * 0.05, color: [1.5, 2.4, 3.2], color2: [0.15, 0.35, 0.8], drag: 2.5 });
    }
  }

  // ---------- impacto ----------
  impact(pos, { scale = 1 } = {}) {
    const fx = this.sfx.fx, n = k => this.sfx.count(k * scale);
    for (let i = 0; i < n(80); i++) { // partículas congelantes
      const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, k = Math.sqrt(1 - u * u), sp = 1 + Math.random() * 3;
      fx.spawn({ p: [pos.x, pos.y, pos.z], v: [k * Math.cos(a) * sp, Math.abs(u) * sp, k * Math.sin(a) * sp],
        life: 0.4 + Math.random() * 0.4, size: 0.05 + Math.random() * 0.05, color: [1.6, 2.6, 3.4], color2: [0.2, 0.5, 1.4], drag: 3, gravity: -3 });
    }
    for (let i = 0; i < n(18); i++) { // névoa fria rasteira
      const a = Math.random() * Math.PI * 2, r = Math.random() * 0.5;
      fx.spawn({ p: [pos.x + Math.cos(a) * r, 0.15, pos.z + Math.sin(a) * r], v: [Math.cos(a) * 0.6, 0.12, Math.sin(a) * 0.6],
        life: 1.2 + Math.random() * 0.8, size: 0.5 + Math.random() * 0.4, color: [0.28, 0.42, 0.6], color2: [0.03, 0.05, 0.09], drag: 1.4 });
    }
    // estilhaços de verdade: cristais pequenos voando e caindo
    for (let i = 0; i < Math.round(10 * scale); i++) {
      let s = this.shards.find(o => !o.mesh.visible);
      if (!s) { if (this.shards.length >= ICE_LIMITS.shards) break; s = { mesh: this.mesh(this.shardGeo) }; this.shards.push(s); }
      const a = Math.random() * Math.PI * 2, sp = 1.5 + Math.random() * 2.5;
      Object.assign(s, { v: new THREE.Vector3(Math.cos(a) * sp, 1.5 + Math.random() * 2.5, Math.sin(a) * sp), spin: new THREE.Vector3(Math.random() * 9, Math.random() * 9, Math.random() * 9), t: 0, life: 0.9 + Math.random() * 0.5 });
      s.mesh.position.copy(pos);
      s.mesh.scale.setScalar(0.7 + Math.random() * 0.8);
      s.mesh.visible = true;
    }
    fx.shockwave(pos.x, pos.z, { color: ICE_COLOR, radius: 1.1 * scale, duration: 0.5 });
    this.sfx.lights.acquire({ color: '#7cc8ff', intensity: 22 * scale, distance: 7, duration: 0.5, position: new THREE.Vector3(pos.x, pos.y + 0.3, pos.z) });
  }

  // ---------- prisão glacial ----------
  // Cristais gigantes em volta do alvo, brotando do chão. Fica até shatterPrison().
  makePrison(pos) {
    let pr = this.prisons.find(o => !o.busy);
    if (!pr) {
      pr = { group: new THREE.Group(), crystals: [] };
      for (let i = 0; i < 7; i++) { const m = new THREE.Mesh(this.bigGeo, this.mat); pr.group.add(m); pr.crystals.push(m); }
      this.sfx.group.add(pr.group);
      this.prisons.push(pr);
    }
    Object.assign(pr, { busy: true, t: 0, breaking: -1 });
    pr.group.position.set(pos.x, 0, pos.z);
    pr.group.visible = true;
    pr.crystals.forEach((m, i) => {
      const a = (i / pr.crystals.length) * Math.PI * 2 + Math.random() * 0.3, r = 0.3 + Math.random() * 0.06;
      m.userData = { a, r, h: 0.75 + Math.random() * 0.55, tilt: 0.25 + Math.random() * 0.2, delay: i * 0.035 };
      m.scale.setScalar(0.001);
    });
    for (let i = 0; i < this.sfx.count(40); i++) { // névoa gelada e partículas azuis
      const a = Math.random() * Math.PI * 2, r = 0.2 + Math.random() * 0.4;
      this.sfx.fx.spawn({ p: [pos.x + Math.cos(a) * r, 0.1, pos.z + Math.sin(a) * r], v: [Math.cos(a) * 0.4, 0.5 + Math.random() * 1.2, Math.sin(a) * 0.4],
        life: 0.6 + Math.random() * 0.6, size: 0.06 + Math.random() * 0.06, color: [1.4, 2.4, 3.2], color2: [0.2, 0.4, 1], drag: 2 });
    }
    return pr;
  }

  // Quebra a prisão: os cristais estouram em estilhaços e somem.
  shatterPrison(pr) {
    if (!pr || !pr.busy || pr.breaking >= 0) return;
    pr.breaking = 0;
    const p = pr.group.position;
    this.impact(new THREE.Vector3(p.x, 0.6, p.z), { scale: 0.8 });
  }

  update(dt) {
    for (const s of this.shards) {
      if (!s.mesh.visible) continue;
      s.t += dt;
      s.v.y -= 9 * dt;
      s.mesh.position.addScaledVector(s.v, dt);
      if (s.mesh.position.y < 0.03) { s.mesh.position.y = 0.03; s.v.multiplyScalar(0.4); s.v.y = Math.abs(s.v.y) * 0.3; }
      s.mesh.rotation.x += s.spin.x * dt; s.mesh.rotation.y += s.spin.y * dt; s.mesh.rotation.z += s.spin.z * dt;
      if (s.t > s.life) s.mesh.visible = false;
    }
    for (const pr of this.prisons) {
      if (!pr.busy) continue;
      pr.t += dt;
      const breaking = pr.breaking >= 0;
      if (breaking) pr.breaking += dt;
      pr.crystals.forEach(m => {
        const d = m.userData;
        let g = Math.min(1, Math.max(0, (pr.t - d.delay) / 0.4));
        g = 1 - (1 - g) ** 3 + Math.sin(Math.min(1, g) * Math.PI) * 0.12; // passa um pouco e assenta
        if (breaking) g *= Math.max(0, 1 - pr.breaking / 0.25);
        m.scale.set(g, g * d.h, g);
        m.position.set(Math.cos(d.a) * d.r, d.h * 0.42 * g, Math.sin(d.a) * d.r);
        m.rotation.set(Math.sin(d.a) * d.tilt, d.a, -Math.cos(d.a) * d.tilt);
      });
      if (breaking && pr.breaking > 0.3) { pr.busy = false; pr.group.visible = false; }
    }
  }
}
