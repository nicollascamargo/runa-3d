// Regras do guerreiro, sem tela: para onde ele pode andar, o alvo de cada habilidade, o que custa cada uma e o
// que acontece no impacto. Usa o mesmo combate do mago (src/combat/Combat.js).
//   Corte Horizontal  arco das 3 casas à frente
//   Golpe Devastador  um inimigo ao lado (8 direções): dano alto e guarda quebrada (a defesa não conta por 2 turnos)
//   Guarda de Ferro   efeito no guerreiro: metade do dano recebido até o fim do próximo turno dele
//   Investida         linha reta (8 direções) até o primeiro inimigo a até 4 casas; as casas do caminho precisam
//                     estar livres (nem unidade, nem muralha, dentro do tabuleiro); ele para ao lado do alvo e acerta
//   Contra-ataque     efeito no guerreiro: o próximo ataque corpo a corpo é aparado e devolvido (uma vez)
//   Onda de Choque    as 8 casas em volta: dano e empurrão de 1 casa para fora, só para casa livre
import { sameTile, tileDistance } from '../combat/Combat.js';

// As oito direções, em volta (cada uma ao lado da anterior): leste, sudeste, sul, ... nordeste.
export const DIRS = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
const STEPS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const isFoe = u => !!u && u.team !== 'player';

// Casas para onde o guerreiro pode andar neste turno, cada uma com o caminho (só na horizontal e na vertical,
// sem atravessar ninguém nem muralhas). Devolve Map 'col,row' -> [casas do caminho, sem a de partida].
export function reachableTiles(combat, unit, steps = unit.movesLeft) {
  const out = new Map();
  if (!unit.tile || steps <= 0) return out;
  const key = t => `${t.col},${t.row}`;
  const queue = [{ t: unit.tile, path: [] }];
  const seen = new Set([key(unit.tile)]);
  while (queue.length) {
    const { t, path } = queue.shift();
    if (path.length >= steps) continue;
    for (const [dc, dr] of STEPS) {
      const n = { col: t.col + dc, row: t.row + dr };
      if (seen.has(key(n)) || !combat.isWalkable(n, unit)) continue;
      seen.add(key(n));
      const p = [...path, n];
      out.set(key(n), p);
      queue.push({ t: n, path: p });
    }
  }
  return out;
}

// As três casas do arco à frente, na direção DIRS[d] (a da frente e as duas do lado dela).
export function arcTiles(combat, origin, d) {
  return [d + 7, d, d + 1].map(i => DIRS[i % 8]).map(([dc, dr]) => ({ col: origin.col + dc, row: origin.row + dr })).filter(t => combat.inBounds(t));
}

// Melhor direção para o corte: a que pega mais inimigos; no empate, autômatos antes de bonecos e depois
// a direção mais perto de onde ele já está virado. Devolve { dir, tiles, hits }.
export function bestArc(combat, unit, facing = 0) {
  let best = null;
  for (let d = 0; d < 8; d++) {
    const tiles = arcTiles(combat, unit.tile, d);
    const hits = combat.units.filter(u => u.alive && isFoe(u) && u.tile && tiles.some(t => sameTile(t, u.tile)));
    const turn = Math.min(Math.abs(d - facing), 8 - Math.abs(d - facing));
    const score = hits.length * 100 + hits.filter(h => h.team === 'enemy').length * 10 - turn;
    if (!best || score > best.score) best = { dir: d, tiles, hits, score };
  }
  return best;
}

// Direção (0 a 7) mais perto de um ângulo no plano (radianos, atan2(dx, dz) como o yaw do Three.js).
export function dirFromYaw(yaw) {
  // DIRS[d] = [dc, dr]: col cresce em +x, row cresce em +z; yaw = atan2(x, z)
  let best = 0, bd = Infinity;
  DIRS.forEach(([dc, dr], d) => { const a = Math.atan2(dc, dr); let diff = Math.abs(a - yaw) % (Math.PI * 2); if (diff > Math.PI) diff = Math.PI * 2 - diff; if (diff < bd) { bd = diff; best = d; } });
  return best;
}
export const yawFromDir = d => Math.atan2(DIRS[d][0], DIRS[d][1]);

