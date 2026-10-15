// Teste do rastreamento de trajetórias + reconhecimento, sem navegador:  node tests/tracker.test.mjs
// Simula a ponta do dedo a 30 quadros por segundo, com tremor, e confere quando os traços começam e terminam.
import { RuneTracker, TRACKER_CONFIG } from '../src/runes/RuneTracker.js';
import { RuneRecognizer } from '../src/runes/RuneRecognizer.js';

let failures = 0, passed = 0;
const check = (name, cond, extra = '') => { if (cond) passed++; else { failures++; console.log(`FALHOU: ${name} ${extra}`); } };
let seed = 7;
const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 - 0.5; };
const rec = new RuneRecognizer();

// Alimenta o rastreador com uma trajetória: path(u) em pixels, durante ms, com a caneta 'pen'.
function feed(tr, path, { t0, ms, pen = 0.9, jitter = 3, fps = 30, source = 'hand' }) {
  let t = t0;
  for (; t <= t0 + ms; t += 1000 / fps) {
    const [x, y] = path((t - t0) / ms);
    tr.sample({ x: x + rand() * jitter * 2, y: y + rand() * jitter * 2, t, pen, source });
    tr.update(t);
  }
  return t;
}
const circle = (cx, cy, r) => u => [cx + r * Math.cos(-Math.PI / 2 + u * Math.PI * 2.05), cy + r * Math.sin(-Math.PI / 2 + u * Math.PI * 2.05)];
const still = (x, y) => () => [x, y];

// 1. Círculo com a mão, terminado por pausa
{
  const tr = new RuneTracker(); const ends = [];
  tr.onStrokeEnd = (s, why) => ends.push(why);
  tr.begin(0);
  let t = feed(tr, still(600, 200), { t0: 0, ms: 300, pen: 0.1 });               // mão parada, caneta levantada
  check('sem caneta não desenha', tr.strokes.length === 0 && tr.state === 'ready');
  t = feed(tr, circle(600, 400, 180), { t0: t, ms: 1400 });                         // desenha
  t = feed(tr, still(600, 220), { t0: t, ms: 900, jitter: 2 });                     // para
  check('pausa termina o traço', ends[0] === 'parado', ends.join());
  const r = rec.recognize(tr.strokePoints);
  check('círculo da mão reconhecido', r.accepted && r.id === 'circulo', `${r.id} ${r.score.toFixed(3)}`);
  feed(tr, still(600, 220), { t0: t, ms: 600, pen: 0.9 });
  check('depois da pausa, o dedo ainda apontando não começa outro traço', tr.strokes.length === 1 && tr.state !== 'stroke');
}

// 2. Caneta com folga: uma queda de um quadro não corta o traço
{
  const tr = new RuneTracker(); let n = 0;
  tr.onStrokeEnd = () => n++;
  tr.begin(0);
  let t = 0;
  const path = circle(500, 400, 150);
  for (let i = 0; i < 45; i++, t += 33) { const [x, y] = path(i / 45); tr.sample({ x, y, t, pen: i === 20 ? 0.1 : 0.9 }); tr.update(t); }
  check('um quadro com a caneta baixa não corta o traço', n === 0 && tr.state === 'stroke');
  for (let i = 0; i < 8; i++, t += 33) { tr.sample({ x: 500, y: 250, t, pen: 0.05 }); tr.update(t); }
  check('dedo relaxado termina o traço', n === 1);
}

// 3. Esbarrão: traço curto é descartado
{
  const tr = new RuneTracker(); let disc = '';
  tr.onDiscard = (s, why) => { disc = why; };
  tr.begin(0);
  feed(tr, u => [400 + u * 30, 300], { t0: 0, ms: 150 });
  feed(tr, still(430, 300), { t0: 160, ms: 300, pen: 0.05 });
  check('traço curto descartado', disc !== '' && tr.strokes.length === 0, disc);
}

// 4. Mão perdida no meio do traço: o que foi desenhado vale
{
  const tr = new RuneTracker(); let why = '';
  tr.onStrokeEnd = (s, w) => { why = w; };
  tr.begin(0);
  let t = feed(tr, circle(500, 400, 160), { t0: 0, ms: 1300 });
  for (let i = 0; i < 15; i++, t += 33) { tr.lost(t); tr.update(t); }
  check('mão perdida termina o traço', why === 'perdida' && tr.strokes.length === 1, why);
}

