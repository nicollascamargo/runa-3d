// Combate por turnos: unidades, vida, mana, defesa, resistências, efeitos de status, obstáculos e áreas
// perigosas no tabuleiro, recargas das magias e a ordem dos turnos.
// Só regras e números, nada de tela: a cena ouve os eventos (on('damage'...)) e anima.
//
// Ordem de um turno completo:
//   turno do jogador: a mana e a energia recarregam, as recargas descem 1, os efeitos dos personagens do
//   jogador agem; cada personagem age (o mago com as runas, o guerreiro com os golpes e a caminhada);
//   encerra o turno: os efeitos dos personagens do jogador perdem 1 de duração;
//   turno dos inimigos: cada unidade não-jogadora, uma de cada vez: efeitos agem, ela age, efeitos perdem duração;
//   volta ao jogador (rodada seguinte).
import { STATUS_DEFS } from './statusEffects.js';

export const COMBAT_CONFIG = {
  boardSize: 8,
  spellsPerTurn: 1,      // magias por turno
  manaRegen: 20,         // mana que o mago recupera no começo de cada turno
  minDamage: 1,          // um golpe sempre tira pelo menos isto (salvo resistência total)
  reviveSeconds: 2.6,    // bonecos de treino levantam sozinhos depois de cair
};

export const ELEMENT_NAMES = { fogo: 'fogo', gelo: 'gelo', raio: 'raio', terra: 'terra', arcano: 'arcano', fisico: 'físico' };

const key = t => `${t.col},${t.row}`;
export const sameTile = (a, b) => !!a && !!b && a.col === b.col && a.row === b.row;
// Distância em casas, contando a diagonal como 1 (o "raio de N casas" é um quadrado de lado 2N+1).
export const tileDistance = (a, b) => Math.max(Math.abs(a.col - b.col), Math.abs(a.row - b.row));

let uidSeq = 1;

// Cria uma unidade. team: 'player' (o mago), 'enemy' (age sozinho) ou 'neutral' (boneco de treino: só apanha).
export function makeUnit(o) {
  const u = {
    id: o.id, name: o.name, team: o.team || 'neutral',
    maxHp: o.maxHp ?? 100, hp: o.hp ?? o.maxHp ?? 100,
    maxMana: o.maxMana ?? 0, mana: o.mana ?? o.maxMana ?? 0,
    defense: o.defense ?? 0, resist: { ...(o.resist || {}) },
    tile: o.tile ? { ...o.tile } : null,
    move: o.move ?? 0, attack: o.attack ?? 0, attackRange: o.attackRange ?? 1,
    // energia (guerreiro) e o que cada personagem do jogador ainda pode fazer no turno
    maxEnergy: o.maxEnergy ?? 0, energy: o.energy ?? o.maxEnergy ?? 0, energyRegen: o.energyRegen ?? 0,
    maxActions: o.maxActions ?? 1, actionsLeft: o.maxActions ?? 1, movesLeft: o.move ?? 0,
    training: !!o.training, alive: true,
    statuses: new Map(), turnIndex: 0, inTurn: false,
  };
  return u;
}

export class Combat {
  constructor(config = COMBAT_CONFIG) {
    this.config = config;
    this.units = [];
    this.handlers = new Map();
    this.phase = 'player';
    this.round = 1;
    this.cooldowns = {};
    this.castsLeft = config.spellsPerTurn;
    this.hitKeys = new Set();     // golpes já aplicados (o mesmo golpe nunca entra duas vezes)
    this.obstacles = new Map();   // casa -> { id, kind, hp, maxHp, turns } (bloqueia passagem e linha de visão)
    this.hazards = new Map();     // casa -> [{ id, kind, damage, element, turns }] (machuca quem entra)
    this.random = Math.random;    // os testes trocam por um sorteio previsível
  }

  // ---------- eventos ----------
  on(name, fn) { if (!this.handlers.has(name)) this.handlers.set(name, new Set()); this.handlers.get(name).add(fn); return () => this.handlers.get(name).delete(fn); }
  emit(name, payload) { const set = this.handlers.get(name); if (set) for (const fn of set) fn(payload); }

