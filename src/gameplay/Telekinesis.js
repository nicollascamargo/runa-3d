// Telecinese: pegar um personagem, levantar, levar pelo ar e pousar numa casa livre.
// Recebe só "ponteiro" (posição, apertar, soltar, cancelar). Não sabe se veio do mouse ou da pinça da mão.
// Serve para qualquer personagem compatível (o mago, o guerreiro...): um objeto com
//   object   o grupo da cena (posição e giro)
//   scale    escala do modelo (altura de onde a mão pega)
//   setGlow(r, g, b, k)  brilho de borda
//   flight   camada de voo, lida pelo próprio personagem: { air, grab, land, pitch, roll, fwd, side, speed }
//   pickHeight (opcional) altura da cápsula invisível usada para apontar (padrão: 1,78 m × escala)
// Cada personagem tem a sua instância (src/main.js); TelekinesisGroup decide qual delas o ponteiro aponta.
//
// Estados:
//   parado -> selecionado (ponteiro em cima do personagem)
//   -> agarrado (apertou/fechou a pinça: o personagem reage) -> subindo (os pés saem do chão)
//   -> levitando / movendo no ar (segue o ponteiro com mola, inclina na direção do movimento)
//   -> descendo (soltou sobre casa livre) -> pousando (agacha, faíscas e onda no chão) -> parado
//   soltar em casa inválida (ocupada, longe demais, fora do tabuleiro), ou cancelar:
//   -> voltando (para a casa de origem) -> descendo -> pousando
import * as THREE from 'three';
import { runeCircleTexture } from '../fx/textures.js';

export const STATE_NAMES = {
  idle: 'parado', selected: 'selecionado', grabbed: 'agarrado', lifting: 'subindo', levitating: 'levitando',
  moving: 'movendo no ar', releasing: 'descendo', landing: 'pousando', returning: 'voltando',
};
const HELD = new Set(['grabbed', 'lifting', 'levitating', 'moving']);

const PICK_RADIUS = 0.42;    // raio da cápsula invisível usada para apontar o personagem

// Como o personagem pesa no ar. O padrão é o do mago (os números de antes, sem mudança).
//   hover     altura dos pés quando levita (metros)
//   follow    rigidez da mola que segue o ponteiro (maior = acompanha mais rápido)
//   lift      rigidez da subida;  drop: da descida
//   bob       balanço vertical no ar (metros) e bobRate (ritmo)
//   lean      quanto inclina com a velocidade
//   swing     balanço de pêndulo (0 = nenhum): o corpo pendurado atrasa nas arrancadas e balança ao parar
//   landTime  duração do pouso (agachar e levantar)
export const MAGE_FEEL = { hover: 0.72, follow: 10, lift: 6, drop: 9, bob: 0.05, bobRate: 2.3, lean: 0.09, swing: 0, landTime: 0.5, grabTime: 0.16 };

const smooth = (from, to, rate, dt) => from + (to - from) * (1 - Math.exp(-rate * dt));
const angleLerp = (a, b, k) => { let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI; if (d < -Math.PI) d += Math.PI * 2; return a + d * k; };