// 5. Mouse: o botão é a caneta; dois traços para o raio duplo
{
  const tr = new RuneTracker();
  tr.begin(0);
  const bolt = (ox) => u => { const P = [[0.62, 0], [0.22, 0.56], [0.7, 0.44], [0.3, 1]]; const k = Math.min(2.999, u * 3), i = Math.floor(k), f = k - i; return [ox + 160 * (P[i][0] + (P[i + 1][0] - P[i][0]) * f), 200 + 300 * (P[i][1] + (P[i + 1][1] - P[i][1]) * f)]; };
  let t = feed(tr, bolt(300), { t0: 0, ms: 700, pen: true, source: 'mouse', jitter: 0.5, fps: 60 });
  tr.sample({ x: 350, y: 500, t: t + 10, pen: false, source: 'mouse' });
  t = feed(tr, bolt(520), { t0: t + 400, ms: 700, pen: true, source: 'mouse', jitter: 0.5, fps: 60 });
  tr.sample({ x: 570, y: 500, t: t + 10, pen: false, source: 'mouse' });
  check('dois traços', tr.strokes.length === 2);
  const r = rec.recognize(tr.strokePoints);
  check('raio duplo em dois traços reconhecido', r.accepted && r.id === 'raioDuplo', `${r.id} ${r.score.toFixed(3)}`);
  const one = rec.recognize([tr.strokePoints[0]]);
  check('só o primeiro traço é um raio', one.accepted && one.id === 'raio', `${one.id} ${one.score.toFixed(3)}`);
}

// 6. Tempo máximo do traço
{
  const tr = new RuneTracker(); let why = '';
  tr.onStrokeEnd = (s, w) => { why = w; };
  tr.begin(0);
  feed(tr, u => [300 + 200 * Math.sin(u * 40), 300 + 200 * Math.cos(u * 31)], { t0: 0, ms: tr.config.maxStrokeMs + 500 });
  check('traço longo demais termina sozinho', why === 'tempo', why);
}

// 7. Suavização adaptativa: com a mão tremendo, o filtro segura mais (e o traço sai mais liso)
{
  const { jitterOf, resample } = await import('../src/runes/RuneRecognizer.js');
  const draw = adaptive => {
    seed = 99;
    const tr = new RuneTracker(adaptive ? undefined : { ...TRACKER_CONFIG, adaptive: null });
    tr.begin(0);
    let t = feed(tr, circle(600, 400, 170), { t0: 0, ms: 1800, jitter: 9 });
    const pts = tr.current.points.map(([x, y]) => [x, y]);
    return { tr, j: jitterOf(resample(pts, 128)) };
  };
  const a = draw(true), f = draw(false);
  check('mão tremendo: o rastreador mede o tremor e aumenta a suavização', a.tr.tremor > TRACKER_CONFIG.adaptive.tremorLow && a.tr.fx.minCutoff < TRACKER_CONFIG.euro.minCutoff, `tremor ${a.tr.tremor.toFixed(1)} px, corte ${a.tr.fx.minCutoff.toFixed(2)}`);
  check('...e o traço sai mais liso que com o filtro fixo', a.j < f.j * 0.9, `${a.j.toFixed(3)} contra ${f.j.toFixed(3)}`);
  const calm = new RuneTracker(); calm.begin(0);
  feed(calm, circle(600, 400, 170), { t0: 0, ms: 1800, jitter: 1 });
  check('mão firme: o filtro fica no normal (não atrasa)', calm.fx.minCutoff > TRACKER_CONFIG.euro.minCutoff - 0.05, calm.fx.minCutoff.toFixed(2));
}