  // ---------- unidades e tabuleiro ----------
  addUnit(u) { this.units.push(u); return u; }
  // o primeiro personagem do jogador (o mago): as magias usam ele como conjurador
  get player() { return this.units.find(u => u.team === 'player'); }
  get players() { return this.units.filter(u => u.team === 'player'); }
  unitAt(tile) { return tile ? this.units.find(u => u.tile && sameTile(u.tile, tile)) || null : null; }
  inBounds(t) { return !!t && t.col >= 0 && t.row >= 0 && t.col < this.config.boardSize && t.row < this.config.boardSize; }
  obstacleAt(tile) { return tile ? this.obstacles.get(key(tile)) || null : null; }
  hazardsAt(tile) { return tile ? this.hazards.get(key(tile)) || [] : []; }
  // Casa onde dá para entrar: dentro do tabuleiro, sem obstáculo e sem ninguém (caído também ocupa).
  isWalkable(tile, ignore = null) {
    if (!this.inBounds(tile) || this.obstacleAt(tile)) return false;
    const u = this.unitAt(tile);
    return !u || u === ignore;
  }

  setUnitTile(u, tile) { u.tile = tile ? { ...tile } : null; }

  // Linha de visão entre duas casas: nenhuma casa no caminho (sem contar as pontas) tem obstáculo.
  lineOfSight(a, b) {
    for (const t of tilesOnLine(a, b)) {
      if (sameTile(t, a) || sameTile(t, b)) continue;
      if (this.obstacleAt(t)) return false;
    }
    return true;
  }

  unitsInRadius(center, r, filter = () => true) {
    return this.units.filter(u => u.alive && u.tile && tileDistance(u.tile, center) <= r && filter(u));
  }

  // ---------- dano ----------
  // Dano = (base × (1 − resistência)) − defesa, arredondado, nunca abaixo de minDamage (resistência ≥ 1 zera).
  // Efeitos mudam a conta: guarda quebrada zera a defesa; Guarda de Ferro multiplica o dano recebido (metade).
  // key: identifica o golpe. O mesmo key no mesmo alvo é ignorado: nada leva o mesmo dano duas vezes.
  computeDamage(target, base, element, { ignoreDefense = false } = {}) {
    const res = target.resist[element] || 0;
    if (res >= 1) return 0;
    let defense = ignoreDefense ? 0 : target.defense, mult = 1;
    for (const st of target.statuses.values()) {
      if (st.def.defenseZero) defense = 0;
      if (st.def.damageTaken !== undefined) mult *= st.def.damageTaken;
    }
    const raw = (base * (1 - res) - defense) * mult;
    return Math.max(this.config.minDamage, Math.round(raw));
  }

  // Ataque corpo a corpo (os autômatos). Se o alvo armou o Contra-ataque (efeito 'aparar'), o golpe é aparado:
  // não entra dano, o efeito é gasto (uma vez só) e sai o evento 'parry' para o alvo responder. A resposta é dano
  // comum (combat.damage), não outro ataque corpo a corpo: não arma outro aparar nem dispara em cadeia.
  // Devolve { parried, hit }.
  meleeAttack(attacker, target, base, element = 'fisico', { key = null } = {}) {
    if (!target || !target.alive) return { parried: false, hit: null };
    const parry = [...target.statuses.values()].find(st => st.def.parry);
    if (parry) {
      if (key) { const k = `${key}|${target.id}`; if (this.hitKeys.has(k)) return { parried: true, hit: null }; this.hitKeys.add(k); }
      this.removeStatus(target, parry.id, 'aparou');
      this.emit('parry', { attacker, target, base, element });
      return { parried: true, hit: null };
    }
    return { parried: false, hit: this.damage(target, base, element, { key, source: attacker ? attacker.id : null }) };
  }

  damage(target, base, element, { key: hitKey = null, source = null, ignoreDefense = false } = {}) {
    if (!target || !target.alive) return null;
    if (hitKey) {
      const k = `${hitKey}|${target.id}`;
      if (this.hitKeys.has(k)) return null;
      this.hitKeys.add(k);
    }
    const amount = this.computeDamage(target, base, element, { ignoreDefense });
    const before = target.hp;
    target.hp = Math.max(0, target.hp - amount);
    const info = { target, amount, element, source, hpBefore: before, hpAfter: target.hp, killed: target.hp <= 0 };
    this.emit('damage', info);
    if (info.killed) this.kill(target);
    return info;
  }

  heal(target, amount) {
    if (!target.alive) return 0;
    const before = target.hp;
    target.hp = Math.min(target.maxHp, target.hp + amount);
    if (target.hp !== before) this.emit('heal', { target, amount: target.hp - before });
    return target.hp - before;
  }

  kill(u) {
    u.alive = false;
    for (const id of [...u.statuses.keys()]) this.removeStatus(u, id, 'morte');
    this.emit('death', { unit: u });
  }

  // Bonecos de treino (e o mago, na arena de treino) voltam com a vida cheia.
  revive(u) {
    u.alive = true;
    u.hp = u.maxHp;
    this.emit('revive', { unit: u });
  }

