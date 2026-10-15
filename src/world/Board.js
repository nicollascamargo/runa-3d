// Tabuleiro tático 8×8: lajes de pedra com bordas gastas, moldura com runas acesas
// e a marcação da casa sob o cursor. Casa (col, linha) vai de (0, 0) a (7, 7).
import * as THREE from 'three';
import { stoneTextures, runeStripTexture } from '../fx/textures.js';
import { rng } from '../fx/random.js';

export const SIZE = 8;

export class Board {
  constructor(scene) {
    this.group = new THREE.Group();
    this.group.name = 'Tabuleiro';
    scene.add(this.group);
    this.tiles = [];
    this.buildTiles();
    this.buildFrame();
    this.buildMarkers();
    this.buildDestination();
  }

  tileCenter(col, row) { return [col - (SIZE - 1) / 2, row - (SIZE - 1) / 2]; }

  tileAt(x, z) {
    const col = Math.floor(x + SIZE / 2), row = Math.floor(z + SIZE / 2);
    return col >= 0 && row >= 0 && col < SIZE && row < SIZE ? { col, row } : null;
  }

  buildTiles() {
    // laje com bisel: um retângulo arredondado extrudado para baixo
    const s = 0.47, r = 0.05;
    const shape = new THREE.Shape();
    shape.moveTo(-s + r, -s);
    shape.lineTo(s - r, -s); shape.quadraticCurveTo(s, -s, s, -s + r);
    shape.lineTo(s, s - r); shape.quadraticCurveTo(s, s, s - r, s);
    shape.lineTo(-s + r, s); shape.quadraticCurveTo(-s, s, -s, s - r);
    shape.lineTo(-s, -s + r); shape.quadraticCurveTo(-s, -s, -s + r, -s);
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.16, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.022, bevelSegments: 3, curveSegments: 4 });
    geo.rotateX(-Math.PI / 2);
    geo.translate(0, -0.185, 0);
    // textura projetada de cima: a face de cima recebe a laje inteira
    const pos = geo.attributes.position, uv = geo.attributes.uv;
    for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / 1.0 + 0.5, pos.getZ(i) / 1.0 + 0.5);
    geo.computeVertexNormals();

    const r0 = rng(12);
    const variants = [0, 1, 2, 3].map(v => {
      const t = stoneTextures(v);
      return new THREE.MeshStandardMaterial({ map: t.map, normalMap: t.normal, roughnessMap: t.orm, roughness: 1, metalness: 0, normalScale: new THREE.Vector2(1.1, 1.1) });
    });
    const counts = [0, 0, 0, 0];
    const assign = [];
    for (let row = 0; row < SIZE; row++) for (let col = 0; col < SIZE; col++) {
      const v = Math.floor(r0() * 4);
      assign.push({ col, row, v, rot: Math.floor(r0() * 4), dy: (r0() - 0.5) * 0.012, tilt: (r0() - 0.5) * 0.01 });
      counts[v]++;
    }
    const meshes = variants.map((m, v) => {
      const im = new THREE.InstancedMesh(geo, m, counts[v]);
      im.receiveShadow = true;
      im.castShadow = true;
      im.name = `Lajes${v}`;
      this.group.add(im);
      return im;
    });
    const used = [0, 0, 0, 0];
    const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    for (const a of assign) {
      const [x, z] = this.tileCenter(a.col, a.row);
      e.set(a.tilt, (a.rot * Math.PI) / 2, -a.tilt);
      mtx.compose(new THREE.Vector3(x, a.dy, z), q.setFromEuler(e), new THREE.Vector3(1, 1, 1));
      meshes[a.v].setMatrixAt(used[a.v]++, mtx);
      this.tiles.push(a);
    }
    meshes.forEach(m => { m.instanceMatrix.needsUpdate = true; });
    this.tileMeshes = meshes;

    // rejunte escuro por baixo das lajes
    const grout = new THREE.Mesh(new THREE.BoxGeometry(SIZE + 0.1, 0.2, SIZE + 0.1), new THREE.MeshStandardMaterial({ color: '#07080d', roughness: 1 }));
    grout.position.y = -0.14;
    grout.receiveShadow = true;
    this.group.add(grout);
  }

  buildFrame() {
    const t = stoneTextures(1, 512);
    const mat = new THREE.MeshStandardMaterial({ map: t.map, normalMap: t.normal, roughness: 0.92, color: '#9aa0b4' });
    t.map.repeat.set(6, 1);
    t.normal.repeat.set(6, 1);
    const w = 0.42, h = 0.24, L = SIZE + w * 2;
    const runes = runeStripTexture(24, 33);
    this.runeMat = new THREE.MeshBasicMaterial({ map: runes, color: new THREE.Color(0.25, 0.65, 1.6), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    for (let i = 0; i < 4; i++) {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(L, h, w), mat);
      const a = (i * Math.PI) / 2;
      const off = SIZE / 2 + w / 2;
      beam.position.set(Math.sin(a) * off, -0.08, Math.cos(a) * off);
      beam.rotation.y = a;
      beam.castShadow = beam.receiveShadow = true;
      this.group.add(beam);
      const strip = new THREE.Mesh(new THREE.PlaneGeometry(SIZE - 0.4, w * 0.62), this.runeMat);
      strip.rotation.set(-Math.PI / 2, 0, a);
      strip.position.set(Math.sin(a) * off, 0.042, Math.cos(a) * off);
      this.group.add(strip);
    }
    // pedras de canto
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const c = new THREE.Mesh(new THREE.BoxGeometry(w * 1.25, h * 1.6, w * 1.25), mat);
      c.position.set(sx * (SIZE / 2 + w / 2), -0.02, sz * (SIZE / 2 + w / 2));
      c.castShadow = c.receiveShadow = true;
      this.group.add(c);
    }
  }

  buildMarkers() {
    // casa sob o cursor: moldura de luz azul que pulsa
    const ring = new THREE.RingGeometry(0.62, 0.68, 4, 1, Math.PI / 4).rotateX(-Math.PI / 2);
    this.hoverMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.35, 0.8, 2.0), transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false });
    this.hover = new THREE.Mesh(ring, this.hoverMat);
    this.hover.visible = false;
    this.hover.position.y = 0.012;
    this.group.add(this.hover);
    const fill = new THREE.PlaneGeometry(0.92, 0.92).rotateX(-Math.PI / 2);
    this.hoverFill = new THREE.Mesh(fill, new THREE.MeshBasicMaterial({ color: '#3d7dff', transparent: true, opacity: 0.12, depthWrite: false }));
    this.hover.add(this.hoverFill);
  }

  // Marcadores da telecinese: a casa onde o mago vai pousar (válida ou não) e as casas ocupadas.
  buildDestination() {
    const g = (this.dest = new THREE.Group());
    g.visible = false;
    g.position.y = 0.016;
    this.group.add(g);
    this.destMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 1, 1), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    this.destFillMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 1, 1), transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    this.destSquare = new THREE.Mesh(new THREE.RingGeometry(0.58, 0.68, 4, 1, Math.PI / 4).rotateX(-Math.PI / 2), this.destMat);
    this.destFill = new THREE.Mesh(new THREE.PlaneGeometry(0.88, 0.88).rotateX(-Math.PI / 2), this.destFillMat);
    // cantos que "fecham" sobre a casa
    this.destCorners = new THREE.Group();
    for (let i = 0; i < 4; i++) {
      const c = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.05).rotateX(-Math.PI / 2), this.destMat);
      const c2 = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.2).rotateX(-Math.PI / 2), this.destMat);
      const a = (i * Math.PI) / 2;
      const k = new THREE.Group();
      c.position.set(0.075, 0, 0); c2.position.set(0, 0, 0.075);
      k.add(c, c2);
      k.rotation.y = a;
      k.userData.dir = new THREE.Vector3(Math.sin(a + Math.PI / 4), 0, Math.cos(a + Math.PI / 4));
      this.destCorners.add(k);
    }
    // X de casa proibida
    this.destX = new THREE.Group();
    for (const r of [Math.PI / 4, -Math.PI / 4]) {
      const bar = new THREE.Mesh(new THREE.PlaneGeometry(0.75, 0.07).rotateX(-Math.PI / 2), this.destMat);
      bar.rotation.y = r;
      this.destX.add(bar);
    }
    g.add(this.destFill, this.destSquare, this.destCorners, this.destX);
    // casas ocupadas, marcadas de leve enquanto o mago está no ar
    this.blockedMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.9, 0.12, 0.08), transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    this.blocked = new THREE.InstancedMesh(new THREE.RingGeometry(0.56, 0.64, 4, 1, Math.PI / 4).rotateX(-Math.PI / 2), this.blockedMat, SIZE * SIZE);
    this.blocked.count = 0;
    this.blocked.position.y = 0.013;
    this.group.add(this.blocked);
    this.destState = { valid: true, t: 0 };
  }

  // tile: casa (ou null); valid: pode pousar; point: ponto no chão quando está fora do tabuleiro; homing: voo automático.
  setDestination(tile, valid = true, point = null, homing = false) {
    if (!this.dest) this.buildDestination();
    const g = this.dest;
    if (!tile && !point) { g.visible = false; this.destKey = ''; return; }
    g.visible = true;
    if (tile) { const [x, z] = this.tileCenter(tile.col, tile.row); g.position.x = x; g.position.z = z; }
    else { g.position.x = point.x; g.position.z = point.z; }
    const key = tile ? `${tile.col},${tile.row},${valid}` : `out,${valid}`;
    if (key !== this.destKey) { this.destKey = key; this.destState.t = 0; }
    this.destState.valid = valid;
    this.destState.homing = homing;
    this.destState.onBoard = !!tile;
    this.destX.visible = !valid;
    this.destSquare.visible = !!tile;
    this.destFill.visible = !!tile;
  }

  showBlocked(tiles) {
    if (!this.dest) this.buildDestination();
    const m = new THREE.Matrix4();
    this.blocked.count = tiles ? tiles.length : 0;
    (tiles || []).forEach((t, i) => { const [x, z] = this.tileCenter(t.col, t.row); this.blocked.setMatrixAt(i, m.makeTranslation(x, 0, z)); });
    this.blocked.instanceMatrix.needsUpdate = true;
  }

  updateDestination(dt, t) {
    if (!this.dest) return;
    const st = this.destState;
    st.t += dt;
    if (this.dest.visible) {
      const pulse = 0.8 + 0.2 * Math.sin(t * 6);
      if (st.valid) {
        const c = st.homing ? [1.2, 0.85, 0.35] : [0.35, 0.7, 1.6];
        this.destMat.color.setRGB(c[0] * pulse, c[1] * pulse, c[2] * pulse);
        this.destFillMat.color.setRGB(c[0] * 0.25, c[1] * 0.25, c[2] * 0.25);
      } else {
        this.destMat.color.setRGB(2.4 * pulse, 0.22 * pulse, 0.12 * pulse);
        this.destFillMat.color.setRGB(0.55, 0.04, 0.02);
      }
      // os cantos chegam de fora para dentro quando a casa muda
      const e = 1 - Math.exp(-st.t * 14);
      for (const k of this.destCorners.children) k.position.copy(k.userData.dir).multiplyScalar(0.62 + (1 - e) * 0.35);
      this.destCorners.visible = st.onBoard && st.valid;
      this.destSquare.scale.setScalar(1 + (1 - e) * 0.15);
    }
    this.blockedMat.opacity = this.blocked.count ? 0.5 + 0.25 * Math.sin(t * 4) : 0;
  }

  setHover(tile) {
    this.hover.visible = !!tile;
    if (tile) {
      const [x, z] = this.tileCenter(tile.col, tile.row);
      this.hover.position.x = x;
      this.hover.position.z = z;
    }
    this.hovered = tile;
  }

  update(dt, t) {
    this.runeMat.color.setRGB(0.14 + 0.05 * Math.sin(t * 0.8), 0.38 + 0.1 * Math.sin(t * 0.8), 1.0 + 0.2 * Math.sin(t * 0.8));
    this.hoverMat.opacity = 0.6 + 0.3 * Math.sin(t * 5);
    this.updateDestination(dt, t);
  }
}
