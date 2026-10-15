// Junta todos os módulos (src/ e o Three.js de vendor/) num único arquivo, jogo.js.
// Com ele, o index.html abre com dois cliques, direto do arquivo, sem servidor.
// Rode depois de mexer em src/:  npm install  (só na primeira vez)  e  npm run build
import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));

// 'three' e 'three/addons/...' apontam para a cópia do Three.js dentro do projeto (o mesmo do mapa de importação do dev.html)
const vendorThree = {
  name: 'vendor-three',
  setup(b) {
    b.onResolve({ filter: /^three$/ }, () => ({ path: path.join(root, 'vendor/three/three.module.js') }));
    b.onResolve({ filter: /^three\/addons\// }, args => ({ path: path.join(root, 'vendor/three/addons', args.path.slice('three/addons/'.length)) }));
  },
};

await build({
  entryPoints: [path.join(root, 'src/main.js')],
  outfile: path.join(root, 'jogo.js'),
  bundle: true,
  format: 'iife',
  target: 'es2020',
  plugins: [vendorThree],
  legalComments: 'inline',
  banner: { js: '// Runa 3D — arquivo gerado por build.mjs a partir de src/. Não edite aqui: edite src/ e rode npm run build.' },
  logLevel: 'info',
});
