// O guerreiro em jogo: seleção, caminhada pelo tabuleiro e os golpes, numa máquina de estados.
//
//   livre      não está selecionado (o jogador está com o mago)
//   pronto     selecionado: mostra as casas aonde pode ir e espera um gesto (ou um clique numa casa)
//   andando    indo de casa em casa (gestos de golpe não valem enquanto anda)
//   golpe      virando para o alvo e animando; o dano entra no instante do impacto da animação
//   voltando   recuperação curta depois do golpe, antes de aceitar outro gesto
//   levitando  na pinça da telecinese (src/gameplay/Telekinesis.js), do agarrar até terminar o pouso;
//              as casas que ele alcança ficam acesas e o pouso gasta o movimento do turno (uma casa por passo)
//
// Quem reconhece os gestos é src/warrior/WarriorGestures.js; as regras são de src/warrior/warriorRules.js.
// Modo de treino: os golpes não gastam energia, ação nem recarga e podem ser feitos sem alvo e fora do turno.
import * as THREE from 'three';
import { ABILITIES, abilityById } from './abilities.js';
import { reachableTiles, bestArc, canUse, spend, resolveSlash, dirFromYaw, yawFromDir, DIRS, devastadorTarget, resolveDevastador, armGuard, armCounter, counterStrike, investidaPlan, resolveInvestida, shockwavePlan, resolveShockwave } from './warriorRules.js';
import { tileName } from '../gameplay/Telekinesis.js';

export const WARRIOR_STATES = { free: 'livre', ready: 'pronto', walking: 'andando', acting: 'golpe', recovering: 'voltando', carried: 'levitando' };

const PICK_RADIUS = 0.4;
const AFTER_LANDING = 0.45; // segundos: depois de pousar, um instante sem golpes (abrir a pinça e tirar a mão não vira corte)
const WALK = 1.7, RUN = 3.3; // metros por segundo (corre quando o caminho tem 3 casas ou mais)
const angleLerp = (a, b, k) => { let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI; if (d < -Math.PI) d += Math.PI * 2; return a + d * k; };

export class WarriorController {
  // deps: combat, unit, warrior, anim, board, markers, wfx, engine, sfx, onChange; tk (a telecinese dele, opcional);
  // onPush(unit, tile, tipo) (empurrão da Onda de Choque e tranco da Investida, para a cena); onUsed(ability, fonte)
  constructor(deps) {
    Object.assign(this, deps);
    this.state = 'free';
    this.stateT = 0;
    this.training = false;
    this.hovered = false;
    this.hoverTile = null;
    this.reach = new Map();
    this.walk = null;
    this.action = null;
    this.reaction = null;    // resposta do contra-ataque em andamento
    this.seq = 0;
    this.yawTarget = this.warrior.object.rotation.y;
    this.log = [];          // golpes feitos (para os testes e a depuração)
    this.feedback = null;   // { text, kind, at }
    this.onChange = this.onChange || (() => {});
    this.clock = 0;          // relógio do jogo (anda com o update, também nos testes acelerados)
    this.landedAt = -1e9;
  }

  get selected() { return this.state !== 'free'; }
  get busy() { return this.state === 'walking' || this.state === 'acting' || this.state === 'recovering' || this.state === 'carried'; }
  // gestos de golpe só valem com o guerreiro selecionado e parado (nunca enquanto anda, golpeia, reage ou levita)
  get acceptsGestures() { return this.state === 'ready' && !this.reacting && this.unit.alive && this.clock - this.landedAt > AFTER_LANDING; }

  setState(s) {
    if (s === this.state) return;
    this.state = s;
    this.stateT = 0;
    this.onChange(s);
  }

  say(text, kind = 'info') { this.feedback = { text, kind, at: performance.now() }; this.onChange(this.state); }

  // ---------- seleção ----------
  select() {
    if (this.state === 'free') this.setState('ready');
    this.refreshReach();
  }

  deselect() {
    if (this.busy) return false;
    this.setState('free');
    this.markers.hide();
    return true;
  }

  // O raio do ponteiro passa pelo corpo do guerreiro?
  hits(ray) {
    const p = this.warrior.object.position;
    return ray.distanceSqToSegment(new THREE.Vector3(p.x, 0.1, p.z), new THREE.Vector3(p.x, 1.75, p.z)) <= PICK_RADIUS * PICK_RADIUS;
  }