export class Telekinesis {
  // body: o personagem (ou 'mage', o nome antigo). board: o tabuleiro.
  // isFree(tile): a casa pode receber o personagem. isBlocked(tile): tem alguém ou algo lá (o personagem desvia
  //   no ar); padrão: toda casa que não está livre. invalidReason(tile): por que a casa não serve (para a mensagem).
  // canGrab(): '' pode pegar; texto = por que não. tileOf(): a casa onde o personagem está (se outro sistema
  //   também o move, como a caminhada do guerreiro). controlsYaw: true = a telecinese sempre gira o personagem
  //   (o mago vira para o alvo das magias por aqui); 'flight' = só enquanto está na mão dela.
  // idleGlow: false = parado, o brilho de borda fica por conta de quem controla o personagem.
  constructor({
    body, mage, board, fx, scene, tile, name = 'o mago', feel = {}, isFree, isBlocked = null, invalidReason = null, canGrab = () => '',
    tileOf = null, controlsYaw = true, idleGlow = true, occupant = () => '',
    sfx = () => {}, onState = () => {}, onLand = () => {}, onMessage = () => {},
  }) {
    this.body = body || mage;
    Object.assign(this, { board, fx, isFree, occupant, sfx, onState, onLand, onMessage, name, canGrab, tileOf, controlsYaw, idleGlow });
    this.isBlocked = isBlocked || (t => !isFree(t));
    this.invalidReason = invalidReason || (t => (!t ? 'Fora do tabuleiro' : `Casa ocupada${this.occupant(t) ? ` pelo ${this.occupant(t)}` : ''}`));
    this.feel = { ...MAGE_FEEL, ...feel };
    this.state = 'idle';
    this.stateT = 0;
    this._tile = tile;        // casa onde o personagem está (ou de onde saiu)
    this.origin = tile;
    this.goal = null;         // casa para onde voa sozinho (voltar, desfazer)
    this.landTile = null;
    this.undo = false;
    this.pos = this.body.object.position;
    this.vel = new THREE.Vector3();
    this.aim = new THREE.Vector3().copy(this.pos);
    this.h = 0; this.hv = 0;
    this.yaw = this.body.object.rotation.y;
    this.lean = { pitch: 0, roll: 0, vp: 0, vr: 0 };
    this.grab = 0; this.land = 0; this.speed = 0;
    this.hovered = false;
    this.dest = null;         // { tile, valid, point }
    this.lastPointer = null;
    this.grabY = 0;
    this.grabOffset = new THREE.Vector2();
    this.faceYaw = null;      // para onde o personagem se vira no chão (as magias viram o mago para o alvo)
    this.showingDest = false; // o marcador de destino do tabuleiro é desta telecinese agora (há um só para todos)
    this.prevVel = new THREE.Vector2();

    // círculo de runas no chão, embaixo do personagem enquanto ele levita
    const tex = runeCircleTexture(512, 77);
    this.circleMat = new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(0, 0, 0), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    this.circle = new THREE.Mesh(new THREE.PlaneGeometry(1.25, 1.25).rotateX(-Math.PI / 2), this.circleMat);
    this.circle.renderOrder = 3;
    this.circle.visible = false;
    scene.add(this.circle);
  }

  get mage() { return this.body; } // nome antigo
  get tile() { return this.tileOf && !this.busy ? this.tileOf() || this._tile : this._tile; }
  set tile(t) { this._tile = t; }
  get holding() { return HELD.has(this.state); }
  get busy() { return this.state !== 'idle' && this.state !== 'selected'; }
  get stateName() { return STATE_NAMES[this.state]; }
  get flying() { return this.holding || this.state === 'returning' || this.state === 'releasing'; }

  setState(s) {
    if (s === this.state) return;
    this.state = s;
    this.stateT = 0;
    this.onState(s);
  }

  // Distância (ao longo do raio) até o corpo do personagem; Infinity se o raio não passa perto dele.
  // A cápsula vai do tornozelo à cabeça. Apontar a casa dele também vale.
  hitDistance(ray, tile) {
    const p = this.pos, s = this.body.scale || 0.95, top = this.body.pickHeight || 1.78 * s;
    const a = new THREE.Vector3(p.x, p.y + 0.12, p.z), b = new THREE.Vector3(p.x, p.y + top, p.z), on = new THREE.Vector3();
    if (ray.distanceSqToSegment(a, b, null, on) <= PICK_RADIUS * PICK_RADIUS) return on.distanceTo(ray.origin);
    const t = this.tile;
    if (tile && t && tile.col === t.col && tile.row === t.row) return ray.origin.distanceTo(p) + 0.5; // a casa perde para o corpo
    return Infinity;
  }

  // O raio do ponteiro passa perto do corpo do personagem?
  hits(ray, tile) { return this.hitDistance(ray, tile) < Infinity; }

