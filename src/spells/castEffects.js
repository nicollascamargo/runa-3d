// Execução das magias na cena: a linha do tempo de cada uma, ligando a animação do mago, os efeitos
// visuais e o instante do impacto (quando resolve() aplica as regras, uma única vez).
// Cada execução devolve um objeto com update(dt) que responde true quando terminou.
//
// Recebe: spell, target (a avaliação do alvo), mage, anim, spellFx, targetPoint (ponto do alvo no mundo),
// resolve(parte), pointOf(unidade), tileCenter(casa) -> [x, z], react(unidade, tipo, força).
import * as THREE from 'three';

const v = () => new THREE.Vector3();

// Mãos, cristal do cajado e a frente do mago, lidos dos ossos a cada quadro.
function body(mage) {
  const lh = v(), rh = v(), staff = v(), fwd = v(), feet = v();
  const read = () => {
    mage.bones.LeftHand.getWorldPosition(lh);
    mage.bones.RightHand.getWorldPosition(rh);
    if (mage.staff && mage.staff.crystal) mage.staff.crystal.getWorldPosition(staff); else staff.copy(rh).y += 0.6;
    fwd.set(Math.sin(mage.object.rotation.y), 0, Math.cos(mage.object.rotation.y));
    feet.copy(mage.object.position).setY(0);
  };
  read();
  return { lh, rh, staff, fwd, feet, read, mid: () => lh.clone().add(rh).multiplyScalar(0.5) };
}

// Base comum: toca a animação, avisa os eventos e termina quando a animação e o efeito acabaram.
function runner(anim, name, onEvent) {
  const st = { animDone: false };
  anim.play(name, ev => { if (ev === 'done') st.animDone = true; onEvent(ev); });
  return st;
}

// Brilho do cristal do cajado (carga): a luz e o cristal acendem por cima do pulsar normal.
function staffGlow(mage, k, color) {
  const s = mage.staff;
  if (!s) return;
  if (s.light) { s.light.intensity += k * 9; if (color) s.light.color.set(color); }
  if (s.crystalMat) s.crystalMat.emissiveIntensity += k * 4;
}
function staffReset(mage) { if (mage.staff && mage.staff.light) mage.staff.light.color.set('#4b8dff'); }

// ---------- Bola de Fogo ----------
//   preparação e conjuração: a esfera nasce entre as mãos e cresce, com chamas subindo;
//   impulso: a esfera vai para a mão livre, que puxa para trás;
//   lançamento: o braço arremessa; a esfera voa em arco até o alvo, deixando rastro;
//   impacto: explosão, luz, tremor, marca de queimadura; o dano e a queimadura entram aqui.
function castFireball({ spell, mage, anim, spellFx, targetPoint, resolve }) {
  const orb = spellFx.takeOrb();
  const B = body(mage), from = v(), to = targetPoint.clone();
  let phase = 'charge', flight = null, after = 0;
  orb.group.position.copy(B.mid());
  const st = runner(anim, spell.anim, ev => {
    if (ev === 'windup') phase = 'windup';
    if (ev === 'release') {
      phase = 'flight';
      from.copy(orb.group.position);
      const dist = from.distanceTo(to);
      flight = { t: 0, dur: Math.max(0.28, dist / 11), arc: 0.35 + dist * 0.05 };
    }
  });
  return {
    get phase() { return phase; },
    update(dt) {
      B.read();
      if (phase === 'charge') {
        const p = B.mid().addScaledVector(B.fwd, 0.16);
        p.y += 0.04;
        orb.group.position.lerp(p, 1 - Math.exp(-18 * dt));
        orb.size = Math.min(0.15, orb.size + dt * 0.2);
        spellFx.updateOrb(orb, dt);
      } else if (phase === 'windup') {
        orb.group.position.lerp(B.lh.clone().addScaledVector(B.fwd, 0.06), 1 - Math.exp(-25 * dt));
        orb.size = Math.min(0.17, orb.size + dt * 0.3);
        spellFx.updateOrb(orb, dt);
      } else if (phase === 'flight') {
        flight.t += dt;
        const u = Math.min(1, flight.t / flight.dur);
        orb.group.position.lerpVectors(from, to, u);
        orb.group.position.y += Math.sin(Math.PI * u) * flight.arc;
        spellFx.updateOrb(orb, dt, { trail: 1 });
        if (u >= 1) {
          phase = 'impact';
          spellFx.freeOrb(orb);
          spellFx.explodeFire(to, { radius: (spell.area || 0) + 0.55 });
          resolve(); // dano e queimadura: uma vez, no impacto
        }
      } else if (phase === 'impact') {
        after += dt;
        if (after > 0.6 && st.animDone) phase = 'done';
      }
      return phase === 'done';
    },
    abort() { spellFx.freeOrb(orb); anim.stop(); phase = 'done'; },
  };
}

