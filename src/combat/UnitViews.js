// Liga as unidades do combate (só números) às figuras na cena: número de dano, barra de vida, efeitos
// visíveis, queda e volta dos bonecos, pulo e investida dos autômatos e a reação do mago ao levar dano.
// Efeitos visíveis de cada status:
//   queimadura  chamas saindo do corpo
//   lentidão    camada de gelo e névoa fria caindo
//   imobilizado cristais gigantes em volta (quebram quando o efeito acaba) e a camada de gelo
//   atordoado   faíscas elétricas em volta da cabeça e uma tremedeira leve
//   derrubado   tomba e, quando o efeito acaba, levanta
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

const STATUS_SHORT = { queimadura: 'queimando', lentidao: 'lento', imobilizado: 'preso', atordoado: 'atordoado', derrubado: 'caído', guardaQuebrada: 'guarda quebrada', guardaDeFerro: 'guarda de ferro', aparar: 'contra-ataque armado' };
const statusText = u => [...u.statuses.values()].map(s => `${STATUS_SHORT[s.id] || s.id} ${s.turns}`).join(' · ');

export class DummyView {
  constructor(unit, dummy, { board, spellFx }) {
    Object.assign(this, { unit, dummy, board, spellFx });
    this.burnAcc = { v: 0 };
    this.center = new THREE.Vector3();
    this.prison = null;
    this.fxAcc = 0;
  }

  get object() { return this.dummy.object; }
  point(out = new THREE.Vector3()) { return out.copy(this.dummy.object.position).setY(0.95); }

  hopTo(tile) { const [x, z] = this.board.tileCenter(tile.col, tile.row); this.dummy.hopTo(x, z); }
  lunge(tile) { const [x, z] = this.board.tileCenter(tile.col, tile.row); this.dummy.lunge(x, z); }

  onDamage({ amount, element, hpAfter }) {
    this.dummy.showHit(amount, element === 'fisico' ? 'normal' : element);
    this.dummy.setHp(hpAfter);
    if (element === 'raio') this.dummy.shock(1);
    if (element === 'terra') this.dummy.shake = 1.6;
  }

  // Reação pedida pela magia (a Corrente Elétrica treme cada alvo com força diferente).
  react(kind, k = 1) { if (kind === 'choque') this.dummy.shock(k); }

  refreshStatus() {
    const u = this.unit, d = this.dummy, has = id => u.alive && u.statuses.has(id);
    d.setStatusText(statusText(u));
    d.heat = has('queimadura') ? 1 : 0;
    d.setFrost(has('imobilizado') ? 1 : has('lentidao') ? 0.75 : 0);
    d.stunned = has('atordoado');
    if (has('imobilizado') && !this.prison) this.prison = this.spellFx.ice.makePrison(this.dummy.object.position);
    else if (!has('imobilizado') && this.prison) { this.spellFx.ice.shatterPrison(this.prison); this.prison = null; }
    if (has('derrubado')) { if (!this.down) { this.down = true; d.knockDown(); } }
    else if (this.down) { this.down = false; if (u.alive) d.getUp(); }
  }

  onDeath() { this.down = false; this.dummy.knockDown(); this.refreshStatus(); }
  onRevive() { this.dummy.standUp(); this.dummy.setHp(this.unit.hp); this.refreshStatus(); }

  update(dt, t) {
    this.dummy.update(dt, t);
    const u = this.unit, p = this.dummy.object.position;
    if (!u.alive) return;
    if (u.statuses.has('queimadura')) this.spellFx.burnEmit(p, dt, 1.2, this.burnAcc);
    this.fxAcc += dt;
    if (this.fxAcc < 0.09) return;
    this.fxAcc = 0;
    const fx = this.spellFx.fx;
    if (u.statuses.has('lentidao') || u.statuses.has('imobilizado')) { // névoa fria caindo do corpo
      const a = Math.random() * Math.PI * 2;
      fx.spawn({ p: [p.x + Math.cos(a) * 0.2, 0.6 + Math.random() * 0.9, p.z + Math.sin(a) * 0.2], v: [Math.cos(a) * 0.1, -0.25, Math.sin(a) * 0.1],
        life: 0.9 + Math.random() * 0.6, size: 0.05 + Math.random() * 0.05, color: [1.0, 1.8, 2.6], color2: [0.15, 0.3, 0.6], drag: 1.2 });
    }
    if (u.statuses.has('atordoado')) { // faíscas girando em volta da cabeça
      const a = t * 6 + Math.random();
      this.spellFx.lightning.sparks({ x: p.x + Math.cos(a) * 0.22, y: 1.62, z: p.z + Math.sin(a) * 0.22 }, { count: 3, speed: 0.8 });
    }
  }
}

export class MageView {
  constructor(unit, mage, anim, { spellFx }) {
    Object.assign(this, { unit, mage, anim, spellFx });
    this.burnAcc = { v: 0 };
  }

  point(out = new THREE.Vector3()) { return out.copy(this.mage.object.position).setY(this.mage.object.position.y + 1.0); }

  onDamage({ amount, element }) {
    this.anim.flinch(1);
    this.mage.glow.color.setRGB(2.6, 0.25, 0.12); // clarão vermelho que volta sozinho
    const tag = document.createElement('div');
    tag.className = `dmg mage ${element === 'fisico' ? 'normal' : element}`;
    tag.textContent = `-${amount}`;
    const obj = new CSS2DObject(tag);
    obj.position.set(0, 1.95, 0);
    this.mage.object.add(obj);
    setTimeout(() => { this.mage.object.remove(obj); tag.remove(); }, 1100);
  }

  refreshStatus() {}
  react() {}
  onDeath() {}
  onRevive() {}

  update(dt) {
    if (this.unit.alive && this.unit.statuses.has('queimadura')) this.spellFx.burnEmit(this.mage.object.position, dt, 1.3, this.burnAcc);
  }
}

// O guerreiro: número de dano em cima dele, tranco para trás (a mesma reação do mago), clarão vermelho na borda e
// os efeitos ativos escritos em cima da cabeça (guarda de ferro, contra-ataque armado...).
export class WarriorView {
  constructor(unit, warrior, anim, { spellFx }) {
    Object.assign(this, { unit, warrior, anim, spellFx });
    this.burnAcc = { v: 0 };
    const tag = document.createElement('div');
    tag.className = 'warrior-status';
    this.statusTag = tag;
    this.statusObj = new CSS2DObject(tag);
    this.statusObj.position.set(0, 2.25, 0);
    warrior.object.add(this.statusObj);
  }

  get object() { return this.warrior.object; }
  point(out = new THREE.Vector3()) { return out.copy(this.warrior.object.position).setY(1.0); }

  onDamage({ amount, element }) {
    this.anim.flinch(1);
    this.warrior.glow.color.setRGB(2.6, 0.25, 0.12);
    const tag = document.createElement('div');
    tag.className = `dmg mage ${element === 'fisico' ? 'normal' : element}`;
    tag.textContent = `-${amount}`;
    const obj = new CSS2DObject(tag);
    obj.position.set(0, 2.05, 0);
    this.warrior.object.add(obj);
    setTimeout(() => { this.warrior.object.remove(obj); tag.remove(); }, 1100);
  }

  refreshStatus() { this.statusTag.textContent = this.unit.alive ? statusText(this.unit) : ''; }
  react() {}
  onDeath() {}
  onRevive() {}

  update(dt) {
    if (this.unit.alive && this.unit.statuses.has('queimadura')) this.spellFx.burnEmit(this.warrior.object.position, dt, 1.3, this.burnAcc);
  }
}
