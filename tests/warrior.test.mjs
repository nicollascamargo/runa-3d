// Testes do guerreiro, sem navegador:  node tests/warrior.test.mjs
// 1. Gestos: mãos sintéticas (os 21 pontos) passam pela mesma leitura da câmera (readHand + fuse, suavizada
//    como no HandInput) e vão para o reconhecedor do guerreiro, a 30 quadros por segundo.
// 2. Regras: caminhada, arco do Corte Horizontal, custos, modo de treino, inimigos indo atrás do mais perto.
import { fakeHand } from '../src/dev/fakeHand.js';
import { readHand, fuse, HAND_CONFIG, TRACKED } from '../src/input/hand/handReading.js';
import { WarriorGestures, classifyPose } from '../src/warrior/WarriorGestures.js';
import { Combat, COMBAT_CONFIG, makeUnit } from '../src/combat/Combat.js';
import { WARRIOR, abilityById } from '../src/warrior/abilities.js';
import { reachableTiles, arcTiles, bestArc, canUse, spend, resolveSlash, DIRS, devastadorTarget, resolveDevastador, armGuard, armCounter, counterStrike, investidaPlan, resolveInvestida, shockwavePlan, resolveShockwave } from '../src/warrior/warriorRules.js';
import { planTurn } from '../src/combat/enemyAI.js';

let failures = 0, passed = 0;
const check = (name, cond, extra = '') => { if (cond) passed++; else { failures++; console.log(`FALHOU: ${name} ${extra}`); } };
let seed = 3;
const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

// Passa uma sequência de mãos pelo reconhecedor. steps: [{ ms, pose, x0, x1, y0, y1, size, path? }]
// path(u) -> [x, y] (opcional) em vez da reta de (x0, y0) a (x1, y1). gap: ms sem quadros antes do passo.
function run(steps, { jitter = 0.002, enabled = ALL } = {}) {
  const g = new WarriorGestures();
  g.setEnabled(enabled);
  const fired = [], rejected = [];
  g.onGesture = r => fired.push(r);
  g.onReject = r => rejected.push(r);
  const prob = {};
  let t = 1000;
  for (const s of steps) {
    t += s.gap || 0;
    const n = Math.max(1, Math.round(s.ms / 33));
    for (let i = 0; i < n; i++) {
      const u = n > 1 ? i / (n - 1) : 1;
      const e = u * u * (3 - 2 * u); // acelera e freia, como a mão
      const [x, y] = s.path ? s.path(u) : [s.x0 + (s.x1 - s.x0) * e, s.y0 + (s.y1 - s.y0) * e];
      const hand = fakeHand({ pose: s.pose, x, y, size: s.size ?? 0.13, jitter, rand });
      const f = readHand(hand.landmarks[0], null, hand.gestures[0], 640, 480);
      const raw = fuse(f, HAND_CONFIG, 0);
      for (const k of TRACKED) prob[k] = (prob[k] ?? raw[k]) + (1 - Math.exp(-33 / HAND_CONFIG.smoothMs)) * (raw[k] - (prob[k] ?? raw[k]));
      g.frame({ t, lm: hand.landmarks[0], prob: { ...prob } });
      t += 33;
    }
  }
  // o fim: um pouco parado (a investida espera um instante para confirmar)
  const last = steps[steps.length - 1];
  if (!last.noTail) for (let i = 0; i < 10; i++) { const [x, y] = last.path ? last.path(1) : [last.x1, last.y1]; const hand = fakeHand({ pose: last.pose, x, y, size: last.size ?? 0.13, jitter, rand }); g.frame({ t, lm: hand.landmarks[0], prob: { ...prob } }); t += 33; }
  return { fired, rejected, g, ids: fired.map(f => f.id) };
}
const ALL = ['corteHorizontal', 'golpeDevastador', 'guardaDeFerro', 'investida', 'contraAtaque', 'ondaDeChoque'];
const still = (pose, ms = 300, x = 0.6, y = 0.6, size) => ({ ms, pose, x0: x, x1: x, y0: y, y1: y, size });
const move = (pose, ms, x0, x1, y0 = 0.6, y1 = y0, size) => ({ ms, pose, x0, x1, y0, y1, size });
const circle = (pose, ms, cx = 0.55, cy = 0.55, r = 0.12, turns = 1.08, size) => ({ ms, pose, size, path: u => [cx + r * Math.cos(-Math.PI / 2 + u * turns * Math.PI * 2), cy + r * Math.sin(-Math.PI / 2 + u * turns * Math.PI * 2) * 4 / 3] });
const only = (r, id) => r.ids.length === 1 && r.ids[0] === id;

