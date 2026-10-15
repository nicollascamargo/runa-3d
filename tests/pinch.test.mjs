// Teste da pinça, sem navegador:  node tests/pinch.test.mjs
// Sinais sintéticos da medida da pinça (distância polegar–indicador ÷ palma) a ~30 quadros por segundo, com
// ruído, quadros soltos e mão sumindo. Compara a regra antiga (a de HandInput.updatePinch até aqui) com o
// detector novo (src/input/hand/PinchDetector.js), no padrão e com calibração. Números sintéticos: o ruído real
// do MediaPipe na pinça é medido no modo de avaliação com a webcam.
import { PinchDetector, PINCH_CONFIG, pinchFromCalibration } from '../src/input/hand/PinchDetector.js';
import { HAND_CONFIG } from '../src/input/hand/handReading.js';

let failures = 0, passed = 0;
const check = (name, cond, extra = '') => { if (cond) passed++; else { failures++; console.log(`FALHOU: ${name} ${extra}`); } };
const line = s => process.stdout.write(s + '\n');
function makeRand(seed) { let s = seed; const r = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; const g = () => { let u = 0; for (let i = 0; i < 6; i++) u += r(); return (u - 3) / Math.sqrt(0.5); }; return { r, g }; }

// A regra antiga, igual à de antes (pressionar: abaixo de pinchOn por 2 quadros, ou abaixo de pinchDeep na hora,
// com o indicador aberto acima de 0,46; soltar: a menor medida entre 3D e 2D, suavizada, acima do limite).
class OldPinch {
  constructor() { this.pressed = false; this.below = 0; this.hold = null; this.openSince = 0; this.t = null; }
  update({ t, ratio, ratio2 = ratio, indexOpen = 1 }, { holding = false, armed = true } = {}) {
    const c = HAND_CONFIG, minR = Math.min(ratio, ratio2), dt = this.t === null ? 33 : t - this.t;
    this.t = t;
    this.hold = this.hold === null ? minR : this.hold + (1 - Math.exp(-dt / 45)) * (minR - this.hold);
    if (!this.pressed) {
      const can = armed && indexOpen > c.pinchIndexOpen;
      this.below = can && ratio < c.pinchOn ? this.below + 1 : 0;
      if (can && (ratio < c.pinchDeep || this.below >= c.pressFrames)) { this.pressed = true; this.below = 0; this.openSince = 0; return 'down'; }
      return '';
    }
    if (this.hold > (holding ? c.pinchOffHold : c.pinchOff)) {
      if (!this.openSince) this.openSince = t;
      if (t - this.openSince >= (holding ? c.releaseHoldMs : c.releaseMs)) { this.pressed = false; this.openSince = 0; return 'up'; }
    } else this.openSince = 0;
    return '';
  }
  lost(t, { holding = false } = {}) { if (!this.lostAt) this.lostAt = t; return t - this.lostAt > (this.pressed && holding ? HAND_CONFIG.lostGraceHoldMs : HAND_CONFIG.lostGraceMs) ? 'lost' : ''; }
  get braking() { return false; }
}
const oldBraking = ratio => ratio < HAND_CONFIG.pinchBrake; // o freio antigo: qualquer mão meio fechada

// Roda um sinal: prof(t) -> { ratio, ratio2?, indexOpen?, fist?, gone? }, durante ms. Devolve os eventos.
function play(det, prof, ms, { seed = 1, noise = 0.03, spikes = 0, holding = false, fps = 30 } = {}) {
  const { r, g } = makeRand(seed), ev = [];
  let t = 1000;
  const end = t + ms;
  while (t < end) {
    const p = prof(t - 1000);
    if (p.gone) { if (det.lost(t, { holding }) === 'lost') { ev.push({ e: 'lost', t: t - 1000 }); break; } }
    else {
      let ratio = Math.max(0.02, p.ratio + g() * noise);
      if (spikes && r() < spikes) ratio = r() < 0.5 ? 0.12 : 1.1; // um quadro solto, muito errado
      det.lostAt = 0;
      const e = det.update({ t, ratio, ratio2: p.ratio2 !== undefined ? Math.max(0.02, p.ratio2 + g() * noise) : ratio, indexOpen: p.indexOpen ?? 0.9, fist: p.fist ?? 0 }, { holding });
      if (e) ev.push({ e, t: t - 1000 });
    }
    t += 1000 / fps + (r() - 0.5) * 6;
  }
  return ev;
}
// curva suave de a para b entre t0 e t0+d
const ramp = (t, t0, d, a, b) => { const u = Math.min(1, Math.max(0, (t - t0) / d)), e = u * u * (3 - 2 * u); return a + (b - a) * e; };
const pinchProf = ({ open = 0.9, closed = 0.12, closeAt = 300, holdMs = 800, ratio2k = 1, indexOpen = 0.9 } = {}) => t => {
  const v = t < closeAt + 150 + holdMs ? ramp(t, closeAt, 150, open, closed) : ramp(t, closeAt + 150 + holdMs, 150, closed, open);
  return { ratio: v, ratio2: v * ratio2k, indexOpen };
};

