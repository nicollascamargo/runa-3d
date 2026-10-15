// Bancada de simulação do cursor da mão (usada por tests/cursor.test.mjs e para ajustar os números).
// Mãos sintéticas: ruído do MediaPipe (desvio padrão em fração da imagem), quadros a ~30 por segundo com
// intervalo irregular, quadros perdidos e falhas de um quadro; a câmera entrega cada quadro ~35 ms depois da
// captura e a inferência leva 12 a 24 ms. Números sintéticos: valem para o ruído suposto aqui.
import { OneEuro, HAND_CONFIG } from '../src/input/hand/handReading.js';
import { CursorFilter } from '../src/input/hand/CursorFilter.js';


export const SW = 1440, SH = 900;                 // tela
const AREA = { w: 0.7, h: 0.6 };           // fração da imagem que cobre a tela (padrão do jogo)
// ruído da âncora (fração da imagem): perto da ponta do dedo treme mais que perto do nó
export const NOISE = { tip35: 0.0019, knuckle15: 0.0014 };

export function makeRand(seed) { let s = seed; const r = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; const g = () => { let u = 0; for (let i = 0; i < 6; i++) u += r(); return (u - 3) / Math.sqrt(0.5); }; return { r, g }; }

// Trajetória verdadeira (área da câmera, 0 a 1) em função do tempo (s). Cenários:
export const SCENES = {
  parado: { dur: 3, f: () => [0.5, 0.5] },
  lento: { dur: 2.5, f: t => [0.3 + 0.15 * t, 0.5 + 0.05 * t], speed: Math.hypot(0.15, 0.05) },
  rapido: { dur: 0.8, f: t => [0.1 + 1.0 * t, 0.5 - 0.3 * t], speed: Math.hypot(1.0, 0.3) },
  // arrancada: parado 1 s e depois anda a 0,4 área/s
  arrancada: { dur: 2, f: t => [0.3 + Math.max(0, t - 1) * 0.4, 0.5], start: 1 },
  // gesto de apontar: 0,35 da tela em 200 ms (suave) e para
  salto: { dur: 1.6, f: t => { const u = Math.min(1, Math.max(0, (t - 0.5) / 0.2)), e = u * u * (3 - 2 * u); return [0.3 + 0.35 * e, 0.5]; }, end: 0.7 },
  // parada brusca: anda a 0,8 área/s e para de uma vez (o pior caso para o adiantamento na tela)
  freada: { dur: 1.5, f: t => [0.2 + 0.8 * Math.min(t, 0.7), 0.5], end: 0.7 },
};

// Gera os quadros: hora da captura (t), hora em que o quadro fica pronto para o jogo (proc: a câmera entrega
// ~35 ms depois e a inferência leva 12 a 24 ms) e a amostra crua.
export const CAM_LATENCY = 0.035;
function frames(scene, noise, seed, { outliers = true } = {}) {
  const { r, g } = makeRand(seed), out = [];
  let t = 0.05;
  while (t < scene.dur) {
    const [x, y] = scene.f(t);
    let nx = x + (g() * noise) / AREA.w, ny = y + (g() * noise) / AREA.h;
    if (outliers && r() < 1 / 300) { nx += 0.3; ny -= 0.2; } // o MediaPipe erra a mão por um quadro
    out.push({ t, proc: t + CAM_LATENCY + 0.012 + r() * 0.012, x: nx, y: ny, tx: x, ty: y });
    t += r() < 0.03 ? 0.0667 : 0.0333 + (r() - 0.5) * 0.008; // às vezes perde um quadro
  }
  return out;
}

// Os dois filtros. Devolvem uma função (amostra) -> { x, y } em área da câmera e, para a tela, display(tNow).
export function oldPipe() {
  const fx = new OneEuro(HAND_CONFIG.euro), fy = new OneEuro(HAND_CONFIG.euro);
  let last = null;
  return { name: 'antes', noise: NOISE.tip35, step: s => { last = { x: fx.filter(s.x * SW, s.proc) / SW, y: fy.filter(s.y * SH, s.proc) / SH }; return last; }, display: () => last };
}
export const PALM_AREA = 0.19; // palma (pulso ao nó do dedo médio) a ~50 cm, na área da câmera
export function newPipe(cfg = {}) {
  const f = new CursorFilter(cfg);
  return { name: 'agora', noise: NOISE.knuckle15, step: s => f.filter(s.x, s.y, s.t, PALM_AREA), display: tNow => f.predict(tNow), f };
}