  // ---------- entradas ----------
  // pick: { ray, floor (ponto no chão ou null), tile (casa ou null) }
  pointerMove(pick) {
    this.lastPointer = pick;
    if (this.holding) { if (!this.goal) this.updateAim(pick); return; }
    this.hovered = this.hits(pick.ray, pick.tile);
    if (!this.busy) this.setState(this.hovered ? 'selected' : 'idle');
  }

  pointerLeave() {
    this.lastPointer = null;
    this.hovered = false;
    if (!this.busy) this.setState('idle');
  }

  // Devolve true se pegou o personagem. Se apontou para ele mas não pode pegar agora, explica e devolve false
  // (e deixa this.refused = motivo, para quem chamou não tratar o clique como outra coisa).
  pointerDown(pick) {
    this.lastPointer = pick;
    this.refused = '';
    if (this.busy || !this.hits(pick.ray, pick.tile)) return false;
    const why = this.canGrab();
    if (why) { this.refused = why; this.onMessage(why); this.sfx('error'); return false; }
    this.faceYaw = null;
    this._tile = this.tile;
    this.origin = this._tile;
    this.goal = null;
    this.undo = false;
    this.grab = 1;
    this.vel.set(0, 0, 0);
    this.prevVel.set(0, 0);
    this.yaw = this.body.object.rotation.y;
    this.aim.set(this.pos.x, 0, this.pos.z);
    // Ponto do corpo onde a "mão" pegou (altura acima dos pés). Enquanto segura, esse ponto fica
    // embaixo do cursor, como quem segura uma peça pela cabeça: o personagem não pula ao ser pego.
    const s = this.body.scale || 0.95, onAxis = new THREE.Vector3();
    pick.ray.distanceSqToSegment(new THREE.Vector3(this.pos.x, 0.25, this.pos.z), new THREE.Vector3(this.pos.x, 1.7 * s, this.pos.z), null, onAxis);
    this.grabY = onAxis.y;
    const p = this.rayAt(pick.ray, this.grabY);
    this.grabOffset = p ? new THREE.Vector2(this.pos.x - p.x, this.pos.z - p.z) : new THREE.Vector2();
    this.setState('grabbed');
    this.updateAim(pick);
    this.blocked = this.blockedTiles();
    this.board.showBlocked(this.blocked);
    this.sfx('grab');
    this.fx.sparkle(new THREE.Vector3(this.pos.x, 1.0, this.pos.z), { count: 30, speed: 1.6 });
    return true;
  }

  pointerUp(pick) {
    if (!this.holding || this.goal) return; // voando sozinho (desfazer), o ponteiro não manda
    if (pick) this.updateAim(pick);
    const d = this.dest;
    if (d && d.valid) {
      this.landTile = d.tile;
      this.setState('releasing');
      this.sfx('drop');
    } else {
      this.onMessage(`${this.invalidReason(d && d.tile)}: ${this.name} voltou para ${tileName(this.origin)}.`);
      this.sfx('error');
      this.goBack();
    }
  }

  // Soltar sem escolher casa (Esc, mão saiu da câmera): volta para onde estava.
  cancel(reason = '') {
    if (!this.holding) return false;
    if (reason) this.onMessage(reason);
    this.sfx('back');
    this.goBack();
    return true;
  }

  goBack() {
    this.goal = this.origin;
    this.dest = null;
    this.setState('returning');
  }

  // Voo automático até uma casa (usado para desfazer o último movimento).
  flyTo(tile, { undo = false } = {}) {
    if (this.busy) return false;
    this._tile = this.tile;
    this.origin = this._tile;
    this.goal = tile;
    this.undo = undo;
    this.grab = 0.5;
    this.vel.set(0, 0, 0);
    this.yaw = this.body.object.rotation.y;
    this.aim.set(this.pos.x, 0, this.pos.z);
    this.blocked = [];
    this.setState('lifting');
    this.sfx('grab');
    return true;
  }

  // Vira o personagem (no chão) para um ponto do mundo.
  faceTo(x, z) { this.faceYaw = Math.atan2(x - this.pos.x, z - this.pos.z); }

