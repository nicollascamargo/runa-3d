// Arena de testes: o tabuleiro dentro de uma caverna, com rochas, estalagmites, cristais que brilham,
// runas acesas no chão e nas paredes, luz de cinema, névoa e poeira flutuando.
import * as THREE from 'three';
import { ImprovedNoise } from 'three/addons/math/ImprovedNoise.js';
import { Board } from './Board.js';
import { rockTextures, runeCircleTexture, glyphTexture, softDotTexture, mistTexture } from '../fx/textures.js';
import { crystalGeometry } from '../character/Staff.js';
import { rng } from '../fx/random.js';

const TAU = Math.PI * 2;

export class Arena {
  constructor(engine) {
    this.engine = engine;
    this.scene = engine.scene;
    this.group = new THREE.Group();
    this.group.name = 'Arena';
    this.scene.add(this.group);
    this.r = rng(2024);
    this.noise = new ImprovedNoise();
    this.board = new Board(this.group);
    this.lights();
    this.floor();
    this.runeCircle();
    this.cave();
    this.crystals();
    this.wallRunes();
    this.dust();
    this.mist();
  }

  lights() {
    const g = this.group;
    g.add(new THREE.HemisphereLight('#1d2448', '#140a1e', 0.55));
    const key = (this.key = new THREE.DirectionalLight('#ece6ff', 2.2));
    key.position.set(-6, 12, 7);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    const sc = key.shadow.camera;
    sc.left = -7; sc.right = 7; sc.top = 7; sc.bottom = -7; sc.near = 1; sc.far = 40;
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.025;
    g.add(key);
    const rim = new THREE.DirectionalLight('#a066ff', 1.6);
    rim.position.set(6, 7, -9);
    g.add(rim);
    const fill = new THREE.DirectionalLight('#6a4cff', 0.4);
    fill.position.set(9, 4, 2);
    g.add(fill);
    // poço de luz sobre o tabuleiro: o centro mais claro, as bordas se perdem no escuro
    const spot = (this.spot = new THREE.SpotLight('#fff1e2', 55, 30, 0.42, 0.85, 1.6));
    spot.position.set(-2.5, 14, 3);
    spot.target.position.set(0, 0, 0);
    g.add(spot, spot.target);
  }

