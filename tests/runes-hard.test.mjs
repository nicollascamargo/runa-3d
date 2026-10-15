// Teste do reconhecimento livre em casos difíceis, sem navegador:  node tests/runes-hard.test.mjs
// Desenhos imperfeitos, incompletos, tremidos, rápidos e lentos, com interrupções; rabiscos de vários tipos;
// runas parecidas entre si; e as dicas de "quase". Nos níveis Normal e Avançado (o Fácil usa o traçado guiado,
// testado em tests/guide.test.mjs). Imprime a taxa de reconhecimento e de falsos disparos de cada caso.
import { RuneRecognizer, RECOGNIZER_LEVELS, diagnose, features } from '../src/runes/RuneRecognizer.js';
import { RUNES, RUNE_IDS } from '../src/runes/runeShapes.js';
import { makeSynth } from './synth.mjs';

let failures = 0, passed = 0;
const check = (name, cond, extra = '') => { if (cond) passed++; else { failures++; console.log(`FALHOU: ${name} ${extra}`); } };
const line = s => process.stdout.write(s + '\n');
const N = 150;
const pct = v => `${(v * 100).toFixed(1)}%`;

// interrupção: some um pedaço do meio do traço (a câmera perdeu a mão), o traço liga os dois lados em linha reta
const gapify = (S, strokes, frac) => strokes.map(st => { if (st.length < 20) return st; const a = Math.floor(st.length * S.range(0.25, 0.6)), k = Math.max(2, Math.floor(st.length * frac)); return [...st.slice(0, a), ...st.slice(a + k)]; });
// mão rápida: 12 a 20 amostras no desenho inteiro; mão lenta: cada ponto repetido (parado um instante) com tremor
const sparse = (S, strokes) => strokes.map(st => { const n = Math.floor(S.range(12, 20)); return Array.from({ length: n }, (_, i) => st[Math.round(i / (n - 1) * (st.length - 1))]); });
const slow = (S, strokes) => strokes.map(st => st.flatMap(p => Array.from({ length: Math.floor(S.range(1, 5)) }, () => [p[0] + S.gauss() * 1.5, p[1] + S.gauss() * 1.5])));

const SETS = {
  'imperfeito (ondulado, torto)': { gen: S => id => S.drawRune(id, { wobble: 2.6 }), min: { normal: 0.8, avancado: 0.68 }, minRune: { normal: 0.6, avancado: 0.3 } },
  'incompleto (falta 8-15%)': { gen: S => id => S.drawRune(id, { cut: S.range(0.08, 0.15) }), min: { normal: 0.82, avancado: 0.7 }, minRune: { normal: 0.65, avancado: 0.35 } },
  'tremor forte': { gen: S => id => S.drawRune(id, { tremor: 0.022 }), min: { normal: 0.95, avancado: 0.92 }, minRune: { normal: 0.88, avancado: 0.78 } },
  'rápido (12-20 amostras)': { gen: S => id => sparse(S, S.drawRune(id)), min: { normal: 0.9, avancado: 0.86 }, minRune: { normal: 0.75, avancado: 0.62 } },
  'lento (amostras repetidas)': { gen: S => id => slow(S, S.drawRune(id)), min: { normal: 0.97, avancado: 0.95 }, minRune: { normal: 0.92, avancado: 0.9 } },
  'interrupção (some 6-12%)': { gen: S => id => gapify(S, S.drawRune(id), S.range(0.06, 0.12)), min: { normal: 0.96, avancado: 0.94 }, minRune: { normal: 0.92, avancado: 0.9 } },
};

