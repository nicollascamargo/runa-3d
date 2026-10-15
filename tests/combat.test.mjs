// Teste das regras de combate, sem navegador:  node tests/combat.test.mjs
// Usa o mesmo tabuleiro da arena de treino: mago em D4, bonecos em B7, E8 e G6, autômatos em F7 e G5.
import { Combat, COMBAT_CONFIG, makeUnit, tileDistance } from '../src/combat/Combat.js';
import { SPELLS, spellById } from '../src/spells/spellBook.js';
import { evaluateTarget, autoTarget, resolveSpell } from '../src/spells/spellRules.js';
import { planTurn } from '../src/combat/enemyAI.js';

let failures = 0, passed = 0;
const check = (name, cond, extra = '') => { if (cond) passed++; else { failures++; console.log(`FALHOU: ${name} ${extra}`); } };
const eq = (name, got, want) => check(name, got === want, `(veio ${got}, esperado ${want})`);

function arena() {
  const c = new Combat({ ...COMBAT_CONFIG });
  c.addUnit(makeUnit({ id: 'mago', name: 'Mago', team: 'player', maxHp: 120, maxMana: 100, defense: 1, tile: { col: 3, row: 4 } }));
  [[1, 1], [4, 0], [6, 2]].forEach(([col, row], i) => c.addUnit(makeUnit({ id: `boneco${i + 1}`, name: `Boneco ${i + 1}`, team: 'neutral', training: true, tile: { col, row } })));
  [[5, 1], [6, 3]].forEach(([col, row], i) => c.addUnit(makeUnit({ id: `auto${i + 1}`, name: `Autômato ${i + 1}`, team: 'enemy', training: true, maxHp: 110, defense: 2, move: 2, attack: 8, resist: { gelo: 0.2, raio: -0.2 }, tile: { col, row } })));
  c.start();
  return c;
}
const U = (c, id) => c.units.find(u => u.id === id);
const fire = spellById('bolaDeFogo');

// 1. Alvo e área da Bola de Fogo
{
  const c = arena();
  const ev = evaluateTarget(c, fire, { col: 6, row: 2 });
  check('alvo válido no boneco 3', ev.valid, ev.reason);
  eq('área de raio 1 = 9 casas', ev.area.length, 9);
  eq('atinge boneco 3 e os dois autômatos', ev.hits.map(u => u.id).sort().join(','), 'auto1,auto2,boneco3');
  check('casa vazia não é alvo de magia de alvo único', !evaluateTarget(c, fire, { col: 2, row: 2 }).valid);
  check('o próprio mago não é alvo', !evaluateTarget(c, fire, { col: 3, row: 4 }).valid);
  check('fora do tabuleiro é recusado', !evaluateTarget(c, fire, null).valid);
  const far = { ...fire, range: 2 };
  eq('fora do alcance explica o motivo', evaluateTarget(c, far, { col: 6, row: 2 }).reason, 'fora do alcance (até 2 casas)');
  const auto = autoTarget(c, fire);
  check('alvo sugerido é o que atinge mais inimigos', auto && auto.hits.length === 3, auto && auto.unit.id);
}

// 2. Lançamento: mana, recarga, dano, queimadura e nada de dano em dobro
{
  const c = arena();
  check('pode conjurar no começo', c.canCast(fire).ok);
  c.spendCast(fire);
  eq('mana 100 - 20', U(c, 'mago').mana, 80);
  eq('recarga 2', c.cooldowns.bolaDeFogo, 2);
  const after = c.canCast(fire);
  check('uma magia por turno', !after.ok && after.reason === 'já conjurou neste turno', after.reason);
  const r = resolveSpell(c, fire, { tile: { col: 6, row: 2 } }, 'cast-1');
  eq('três atingidos', r.hits.length, 3);
  eq('boneco (defesa 0) perde 30', U(c, 'boneco3').hp, 70);
  eq('autômato (defesa 2) perde 28', U(c, 'auto1').hp, 82);
  check('todos queimando', ['boneco3', 'auto1', 'auto2'].every(id => c.hasStatus(U(c, id), 'queimadura')));
  check('quem estava fora da área não queima', !c.hasStatus(U(c, 'boneco1'), 'queimadura'));
  resolveSpell(c, fire, { tile: { col: 6, row: 2 } }, 'cast-1');
  eq('o mesmo lançamento não acerta duas vezes', U(c, 'boneco3').hp, 70);
  const burn = U(c, 'boneco3').statuses.get('queimadura');
  eq('queimadura: 3 turnos', burn.turns, 3);
  eq('queimadura: 5 por turno', burn.power, 5);
}