  floor() {
    const tex = rockTextures(9);
    tex.map.repeat.set(10, 10);
    tex.normal.repeat.set(10, 10);
    const geo = new THREE.PlaneGeometry(90, 90, 160, 160).rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const d = Math.hypot(x, z);
      const lift = THREE.MathUtils.smoothstep(d, 7, 22) * 2.2; // o chão sobe para as paredes
      const n = this.noise.noise(x * 0.18, 0.3, z * 0.18) * 0.35 + this.noise.noise(x * 0.6, 1.7, z * 0.6) * 0.08;
      pos.setY(i, -0.16 + n * THREE.MathUtils.smoothstep(d, 5.2, 8) + lift);
    }
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ map: tex.map, normalMap: tex.normal, roughness: 0.95, color: '#8a90a8' });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    mesh.name = 'ChaoDaCaverna';
    this.group.add(mesh);
  }

  runeCircle() {
    const tex = runeCircleTexture(1024);
    this.circleMat = new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(0.1, 0.26, 0.8), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    const circle = new THREE.Mesh(new THREE.PlaneGeometry(15.5, 15.5).rotateX(-Math.PI / 2), this.circleMat);
    circle.position.y = -0.135;
    circle.renderOrder = 1;
    this.circle = circle;
    this.group.add(circle);
  }

  rock(size, seed, squash = 0.7, detail = 3) {
    const geo = new THREE.IcosahedronGeometry(1, detail);
    const pos = geo.attributes.position, v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const n = this.noise.noise(v.x * 1.4 + seed, v.y * 1.4, v.z * 1.4 - seed) * 0.42 + this.noise.noise(v.x * 3.2 + seed, v.y * 3.2, v.z * 3.2) * 0.14;
      v.multiplyScalar(1 + n);
      v.y *= squash;
      pos.setXYZ(i, v.x * size, v.y * size, v.z * size);
    }
    geo.computeVertexNormals();
    return geo;
  }

  cave() {
    const tex = rockTextures(31);
    const mat = new THREE.MeshStandardMaterial({ map: tex.map, normalMap: tex.normal, roughness: 0.92, flatShading: true, color: '#7d849e' });
    const r = this.r;
    const place = (geo, x, y, z, ry) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.rotation.y = ry;
      m.castShadow = m.receiveShadow = true;
      this.group.add(m);
      return m;
    };
    this.rocks = [];
    // pedras soltas perto da arena
    for (let i = 0; i < 26; i++) {
      const a = r() * TAU, d = 7.4 + r() * 4.5, s = 0.35 + r() * 0.9;
      this.rocks.push(place(this.rock(s, i * 3.1, 0.55 + r() * 0.3), Math.cos(a) * d, -0.15 + s * 0.15, Math.sin(a) * d, r() * TAU));
    }
    // paredes: rochas grandes fechando o círculo
    for (let i = 0; i < 22; i++) {
      const a = (i / 22) * TAU + r() * 0.15, d = 15 + r() * 6, s = 3.5 + r() * 3.5;
      this.rocks.push(place(this.rock(s, 50 + i * 2.7, 1.1 + r() * 0.6, 3), Math.cos(a) * d, s * 0.35, Math.sin(a) * d, r() * TAU));
    }
    // estalagmites
    for (let i = 0; i < 18; i++) {
      const a = r() * TAU, d = 9 + r() * 7, h = 1.4 + r() * 3.8, rad = 0.25 + r() * 0.45;
      const geo = new THREE.ConeGeometry(rad, h, 9, 6).translate(0, h / 2, 0);
      const p = geo.attributes.position, v = new THREE.Vector3();
      for (let k = 0; k < p.count; k++) {
        v.fromBufferAttribute(p, k);
        const n = this.noise.noise(v.x * 3 + i, v.y * 1.5, v.z * 3) * 0.12 * (1 - v.y / h);
        p.setXYZ(k, v.x * (1 + n * 3), v.y, v.z * (1 + n * 3));
      }
      geo.computeVertexNormals();
      place(geo, Math.cos(a) * d, -0.2, Math.sin(a) * d, r() * TAU);
    }
  }

  crystals() {
    const r = this.r;
    this.crystalMats = [];
    const spots = [[-8.2, 3.5, '#8b5cff'], [7.8, -4.2, '#4d8dff'], [-5.5, -8.0, '#4d8dff'], [9.0, 5.5, '#a05cff'], [2.0, -9.6, '#8b5cff'], [-9.5, -2.8, '#4d8dff']];
    this.crystalLights = [];
    spots.forEach(([x, z, color], i) => {
      const mat = new THREE.MeshPhysicalMaterial({ color, emissive: color, emissiveIntensity: 1.3, roughness: 0.15, flatShading: true, clearcoat: 1 });
      this.crystalMats.push(mat);
      const cluster = new THREE.Group();
      const n = 5 + Math.floor(r() * 5);
      for (let k = 0; k < n; k++) {
        const h = 0.4 + r() * 1.1, rad = 0.07 + r() * 0.1;
        const m = new THREE.Mesh(crystalGeometry(h, rad, 0.22), mat);
        m.position.set((r() - 0.5) * 0.7, h * 0.35, (r() - 0.5) * 0.7);
        m.rotation.set((r() - 0.5) * 0.9, r() * TAU, (r() - 0.5) * 0.9);
        cluster.add(m);
      }
      cluster.position.set(x, -0.1, z);
      this.group.add(cluster);
      const light = new THREE.PointLight(color, 9, 9, 1.8);
      light.position.set(x, 1.2, z);
      this.group.add(light);
      this.crystalLights.push(light);
    });
  }

  wallRunes() {
    this.wallRuneMats = [];
    const spots = [[-12.5, 2.5, 5], [11.5, -6, 9], [-4, -14.5, 13], [13.5, 6.5, 17]];
    for (const [x, z, seed] of spots) {
      const mat = new THREE.MeshBasicMaterial({ map: glyphTexture(seed), color: new THREE.Color(0.3, 0.8, 2.2), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
      this.wallRuneMats.push(mat);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.3), mat);
      m.position.set(x, 2.2, z);
      m.lookAt(0, 2.2, 0);
      m.translateZ(1.4);
      this.group.add(m);
    }
  }

  dust() {
    const n = 520, r = this.r;
    const pos = new Float32Array(n * 3);
    this.dustSeed = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const a = r() * TAU, d = Math.sqrt(r()) * 11;
      pos[i * 3] = Math.cos(a) * d; pos[i * 3 + 1] = r() * 5; pos[i * 3 + 2] = Math.sin(a) * d;
      this.dustSeed[i] = r() * 100;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({ map: softDotTexture(), color: new THREE.Color(0.5, 0.75, 1.6), size: 0.07, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
    this.dustPoints = new THREE.Points(geo, mat);
    this.group.add(this.dustPoints);
  }

  mist() {
    const tex = mistTexture();
    this.mists = [];
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * TAU, d = 7.5 + (i % 3);
      const mat = new THREE.MeshBasicMaterial({ map: tex, color: '#5a6fb8', transparent: true, opacity: 0.22, depthWrite: false });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(9, 9).rotateX(-Math.PI / 2), mat);
      m.position.set(Math.cos(a) * d, 0.15 + (i % 3) * 0.12, Math.sin(a) * d);
      m.rotation.y = a;
      m.renderOrder = 2;
      this.group.add(m);
      this.mists.push(m);
    }
  }

  update(dt, t) {
    this.board.update(dt, t);
    this.circleMat.color.setRGB(0.09 + 0.03 * Math.sin(t * 0.6), 0.24 + 0.06 * Math.sin(t * 0.6), 0.75 + 0.15 * Math.sin(t * 0.6));
    this.circle.rotation.y += dt * 0.02;
    this.crystalLights.forEach((l, i) => { l.intensity = 8 + 1.6 * Math.sin(t * 1.3 + i * 1.7); });
    this.wallRuneMats.forEach((m, i) => { m.opacity = 0.65 + 0.35 * Math.sin(t * 0.9 + i); });
    const p = this.dustPoints.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const s = this.dustSeed[i];
      let y = p.getY(i) + dt * (0.08 + 0.05 * Math.sin(s));
      if (y > 5) y = 0;
      p.setY(i, y);
      p.setX(i, p.getX(i) + Math.sin(t * 0.3 + s) * dt * 0.05);
    }
    p.needsUpdate = true;
    this.mists.forEach((m, i) => { m.rotation.y += dt * 0.01 * (i % 2 ? 1 : -1); });
  }
}