  refreshReach() {
    if (this.state === 'carried') { this.showMarkers(); return; } // no ar vale o alcance de quando foi pego
    const canMove = this.state === 'ready' && (this.combat.phase === 'player' || this.training) && this.unit.movesLeft > 0;
    this.reach = canMove ? reachableTiles(this.combat, this.unit) : new Map();
    this.showMarkers();
  }

  showMarkers() {
    if (this.state === 'carried') { // no ar: as casas que ele alcança (o destino é o marcador da telecinese)
      const range = [...this.reach.keys()].map(k => { const [col, row] = k.split(',').map(Number); return { col, row }; });
      this.markers.show({ element: 'mover', range, area: [], target: null, valid: false, locked: false });
      return;
    }
    if (this.state !== 'ready') { this.markers.hide(); return; }
    const range = [...this.reach.keys()].map(k => { const [col, row] = k.split(',').map(Number); return { col, row }; });
    const path = this.hoverTile && this.reach.get(`${this.hoverTile.col},${this.hoverTile.row}`);
    this.markers.show({ element: 'mover', range, area: path || [], target: path ? this.hoverTile : null, valid: !!path, locked: false });
  }

  // ---------- ponteiro ----------
  pointerMove(pick) {
    this.hovered = this.hits(pick.ray);
    const t = pick.tile;
    if (this.state === 'ready' && (t ? `${t.col},${t.row}` : '') !== (this.hoverTile ? `${this.hoverTile.col},${this.hoverTile.row}` : '')) {
      this.hoverTile = t;
      this.showMarkers();
    }
  }

  pointerLeave() { this.hovered = false; this.hoverTile = null; if (this.state === 'ready') this.showMarkers(); }

  // Clique (ou pinça) numa casa com o guerreiro pronto: anda até lá. Devolve true se tratou o clique.
  pointerDown(pick) {
    if (this.state !== 'ready' || !pick.tile) return false;
    const path = this.reach.get(`${pick.tile.col},${pick.tile.row}`);
    if (!path) {
      if (this.combat.unitAt(pick.tile) || this.combat.obstacleAt(pick.tile)) return false;
      this.say(this.unit.movesLeft <= 0 ? 'Sem movimento neste turno.' : `${tileName(pick.tile)} está longe demais (até ${this.unit.movesLeft} casas).`, 'warn');
      this.sfx('error');
      return true;
    }
    this.walkTo(path);
    return true;
  }

  // ---------- telecinese ----------
  // Pode ser pego agora? '' = pode; senão, o motivo. Prepara as casas que ele alcança (o destino tem que ser uma delas).
  grabReason() {
    if (!this.unit.alive) return 'O guerreiro caiu.';
    if (this.state === 'walking') return 'Espere o guerreiro terminar de andar.';
    if (this.state === 'acting' || this.state === 'recovering') return 'Espere o golpe terminar.';
    if (!this.training && this.combat.phase !== 'player') return 'Espere o turno dos inimigos terminar.';
    if (!this.training && this.unit.movesLeft <= 0) { this.say('Sem movimento neste turno.', 'warn'); return 'O guerreiro já usou o movimento deste turno.'; }
    this.reach = reachableTiles(this.combat, this.unit, this.training ? Math.max(this.unit.move, this.unit.movesLeft) : this.unit.movesLeft);
    return '';
  }

  // A casa serve de pouso? A dele mesmo (volta) ou uma das que ele alcança neste turno.
  canLand(tile) {
    if (!tile || !this.unit.tile) return false;
    if (tile.col === this.unit.tile.col && tile.row === this.unit.tile.row) return true;
    return this.reach.has(`${tile.col},${tile.row}`);
  }

  // Por que a casa não serve (para a mensagem de "voltou para a origem").
  landReason(tile) {
    if (!tile) return 'Fora do tabuleiro';
    const u = this.combat.unitAt(tile);
    if (u && u !== this.unit) return `Casa ocupada pelo ${u.name}`;
    if (this.combat.obstacleAt(tile)) return 'Casa ocupada por uma muralha';
    return `Longe demais (até ${this.training ? this.unit.move : this.unit.movesLeft} ${this.unit.movesLeft === 1 && !this.training ? 'casa' : 'casas'})`;
  }

  // a telecinese pegou (true) ou terminou o pouso (false)
  carry(on) {
    if (on) {
      if (this.state === 'carried') return;
      this.walk = null;
      this.setState('carried');
      this.showMarkers();
      return;
    }
    if (this.state !== 'carried') return;
    this.yawTarget = this.warrior.object.rotation.y; // continua virado para onde pousou
    this.landedAt = this.clock;
    this.setState('ready');
    this.refreshReach();
  }