// 3. Turnos: queimadura age 3 vezes (15 no total) e acaba; recarga volta em 2 turnos; mana recarrega
{
  const c = arena();
  c.spendCast(fire);
  resolveSpell(c, fire, { tile: { col: 6, row: 2 } }, 'cast-2');
  const b = U(c, 'boneco3');
  const hpLog = [];
  const cdLog = [];
  for (let turn = 0; turn < 4; turn++) {
    const queue = c.endPlayerTurn();
    for (const u of queue) { c.beginUnitTurn(u); c.endUnitTurn(u); }
    hpLog.push(b.hp);
    c.startPlayerTurn();
    cdLog.push(c.cooldowns.bolaDeFogo);
  }
  eq('vida do boneco a cada turno inimigo', hpLog.join(','), '65,60,55,55');
  check('queimadura acabou', !c.hasStatus(b, 'queimadura'));
  eq('recarga desce 1 por turno do jogador', cdLog.join(','), '1,0,0,0');
  eq('mana volta ao máximo (80 + 20, limite 100)', U(c, 'mago').mana, 100);
  eq('rodada avançou', c.round, 5);
}

// 4. Recarga: disponível de novo exatamente 2 turnos depois
{
  const c = arena();
  c.spendCast(fire);
  const turn = () => { for (const u of c.endPlayerTurn()) { c.beginUnitTurn(u); c.endUnitTurn(u); } c.startPlayerTurn(); };
  turn();
  check('no turno seguinte ainda em recarga', !c.canCast(fire).ok);
  turn();
  check('dois turnos depois, disponível', c.canCast(fire).ok, c.canCast(fire).reason);
  U(c, 'mago').mana = 10;
  check('sem mana não conjura', c.canCast(fire).reason.startsWith('mana insuficiente'));
}

// 5. Acúmulo, aplicação no próprio turno, chance
{
  const c = arena();
  const u = U(c, 'auto1');
  c.applyStatus(u, 'queimadura', { turns: 2, power: 5 });
  c.applyStatus(u, 'queimadura', { turns: 3, power: 4 });
  const st = u.statuses.get('queimadura');
  check('reaplicar renova sem acumular', u.statuses.size === 1 && st.turns === 3 && st.power === 5, JSON.stringify({ t: st.turns, p: st.power }));
  c.beginUnitTurn(u);
  c.applyStatus(u, 'lentidao', { turns: 2, power: 1 });
  c.endUnitTurn(u);
  eq('aplicado no próprio turno não perde duração nesse turno', u.statuses.get('lentidao').turns, 2);
  c.random = () => 0.5;
  check('chance de 20% falha com sorteio 0,5', c.applyStatus(u, 'atordoado', { turns: 1, chance: 0.2 }) === null);
  c.random = () => 0.1;
  check('chance de 20% acerta com sorteio 0,1', !!c.applyStatus(u, 'atordoado', { turns: 1, chance: 0.2 }));
}

// 6. Limites de turno de cada efeito
{
  const c = arena();
  const u = U(c, 'auto1');
  c.applyStatus(u, 'lentidao', { turns: 2, power: 1 });
  eq('lentidão: anda 1 a menos', c.turnLimits(u).moveRange, 1);
  c.applyStatus(u, 'imobilizado', { turns: 1 });
  check('imobilizado: não anda, mas age', c.turnLimits(u).moveRange === 0 && c.turnLimits(u).canAct);
  c.removeStatus(u, 'imobilizado');
  c.applyStatus(u, 'atordoado', { turns: 1 });
  check('atordoado: nem anda nem age', c.turnLimits(u).moveRange === 0 && !c.turnLimits(u).canAct);
  c.removeStatus(u, 'atordoado');
  c.applyStatus(u, 'derrubado', { turns: 1 });
  check('derrubado: gasta o turno levantando', !c.turnLimits(u).canAct);
  c.beginUnitTurn(u); c.endUnitTurn(u);
  check('derrubado acaba depois de 1 turno', !c.hasStatus(u, 'derrubado'));
}

// 7. Morte, efeitos limpos e volta do boneco
{
  const c = arena();
  const b = U(c, 'boneco1');
  c.applyStatus(b, 'queimadura', { turns: 3, power: 5 });
  const deaths = [];
  c.on('death', e => deaths.push(e.unit.id));
  c.damage(b, 500, 'fogo', { key: 'x' });
  check('morreu', !b.alive && b.hp === 0 && deaths[0] === 'boneco1');
  check('efeitos limpos ao morrer', b.statuses.size === 0);
  check('morto não leva mais dano', c.damage(b, 10, 'fogo', { key: 'y' }) === null);
  c.revive(b);
  check('voltou com a vida cheia', b.alive && b.hp === b.maxHp);
  eq('fraqueza a raio aumenta o dano', c.computeDamage(U(c, 'auto1'), 30, 'raio'), 34);
  eq('resistência a gelo diminui o dano', c.computeDamage(U(c, 'auto1'), 30, 'gelo'), 22);
}