// ---------- Parede de Chamas ----------
//   ergue o cajado: o cristal pega fogo; varre: um rastro de fogo corre até as casas escolhidas e a parede
//   sobe, casa por casa (as chamas que ficam são de src/fx/FireWallFx.js, ligadas aos perigos do combate).
function castFireWall({ spell, target, mage, anim, spellFx, tileCenter, resolve }) {
  const B = body(mage), fx = spellFx.fx;
  const [cx, cz] = tileCenter(target.tile), to = new THREE.Vector3(cx, 0.3, cz);
  let phase = 'charge', t = 0, run = null, after = 0;
  const st = runner(anim, spell.anim, ev => { if (ev === 'release') { phase = 'run'; run = { t: 0, from: B.staff.clone() }; } });
  return {
    get phase() { return phase; },
    update(dt) {
      t += dt; B.read();
      if (phase === 'charge') {
        staffGlow(mage, Math.min(1, t / 0.6), '#ff7a2a');
        if (Math.random() < dt * 60 * spellFx.density) fx.spawn({ p: [B.staff.x + (Math.random() - 0.5) * 0.1, B.staff.y, B.staff.z + (Math.random() - 0.5) * 0.1], v: [0, 0.8 + Math.random(), 0], life: 0.3 + Math.random() * 0.3, size: 0.09, color: [2.6, 1.1, 0.25], color2: [0.5, 0.05, 0.02], drag: 1.5, gravity: 0.6 });
      } else if (phase === 'run') {
        run.t += dt;
        const u = Math.min(1, run.t / 0.28), p = run.from.clone().lerp(to, u);
        for (let i = 0; i < 4; i++) fx.spawn({ p: [p.x, p.y, p.z], v: [(Math.random() - 0.5) * 0.8, 0.5 + Math.random(), (Math.random() - 0.5) * 0.8], life: 0.3 + Math.random() * 0.3, size: 0.12, color: [2.8, 1.3, 0.3], color2: [0.5, 0.05, 0.02], drag: 2, gravity: 0.5 });
        if (u >= 1) { phase = 'impact'; staffReset(mage); resolve(); fx.shockwave(cx, cz, { color: [2.6, 0.9, 0.2], radius: 1.4, duration: 0.45 }); spellFx.engine.shake(0.025, 0.3); }
      } else if (phase === 'impact') {
        after += dt;
        if (after > 0.4 && st.animDone) phase = 'done';
      }
      return phase === 'done';
    },
    abort() { staffReset(mage); anim.stop(); phase = 'done'; },
  };
}

// ---------- Lança de Gelo ----------
//   concentração: cristais crescem em volta da mão livre e a lança se forma no ar, à frente dela;
//   mira e disparo: a lança voa reta, rápida, deixando névoa; impacto: estilhaços, névoa fria, luz azul.
function castIceSpear({ spell, mage, anim, spellFx, targetPoint, resolve }) {
  const ice = spellFx.ice, B = body(mage), to = targetPoint.clone(), from = v();
  const ring = ice.takeRing(6), spear = ice.takeSpear();
  let phase = 'charge', t = 0, flight = null, after = 0;
  const st = runner(anim, spell.anim, ev => {
    if (ev === 'release') {
      phase = 'flight';
      from.copy(spear.position);
      flight = { t: 0, dur: Math.max(0.12, from.distanceTo(to) / 24) };
      ice.freeRing(ring);
    }
  });
  return {
    get phase() { return phase; },
    update(dt) {
      t += dt; B.read();
      if (phase === 'charge') {
        ring.grow = Math.min(1, t / 0.9);
        ice.updateRing(ring, B.lh, dt);
        spear.position.copy(B.lh).addScaledVector(B.fwd, 0.4);
        spear.position.y += 0.05;
        spear.lookAt(to);
        spear.scale.set(1, 1, Math.max(0.001, Math.min(1, (t - 0.25) / 0.9)));
      } else if (phase === 'flight') {
        flight.t += dt;
        const u = Math.min(1, flight.t / flight.dur);
        spear.position.lerpVectors(from, to, u);
        spear.lookAt(to);
        ice.trail(spear.position, dt);
        if (u >= 1) { phase = 'impact'; ice.freeSpear(spear); ice.impact(to); resolve(); }
      } else if (phase === 'impact') {
        after += dt;
        if (after > 0.5 && st.animDone) phase = 'done';
      }
      return phase === 'done';
    },
    abort() { ice.freeRing(ring); ice.freeSpear(spear); anim.stop(); phase = 'done'; },
  };
}