// Pode usar a habilidade agora? training: modo de treino (não gasta nada, não precisa ser o turno do jogador).
export function canUse(combat, unit, ability, { training = false } = {}) {
  if (!ability.ready) return { ok: false, reason: 'ainda não disponível' };
  if (!unit || !unit.alive) return { ok: false, reason: 'o guerreiro caiu' };
  if (training) return { ok: true, reason: '' };
  if (combat.phase !== 'player') return { ok: false, reason: 'turno dos inimigos' };
  if (unit.actionsLeft <= 0) return { ok: false, reason: 'já agiu neste turno' };
  const cd = combat.cooldowns[ability.id] || 0;
  if (cd > 0) return { ok: false, reason: `recarga: ${cd} ${cd === 1 ? 'turno' : 'turnos'}` };
  if (unit.energy < ability.energy) return { ok: false, reason: `energia insuficiente (${unit.energy}/${ability.energy})` };
  return { ok: true, reason: '' };
}

// Paga a habilidade (energia, recarga, a ação do turno). No modo de treino, nada é gasto.
export function spend(combat, unit, ability, { training = false } = {}) {
  if (training) return;
  unit.energy -= ability.energy;
  combat.cooldowns[ability.id] = ability.cooldown;
  unit.actionsLeft--;
  combat.emit('mana', { unit });
  combat.emit('cooldowns', {});
}

// ---------- Golpe Devastador ----------
// O inimigo ao lado (8 direções) a acertar: autômatos antes de bonecos, depois o mais perto de onde ele olha,
// depois o de menos vida. Devolve { dir, tile, target } ou null.
export function devastadorTarget(combat, unit, facing = 0) {
  let best = null;
  for (let d = 0; d < 8; d++) {
    const t = { col: unit.tile.col + DIRS[d][0], row: unit.tile.row + DIRS[d][1] };
    const u = combat.unitAt(t);
    if (!u || !u.alive || !isFoe(u)) continue;
    const turn = Math.min(Math.abs(d - facing), 8 - Math.abs(d - facing));
    const score = (u.team === 'enemy' ? 100 : 0) - turn * 3 - u.hp / 100;
    if (!best || score > best.score) best = { dir: d, tile: t, target: u, score };
  }
  return best;
}

// No impacto: o dano (uma vez) e a guarda quebrada no alvo.
export function resolveDevastador(combat, ability, plan, castId) {
  const u = plan.target;
  if (!u || !u.alive || !sameTile(u.tile, plan.tile)) return [];
  const h = combat.damage(u, ability.damage, ability.element, { key: castId, source: ability.id });
  if (h && u.alive && ability.breakTurns) combat.applyStatus(u, 'guardaQuebrada', { turns: ability.breakTurns, source: ability.id });
  return h ? [h] : [];
}

// ---------- Guarda de Ferro e Contra-ataque (efeitos no próprio guerreiro) ----------
export function armGuard(combat, unit, ability) {
  return combat.applyStatus(unit, 'guardaDeFerro', { turns: ability.turns ?? 1, power: ability.reduction ?? 0.5, source: ability.id });
}
export function armCounter(combat, unit, ability) {
  return combat.applyStatus(unit, 'aparar', { turns: ability.turns ?? 1, source: ability.id });
}
// A resposta do Contra-ataque: dano comum no atacante (não é ataque corpo a corpo: não pode ser aparada nem
// disparar outro contra-ataque). key: uma por aparada.
export function counterStrike(combat, ability, attacker, key) {
  if (!attacker || !attacker.alive) return null;
  return combat.damage(attacker, ability.damage, ability.element, { key, source: ability.id });
}