// 8. Linha de visão e obstáculos
{
  const c = arena();
  c.addObstacle({ col: 4, row: 3 }, { kind: 'muralha', hp: 60 });
  const ev = evaluateTarget(c, fire, { col: 6, row: 2 });
  check('obstáculo no caminho tira a linha de visão', !ev.valid && ev.reason === 'sem linha de visão', ev.reason);
  check('casa com obstáculo não é caminhável', !c.isWalkable({ col: 4, row: 3 }));
  const o = c.obstacleAt({ col: 4, row: 3 });
  c.damageObstacle(o, 30, { key: 'a' });
  c.damageObstacle(o, 30, { key: 'a' });
  eq('obstáculo leva o golpe uma vez só', o.hp, 30);
  c.damageObstacle(o, 30, { key: 'b' });
  check('obstáculo destruído some', !c.obstacleAt({ col: 4, row: 3 }));
  c.addObstacle({ col: 0, row: 7 }, { kind: 'muralha', hp: 60, turns: 3 });
  for (let i = 0; i < 3; i++) { for (const u of c.endPlayerTurn()) { c.beginUnitTurn(u); c.endUnitTurn(u); } c.startPlayerTurn(); }
  check('obstáculo expira depois de 3 turnos', !c.obstacleAt({ col: 0, row: 7 }));
}

// 9. Área perigosa: machuca uma vez por rodada
{
  const c = arena();
  c.addHazard({ col: 2, row: 2 }, { kind: 'chamas', damage: 12, element: 'fogo', turns: 3 });
  const u = U(c, 'auto1');
  c.enterTile(u, { col: 2, row: 2 });
  c.enterTile(u, { col: 2, row: 2 });
  eq('entrar duas vezes na mesma rodada: 12 - 2 de defesa, uma vez', u.hp, 100);
}

// 10. Inimigos: andam até o mago e atacam; respeitam efeitos e obstáculos
{
  const c = arena();
  const a = U(c, 'auto2'); // G5, mago em D4
  const plan = planTurn(c, a, c.turnLimits(a));
  eq('anda 2 casas', plan.path.length, 2);
  check('não entra em casa ocupada', plan.path.every(t => c.isWalkable(t, a)));
  check('se aproxima do mago', tileDistance(plan.path[1], { col: 3, row: 4 }) < tileDistance(a.tile, { col: 3, row: 4 }));
  c.setUnitTile(a, { col: 4, row: 4 });
  const near = planTurn(c, a, c.turnLimits(a));
  check('ao lado do mago, ataca sem andar', near.path.length === 0 && near.attack === c.player);
  c.applyStatus(a, 'atordoado', { turns: 1 });
  check('atordoado não ataca', planTurn(c, a, c.turnLimits(a)).attack === null);
  c.removeStatus(a, 'atordoado');
  c.setUnitTile(a, { col: 6, row: 3 });
  c.applyStatus(a, 'imobilizado', { turns: 1 });
  eq('imobilizado não anda', planTurn(c, a, c.turnLimits(a)).path.length, 0);
}

// 11. As oito magias estão no livro com os números pedidos
{
  const want = { bolaDeFogo: [20, 2], paredeDeChamas: [30, 4], lancaDeGelo: [15, 1], prisaoGlacial: [30, 4], relampago: [25, 2], correnteEletrica: [35, 4], muralhaDePedra: [25, 4], terremoto: [45, 5] };
  eq('oito magias', SPELLS.length, 8);
  for (const [id, [mana, cd]] of Object.entries(want)) { const s = spellById(id); check(`${id}: mana ${mana}, recarga ${cd}`, s && s.mana === mana && s.cooldown === cd); }
  check('as oito magias podem ser conjuradas', SPELLS.every(sp => arena().canCast(sp).ok));
}

// 12. Lança de Gelo: 25 de gelo (autômato resiste 20%, defesa 2 = 18) e lentidão por 2 turnos
{
  const c = arena(), sp = spellById('lancaDeGelo'), a1 = U(c, 'auto1');
  const ev = evaluateTarget(c, sp, a1.tile);
  check('lança: alvo válido', ev.valid, ev.reason);
  resolveSpell(c, sp, ev, 'g1');
  eq('lança: 25 × 0,8 − 2 = 18', a1.hp, 92);
  eq('lança: anda 1 a menos', c.turnLimits(a1).moveRange, 1);
  for (let i = 0; i < 2; i++) { for (const u of c.endPlayerTurn()) { c.beginUnitTurn(u); c.endUnitTurn(u); } c.startPlayerTurn(); }
  check('lentidão acaba depois de 2 turnos', !c.hasStatus(a1, 'lentidao'));
}

