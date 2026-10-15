// Bancada do cursor da mão, sem navegador:  node tests/cursor.test.mjs
// Compara o filtro antigo (One Euro eixo a eixo, em pixels de tela, com a hora do processamento e a âncora a 35%
// do caminho até a ponta do dedo) com o novo (src/input/hand/CursorFilter.js: One Euro 2D na área da câmera,
// hora da captura, âncora perto do nó do dedo, recusa de salto de um quadro e adiantamento na tela).
// SÃO NÚMEROS SINTÉTICOS (tests/cursorBench.mjs): mostram o comportamento do filtro com o ruído suposto ali,
// não a precisão com uma webcam de verdade (para isso, o modo de avaliação no jogo).
import { OneEuro, HAND_CONFIG } from '../src/input/hand/handReading.js';
import { CursorFilter, CURSOR_CONFIG } from '../src/input/hand/CursorFilter.js';
import { measure, oldPipe, newPipe, makeRand } from './cursorBench.mjs';

let failures = 0, passed = 0;
const check = (name, cond, extra = '') => { if (cond) passed++; else { failures++; console.log(`FALHOU: ${name} ${extra}`); } };
const line = s => process.stdout.write(s + '\n');
const R = { antes: measure(oldPipe), agora: measure(() => newPipe()) };
// o mesmo filtro novo, mas com a âncora antiga (perto da ponta do dedo): separa o efeito do filtro do da âncora
R.filtro = measure(() => { const p = newPipe(); p.noise = 0.0019; return p; });
const f1 = v => v.toFixed(1);
line('Cursor (números sintéticos, tela 1440×900, média de 12 sementes)            antes     agora');
line(`tremor parado (px, raiz da média dos quadrados)                       ${f1(R.antes.jitter).padStart(8)}  ${f1(R.agora.jitter).padStart(8)}`);
line(`maior desvio parado (px; inclui falhas de um quadro do MediaPipe)     ${f1(R.antes.maxRest).padStart(8)}  ${f1(R.agora.maxRest).padStart(8)}`);
line(`atraso movendo devagar (ms)                                           ${f1(R.antes.lagSlow).padStart(8)}  ${f1(R.agora.lagSlow).padStart(8)}`);
line(`atraso movendo rápido (ms)                                            ${f1(R.antes.lagFast).padStart(8)}  ${f1(R.agora.lagFast).padStart(8)}`);
line(`arrancada: tempo até o cursor andar 20 px (ms, desde a captura)       ${f1(R.antes.start).padStart(8)}  ${f1(R.agora.start).padStart(8)}`);
line(`apontar (0,35 da tela em 200 ms): tempo para assentar a 6 px (ms)     ${f1(R.antes.settle).padStart(8)}  ${f1(R.agora.settle).padStart(8)}`);
line(`apontar: passou do ponto (px)                                         ${f1(R.antes.over).padStart(8)}  ${f1(R.agora.over).padStart(8)}`);
line(`na tela, movendo devagar: distância do cursor à mão (px)              ${f1(R.antes.screenSlow).padStart(8)}  ${f1(R.agora.screenSlow).padStart(8)}`);
line(`na tela, movendo rápido: distância do cursor à mão (px)               ${f1(R.antes.screenFast).padStart(8)}  ${f1(R.agora.screenFast).padStart(8)}`);
line(`na tela, parada brusca: passou do ponto (px)                          ${f1(R.antes.screenOver).padStart(8)}  ${f1(R.agora.screenOver).padStart(8)}`);
line(`(só o filtro novo, com a âncora antiga: tremor ${f1(R.filtro.jitter)} px, atraso devagar ${f1(R.filtro.lagSlow)} ms, assenta ${f1(R.filtro.settle)} ms)`);

check('tremor parado não piora', R.agora.jitter <= R.antes.jitter, `${f1(R.agora.jitter)} contra ${f1(R.antes.jitter)}`);
check('falha de um quadro do MediaPipe não vira salto do cursor', R.agora.maxRest < 15, f1(R.agora.maxRest));
check('atraso movendo devagar menor', R.agora.lagSlow < R.antes.lagSlow, `${f1(R.agora.lagSlow)} contra ${f1(R.antes.lagSlow)}`);
check('arrancada não mais lenta', R.agora.start <= R.antes.start, `${f1(R.agora.start)} contra ${f1(R.antes.start)}`);
check('assenta mais rápido depois de apontar', R.agora.settle <= R.antes.settle, `${f1(R.agora.settle)} contra ${f1(R.antes.settle)}`);
check('na tela, o cursor fica mais perto da mão em movimento', R.agora.screenSlow < R.antes.screenSlow && R.agora.screenFast < R.antes.screenFast);
check('adiantar na tela não faz o cursor passar muito do ponto numa freada (até 10 px)', R.agora.screenOver <= 10, f1(R.agora.screenOver));
check('só o filtro (sem trocar a âncora) já melhora tremor e atraso', R.filtro.jitter < R.antes.jitter && R.filtro.lagSlow < R.antes.lagSlow && R.filtro.settle < R.antes.settle);