  // Pousou em 'to' (vindo de 'from'): gasta o movimento (o caminho mais curto pelo chão) e entra na casa.
  landed(to, from) {
    if (to.col === from.col && to.row === from.row) return 0;
    const path = this.reach.get(`${to.col},${to.row}`);
    const cost = path ? path.length : Math.abs(to.col - from.col) + Math.abs(to.row - from.row);
    if (!this.training) this.unit.movesLeft = Math.max(0, this.unit.movesLeft - cost);
    this.combat.enterTile(this.unit, to); // casas perigosas (chamas) machucam aqui
    this.say(`Guerreiro levado para ${tileName(to)} (${cost} ${cost === 1 ? 'casa' : 'casas'}${this.training ? ', treino' : ''}).`, 'ok');
    return cost;
  }

  // ---------- caminhada ----------
  walkTo(path) {
    const speed = path.length >= 3 ? RUN : WALK;
    this.walk = { path: [...path], i: 0, speed, from: this.warrior.object.position.clone(), t: 0 };
    this.markers.hide();
    this.setState('walking');
    this.sfx('press');
  }

  stepWalk(dt) {
    const w = this.walk, obj = this.warrior.object;
    const tile = w.path[w.i];
    const [x, z] = this.board.tileCenter(tile.col, tile.row);
    const to = new THREE.Vector3(x, 0, z), d = w.from.distanceTo(to);
    w.t += dt * w.speed / Math.max(0.01, d);
    const u = Math.min(1, w.t);
    obj.position.lerpVectors(w.from, to, u);
    this.yawTarget = Math.atan2(to.x - w.from.x, to.z - w.from.z);
    this.warrior.loco.speed += (w.speed - this.warrior.loco.speed) * (1 - Math.exp(-10 * dt));
    if (u >= 1) {
      if (!this.training) this.unit.movesLeft--;
      this.combat.enterTile(this.unit, tile); // casas perigosas (chamas) machucam aqui
      w.i++;
      w.from = to.clone(); w.t = 0;
      if (w.i >= w.path.length || !this.unit.alive) { this.walk = null; this.setState('ready'); this.refreshReach(); }
      else if (!this.combat.isWalkable(w.path[w.i], this.unit)) { this.walk = null; this.say('O caminho foi bloqueado.', 'warn'); this.setState('ready'); this.refreshReach(); }
    }
  }

  // ---------- habilidades ----------
  // Pedido de habilidade: vem do reconhecedor de gestos (source 'mão') ou do teclado/clique. Devolve o motivo se
  // recusou. Ordem: estado do guerreiro, regras (energia, recarga, ação, turno), alvo (cada habilidade tem o seu);
  // só então paga e começa a animação. O efeito (dano, guarda, empurrão...) entra no 'impact' da animação.
  use(id, { source = 'mão', confidence = 1, dir = 0 } = {}) {
    const ab = abilityById(id);
    if (!ab) return 'golpe desconhecido';
    if (this.state !== 'ready') {
      const why = this.state === 'walking' ? 'espere ele terminar de andar' : this.state === 'free' ? 'selecione o guerreiro' : this.state === 'carried' ? 'pouse o guerreiro primeiro' : 'termine o golpe anterior';
      this.say(`${ab.name}: ${why}.`, 'warn');
      return why;
    }
    const can = canUse(this.combat, this.unit, ab, { training: this.training });
    if (!can.ok) { this.say(`${ab.name}: ${can.reason}.`, 'err'); this.sfx('error'); return can.reason; }
    const plan = this.planFor(ab);
    if (plan.why) { this.say(`${ab.name}: ${plan.why}.`, 'warn'); this.sfx('error'); return plan.why; }
    spend(this.combat, this.unit, ab, { training: this.training });
    const castId = `golpe-${++this.seq}`;
    this.action = { ab, plan, arc: plan.arc, castId, source, confidence, dir, impact: false, done: false, hits: [] };
    if (plan.yaw !== undefined) this.yawTarget = plan.yaw;
    if (plan.area && plan.area.length) this.markers.show({ element: 'mover', range: [], area: plan.area, target: plan.mark || null, valid: true });
    else this.markers.hide();
    this.setState('acting');
    this.say(`${ab.name} (${source}${source === 'mão' ? `, ${Math.round(confidence * 100)}%` : ''})${this.training ? ' · treino' : ''}`, 'ok');
    this.sfx('confirm');
    if (this.onUsed) this.onUsed(ab, source);
    // vira para o alvo e só então começa
    this.action.wait = 0.12;
    return '';
  }