  // ---------- efeitos de status ----------
  // Devolve o efeito aplicado (novo ou renovado) ou null (alvo morto, sorteio falhou).
  applyStatus(u, id, { turns = 1, power = 0, source = null, chance = 1 } = {}) {
    const def = STATUS_DEFS[id];
    if (!def || !u.alive) return null;
    if (chance < 1 && this.random() >= chance) { this.emit('statusResisted', { unit: u, id }); return null; }
    const cur = u.statuses.get(id);
    if (cur) {
      cur.turns = Math.max(cur.turns, turns);
      cur.power = Math.max(cur.power, power);
      cur.appliedTurn = u.inTurn ? u.turnIndex : -1;
      this.emit('statusRefresh', { unit: u, status: cur });
      return cur;
    }
    const st = { id, uid: uidSeq++, turns, power, source, appliedTurn: u.inTurn ? u.turnIndex : -1, def };
    u.statuses.set(id, st);
    this.emit('statusAdd', { unit: u, status: st });
    return st;
  }

  removeStatus(u, id, reason = 'removido') {
    const st = u.statuses.get(id);
    if (!st) return false;
    u.statuses.delete(id);
    this.emit('statusRemove', { unit: u, status: st, reason });
    return true;
  }

  hasStatus(u, id) { return u.statuses.has(id); }

  // O que a unidade pode fazer neste turno, de acordo com os efeitos.
  turnLimits(u) {
    let moveDelta = 0, noMove = false, noAction = false;
    for (const st of u.statuses.values()) {
      if (st.def.moveDelta) moveDelta += st.def.moveDelta * Math.max(1, st.power || 1);
      if (st.def.noMove) noMove = true;
      if (st.def.noAction) noAction = true;
    }
    return { moveRange: noMove || noAction ? 0 : Math.max(0, u.move + moveDelta), canAct: !noAction, canMove: !noMove && !noAction };
  }

  // Começo do turno de uma unidade: os efeitos agem (cada efeito uma vez por turno).
  beginUnitTurn(u) {
    u.turnIndex++;
    u.inTurn = true;
    const ticks = [];
    for (const st of [...u.statuses.values()]) {
      if (st.def.tick === 'damage' && u.alive) {
        const hit = this.damage(u, st.power, st.def.element, { key: `tick:${st.uid}:${u.turnIndex}`, source: st.id, ignoreDefense: true });
        if (hit) ticks.push({ status: st, hit });
      }
    }
    const limits = this.turnLimits(u);
    this.emit('unitTurnStart', { unit: u, ticks, limits });
    return { ticks, limits };
  }

  // Fim do turno: os efeitos perdem 1 de duração (menos os aplicados neste mesmo turno) e os zerados acabam.
  endUnitTurn(u) {
    for (const st of [...u.statuses.values()]) {
      if (st.appliedTurn === u.turnIndex) continue;
      st.turns -= 1;
      if (st.turns <= 0) this.removeStatus(u, st.id, 'expirou');
    }
    u.inTurn = false;
    this.emit('unitTurnEnd', { unit: u });
  }

  // ---------- obstáculos e áreas perigosas ----------
  addObstacle(tile, { kind, hp = 1, turns = 3, owner = null }) {
    const o = { id: uidSeq++, kind, tile: { ...tile }, hp, maxHp: hp, turns, owner };
    this.obstacles.set(key(tile), o);
    this.emit('obstacleAdd', { obstacle: o });
    return o;
  }

  damageObstacle(o, amount, { key: hitKey = null } = {}) {
    if (!o || o.hp <= 0) return null;
    if (hitKey) { const k = `${hitKey}|o${o.id}`; if (this.hitKeys.has(k)) return null; this.hitKeys.add(k); }
    o.hp = Math.max(0, o.hp - amount);
    this.emit('obstacleDamage', { obstacle: o, amount });
    if (o.hp <= 0) this.removeObstacle(o, 'destruido');
    return o;
  }

  removeObstacle(o, reason = 'expirou') {
    if (this.obstacles.get(key(o.tile)) !== o) return;
    this.obstacles.delete(key(o.tile));
    this.emit('obstacleRemove', { obstacle: o, reason });
  }

  // group: as casas de uma mesma parede de chamas; atravessar várias casas dela na mesma rodada dói uma vez só.
  addHazard(tile, { kind, damage, element, turns = 3, status = null, group = null }) {
    const id = uidSeq++;
    const h = { id, group: group ?? `h${id}`, kind, tile: { ...tile }, damage, element, turns, status };
    const list = this.hazards.get(key(tile)) || [];
    list.push(h);
    this.hazards.set(key(tile), list);
    this.emit('hazardAdd', { hazard: h });
    return h;
  }