// ---------- Investida ----------
// Para cada uma das 8 direções, anda casa por casa até o primeiro inimigo a até 'range' casas. O caminho até ele
// precisa estar livre (dentro do tabuleiro, sem unidade e sem muralha; numa diagonal, as duas casas do "canto"
// também não podem ser muralha, para não atravessar quina). Inimigo colado (1 casa) também vale: ele só arremete.
// Devolve o melhor { dir, path (casas que ele atravessa, a última é onde para), stop, target, blocked } ou null,
// e em 'why' o motivo da recusa quando não há nenhum.
export function investidaPlan(combat, unit, facing = 0, range = 4) {
  let best = null, why = 'nenhum inimigo em linha reta';
  for (let d = 0; d < 8; d++) {
    const [dc, dr] = DIRS[d], path = [];
    let prev = unit.tile, target = null, blocked = '';
    for (let k = 1; k <= range; k++) {
      const t = { col: unit.tile.col + dc * k, row: unit.tile.row + dr * k };
      if (!combat.inBounds(t)) { blocked = 'borda'; break; }
      if (dc && dr && (combat.obstacleAt({ col: prev.col + dc, row: prev.row }) || combat.obstacleAt({ col: prev.col, row: prev.row + dr }))) { blocked = 'muralha'; break; }
      if (combat.obstacleAt(t)) { blocked = 'muralha'; break; }
      const u = combat.unitAt(t);
      if (u) { if (u.alive && isFoe(u)) target = u; else blocked = u.alive ? 'aliado' : 'caído'; break; }
      path.push(t);
      prev = t;
    }
    if (!target) { if (blocked === 'muralha') why = 'uma muralha no caminho'; continue; }
    const turn = Math.min(Math.abs(d - facing), 8 - Math.abs(d - facing));
    const score = (target.team === 'enemy' ? 100 : 0) + path.length * 2 - turn * 3;
    if (!best || score > best.score) best = { dir: d, path, stop: path.length ? path[path.length - 1] : { ...unit.tile }, target, score };
  }
  return best ? { ...best, why: '' } : { why };
}

// No impacto: o guerreiro já está na casa de parada; o alvo leva o golpe (uma vez).
export function resolveInvestida(combat, ability, plan, castId) {
  const u = plan.target;
  if (!u || !u.alive) return [];
  const h = combat.damage(u, ability.damage, ability.element, { key: castId, source: ability.id });
  return h ? [h] : [];
}

// ---------- Onda de Choque ----------
// As unidades inimigas nas 8 casas em volta, cada uma com a casa para onde seria empurrada (1 casa para fora, na
// mesma direção) se essa casa estiver livre; senão, fica onde está (e leva o dano do mesmo jeito).
export function shockwavePlan(combat, unit, ability) {
  const out = [];
  for (const [dc, dr] of DIRS) {
    const t = { col: unit.tile.col + dc, row: unit.tile.row + dr };
    const u = combat.unitAt(t);
    if (!u || !u.alive || !isFoe(u)) continue;
    let push = null;
    for (let k = ability.push ?? 1; k >= 1; k--) {
      const d = { col: t.col + dc * k, row: t.row + dr * k };
      if (combat.isWalkable(d, u) && !out.some(o => o.push && sameTile(o.push, d))) { push = d; break; }
    }
    out.push({ unit: u, from: t, push });
  }
  const walls = DIRS.map(([dc, dr]) => combat.obstacleAt({ col: unit.tile.col + dc, row: unit.tile.row + dr })).filter(Boolean);
  return { hits: out, walls };
}

// No impacto: dano em cada um (uma vez) e o empurrão (só para casa livre; casa perigosa machuca ao entrar).
export function resolveShockwave(combat, ability, plan, castId) {
  const hits = [], pushed = [];
  for (const h of plan.hits) {
    const u = h.unit;
    if (!u.alive || !sameTile(u.tile, h.from)) continue;
    const hit = combat.damage(u, ability.damage, ability.element, { key: castId, source: ability.id });
    if (hit) hits.push(hit);
    if (u.alive && h.push && combat.isWalkable(h.push, u)) { combat.enterTile(u, h.push); pushed.push({ unit: u, to: h.push }); }
  }
  for (const o of plan.walls) combat.damageObstacle(o, ability.damage, { key: castId });
  return { hits, pushed };
}

export const inRange = (a, b, r) => tileDistance(a, b) <= r;

// Corte Horizontal no instante do impacto: cada inimigo no arco leva o golpe uma vez; muralhas também.
export function resolveSlash(combat, ability, arc, castId) {
  const hits = [];
  for (const u of combat.units.filter(x => x.alive && isFoe(x) && x.tile && arc.some(t => sameTile(t, x.tile)))) {
    const h = combat.damage(u, ability.damage, ability.element, { key: castId, source: ability.id });
    if (h) hits.push(h);
  }
  for (const t of arc) { const o = combat.obstacleAt(t); if (o) combat.damageObstacle(o, ability.damage, { key: castId }); }
  return hits;
}
