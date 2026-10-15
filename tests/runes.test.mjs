// Teste do reconhecedor de runas, sem navegador:  node tests/runes.test.mjs
// Gera desenhos sintéticos parecidos com os de uma pessoa (tremor, escala, giro, velocidade irregular,
// ponto de partida e sentido variados, fechamento imperfeito) e confere acertos, confusões e recusas.
import { RuneRecognizer, resample, smoothPath } from '../src/runes/RuneRecognizer.js';
import { RUNES, RUNE_IDS } from '../src/runes/runeShapes.js';

let seed = 1234;
const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const range = (a, b) => a + (b - a) * rand();
const gauss = () => { let u = 0; for (let i = 0; i < 6; i++) u += rand(); return (u - 3) / Math.sqrt(0.5); };

// Um traço "à mão" a partir de um caminho de referência.
function humanize(path, { closed = false, freeRotation = false, maxRot = 0.2, scale = range(140, 420), cx = range(300, 900), cy = range(250, 600) } = {}) {
  let p = resample(path, 220);
  if (closed) {
    const ring = p.slice(0, -1);
    const k = Math.floor(rand() * ring.length);
    p = [...ring.slice(k), ...ring.slice(0, k)];
    if (rand() < 0.5) p.reverse();
    const extra = Math.floor(range(-0.07, 0.08) * p.length); // não fecha direito ou passa do ponto
    p = extra >= 0 ? [...p, ...p.slice(0, extra + 1)] : p.slice(0, p.length + extra);
  }
  p = smoothPath(p, 3); // cantos arredondados, como a mão faz
  const rot = freeRotation ? range(-Math.PI, Math.PI) : range(-maxRot, maxRot);
  const sx = scale * range(0.85, 1.15), sy = scale * range(0.85, 1.15), shear = range(-0.1, 0.1);
  const wob = [range(0.01, 0.03), range(2, 5), range(0, 6), range(0.01, 0.03), range(2, 5), range(0, 6)];
  const out = p.map(([x, y], i) => {
    const u = i / (p.length - 1);
    x = (x - 0.5) + shear * (y - 0.5) + wob[0] * Math.sin(u * wob[1] * 6.28 + wob[2]);
    y = (y - 0.5) + wob[3] * Math.sin(u * wob[4] * 6.28 + wob[5]);
    const c = Math.cos(rot), s = Math.sin(rot);
    return [cx + (x * c - y * s) * sx + gauss() * scale * 0.008, cy + (x * s + y * c) * sy + gauss() * scale * 0.008];
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

function drawRune(id) {
  const r = RUNES[id];
  const paths = [r.strokes.length === 1 ? r.strokes[0] : null, ...(r.variants || [])].filter(Boolean);
  if (r.multi && rand() < 0.6) { // dois traços separados
    const scale = range(140, 380), cx = range(300, 800), cy = range(250, 550);
    return r.strokes.map(s => humanize(s, { scale, cx: cx + (s[0][0] - 0.25) * 0.15 * scale, cy, maxRot: 0.12 }));
  }
  let path = paths[Math.floor(rand() * paths.length)];
  if (r.reversible && rand() < 0.3) path = [...path].reverse();
  return [humanize(path, { closed: r.closed, freeRotation: r.rotation >= Math.PI, maxRot: Math.min(0.25, (r.rotation || 0.3) * 0.7) })];
}

const rec = new RuneRecognizer();
const N = 300;
let failures = 0;
const line = s => process.stdout.write(s + '\n');
line(`Reconhecimento: ${N} desenhos sintéticos por runa\n`);
line('runa         acerto  recusado  errado   nota média  confusões');
const t0 = performance.now();
let total = 0;
for (const id of RUNE_IDS) {
  let ok = 0, rej = 0, wrong = 0, sum = 0;
  const conf = {};
  for (let i = 0; i < N; i++) {
    const res = rec.recognize(drawRune(id));
    total++;
    if (res.accepted && res.id === id) { ok++; sum += res.score; }
    else if (res.accepted) { wrong++; conf[res.id] = (conf[res.id] || 0) + 1; }
    else { rej++; if (res.id !== id) conf[`~${res.id}`] = (conf[`~${res.id}`] || 0) + 1; }
  }
  const pct = v => `${((v / N) * 100).toFixed(1)}%`.padStart(6);
  line(`${id.padEnd(12)} ${pct(ok)}  ${pct(rej)}    ${pct(wrong)}   ${(sum / Math.max(1, ok)).toFixed(3)}       ${JSON.stringify(conf)}`);
  if (ok / N < 0.9 || wrong / N > 0.02) { failures++; line(`  FALHOU: ${id} precisa de pelo menos 90% de acerto e no máximo 2% de erro`); }
}
const ms = (performance.now() - t0) / total;

// desenhos que não são runa nenhuma: precisam ser recusados
const negatives = {
  'linha reta': () => [humanize([[0, 0.5], [1, 0.5]], { maxRot: 0.8 })],
  'L': () => [humanize([[0, 0], [0, 1], [0.7, 1]], { maxRot: 0.3 })],
  'meio círculo': () => [humanize(Array.from({ length: 30 }, (_, i) => [0.5 + 0.5 * Math.cos(Math.PI + (i / 29) * Math.PI), 0.5 + 0.5 * Math.sin(Math.PI + (i / 29) * Math.PI)]), { maxRot: 0.5 })],
  'rabisco': () => { const p = [[0, 0]]; for (let i = 0; i < 25; i++) p.push([p[i][0] + range(-1, 1), p[i][1] + range(-1, 1)]); return [humanize(p.map(([x, y]) => [x / 6 + 0.5, y / 6 + 0.5]), {})]; },
  'ponto (tremor)': () => [Array.from({ length: 30 }, () => [500 + gauss() * 4, 400 + gauss() * 4])],
};
line('\nRecusas (não é runa nenhuma)');
for (const [name, gen] of Object.entries(negatives)) {
  let acc = 0;
  const seen = {};
  for (let i = 0; i < N; i++) { const r = rec.recognize(gen()); if (r.accepted) { acc++; seen[r.id] = (seen[r.id] || 0) + 1; } }
  line(`${name.padEnd(16)} recusado ${(100 - (acc / N) * 100).toFixed(1)}%  ${acc ? JSON.stringify(seen) : ''}`);
  if (acc / N > 0.1) { failures++; line(`  FALHOU: "${name}" precisa ser recusado em pelo menos 90% das vezes`); }
}

// casos exatos: o modelo desenhado perfeito, grande e pequeno, em qualquer posição
line('\nModelos perfeitos');
for (const id of RUNE_IDS) {
  const strokes = RUNES[id].strokes.map(s => resample(s, 50).map(([x, y]) => [200 + x * 300, 100 + y * 300]));
  const r = rec.recognize(strokes);
  const ok = r.accepted && r.id === id;
  if (!ok) failures++;
  line(`${ok ? 'ok    ' : 'FALHOU'} ${id.padEnd(12)} -> ${r.id} ${r.score.toFixed(3)} (margem ${r.margin.toFixed(3)})`);
}
line(`\nTempo médio por reconhecimento: ${ms.toFixed(2)} ms`);
if (ms > 25) { failures++; line('FALHOU: reconhecimento lento demais'); }
line(failures ? `\n${failures} falha(s)` : '\nTodos os testes do reconhecedor passaram.');
process.exit(failures ? 1 : 0);