// Métricas de um cenário: erro em pixels de tela, atraso em ms (erro ao longo do movimento ÷ velocidade).
export function run(pipeMaker, sceneName, seed) {
  const sc = SCENES[sceneName], P = pipeMaker(), fr = frames(sc, P.noise, seed);
  const px = (a, b) => Math.hypot((a.x - b.x) * SW, (a.y - b.y) * SH);
  const res = [];
  for (const s of fr) { const o = P.step(s); res.push({ s, o }); }
  const m = {};
  if (sceneName === 'parado') {
    const errs = res.slice(10).map(({ s, o }) => px(o, { x: s.tx, y: s.ty }));
    m.jitter = Math.sqrt(errs.reduce((a, e) => a + e * e, 0) / errs.length);
    m.max = Math.max(...errs);
  }
  if (sc.speed) {
    // atraso: quanto o cursor está atrás da mão, em tempo (só a parte do meio do movimento)
    const mid = res.filter(({ s }) => s.t > 0.4 && s.t < sc.dur - 0.05);
    const lagPx = mid.reduce((a, { s, o }) => a + px(o, { x: s.tx, y: s.ty }), 0) / mid.length;
    m.lagMs = (lagPx / (sc.speed * Math.hypot(SW, SH) / Math.SQRT2)) * 1000;
  }
  if (sceneName === 'arrancada') {
    const base = res.find(({ s }) => s.t >= sc.start - 0.05).o;
    const moved = res.find(({ s, o }) => s.t > sc.start && px(o, base) > 20);
    m.startMs = moved ? (moved.s.t - sc.start) * 1000 : Infinity;
  }
  if (sceneName === 'salto') {
    const fin = sc.f(sc.dur), after = res.filter(({ s }) => s.t > sc.end);
    const settled = after.find(({ s }, i) => after.slice(i).every(({ o }) => px(o, { x: fin[0], y: fin[1] }) < 6));
    m.settleMs = settled ? (settled.s.t - sc.end) * 1000 : Infinity;
    m.overshoot = Math.max(0, ...after.map(({ o }) => (o.x - fin[0]) * SW));
  }
  // na tela, depois de uma parada brusca: o quanto o cursor desenhado passa do ponto (px)
  if (sceneName === 'freada') {
    const P2 = pipeMaker(), fr2 = frames(sc, P2.noise, seed, { outliers: false }), fin = sc.f(sc.dur);
    let k = 0, over = 0;
    for (let tr = 0.3; tr < sc.dur; tr += 1 / 60) {
      while (k < fr2.length && fr2[k].proc <= tr) P2.step(fr2[k++]);
      const d = P2.display(tr);
      if (d) over = Math.max(over, (d.x - fin[0]) * SW);
    }
    m.screenOver = over;
  }
  // na tela (60 quadros por segundo): distância entre o cursor desenhado e a mão naquele instante
  if (sceneName === 'lento' || sceneName === 'rapido') {
    let sum = 0, n = 0, k = 0;
    const P2 = pipeMaker(), fr2 = frames(sc, P2.noise, seed);
    for (let tr = 0.4; tr < sc.dur - 0.05; tr += 1 / 60) {
      while (k < fr2.length && fr2[k].proc <= tr) P2.step(fr2[k++]);
      const d = P2.display(tr);
      if (!d) continue;
      const [x, y] = sc.f(tr); // onde a mão está agora (o cursor chega atrasado pela câmera e pela inferência)
      sum += px(d, { x, y }); n++;
    }
    m.screenPx = sum / n;
  }
  return m;
}

export const avg = (maker, scene, key) => { let s = 0; const N = 12; for (let i = 0; i < N; i++) s += run(maker, scene, 100 + i)[key]; return s / N; };
export function measure(maker) {
  return {
    jitter: avg(maker, 'parado', 'jitter'), maxRest: avg(maker, 'parado', 'max'),
    lagSlow: avg(maker, 'lento', 'lagMs'), lagFast: avg(maker, 'rapido', 'lagMs'),
    start: avg(maker, 'arrancada', 'startMs'), settle: avg(maker, 'salto', 'settleMs'), over: avg(maker, 'salto', 'overshoot'),
    screenSlow: avg(maker, 'lento', 'screenPx'), screenFast: avg(maker, 'rapido', 'screenPx'), screenOver: avg(maker, 'freada', 'screenOver'),
  };
}