const N = 200;
const rate = (make, prof, ms, opts, want) => { let ok = 0; for (let i = 0; i < N; i++) { const ev = play(make(), prof, ms, { ...opts, seed: 100 + i }); if (want(ev)) ok++; } return ok / N; };
const pct = v => `${(v * 100).toFixed(1)}%`;
const OLD = () => new OldPinch(), NEW = () => new PinchDetector(), CAL = cal => () => new PinchDetector(pinchFromCalibration(cal));
const oneDownUp = ev => ev.filter(e => e.e === 'down').length === 1 && ev.filter(e => e.e === 'up').length === 1;

line('Pinça (sinais sintéticos, 200 tentativas cada)                     antes     agora');
const rows = [];
const row = (name, a, b, extra = '') => { rows.push([name, a, b]); line(`${name.padEnd(64)} ${pct(a).padStart(7)}  ${pct(b).padStart(7)} ${extra}`); };

// 1. pinça normal (agarra uma vez, solta uma vez), segurando um personagem
const normal = [rate(OLD, pinchProf(), 1600, { holding: true }, oneDownUp), rate(NEW, pinchProf(), 1600, { holding: true }, oneDownUp)];
row('pinça normal: agarra e solta uma vez', ...normal);
check('pinça normal funciona sempre (agora)', normal[1] >= 0.99, pct(normal[1]));

// 2. quem abre pouco a mão (0,62) e está com a mão de lado (a medida 2D sai 25% menor), segurando um personagem
const weak = pinchProf({ open: 0.62, closed: 0.14, ratio2k: 0.75 });
const weakRates = [rate(OLD, weak, 1700, { holding: true }, oneDownUp), rate(NEW, weak, 1700, { holding: true }, oneDownUp), rate(CAL({ open: 0.62, closed: 0.14 }), weak, 1700, { holding: true }, oneDownUp)];
row('abre pouco a mão (0,62) e de lado: consegue soltar', weakRates[0], weakRates[1], `(calibrado ${pct(weakRates[2])})`);
check('quem abre pouco: solta no padrão novo na maioria das vezes, e calibrado quase sempre', weakRates[1] > weakRates[0] && weakRates[2] >= 0.97, weakRates.map(pct).join(' / '));

// 3. pinça incompleta (os dedos param a 0,42 sem encostar): não agarra
const partial = t => ({ ratio: ramp(t, 300, 200, 0.9, 0.42) });
const part = [rate(OLD, partial, 1500, {}, ev => !ev.length), rate(NEW, partial, 1500, {}, ev => !ev.length)];
row('pinça incompleta (para a 0,42): não agarra', ...part);
check('pinça incompleta não agarra', part[1] >= 0.98, pct(part[1]));

// 4. mão aberta tremendo, com quadros soltos muito errados (1 em 25): não agarra sozinha
const shaky = () => ({ ratio: 0.7 });
const sh = [rate(OLD, shaky, 4000, { noise: 0.06, spikes: 0.04 }, ev => !ev.length), rate(NEW, shaky, 4000, { noise: 0.06, spikes: 0.04 }, ev => !ev.length)];
row('mão aberta tremendo 4 s, com quadros soltos: nenhum clique falso', ...sh);
check('mão aberta tremendo: nada de clique falso (agora)', sh[1] >= 0.97 && sh[1] > sh[0], sh.map(pct).join(' / '));

// 5. pinça com o indicador curvado (ponta a 0,42 palmo do próprio nó): agarra
const curled = pinchProf({ indexOpen: 0.42 });
const cu = [rate(OLD, curled, 1600, { holding: true }, oneDownUp), rate(NEW, curled, 1600, { holding: true }, oneDownUp)];
row('pinça com o indicador curvado: agarra e solta', ...cu);
check('indicador curvado: a pinça funciona (agora)', cu[1] >= 0.98, pct(cu[1]));

