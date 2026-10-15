// Inteligência simples dos inimigos da arena de treino: andar até ficar ao lado do mago e atacar.
// Anda só na horizontal e na vertical, desvia de unidades e obstáculos e evita áreas perigosas quando dá.
// Sem caminho até o mago (uma muralha no meio), ataca o bloco de muralha que está entre eles.
import { tileDistance, sameTile } from './Combat.js';

const STEPS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const HAZARD_COST = 4;

// Caminho mais barato (Dijkstra num tabuleiro 8×8) de 'from' para cada casa alcançável.
function paths(combat, unit, from) {
  const N = combat.config.boardSize, key = t => t.row * N + t.col;
  const cost = new Map([[key(from), 0]]), prev = new Map();
  const open = [{ t: from, c: 0 }];
  while (open.length) {
    open.sort((a, b) => a.c - b.c);
    const { t, c } = open.shift();
    if (c > cost.get(key(t))) continue;
    for (const [dc, dr] of STEPS) {
      const n = { col: t.col + dc, row: t.row + dr };
      if (!combat.isWalkable(n, unit)) continue;
      const nc = c + 1 + (combat.hazardsAt(n).length ? HAZARD_COST : 0);
      if (nc < (cost.get(key(n)) ?? Infinity)) { cost.set(key(n), nc); prev.set(key(n), t); open.push({ t: n, c: nc }); }
    }
  }
  const route = to => {
    const out = [];
    for (let t = to; t && !sameTile(t, from); t = prev.get(key(t))) out.unshift(t);
    return out;
  };
  return { cost: t => cost.get(key(t)), route };
}

// O personagem do jogador mais perto (o mago ou o guerreiro).
function nearestPlayer(combat, unit) {
  const alive = combat.players.filter(p => p.alive && p.tile);
  alive.sort((a, b) => tileDistance(a.tile, unit.tile) - tileDistance(b.tile, unit.tile));
  return alive[0] || null;
}

// Plano do turno: { path: [casas, em ordem], attack: unidade | null, attackObstacle: obstáculo | null, reason }.
export function planTurn(combat, unit, limits) {
  const target = unit.tile ? nearestPlayer(combat, unit) : null;
  if (!target || !target.alive || !target.tile || !unit.tile) return { path: [], attack: null, reason: 'sem alvo' };
  const inReach = t => tileDistance(t, target.tile) <= unit.attackRange;
  if (inReach(unit.tile)) return { path: [], attack: limits.canAct && unit.attack > 0 ? target : null, reason: 'ao lado do mago' };
  if (!limits.canMove || limits.moveRange <= 0) return { path: [], attack: null, reason: limits.canAct ? 'preso no lugar' : 'sem ação' };

  const P = paths(combat, unit, unit.tile);
  let goal = null, best = Infinity;
  for (let row = 0; row < combat.config.boardSize; row++) for (let col = 0; col < combat.config.boardSize; col++) {
    const t = { col, row };
    if (!inReach(t)) continue;
    const c = P.cost(t);
    if (c !== undefined && c < best) { best = c; goal = t; }
  }
  if (!goal) {
    // bloqueado: anda até a muralha mais perto do mago e bate nela
    let wall = null, wallScore = Infinity, wallGoal = null;
    for (const o of combat.obstacles.values()) {
      for (const [dc, dr] of STEPS) {
        const t = { col: o.tile.col + dc, row: o.tile.row + dr };
        const c = sameTile(t, unit.tile) ? 0 : P.cost(t);
        if (c === undefined) continue;
        const score = c + tileDistance(o.tile, target.tile) * 2;
        if (score < wallScore) { wallScore = score; wall = o; wallGoal = t; }
      }
    }
    if (!wall) return { path: [], attack: null, attackObstacle: null, reason: 'sem caminho' };
    const path = sameTile(wallGoal, unit.tile) ? [] : P.route(wallGoal).slice(0, limits.moveRange);
    const end = path.length ? path[path.length - 1] : unit.tile;
    const reach = Math.abs(end.col - wall.tile.col) + Math.abs(end.row - wall.tile.row) === 1;
    return { path, attack: null, attackObstacle: limits.canAct && unit.attack > 0 && reach ? wall : null, reason: 'muralha no caminho' };
  }
  const path = P.route(goal).slice(0, limits.moveRange);
  const end = path.length ? path[path.length - 1] : unit.tile;
  return { path, attack: limits.canAct && unit.attack > 0 && inReach(end) ? target : null, reason: 'avança' };
}
