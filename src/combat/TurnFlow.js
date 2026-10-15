// O turno dos inimigos, passo a passo e quadro a quadro (sem promessas: funciona igual com o relógio
// do jogo e com engine.simulate() dos testes).
// Para cada unidade que não é o mago: os efeitos agem (queimadura...), ela anda e ataca (se puder),
// os efeitos perdem duração. No fim, começa o turno do jogador.
import { planTurn } from './enemyAI.js';

export class TurnFlow {
  // views.get(unit): { hopTo(tile), lunge(tile) } · onPhase(phase) · onMessage(texto)
  // waitFor(): true enquanto alguém reage na cena (o contra-ataque do guerreiro): o turno espera terminar.
  constructor({ combat, views, onPhase = () => {}, onMessage = () => {}, enemiesAct = true, waitFor = () => false }) {
    Object.assign(this, { combat, views, onPhase, onMessage, enemiesAct, waitFor });
    this.queue = [];
    this.step = null;
  }

  get busy() { return !!this.step || this.queue.length > 0; }

  endPlayerTurn() {
    if (this.busy) return false;
    const units = this.combat.endPlayerTurn();
    if (!units) return false;
    for (const u of units) this.queue.push({ kind: 'unit', unit: u });
    this.queue.push({ kind: 'player' });
    this.onPhase('enemy');
    return true;
  }

  next() {
    this.step = this.queue.shift() || null;
    if (!this.step) return;
    const s = this.step;
    s.wait = 0;
    if (s.kind === 'player') {
      this.combat.startPlayerTurn();
      this.onPhase('player');
      this.step = null;
      return;
    }
    const u = s.unit;
    if (!u.alive) { this.step = null; return; } // caído (boneco esperando levantar): perde a vez
    const { ticks, limits } = this.combat.beginUnitTurn(u);
    s.limits = limits;
    s.stage = 'ticks';
    s.wait = ticks.length ? 0.5 : 0;
    if (!limits.canAct && !limits.canMove && u.team === 'enemy') s.note = true;
  }

  update(dt) {
    if (!this.step) { if (this.queue.length) this.next(); if (!this.step) return; }
    const s = this.step;
    s.wait -= dt;
    if (s.wait > 0 || this.waitFor()) return;
    const u = s.unit, view = this.views.get(u);
    if (s.stage === 'ticks') {
      s.stage = 'act';
      if (u.alive && u.team === 'enemy' && this.enemiesAct) {
        s.plan = planTurn(this.combat, u, s.limits);
        s.stepIndex = 0;
        if (s.note) this.onMessage(`${u.name} perdeu o turno.`);
      } else s.plan = { path: [], attack: null };
      return;
    }
    if (s.stage === 'act') {
      if (!u.alive) { s.stage = 'end'; return; }
      const path = s.plan.path;
      if (s.stepIndex < path.length) {
        const tile = path[s.stepIndex++];
        if (!this.combat.isWalkable(tile, u)) { s.stepIndex = path.length; return; } // alguém entrou no caminho
        this.combat.enterTile(u, tile); // áreas perigosas machucam aqui
        if (view) view.hopTo(tile);
        s.wait = 0.36;
        return;
      }
      if (s.plan.attack && !s.attacked) {
        s.attacked = true;
        const t = s.plan.attack;
        if (t.alive && view) view.lunge(t.tile);
        s.stage = 'hit';
        s.wait = 0.16;
        return;
      }
      if (s.plan.attackObstacle && !s.attacked) {
        s.attacked = true;
        if (view) view.lunge(s.plan.attackObstacle.tile);
        s.stage = 'hitWall';
        s.wait = 0.16;
        return;
      }
      s.stage = 'end';
      return;
    }
    if (s.stage === 'hit') {
      const t = s.plan.attack;
      // corpo a corpo: o Contra-ataque armado apara e responde (src/combat/Combat.js meleeAttack)
      if (u.alive && t.alive) this.combat.meleeAttack(u, t, u.attack, 'fisico', { key: `ataque:${u.id}:${this.combat.round}` });
      s.stage = 'end';
      s.wait = 0.4;
      return;
    }
    if (s.stage === 'hitWall') {
      const o = s.plan.attackObstacle;
      if (u.alive) this.combat.damageObstacle(o, u.attack, { key: `ataque:${u.id}:${this.combat.round}` });
      s.stage = 'end';
      s.wait = 0.4;
      return;
    }
    if (s.stage === 'end') {
      this.combat.endUnitTurn(u);
      this.step = null;
    }
  }
}