// o filtro novo não depende do tamanho da tela (o antigo dependia: beta em pixels por segundo)
{
  const f = new CursorFilter(), g = new CursorFilter(), { g: gauss } = makeRand(7);
  let t = 0, maxDiff = 0;
  for (let i = 0; i < 90; i++, t += 1 / 30) {
    const x = 0.3 + 0.2 * t + gauss() * 0.002, y = 0.5 + gauss() * 0.002;
    const a = f.filter(x, y, t), b = g.filter(x, y, t); // as mesmas amostras: a tela não entra
    maxDiff = Math.max(maxDiff, Math.abs(a.x - b.x));
  }
  const oldSmall = new OneEuro(HAND_CONFIG.euro), oldBig = new OneEuro(HAND_CONFIG.euro), { g: g2 } = makeRand(7);
  let od = 0; t = 0;
  for (let i = 0; i < 90; i++, t += 1 / 30) { const x = 0.3 + 0.2 * t + g2() * 0.002; const a = oldSmall.filter(x * 1280, t) / 1280, b = oldBig.filter(x * 2560, t) / 2560; od = Math.max(od, Math.abs(a - b)); }
  check('o filtro novo trabalha na área da câmera (igual em qualquer tela); o antigo mudava com a tela', maxDiff === 0 && od > 0.001, `antigo: diferença ${(od * 100).toFixed(2)}% da tela entre 1280 e 2560 px`);
}

// salto de um quadro recusado; salto confirmado aceito (a mão foi achada em outro lugar)
{
  const f = new CursorFilter();
  for (let i = 0; i < 20; i++) f.filter(0.5, 0.5, i / 30);
  const a = f.filter(0.85, 0.2, 20 / 30);
  const b = f.filter(0.5, 0.5, 21 / 30);
  check('falha de um quadro (salto de 0,46 da tela) é ignorada', Math.abs(a.x - 0.5) < 0.01 && Math.abs(b.x - 0.5) < 0.01 && f.rejected === 1);
  f.filter(0.85, 0.2, 22 / 30);
  const c = f.filter(0.85, 0.2, 23 / 30);
  check('salto confirmado no quadro seguinte: o cursor vai direto (sem arrastar pelo caminho)', Math.abs(c.x - 0.85) < 0.01);
}

// perda de rastreamento: depois de um buraco, o filtro não "escorrega" da posição velha
{
  const f = new CursorFilter();
  for (let i = 0; i < 20; i++) f.filter(0.3, 0.5, i / 30);
  const p = f.filter(0.42, 0.5, 20 / 30 + 0.4); // a mão voltou 0,4 s depois, perto
  check('mão volta depois de 0,4 s: o cursor chega lá em um quadro (o buraco não vira atraso)', Math.abs(p.x - 0.42) < 0.02, p.x.toFixed(3));
}

// adiantamento na tela: parado não escorrega; andando, adianta no máximo predictMs
{
  const f = new CursorFilter();
  for (let i = 0; i < 30; i++) f.filter(0.5, 0.5, i / 30);
  const still = f.predict(30 / 30 + 0.016);
  check('parado: a tela não adianta nada', still.x === f.x && still.y === f.y);
  for (let i = 30; i < 60; i++) f.filter(0.5 + (i - 30) * 0.02, 0.5, i / 30);
  const ahead = f.predict(59 / 30 + 0.5); // muito depois do último quadro
  const maxAhead = f.speed * CURSOR_CONFIG.predictMs / 1000;
  check('andando: adianta pela velocidade, com teto', ahead.x > f.x && ahead.x - f.x <= maxAhead + 1e-9);
}

line(failures ? `\n${failures} falha(s), ${passed} ok` : `\nTodos os ${passed} testes do cursor passaram.`);
process.exit(failures ? 1 : 0);
