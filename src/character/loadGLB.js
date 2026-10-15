// Carrega um mago de um arquivo .glb no lugar do modelo feito em código.
// Serve para o mago.glb exportado (depois de mexido no Blender) ou para um personagem novo,
// desde que tenha uma malha com esqueleto e ossos com nomes no padrão do Mixamo (Hips, Spine, Head,
// LeftArm, RightHand...). O cajado é procurado pelo nome 'Cajado'; os olhos, pelo material 'olhos'.
import { Box3, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const REQUIRED = ['Hips', 'Spine', 'Head', 'LeftArm', 'LeftForeArm', 'LeftHand', 'RightArm', 'RightForeArm', 'RightHand'];

export async function loadMageGLB(url) {
  const gltf = await new GLTFLoader().loadAsync(url);
  const root = gltf.scene;
  root.name = 'Mago';
  let mesh = null;
  root.traverse(o => {
    if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; }
    if (o.isSkinnedMesh && !mesh) mesh = o;
  });
  if (!mesh) throw new Error('o arquivo não tem uma malha com esqueleto (SkinnedMesh)');
  mesh.frustumCulled = false;
  const bones = {};
  for (const b of mesh.skeleton.bones) bones[b.name.replace(/^mixamorig:?/, '')] = b;
  const missing = REQUIRED.filter(n => !bones[n]);
  const findMaterial = name => {
    let found = null;
    root.traverse(o => { for (const m of [].concat(o.material || [])) if (m.name === name) found = m; });
    return found;
  };
  const staffGroup = root.getObjectByName('Cajado');
  let staff = null;
  if (staffGroup) {
    let light = null, crystal = null;
    staffGroup.traverse(o => {
      if (o.isLight && !light) light = o;
      if (o.isMesh && o.material && o.material.name === 'cristal' && !crystal) crystal = o;
    });
    staff = { group: staffGroup, light, crystal, crystalMat: crystal ? crystal.material : null };
  }
  return { root, mesh, skeleton: mesh.skeleton, bones, materials: { eyes: findMaterial('olhos') }, staff, missing, source: url, animations: gltf.animations };
}

// Um guerreiro de arquivo (feito no Blender a partir de assets/guerreiro.glb, ou um asset licenciado com os
// mesmos nomes de ossos). A espada é procurada pelo nome 'Espada' e o escudo por 'Escudo'; a lâmina é o eixo +Y
// da espada (a ponta é o ponto mais alto). Sem espada, o guerreiro funciona, só sem o rastro da lâmina.
export async function loadWarriorGLB(url) {
  const b = await loadMageGLB(url);
  b.root.name = 'Guerreiro';
  const group = b.root.getObjectByName('Espada');
  let sword = null;
  if (group) {
    const box = new Box3();
    group.updateMatrixWorld(true);
    const inv = group.matrixWorld.clone().invert();
    group.traverse(o => { if (o.isMesh) { o.geometry.computeBoundingBox(); box.union(o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld.clone().premultiply(inv))); } });
    let runeMat = null;
    group.traverse(o => { if (o.isMesh && o.material && o.material.name === 'runas') runeMat = o.material; });
    const len = box.max.y - box.min.y;
    sword = { group, tip: new Vector3(0, box.max.y, 0), base: new Vector3(0, box.min.y + len * 0.25, 0), runeMat };
  }
  const shieldGroup = b.root.getObjectByName('Escudo');
  return { ...b, sword, shield: shieldGroup ? { group: shieldGroup } : null, materials: {} };
}