// ---------- Prisão Glacial ----------
//   a mão aberta concentra: névoa fria sobe em volta do alvo e uma onda azul no chão marca o lugar;
//   a mão fecha: os cristais gigantes brotam do chão (o efeito "imobilizado" cria e depois quebra os cristais).
function castGlacialPrison({ spell, mage, anim, spellFx, targetPoint, resolve }) {
  const ice = spellFx.ice, B = body(mage), at = targetPoint.clone(), fx = spellFx.fx;
  const ring = ice.takeRing(4);
  let phase = 'charge', t = 0, after = 0, pulse = 0;
  const st = runner(anim, spell.anim, ev => {
    if (ev === 'release') { phase = 'impact'; ice.freeRing(ring); resolve(); ice.impact(new THREE.Vector3(at.x, 0.25, at.z), { scale: 0.7 }); spellFx.engine.shake(0.02, 0.25); }
  });
  return {
    get phase() { return phase; },
    update(dt) {
      t += dt; B.read();
      if (phase === 'charge') {
        ring.grow = Math.min(1, t / 0.7);
        ice.updateRing(ring, B.lh, dt);
        if ((pulse -= dt) <= 0) { pulse = 0.35; fx.shockwave(at.x, at.z, { color: [0.4, 1.0, 2.2], radius: 0.8, duration: 0.5 }); }
        if (Math.random() < dt * 40 * spellFx.density) {
          const a = Math.random() * Math.PI * 2;
          fx.spawn({ p: [at.x + Math.cos(a) * 0.45, 0.05, at.z + Math.sin(a) * 0.45], v: [-Math.cos(a) * 0.2, 0.6 + Math.random() * 0.6, -Math.sin(a) * 0.2], life: 0.6 + Math.random() * 0.5, size: 0.06, color: [1.2, 2.2, 3.0], color2: [0.15, 0.35, 0.9], drag: 1.2 });
        }
      } else if (phase === 'impact') {
        after += dt;
        if (after > 0.5 && st.animDone) phase = 'done';
      }
      return phase === 'done';
    },
    abort() { ice.freeRing(ring); anim.stop(); phase = 'done'; },
  };
}

// ---------- Relâmpago ----------
//   carga: o cristal do cajado acende e solta descargas; apontar: um relâmpago ramificado liga o cajado ao
//   alvo, com clarão e faíscas; uma segunda descarga logo depois (o raio pisca).
function castLightning({ spell, mage, anim, spellFx, targetPoint, resolve }) {
  const L = spellFx.lightning, B = body(mage), to = targetPoint.clone();
  let phase = 'charge', t = 0, after = 0, restrike = 0;
  const acc = { v: 0 };
  const st = runner(anim, spell.anim, ev => {
    if (ev === 'release') {
      phase = 'strike';
      L.bolt(() => B.staff.clone(), to, { duration: 0.42, width: 0.075, branches: 3 });
      L.flash(to, 1);
      L.sparks(to, { count: 60, speed: 5 });
      resolve();
      restrike = 0.16;
    }
  });
  return {
    get phase() { return phase; },
    update(dt) {
      t += dt; B.read();
      if (phase === 'charge') {
        const k = Math.min(1, t / 0.7);
        staffGlow(mage, k, '#9a8cff');
        L.crackle(() => B.staff.clone(), dt, 0.6 + k * 1.4, acc);
      } else if (phase === 'strike') {
        after += dt;
        if (restrike > 0 && (restrike -= dt) <= 0) { L.bolt(B.staff.clone(), to, { duration: 0.2, width: 0.05, branches: 1 }); L.sparks(to, { count: 25, speed: 3 }); }
        if (after > 0.25) staffReset(mage);
        if (after > 0.6 && st.animDone) phase = 'done';
      }
      return phase === 'done';
    },
    abort() { staffReset(mage); anim.stop(); phase = 'done'; },
  };
}