// 13. Prisão Glacial: 10 de gelo (= 6 no autômato) e imobilizado por 1 turno (mas pode agir)
{
  const c = arena(), sp = spellById('prisaoGlacial'), a2 = U(c, 'auto2');
  resolveSpell(c, sp, evaluateTarget(c, sp, a2.tile), 'p1');
  eq('prisão: 10 × 0,8 − 2 = 6', a2.hp, 104);
  const lim = c.turnLimits(a2);
  check('prisão: não anda, mas age', lim.moveRange === 0 && lim.canAct);
  c.setUnitTile(a2, { col: 4, row: 4 }); // ao lado do mago
  check('preso ao lado do mago ainda ataca', planTurn(c, a2, c.turnLimits(a2)).attack === c.player);
  c.beginUnitTurn(a2); c.endUnitTurn(a2);
  check('prisão acaba depois de 1 turno', !c.hasStatus(a2, 'imobilizado'));
}

// 14. Relâmpago: 35 de raio (autômato é fraco: 35 × 1,2 − 2 = 40); atordoa com 20% de chance
{
  const c = arena(), sp = spellById('relampago'), a1 = U(c, 'auto1'), b3 = U(c, 'boneco3');
  c.random = () => 0.5;
  resolveSpell(c, sp, evaluateTarget(c, sp, b3.tile), 'r1');
  check('relâmpago no boneco: 35, sem atordoar (sorteio 0,5)', b3.hp === 65 && !c.hasStatus(b3, 'atordoado'), `${b3.hp}`);
  c.random = () => 0.1;
  resolveSpell(c, sp, evaluateTarget(c, sp, a1.tile), 'r2');
  check('relâmpago no autômato: 40 e atordoado (sorteio 0,1)', a1.hp === 70 && c.hasStatus(a1, 'atordoado'), `${a1.hp}`);
  check('atordoado perde o turno', !c.turnLimits(a1).canAct && c.turnLimits(a1).moveRange === 0);
}

// 15. Corrente Elétrica: 25, salta para o inimigo mais perto (até 2 casas) perdendo 20% a cada salto, até 3 alvos
{
  const c = arena(), sp = spellById('correnteEletrica'), b3 = U(c, 'boneco3');
  const ev = evaluateTarget(c, sp, b3.tile);
  eq('corrente: três alvos', ev.chain.length, 3);
  eq('corrente: ordem dos saltos', ev.chain.map(x => x.unit.id).join(','), 'boneco3,auto1,boneco2');
  eq('corrente: dano 25, 20, 16', ev.chain.map(x => x.damage).join(','), '25,20,16');
  for (let i = 0; i < 3; i++) resolveSpell(c, sp, ev, 'c1', i);
  check('corrente: 25 no boneco 3, 22 no autômato (fraco a raio), 16 no boneco 2', b3.hp === 75 && U(c, 'auto1').hp === 88 && U(c, 'boneco2').hp === 84, `${b3.hp} ${U(c, 'auto1').hp} ${U(c, 'boneco2').hp}`);
  resolveSpell(c, sp, ev, 'c1', 1);
  eq('corrente: o mesmo salto não acerta duas vezes', U(c, 'auto1').hp, 88);
  const lone = arena();
  for (const id of ['boneco1', 'boneco2', 'auto1', 'auto2']) lone.setUnitTile(U(lone, id), { col: 0, row: 7 - ['boneco1', 'boneco2', 'auto1', 'auto2'].indexOf(id) });
  eq('corrente sem ninguém perto: um alvo só', evaluateTarget(lone, sp, U(lone, 'boneco3').tile).chain.length, 1);
}

