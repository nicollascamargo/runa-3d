// Exporta o mago (malha com pele, esqueleto, materiais, cajado e a luz do cristal) para um arquivo .glb,
// que abre no Blender, no Three.js editor ou em qualquer visualizador glTF.
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';

export function exportGLB(object) {
  return new Promise((resolve, reject) => {
    new GLTFExporter().parse(object, resolve, reject, { binary: true, onlyVisible: true, maxTextureSize: 2048 });
  });
}

export async function downloadGLB(object, filename = 'mago.glb') {
  const buffer = await exportGLB(object);
  const url = URL.createObjectURL(new Blob([buffer], { type: 'model/gltf-binary' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return buffer.byteLength;
}
