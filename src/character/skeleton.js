// Esqueleto do mago. Nomes no padrão do Mixamo para facilitar trocar o modelo depois
// (um personagem baixado do Mixamo ou feito no Blender com esses nomes encaixa nas mesmas animações).
// Medidas em metros, personagem olhando para +Z, esquerda do personagem em +X.
// Além do corpo, há ossos para o tecido: Robe* (saia do manto), Cape* (capa nas costas) e HoodTip.
import * as THREE from 'three';

const L = (x) => x, R = (x) => -x;

function side(prefix, f) {
  return [
    { name: `${prefix}Shoulder`, parent: 'Spine2', head: [f(0.04), 1.46, 0], tail: [f(0.165), 1.46, 0] },
    { name: `${prefix}Arm`, parent: `${prefix}Shoulder`, head: [f(0.165), 1.46, 0], tail: [f(0.242), 1.19, 0] },
    { name: `${prefix}ForeArm`, parent: `${prefix}Arm`, head: [f(0.242), 1.19, 0], tail: [f(0.305), 0.955, 0.02] },
    { name: `${prefix}Hand`, parent: `${prefix}ForeArm`, head: [f(0.305), 0.955, 0.02], tail: [f(0.322), 0.855, 0.035] },
    { name: `${prefix}UpLeg`, parent: 'Hips', head: [f(0.09), 0.93, 0], tail: [f(0.1), 0.5, 0.01] },
    { name: `${prefix}Leg`, parent: `${prefix}UpLeg`, head: [f(0.1), 0.5, 0.01], tail: [f(0.105), 0.09, -0.02] },
    { name: `${prefix}Foot`, parent: `${prefix}Leg`, head: [f(0.105), 0.09, -0.02], tail: [f(0.11), 0.03, 0.12] },
    { name: `${prefix}ToeBase`, parent: `${prefix}Foot`, head: [f(0.11), 0.03, 0.12], tail: [f(0.115), 0.025, 0.22] },
  ];
}

export const BONE_SPEC = [
  { name: 'Hips', parent: null, head: [0, 0.98, 0], tail: [0, 1.08, 0] },
  { name: 'Spine', parent: 'Hips', head: [0, 1.08, 0], tail: [0, 1.22, 0] },
  { name: 'Spine1', parent: 'Spine', head: [0, 1.22, 0], tail: [0, 1.36, 0] },
  { name: 'Spine2', parent: 'Spine1', head: [0, 1.36, 0], tail: [0, 1.5, 0] },
  { name: 'Neck', parent: 'Spine2', head: [0, 1.5, 0], tail: [0, 1.6, 0.01] },
  { name: 'Head', parent: 'Neck', head: [0, 1.6, 0.01], tail: [0, 1.82, 0.0] },
  { name: 'HeadTop_End', parent: 'Head', head: [0, 1.82, 0.0], tail: [0, 1.86, 0.0] },
  { name: 'HoodTip', parent: 'Head', head: [0, 1.79, -0.07], tail: [0, 1.765, -0.18] },
  ...side('Left', L),
  ...side('Right', R),
  // tecido: quatro correntes de dois ossos que descem da cintura
  { name: 'RobeFront', parent: 'Hips', head: [0, 0.95, 0.13], tail: [0, 0.52, 0.19] },
  { name: 'RobeFront1', parent: 'RobeFront', head: [0, 0.52, 0.19], tail: [0, 0.02, 0.27] },
  { name: 'RobeBack', parent: 'Hips', head: [0, 0.95, -0.13], tail: [0, 0.52, -0.2] },
  { name: 'RobeBack1', parent: 'RobeBack', head: [0, 0.52, -0.2], tail: [0, 0.02, -0.3] },
  { name: 'RobeLeft', parent: 'Hips', head: [0.16, 0.95, 0], tail: [0.23, 0.52, 0] },
  { name: 'RobeLeft1', parent: 'RobeLeft', head: [0.23, 0.52, 0], tail: [0.31, 0.02, 0] },
  { name: 'RobeRight', parent: 'Hips', head: [-0.16, 0.95, 0], tail: [-0.23, 0.52, 0] },
  { name: 'RobeRight1', parent: 'RobeRight', head: [-0.23, 0.52, 0], tail: [-0.31, 0.02, 0] },
  // capa nas costas: três ossos dos ombros até o chão
  { name: 'Cape', parent: 'Spine2', head: [0, 1.44, -0.17], tail: [0, 1.0, -0.25] },
  { name: 'Cape1', parent: 'Cape', head: [0, 1.0, -0.25], tail: [0, 0.5, -0.33] },
  { name: 'Cape2', parent: 'Cape1', head: [0, 0.5, -0.33], tail: [0, 0.02, -0.42] },
];

export function buildSkeleton() {
  const bones = [], byName = {}, spec = {};
  const specByName = Object.fromEntries(BONE_SPEC.map(b => [b.name, b]));
  for (const b of BONE_SPEC) {
    const bone = new THREE.Bone();
    bone.name = b.name;
    const head = new THREE.Vector3(...b.head);
    const parentHead = b.parent ? new THREE.Vector3(...specByName[b.parent].head) : new THREE.Vector3();
    bone.position.copy(head).sub(parentHead);
    if (b.parent) byName[b.parent].add(bone);
    byName[b.name] = bone;
    spec[b.name] = { head, tail: new THREE.Vector3(...b.tail), index: bones.length };
    bones.push(bone);
  }
  return { bones, byName, spec, root: byName.Hips };
}
