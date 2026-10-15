// Desenhos sintéticos parecidos com os de uma pessoa, para os testes das runas (sem navegador).
// Tremor, escala, giro, cisalhamento, velocidade irregular, ponto de partida e sentido variados, fechamento
// imperfeito. Cada teste cria o seu gerador com uma semente (resultados repetíveis).
import { resample, smoothPath } from '../src/runes/RuneRecognizer.js';
import { RUNES } from '../src/runes/runeShapes.js';

export function makeSynth(seed0 = 1234) {
  let seed = seed0;
  const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const range = (a, b) => a + (b - a) * rand();
  const gauss = () => { let u = 0; for (let i = 0; i < 6; i++) u += rand(); return (u - 3) / Math.sqrt(0.5); };

  // Um traço "à mão" a partir de um caminho de referência.
  //   tremor: amplitude do tremor (fração do tamanho); cut: fração do fim que fica faltando (desenho incompleto)
  function humanize(path, { closed = false, freeRotation = false, maxRot = 0.2, scale = range(140, 420), cx = range(300, 900), cy = range(250, 600), tremor = 0.008, cut = 0, wobble = 1 } = {}) {
    let p = resample(path, 220);
    if (closed) {
      const ring = p.slice(0, -1);
      const k = Math.floor(rand() * ring.length);
      p = [...ring.slice(k), ...ring.slice(0, k)];
      if (rand() < 0.5) p.reverse();
      const extra = Math.floor(range(-0.07, 0.08) * p.length); // não fecha direito ou passa do ponto
      p = extra >= 0 ? [...p, ...p.slice(0, extra + 1)] : p.slice(0, p.length + extra);
    }
    if (cut > 0) p = p.slice(0, Math.max(3, Math.round(p.length * (1 - cut))));
    p = smoothPath(p, 3); // cantos arredondados, como a mão faz
    const rot = freeRotation ? range(-Math.PI, Math.PI) : range(-maxRot, maxRot);
    const sx = scale * range(0.85, 1.15), sy = scale * range(0.85, 1.15), shear = range(-0.1, 0.1);
    const wob = [range(0.01, 0.03) * wobble, range(2, 5), range(0, 6), range(0.01, 0.03) * wobble, range(2, 5), range(0, 6)];
    const out = p.map(([x, y], i) => {
      const u = i / (p.length - 1);
      x = (x - 0.5) + shear * (y - 0.5) + wob[0] * Math.sin(u * wob[1] * 6.28 + wob[2]);
      y = (y - 0.5) + wob[3] * Math.sin(u * wob[4] * 6.28 + wob[5]);
      const c = Math.cos(rot), s = Math.sin(rot);
      return [cx + (x * c - y * s) * sx + gauss() * scale * tremor, cy + (x * s + y * c) * sy + gauss() * scale * tremor];
    });
    // velocidade irregular: os pontos chegam em intervalos diferentes, como numa câmera a 30 quadros
    // (a mão acelera e freia, mas não volta para trás: a função do tempo é crescente)
    const n = Math.floor(range(45, 140)), res = [], freq = range(1, 2), amp = range(0, 0.05), ph = range(0, 6.28);
    for (let i = 0; i < n; i++) {
      let u = i / (n - 1);
      u = Math.min(1, Math.max(0, u + amp * Math.sin(u * 6.28 * freq + ph) - amp * Math.sin(ph) * (1 - u)));
      res.push(out[Math.round(u * (out.length - 1))]);
    }
    return res;
  }

  // Uma runa desenhada à mão (traços em pixels). opts vai para humanize (tremor, cut...).
  function drawRune(id, opts = {}) {
    const r = RUNES[id];
    const paths = [r.strokes.length === 1 ? r.strokes[0] : null, ...(r.variants || [])].filter(Boolean);
    if (r.multi && rand() < 0.6) { // dois traços separados
      const scale = range(140, 380), cx = range(300, 800), cy = range(250, 550);
      return r.strokes.map(s => humanize(s, { scale, cx: cx + (s[0][0] - 0.25) * 0.15 * scale, cy, maxRot: 0.12, ...opts }));
    }
    let path = paths[Math.floor(rand() * paths.length)];
    if (r.reversible && rand() < 0.3) path = [...path].reverse();
    return [humanize(path, { closed: r.closed, freeRotation: r.rotation >= Math.PI, maxRot: Math.min(0.25, (r.rotation || 0.3) * 0.7), ...opts })];
  }

  // Desenhos que não são runa nenhuma.
  const NEGATIVES = {
    'linha reta': () => [humanize([[0, 0.5], [1, 0.5]], { maxRot: 0.8 })],
    'L': () => [humanize([[0, 0], [0, 1], [0.7, 1]], { maxRot: 0.3 })],
    'meio círculo': () => [humanize(Array.from({ length: 30 }, (_, i) => [0.5 + 0.5 * Math.cos(Math.PI + (i / 29) * Math.PI), 0.5 + 0.5 * Math.sin(Math.PI + (i / 29) * Math.PI)]), { maxRot: 0.5 })],
    'rabisco': () => { const p = [[0, 0]]; for (let i = 0; i < 25; i++) p.push([p[i][0] + range(-1, 1), p[i][1] + range(-1, 1)]); return [humanize(p.map(([x, y]) => [x / 6 + 0.5, y / 6 + 0.5]), {})]; },
    'ponto (tremor)': () => [Array.from({ length: 30 }, () => [500 + gauss() * 4, 400 + gauss() * 4])],
  };
  // Mais rabiscos, de vários tipos (para medir falsos disparos).
  const SCRIBBLES = {
    'rabisco aleatório': NEGATIVES.rabisco,
    'rabisco longo': () => { const p = [[0, 0]]; for (let i = 0; i < 60; i++) p.push([p[i][0] + range(-1, 1), p[i][1] + range(-1, 1)]); return [humanize(p.map(([x, y]) => [x / 9 + 0.5, y / 9 + 0.5]), {})]; },
    'vaivém': () => { const p = []; const k = Math.floor(range(3, 7)); for (let i = 0; i <= k; i++) p.push([i % 2, range(0, 0.25) + i * 0.02]); return [humanize(p, { maxRot: 1.2 })]; },
    'emaranhado': () => { const p = []; const n = 120, f1 = range(2, 5), f2 = range(2, 5), ph = range(0, 6); for (let i = 0; i <= n; i++) { const u = i / n * 6.28; p.push([0.5 + 0.45 * Math.sin(f1 * u + ph), 0.5 + 0.45 * Math.sin(f2 * u)]); } return [humanize(p, { maxRot: 3 })]; },
    'mão passeando': () => { const p = [[range(0, 1), range(0, 1)]]; for (let i = 0; i < 4; i++) p.push([range(0, 1), range(0, 1)]); return [humanize(p, { maxRot: 3 })]; },
    'garrancho': () => { const p = []; for (let i = 0; i < 8; i++) p.push([i / 7 + range(-0.08, 0.08), range(0.2, 0.8)]); return [humanize(p, { maxRot: 0.5 })]; },
  };
  return { rand, range, gauss, humanize, drawRune, NEGATIVES, SCRIBBLES };
}