const results = {};
for (const level of ['normal', 'avancado']) {
  const rec = new RuneRecognizer(undefined, RECOGNIZER_LEVELS[level]);
  line(`\n== Nível ${level === 'normal' ? 'Normal' : 'Avançado'} (nota mínima ${rec.config.minScore}) — ${N} desenhos por runa`);
  line('caso                          reconhecido  runa trocada  pior runa');
  for (const [name, set] of Object.entries(SETS)) {
    const S = makeSynth(4321), gen = set.gen(S);
    let ok = 0, wrong = 0, tot = 0;
    const per = {};
    for (const id of RUNE_IDS) { let o = 0; for (let i = 0; i < N; i++) { const r = rec.recognize(gen(id)); tot++; if (r.accepted && r.id === id) { ok++; o++; } else if (r.accepted) wrong++; } per[id] = o / N; }
    const worst = Object.entries(per).sort((a, b) => a[1] - b[1])[0];
    results[`${level}:${name}`] = ok / tot;
    line(`${name.padEnd(30)} ${pct(ok / tot).padStart(7)}      ${pct(wrong / tot).padStart(6)}     ${worst[0]} ${pct(worst[1])}`);
    check(`${level} · ${name}: pelo menos ${pct(set.min[level])}`, ok / tot >= set.min[level], pct(ok / tot));
    check(`${level} · ${name}: cada runa pelo menos ${pct(set.minRune[level])}`, worst[1] >= set.minRune[level], `${worst[0]} ${pct(worst[1])}`);
    check(`${level} · ${name}: no máximo 2% de runa trocada`, wrong / tot <= 0.02, pct(wrong / tot));
  }

  // rabiscos: nenhuma runa pode disparar (o garrancho, um zigue-zague da esquerda para a direita, é o caso
  // mais parecido com uma onda: medido e limitado, mas não zerado)
  line('\nrabisco                       disparou');
  const S = makeSynth(777);
  let tot = 0, acc = 0;
  for (const [name, g] of Object.entries({ ...S.SCRIBBLES, 'linha reta': S.NEGATIVES['linha reta'], 'L': S.NEGATIVES.L, 'meio círculo': S.NEGATIVES['meio círculo'], 'ponto (tremor)': S.NEGATIVES['ponto (tremor)'] })) {
    let a = 0; const seen = {};
    for (let i = 0; i < N; i++) { const r = rec.recognize(g()); if (r.accepted) { a++; seen[r.id] = (seen[r.id] || 0) + 1; } }
    if (name !== 'garrancho') { tot += N; acc += a; }
    line(`${name.padEnd(30)} ${pct(a / N).padStart(6)} ${a ? JSON.stringify(seen) : ''}`);
    const limit = name === 'garrancho' ? (level === 'normal' ? 0.55 : 0.45) : 0.05;
    check(`${level} · rabisco "${name}" dispara no máximo ${pct(limit)}`, a / N <= limit, pct(a / N));
  }
  line(`falsos disparos (sem o garrancho): ${pct(acc / tot)}`);
  check(`${level} · falsos disparos dos rabiscos no total: no máximo 1,5%`, acc / tot <= 0.015, pct(acc / tot));

  // runas parecidas: uma não pode ser aceita como a outra
  line('\nrunas parecidas               trocadas');
  const PAIRS = [['circulo', 'losango'], ['losango', 'circulo'], ['triangulo', 'losango'], ['losango', 'triangulo'], ['v', 'raio'], ['raio', 'v'], ['onda', 'raio'], ['raio', 'onda'], ['raio', 'raioDuplo'], ['raioDuplo', 'raio'], ['espiral', 'circulo'], ['circulo', 'espiral']];
  const S2 = makeSynth(999);
  for (const [a, b] of PAIRS) {
    let as = 0;
    for (let i = 0; i < N; i++) { const r = rec.recognize(S2.drawRune(a, { wobble: 1.6 })); if (r.accepted && r.id === b) as++; }
    line(`${`${RUNES[a].name} lido como ${RUNES[b].name}`.padEnd(30)} ${pct(as / N)}`);
    // um losango desenhado bem arredondado é, de fato, quase um círculo: esse par tem 3% de folga
    const lim = a === 'losango' && b === 'circulo' ? 0.03 : 0.02;
    check(`${level} · ${a} não vira ${b} (no máximo ${pct(lim)})`, as / N <= lim, pct(as / N));
  }
}

// folga exigida entre as duas mais prováveis: maior quando a nota é baixa
{
  const rec = new RuneRecognizer();
  check('folga entre as duas runas mais prováveis cresce com a nota baixa', rec.marginFor(0.76) > rec.marginFor(0.9) && rec.marginFor(0.9) === rec.config.minMargin);
}

// dicas de "quase": o que corrigir em cada erro típico
{
  const S = makeSynth(31);
  const tip = (id, strokes) => diagnose(id, features(strokes.flat()), strokes.length);
  const arc = (from, to, n = 50) => Array.from({ length: n }, (_, i) => { const a = from + (to - from) * (i / (n - 1)); return [400 + Math.cos(a) * 150, 300 + Math.sin(a) * 150]; });
  check('círculo aberto: "feche o círculo"', /feche o círculo/.test(tip('circulo', [arc(-Math.PI / 2, Math.PI * 1.1)])), tip('circulo', [arc(-Math.PI / 2, Math.PI * 1.1)]));
  const outward = Array.from({ length: 90 }, (_, i) => { const u = i / 89, r = 20 + 160 * u, a = u * Math.PI * 4.5; return [400 + Math.cos(a) * r, 300 + Math.sin(a) * r]; });
  check('espiral de dentro para fora: "comece por fora"', /comece por fora/.test(tip('espiral', [outward])), tip('espiral', [outward]));
  const bump = Array.from({ length: 40 }, (_, i) => [200 + i * 10, 300 - Math.sin((i / 39) * Math.PI) * 60]);
  check('onda com uma ondulação só: "pelo menos duas ondas"', /duas ondas/.test(tip('onda', [bump])), tip('onda', [bump]));
  const scr = S.SCRIBBLES['rabisco longo']();
  check('rabisco no lugar do triângulo: "sem voltar nem rabiscar"', /rabiscar/.test(tip('triangulo', scr)), tip('triangulo', scr));
  const lineV = [[300, 200], [380, 400], [460, 330]];
  check('V torto (pontas em alturas diferentes): dica da altura', /mesma altura/.test(tip('v', [lineV.flatMap((p, i) => i ? Array.from({ length: 12 }, (_, k) => [lineV[i - 1][0] + (p[0] - lineV[i - 1][0]) * k / 11, lineV[i - 1][1] + (p[1] - lineV[i - 1][1]) * k / 11]) : [p])])));
}

// tempo
{
  const rec = new RuneRecognizer(), S = makeSynth(5);
  const strokes = RUNE_IDS.map(id => S.drawRune(id, { tremor: 0.02 }));
  const t0 = performance.now();
  for (let k = 0; k < 5; k++) for (const s of strokes) rec.recognize(s);
  const ms = (performance.now() - t0) / (strokes.length * 5);
  line(`\nTempo médio por reconhecimento (com tremor): ${ms.toFixed(2)} ms`);
  check('reconhecimento rápido (menos de 25 ms)', ms < 25, `${ms.toFixed(2)} ms`);
}

line(failures ? `\n${failures} falha(s), ${passed} ok` : `\nTodos os ${passed} testes dos casos difíceis passaram.`);
process.exit(failures ? 1 : 0);