// ---------- Corrente Elétrica ----------
//   carga: arcos entre as duas mãos; liberar: o raio sai das mãos para o primeiro alvo e salta de alvo em alvo,
//   cada salto mais fraco (fita mais fina, cor mais violeta, tremida menor); descargas voltam a piscar no fim.
function castChain({ spell, target, mage, anim, spellFx, pointOf, react, resolve }) {
  const L = spellFx.lightning, B = body(mage), chain = target.chain || [{ unit: target.unit }];
  const pts = chain.map(c => pointOf(c.unit));
  const colors = [[1.6, 1.8, 3.8], [1.6, 1.2, 3.6], [1.8, 0.9, 3.2]];
  let phase = 'charge', t = 0, arc = 0, after = 0, hop = 0, hopT = 0;
  const st = runner(anim, spell.anim, ev => { if (ev === 'release') { phase = 'chain'; hopT = 0; } });
  const strike = i => {
    const from = i === 0 ? B.mid() : pts[i - 1];
    const k = 1 - i * 0.25;
    L.bolt(from.clone(), pts[i], { duration: 0.4, width: 0.07 * k, color: colors[i] || colors[2], branches: 2 - Math.min(2, i), flicker: 26 });
    L.sparks(pts[i], { count: Math.round(50 * k), speed: 4 * k, color: colors[i] || colors[2] });
    L.flash(pts[i], 0.8 * k);
    resolve(i);
    react(chain[i].unit, 'choque', k);
  };
  return {
    get phase() { return phase; },
    update(dt) {
      t += dt; B.read();
      if (phase === 'charge') {
        if ((arc -= dt) <= 0) { arc = 0.07; L.bolt(B.lh.clone(), B.rh.clone(), { duration: 0.09, width: 0.02, branches: 0, jitter: 0.6 }); }
        if (Math.random() < dt * 12) L.sparks(Math.random() < 0.5 ? B.lh : B.rh, { count: 3, speed: 1.2 });
      } else if (phase === 'chain') {
        hopT -= dt;
        if (hop < pts.length && hopT <= 0) { strike(hop); hop++; hopT = 0.22; }
        if (hop >= pts.length) { phase = 'after'; after = 0; }
      } else if (phase === 'after') {
        after += dt;
        // descargas intermitentes: a corrente pisca mais uma vez por todos os alvos
        if (after > 0.25 && after - dt <= 0.25) for (let i = 0; i < pts.length; i++) L.bolt((i ? pts[i - 1] : B.mid()).clone(), pts[i], { duration: 0.14, width: 0.035, branches: 0, color: colors[i] || colors[2] });
        if (after > 0.6 && st.animDone) phase = 'done';
      }
      return phase === 'done';
    },
    abort() { anim.stop(); phase = 'done'; },
  };
}