// ---------- pose: espada (dois dedos juntos) e V (abertos), pela geometria ----------
{
  const pose = p => classifyPose(fakeHand({ pose: p }).landmarks[0], { Victory: 0.86 }).pose;
  check('pose: indicador e médio juntos = espada (mesmo com o MediaPipe dizendo "Victory")', pose('sword') === 'espada');
  check('pose: indicador e médio abertos = V', pose('two') === 'v');
  check('pose: punho, palma, apontando e pinça', pose('fist') === 'punho' && pose('open') === 'palma' && pose('point') === 'apontando' && pose('pinch') === 'pinça');
}

// ---------- Corte Horizontal: a espada varrendo para o lado ----------
{
  const r = run([still('sword'), move('sword', 300, 0.65, 0.42), still('sword', 200, 0.42)]);
  check('espada varrendo para a direita da tela: Corte Horizontal', only(r, 'corteHorizontal'), JSON.stringify(r.ids));
  check('direção certa (a imagem é espelhada: x da câmera diminuindo = direita na tela)', r.fired[0] && r.fired[0].dir === 1);
  const l = run([still('sword', 300, 0.42), move('sword', 300, 0.42, 0.65), still('sword', 200, 0.65)]);
  check('espada varrendo para a esquerda também vale (direção -1)', only(l, 'corteHorizontal') && l.fired[0].dir === -1);
  const v = run([still('two'), move('two', 300, 0.65, 0.42), still('two', 200, 0.42)]);
  check('V varrendo (dedos abertos): não é o corte, e avisa para juntar os dedos', v.ids.length === 0 && v.rejected.some(x => /junte/.test(x.reason)), JSON.stringify(v.rejected));
  check('punho varrendo (o gesto antigo): não é mais o corte', run([still('fist'), move('fist', 300, 0.65, 0.42), still('fist', 200, 0.42)]).ids.length === 0);
  check('mão aberta varrendo: nada', run([still('open'), move('open', 300, 0.65, 0.42), still('open', 200, 0.42)]).ids.length === 0);
  check('espada varrendo bem devagar (2 s): não é o corte', run([still('sword'), move('sword', 2000, 0.65, 0.42)]).ids.length === 0);
  check('espada com movimento curtinho: não é o corte', run([still('sword'), move('sword', 250, 0.6, 0.55), still('sword', 300, 0.55)]).ids.length === 0);
  check('espada parada 1,5 s: nada (nem contra-ataque)', run([still('sword', 1500)]).ids.length === 0);
  check('longe da câmera (mão pela metade): ainda reconhece', only(run([still('sword', 300, 0.6, 0.6, 0.065), move('sword', 300, 0.6, 0.48, 0.6, 0.6, 0.065), still('sword', 200, 0.48, 0.6, 0.065)]), 'corteHorizontal'));
  check('salto de um quadro: não dispara', run([still('sword', 300, 0.7), still('sword', 33, 0.3), still('sword', 300, 0.7)]).ids.length === 0);
}

// ---------- Golpe Devastador (punho descendo) e Investida (punho subindo) ----------
{
  check('punho descendo rápido: Golpe Devastador', only(run([still('fist', 300, 0.55, 0.35), move('fist', 300, 0.55, 0.55, 0.35, 0.62), still('fist', 200, 0.55, 0.62)]), 'golpeDevastador'));
  check('punho subindo rápido: Investida', only(run([still('fist', 300, 0.55, 0.65), move('fist', 280, 0.55, 0.55, 0.65, 0.38), still('fist', 400, 0.55, 0.38)]), 'investida'));
  const both = run([still('fist', 300, 0.55, 0.62), move('fist', 280, 0.55, 0.55, 0.62, 0.34), move('fist', 280, 0.55, 0.55, 0.34, 0.64), still('fist', 300, 0.55, 0.64)]);
  check('ergue o punho e desce logo (preparação do devastador): só o Golpe Devastador, sem investida', only(both, 'golpeDevastador'), JSON.stringify(both.ids));
  const palmDown = run([still('open', 300, 0.55, 0.35), move('open', 300, 0.55, 0.55, 0.35, 0.62), still('open', 200, 0.55, 0.62)]);
  check('mão aberta descendo: não golpeia e avisa para fechar o punho', palmDown.ids.length === 0 && palmDown.rejected.some(x => /punho/.test(x.reason)), JSON.stringify(palmDown.rejected));
  check('espada descendo: nada (não é o corte nem o devastador)', run([still('sword', 300, 0.55, 0.35), move('sword', 300, 0.55, 0.55, 0.35, 0.62), still('sword', 200, 0.55, 0.62)]).ids.length === 0);
  check('punho na diagonal forte: nada', run([still('fist', 300, 0.65, 0.35), move('fist', 300, 0.65, 0.45, 0.35, 0.6)]).ids.length === 0);
}

