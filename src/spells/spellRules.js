// Regras das magias, sem tela: quem pode ser alvo, que casas a magia atinge e o que acontece com cada um.
// A camada de execução (SpellCaster + efeitos visuais) chama resolveSpell() no instante do impacto.
//
// Tipos de alvo:
//   unit  um inimigo ou boneco (Bola de Fogo, Lança de Gelo, Prisão Glacial, Relâmpago, Corrente Elétrica)
//   tile  uma casa qualquer ao alcance; a área é em volta dela (Terremoto)
//   line  uma casa ao alcance é o meio de uma barreira de até 3 casas, de frente para o mago
//         (Muralha de Pedra, Parede de Chamas)
import { tileDistance, sameTile } from '../combat/Combat.js';

const inArea = (combat, center, r) => {
  const out = [];
  for (let row = center.row - r; row <= center.row + r; row++) for (let col = center.col - r; col <= center.col + r; col++) {
    const t = { col, row };
    if (combat.inBounds(t)) out.push(t);
  }
  return out;
};

export const isFoe = u => !!u && u.team !== 'player';
const foesIn = (combat, area) => combat.units.filter(u => u.alive && isFoe(u) && u.tile && area.some(t => sameTile(t, u.tile)));

// Casas de uma barreira com o meio em 'center', atravessada na direção mago -> centro (fica de frente para o mago).
export function lineTiles(combat, spell, center) {
  const me = combat.player.tile;
  const dc = center.col - me.col, dr = center.row - me.row;
  const half = Math.floor((spell.length || 3) / 2);
  const out = [];
  for (let k = -half; k <= half; k++) {
    // mais longe na horizontal: a barreira fica em pé na vertical (varia a linha), e vice-versa
    const t = Math.abs(dc) >= Math.abs(dr) ? { col: center.col, row: center.row + k } : { col: center.col + k, row: center.row };
    if (combat.inBounds(t)) out.push(t);
  }
  return out;
}

// Casas onde cada barreira pode nascer: a muralha só em casa vazia; as chamas também sobre unidades
// (quem está lá entra nas chamas), mas nunca sobre o mago nem sobre uma muralha.
function barrierTiles(combat, spell, center) {
  const me = combat.player.tile;
  return lineTiles(combat, spell, center).filter(t => {
    if (sameTile(t, me) || combat.obstacleAt(t)) return false;
    if (spell.id === 'muralhaDePedra') return !combat.unitAt(t);
    return true;
  });
}

// Saltos da Corrente Elétrica: do alvo para o inimigo vivo mais perto (até 'jump' casas) que ainda não foi atingido.
// Cada salto tira 'falloff' do dano. Devolve [{ unit, damage }] na ordem dos saltos.
export function chainTargets(combat, spell, first) {
  const out = [{ unit: first, damage: spell.damage }];
  let last = first, dmg = spell.damage;
  while (out.length < spell.chain.targets) {
    const next = combat.units
      .filter(u => u.alive && isFoe(u) && u.tile && !out.some(o => o.unit === u) && tileDistance(u.tile, last.tile) <= spell.chain.jump)
      .sort((a, b) => tileDistance(a.tile, last.tile) - tileDistance(b.tile, last.tile)
        || (a.team === 'enemy' ? 0 : 1) - (b.team === 'enemy' ? 0 : 1)
        || combat.units.indexOf(a) - combat.units.indexOf(b))[0];
    if (!next) break;
    dmg = Math.round(dmg * (1 - spell.chain.falloff));
    out.push({ unit: next, damage: dmg });
    last = next;
  }
  return out;
}

// Avalia uma casa como alvo da magia. Devolve { valid, reason, tile, unit, area, hits, chain? }.
export function evaluateTarget(combat, spell, tile) {
  const me = combat.player;
  const base = { valid: false, reason: '', tile, unit: null, area: [], hits: [] };
  if (!tile || !combat.inBounds(tile)) return { ...base, reason: 'fora do tabuleiro' };
  if (!me || !me.tile) return { ...base, reason: 'o mago não está no tabuleiro' };
  const d = tileDistance(me.tile, tile);
  if (sameTile(me.tile, tile)) return { ...base, reason: 'escolha outra casa' };
  if (d > spell.range) return { ...base, reason: `fora do alcance (até ${spell.range} casas)` };
  const unit = combat.unitAt(tile);
  if (spell.target === 'unit') {
    if (!isFoe(unit)) return { ...base, reason: 'escolha um inimigo ou boneco' };
    if (!unit.alive) return { ...base, unit, reason: 'esse alvo já caiu' };
  }
  if (spell.needsSight && !combat.lineOfSight(me.tile, tile)) return { ...base, unit, reason: 'sem linha de visão' };
  if (spell.target === 'line') {
    const area = barrierTiles(combat, spell, tile);
    if (!area.length) return { ...base, unit, reason: spell.id === 'muralhaDePedra' ? 'a muralha precisa de casas vazias' : 'não há onde acender as chamas' };
    return { valid: true, reason: '', tile, unit, area, hits: spell.id === 'paredeDeChamas' ? foesIn(combat, area) : [] };
  }
  if (spell.chain) {
    const chain = chainTargets(combat, spell, unit);
    return { valid: true, reason: '', tile, unit, area: chain.map(c => c.unit.tile), hits: chain.map(c => c.unit), chain };
  }
  const area = spell.area ? inArea(combat, tile, spell.area) : [tile];
  return { valid: true, reason: '', tile, unit, area, hits: foesIn(combat, area) };
}