// 8. A câmera perde a mão no meio do traço e ela volta perto: o mesmo traço continua
{
  const tr = new RuneTracker(); const ends = []; let resumed = 0;
  tr.onStrokeEnd = (s, why) => ends.push(why); tr.onResume = () => resumed++;
  tr.begin(0);
  const c = circle(600, 400, 180);
  let t = feed(tr, u => c(u * 0.5), { t0: 0, ms: 700 });
  tr.lost(t);
  for (let k = 0; k < 20; k++) { t += 33; tr.update(t); } // 660 ms sem a mão
  check('mão some: o traço para ("perdida") e fica esperando', ends[0] === 'perdida' && tr.strokes.length === 1 && !!tr.resumable, ends.join());
  t = feed(tr, u => c(0.5 + u * 0.5), { t0: t, ms: 700 });
  t = feed(tr, still(c(1)[0], c(1)[1]), { t0: t, ms: 900, jitter: 2 });
  check('a mão volta perto de onde sumiu: o MESMO traço continua', resumed === 1 && tr.strokes.length === 1, `traços ${tr.strokes.length}, retomadas ${resumed}`);
  const r = rec.recognize(tr.strokePoints);
  check('...e o círculo inteiro é reconhecido', r.accepted && r.id === 'circulo', `${r.id} ${r.score.toFixed(2)}`);
}
{
  const tr = new RuneTracker(); let resumed = 0;
  tr.onResume = () => resumed++;
  tr.begin(0);
  let t = feed(tr, u => [300 + u * 300, 300], { t0: 0, ms: 600 });
  tr.lost(t);
  for (let k = 0; k < 20; k++) { t += 33; tr.update(t); }
  feed(tr, u => [300 + u * 200, 700], { t0: t, ms: 500 }); // volta longe dali
  check('a mão volta longe: é outro traço (não emenda)', resumed === 0 && tr.strokes.length + (tr.current ? 1 : 0) === 2);
}

// 9. Parar num canto do triângulo não termina o desenho (só termina parado se já parece a runa, ou parado bem mais)
{
  const tr = new RuneTracker(); const ends = [];
  tr.onStrokeEnd = (s, why) => ends.push(why);
  tr.dwellOk = () => { const pts = [...tr.strokePoints, tr.current.points.map(([x, y]) => [x, y])]; const r = rec.recognize(pts); return r.accepted && r.id === 'triangulo'; };
  tr.begin(0);
  const P = [[600, 200], [800, 520], [400, 520], [600, 200]];
  const side = k => u => [P[k][0] + (P[k + 1][0] - P[k][0]) * u, P[k][1] + (P[k + 1][1] - P[k][1]) * u];
  let t = feed(tr, side(0), { t0: 0, ms: 500 });
  t = feed(tr, side(1), { t0: t, ms: 500 });
  t = feed(tr, still(400, 520), { t0: t, ms: 800, jitter: 2 }); // pensa 0,8 s no canto
  check('parado 0,8 s num canto (desenho incompleto): o traço continua', ends.length === 0 && tr.state === 'stroke', ends.join());
  t = feed(tr, side(2), { t0: t, ms: 500 });
  t = feed(tr, still(600, 200), { t0: t, ms: 800, jitter: 2 });
  check('fechou o triângulo e parou: termina ("parado") e é reconhecido', ends[0] === 'parado' && rec.recognize(tr.strokePoints).id === 'triangulo', ends.join());
  const tr2 = new RuneTracker(); const e2 = [];
  tr2.onStrokeEnd = (s, why) => e2.push(why); tr2.dwellOk = () => false;
  tr2.begin(0);
  let t2 = feed(tr2, side(0), { t0: 0, ms: 600 });
  feed(tr2, still(800, 520), { t0: t2, ms: 1300, jitter: 2 });
  check('parado bem mais (1,1 s): termina mesmo incompleto', e2[0] === 'parado', e2.join());
}

// 10. Desenho lento (7 s) não é cortado pelo tempo máximo do traço
{
  const tr = new RuneTracker(); const ends = [];
  tr.onStrokeEnd = (s, why) => ends.push(why);
  tr.begin(0);
  let t = feed(tr, circle(600, 400, 180), { t0: 0, ms: 7000 });
  feed(tr, still(600, 220), { t0: t, ms: 900, jitter: 2 });
  check('círculo desenhado devagar (7 s): não corta no meio', ends[0] === 'parado' && rec.recognize(tr.strokePoints).id === 'circulo', ends.join());
}

console.log(failures ? `\n${failures} falha(s), ${passed} ok` : `Todos os ${passed} testes do rastreamento passaram.`);
process.exit(failures ? 1 : 0);
