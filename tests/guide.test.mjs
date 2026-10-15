// Teste do traçado guiado (ímã), sem navegador:  node tests/guide.test.mjs
// A caneta segue o trilho da runa com tremor e desvio; rabiscos e saltos não podem completar a runa.
import { RuneGuide, GUIDE_LEVELS } from '../src/runes/RuneGuide.js';
import { RUNE_IDS } from '../src/runes/runeShapes.js';

let failures = 0, passed = 0;
const check = (name, cond, extra = '') => { if (cond) passed++; else { failures++; console.log(`FALHOU: ${name} ${extra}`); } };
let seed = 11;
const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 - 0.5; };
const box = { x: 700, y: 450, size: 380 };

// percorre o trilho de um traço (de 'from' a 'to', fração), a ~30 quadros por segundo, com tremor e desvio lateral
function trace(g, s, { from = 0, to = 1, wobble = 22, steps = 50, reverse = false } = {}) {
  const st = g.strokes[s], pts = st.pts, n = pts.length;
  for (let k = 0; k <= steps; k++) {
    let u = from + (to - from) * (k / steps);
    if (reverse) u = 1 - u;
    const i = st.closed ? ((Math.round(u * n) % n) + n) % n : Math.max(0, Math.min(n - 1, Math.round(u * (n - 1))));
    const off = Math.sin(k * 0.7) * wobble;
    g.sample(pts[i][0] + off + rand() * 8, pts[i][1] - off * 0.6 + rand() * 8, true);
  }
}

// 1. Cada runa traçada por cima, com tremor de até ~22 px, fica pronta
for (const id of RUNE_IDS) {
  const g = new RuneGuide(id, box);
  g.strokes.forEach((st, s) => { g.penUp(); trace(g, s, { from: st.closed ? 0.0 : 0, to: st.closed ? 1.02 : 1 }); });
  check(`${id}: traçada por cima fica pronta`, g.done, `${(g.progress * 100).toFixed(0)}%`);
}

// 2. Sentido contrário e começo no meio (formas fechadas)
{
  const g = new RuneGuide('circulo', box);
  trace(g, 0, { from: 0.4, to: 1.45, reverse: true });
  check('círculo de trás para a frente, começando no meio', g.done, `${(g.progress * 100).toFixed(0)}%`);
}

// 3. Pela metade não está pronta; o que acendeu continua aceso
{
  const g = new RuneGuide('triangulo', box);
  trace(g, 0, { from: 0, to: 0.5 });
  const half = g.progress;
  check('metade do triângulo: não está pronta', !g.done && half > 0.4 && half < 0.6, `${(half * 100).toFixed(0)}%`);
  g.penUp();
  trace(g, 0, { from: 0.5, to: 1 });
  check('continuando depois de levantar a caneta, fica pronta', g.done);
}

// 4. Rabisco não completa a runa
{
  const g = new RuneGuide('circulo', box);
  let x = box.x, y = box.y;
  for (let k = 0; k < 150; k++) { x += rand() * 120; y += rand() * 120; x = Math.max(box.x - 260, Math.min(box.x + 260, x)); y = Math.max(box.y - 260, Math.min(box.y + 260, y)); g.sample(x, y, true); }
  check('rabisco de 5 segundos não completa o círculo', !g.done && g.progress < 0.5, `${(g.progress * 100).toFixed(0)}%`);
}

// 5. Pontos soltos em cima do trilho (saltos) não acendem nada
{
  const g = new RuneGuide('circulo', box);
  const pts = g.strokes[0].pts;
  for (let k = 0; k < 200; k++) g.sample(...pts[(k * 37) % pts.length], true);
  check('saltos de ponto em ponto não acendem o trilho', g.progress < 0.25, `${(g.progress * 100).toFixed(0)}%`);
}

// 6. Longe do trilho não gruda; perto gruda
{
  const g = new RuneGuide('circulo', box);
  const far = g.sample(box.x, box.y, true);
  check('no centro do círculo (longe do trilho) não gruda', !far.onPath && !far.snapped);
  const p = g.strokes[0].pts[0];
  const near = g.sample(p[0] + 40, p[1] + 10, true);
  const r = near.snapped && near.snapped.rail;
  check('a 40 px do trilho, gruda (a caneta mostrada fica quase em cima do trilho)', near.onPath && Math.hypot(near.snapped.x - r.x, near.snapped.y - r.y) < 0.2 * Math.hypot(p[0] + 40 - r.x, p[1] + 10 - r.y) + 1);
}

