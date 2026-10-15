// Cajado: três fios de madeira torcidos em volta de um miolo, que se abrem no alto numa coroa de galhos
// segurando um cristal azul. Cristais menores crescem pelos galhos. O cristal tem a sua própria luz.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { woodTextures } from '../fx/textures.js';

const TAU = Math.PI * 2;

// Tubo que afina do começo ao fim.
function taperedTube(points, r0, r1, segments = 64, radial = 7) {
  const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
  const geo = new THREE.TubeGeometry(curve, segments, 1, radial, false);
  const pos = geo.attributes.position;
  const frames = curve.computeFrenetFrames(segments, false);
  const c = new THREE.Vector3(), v = new THREE.Vector3();
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    curve.getPointAt(t, c);
    const r = r0 + (r1 - r0) * t;
    for (let j = 0; j <= radial; j++) {
      const k = i * (radial + 1) + j;
      v.fromBufferAttribute(pos, k).sub(c).multiplyScalar(r);
      pos.setXYZ(k, c.x + v.x, c.y + v.y, c.z + v.z);
    }
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

// Cristal facetado: prisma de seis lados com pontas (bipirâmide alongada).
export function crystalGeometry(h = 0.2, r = 0.04, tip = 0.35) {
  const prof = [
    new THREE.Vector2(0, -h / 2), new THREE.Vector2(r * 0.8, -h / 2 + h * tip * 0.6),
    new THREE.Vector2(r, -h / 2 + h * tip), new THREE.Vector2(r, h / 2 - h * tip),
    new THREE.Vector2(r * 0.75, h / 2 - h * tip * 0.55), new THREE.Vector2(0, h / 2),
  ];
  return new THREE.LatheGeometry(prof, 6).toNonIndexed();
}

export function buildStaff({ radius = 0.018 } = {}) {
  const group = new THREE.Group();
  group.name = 'Cajado';
  const wood = woodTextures(4);
  const woodMat = new THREE.MeshStandardMaterial({ map: wood.map, normalMap: wood.normal, normalScale: new THREE.Vector2(0.8, 0.8), roughness: 0.78, metalness: 0 });
  woodMat.name = 'madeira';
  const crystalMat = new THREE.MeshPhysicalMaterial({
    color: '#6fb6ff', emissive: '#2f7dff', emissiveIntensity: 2.4, roughness: 0.12, metalness: 0, flatShading: true,
    clearcoat: 1, clearcoatRoughness: 0.1, transparent: true, opacity: 0.94,
  });

  crystalMat.name = 'cristal';
  const shaftTop = 1.76, strand = radius * 0.62, helix = radius * 0.62;
  const parts = [];
  // miolo
  parts.push(taperedTube([new THREE.Vector3(0, 0.02, 0), new THREE.Vector3(0.004, 0.9, 0.002), new THREE.Vector3(0, shaftTop, 0)], radius * 0.62, radius * 0.5, 40, 8));
  // três fios torcidos
  for (let s = 0; s < 3; s++) {
    const pts = [];
    for (let i = 0; i <= 90; i++) {
      const t = i / 90, y = 0.02 + t * (shaftTop - 0.02);
      const ph = (s * TAU) / 3 + t * 3.4 * TAU;
      const r = helix * (1 + 0.18 * Math.sin(t * 23 + s));
      pts.push(new THREE.Vector3(Math.cos(ph) * r + 0.004 * Math.sin(t * 9), y, Math.sin(ph) * r));
    }
    parts.push(taperedTube(pts, strand * 1.1, strand * 0.95, 240, 7));
    // coroa: o fio se abre, sobe e volta a fechar por cima do cristal
    const crown = [];
    const ph0 = (s * TAU) / 3 + 3.4 * TAU;
    for (let i = 0; i <= 26; i++) {
      const t = i / 26, y = shaftTop + t * 0.27;
      const ph = ph0 + t * 1.9;
      const r = helix + 0.085 * Math.sin(Math.min(1, t * 1.15) * Math.PI) ** 0.8;
      crown.push(new THREE.Vector3(Math.cos(ph) * r, y, Math.sin(ph) * r));
    }
    parts.push(taperedTube(crown, strand, strand * 0.3, 70, 6));
    // um galho fino que escapa de lado
    const ph1 = ph0 + 0.9;
    const twig = [0, 1, 2, 3, 4].map(i => {
      const t = i / 4;
      return new THREE.Vector3(Math.cos(ph1) * (0.05 + t * 0.07), shaftTop + 0.08 + t * 0.09 + Math.sin(t * 3) * 0.02, Math.sin(ph1) * (0.05 + t * 0.07));
    });
    parts.push(taperedTube(twig, strand * 0.6, strand * 0.15, 30, 5));
  }
  // ponteira de ferro
  parts.push(new THREE.CylinderGeometry(radius * 0.9, radius * 0.7, 0.07, 10).translate(0, 0.035, 0).toNonIndexed());
  const woodGeo = mergeGeometries(parts.map(g => (g.index ? g.toNonIndexed() : g)), false);
  woodGeo.computeVertexNormals();
  const woodMesh = new THREE.Mesh(woodGeo, woodMat);
  woodMesh.castShadow = true;
  group.add(woodMesh);

  // cristal principal e lascas menores
  const crystals = [];
  const main = new THREE.Mesh(crystalGeometry(0.2, 0.038), crystalMat);
  main.position.set(0, shaftTop + 0.135, 0);
  main.rotation.y = 0.3;
  crystals.push(main);
  const shards = [
    [0.07, shaftTop + 0.1, 0.03, 0.06, 0.012, 0.6], [-0.06, shaftTop + 0.06, -0.04, 0.05, 0.011, -0.7],
    [0.02, shaftTop + 0.2, -0.07, 0.045, 0.01, 0.9], [-0.03, shaftTop - 0.08, 0.025, 0.04, 0.009, 0.4],
    [0.025, shaftTop - 0.2, -0.02, 0.035, 0.008, -0.5],
  ];
  for (const [x, y, z, h, r, tilt] of shards) {
    const m = new THREE.Mesh(crystalGeometry(h, r), crystalMat);
    m.position.set(x, y, z);
    m.rotation.set(tilt * 0.5, tilt, tilt);
    crystals.push(m);
  }
  for (const c of crystals) { c.castShadow = false; group.add(c); }

  // luz do cristal
  const light = new THREE.PointLight('#4b8dff', 2.2, 3.2, 1.6);
  light.position.set(0, shaftTop + 0.14, 0);
  group.add(light);

  return { group, crystalMat, light, crystal: main, top: shaftTop + 0.27 };
}
