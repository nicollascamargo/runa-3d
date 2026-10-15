// Marcadores da seleção de alvo, no chão do tabuleiro:
//   alcance: contorno suave nas casas que a magia alcança;
//   área: as casas que a magia vai atingir, na cor do elemento, pulsando;
//   mira: anel girando sobre o alvo (mais forte e com cantos fechados quando o alvo está travado);
//   X vermelho: a casa apontada não serve, com o motivo no painel.
import * as THREE from 'three';

const ELEMENT_RGB = { fogo: [2.6, 0.85, 0.2], gelo: [0.45, 1.3, 2.6], raio: [1.4, 1.0, 2.8], terra: [2.2, 1.5, 0.45], mover: [0.5, 1.9, 1.2] };

export class TargetMarkers {
  constructor(board) {
    this.board = board;
    const g = (this.group = new THREE.Group());
    g.name = 'MarcadoresDeAlvo';
    g.visible = false;
    board.group.add(g);
    const add = (mat, geo, max) => { const m = new THREE.InstancedMesh(geo, mat, max); m.count = 0; m.frustumCulled = false; g.add(m); return m; };
    const additive = o => new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, color: new THREE.Color(1, 1, 1), ...o });
    this.rangeMat = additive({ opacity: 0.35 });
    this.range = add(this.rangeMat, new THREE.RingGeometry(0.6, 0.64, 4, 1, Math.PI / 4).rotateX(-Math.PI / 2), 64);
    this.range.position.y = 0.011;
    this.areaMat = additive({ opacity: 0.32 });
    this.area = add(this.areaMat, new THREE.PlaneGeometry(0.9, 0.9).rotateX(-Math.PI / 2), 64);
    this.area.position.y = 0.013;
    this.areaEdgeMat = additive({ opacity: 0.9 });
    this.areaEdge = add(this.areaEdgeMat, new THREE.RingGeometry(0.58, 0.66, 4, 1, Math.PI / 4).rotateX(-Math.PI / 2), 64);
    this.areaEdge.position.y = 0.014;

    this.reticle = new THREE.Group();
    this.reticleMat = additive({ opacity: 1 });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.36, 0.42, 48).rotateX(-Math.PI / 2), this.reticleMat);
    this.reticle.add(ring);
    this.ticks = new THREE.Group();
    for (let i = 0; i < 4; i++) {
      const tri = new THREE.Mesh(new THREE.CircleGeometry(0.09, 3).rotateX(-Math.PI / 2), this.reticleMat);
      const a = (i * Math.PI) / 2;
      tri.rotation.y = a + Math.PI;
      tri.userData.a = a;
      this.ticks.add(tri);
    }
    this.reticle.add(this.ticks);
    this.reticle.position.y = 0.02;
    g.add(this.reticle);

    this.xMat = additive({ color: new THREE.Color(2.4, 0.2, 0.12), opacity: 0.9 });
    this.cross = new THREE.Group();
    for (const r of [Math.PI / 4, -Math.PI / 4]) { const bar = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.07).rotateX(-Math.PI / 2), this.xMat); bar.rotation.y = r; this.cross.add(bar); }
    this.cross.position.y = 0.02;
    g.add(this.cross);

    this.state = { locked: false, lockT: 0, color: ELEMENT_RGB.fogo, valid: false };
    this._m = new THREE.Matrix4();
  }

  fill(mesh, tiles) {
    mesh.count = tiles.length;
    tiles.forEach((t, i) => { const [x, z] = this.board.tileCenter(t.col, t.row); mesh.setMatrixAt(i, this._m.makeTranslation(x, 0, z)); });
    mesh.instanceMatrix.needsUpdate = true;
  }

  // range/area: listas de casas. target: casa da mira (ou null). valid: a mira é um alvo possível.
  show({ element = 'fogo', range = [], area = [], target = null, valid = false, locked = false }) {
    this.group.visible = true;
    const c = ELEMENT_RGB[element] || ELEMENT_RGB.fogo;
    this.state.color = c;
    this.fill(this.range, range);
    this.fill(this.area, valid ? area : []);
    this.fill(this.areaEdge, valid ? area : []);
    if (locked && !this.state.locked) this.state.lockT = 0;
    this.state.locked = locked;
    this.state.valid = valid;
    this.reticle.visible = !!target && valid;
    this.cross.visible = !!target && !valid;
    if (target) {
      const [x, z] = this.board.tileCenter(target.col, target.row);
      this.reticle.position.x = this.cross.position.x = x;
      this.reticle.position.z = this.cross.position.z = z;
    }
  }

  hide() { this.group.visible = false; this.state.locked = false; }

  update(dt, t) {
    if (!this.group.visible) return;
    const [r, g, b] = this.state.color, st = this.state;
    const pulse = 0.75 + 0.25 * Math.sin(t * 5);
    this.rangeMat.color.setRGB(r * 0.12, g * 0.12, b * 0.12);
    this.areaMat.color.setRGB(r * 0.22 * pulse, g * 0.22 * pulse, b * 0.22 * pulse);
    this.areaEdgeMat.color.setRGB(r * 0.6 * pulse, g * 0.6 * pulse, b * 0.6 * pulse);
    st.lockT += dt;
    const lock = st.locked ? 1 - Math.exp(-st.lockT * 12) : 0;
    const k = st.locked ? 1.3 : 0.8 * pulse;
    this.reticleMat.color.setRGB(r * k, g * k, b * k);
    this.reticle.rotation.y += dt * (st.locked ? 0.6 : 1.8);
    const s = st.locked ? 1 - 0.18 * lock : 1 + 0.06 * Math.sin(t * 6);
    this.reticle.scale.setScalar(s);
    for (const tri of this.ticks.children) { const d = 0.56 - 0.12 * lock; tri.position.set(Math.sin(tri.userData.a) * d, 0, Math.cos(tri.userData.a) * d); }
    this.xMat.opacity = 0.65 + 0.3 * Math.sin(t * 7);
  }
}