  // O plano de cada habilidade: { why (recusa) | yaw, area (casas marcadas), ... }.
  planFor(ab) {
    const facing = dirFromYaw(this.warrior.object.rotation.y), T = this.training, u = this.unit;
    const has = id => this.combat.hasStatus(u, id);
    switch (ab.id) {
      case 'corteHorizontal': {
        const arc = bestArc(this.combat, u, facing);
        if (!arc.hits.length && !T) return { why: 'nenhum inimigo nas casas ao lado. Chegue mais perto' };
        return { arc, yaw: yawFromDir(arc.dir), area: arc.tiles };
      }
      case 'golpeDevastador': {
        const tg = devastadorTarget(this.combat, u, facing);
        if (!tg) {
          if (!T) return { why: 'nenhum inimigo ao lado. Chegue mais perto' };
          const t = { col: u.tile.col + DIRS[facing][0], row: u.tile.row + DIRS[facing][1] };
          return { target: null, tile: t, dir: facing, yaw: yawFromDir(facing), area: this.combat.inBounds(t) ? [t] : [] };
        }
        return { ...tg, yaw: yawFromDir(tg.dir), area: [tg.tile], mark: tg.tile };
      }
      case 'guardaDeFerro':
        if (has('guardaDeFerro')) return { why: 'a guarda já está erguida' };
        return { area: [] };
      case 'contraAtaque':
        if (has('aparar')) return { why: 'o contra-ataque já está armado' };
        return { area: [] };
      case 'investida': {
        const p = investidaPlan(this.combat, u, facing, ab.range);
        if (!p.target) {
          if (!T) return { why: `${p.why} a até ${ab.range} casas, com o caminho livre` };
          return { path: [], stop: { ...u.tile }, target: null, dir: facing, yaw: yawFromDir(facing), area: [] };
        }
        return { ...p, yaw: yawFromDir(p.dir), area: [...p.path, p.target.tile], mark: p.target.tile };
      }
      case 'ondaDeChoque': {
        const p = shockwavePlan(this.combat, u, ab);
        if (!p.hits.length && !p.walls.length && !T) return { why: 'nenhum inimigo em volta' };
        const area = DIRS.map(([dc, dr]) => ({ col: u.tile.col + dc, row: u.tile.row + dr })).filter(t => this.combat.inBounds(t));
        return { ...p, area };
      }
      default: return { why: 'ainda não disponível' };
    }
  }

  startSwing() {
    const a = this.action;
    a.started = true;
    // rastro da lâmina: o corte grava o golpe inteiro; os golpes de arco grande só a descida (fase 'from') até o
    // impacto, senão erguer a espada por cima da cabeça vira um lençol de luz
    a.trail = { corteHorizontal: { life: 0.28 }, golpeDevastador: { color: [0.75, 0.42, 0.18], life: 0.2, from: 'golpe' }, ondaDeChoque: { color: [0.42, 0.6, 0.95], life: 0.18, from: 'golpear o chão' } }[a.ab.id] || null;
    if (a.trail && !a.trail.from) { this.wfx.start(a.trail.color, a.trail.life); a.trail.on = true; }
    this.anim.play(a.ab.anim, ev => {
      if (ev === 'dash') this.startDash();
      if (ev === 'impact') this.impact();
      if (ev === 'done') { a.done = true; this.wfx.stop(); }
    });
  }

  // Investida: o guerreiro corre em linha reta até a casa ao lado do alvo, durante a fase 'avançar' da animação.
  startDash() {
    const a = this.action, p = a.plan;
    if (!p.stop) return;
    const [x, z] = this.board.tileCenter(p.stop.col, p.stop.row);
    const dur = (this.anim.seq && this.anim.seq[this.anim.i] && this.anim.seq[this.anim.i].dur) || 0.3;
    a.dash = { from: this.warrior.object.position.clone(), to: new THREE.Vector3(x, 0, z), t: 0, dur };
  }