// ---------- posturas seguradas: Guarda de Ferro (palma) e Contra-ataque (V) ----------
{
  check('palma aberta parada 0,8 s: Guarda de Ferro', only(run([still('open', 900)]), 'guardaDeFerro'));
  check('palma aberta parada só 0,45 s: ainda não', run([still('open', 450), move('fist', 300, 0.6, 0.6, 0.6, 0.6)]).ids.length === 0);
  check('palma aberta andando: não é a guarda', run([move('open', 1200, 0.4, 0.75)]).ids.length === 0);
  check('palma segurada 3 s: a guarda dispara uma vez só', only(run([still('open', 3000)]), 'guardaDeFerro'));
  check('V parado 0,8 s: Contra-ataque', only(run([still('two', 900)]), 'contraAtaque'));
  check('V e espada não se confundem: espada parada não arma o contra-ataque; V varrendo não corta', run([still('sword', 1200)]).ids.length === 0 && run([still('two'), move('two', 300, 0.65, 0.42)]).ids.length === 0);
}

// ---------- Onda de Choque: círculo com o indicador ----------
{
  check('círculo com o indicador: Onda de Choque', only(run([still('point', 200, 0.55, 0.43), circle('point', 900)]), 'ondaDeChoque'));
  check('círculo no outro sentido também vale', only(run([still('point', 200, 0.55, 0.43), { ...circle('point', 900), path: u => [0.55 + 0.12 * Math.cos(-Math.PI / 2 - u * 1.08 * Math.PI * 2), 0.55 + 0.16 * Math.sin(-Math.PI / 2 - u * 1.08 * Math.PI * 2)] }]), 'ondaDeChoque'));
  check('meio círculo: nada', run([still('point', 200, 0.55, 0.43), circle('point', 600, 0.55, 0.55, 0.12, 0.5)]).ids.length === 0);
  check('linha reta apontando: nada', run([still('point'), move('point', 600, 0.4, 0.7)]).ids.length === 0);
  check('círculo pequenininho: nada', run([still('point', 200, 0.55, 0.53), circle('point', 700, 0.55, 0.55, 0.02)]).ids.length === 0);
  check('círculo com a mão aberta: nada', run([still('open', 200, 0.55, 0.43), circle('open', 900)]).ids.filter(i => i === 'ondaDeChoque').length === 0);
}

// ---------- pinça, desligados, perdas breves ----------
{
  const moves = [move('pinch', 300, 0.65, 0.42), move('pinch', 300, 0.55, 0.55, 0.35, 0.62), move('pinch', 300, 0.55, 0.55, 0.62, 0.35), still('pinch', 1200), circle('pinch', 900)];
  check('pinça (arrastando, subindo, descendo, parada, em círculo): nunca dispara habilidade', moves.every(m => run([still('pinch'), m]).ids.length === 0));
  check('só reconhece as habilidades ligadas (corte desligado: a espada varrendo não faz nada)', run([still('sword'), move('sword', 300, 0.65, 0.42), still('sword', 200, 0.42)], { enabled: ALL.filter(i => i !== 'corteHorizontal') }).ids.length === 0);
  const gap = run([still('open', 500), { ...still('open', 400), gap: 150 }]);
  check('perda breve do rastreamento (150 ms) no meio da guarda: ainda vale', only(gap, 'guardaDeFerro'));
  const jump = run([still('sword', 300, 0.65), { ...move('sword', 100, 0.42, 0.42), gap: 500 }, still('sword', 300, 0.42)]);
  check('a mão some 0,5 s e reaparece do outro lado: não vira corte', jump.ids.length === 0);
  const twice = run([still('sword'), move('sword', 300, 0.65, 0.42), move('sword', 300, 0.42, 0.65), still('sword', 900, 0.65), move('sword', 300, 0.65, 0.42), still('sword', 200, 0.42)]);
  check('golpe logo depois de outro é ignorado; depois do intervalo, vale de novo', twice.ids.length === 2, JSON.stringify(twice.ids));
}