// 7. Caneta levantada (mouse sem botão) mostra o ímã mas não acende
{
  const g = new RuneGuide('v', box);
  const pts = g.strokes[0].pts;
  for (const p of pts) g.sample(p[0], p[1], false);
  check('passar sem apertar não acende', g.progress === 0);
}

// 8. Raio duplo: os dois traços precisam acender
{
  const g = new RuneGuide('raioDuplo', box);
  trace(g, 0);
  check('raio duplo com um traço só: não está pronto', !g.done);
  g.penUp();
  trace(g, 1);
  check('raio duplo com os dois traços: pronto', g.done);
  check('trechos acesos para desenhar', g.litStrokes().length >= 2);
}

// ---------- níveis Fácil e Normal, continuidade e interrupções (com o relógio das amostras) ----------
{
  const F = GUIDE_LEVELS.facil, Nm = GUIDE_LEVELS.normal;
  // percorre de 'from' a 'to' (fração do traço) com hora: dt ms por amostra a partir de t0; devolve a hora final
  const run = (g, from, to, { t0 = 0, dt = 33, wobble = 14, s = 0 } = {}) => {
    const st = g.strokes[s], n = st.pts.length, steps = Math.max(2, Math.round(Math.abs(to - from) * n / 2));
    let t = t0;
    for (let k = 0; k <= steps; k++, t += dt) {
      const u = from + (to - from) * (k / steps), i = st.closed ? ((Math.round(u * n) % n) + n) % n : Math.max(0, Math.min(n - 1, Math.round(u * (n - 1))));
      g.sample(st.pts[i][0] + Math.sin(k * 0.7) * wobble + rand() * 6, st.pts[i][1] - Math.cos(k * 0.5) * wobble * 0.6 + rand() * 6, true, t);
    }
    return t;
  };
  for (const id of RUNE_IDS) {
    const g = new RuneGuide(id, box, F);
    g.strokes.forEach((st, si) => { g.penUp(); run(g, 0, 0.75, { s: si }); });
    check(`Fácil: ${id} com 75% traçado está pronta`, g.done, `${(g.progress * 100).toFixed(0)}%`);
    const h = new RuneGuide(id, box, F);
    h.strokes.forEach((st, si) => { h.penUp(); run(h, 0, 0.66, { s: si }); });
    check(`Fácil: ${id} com 66% ainda não (pede ~72%)`, !h.done, `${(h.progress * 100).toFixed(0)}%`);
  }
  {
    const g = new RuneGuide('triangulo', box, Nm);
    run(g, 0, 0.77);
    check('Normal: 77% ainda não basta (pede 80%)', !g.done, `${(g.progress * 100).toFixed(0)}%`);
    run(g, 0.77, 0.85, { t0: 5000 });
    check('Normal: com 85% vale', g.done);
  }
  // continuidade: 75% aceso em pedaços curtos (passadas soltas, de lá para cá) não fecha a runa
  {
    const g = new RuneGuide('circulo', box, F);
    for (let k = 0; k < 10; k++) { g.penUp(); const a = k * 0.1, b = a + 0.075; if (k % 2) run(g, b, a, { t0: k * 1000, wobble: 0 }); else run(g, a, b, { t0: k * 1000, wobble: 0 }); }
    check('continuidade: 75% em 10 pedaços curtos, indo e voltando, não completa', g.progress >= 0.72 && !g.done, `${(g.progress * 100).toFixed(0)}%, maior trecho ${(g.longestRun(g.strokes[0]) * 100).toFixed(0)}%, varredura ${(g.strokes[0].bestSweep * 100).toFixed(0)}%`);
  }
  // vai e volta pelo mesmo trecho (sem andar pela runa): acende, mas não completa
  {
    const g = new RuneGuide('triangulo', box, F);
    let t = 0;
    for (let k = 0; k < 8; k++) t = run(g, k % 2 ? 0.45 : 0, k % 2 ? 0 : 0.45, { t0: t });
    check('vaivém num trecho (sem varrer a runa): não completa', !g.done, `${(g.progress * 100).toFixed(0)}%`);
  }
  // a câmera perde a mão por 350 ms e ela volta 25% à frente: o trecho do meio acende
  {
    const g = new RuneGuide('circulo', box, F);
    let t = run(g, 0, 0.35);
    g.pause(t);
    t = run(g, 0.6, 0.9, { t0: t + 350 });
    check('interrupção de 350 ms: a mão volta 25% à frente e o trecho do meio acende', g.done && g.bridges === 1, `${(g.progress * 100).toFixed(0)}% pontes ${g.bridges}`);
  }
  // buraco nas amostras (sem 'pause', só o relógio: 300 ms sem nada), mesma coisa
  {
    const g = new RuneGuide('triangulo', box, F);
    let t = run(g, 0, 0.3);
    t = run(g, 0.55, 0.85, { t0: t + 300 });
    check('buraco de 300 ms nas amostras também é atravessado', g.done && g.bridges === 1, `${(g.progress * 100).toFixed(0)}%`);
  }
  // o mesmo salto sem interrupção (a mão estava sendo vista) não acende o meio
  {
    const g = new RuneGuide('circulo', box, F);
    const t = run(g, 0, 0.35);
    run(g, 0.6, 0.9, { t0: t });
    check('salto de 25% sem interrupção não acende o trecho pulado', !g.done && g.bridges === 0, `${(g.progress * 100).toFixed(0)}%`);
  }
  // interrupção longa demais (1 s): recomeça dali, sem acender o meio
  {
    const g = new RuneGuide('circulo', box, F);
    let t = run(g, 0, 0.35);
    g.pause(t);
    run(g, 0.6, 0.9, { t0: t + 1000 });
    check('interrupção longa (1 s): não atravessa', g.bridges === 0 && g.progress < 0.7, `${(g.progress * 100).toFixed(0)}%`);
  }
  // saída curta do trilho, ficando perto dele, e volta à frente: atravessa; saída longe: não
  {
    const make = far => {
      const g = new RuneGuide('circulo', box, F), st = g.strokes[0], n = st.pts.length;
      let t = run(g, 0, 0.35);
      const i0 = Math.round(0.4 * n), out = far ? 3.5 : 1.6, c = [box.x, box.y];
      for (let k = 0; k < 8; k++, t += 33) { const p = st.pts[(i0 + k * 2) % n], dx = p[0] - c[0], dy = p[1] - c[1], L = Math.hypot(dx, dy); g.sample(p[0] + dx / L * g.snapPx * out, p[1] + dy / L * g.snapPx * out, true, t); }
      run(g, 0.6, 0.9, { t0: t });
      return g;
    };
    const near = make(false), far = make(true);
    check('saída curta perto do trilho (até ~2 faixas) e volta à frente: atravessa', near.done && near.bridges === 1, `${(near.progress * 100).toFixed(0)}%`);
    check('saída para longe do trilho: não atravessa', far.bridges === 0 && !far.done, `${(far.progress * 100).toFixed(0)}%`);
  }
  // tremor forte (±40 px) ainda completa no Fácil
  {
    const g = new RuneGuide('losango', box, F);
    run(g, 0, 0.9, { wobble: 40 });
    check('tremor forte (±40 px) seguindo o trilho: completa no Fácil', g.done, `${(g.progress * 100).toFixed(0)}%`);
  }
  // rabiscos e movimentos soltos com relógio (30 quadros/s, às vezes a câmera perde a mão): quantos completam?
  // (referência, medida com o traçado guiado de antes, que pedia 90% aceso: rabisco rápido 3,8%, reta 1,3%)
  {
    const kinds = {
      'rabisco rápido (5 s, mão sacudindo)': { step: 120, n: 150, max: { facil: 0.05, normal: 0.02 } },
      'rabisco lento (5 s)': { step: 50, n: 150, max: { facil: 0.02, normal: 0.01 } },
      'um movimento reto': { line: true, max: { facil: 0.015, normal: 0.01 } },
    };
    for (const [lvl, cfg] of [['facil', F], ['normal', Nm]]) {
      for (const [name, K] of Object.entries(kinds)) {
        let done = 0; const N = 500;
        for (let trial = 0; trial < N; trial++) {
          const id = RUNE_IDS[trial % RUNE_IDS.length], g = new RuneGuide(id, box, cfg);
          let t = 0;
          if (K.line) {
            const a = rand() * 6, x0 = box.x - Math.cos(a) * 300, y0 = box.y - Math.sin(a) * 300;
            for (let i = 0; i < 25; i++) g.sample(x0 + Math.cos(a) * 25 * i, y0 + Math.sin(a) * 25 * i, true, t += 33);
          } else {
            let x = box.x + rand() * 300, y = box.y + rand() * 300;
            for (let k = 0; k < K.n; k++) {
              x = Math.max(box.x - 260, Math.min(box.x + 260, x + rand() * K.step)); y = Math.max(box.y - 260, Math.min(box.y + 260, y + rand() * K.step));
              t += rand() < 0.04 ? 250 : 33; // às vezes a câmera perde a mão
              if (rand() < 0.03) g.pause(t);
              g.sample(x, y, true, t);
            }
          }
          if (g.done) done++;
        }
        console.log(`${lvl === 'facil' ? 'Fácil ' : 'Normal'} · ${name.padEnd(36)} completaram ${(done / N * 100).toFixed(1)}%`);
        check(`${lvl}: ${name} completa no máximo ${(K.max[lvl] * 100).toFixed(1)}%`, done / N <= K.max[lvl], `${(done / N * 100).toFixed(1)}%`);
      }
    }
  }
  // traçados de verdade, com desvio lateral (a mão ondula em volta do trilho) e tremor: quantos completam?
  // (antes: ±10 px 100%, ±25 px 90%, ±45 px 80%)
  {
    for (const [lvl, cfg, mins] of [['facil', F, [0.95, 0.88, 0.75]], ['normal', Nm, [0.93, 0.85, 0.72]]]) {
      [10, 25, 45].forEach((w, wi) => {
        let ok = 0; const N = 240;
        for (let k = 0; k < N; k++) {
          const id = RUNE_IDS[k % 8], g = new RuneGuide(id, box, cfg);
          let t = 0;
          for (const [si, st] of g.strokes.entries()) {
            if (si) g.penUp();
            const n = st.pts.length, rev = rand() < 0.3, s0 = st.closed ? Math.floor((rand() + 0.5) * n) : 0, steps = Math.round(1.05 * n / 2.5), ph = rand() * 6;
            for (let j = 0; j <= steps && !g.done; j++) {
              let u = j / steps * 1.05; if (rev) u = -u;
              const i = st.closed ? ((s0 + Math.round(u * n)) % n + n) % n : Math.max(0, Math.min(n - 1, Math.round((rev ? 1 + u : u) * (n - 1))));
              const a = i > 0 ? i - 1 : i + 1, tx = st.pts[i][0] - st.pts[a][0], ty = st.pts[i][1] - st.pts[a][1], L = Math.hypot(tx, ty) || 1;
              const off = Math.sin(j * 0.35 + ph) * w + rand() * w * 0.5;
              g.sample(st.pts[i][0] - ty / L * off + rand() * 6, st.pts[i][1] + tx / L * off + rand() * 6, true, t += 33);
            }
          }
          if (g.done) ok++;
        }
        console.log(`${lvl === 'facil' ? 'Fácil ' : 'Normal'} · traçado com desvio de ±${w} px: completaram ${(ok / N * 100).toFixed(0)}%`);
        check(`${lvl}: traçado com desvio de ±${w} px completa em pelo menos ${(mins[wi] * 100).toFixed(0)}%`, ok / N >= mins[wi], `${(ok / N * 100).toFixed(0)}%`);
      });
    }
  }
}

console.log(failures ? `\n${failures} falha(s), ${passed} ok` : `Todos os ${passed} testes do traçado guiado passaram.`);
process.exit(failures ? 1 : 0);