// 6. punho (indicador dobrado, classificador certo de punho), apertando: não é pinça
const fist = t => ({ ratio: ramp(t, 300, 150, 0.9, 0.3), indexOpen: 0.25, fist: 0.85 });
const fi = [rate(OLD, fist, 1500, {}, ev => !ev.length), rate(NEW, fist, 1500, {}, ev => !ev.length)];
row('punho fechando: não vira pinça', ...fi);
check('punho não vira pinça', fi[1] >= 0.99, pct(fi[1]));

// 7. a mão some 600 ms no meio de um arrasto e volta: o personagem continua na mão
const gap = t => (t > 900 && t < 1500 ? { gone: true } : pinchProf({ holdMs: 1600 })(t));
const ga = [rate(OLD, gap, 2600, { holding: true }, ev => oneDownUp(ev) && !ev.some(e => e.e === 'lost')), rate(NEW, gap, 2600, { holding: true }, ev => oneDownUp(ev) && !ev.some(e => e.e === 'lost'))];
row('mão some 600 ms segurando um personagem: continua na mão', ...ga);
check('mão some 600 ms: a pinça segura (agora)', ga[1] >= 0.98 && ga[0] < 0.5, ga.map(pct).join(' / '));
// ...mas se sumir por mais de 0,7 s, avisa (quem chama devolve o personagem ou solta)
const long = t => (t > 900 ? { gone: true } : pinchProf({ holdMs: 1600 })(t));
check('mão some de vez: a pinça avisa ("lost")', rate(NEW, long, 2500, { holding: true }, ev => ev.some(e => e.e === 'lost')) >= 0.99);

// 8. tempo de reação: do instante em que os dedos passam do meio do caminho até o clique
{
  const react = (make) => { let s = 0, n = 0; for (let i = 0; i < N; i++) { const ev = play(make(), pinchProf(), 1600, { seed: 300 + i, holding: true }); const d = ev.find(e => e.e === 'down'); if (d) { s += d.t - 375; n++; } } return s / n; };
  const a = react(OLD), b = react(NEW);
  line(`tempo do meio do fechamento até agarrar (ms)                     ${a.toFixed(0).padStart(7)}  ${b.toFixed(0).padStart(7)}`);
  check('agarrar não fica mais lento que 40 ms além do antigo', b <= a + 40, `${b.toFixed(0)} contra ${a.toFixed(0)}`);
}

// 9. freio do cursor: a mão parada e meio fechada não freia mais; fechando de verdade, freia
{
  const d = new PinchDetector();
  let t = 0, braked = 0;
  for (let i = 0; i < 60; i++) { d.update({ t: t += 33, ratio: 0.5 + (i % 2 ? 0.02 : -0.02) }); if (d.braking) braked++; }
  check('mão relaxada e meio fechada (0,5), parada: o cursor não freia (antes freava sempre)', braked === 0 && oldBraking(0.5));
  const e = new PinchDetector();
  let any = false;
  t = 0;
  for (let i = 0; i < 20; i++) { e.update({ t: t += 33, ratio: 0.9 }); }
  for (let i = 0; i <= 5; i++) { e.update({ t: t += 33, ratio: 0.9 - i * 0.1 }); if (e.braking) any = true; }
  check('fechando de verdade: freia (o cursor não escorrega enquanto os dedos fecham)', any);
}

// 10. calibração: os limites vão para o meio certo entre a mão aberta e a fechada do jogador
{
  const c = pinchFromCalibration({ open: 0.7, closed: 0.1 });
  check('calibração: fecha perto de 1/3 do caminho, solta perto da metade, com histerese', c.on > 0.2 && c.on < 0.35 && c.off >= c.on + 0.08 && c.offHold > c.off && c.offHold < 0.7, `${c.on.toFixed(2)} / ${c.off.toFixed(2)} / ${c.offHold.toFixed(2)}`);
  const bad = pinchFromCalibration({ open: 0.3, closed: 0.25 });
  check('calibração com medidas ruins (pouca diferença): fica no padrão', bad.on === PINCH_CONFIG.on && bad.off === PINCH_CONFIG.off);
}

// 11. depois de um gesto (desarmada), a pinça não começa até os dedos abrirem
{
  const d = new PinchDetector();
  let t = 0, ev = '';
  for (let i = 0; i < 10; i++) ev = d.update({ t: t += 33, ratio: 0.1 }, { armed: false }) || ev;
  check('desarmada (logo depois de um gesto): não agarra', ev === '');
}

line(failures ? `\n${failures} falha(s), ${passed} ok` : `\nTodos os ${passed} testes da pinça passaram.`);
process.exit(failures ? 1 : 0);