  impact() {
    const a = this.action;
    if (a.impact) return;
    a.impact = true;
    if (a.trail && a.trail.from) this.wfx.stop(); // arco grande: o rastro acaba no impacto e some sozinho
    const ab = a.ab, p = a.plan, C = this.combat, pos = this.warrior.object.position;
    const tileP = t => { const [x, z] = this.board.tileCenter(t.col, t.row); return new THREE.Vector3(x, 0, z); };
    let hits = [];
    switch (ab.id) {
      case 'corteHorizontal':
        hits = resolveSlash(C, ab, p.arc.tiles, a.castId); // o dano entra aqui, uma vez
        for (const h of hits) { const q = tileP(h.target.tile); this.wfx.sparks(new THREE.Vector3(q.x, 0.95, q.z)); }
        this.engine.shake(hits.length ? 0.035 : 0.012, 0.25);
        break;
      case 'golpeDevastador': {
        hits = p.target ? resolveDevastador(C, ab, p, a.castId) : [];
        const q = tileP(p.tile);
        this.wfx.slamImpact({ x: (q.x + pos.x) / 2 + (q.x - pos.x) * 0.25, z: (q.z + pos.z) / 2 + (q.z - pos.z) * 0.25 });
        if (hits.length) this.wfx.guardBreak(q);
        break;
      }
      case 'guardaDeFerro':
        armGuard(C, this.unit, ab);
        this.wfx.shieldGlow(this.warrior.shield, 1);
        this.wfx.fx.sparkle(new THREE.Vector3(pos.x, 1.1, pos.z), { color: [1.0, 1.4, 2.4], count: 18, speed: 1 });
        break;
      case 'contraAtaque':
        armCounter(C, this.unit, ab);
        this.wfx.fx.shockwave(pos.x, pos.z, { color: [1.2, 1.4, 2.2], radius: 0.7, duration: 0.45 });
        break;
      case 'investida': {
        if (a.dash) { pos.copy(a.dash.to); a.dash = null; }
        if (p.stop && (p.stop.col !== this.unit.tile.col || p.stop.row !== this.unit.tile.row)) C.enterTile(this.unit, p.stop);
        hits = p.target ? resolveInvestida(C, ab, p, a.castId) : [];
        const q = p.target ? tileP(p.target.tile) : pos.clone();
        this.wfx.bashImpact({ x: (q.x + pos.x) / 2, z: (q.z + pos.z) / 2 });
        if (p.target && this.onPush) this.onPush(p.target, null, 'tranco');
        break;
      }
      case 'ondaDeChoque': {
        const r = resolveShockwave(C, ab, p, a.castId);
        hits = r.hits;
        this.wfx.shockwave({ x: pos.x, z: pos.z });
        for (const e of r.pushed) if (this.onPush) this.onPush(e.unit, e.to, 'empurrão');
        a.pushed = r.pushed.map(e => ({ id: e.unit.id, to: { ...e.to } }));
        break;
      }
      default: break;
    }
    a.hits = hits;
    this.sfx(hits.length ? 'land' : 'press');
    this.log.push({ id: ab.id, castId: a.castId, hits: hits.map(h => ({ id: h.target.id, amount: h.amount })), pushed: a.pushed || [], source: a.source, training: this.training, at: performance.now() });
    if (this.log.length > 30) this.log.shift();
  }

  // ---------- Contra-ataque: a resposta (no turno dos inimigos) ----------
  // O combate aparou um ataque corpo a corpo (evento 'parry'): o guerreiro desvia e devolve um golpe rápido.
  // O dano da resposta entra no impacto da animação, uma vez; enquanto ele reage, o turno dos inimigos espera.
  onParry({ attacker }) {
    const ab = abilityById('contraAtaque');
    if (!ab || !attacker) return;
    const pos = this.warrior.object.position, ap = attacker.tile ? (() => { const [x, z] = this.board.tileCenter(attacker.tile.col, attacker.tile.row); return new THREE.Vector3(x, 0, z); })() : pos.clone();
    this.wfx.parryFlash({ x: (pos.x + ap.x) / 2, z: (pos.z + ap.z) / 2 });
    this.say('Aparou! Contra-ataque.', 'ok');
    this.sfx('confirm');
    const prev = this.state;
    this.reaction = { attacker, key: `contra-${++this.seq}`, prev, done: false, hit: null };
    this.yawTarget = Math.atan2(ap.x - pos.x, ap.z - pos.z);
    if (this.state !== 'acting') this.setState('acting');
    this.action = null;
    this.wfx.start([1.3, 1.4, 1.8]);
    this.anim.play('contraResposta', ev => {
      const R = this.reaction;
      if (!R) return;
      if (ev === 'impact' && !R.hit) {
        R.hit = counterStrike(this.combat, ab, R.attacker, R.key) || { amount: 0 };
        this.wfx.sparks(new THREE.Vector3(ap.x, 0.95, ap.z), 30);
        this.engine.shake(0.03, 0.2);
        this.log.push({ id: 'contraAtaque', castId: R.key, hits: R.hit.target ? [{ id: R.hit.target.id, amount: R.hit.amount }] : [], source: 'reação', training: this.training, at: performance.now() });
      }
      if (ev === 'done') { this.wfx.stop(); R.done = true; }
    });
  }