  blockedTiles() {
    const out = [];
    for (let row = 0; row < 8; row++) for (let col = 0; col < 8; col++) if (this.isBlocked({ col, row })) out.push({ col, row });
    return out;
  }

  // onde o raio do ponteiro cruza a altura y
  rayAt(ray, y) {
    if (Math.abs(ray.direction.y) < 1e-4) return null;
    const k = (y - ray.origin.y) / ray.direction.y;
    return k > 0 ? ray.at(k, new THREE.Vector3()) : null;
  }

  // O ponto pego fica sob o cursor: o personagem vai para onde o raio cruza a altura desse ponto agora.
  updateAim(pick) {
    const p = this.rayAt(pick.ray, (this.grabY || 0) + this.h);
    if (!p) return;
    const want = new THREE.Vector3(p.x + this.grabOffset.x, 0, p.z + this.grabOffset.y);
    // a casa de destino é a que fica embaixo do personagem
    const tile = this.board.tileAt(want.x, want.z);
    this.dest = { tile, valid: !!tile && this.isFree(tile), point: want.clone() };
    // o personagem acompanha o ponteiro, mas não sai voando para dentro das paredes da caverna
    const lim = 4.6;
    this.aim.set(THREE.MathUtils.clamp(want.x, -lim, lim), 0, THREE.MathUtils.clamp(want.z, -lim, lim));
    // casas ocupadas empurram o personagem para o lado: ele não atravessa os bonecos
    for (const b of this.blocked || []) {
      const [bx, bz] = this.board.tileCenter(b.col, b.row);
      const dx = this.aim.x - bx, dz = this.aim.z - bz, d = Math.hypot(dx, dz), min = 0.62;
      if (d < min) {
        const k = d > 1e-4 ? min / d : 0;
        this.aim.set(bx + (k ? dx * k : min), 0, bz + (k ? dz * k : 0));
      }
    }
  }