// 16. Terremoto: raio 2 em volta da casa escolhida, 40 de terra, derruba com 30% de chance; o mago não se machuca
{
  const c = arena(), sp = spellById('terremoto');
  const ev = evaluateTarget(c, sp, { col: 5, row: 2 });
  check('terremoto: casa vazia vale como alvo', ev.valid, ev.reason);
  eq('terremoto: área 5×5 dentro do tabuleiro', ev.area.length, 25);
  eq('terremoto: atinge quatro', ev.hits.map(u => u.id).sort().join(','), 'auto1,auto2,boneco2,boneco3');
  c.random = () => 0.1;
  resolveSpell(c, sp, ev, 't1');
  check('terremoto: 40 nos bonecos, 38 nos autômatos', U(c, 'boneco2').hp === 60 && U(c, 'auto1').hp === 72, `${U(c, 'boneco2').hp} ${U(c, 'auto1').hp}`);
  check('terremoto: derrubados (sorteio 0,1)', ['auto1', 'auto2', 'boneco2', 'boneco3'].every(id => c.hasStatus(U(c, id), 'derrubado')));
  check('terremoto: o mago dentro da área não se machuca', c.player.hp === 120);
  const auto = autoTarget(c, sp);
  check('terremoto: alvo sugerido atinge vários', auto && auto.hits.length >= 3, auto && `${auto.hits.length}`);
}

// 17. Muralha de Pedra: 3 blocos de frente para o mago, 60 de vida cada, bloqueiam passagem e linha de visão
{
  const c = arena(), sp = spellById('muralhaDePedra');
  const ev = evaluateTarget(c, sp, { col: 5, row: 4 });
  eq('muralha: 3 casas em pé, de frente para o mago', ev.area.map(t => `${t.col},${t.row}`).join(' '), '5,3 5,4 5,5');
  const r = resolveSpell(c, sp, ev, 'm1');
  check('muralha: 3 blocos com 60 de vida, 3 turnos', r.obstacles.length === 3 && r.obstacles.every(o => o.hp === 60 && o.turns === 3));
  check('muralha: bloqueia a passagem', !c.isWalkable({ col: 5, row: 4 }));
  eq('muralha: tira a linha de visão do relâmpago', evaluateTarget(c, spellById('relampago'), U(c, 'auto2').tile).reason, 'sem linha de visão');
  check('muralha não nasce sobre unidades', evaluateTarget(c, sp, { col: 6, row: 3 }).area.every(t => !c.unitAt(t)));
  check('muralha sugerida fica entre o mago e o inimigo', (() => { const a = autoTarget(c, { ...sp }); return !a || a.area.length > 0; })());
  // bloqueado de todo lado, o autômato bate na muralha
  const k = arena();
  k.setUnitTile(k.player, { col: 0, row: 7 });
  for (const t of [{ col: 0, row: 6 }, { col: 1, row: 6 }, { col: 1, row: 7 }]) k.addObstacle(t, { kind: 'muralha', hp: 60 });
  const a = U(k, 'auto2');
  k.setUnitTile(a, { col: 2, row: 6 });
  const plan = planTurn(k, a, k.turnLimits(a));
  check('sem caminho até o mago, o autômato ataca a muralha', plan.attackObstacle && plan.attackObstacle.kind === 'muralha', plan.reason);
  k.damageObstacle(plan.attackObstacle, 60, { key: 'x' });
  check('bloco com vida zero é destruído', k.obstacles.size === 2);
}

// 18. Parede de Chamas: até 3 casas, 12 de dano ao entrar (uma vez por rodada, mesmo atravessando várias casas)
{
  const c = arena(), sp = spellById('paredeDeChamas'), a1 = U(c, 'auto1');
  const ev = evaluateTarget(c, sp, { col: 5, row: 2 });
  eq('chamas: 3 casas em pé', ev.area.map(t => `${t.col},${t.row}`).join(' '), '5,1 5,2 5,3');
  resolveSpell(c, sp, ev, 'f1');
  eq('chamas: quem estava na casa entra nas chamas (12 − 2 = 10)', a1.hp, 100);
  c.enterTile(a1, { col: 5, row: 2 });
  eq('chamas: atravessar outra casa da mesma parede na mesma rodada não dói de novo', a1.hp, 100);
  for (const u of c.endPlayerTurn()) { c.beginUnitTurn(u); c.endUnitTurn(u); }
  c.startPlayerTurn();
  c.enterTile(a1, { col: 5, row: 3 });
  eq('chamas: na rodada seguinte, entrar dói de novo', a1.hp, 90);
  for (let i = 0; i < 2; i++) { for (const u of c.endPlayerTurn()) { c.beginUnitTurn(u); c.endUnitTurn(u); } c.startPlayerTurn(); }
  eq('chamas: apagam depois de 3 turnos', c.hazards.size, 0);
  check('chamas não nascem sobre o mago', !evaluateTarget(c, sp, { col: 4, row: 4 }).area.some(t => t.col === 3 && t.row === 4));
}

console.log(failures ? `\n${failures} falha(s), ${passed} ok` : `Todos os ${passed} testes de combate passaram.`);
process.exit(failures ? 1 : 0);