  get reacting() { return !!this.reaction && !this.reaction.done; }

  // ---------- quadro a quadro ----------
  update(dt) {
    this.stateT += dt;
    this.clock += dt;
    const obj = this.warrior.object, W = this.warrior;
    if (this.state === 'walking') this.stepWalk(dt);
    else {
      W.loco.speed *= Math.exp(-12 * dt);
      if (W.loco.speed < 0.02) W.loco.speed = 0;
    }
    W.loco.phase += dt * (W.loco.speed / 1.7) * 7.2;
    if (this.state !== 'carried') obj.rotation.y = angleLerp(obj.rotation.y, this.yawTarget, 1 - Math.exp(-12 * dt)); // no ar, quem gira é a telecinese
    if (this.state === 'acting' && this.reaction) {
      // resposta do contra-ataque
      if (this.anim.playing && W.sword) { const s = W.sword; this.wfx.record(s.group.localToWorld(s.base.clone()), s.group.localToWorld(s.tip.clone())); }
      if (this.reaction.done) { const prev = this.reaction.prev; this.reaction = null; this.setState(prev === 'acting' || prev === 'recovering' ? 'ready' : prev); this.refreshReach(); }
    } else if (this.state === 'acting') {
      const a = this.action;
      if (!a.started && (a.wait -= dt) <= 0) this.startSwing();
      if (a.dash) { // investida: corre até a casa de parada
        a.dash.t += dt;
        const u = Math.min(1, a.dash.t / a.dash.dur);
        obj.position.lerpVectors(a.dash.from, a.dash.to, u);
        W.loco.speed = 6;
        this.wfx.dashDust(obj.position, dt);
      }
      const tr = a.trail;
      if (tr && tr.from && !tr.on && !a.impact && this.anim.phaseName === tr.from) {
        // arco grande: só a parte do golpe na frente do corpo (erguer a espada por trás não deixa rastro)
        const ahead = t => (t.x - obj.position.x) * Math.sin(obj.rotation.y) + (t.z - obj.position.z) * Math.cos(obj.rotation.y) > 0.15;
        this.wfx.start(tr.color, tr.life, ahead); tr.on = true;
      }
      if (a.started && this.anim.playing && W.sword && tr && tr.on) {
        // a fita do rastro segue o fio da lâmina
        const s = W.sword;
        this.wfx.record(s.group.localToWorld(s.base.clone()), s.group.localToWorld(s.tip.clone()));
      }
      if (a.done) { if (!a.impact) this.impact(); this.markers.hide(); this.setState('recovering'); }
    } else if (this.state === 'recovering' && this.stateT > 0.15) {
      this.action = null;
      this.setState('ready');
      this.refreshReach();
    }
    // posturas que ficam com os efeitos (guarda erguida, contra-ataque armado), menos no meio de outra ação
    const free = this.state === 'ready' || this.state === 'free';
    W.stanceTarget.guard = free && this.unit.alive && this.combat.hasStatus(this.unit, 'guardaDeFerro') ? 1 : 0;
    W.stanceTarget.parry = free && this.unit.alive && this.combat.hasStatus(this.unit, 'aparar') ? 1 : 0;
    this.wfx.statusFx(dt, { guard: W.stanceTarget.guard > 0, parry: W.stanceTarget.parry > 0, pos: obj.position, shield: W.shield });
    // brilho de borda: azul selecionado, dourado com o ponteiro em cima (com a telecinese ativa, o brilho é dela)
    const t = performance.now() / 1000;
    if (this.tk && this.tk.state !== 'idle') return;
    if (this.state !== 'free') W.setGlow(0.42, 0.68, 1.9, 0.55 + 0.15 * Math.sin(t * 4));
    else if (this.hovered) W.setGlow(1.0, 0.72, 0.32, 1.0 + 0.2 * Math.sin(t * 5));
    else W.setGlow(0, 0, 0, 0);
  }
}

export { ABILITIES };