// ---------- Muralha de Pedra ----------
//   ergue o cajado (poeira dourada nas casas escolhidas) e golpeia o chão: um tremor corre até lá e a
//   muralha brota (os blocos são de src/fx/EarthFx.js, ligados aos obstáculos do combate).
function castStoneWall({ spell, target, mage, anim, spellFx, tileCenter, resolve }) {
  const E = spellFx.earth, B = body(mage), fx = spellFx.fx;
  const tiles = target.area.map(t => tileCenter(t));
  let phase = 'charge', t = 0, run = null, after = 0;
  const st = runner(anim, spell.anim, ev => { if (ev === 'release') { phase = 'run'; E.strike(B.feet, 1); run = { t: 0, from: B.feet.clone() }; } });
  const [cx, cz] = tileCenter(target.tile), to = new THREE.Vector3(cx, 0, cz);
  return {
    get phase() { return phase; },
    update(dt) {
      t += dt; B.read();
      if (phase === 'charge') {
        staffGlow(mage, Math.min(1, t / 0.6), '#ffb04a');
        for (const [x, z] of tiles) if (Math.random() < dt * 14 * spellFx.density) fx.spawn({ p: [x + (Math.random() - 0.5) * 0.8, 0.05, z + (Math.random() - 0.5) * 0.8], v: [0, 0.6 + Math.random() * 0.6, 0], life: 0.5 + Math.random() * 0.4, size: 0.05, color: [2.4, 1.6, 0.5], color2: [0.6, 0.3, 0.05], drag: 1.5 });
      } else if (phase === 'run') {
        run.t += dt;
        const u = Math.min(1, run.t / 0.25);
        E.waveFront(run.from.clone().lerp(to, u), dt);
        if (u >= 1) { phase = 'impact'; staffReset(mage); resolve(); }
      } else if (phase === 'impact') {
        after += dt;
        if (after > 0.6 && st.animDone) phase = 'done';
      }
      return phase === 'done';
    },
    abort() { staffReset(mage); anim.stop(); phase = 'done'; },
  };
}

// ---------- Terremoto ----------
//   ergue o cajado bem alto (energia dourada) e golpeia o solo: uma onda sísmica percorre o tabuleiro até a
//   área e explode em anéis, rachaduras, pedras, poeira e tremor de câmera; quem cai, cai aqui.
function castEarthquake({ spell, target, mage, anim, spellFx, tileCenter, resolve }) {
  const E = spellFx.earth, B = body(mage), fx = spellFx.fx;
  const [cx, cz] = tileCenter(target.tile), to = new THREE.Vector3(cx, 0, cz);
  let phase = 'charge', t = 0, run = null, after = 0;
  const st = runner(anim, spell.anim, ev => { if (ev === 'release') { phase = 'run'; E.strike(B.feet, 1.5); run = { t: 0, from: B.feet.clone(), dur: 0.2 + B.feet.distanceTo(to) / 9 }; } });
  return {
    get phase() { return phase; },
    update(dt) {
      t += dt; B.read();
      if (phase === 'charge') {
        const k = Math.min(1, t / 0.9);
        staffGlow(mage, k, '#ffb04a');
        if (Math.random() < dt * 30 * spellFx.density) {
          const a = Math.random() * Math.PI * 2;
          fx.spawn({ p: [B.staff.x + Math.cos(a) * 0.25, B.staff.y - 0.1, B.staff.z + Math.sin(a) * 0.25], v: [-Math.cos(a) * 0.4, 0.4, -Math.sin(a) * 0.4], life: 0.5, size: 0.06, color: [2.4, 1.6, 0.5], color2: [0.6, 0.3, 0.05], drag: 1 });
          fx.spawn({ p: [B.feet.x + Math.cos(a) * 0.6, 0.05, B.feet.z + Math.sin(a) * 0.6], v: [0, 0.3 + Math.random() * 0.5, 0], life: 0.7, size: 0.18, color: [0.3, 0.24, 0.17], color2: [0.04, 0.03, 0.03], drag: 1.2 });
        }
      } else if (phase === 'run') {
        run.t += dt;
        const u = Math.min(1, run.t / run.dur);
        E.waveFront(run.from.clone().lerp(to, u), dt);
        if (u >= 1) { phase = 'impact'; staffReset(mage); E.quakeImpact(to, (spell.area || 2) + 0.5); resolve(); }
      } else if (phase === 'impact') {
        after += dt;
        if (after > 0.9 && st.animDone) phase = 'done';
      }
      return phase === 'done';
    },
    abort() { staffReset(mage); anim.stop(); phase = 'done'; },
  };
}

export const CAST_EFFECTS = {
  bolaDeFogo: castFireball, paredeDeChamas: castFireWall,
  lancaDeGelo: castIceSpear, prisaoGlacial: castGlacialPrison,
  relampago: castLightning, correnteEletrica: castChain,
  muralhaDePedra: castStoneWall, terremoto: castEarthquake,
};