  // ---------- quadro a quadro ----------
  update(dt, t) {
    this.stateT += dt;
    const s = this.state, F = this.feel, HOVER = F.hover;
    let hTarget = 0, omega = F.follow, omegaH = 7;

    if (this.holding && !this.goal && this.lastPointer) this.updateAim(this.lastPointer);
    if (s === 'grabbed') {
      if (this.stateT >= F.grabTime) this.setState('lifting');
    } else if (s === 'lifting') {
      hTarget = HOVER; omegaH = F.lift;
      if (this.goal) this.aim.set(this.pos.x, 0, this.pos.z);
      if (this.h > HOVER * 0.85) this.setState(this.goal ? 'returning' : 'levitating');
    } else if (s === 'levitating' || s === 'moving') {
      hTarget = HOVER + Math.sin(t * F.bobRate) * F.bob;
      this.setState(this.speed > 0.35 ? 'moving' : 'levitating');
    } else if (s === 'returning') {
      hTarget = HOVER; omega = F.follow * 0.7;
      const [gx, gz] = this.board.tileCenter(this.goal.col, this.goal.row);
      this.aim.set(gx, 0, gz);
      if (Math.hypot(gx - this.pos.x, gz - this.pos.z) < 0.08 && this.speed < 0.6) { this.landTile = this.goal; this.setState('releasing'); }
    } else if (s === 'releasing') {
      const [lx, lz] = this.board.tileCenter(this.landTile.col, this.landTile.row);
      this.aim.set(lx, 0, lz);
      omega = F.follow * 1.1; omegaH = F.drop;
      const dist = Math.hypot(lx - this.pos.x, lz - this.pos.z);
      hTarget = dist < 0.3 ? 0 : HOVER * 0.75;
      if (this.h < 0.012 && dist < 0.04) this.touchDown(lx, lz);
    } else if (s === 'landing') {
      if (this.stateT >= F.landTime) {
        this.hovered = !!this.lastPointer && this.hits(this.lastPointer.ray, this.lastPointer.tile);
        this.setState(this.hovered ? 'selected' : 'idle');
      }
    }

    // mola criticamente amortecida no plano (sem passar do ponto), em passos pequenos
    if (s !== 'idle' && s !== 'selected' && s !== 'landing') {
      let left = dt;
      while (left > 1e-6) {
        const h = Math.min(left, 1 / 120);
        left -= h;
        this.vel.x += (omega * omega * (this.aim.x - this.pos.x) - 2 * omega * this.vel.x) * h;
        this.vel.z += (omega * omega * (this.aim.z - this.pos.z) - 2 * omega * this.vel.z) * h;
        this.pos.x += this.vel.x * h;
        this.pos.z += this.vel.z * h;
        this.hv += (omegaH * omegaH * (hTarget - this.h) - 2 * omegaH * this.hv) * h;
        this.h = Math.max(0, this.h + this.hv * h);
      }
    }
    this.pos.y = this.h;
    this.speed = Math.hypot(this.vel.x, this.vel.z);

    // vira para onde está indo e inclina o corpo
    const air = THREE.MathUtils.clamp(this.h / HOVER, 0, 1);
    const mine = this.controlsYaw === true || (s !== 'idle' && s !== 'selected');
    if (this.speed > 0.6 && this.h > 0.1) this.yaw = angleLerp(this.yaw, Math.atan2(this.vel.x, this.vel.z), 1 - Math.exp(-4 * dt));
    else if (this.faceYaw !== null && this.h < 0.05) this.yaw = angleLerp(this.yaw, this.faceYaw, 1 - Math.exp(-9 * dt));
    if (mine) this.body.object.rotation.y = this.yaw;
    else this.yaw = this.body.object.rotation.y;
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    const fwd = this.vel.x * sy + this.vel.z * cy, side = this.vel.x * cy - this.vel.z * sy;
    const pitchTo = THREE.MathUtils.clamp(fwd * F.lean, -0.32, 0.32) * air, rollTo = THREE.MathUtils.clamp(-side * F.lean, -0.3, 0.3) * air;
    if (F.swing > 0 && dt > 0) {
      // pêndulo: a arrancada empurra o corpo para trás (aceleração), uma mola pouco amortecida o traz de volta
      const ax = (this.vel.x - this.prevVel.x) / dt, az = (this.vel.z - this.prevVel.y) / dt;
      const afwd = ax * sy + az * cy, aside = ax * cy - az * sy;
      const pT = pitchTo - THREE.MathUtils.clamp(afwd * 0.012 * F.swing, -0.2, 0.2) * air;
      const rT = rollTo + THREE.MathUtils.clamp(aside * 0.012 * F.swing, -0.2, 0.2) * air;
      const w = 6.5, z = 0.32, L = this.lean;
      let left = dt;
      while (left > 1e-6) {
        const h = Math.min(left, 1 / 120);
        left -= h;
        L.vp += (w * w * (pT - L.pitch) - 2 * z * w * L.vp) * h; L.pitch += L.vp * h;
        L.vr += (w * w * (rT - L.roll) - 2 * z * w * L.vr) * h; L.roll += L.vr * h;
      }
    } else {
      this.lean.pitch = smooth(this.lean.pitch, pitchTo, 8, dt);
      this.lean.roll = smooth(this.lean.roll, rollTo, 8, dt);
    }
    this.prevVel.set(this.vel.x, this.vel.z);
    this.grab *= Math.exp(-5 * dt);
    this.land = s === 'landing' ? Math.sin(Math.PI * Math.min(1, this.stateT / F.landTime) ** 0.6) : smooth(this.land, 0, 10, dt);

    this.body.flight = { air: s === 'landing' ? 0 : air, grab: this.grab, land: this.land, pitch: this.lean.pitch, roll: this.lean.roll, fwd, side, speed: this.speed };

    // brilho de borda: dourado quando o ponteiro está em cima, azul arcano quando a telecinese segura
    if (this.holding || s === 'returning') this.body.setGlow(0.42, 0.68, 1.9, 0.85 + 0.25 * Math.sin(t * 7));
    else if (s === 'releasing') this.body.setGlow(0.42, 0.68, 1.9, 0.6);
    else if (s === 'selected') this.body.setGlow(1.0, 0.72, 0.32, 1.1 + 0.2 * Math.sin(t * 5));
    else if (this.idleGlow) this.body.setGlow(0, 0, 0, 0);

    // círculo embaixo do personagem e brilho subindo
    this.circle.visible = this.h > 0.01;
    if (this.circle.visible) {
      this.circle.position.set(this.pos.x, 0.018, this.pos.z);
      this.circle.rotation.y += dt * 0.9;
      const k = air * (0.75 + 0.15 * Math.sin(t * 4));
      this.circleMat.color.setRGB(0.35 * k, 0.65 * k, 1.8 * k);
      this.circle.scale.setScalar(0.7 + 0.3 * air);
      this.fx.aura(this.pos, air, dt);
    }

    // marcador de destino (um só no tabuleiro: só quem está voando mexe nele)
    if (this.goal && (s === 'lifting' || s === 'returning')) this.showDest(this.goal, true, null, true);
    else if (this.holding && this.dest) this.showDest(this.dest.tile, this.dest.valid, this.dest.point);
    else if (s === 'releasing' && this.landTile) this.showDest(this.landTile, true);
    else if (this.showingDest) { this.board.setDestination(null); this.showingDest = false; }
  }