// ---------- varreduras: muitos gestos variados de cada tipo, e o que mais disparou ----------
{
  const R = () => rand();
  const N = 120, results = {};
  const gens = {
    corteHorizontal: () => { const size = 0.07 + R() * 0.09, travel = (1.4 + R() * 1.6) * size, ms = 180 + R() * 330, dir = R() < 0.5 ? 1 : -1; const x0 = 0.5 + dir * travel / 2, y0 = 0.45 + R() * 0.3, drift = (R() - 0.5) * 0.5 * travel; return [still('sword', 200 + R() * 300, x0, y0, size), move('sword', ms, x0, x0 - dir * travel, y0, y0 + drift, size), still('sword', 250, x0 - dir * travel, y0 + drift, size)]; },
    golpeDevastador: () => { const size = 0.07 + R() * 0.09, travel = (1.5 + R() * 1.6) * size * 4 / 3, ms = 180 + R() * 330, x0 = 0.4 + R() * 0.2, y0 = 0.3 + R() * 0.1, drift = (R() - 0.5) * 0.4 * travel * 0.75; return [still('fist', 200 + R() * 300, x0, y0, size), move('fist', ms, x0, x0 + drift, y0, y0 + travel, size), still('fist', 250, x0 + drift, y0 + travel, size)]; },
    investida: () => { const size = 0.07 + R() * 0.09, travel = (1.5 + R() * 1.6) * size * 4 / 3, ms = 160 + R() * 280, x0 = 0.4 + R() * 0.2, y0 = 0.65 + R() * 0.1, drift = (R() - 0.5) * 0.4 * travel * 0.75; return [still('fist', 200 + R() * 300, x0, y0, size), move('fist', ms, x0, x0 + drift, y0, y0 - travel, size), still('fist', 450, x0 + drift, y0 - travel, size)]; },
    guardaDeFerro: () => { const size = 0.07 + R() * 0.09; return [still('open', 800 + R() * 900, 0.4 + R() * 0.2, 0.5 + R() * 0.2, size)]; },
    contraAtaque: () => { const size = 0.07 + R() * 0.09; return [still('two', 800 + R() * 900, 0.4 + R() * 0.2, 0.5 + R() * 0.2, size)]; },
    ondaDeChoque: () => { const size = 0.08 + R() * 0.06, r = (0.9 + R() * 0.7) * size, cx = 0.45 + R() * 0.1, cy = 0.5 + R() * 0.1, sgn = R() < 0.5 ? 1 : -1, ms = 600 + R() * 900; return [still('point', 200, cx, cy - r * 4 / 3, size), { ms, pose: 'point', size, path: u => [cx + r * Math.cos(-Math.PI / 2 + sgn * u * 1.1 * Math.PI * 2), cy + r * Math.sin(-Math.PI / 2 + sgn * u * 1.1 * Math.PI * 2) * 4 / 3] }]; },
  };
  for (const [id, gen] of Object.entries(gens)) {
    let ok = 0; const wrong = {};
    for (let i = 0; i < N; i++) { const r = run(gen(), { jitter: 0.004 * R() }); if (only(r, id)) ok++; else for (const x of r.ids) if (x !== id) wrong[x] = (wrong[x] || 0) + 1; }
    results[id] = { ok, wrong };
    console.log(`${id.padEnd(16)} ${ok} de ${N} reconhecidos${Object.keys(wrong).length ? ` · confundido com ${JSON.stringify(wrong)}` : ''}`);
    check(`varredura ${id}: pelo menos 95% (${ok}/${N})`, ok / N >= 0.95);
    check(`varredura ${id}: nunca vira outra habilidade`, !Object.keys(wrong).length, JSON.stringify(wrong));
  }
  // movimentos que não são gesto nenhum
  let fp = 0, M = 240; const what = {};
  const kinds = [
    () => [still('open', 300, 0.6, 0.5), move('open', 300 + R() * 300, 0.6, 0.6 + (R() - 0.5) * 0.1, 0.5, 0.75)],     // palma descendo
    () => [still('point', 300, 0.7, 0.6), move('point', 250 + R() * 300, 0.7, 0.3)],                                   // apontando de lado
    () => [still('fist', 300, 0.7, 0.6), move('fist', 1500 + R() * 1500, 0.7, 0.35)],                                  // punho arrastando devagar
    () => [still('fist', 1500 + R() * 1000, 0.4 + R() * 0.2, 0.6)],                                                     // punho parado
    () => [still('sword', 400), move('sword', 1200, 0.5, 0.6, 0.4, 0.7)],                                               // espada passeando devagar
    () => [still('pinch', 300), move('pinch', 400, 0.7, 0.35)],                                                         // pinça arrastando
    () => [still('open', 300, 0.3), move('open', 900, 0.3, 0.75, 0.5, 0.55)],                                           // palma passeando
    () => [still('point', 300, 0.5, 0.4), move('point', 900, 0.5, 0.6, 0.4, 0.7)],                                      // apontando passeando
    () => [still('point', 200, 0.55, 0.43), circle('point', 700, 0.55, 0.55, 0.11, 0.55)],                              // meio círculo
    () => [still('two', 400 + R() * 200), move('two', 500, 0.5, 0.6)],                                                  // V curto
  ];
  for (let i = 0; i < M; i++) { const r = run(kinds[i % kinds.length](), { jitter: 0.006 * R() }); if (r.ids.length) { fp++; for (const x of r.ids) what[x] = (what[x] || 0) + 1; } }
  console.log(`Falsos disparos: ${fp} de ${M} movimentos que não são gesto${fp ? ` (${JSON.stringify(what)})` : ''}`);
  check(`movimentos que não são gesto quase nunca disparam (${fp}/${M})`, fp / M <= 0.02);
}