  removeHazard(h, reason = 'expirou') {
    const list = this.hazards.get(key(h.tile));
    if (!list) return;
    const i = list.indexOf(h);
    if (i < 0) return;
    list.splice(i, 1);
    if (!list.length) this.hazards.delete(key(h.tile));
    this.emit('hazardRemove', { hazard: h, reason });
  }

  // Uma unidade entrou numa casa (andando, empurrada ou pousando). Áreas perigosas machucam uma vez por rodada.
  enterTile(u, tile) {
    this.setUnitTile(u, tile);
    const hits = [];
    for (const h of this.hazardsAt(tile)) {
      const hit = this.damage(u, h.damage, h.element, { key: `hazard:${h.group}:${this.round}`, source: h.kind });
      if (hit) hits.push(hit);
      if (h.status && u.alive) this.applyStatus(u, h.status.id, h.status);
    }
    return hits;
  }

  // ---------- magias do jogador ----------
  canCast(spell) {
    const p = this.player;
    if (!spell.ready) return { ok: false, reason: 'ainda não disponível' };
    if (this.phase !== 'player') return { ok: false, reason: 'turno dos inimigos' };
    if (!p || !p.alive) return { ok: false, reason: 'o mago caiu' };
    if (this.castsLeft <= 0) return { ok: false, reason: 'já conjurou neste turno' };
    const cd = this.cooldowns[spell.id] || 0;
    if (cd > 0) return { ok: false, reason: `recarga: ${cd} ${cd === 1 ? 'turno' : 'turnos'}` };
    if (p.mana < spell.mana) return { ok: false, reason: `mana insuficiente (${p.mana}/${spell.mana})` };
    return { ok: true, reason: '' };
  }

  // Paga a magia: mana, recarga e o uso do turno. Chamado uma vez, no momento do lançamento.
  spendCast(spell) {
    const p = this.player;
    p.mana -= spell.mana;
    this.cooldowns[spell.id] = spell.cooldown;
    this.castsLeft--;
    this.emit('mana', { unit: p });
    this.emit('cast', { spell });
  }

  restoreResources() {
    const p = this.player;
    if (p) { p.mana = p.maxMana; this.emit('mana', { unit: p }); }
    this.cooldowns = {};
    this.castsLeft = this.config.spellsPerTurn;
    this.emit('cooldowns', {});
  }

  // ---------- turnos ----------
  // Primeiro turno do jogo: o mago já começa com a mana cheia.
  start() {
    this.phase = 'player';
    for (const p of this.players) if (p.alive) this.beginUnitTurn(p);
    this.emit('phase', { phase: 'player', round: this.round });
  }

  // Encerra o turno do jogador e devolve a fila de quem age no turno dos inimigos.
  endPlayerTurn() {
    if (this.phase !== 'player') return null;
    for (const p of this.players) if (p.alive) this.endUnitTurn(p);
    this.phase = 'enemy';
    this.emit('phase', { phase: 'enemy', round: this.round });
    return this.units.filter(u => u.team !== 'player');
  }

  // Começa o turno do jogador: rodada nova, mana, recargas, obstáculos e áreas perigosas perdem 1 de duração.
  startPlayerTurn() {
    this.round++;
    this.phase = 'player';
    this.castsLeft = this.config.spellsPerTurn;
    for (const id of Object.keys(this.cooldowns)) this.cooldowns[id] = Math.max(0, this.cooldowns[id] - 1);
    for (const o of [...this.obstacles.values()]) if (--o.turns <= 0) this.removeObstacle(o, 'expirou');
    for (const list of [...this.hazards.values()]) for (const h of [...list]) if (--h.turns <= 0) this.removeHazard(h, 'expirou');
    for (const p of this.players) {
      p.actionsLeft = p.maxActions;
      p.movesLeft = p.move;
      if (!p.alive) continue;
      if (p.maxMana) p.mana = Math.min(p.maxMana, p.mana + this.config.manaRegen);
      if (p.maxEnergy) p.energy = Math.min(p.maxEnergy, p.energy + p.energyRegen);
      this.emit('mana', { unit: p });
      this.beginUnitTurn(p);
    }
    this.emit('cooldowns', {});
    this.emit('phase', { phase: 'player', round: this.round });
  }
}

// Casas cortadas pela reta entre os centros de duas casas (inclui as pontas).
export function tilesOnLine(a, b) {
  const out = [];
  const n = Math.max(Math.abs(b.col - a.col), Math.abs(b.row - a.row)) * 2 || 1;
  let last = '';
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const c = Math.round(a.col + (b.col - a.col) * t), r = Math.round(a.row + (b.row - a.row) * t);
    const k = `${c},${r}`;
    if (k !== last) { out.push({ col: c, row: r }); last = k; }
  }
  return out;
}