  showDest(tile, valid, point = null, homing = false) {
    this.board.setDestination(tile, valid, point, homing);
    this.showingDest = true;
  }

  touchDown(x, z) {
    this.pos.set(x, 0, z);
    this.vel.set(0, 0, 0);
    this.h = 0; this.hv = 0;
    const from = this.origin, to = this.landTile;
    this._tile = to;
    this.board.showBlocked(null);
    this.setState('landing');
    this.fx.landing(x, z);
    this.sfx('land');
    this.onLand(to, from, { undo: this.undo });
    this.undo = false;
    this.goal = null;
  }
}

// Vários personagens, uma mão: decide qual telecinese o ponteiro aponta (o corpo mais perto ao longo do raio)
// e garante que só um fique na mão por vez.
export class TelekinesisGroup {
  constructor(list) { this.list = list; this.hovered = null; }
  get holder() { return this.list.find(t => t.holding) || null; }
  get holding() { return !!this.holder; }
  get flying() { return this.list.find(t => t.flying) || null; }
  get busy() { return this.list.some(t => t.busy); }

  // a telecinese cujo personagem está sob o ponteiro (a mais perto, se dois se sobrepõem na tela)
  under(pick) {
    let best = null, bd = Infinity;
    for (const t of this.list) { const d = t.busy ? Infinity : t.hitDistance(pick.ray, pick.tile); if (d < bd) { bd = d; best = t; } }
    return best;
  }

  pointerMove(pick) {
    const held = this.holder;
    if (held) { held.pointerMove(pick); return; }
    const hit = this.under(pick);
    this.hovered = hit;
    // quem está ocupado (pousando, voltando) continua sabendo onde o ponteiro está; dos outros, só o apontado
    for (const t of this.list) { if (t === hit || t.busy) t.pointerMove(pick); else t.pointerLeave(); }
  }

  pointerLeave() { this.hovered = null; for (const t of this.list) t.pointerLeave(); }

  // Devolve { tk, grabbed } quando o ponteiro estava num personagem (pegou ou explicou por que não), ou null.
  pointerDown(pick) {
    if (this.holding) return null;
    const hit = this.under(pick);
    if (!hit) return null;
    const grabbed = hit.pointerDown(pick);
    for (const t of this.list) if (t !== hit) t.pointerLeave();
    return grabbed || hit.refused ? { tk: hit, grabbed } : null;
  }

  pointerUp(pick) { const h = this.holder; if (h) h.pointerUp(pick); }
  cancel(reason) { const h = this.holder; return h ? h.cancel(typeof reason === 'function' ? reason(h) : reason) : false; }
}

export const tileName = tile => (tile ? `${'ABCDEFGH'[tile.col]}${8 - tile.row}` : '–');