// Melhor alvo para sugerir.
//   alvo único e área: o que atinge mais inimigos; no empate, o mais perto.
//   barreiras: entre o mago e o inimigo mais perto (a muralha protege; as chamas atrapalham a passagem).
export function autoTarget(combat, spell) {
  const me = combat.player;
  if (!me || !me.tile) return null;
  const foes = combat.units.filter(u => u.alive && isFoe(u) && u.tile);
  let best = null, bestScore = -Infinity;
  const consider = (tile, bonus = 0) => {
    const ev = evaluateTarget(combat, spell, tile);
    if (!ev.valid) return;
    const score = ev.hits.length * 10 + ev.hits.filter(h => h.team === 'enemy').length * 3 + bonus - tileDistance(me.tile, tile);
    if (score > bestScore) { bestScore = score; best = ev; }
  };
  if (spell.target === 'unit') for (const u of foes) consider(u.tile);
  else if (spell.target === 'tile') for (const t of inArea(combat, me.tile, spell.range)) consider(t);
  else {
    const near = foes.filter(u => u.team === 'enemy').sort((a, b) => tileDistance(a.tile, me.tile) - tileDistance(b.tile, me.tile))[0] || foes[0];
    if (near) {
      const dc = Math.sign(near.tile.col - me.tile.col), dr = Math.sign(near.tile.row - me.tile.row);
      const steps = Math.max(1, Math.min(2, tileDistance(me.tile, near.tile) - 1));
      for (let k = steps; k >= 1; k--) consider({ col: me.tile.col + dc * k, row: me.tile.row + dr * k }, 20 + k);
    }
    if (!best) for (const t of inArea(combat, me.tile, 2)) consider(t);
  }
  return best;
}

// Casas ao alcance da magia (para o contorno suave no tabuleiro).
export function rangeTiles(combat, spell) {
  const me = combat.player;
  if (!me || !me.tile) return [];
  return inArea(combat, me.tile, spell.range).filter(t => !sameTile(t, me.tile));
}

// Aplica a magia no impacto. castId identifica o lançamento: o mesmo lançamento nunca acerta o mesmo alvo
// duas vezes. part: para magias em etapas (a Corrente Elétrica resolve um salto de cada vez).
export function resolveSpell(combat, spell, target, castId, part = null) {
  switch (spell.id) {
    case 'bolaDeFogo': case 'terremoto': return resolveArea(combat, spell, target, castId);
    case 'lancaDeGelo': case 'prisaoGlacial': case 'relampago': return resolveSingle(combat, spell, target, castId);
    case 'correnteEletrica': return resolveChain(combat, spell, target, castId, part);
    case 'muralhaDePedra': return resolveWall(combat, spell, target);
    case 'paredeDeChamas': return resolveFireWall(combat, spell, target);
    default: throw new Error(`Magia sem regras: ${spell.name}`);
  }
}

function hitWithStatus(combat, spell, u, castId, damage = spell.damage) {
  const hit = combat.damage(u, damage, spell.element, { key: castId, source: spell.id });
  if (hit && u.alive && spell.status) {
    const s = spell.status;
    combat.applyStatus(u, s.id, { turns: s.turns, power: s.power || 0, chance: s.chance ?? 1, source: spell.id });
  }
  return hit;
}

function resolveArea(combat, spell, target, castId) {
  const area = inArea(combat, target.tile, spell.area || 0);
  const hits = [];
  for (const u of foesIn(combat, area)) { const h = hitWithStatus(combat, spell, u, castId); if (h) hits.push(h); }
  // a explosão e o tremor também castigam obstáculos (uma muralha de pedra, por exemplo)
  for (const t of area) { const o = combat.obstacleAt(t); if (o) combat.damageObstacle(o, spell.damage, { key: castId }); }
  return { hits, area };
}

function resolveSingle(combat, spell, target, castId) {
  const u = target.unit;
  const h = u && u.alive ? hitWithStatus(combat, spell, u, castId) : null;
  return { hits: h ? [h] : [], area: [target.tile] };
}

function resolveChain(combat, spell, target, castId, part) {
  const chain = target.chain || chainTargets(combat, spell, target.unit);
  const parts = part === null ? chain.map((_, i) => i) : [part];
  const hits = [];
  for (const i of parts) {
    const c = chain[i];
    if (!c || !c.unit.alive) continue;
    const h = combat.damage(c.unit, c.damage, spell.element, { key: castId, source: spell.id });
    if (h) hits.push({ ...h, hop: i });
  }
  return { hits, area: chain.map(c => c.unit.tile) };
}

function resolveWall(combat, spell, target) {
  const tiles = barrierTiles(combat, spell, target.tile);
  const obstacles = tiles.map(t => combat.addObstacle(t, { kind: 'muralha', hp: spell.wallHp, turns: spell.duration, owner: spell.id }));
  return { hits: [], area: tiles, obstacles };
}

function resolveFireWall(combat, spell, target) {
  const tiles = barrierTiles(combat, spell, target.tile);
  const group = `parede:${target.tile.col},${target.tile.row}:${combat.round}`;
  const hazards = tiles.map(t => combat.addHazard(t, { kind: 'chamas', damage: spell.damage, element: 'fogo', turns: spell.duration, group }));
  // quem já está numa dessas casas entra nas chamas agora (uma vez por rodada, como quem atravessa)
  const hits = [];
  for (const u of foesIn(combat, tiles)) hits.push(...combat.enterTile(u, u.tile));
  return { hits, area: tiles, hazards };
}
