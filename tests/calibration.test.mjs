// Teste da calibração do jogador, sem navegador:  node tests/calibration.test.mjs
// Mãos sintéticas (os 21 pontos) passam pela mesma leitura da câmera (readHand) e pelos passos da calibração:
// mão aberta, pinça três vezes, apontar, alcance e tremor. Confere o perfil e os limites pessoais da pinça.
import { HandCalibration, areaFromSamples } from '../src/input/hand/handCalibration.js';
import { pinchFromCalibration, PINCH_CONFIG } from '../src/input/hand/PinchDetector.js';
import { readHand } from '../src/input/hand/handReading.js';
import { fakeHand } from '../src/dev/fakeHand.js';

let failures = 0, passed = 0;
const check = (name, cond, extra = '') => { if (cond) passed++; else { failures++; console.log(`FALHOU: ${name} ${extra}`); } };
let seed = 3;
const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const read = (pose, x = 0.5, y = 0.7, jitter = 0.002) => { const h = fakeHand({ pose, x, y, jitter, rand }); return readHand(h.landmarks[0], [], h.gestures[0]); };

const cal = new HandCalibration();
let t = 0, st;
const feed = (pose, n, opts = {}) => { for (let i = 0; i < n; i++) { t += 33; const f = read(pose, opts.x, opts.y); st = cal.sample({ t, f, pen: pose === 'point' ? 0.85 : 0.05, anchor: opts.anchor ? opts.anchor(i) : { x: 0.5, y: 0.5 } }); if (st.done) return true; } return false; };

// 1. mão aberta: com a mão fechada não avança; aberta, termina e mede a abertura
cal.start('aberta', t);
feed('fist', 20);
check('mão aberta: com o punho fechado, não avança e pede para abrir', st.progress === 0 && /Abra/.test(st.msg), st.msg);
check('mão aberta: aberta e parada, termina', feed('open', 80));
check('mede a abertura natural da pinça (polegar–indicador ÷ palma)', Math.abs(cal.results.aberta.open - 1.23) < 0.1, cal.results.aberta.open.toFixed(2));

// 2. pinça: três ciclos fechar/abrir
cal.start('pinca', t);
let done = false;
for (let c = 0; c < 3 && !done; c++) { feed('pinch', 6); done = feed('point', 6); }
check('pinça: três vezes fechar e abrir terminam o passo', done && cal.results.pinca.cycles === 3);
check('mede o "fechado" da pinça e o indicador na pinça', cal.results.pinca.closed < 0.15 && cal.results.pinca.indexOpen > 0.5, `${cal.results.pinca.closed.toFixed(2)} / ${cal.results.pinca.indexOpen.toFixed(2)}`);

// 3. apontar
cal.start('apontar', t);
check('apontar: termina com o indicador esticado', feed('point', 70));

// 4. alcance: passeia em volta (de 0,2 a 0,8 da imagem) e para no meio
cal.start('alcance', t);
const path = i => { const a = i * 0.25; return { x: 0.5 + 0.3 * Math.cos(a), y: 0.45 + 0.25 * Math.sin(a * 1.3) }; };
feed('point', Math.ceil(6000 / 33), { anchor: path });
done = feed('point', 60, { anchor: () => ({ x: 0.5 + (rand() - 0.5) * 0.004, y: 0.45 + (rand() - 0.5) * 0.004 }) });
const A = cal.results.alcance;
check('alcance: a área da câmera cobre onde a mão foi', done && A.camArea.x0 < 0.3 && A.camArea.x1 > 0.7 && A.camArea.y0 < 0.3 && A.camArea.y1 > 0.6, JSON.stringify(A.camArea));
check('mede o tremor com a mão parada', A.tremor > 0 && A.tremor < 0.004, A.tremor && A.tremor.toFixed(4));

// 5. runa de teste e o perfil
cal.setRune({ ok: true, ms: 3200 });
const P = cal.profile();
check('perfil: pinça, caneta, alcance, cursor e sugestão', P.pinch && P.pen && P.camArea && P.cursor && P.sugestao === 'normal', JSON.stringify({ pinch: P.pinch, pen: P.pen, sugestao: P.sugestao }));
const lim = pinchFromCalibration(P.pinch);
check('limites pessoais da pinça entre o fechado e o aberto deste jogador', lim.on > P.pinch.closed && lim.offHold < P.pinch.open && lim.on < lim.off && lim.off < lim.offHold, `${lim.on.toFixed(2)} ${lim.off.toFixed(2)} ${lim.offHold.toFixed(2)}`);
check('caneta: encosta abaixo de como a pose de apontar é lida', P.pen.on < 0.85 && P.pen.off < P.pen.on);

// passo que não deu certo: sem pinça medida, o perfil não mexe na pinça (fica no padrão do jogo)
{
  const c2 = new HandCalibration({ stepTimeoutMs: 2000 });
  let t2 = 0, s2;
  c2.start('aberta', t2);
  for (let i = 0; i < 80 && !(s2 && s2.done); i++) { t2 += 33; s2 = c2.sample({ t: t2, f: read('open') }); }
  c2.start('pinca', t2);
  for (let i = 0; i < 100 && !(s2 && s2.done && c2.results.pinca); i++) { t2 += 33; s2 = c2.sample({ t: t2, f: read('point') }); }
  check('pinça nunca feita: o passo termina por tempo', c2.results.pinca && c2.results.pinca.why === 'tempo');
  check('...e o perfil não traz pinça (fica no padrão)', !c2.profile().pinch);
  check('limites de pinça sem calibração = padrão', pinchFromCalibration(undefined).on === PINCH_CONFIG.on);
}

// a área da câmera nunca fica pequena demais (mão que quase não andou)
{
  const a = areaFromSamples([0.5, 0.51, 0.49, 0.5], [0.5, 0.5, 0.51, 0.49]);
  check('alcance mínimo garantido (mão que quase não andou)', a.x1 - a.x0 >= 0.249 && a.y1 - a.y0 >= 0.249);
}

console.log(failures ? `\n${failures} falha(s), ${passed} ok` : `Todos os ${passed} testes da calibração passaram.`);
process.exit(failures ? 1 : 0);