// ---------- regras ----------
function arena() {
  const c = new Combat({ ...COMBAT_CONFIG });
  const mago = c.addUnit(makeUnit({ id: 'mago', name: 'Mago', team: 'player', maxHp: 120, maxMana: 100, defense: 1, tile: { col: 3, row: 4 } }));
  const w = c.addUnit(makeUnit({ id: 'guerreiro', name: 'Guerreiro', team: 'player', maxHp: WARRIOR.maxHp, defense: WARRIOR.defense, maxEnergy: WARRIOR.maxEnergy, energyRegen: WARRIOR.energyRegen, move: WARRIOR.move, maxActions: 1, tile: { col: 5, row: 2 } }));
  [[1, 1], [4, 0], [6, 2]].forEach(([col, row], i) => c.addUnit(makeUnit({ id: `boneco${i + 1}`, team: 'neutral', training: true, tile: { col, row } })));
  [[5, 1], [6, 3]].forEach(([col, row], i) => c.addUnit(makeUnit({ id: `auto${i + 1}`, team: 'enemy', maxHp: 110, defense: 2, move: 2, attack: 8, tile: { col, row } })));
  c.start();
  return { c, mago, w, U: id => c.units.find(u => u.id === id) };
}
const corte = abilityById('corteHorizontal');
{
  const { c, w } = arena();
  const r = reachableTiles(c, w);
  check('caminhada: até 3 casas', [...r.values()].every(p => p.length <= 3) && r.size > 0);
  check('caminhada: não entra em casa ocupada', !r.has('5,1') && !r.has('6,2') && !r.has('3,4'));
  c.addObstacle({ col: 4, row: 2 }, { kind: 'muralha', hp: 60 });
  const r2 = reachableTiles(c, w);
  check('caminhada: não atravessa muralha', !r2.has('4,2') && [...r2.values()].every(p => p.every(t => !(t.col === 4 && t.row === 2))));
  check('caminhada: sem movimento sobrando, nada', reachableTiles(c, w, 0).size === 0);
}
{
  const { c, w } = arena();
  eq('arco para o leste: as 3 casas da frente', arcTiles(c, { col: 3, row: 3 }, 0).map(t => `${t.col},${t.row}`).join(' '), '4,2 4,3 4,4');
  eq('arco na diagonal (sudeste)', arcTiles(c, { col: 3, row: 3 }, 1).map(t => `${t.col},${t.row}`).join(' '), '4,3 4,4 3,4');
  check('arco não sai do tabuleiro', arcTiles(c, { col: 7, row: 0 }, 7).length === 0 || arcTiles(c, { col: 7, row: 0 }, 7).every(t => c.inBounds(t)));
  const b = bestArc(c, w);
  check('melhor arco pega os dois inimigos e o boneco do lado (G5... G6 e F7)', b.hits.length >= 2, `${b.hits.map(h => h.id)} dir ${DIRS[b.dir]}`);
}
{
  const { c, w, U } = arena();
  check('pode usar no começo', canUse(c, w, corte).ok);
  const b = bestArc(c, w);
  spend(c, w, corte);
  check('gasta 15 de energia, 1 de recarga e a ação do turno', w.energy === 85 && c.cooldowns.corteHorizontal === 1 && w.actionsLeft === 0);
  eq('não pode de novo no mesmo turno', canUse(c, w, corte).reason, 'já agiu neste turno');
  const hp = new Map(b.hits.map(u => [u, u.hp]));
  const hits = resolveSlash(c, corte, b.tiles, 'c1');
  check('dano: 22 em boneco (defesa 0), 20 em autômato (defesa 2)', hits.every(h => h.amount === (h.target.defense === 2 ? 20 : 22)), hits.map(h => `${h.target.id}-${h.amount}`).join(' '));
  resolveSlash(c, corte, b.tiles, 'c1');
  check('o mesmo golpe não acerta duas vezes', b.hits.every(u => hp.get(u) - u.hp === (u.defense === 2 ? 20 : 22)));
  check('modo de treino: pode mesmo sem ação e não gasta nada', (() => { const e = w.energy; const ok = canUse(c, w, corte, { training: true }).ok; spend(c, w, corte, { training: true }); return ok && w.energy === e; })());
  check('as seis habilidades estão prontas (ready) de ponta a ponta', ['corteHorizontal', 'golpeDevastador', 'guardaDeFerro', 'investida', 'contraAtaque', 'ondaDeChoque'].every(id => abilityById(id).ready));
  check('uma habilidade marcada como não pronta é recusada', canUse(c, w, { ...abilityById('investida'), ready: false }).reason === 'ainda não disponível');
  for (const u of c.endPlayerTurn()) { c.beginUnitTurn(u); c.endUnitTurn(u); }
  c.startPlayerTurn();
  check('novo turno: energia +25 (até 100), ação e movimento de volta, recarga 0', w.energy === 100 && w.actionsLeft === 1 && w.movesLeft === 3 && c.cooldowns.corteHorizontal === 0, `${w.energy} ${w.actionsLeft} ${w.movesLeft}`);
  check('o mago continua com a mana dele', c.player.id === 'mago' && c.player.mana === 100);
  w.energy = 10;
  check('sem energia não usa', canUse(c, w, corte).reason.startsWith('energia insuficiente'));
}
{
  const { c, U } = arena();
  const a = U('auto2'); // G5, ao lado do guerreiro em F6
  const plan = planTurn(c, a, c.turnLimits(a));
  check('autômato ao lado do guerreiro ataca o guerreiro (o mais perto)', plan.attack && plan.attack.id === 'guerreiro', plan.attack && plan.attack.id);
}
// ---------- as outras cinco habilidades: regras ----------
const ab = id => ({ ...abilityById(id), ready: true });
const endRound = c => { const q = c.endPlayerTurn(); for (const u of q) { c.beginUnitTurn(u); c.endUnitTurn(u); } c.startPlayerTurn(); };
{
  // Golpe Devastador: alvo ao lado, dano alto, guarda quebrada (a defesa não conta por 2 turnos)
  const { c, w, U } = arena(); // guerreiro em 5,2; autômato 1 em 5,1 (ao lado); boneco 3 em 6,2 (ao lado); autômato 2 em 6,3 (diagonal)
  const dv = ab('golpeDevastador');
  const plan = devastadorTarget(c, w, 0);
  check('Golpe Devastador: escolhe um autômato ao lado (antes de boneco)', plan && plan.target.team === 'enemy', plan && plan.target.id);
  const a = plan.target, hp = a.hp;
  const hits = resolveDevastador(c, dv, plan, 'dv1');
  check('Golpe Devastador: 40 − 2 de defesa = 38, e a guarda quebrada', hits.length === 1 && hp - a.hp === 38 && a.statuses.has('guardaQuebrada'), `${hp} → ${a.hp}`);
  resolveDevastador(c, dv, plan, 'dv1');
  check('Golpe Devastador: o mesmo golpe não acerta duas vezes', hp - a.hp === 38);
  const h2 = c.damage(a, 22, 'fisico', { key: 'teste-quebra' });
  check('guarda quebrada: o próximo golpe ignora a defesa (22 e não 20)', h2.amount === 22, h2.amount);
  endRound(c); endRound(c);
  check('guarda quebrada acaba depois de 2 turnos do alvo', !a.statuses.has('guardaQuebrada'));
  const lonely = arena(); lonely.c.setUnitTile(lonely.w, { col: 0, row: 7 });
  check('Golpe Devastador: sem inimigo ao lado, sem alvo', devastadorTarget(lonely.c, lonely.w, 0) === null);
}
{
  // Guarda de Ferro: metade do dano recebido até o fim do próximo turno do guerreiro
  const { c, w, U } = arena();
  armGuard(c, w, ab('guardaDeFerro'));
  check('Guarda de Ferro armada no guerreiro', w.statuses.has('guardaDeFerro'));
  const q = c.endPlayerTurn();
  const auto = U('auto1'), hp = w.hp;
  c.meleeAttack(auto, w, 20, 'fisico', { key: 'g1' });
  check('Guarda de Ferro: dano pela metade no turno dos inimigos ((20 − 4) × 0,5 = 8)', hp - w.hp === 8, `${hp} → ${w.hp}`);
  for (const u of q) { c.beginUnitTurn(u); c.endUnitTurn(u); }
  c.startPlayerTurn();
  check('ainda vale no turno seguinte do guerreiro', w.statuses.has('guardaDeFerro'));
  endRound(c);
  check('acaba no fim do próximo turno dele', !w.statuses.has('guardaDeFerro'));
  const hp2 = w.hp; c.damage(w, 20, 'fisico', { key: 'g2' });
  check('sem a guarda: dano normal (20 − 4 = 16)', hp2 - w.hp === 16);
}
{
  // Contra-ataque: apara o próximo ataque corpo a corpo (sem dano), responde uma vez, sem cadeia
  const { c, w, U } = arena();
  const ca = ab('contraAtaque');
  armCounter(c, w, ca);
  const auto = U('auto1'), hpW = w.hp, hpA = auto.hp;
  let parries = 0, answered = 0;
  c.on('parry', e => { parries++; if (counterStrike(c, ca, e.attacker, `contra:${parries}`)) answered++; });
  c.endPlayerTurn();
  const r1 = c.meleeAttack(auto, w, 8, 'fisico', { key: 'a1' });
  check('Contra-ataque: o ataque corpo a corpo é aparado (sem dano no guerreiro)', r1.parried && w.hp === hpW);
  check('...e respondido: 20 − 2 de defesa = 18 no atacante, uma vez', answered === 1 && hpA - auto.hp === 18, `${hpA} → ${auto.hp}`);
  check('o aparar foi gasto (não fica armado)', !w.statuses.has('aparar'));
  const r2 = c.meleeAttack(U('auto2'), w, 8, 'fisico', { key: 'a2' });
  check('o segundo ataque entra normal (8 − 4 = 4) e não há segunda resposta', !r2.parried && hpW - w.hp === 4 && parries === 1);
  // sem recursão: o atacante também com aparar armado não devolve a resposta (a resposta é dano comum)
  const t2 = arena(); armCounter(t2.c, t2.w, ca); armCounter(t2.c, t2.U('auto1'), ca);
  let n = 0; t2.c.on('parry', e => { n++; if (n < 10) counterStrike(t2.c, ca, e.attacker, `k${n}`); });
  t2.c.meleeAttack(t2.U('auto1'), t2.w, 8, 'fisico', { key: 'x' });
  check('sem cadeia: a resposta não dispara o aparar do outro lado (uma aparada só)', n === 1 && t2.U('auto1').statuses.has('aparar'));
}
{
  // Investida: linha reta até o primeiro inimigo, caminho livre, para ao lado
  const { c, w, U } = arena();
  c.setUnitTile(w, { col: 1, row: 4 }); // B4... na linha da coluna 1: boneco 1 em 1,1 (3 casas acima)
  const plan = investidaPlan(c, w, 6, 4);
  check('Investida: acha um inimigo em linha reta e para na casa ao lado dele', plan.target && plan.path.length >= 1 && Math.max(Math.abs(plan.stop.col - plan.target.tile.col), Math.abs(plan.stop.row - plan.target.tile.row)) === 1, JSON.stringify(plan.stop));
  check('Investida: o caminho só tem casas livres e dentro do tabuleiro', plan.path.every(t => c.isWalkable(t, w)));
  c.addObstacle({ col: 1, row: 3 }, { kind: 'muralha', hp: 60 });
  const p2 = investidaPlan(c, w, 6, 4);
  check('Investida: não atravessa muralha (essa linha fica de fora)', !p2.target || !p2.path.some(t => t.col === 1 && t.row <= 3));
  const t3 = arena(); t3.c.setUnitTile(t3.w, { col: 0, row: 7 });
  for (const u of t3.c.units) if (u.team !== 'player') t3.c.setUnitTile(u, { col: 7, row: u.id === 'auto1' ? 0 : u.id === 'auto2' ? 1 : 2 + (u.id.slice(-1) | 0) });
  check('Investida: inimigo a mais de 4 casas, sem alvo (e explica)', !investidaPlan(t3.c, t3.w, 0, 4).target && /linha reta/.test(investidaPlan(t3.c, t3.w, 0, 4).why));
  const t4 = arena(); t4.c.setUnitTile(t4.w, { col: 3, row: 2 }); t4.c.setUnitTile(t4.mago, { col: 4, row: 2 }); t4.c.setUnitTile(t4.U('auto2'), { col: 6, row: 2 }); t4.c.setUnitTile(t4.U('boneco3'), { col: 7, row: 7 });
  const p4 = investidaPlan(t4.c, t4.w, 0, 4);
  check('Investida: não atravessa um aliado (o mago no caminho)', !p4.target || p4.dir !== 0);
  const t5 = arena(); const p5 = investidaPlan(t5.c, t5.w, 6, 4);
  check('Investida: inimigo colado (1 casa) também vale, sem andar', p5.target && p5.path.length === 0 && p5.stop.col === t5.w.tile.col && p5.stop.row === t5.w.tile.row);
  const hp = plan.target.hp, hits = resolveInvestida(c, ab('investida'), plan, 'iv1'); resolveInvestida(c, ab('investida'), plan, 'iv1');
  check('Investida: dano 18 (− defesa), uma vez só', hits.length === 1 && hp - plan.target.hp === 18 - plan.target.defense);
  // diagonal sem cortar quina de muralha
  const t6 = arena(); t6.c.setUnitTile(t6.w, { col: 2, row: 5 }); for (const u of t6.c.units) if (u.team !== 'player' && u.id !== 'auto1') t6.c.setUnitTile(u, { col: 7, row: u.id === 'auto2' ? 7 : u.id === 'boneco1' ? 6 : u.id === 'boneco2' ? 5 : 4 });
  t6.c.setUnitTile(t6.U('auto1'), { col: 4, row: 3 }); t6.c.addObstacle({ col: 3, row: 5 }, { kind: 'muralha', hp: 60 });
  check('Investida na diagonal: não passa pela quina de uma muralha', !investidaPlan(t6.c, t6.w, 7, 4).target);
}
{
  // Onda de Choque: dano em volta e empurrão de 1 casa só para casa livre
  const { c, w, U } = arena(); // guerreiro 5,2: auto1 5,1 (norte), boneco3 6,2 (leste), auto2 6,3 (sudeste)
  const os = ab('ondaDeChoque');
  c.setUnitTile(U('boneco2'), { col: 7, row: 2 }); // atrás do boneco 3: o empurrão dele fica bloqueado
  const plan = shockwavePlan(c, w, os);
  const hp = new Map(plan.hits.map(h => [h.unit, h.unit.hp]));
  const r = resolveShockwave(c, os, plan, 'os1');
  check('Onda de Choque: atinge os 3 vizinhos', r.hits.length === 3, r.hits.map(h => h.target.id).join());
  check('...dano 15 − defesa em cada um', plan.hits.every(h => hp.get(h.unit) - h.unit.hp === 15 - h.unit.defense));
  check('...empurra 1 casa para fora quem tem espaço (autômato 1 para 5,0; autômato 2 para 7,4)', U('auto1').tile.row === 0 && U('auto1').tile.col === 5 && U('auto2').tile.col === 7 && U('auto2').tile.row === 4, `${JSON.stringify(U('auto1').tile)} ${JSON.stringify(U('auto2').tile)}`);
  check('...e não empurra para casa ocupada (boneco 3 fica: o boneco 2 está atrás)', U('boneco3').tile.col === 6 && U('boneco3').tile.row === 2);
  resolveShockwave(c, os, plan, 'os1');
  check('a mesma onda não acerta duas vezes', plan.hits.every(h => hp.get(h.unit) - h.unit.hp === 15 - h.unit.defense));
  const t2 = arena(); t2.c.setUnitTile(t2.w, { col: 0, row: 3 }); t2.c.setUnitTile(t2.U('auto1'), { col: 0, row: 2 }); t2.c.addObstacle({ col: 0, row: 1 }, { kind: 'muralha', hp: 60 });
  const p2 = shockwavePlan(t2.c, t2.w, os); resolveShockwave(t2.c, os, p2, 'os2');
  check('não empurra para dentro de muralha nem para fora do tabuleiro', t2.U('auto1').tile.row === 2 && t2.U('auto1').tile.col === 0);
}
{
  // custos e recargas de todas
  const { c, w } = arena();
  for (const id of ['golpeDevastador', 'guardaDeFerro', 'investida', 'contraAtaque', 'ondaDeChoque']) {
    const a = ab(id), ok = canUse(c, w, a).ok;
    const e = w.energy; spend(c, w, a);
    check(`${a.name}: gasta ${a.energy} de energia e recarga ${a.cooldown}`, ok && e - w.energy === a.energy && c.cooldowns[id] === a.cooldown);
    Object.assign(w, { energy: 100, actionsLeft: 1 });
    check(`${a.name}: na recarga, não usa`, /recarga/.test(canUse(c, w, a).reason));
    c.cooldowns[id] = 0;
  }
  w.energy = 20;
  check('energia insuficiente para a Onda de Choque (35)', /energia insuficiente/.test(canUse(c, w, ab('ondaDeChoque')).reason));
}

function eq(name, got, want) { check(name, got === want, `(veio ${got}, esperado ${want})`); }

console.log(failures ? `\n${failures} falha(s), ${passed} ok` : `Todos os ${passed} testes do guerreiro passaram.`);
process.exit(failures ? 1 : 0);
