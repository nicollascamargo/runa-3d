// Teste automático no navegador: abra o jogo com ?testes no endereço (index.html?testes).
// Dirige o jogo de verdade, como um jogador: eventos de mouse e teclado no palco, amostras da caneta da mão
// (os mesmos comandos que a câmera emite) e o relógio do jogo avançando com engine.simulate().
// O resultado aparece num quadro na tela, no console e em runa3d.testResults.
// Não testa a webcam de verdade: para ela, siga o roteiro manual do README.
// espera ativa: o ritmo do desenho não depende dos temporizadores (que o navegador desacelera em abas escondidas)
const spin = ms => { const end = performance.now() + ms; while (performance.now() < end) { /* espera */ } };

export async function runSelfTest(R) {
  const { THREE, engine, commands, combat, caster, tk, mageUnit, board, flow, hand, spellFx, fx } = R;
  const results = [];
  const box = document.createElement('section');
  box.className = 'selftest';
  box.innerHTML = '<h4>Testes automáticos</h4><ol></ol><p class="st-sum">rodando…</p>';
  document.body.appendChild(box);
  const list = box.querySelector('ol'), sum = box.querySelector('.st-sum');
  const check = (name, ok, detail = '') => {
    results.push({ name, ok: !!ok, detail });
    const li = document.createElement('li');
    li.className = ok ? 'ok' : 'fail';
    li.textContent = `${ok ? '✔' : '✘'} ${name}${detail ? ` — ${detail}` : ''}`;
    list.appendChild(li);
    li.scrollIntoView({ block: 'nearest' });
    (ok ? console.log : console.error)(`[teste] ${ok ? 'ok' : 'FALHOU'}: ${name} ${detail}`);
  };
  const el = engine.labels.domElement;
  const rect = () => el.getBoundingClientRect();
  const toScreen = (x, y, z) => {
    const v = new THREE.Vector3(x, y, z).project(engine.camera), r = rect();
    return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
  };
  const tileScreen = (t, y = 0) => { const [x, z] = board.tileCenter(t.col, t.row); return toScreen(x, y, z); };
  const fire = (type, p) => el.dispatchEvent(new PointerEvent(type, { clientX: p.x, clientY: p.y, button: 0, buttons: type === 'pointerup' ? 0 : 1, pointerId: 1, bubbles: true, pointerType: 'mouse' }));
  const key = k => window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
  const sim = s => engine.simulate(s);
  const unit = id => combat.units.find(u => u.id === id);
  const until = async (cond, seconds = 8) => { for (let t = 0; t < seconds && !cond(); t += 0.1) sim(0.1); return cond(); };
  // desenha com o mouse, ponto a ponto, no ritmo de uma mão (16 ms por ponto)
  const drawMouse = async pts => {
    fire('pointermove', pts[0]); fire('pointerdown', pts[0]);
    for (const p of pts.slice(1)) { fire('pointermove', p); spin(16); sim(1 / 60); }
    fire('pointerup', pts[pts.length - 1]);
    sim(1 / 60);
  };
  const cx = innerWidth / 2, cy = innerHeight * 0.45, rad = Math.min(innerWidth, innerHeight) * 0.18;
  const circlePts = (n = 56) => Array.from({ length: n }, (_, i) => { const a = -Math.PI / 2 + (i / (n - 1)) * Math.PI * 2.04; return { x: cx + Math.cos(a) * rad + Math.sin(i * 1.7) * 2, y: cy + Math.sin(a) * rad + Math.cos(i * 1.3) * 2 }; });
  const trianglePts = () => { const P = [[0.5, 0], [1, 0.87], [0, 0.87], [0.5, 0]], out = []; for (let s = 0; s < 3; s++) for (let i = 0; i < 16; i++) { const k = i / 16; out.push({ x: cx - rad + (P[s][0] + (P[s + 1][0] - P[s][0]) * k) * rad * 2, y: cy - rad + (P[s][1] + (P[s + 1][1] - P[s][1]) * k) * rad * 2 }); } out.push({ x: cx, y: cy - rad }); return out; };

  try {
    engine.resetView();
    engine.controls.update();
    flow.enemiesAct = false; // determinístico: os autômatos só andam no teste próprio, mais abaixo
    const diffPref = caster.difficulty.id;
    caster.setDifficulty('facil'); // a dificuldade padrão (a do jogador fica salva e volta no fim)
    const guidedPref = caster.guided;
    caster.guided = false;   // primeiro o desenho livre; o ímã tem a sua parte, mais abaixo

    // ---------- arena ----------
    check('arena de treino: mago, guerreiro, 3 bonecos e 2 autômatos', combat.units.length === 7 && combat.players.length === 2 && combat.units.filter(u => u.team === 'enemy').length === 2);
    check('tabuleiro 8×8 preservado', board.tileAt(-3.9, -3.9) && board.tileAt(3.9, 3.9) && !board.tileAt(4.1, 0));

    // ---------- telecinese (Etapa B) ----------
    const mp = mageUnit.tile;
    const body = toScreen(tk.pos.x, 1.0, tk.pos.z);
    fire('pointermove', body);
    check('telecinese: apontar seleciona o mago', tk.state === 'selected', tk.state);
    fire('pointerdown', body);
    sim(0.6);
    check('telecinese: apertar agarra e o mago sobe', tk.holding && tk.h > 0.5, `${tk.state} h=${tk.h.toFixed(2)}`);
    const dest = { col: 2, row: 5 };
    const d0 = tileScreen(dest, tk.h + 1.0);
    for (let i = 1; i <= 10; i++) { fire('pointermove', { x: body.x + (d0.x - body.x) * i / 10, y: body.y + (d0.y - body.y) * i / 10 }); sim(0.08); }
    sim(0.6);
    fire('pointerup', d0);
    await until(() => tk.state === 'idle' || tk.state === 'selected', 4);
    check('telecinese: pousa numa casa livre', !sameTileOk(tk.tile, mp) && tk.state !== 'returning', `casa ${tk.tile.col},${tk.tile.row}`);
    check('combate acompanha a casa do mago', mageUnit.tile.col === tk.tile.col && mageUnit.tile.row === tk.tile.row);
    key('Escape');
    await until(() => tk.state === 'idle' || tk.state === 'selected', 5);
    check('Esc no chão volta o último movimento', tk.tile.col === mp.col && tk.tile.row === mp.row, `casa ${tk.tile.col},${tk.tile.row}`);
    check('combate acompanha a volta', mageUnit.tile.col === mp.col && mageUnit.tile.row === mp.row);
    const occ = { col: 6, row: 2 }; // boneco 3
    fire('pointermove', body); fire('pointerdown', body); sim(0.6);
    const o0 = tileScreen(occ, tk.h + 1.0);
    for (let i = 1; i <= 10; i++) { fire('pointermove', { x: body.x + (o0.x - body.x) * i / 10, y: body.y + (o0.y - body.y) * i / 10 }); sim(0.08); }
    fire('pointerup', o0);
    await until(() => tk.state === 'idle' || tk.state === 'selected', 6);
    check('telecinese: casa ocupada é recusada e o mago volta', tk.tile.col === mp.col && tk.tile.row === mp.row);

    // ---------- câmera ----------
    // (o giro é animado pelo laço de desenho; aqui confere o comando e o destino do giro)
    key('q');
    check('câmera gira com Q (45° para um lado)', engine.turn && Math.abs(Math.abs(engine.turn.to - engine.turn.from) - Math.PI / 4) < 0.01);
    key('r');
    check('R volta à visão do tabuleiro', engine.turn === null && engine.controls.target.distanceTo(engine.target) < 1e-6);
    const camBefore = engine.camera.position.clone();
    engine.shake(0.05, 0.3);
    const off = engine.shakeOffset(1 / 60).length();
    check('tremor de câmera: deslocamento só na hora de desenhar, a câmera não sai do lugar', off > 0 && engine.camera.position.distanceTo(camBefore) < 1e-9, `${(off * 100).toFixed(1)} cm`);

    // ---------- roda e escolha ----------
    key('m');
    check('M abre a roda de magias', caster.state === 'wheel' && !R.ui.wheel.hidden);
    check('Bola de Fogo destacada e disponível', R.ui.highlighted === 0 && caster.spellStates()[0].ok);
    check('as oito magias aparecem disponíveis', caster.spellStates().every(s => s.ok));
    key('Enter');
    check('Enter escolhe a Bola de Fogo e começa o desenho', caster.state === 'drawing' && caster.spell.id === 'bolaDeFogo');
    check('telecinese não age durante a conjuração', (fire('pointermove', body), tk.state !== 'selected'));

    // ---------- runa errada, depois a certa ----------
    await drawMouse(trianglePts());
    check('triângulo é recusado para a Bola de Fogo', caster.state === 'drawing' && caster.attempt && caster.attempt.result.id === 'triangulo', caster.attempt && `${caster.attempt.result.id} ${(caster.attempt.result.score * 100).toFixed(0)}%`);
    check('mensagem explica o erro', /parece um triângulo/i.test(R.ui.cMsg.textContent), R.ui.cMsg.textContent);
    sim(1);
    await drawMouse(circlePts());
    check('círculo reconhecido', caster.state === 'recognized', caster.attempt && `${caster.attempt.result.id} ${(caster.attempt.result.score * 100).toFixed(0)}%`);
    sim(1);
    check('depois do brilho, vai para a escolha do alvo', caster.state === 'targeting');
    check('alvo sugerido: Boneco 3, atingindo 3', caster.locked && caster.locked.unit.id === 'boneco3' && caster.locked.hits.length === 3, caster.locked && caster.locked.unit.id);
    check('marcadores de alvo visíveis', R.markers.group.visible && R.markers.area.count === 9);

    // ---------- alvo ----------
    const empty = tileScreen({ col: 2, row: 2 });
    fire('pointermove', empty); fire('pointerdown', empty); fire('pointerup', empty);
    check('casa vazia não vira alvo', caster.locked.unit.id === 'boneco3' && /inválido/.test(R.ui.cMsg.textContent), R.ui.cMsg.textContent);
    const a1 = tileScreen({ col: 5, row: 1 }, 0.9);
    fire('pointermove', a1); fire('pointerdown', a1); fire('pointerup', a1);
    check('clique trava outro alvo (Autômato 1)', caster.locked && caster.locked.unit.id === 'automato1');
    const b3 = tileScreen({ col: 6, row: 2 }, 0.9);
    fire('pointermove', b3); fire('pointerdown', b3); fire('pointerup', b3);
    check('clique trava o Boneco 3 de novo', caster.locked && caster.locked.unit.id === 'boneco3');

    // ---------- lançamento ----------
    const hp0 = { b3: unit('boneco3').hp, a1: unit('automato1').hp, a2: unit('automato2').hp, b1: unit('boneco1').hp };
    key('Enter');
    check('Enter lança: mana 100 → 80 na hora', caster.state === 'casting' && mageUnit.mana === 80, `${caster.state} mana ${mageUnit.mana}`);
    const phases = new Set(), effects = new Set();
    let castT = 0;
    for (; castT < 6 && caster.state === 'casting'; castT += 1 / 30) { sim(1 / 30); phases.add(R.anim.phaseName); if (caster.effect) effects.add(caster.effect.phase); }
    check('animação do fogo passou por todas as fases', ['preparação', 'conjuração', 'impulso', 'lançamento', 'recuperação'].every(p => phases.has(p)), [...phases].join(' > '));
    check('esfera: carga, impulso, voo e impacto', ['charge', 'windup', 'flight', 'impact'].every(p => effects.has(p)), [...effects].join(' > '));
    check('conjuração termina e volta ao início', caster.state === 'idle', `${castT.toFixed(1)} s`);
    check('Boneco 3 (defesa 0) perdeu 30', hp0.b3 - unit('boneco3').hp === 30, `${hp0.b3} → ${unit('boneco3').hp}`);
    check('autômatos na área (defesa 2) perderam 28', hp0.a1 - unit('automato1').hp === 28 && hp0.a2 - unit('automato2').hp === 28);
    check('Boneco 1 fora da área não foi atingido', unit('boneco1').hp === hp0.b1);
    check('queimadura nos três atingidos (5 por turno, 3 turnos)', ['boneco3', 'automato1', 'automato2'].every(id => { const s = unit(id).statuses.get('queimadura'); return s && s.power === 5 && s.turns === 3; }));
    check('recarga 2 e magia do turno gasta', combat.cooldowns.bolaDeFogo === 2 && combat.castsLeft === 0);
    sim(2);
    check('sem dano em dobro depois do impacto', unit('boneco3').hp === hp0.b3 - 30);
    check('mago voltou à pose de repouso', mage().castPose === null || Object.keys(mage().castPose).length === 0);
    check('luzes dinâmicas devolvidas à reserva', spellFx.lights.busyCount === 0, `${spellFx.lights.busyCount} ocupadas`);
    const objsWarm = countObjects(engine.scene), decals0 = spellFx.decals.length;

    // ---------- uma por turno ----------
    key('m'); key('Enter');
    check('segunda magia no mesmo turno é bloqueada', caster.state === 'wheel');
    key('Escape');
    check('Esc fecha a roda', caster.state === 'idle');

    // ---------- turnos: queimadura, recarga, mana ----------
    const endTurn = async () => { key('n'); await until(() => !flow.busy, 15); };
    const log = [];
    for (let i = 0; i < 3; i++) { await endTurn(); log.push(`${unit('boneco3').hp}/${unit('automato1').hp}/${combat.cooldowns.bolaDeFogo}/${mageUnit.mana}`); }
    check('queimadura: 5 por turno inimigo, 3 vezes', log[0].startsWith('65/77') && log[1].startsWith('60/72') && log[2].startsWith('55/67'), log.join('  '));
    check('queimadura acabou depois de 3 turnos', !unit('boneco3').statuses.has('queimadura') && !unit('automato1').statuses.has('queimadura'));
    check('recarga: 1, 0, 0', log.map(l => l.split('/')[2]).join(',') === '1,0,0');
    check('mana recarrega 20 por turno até 100', log.map(l => l.split('/')[3]).join(',') === '100,100,100');
    await endTurn();
    check('sem queimadura, sem dano no turno seguinte', unit('boneco3').hp === 55);

    // ---------- de novo, com a mão (caneta e gestos simulados) ----------
    commands.emit('spell.open', { source: 'hand', gesture: 'Open_Palm' });
    check('mão aberta abre a roda', caster.state === 'wheel');
    commands.emit('spell.confirm', { source: 'hand', gesture: 'Closed_Fist' });
    check('punho escolhe a magia', caster.state === 'drawing');
    const pen = async (pts, p, ms = 33) => { for (const q of pts) { commands.emit('pen.move', { px: q.x, py: q.y, pen: p, t: performance.now(), source: 'hand' }); spin(ms); sim(ms / 1000); } };
    await pen(Array.from({ length: 8 }, () => ({ x: cx, y: cy - rad })), 0.1);
    check('caneta levantada não desenha', caster.tracker.strokes.length === 0 && caster.tracker.state === 'ready');
    await pen(circlePts(46).map(p => ({ x: p.x + (Math.random() - 0.5) * 6, y: p.y + (Math.random() - 0.5) * 6 })), 0.9);
    await pen(Array.from({ length: 26 }, () => ({ x: cx + (Math.random() - 0.5) * 4, y: cy - rad + (Math.random() - 0.5) * 4 })), 0.9);
    check('mão: pausa termina o traço e o círculo é reconhecido', caster.state === 'recognized' || caster.state === 'targeting', caster.attempt && `${caster.state} ${caster.attempt.result.id} ${(caster.attempt.result.score * 100).toFixed(0)}% (${caster.attempt.why})`);
    sim(1);
    const a2 = tileScreen(unit('automato2').tile, 0.9);
    const ndc = p => { const r = rect(); return { x: ((p.x - r.left) / r.width) * 2 - 1, y: -((p.y - r.top) / r.height) * 2 + 1, px: p.x, py: p.y, source: 'hand' }; };
    commands.emit('pointer.move', ndc(a2)); commands.emit('pointer.down', ndc(a2)); commands.emit('pointer.up', ndc(a2));
    check('pinça trava o alvo (Autômato 2)', caster.locked && caster.locked.unit.id === 'automato2', caster.locked && caster.locked.unit.id);
    check('gesto de punho vale para lançar', hand.gestureState('Closed_Fist') === '');
    const hpA2 = unit('automato2').hp;
    commands.emit('spell.confirm', { source: 'hand', gesture: 'Closed_Fist' });
    await until(() => caster.state === 'idle', 8);
    check('punho lança e o dano entra', hpA2 - unit('automato2').hp === 28, `${hpA2} → ${unit('automato2').hp}`);
    check('polegar para cima encerra o turno quando livre', hand.gestureState('Thumb_Up') === '');
    check('mão aberta não abre a roda durante o voo do mago', (tk.state = 'moving', hand.gestureState('Open_Palm') === ' '));
    tk.state = 'idle';

    // ---------- sem vazamentos: pools reaproveitados ----------
    const grown = countObjects(engine.scene) - objsWarm, decalGrowth = (spellFx.decals.length - decals0) * 2;
    check('segundo lançamento reaproveita esfera, explosão e luzes (só a marca no chão é nova, até 8)', grown === decalGrowth && spellFx.orbs.length === 1 && spellFx.bursts.length === 1 && spellFx.decals.length <= 8, `objetos +${grown}, marcas +${decalGrowth / 2}`);
    check('reserva de luzes não cresce', spellFx.lights.items.length === R.GFX.bootLights);
    check('partículas dentro do limite', fx.liveCount <= 2600);

    // ---------- ímã nas runas (modo fácil) ----------
    combat.restoreResources();
    caster.guided = true;
    key('m'); key('Enter');
    check('ímã: a runa aparece como trilho', caster.state === 'drawing' && !!caster.guide && R.runeCanvas.guide && !!R.runeCanvas.guide.rails);
    const rail = caster.guide.railStrokes()[0];
    const far = { x: cx, y: cy + rad * 0.05 }; // centro do círculo: longe do trilho
    fire('pointermove', far); fire('pointerdown', far);
    for (let i = 0; i < 20; i++) { fire('pointermove', { x: far.x + Math.sin(i) * 30, y: far.y + Math.cos(i) * 30 }); spin(16); sim(1 / 60); }
    fire('pointerup', far);
    check('ímã: rabiscar longe da runa não acende nada', caster.guide.progress === 0);
    // arrasta por cima do trilho com desvio de até ~28 px (o cursor gruda)
    const along = (pts, k0, k1, dev = 28) => pts.slice(k0, k1).map((p, i) => ({ x: p[0] + Math.sin(i * 0.5) * dev, y: p[1] + Math.cos(i * 0.4) * dev * 0.6 }));
    const firstHalf = along(rail, 0, Math.floor(rail.length / 2));
    fire('pointermove', firstHalf[0]); fire('pointerdown', firstHalf[0]);
    for (const p of firstHalf) { fire('pointermove', p); spin(8); sim(1 / 60); }
    check('ímã: meia volta acende metade e ainda não lança', caster.state === 'drawing' && caster.guide.progress > 0.4 && caster.guide.progress < 0.6, `${Math.round(caster.guide.progress * 100)}%`);
    key('Enter');
    check('ímã: punho/Enter com 50% não aceita', caster.state === 'drawing' && /Falta traçar/.test(R.ui.cMsg.textContent));
    for (const p of along(rail, Math.floor(rail.length / 2), rail.length)) { fire('pointermove', p); spin(8); sim(1 / 60); }
    check('ímã: completou a volta, reconhece sozinho (sem soltar o botão)', caster.state === 'recognized' || caster.state === 'targeting', caster.attempt && `${caster.attempt.result.reason} ${Math.round(caster.attempt.result.score * 100)}%`);
    fire('pointerup', firstHalf[0]);
    sim(1);
    check('ímã: segue para a escolha do alvo', caster.state === 'targeting');
    key('Escape');
    check('voltar do alvo recomeça o trilho', caster.state === 'drawing' && caster.guide && caster.guide.progress === 0);
    // com a mão: não precisa da pose de caneta (caneta "levantada" o tempo todo), só seguir o trilho
    const handRail = caster.guide.railStrokes()[0];
    await pen(along(handRail, 0, handRail.length, 22).map(p => ({ x: p.x, y: p.y })).filter((_, i) => i % 3 === 0), 0.05);
    check('ímã com a mão: seguir o trilho basta, sem a pose de caneta', caster.state === 'recognized', caster.guide ? `${Math.round(caster.guide.progress * 100)}%` : '');
    sim(1);
    key('Escape'); key('Escape'); key('Escape');
    check('Esc volta até fechar', caster.state === 'idle', caster.state);
    caster.guided = guidedPref;

    // ---------- as oito magias, de ponta a ponta (com o ímã) ----------
    const { SCHOOLS } = R.animSchools;
    const random0 = combat.random;
    combat.random = () => 0.1; // os efeitos com chance acontecem (determinístico)
    caster.guided = true;
    const traceAll = () => {
      for (const rail of caster.guide.railStrokes()) {
        const pts = rail.filter((_, i) => i % 2 === 0).map(p => ({ x: p[0] + 6, y: p[1] - 4 }));
        fire('pointermove', pts[0]); fire('pointerdown', pts[0]);
        for (const q of pts) { fire('pointermove', q); spin(3); sim(1 / 60); if (caster.state !== 'drawing') break; }
        fire('pointerup', pts[pts.length - 1]);
        if (caster.state !== 'drawing') break;
      }
    };
    const castAll = round => {
      const report = {};
      R.SPELLS.forEach((sp, i) => {
        combat.restoreResources();
        for (const u of combat.units) if (u !== mageUnit) combat.revive(u); // vida cheia: ninguém morre no meio da volta
        key(String(i + 1));
        if (caster.state !== 'drawing') { report[sp.id] = { ok: false, why: `não começou (${caster.state})` }; return; }
        traceAll();
        sim(1);
        if (caster.state !== 'targeting' || !caster.locked) { report[sp.id] = { ok: false, why: `sem alvo (${caster.state}${caster.locked ? '' : ', nada travado'})` }; key('Escape'); key('Escape'); key('Escape'); return; }
        const ev = caster.locked, hp = new Map(combat.units.map(u => [u, u.hp])), mana = mageUnit.mana;
        key('Enter');
        const phases = new Set(), fxPhases = new Set();
        for (let k = 0; k < 600 && caster.state === 'casting'; k++) { sim(1 / 60); phases.add(R.anim.phaseName); if (caster.effect) fxPhases.add(caster.effect.phase); }
        const want = SCHOOLS[sp.anim].map(ph => ph.name);
        report[sp.id] = {
          ok: caster.state === 'idle', mana: mana - mageUnit.mana, phases: want.every(n => phases.has(n)), fx: [...fxPhases].join('>'),
          lost: combat.units.filter(u => hp.get(u) > u.hp).map(u => `${u.id}-${hp.get(u) - u.hp}`).join(' '), ev,
          status: combat.units.filter(u => [...u.statuses.keys()].some(id => id !== 'queimadura')).map(u => `${u.id}:${[...u.statuses.keys()].join('+')}`).join(' '),
        };
      });
      return report;
    };
    const unitsHaving = id => combat.units.filter(u => u.statuses.has(id)).length;
    const endTurns = async n => { for (let i = 0; i < n; i++) { key('n'); await until(() => !flow.busy, 15); } };

    const rep = castAll(1);
    for (const sp of R.SPELLS) {
      const r = rep[sp.id];
      check(`${sp.name}: traçar, travar o alvo, lançar e terminar`, r.ok, r.why || '');
      if (!r.why) {
        check(`${sp.name}: mana ${sp.mana} gasta e todas as fases da animação`, r.mana === sp.mana && r.phases, `mana ${r.mana}, efeito ${r.fx}`);
      }
    }
    const R1 = rep;
    check('Parede de Chamas: casas perigosas acesas no chão', combat.hazards.size >= 1 && spellFx.fireWall.flames.some(f => f.busy), `${combat.hazards.size} casas`);
    check('Lança de Gelo: dano e lentidão no alvo, com a camada de gelo', /lentidao/.test(R1.lancaDeGelo.status) && R1.lancaDeGelo.lost !== '', `${R1.lancaDeGelo.lost} · ${R1.lancaDeGelo.status}`);
    check('Prisão Glacial: imobilizado e cristais em volta', unitsHaving('imobilizado') >= 1 && spellFx.ice.prisons.some(p => p.busy), R1.prisaoGlacial.lost);
    check('Relâmpago: dano e atordoado (sorteio 0,1)', R1.relampago.lost !== '' && /atordoado/.test(R1.relampago.status), R1.relampago.lost);
    check('Corrente Elétrica: salta para mais alvos', R1.correnteEletrica.lost.split(' ').length >= 2, R1.correnteEletrica.lost);
    check('Muralha de Pedra: blocos de pé, com vida', combat.obstacles.size >= 1 && spellFx.earth.walls.size === combat.obstacles.size, `${combat.obstacles.size} blocos`);
    check('Terremoto: atinge vários e derruba (sorteio 0,1)', R1.terremoto.lost.split(' ').length >= 2 && unitsHaving('derrubado') >= 1, R1.terremoto.lost);
    check('derrubado tomba; camada de gelo visível em quem está lento ou preso', views().some(v => v.down && v.dummy.fall > 0) && views().some(v => v.dummy.frostShell.visible));
    await endTurns(5);
    check('depois de 5 turnos: efeitos acabaram, muralha e chamas sumiram', combat.units.every(u => u.statuses.size === 0) && combat.obstacles.size === 0 && combat.hazards.size === 0);
    sim(2);
    check('cristais quebrados, gelo derretido, derrubados de pé', !spellFx.ice.prisons.some(p => p.busy) && views().every(v => !v.dummy.frostShell.visible && v.dummy.fall === 0 && v.dummy.rising === 0));
    check('blocos da muralha e chamas devolvidos à reserva', !spellFx.earth.pool.some(w => w.busy) && !spellFx.fireWall.flames.some(f => f.busy));
    sim(4); // bonecos caídos levantam
    const objs1 = countObjects(engine.scene);
    const rep2 = castAll(2);
    await endTurns(5);
    sim(6);
    check('segunda volta pelas oito magias também funciona', R.SPELLS.every(sp => rep2[sp.id].ok), Object.entries(rep2).filter(([, r]) => !r.ok).map(([id, r]) => `${id}: ${r.why}`).join('; '));
    const S = spellFx, pools = { cristais: [S.ice.small.length, 12], estilhaços: [S.ice.shards.length, 30], lanças: [S.ice.spears.length, 2], relâmpagos: [S.lightning.bolts.length, 16], fragmentos: [S.earth.chunks.length, 28], rachaduras: [S.earth.cracks.length, 3], marcas: [S.decals.length, 8], luzes: [S.lights.items.length, R.GFX.bootLights] };
    check('reservas de efeitos com teto fixo (a memória não cresce com o tempo de jogo)', Object.values(pools).every(([n, max]) => n <= max), Object.entries(pools).map(([k, [n, m]]) => `${k} ${n}/${m}`).join(', '));
    check('segunda volta quase não cria objetos (só o que faltava para encher as reservas)', countObjects(engine.scene) - objs1 <= 6, `${objs1} → ${countObjects(engine.scene)}`);
    check('luzes dinâmicas livres no fim', spellFx.lights.busyCount === 0, `${spellFx.lights.busyCount}`);
    combat.random = random0;
    caster.guided = guidedPref;

    // ---------- autômatos andam e atacam ----------
    flow.enemiesAct = true;
    combat.restoreResources();
    const before = unit('automato1').tile, mageHp = mageUnit.hp;
    let attacked = false;
    for (let i = 0; i < 4 && !attacked; i++) { await endTurn(); attacked = mageUnit.hp < mageHp; }
    const after = unit('automato1').tile;
    const dist = t => Math.max(Math.abs(t.col - mageUnit.tile.col), Math.abs(t.row - mageUnit.tile.row));
    check('autômato se aproxima do mago', dist(after) < dist(before), `${before.col},${before.row} → ${after.col},${after.row}`);
    check('autômato ao lado ataca o mago (8 - 1 de defesa)', attacked && (mageHp - mageUnit.hp) % 7 === 0, `vida ${mageHp} → ${mageUnit.hp}`);

    // ---------- guerreiro ----------
    await warriorTests();

    // ---------- telecinese dos dois personagens (mouse e pinça da mão) ----------
    await telekinesisTests();

    // ---------- runas mais fáceis: dificuldade, traçado guiado, desenho livre, treino ----------
    await runeTests();

    // ---------- Runa Vision 2.0: diagnóstico, calibração do jogador, avaliação, contextos ----------
    await visionTests();
    caster.setDifficulty(diffPref);

    // ---------- exportação (Etapa A) ----------
    const glb = await R.exportGLB(R.mage.root);
    check('exportar mago.glb continua funcionando', glb && glb.byteLength > 100000, glb && `${(glb.byteLength / 1048576).toFixed(1)} MB`);
  } catch (err) {
    console.error(err);
    check('o teste rodou até o fim', false, err.message);
  }
  const fails = results.filter(r => !r.ok).length;
  sum.textContent = fails ? `${fails} falha(s) em ${results.length} testes` : `Todos os ${results.length} testes passaram.`;
  box.classList.add(fails ? 'has-fail' : 'all-ok');
  R.testResults = results;
  console.log(`[teste] ${sum.textContent}`);
  return results;

  function mage() { return R.mage; }

  // Guerreiro: seleção, caminhada, Corte Horizontal pela mão (os mesmos quadros que a câmera manda), regras.
  async function warriorTests() {
    const { wctl, warrior, warriorUnit: W, gestures, party, wAnim } = R;
    const { fakeHand } = await import('./fakeHand.js');
    flow.enemiesAct = false;
    for (const u of combat.units) if (u.team !== 'player') { for (const id of [...u.statuses.keys()]) combat.removeStatus(u, id); combat.revive(u); }
    sim(3);
    const place = t => { combat.setUnitTile(W, t); const [x, z] = board.tileCenter(t.col, t.row); warrior.object.position.set(x, 0, z); wctl.refreshReach(); };
    const free = t => combat.isWalkable(t, W);
    check('guerreiro na arena, com espada na mão direita e escudo no braço esquerdo', W && W.alive && warrior.sword.group.parent === warrior.bones.RightHand && warrior.shield.group.parent === warrior.bones.LeftForeArm, `${warrior.triangleCount} triângulos`);
    check('começa com o mago ativo', party.active === 'mago' && wctl.state === 'free');
    combat.restoreResources();
    Object.assign(W, { energy: W.maxEnergy, actionsLeft: 1, movesLeft: W.move });
    // um lugar livre longe de todos, para começar
    let start = null;
    for (const t of [{ col: 0, row: 7 }, { col: 1, row: 7 }, { col: 0, row: 6 }, { col: 2, row: 7 }]) if (free(t)) { start = t; break; }
    place(start);
    // clicar no corpo do guerreiro: a telecinese pega e solta na mesma casa, e ele fica selecionado
    const wb = toScreen(warrior.object.position.x, 1.0, warrior.object.position.z);
    const moves0 = W.movesLeft;
    fire('pointermove', wb); fire('pointerdown', wb); fire('pointerup', wb);
    await until(() => !R.wtk.busy, 3);
    check('clicar no guerreiro seleciona (barra e leitura do gesto aparecem)', party.active === 'guerreiro' && wctl.state === 'ready' && R.ui.bar.hidden && !R.wui.bar.hidden && !R.wui.meter.hidden, `${party.active} ${wctl.state}`);
    check('clique rápido: pousa na mesma casa, sem gastar movimento', W.tile.col === start.col && W.tile.row === start.row && W.movesLeft === moves0);
    check('mostra as casas para andar (até 3)', wctl.reach.size > 0 && [...wctl.reach.values()].every(p => p.length <= 3), `${wctl.reach.size} casas`);
    // anda 2 casas
    const target = [...wctl.reach.entries()].find(([, p]) => p.length === 2);
    const [tc, tr] = target[0].split(',').map(Number);
    const ts = tileScreen({ col: tc, row: tr });
    fire('pointermove', ts); fire('pointerdown', ts); fire('pointerup', ts);
    check('clicar numa casa verde: anda', wctl.state === 'walking');
    let maxSpeed = 0;
    // gesto de golpe no meio da caminhada: não vale
    let tHand = 10000;
    const feed = (pose, x, y, size = 0.13) => { R.hand.handleResult(fakeHand({ pose, x, y, size }), tHand); tHand += 33; sim(1 / 30); maxSpeed = Math.max(maxSpeed, warrior.loco.speed); };
    R.hand.useSimulated(true);
    const swipe = (pose = 'sword') => { for (let i = 0; i < 9; i++) feed(pose, 0.7, 0.6); for (let i = 0; i <= 10; i++) { const u = i / 10, e = u * u * (3 - 2 * u); feed(pose, 0.7 - 0.36 * e, 0.6); } for (let i = 0; i < 5; i++) feed(pose, 0.34, 0.6); };
    swipe();
    check('gesto de golpe enquanto anda é ignorado', !wctl.log.length && wctl.state !== 'acting');
    await until(() => wctl.state === 'ready', 5);
    check('chegou: casa certa, 1 casa de movimento sobrando, animação de caminhada', W.tile.col === tc && W.tile.row === tr && W.movesLeft === 1 && maxSpeed > 1, `${W.tile.col},${W.tile.row} mov ${W.movesLeft} vel ${maxSpeed.toFixed(1)}`);
    const far = [...Array(8).keys()].flatMap(c => [...Array(8).keys()].map(r => ({ col: c, row: r }))).find(t => free(t) && Math.abs(t.col - W.tile.col) + Math.abs(t.row - W.tile.row) > 3);
    const fs = tileScreen(far);
    fire('pointermove', fs); fire('pointerdown', fs); fire('pointerup', fs);
    check('casa longe demais: não anda e explica', wctl.state === 'ready' && /longe demais/.test(wctl.feedback.text), wctl.feedback && wctl.feedback.text);

    // Corte Horizontal pela mão, ao lado do Boneco 1
    const b1 = unit('boneco1');
    const spot = [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [-1, 1]].map(([dc, dr]) => ({ col: b1.tile.col + dc, row: b1.tile.row + dr })).find(t => combat.inBounds(t) && free(t));
    place(spot);
    Object.assign(W, { energy: 100, actionsLeft: 1, movesLeft: W.move }); combat.cooldowns.corteHorizontal = 0;
    const hp0 = b1.hp;
    gestures.reset();
    for (let i = 0; i < 9; i++) feed('sword', 0.7, 0.6);
    for (let i = 0; i <= 10 && wctl.state === 'ready'; i++) { const u = i / 10, e = u * u * (3 - 2 * u); feed('sword', 0.7 - 0.36 * e, 0.6); }
    check('espada (indicador e médio juntos) varrendo para o lado (câmera simulada): Corte Horizontal reconhecido', wctl.state === 'acting' && wctl.action && wctl.action.source === 'mão', wctl.feedback && wctl.feedback.text);
    check('custo pago no reconhecimento: 15 de energia, 1 de recarga, a ação do turno', W.energy === 85 && combat.cooldowns.corteHorizontal === 1 && W.actionsLeft === 0, `energia ${W.energy}`);
    check('antes do impacto da lâmina, nada de dano', b1.hp === hp0);
    const phases = new Set(); let trailSeen = false;
    for (let k = 0; k < 120 && wctl.state !== 'ready'; k++) { sim(1 / 60); phases.add(wAnim.phaseName); trailSeen = trailSeen || R.wfx.trail.visible; }
    check('animação: preparação, corte, acompanhamento e recuperação', ['preparação', 'corte', 'acompanhamento', 'recuperação'].every(p => phases.has(p)), [...phases].join(' > '));
    check('rastro de luz da lâmina durante o golpe', trailSeen);
    const last = wctl.log[wctl.log.length - 1];
    check('dano no impacto: 22 no Boneco 1, uma vez só', hp0 - b1.hp === 22 && last.hits.some(h => h.id === 'boneco1' && h.amount === 22), `${hp0} → ${b1.hp}`);
    sim(1);
    check('não acerta duas vezes', hp0 - b1.hp === 22);
    feed('fist', 0.6, 0.6);
    const again = wctl.use('corteHorizontal', { source: 'teclado' });
    check('segundo golpe no mesmo turno: recusado', again === 'já agiu neste turno', again);

    // gesto inválido: mão aberta varrendo
    Object.assign(W, { actionsLeft: 1 }); combat.cooldowns.corteHorizontal = 0;
    gestures.reset(); gestures.lastReject = -1e9;
    swipe('open');
    check('mão aberta varrendo: não golpeia e explica o gesto (a espada)', wctl.state === 'ready' && /espada/.test(wctl.feedback.text), wctl.feedback.text);
    // V varrendo (dedos abertos): não é o corte; avisa para juntar os dedos
    gestures.reset(); gestures.lastReject = -1e9;
    swipe('two');
    check('V varrendo: não golpeia e avisa para juntar os dedos', wctl.state === 'ready' && /junte/.test(wctl.feedback.text), wctl.feedback.text);

    // ---------- as outras cinco habilidades, pela mão simulada ----------
    await otherAbilities(feed);

    // sem alvo, com e sem treino
    let lonely = null;
    for (let c = 0; c < 8 && !lonely; c++) for (let r = 0; r < 8 && !lonely; r++) { const t = { col: c, row: r }; if (free(t) && !combat.units.some(u => u.alive && u.team !== 'player' && u.tile && Math.max(Math.abs(u.tile.col - c), Math.abs(u.tile.row - r)) <= 1)) lonely = t; }
    place(lonely);
    const e0 = W.energy;
    key('1');
    check('tecla 1 sem inimigo ao lado: explica e não gasta nada', wctl.state === 'ready' && /nenhum inimigo/.test(wctl.feedback.text) && W.energy === e0, wctl.feedback.text);
    key('y');
    check('modo de treino ligado', wctl.training);
    Object.assign(W, { actionsLeft: 0 });
    key('1');
    check('treino: golpeia sem alvo, sem ação sobrando e sem gastar energia', wctl.state === 'acting' && W.energy === e0);
    await until(() => wctl.state === 'ready', 4);
    check('treino: o golpe fica registrado como treino', wctl.log[wctl.log.length - 1].training === true);
    key('y');

    // troca de personagem: com o mago ativo, os quadros da mão não chegam ao guerreiro
    key('Tab');
    check('Tab volta para o mago', party.active === 'mago' && wctl.state === 'free' && !R.ui.bar.hidden && R.wui.bar.hidden);
    const n0 = wctl.log.length;
    Object.assign(W, { actionsLeft: 1 }); place(spot);
    swipe();
    check('com o mago ativo, o golpe de mão do guerreiro não dispara', wctl.log.length === n0);
    R.hand.useSimulated(false);
    R.hand.loseHand && R.hand.hand.visible && R.hand.loseHand();

    // turno: o guerreiro recupera movimento, ação e energia; um autômato ao lado ataca o guerreiro (8 − 4 de defesa)
    key('Tab');
    const a1 = unit('automato1');
    const adj = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dc, dr]) => ({ col: W.tile.col + dc, row: W.tile.row + dr })).find(t => combat.inBounds(t) && free(t));
    combat.setUnitTile(a1, adj);
    { const [x, z] = board.tileCenter(adj.col, adj.row); R.views.get(a1).dummy.object.position.set(x, 0, z); }
    flow.enemiesAct = true;
    const whp = W.hp;
    W.energy = 40;
    key('n');
    await until(() => !flow.busy, 15);
    check('autômato ao lado ataca o guerreiro (o mais perto): 8 − 4 de defesa', whp - W.hp === 4, `${whp} → ${W.hp}`);
    check('turno novo: movimento 3, ação de volta, energia +25', W.movesLeft === 3 && W.actionsLeft === 1 && W.energy === 65, `mov ${W.movesLeft} ação ${W.actionsLeft} energia ${W.energy}`);
    check('casas de caminhada voltam a aparecer', wctl.reach.size > 0);
    key('Tab');
    check('de volta ao mago no fim', party.active === 'mago');
  }
  // Telecinese: a mesma do mago, agora também no guerreiro. Mouse e pinça (mão sintética passando pelo HandInput,
  // como a câmera), casas inválidas (ocupada, longe demais, fora do tabuleiro), sem movimento e conflito com gestos.
  async function telekinesisTests() {
    const { wctl, warrior, warriorUnit: W, gestures, party, wtk } = R;
    const { fakeHand } = await import('./fakeHand.js');
    flow.enemiesAct = false;
    await until(() => !flow.busy && combat.phase === 'player', 15);
    for (const u of combat.units) { for (const id of [...u.statuses.keys()]) combat.removeStatus(u, id); if (!u.alive) combat.revive(u); }
    sim(3);
    if (party.active !== 'mago') key('Tab');
    const free = t => combat.isWalkable(t, W);
    const place = t => { combat.setUnitTile(W, t); const [x, z] = board.tileCenter(t.col, t.row); warrior.object.position.set(x, 0, z); wctl.refreshReach(); };
    const dist = (a, b) => Math.abs(a.col - b.col) + Math.abs(a.row - b.row);
    const all = [...Array(8).keys()].flatMap(c => [...Array(8).keys()].map(r => ({ col: c, row: r })));
    // um lugar com casas livres em volta, longe do mago
    const start = all.find(t => free(t) && dist(t, mageUnit.tile) >= 3 && [[1, 0], [-1, 0], [0, 1], [0, -1]].every(([dc, dr]) => free({ col: t.col + dc, row: t.row + dr })));
    place(start);
    Object.assign(W, { movesLeft: 3, actionsLeft: 1, energy: 100 });
    const body = () => toScreen(warrior.object.position.x, 1.0, warrior.object.position.z);
    const at = (t, k) => tileScreen(t, k.grabY + k.h);
    const drag = (from, to, n = 12) => { for (let i = 1; i <= n; i++) { fire('pointermove', { x: from.x + (to.x - from.x) * i / n, y: from.y + (to.y - from.y) * i / n }); sim(0.06); } };
    const footY = () => { warrior.root.updateMatrixWorld(true); return warrior.bones.LeftFoot.getWorldPosition(new THREE.Vector3()).y; };

    // --- mouse: pegar, levantar, levar, pousar ---
    fire('pointermove', body());
    check('telecinese do guerreiro: apontar seleciona (com o mago ativo)', wtk.state === 'selected' && party.active === 'mago', wtk.state);
    fire('pointerdown', body()); sim(0.05);
    check('agarrar o guerreiro: ele vira o personagem ativo e entra em "levitando"', wtk.holding && wctl.state === 'carried' && party.active === 'guerreiro', `${wtk.state} ${wctl.state} ${party.active}`);
    sim(1.2);
    check('levanta: os pés saem do chão', wtk.h > 0.45 && footY() > 0.4 && warrior.flight.air > 0.7, `h ${wtk.h.toFixed(2)} pé ${footY().toFixed(2)}`);
    check('no ar: as casas que ele alcança ficam acesas', R.moveMarkers.group.visible && R.moveMarkers.range.count === wctl.reach.size && wctl.reach.size > 0, `${R.moveMarkers.range.count} casas`);
    const two = [...wctl.reach.entries()].find(([, p]) => p.length === 2);
    const dst = { col: +two[0].split(',')[0], row: +two[0].split(',')[1] };
    let lean = 0;
    const from = body(), to = at(dst, wtk);
    for (let i = 1; i <= 12; i++) { fire('pointermove', { x: from.x + (to.x - from.x) * i / 12, y: from.y + (to.y - from.y) * i / 12 }); sim(0.06); lean = Math.max(lean, Math.abs(warrior.flight.pitch) + Math.abs(warrior.flight.roll)); }
    sim(0.8);
    check('segue o ponteiro e balança (inclina com o movimento)', wtk.state === 'levitating' || wtk.state === 'moving' ? lean > 0.03 : false, `inclinação ${lean.toFixed(3)}`);
    check('sombra/marcador da casa de destino: válido', R.board.dest.visible && R.board.destState.valid && wtk.dest.tile.col === dst.col && wtk.dest.tile.row === dst.row);
    check('gestos do guerreiro desligados no ar', !wctl.acceptsGestures);
    fire('pointerup', to);
    check('soltar: começa a descer', wtk.state === 'releasing');
    let landK = 0, hPrev = wtk.h, smoothDescent = true;
    for (let k = 0; k < 200 && wtk.busy; k++) { sim(1 / 60); landK = Math.max(landK, warrior.flight.land); if (wtk.h > hPrev + 0.02) smoothDescent = false; hPrev = wtk.h; }
    check('desce suave e agacha no pouso', smoothDescent && landK > 0.5, `pouso ${landK.toFixed(2)}`);
    check('pousou na casa escolhida: gastou 2 casas de movimento', W.tile.col === dst.col && W.tile.row === dst.row && W.movesLeft === 1 && wctl.state === 'ready', `${W.tile.col},${W.tile.row} mov ${W.movesLeft}`);
    check('o combate sabe onde ele está', combat.unitAt(dst) === W);

    // --- casas inválidas: volta para a origem ---
    const tryMove = async (goal, label, re) => {
      const o = { ...W.tile }, m = W.movesLeft;
      fire('pointermove', body()); fire('pointerdown', body()); sim(1.0);
      const target = goal(); // mira depois de subir (o ponto pego está na altura dele no ar)
      drag(body(), target);
      sim(0.6);
      const marker = R.board.dest.visible && !R.board.destState.valid;
      fire('pointerup', target);
      await until(() => !wtk.busy, 6);
      check(`${label}: X vermelho, volta para a origem e explica`, marker && W.tile.col === o.col && W.tile.row === o.row && W.movesLeft === m && re.test(wctl.feedback.text), wctl.feedback.text);
    };
    const occ = combat.units.find(u => u.team !== 'player' && u.alive && dist(u.tile, W.tile) <= 4);
    await tryMove(() => at(occ.tile, wtk), 'casa ocupada', /ocupada/);
    const farT = all.find(t => free(t) && dist(t, W.tile) >= 3 && [[1, 0], [-1, 0], [0, 1], [0, -1]].every(([dc, dr]) => !combat.unitAt({ col: t.col + dc, row: t.row + dr })));
    await tryMove(() => at(farT, wtk), 'casa longe demais (1 casa de movimento)', /Longe demais/);
    await tryMove(() => toScreen(7, 1.6, 7), 'fora do tabuleiro', /Fora do tabuleiro/);

    // --- conflito: punho varrendo com o guerreiro no ar não golpeia; Esc devolve à origem ---
    R.hand.useSimulated(true);
    let tH = 60000;
    const handAt = (sx, sy, pose) => {
      const a = R.hand.config.camArea, w = R.hand.config.anchorTipWeight;
      const lm = fakeHand({ pose, x: 0.5, y: 0.7 }).landmarks[0];
      const ax = lm[5].x + (lm[8].x - lm[5].x) * w, ay = lm[5].y + (lm[8].y - lm[5].y) * w;
      const tx = 1 - (a.x0 + (sx / innerWidth) * (a.x1 - a.x0)), ty = a.y0 + (sy / innerHeight) * (a.y1 - a.y0);
      return fakeHand({ pose, x: 0.5 + tx - ax, y: 0.7 + ty - ay });
    };
    const feedH = (p, pose, n = 1) => { for (let i = 0; i < n; i++) { R.hand.handleResult(handAt(p.x, p.y, pose), tH); tH += 33; sim(1 / 30); } };
    const n0 = wctl.log.length, o0 = { ...W.tile };
    fire('pointermove', body()); fire('pointerdown', body()); sim(0.8);
    let seen = 0;
    const b0 = body();
    for (let i = 0; i < 9; i++) { feedH(b0, 'sword'); seen = Math.max(seen, gestures.history.length); }
    for (let i = 0; i <= 10; i++) { feedH({ x: b0.x - 25 * i, y: b0.y }, 'sword'); seen = Math.max(seen, gestures.history.length); }
    check('espada varrendo com o guerreiro no ar (telecinese): nada chega ao reconhecedor, nenhum golpe', seen === 0 && wctl.log.length === n0 && wtk.holding);
    key('Escape');
    await until(() => !wtk.busy, 6);
    check('Esc com o guerreiro no ar: volta para a origem', W.tile.col === o0.col && W.tile.row === o0.row && wctl.state === 'ready');
    R.hand.handleResult({ landmarks: [] }, tH + 2000); tH += 2100; // a mão sai (reinicia a leitura)

    // --- sem movimento no turno: não pega, explica ---
    W.movesLeft = 0;
    fire('pointermove', body()); fire('pointerdown', body()); sim(0.1);
    check('sem movimento no turno: não levanta e explica', !wtk.busy && /movimento/.test(wctl.feedback.text), wctl.feedback.text);
    fire('pointerup', body());
    W.movesLeft = 3; wctl.refreshReach();

    // --- pinça da mão (câmera simulada): guerreiro ---
    const handGrab = async (k, getBody, target) => {
      const b = getBody();
      feedH(b, 'point', 22);
      const sel = k.state === 'selected';
      feedH(b, 'pinch', 3);
      const grabbed = k.holding;
      feedH(b, 'pinch', 30); // sobe
      const tg = at(target, k);
      for (let i = 1; i <= 24; i++) feedH({ x: b.x + (tg.x - b.x) * i / 24, y: b.y + (tg.y - b.y) * i / 24 }, 'pinch');
      feedH(at(target, k), 'pinch', 24);
      const destOk = k.dest && k.dest.valid && k.dest.tile && k.dest.tile.col === target.col && k.dest.tile.row === target.row;
      feedH(at(target, k), 'point', 10); // abre os dedos
      const released = k.state === 'releasing' || k.state === 'landing';
      await until(() => !k.busy, 6);
      return { sel, grabbed, destOk, released };
    };
    const wDest = all.find(t => free(t) && dist(t, W.tile) === 2 && wctl.reach.has(`${t.col},${t.row}`));
    const rw = await handGrab(wtk, body, wDest);
    check('pinça: apontar e fechar a pinça no guerreiro agarra', rw.sel && rw.grabbed, JSON.stringify(rw));
    check('pinça: leva até a casa (destino válido) e abrir os dedos solta', rw.destOk && rw.released, JSON.stringify(rw));
    check('pinça: guerreiro pousou na casa certa e gastou 2 casas', W.tile.col === wDest.col && W.tile.row === wDest.row && W.movesLeft === 1, `${W.tile.col},${W.tile.row} mov ${W.movesLeft}`);
    // logo depois de pousar, os golpes esperam um instante (abrir a pinça e tirar a mão não vira corte)
    let got = 0;
    for (let i = 0; i < 6; i++) { feedH(body(), 'fist'); got = Math.max(got, gestures.history.length); }
    check('logo depois de pousar, a mão ainda não chega ao reconhecedor de golpes', got === 0);
    sim(0.5);
    feedH(body(), 'fist', 3);
    check('meio segundo depois, os gestos de golpe voltam a valer', gestures.history.length > 0 && wctl.acceptsGestures);
    gestures.reset();

    // --- pinça da mão: mago ---
    const mBody = () => toScreen(tk.pos.x, 1.0, tk.pos.z);
    const mFrom = { ...mageUnit.tile };
    const mDest = all.find(t => combat.isWalkable(t, mageUnit) && dist(t, mFrom) === 2);
    const hist0 = R.history.length;
    const rm = await handGrab(tk, mBody, mDest);
    check('pinça no mago: agarra, leva e pousa (e ele vira o ativo)', rm.grabbed && rm.destOk && mageUnit.tile.col === mDest.col && mageUnit.tile.row === mDest.row && party.active === 'mago', JSON.stringify(rm));
    check('mão aberta logo depois de soltar o mago não abre a roda', R.hand.gestureState('Open_Palm') === ' ');
    check('o "voltar" do mago guarda o movimento', R.history.length === hist0 + 1);
    // mão some segurando o guerreiro: ele volta para a origem
    const o1 = { ...W.tile };
    const b1 = body();
    feedH(b1, 'point', 22); feedH(b1, 'pinch', 30);
    const held = wtk.holding;
    feedH({ x: b1.x + 80, y: b1.y }, 'pinch', 6);
    R.hand.handleResult({ landmarks: [] }, tH + 900); tH += 1000;
    await until(() => !wtk.busy, 6);
    check('mão sai da câmera segurando o guerreiro: ele volta para a origem', held && W.tile.col === o1.col && W.tile.row === o1.row, wctl.feedback && wctl.feedback.text);
    R.hand.useSimulated(false);
    if (party.active !== 'mago') key('Tab');
    key('Escape'); // o mago volta da casa para onde a pinça o levou
    await until(() => !tk.busy, 6);
    check('mago de volta à casa dele', mageUnit.tile.col === mFrom.col && mageUnit.tile.row === mFrom.row, `${mageUnit.tile.col},${mageUnit.tile.row}`);
  }
  // Dificuldade das runas, traçado guiado (72% no Fácil, 80% no Normal, ponto de partida, interrupções),
  // desenho livre (Avançado sem trilho, mão que some e volta, dica de "quase") e o treino de runas.
  async function runeTests() {
    const { runeCanvas, trainer, tui } = R;
    flow.enemiesAct = false;
    await until(() => !flow.busy && combat.phase === 'player', 15);
    if (R.party.active !== 'mago') key('Tab');
    combat.restoreResources();
    const penAt = (q, p = 0.9, ms = 33) => { commands.emit('pen.move', { px: q.x, py: q.y, pen: p, t: performance.now(), source: 'hand' }); spin(ms); sim(ms / 1000); };
    const railPts = (from, to) => { const rail = caster.guide.railStrokes()[0], n = rail.length - 1; const out = []; for (let k = Math.round(from * n); k <= Math.round(to * n); k += 2) out.push({ x: rail[k][0] + Math.sin(k) * 10, y: rail[k][1] + Math.cos(k * 0.7) * 10 }); return out; };
    const diffBtn = v => document.querySelector(`[data-cmd="rune.difficulty"][data-value="${v}"]`);
    // o teste mexe em preferências salvas no navegador (dificuldade, trilho, estatísticas do treino): guarda e devolve no fim
    const saved = {}; for (const k of ['runa3d.dificuldade', 'runa3d.guided']) { try { saved[k] = localStorage.getItem(k); } catch { /* */ } }
    const savedAttempts = trainer.attempts.slice();
    caster.freeInNormal = false;

    // --- configurações: os três níveis no painel ---
    diffBtn('normal').click();
    check('Configurações: dificuldade Normal (botão do painel)', caster.difficulty.id === 'normal' && diffBtn('normal').getAttribute('aria-pressed') === 'true' && /Normal/.test(document.getElementById('diffHelp').textContent));
    diffBtn('facil').click();
    check('dificuldade Fácil: runa guiada com trilho magnético', caster.difficulty.id === 'facil' && caster.guided && caster.recognizer.config.minScore === 0.75);

    // --- Fácil: ponto de partida, progresso, conclusão com ~72% ---
    key('1');
    check('Fácil: a runa aparece grande como trilho', caster.state === 'drawing' && !!caster.guide && caster.guide.size >= Math.min(innerWidth, innerHeight) * 0.49);
    sim(1 / 30);
    check('ponto de partida destacado antes de começar', runeCanvas.guide.state && !!runeCanvas.guide.state.start);
    for (const q of railPts(0, 0.12)) penAt(q, 0.05);
    check('depois de grudar: o trecho à frente acende (o caminho a seguir)', !runeCanvas.guide.state.start && !!runeCanvas.guide.state.ahead && caster.guide.progress > 0.08);
    for (const q of railPts(0.12, 0.6)) penAt(q, 0.05);
    check('Fácil: 60% traçado ainda não conclui sozinho', caster.state === 'drawing' && caster.guide.progress < 0.7, `${Math.round(caster.guide.progress * 100)}%`);
    for (const q of railPts(0.6, 0.76)) { penAt(q, 0.05); if (caster.state !== 'drawing') break; }
    check('Fácil: com ~72% traçado a runa é reconhecida', caster.state === 'recognized', caster.attempt && `${Math.round(caster.attempt.result.score * 100)}%`);
    key('Escape'); sim(0.1);

    // --- interrupção curta da câmera (sem amostras por 350 ms) no meio do trilho ---
    caster.restartDrawing('');
    for (const q of railPts(0, 0.35)) penAt(q, 0.05);
    commands.emit('pen.lost', { t: performance.now(), source: 'hand' });
    spin(350); sim(0.35);
    for (const q of railPts(0.6, 0.9)) { penAt(q, 0.05); if (caster.state !== 'drawing') break; }
    check('mão some 350 ms e volta 25% à frente no trilho: o trecho do meio acende e a runa vale', caster.state === 'recognized' && caster.attempt.bridges >= 1, caster.attempt ? `pontes ${caster.attempt.bridges}` : `${Math.round(caster.guide.progress * 100)}%`);
    key('Escape'); sim(0.1);
    // um salto sem interrupção (a mão estava sendo vista) não acende o meio
    caster.restartDrawing('');
    for (const q of railPts(0, 0.3)) penAt(q, 0.05);
    for (const q of railPts(0.55, 0.62)) penAt(q, 0.05);
    check('salto rápido pelo trilho (sem perder a mão) não acende o trecho pulado', caster.guide.progress < 0.45, `${Math.round(caster.guide.progress * 100)}%`);
    key('Escape'); key('Escape'); key('Escape');

    // --- Normal: precisa de 80% ---
    diffBtn('normal').click();
    key('1');
    for (const q of railPts(0, 0.76)) penAt(q, 0.05);
    check('Normal: 76% traçado ainda não basta (pede 80%)', caster.state === 'drawing', `${Math.round(caster.guide.progress * 100)}%`);
    for (const q of railPts(0.76, 0.95)) { penAt(q, 0.05); if (caster.state !== 'drawing') break; }
    check('Normal: com 80% vale', caster.state === 'recognized');
    key('Escape'); sim(0.1);
    key('i');
    check('Normal: tecla I troca para o desenho livre', caster.state === 'drawing' && !caster.guided && !caster.guide && !!runeCanvas.guide);
    // mão some no meio do círculo e volta: o mesmo traço continua
    const cpts = circlePts(46);
    for (const q of cpts.slice(0, 22)) penAt(q, 0.9);
    commands.emit('pen.lost', { t: performance.now(), source: 'hand' });
    for (let i = 0; i < 6; i++) { spin(110); sim(0.11); }
    check('desenho livre: a mão some, o traço para mas a tentativa espera', caster.state === 'drawing' && caster.tracker.strokes.length === 1 && !!caster.tracker.resumable);
    for (const q of cpts.slice(22)) penAt(q, 0.9);
    for (let i = 0; i < 26; i++) penAt({ x: cpts[45].x + (Math.random() - 0.5) * 4, y: cpts[45].y + (Math.random() - 0.5) * 4 }, 0.9);
    check('a mão volta perto de onde sumiu: o mesmo traço continua e o círculo vale', caster.tracker.resumed === 1 || (caster.attempt && caster.attempt.resumed === 1), caster.attempt && `${caster.state} ${caster.attempt.result.id} ${Math.round(caster.attempt.result.score * 100)}%`);
    check('...e o círculo foi reconhecido', caster.state === 'recognized' || caster.state === 'targeting');
    key('Escape'); sim(0.1);
    // um círculo aberto demais: "quase", com a dica do que corrigir
    if (caster.state !== 'drawing') key('1');
    caster.restartDrawing('');
    const open = Array.from({ length: 40 }, (_, i) => { const a = -Math.PI / 2 + (i / 39) * Math.PI * 1.45; return { x: cx + Math.cos(a) * rad, y: cy + Math.sin(a) * rad }; });
    await drawMouse(open);
    check('desenho que não vale explica o que corrigir', caster.state === 'drawing' && /Dica|Quase|parece/.test(R.ui.cMsg.textContent), R.ui.cMsg.textContent);
    key('Escape'); key('Escape'); key('Escape');

    // --- Avançado: desenho livre, sem trilho na tela, reconhecimento mais rigoroso ---
    diffBtn('avancado').click();
    key('1');
    check('Avançado: sem trilho e sem a runa no meio da tela', caster.state === 'drawing' && !caster.guided && !caster.guide && runeCanvas.guide === null && caster.recognizer.config.minScore === 0.8);
    key('i');
    check('Avançado: a tecla I não liga o trilho', !caster.guided);
    await drawMouse(circlePts());
    check('Avançado: um círculo bem feito vale', caster.state === 'recognized', caster.attempt && `${Math.round(caster.attempt.result.score * 100)}%`);
    key('Escape'); key('Escape'); key('Escape');
    diffBtn('facil').click();

    // --- treino de runas ---
    const mana0 = mageUnit.mana, casts0 = combat.castsLeft, n0 = trainer.attempts.length;
    key('o');
    check('tecla O abre o treino de runas', tui.open && caster.mode === 'practice' && caster.state === 'drawing' && !!caster.spell.rune);
    tui.panel.querySelector('[data-rune="triangulo"]').click();
    check('escolher a runa no painel (Triângulo): o símbolo esperado vira o trilho', caster.practiceRune === 'triangulo' && caster.spell.rune === 'triangulo' && runeCanvas.guide && runeCanvas.guide.id === 'triangulo');
    const tri = caster.guide.railStrokes()[0].filter((_, i) => i % 2 === 0);
    for (const q of tri) { penAt({ x: q[0] + 6, y: q[1] - 4 }, 0.05, 20); if (caster.state !== 'drawing') break; }
    const last = trainer.attempts[trainer.attempts.length - 1];
    check('treino: acerto registrado com nota e tempo', trainer.attempts.length === n0 + 1 && last.rune === 'triangulo' && last.ok && last.ms > 0 && /acerto/.test(tui.last.textContent), JSON.stringify(last));
    sim(1.3);
    check('treino: repete sozinho (nova tentativa da mesma runa)', caster.state === 'drawing' && caster.practiceRune === 'triangulo' && caster.guide && caster.guide.progress === 0);
    check('treino não gasta mana nem a magia do turno', mageUnit.mana === mana0 && combat.castsLeft === casts0);
    // erro registrado: desenho livre de outra coisa
    caster.guided = false; caster.restartDrawing('');
    await drawMouse(circlePts());
    const l2 = trainer.attempts[trainer.attempts.length - 1];
    check('treino: erro registrado (círculo no lugar do triângulo)', l2 && !l2.ok && l2.read === 'circulo' && /erro/.test(tui.last.textContent), JSON.stringify(l2));
    caster.guided = true;
    // rabisco livre: conta falsos disparos
    tui.panel.querySelector('[data-rune="livre"]').click();
    check('rabisco livre: desenho sem runa nem trilho', caster.practiceRune === 'livre' && !caster.guide && caster.state === 'drawing');
    const scrib = [];
    let px = cx, py = cy;
    for (let i = 0; i < 60; i++) { px += Math.sin(i * 2.3) * 60 + Math.cos(i * 0.9) * 25; py += Math.cos(i * 1.7) * 55; scrib.push({ x: Math.max(80, Math.min(innerWidth - 80, px)), y: Math.max(80, Math.min(innerHeight - 80, py)) }); }
    await drawMouse(scrib);
    const l3 = trainer.attempts[trainer.attempts.length - 1];
    check('rabisco: nenhuma runa disparou (registrado como acerto do teste)', l3.rune === 'livre' && l3.ok, JSON.stringify(l3));
    const exp = JSON.parse(trainer.export());
    check('exportar resultados: total, rabiscos, por runa e tentativas', exp.total && exp.rabiscos && exp.porRuna.triangulo && exp.tentativas.length === trainer.attempts.length);
    sim(1.3);
    key('Escape');
    check('Esc fecha o treino e volta ao jogo', !tui.open && caster.state === 'idle' && caster.mode === 'play', `${caster.state} ${tui.open}`);
    trainer.attempts = savedAttempts; trainer.save();
    for (const [k, v] of Object.entries(saved)) { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* */ } }
    caster.freeInNormal = false;
  }
  // Runa Vision 2.0, pelo mesmo caminho da câmera (mão sintética no HandInput): o painel de diagnóstico, a
  // calibração do jogador de ponta a ponta (com a runa de teste traçada) e o modo de avaliação, sem a mão
  // acionar o jogo enquanto calibra ou avalia.
  async function visionTests() {
    const { wizard, diag, evalMode, ix, vision } = R;
    const { fakeHand } = await import('./fakeHand.js');
    flow.enemiesAct = false;
    await until(() => !flow.busy && combat.phase === 'player', 15);
    if (R.party.active !== 'mago') key('Tab');
    const savedProfile = (() => { try { return localStorage.getItem('runa3d.perfilMao'); } catch { return null; } })();
    const savedArea = (() => { try { return localStorage.getItem('runa3d.camArea'); } catch { return null; } })();
    const area0 = { ...hand.config.camArea }, pen0 = { penOn: caster.tracker.config.penOn, penOff: caster.tracker.config.penOff };
    hand.useSimulated(true);
    let tH = 200000;
    const handAt = (sx, sy, pose) => {
      const a = hand.config.camArea, w = hand.config.anchorTipWeight;
      const lm = fakeHand({ pose, x: 0.5, y: 0.7 }).landmarks[0];
      const ax = lm[5].x + (lm[8].x - lm[5].x) * w, ay = lm[5].y + (lm[8].y - lm[5].y) * w;
      const tx = 1 - (a.x0 + (sx / innerWidth) * (a.x1 - a.x0)), ty = a.y0 + (sy / innerHeight) * (a.y1 - a.y0);
      return fakeHand({ pose, x: 0.5 + tx - ax, y: 0.7 + ty - ay });
    };
    const feedH = (p, pose, n = 1, real = 0) => { for (let i = 0; i < n; i++) { hand.handleResult(handAt(p.x, p.y, pose), tH); tH += 33; if (real) spin(real); sim(1 / 30); } };
    const mageAt = toScreen(tk.pos.x, 1.0, tk.pos.z);

    // --- diagnóstico ---
    key('x');
    check('tecla X abre o diagnóstico da visão', diag.open);
    feedH(mageAt, 'point', 12);
    diag.at = 0; diag.update(performance.now() + 1000);
    const txt = diag.box.textContent;
    check('diagnóstico: câmera, inferência, captura → comando, cursor cru e filtrado, pinça, gestos e contexto', /Câmera/.test(txt) && /Inferência/.test(txt) && /Captura/.test(txt) && /Cursor cru/.test(txt) && /Cursor filtrado/.test(txt) && /pinça: aberta/.test(txt) && /Contexto/.test(txt) && /mago/.test(txt), txt.slice(0, 160));
    check('diagnóstico: o rastro do cursor e os pontos da mão são desenhados', diag.trace.length > 5);
    feedH(mageAt, 'pinch', 4);
    diag.at = 0; diag.update(performance.now() + 2000);
    check('diagnóstico: a pinça aparece fechada (e o mago foi pego: contexto "segurando")', /pinça: pinça/.test(diag.box.textContent) && /segurando/.test(diag.box.textContent), diag.ePtext.textContent);
    feedH(mageAt, 'point', 10);
    await until(() => !tk.busy, 4);
    key('x');
    check('tecla X fecha o diagnóstico', !diag.open);

    // --- calibração do jogador, de ponta a ponta ---
    commands.emit('vision.calibrate', { source: 'mouse' });
    check('calibração abre e a mão para de acionar o jogo (contexto "calibrando")', wizard.open && ix.update() === 'calibrando');
    const center = { x: innerWidth / 2, y: innerHeight / 2 };
    feedH(center, 'open', 60, 3);
    check('passo 1 (mão aberta) mede e passa para a pinça', wizard.i === 1 && wizard.cal.results.aberta && wizard.cal.results.aberta.open > 1, wizard.eMsg.textContent);
    feedH(mageAt, 'point', 6, 3);
    for (let c = 0; c < 3; c++) { feedH(mageAt, 'pinch', 6, 25); feedH(mageAt, 'point', 6, 3); }
    check('passo 2 (pinça três vezes) mede; a pinça em cima do mago NÃO o pegou (calibrando)', wizard.i === 2 && !tk.holding && !tk.busy && wizard.cal.results.pinca.cycles === 3, `${wizard.i} ${tk.state}`);
    feedH(center, 'point', 60, 3);
    check('passo 3 (apontar) mede', wizard.i === 3 && wizard.cal.results.apontar.point > 0.5);
    for (let i = 0; i < 230 && wizard.i === 3; i++) { const a = i * 0.2; feedH({ x: center.x + Math.cos(a) * innerWidth * 0.42, y: center.y + Math.sin(a * 1.3) * innerHeight * 0.42 }, 'point', 1, 3); }
    for (let i = 0; i < 80 && wizard.i === 3; i++) feedH(center, 'point', 1, 3);
    check('passo 4 (alcance e tremor) mede', wizard.i === 4 && wizard.cal.results.alcance && wizard.cal.results.alcance.camArea, wizard.i);
    check('passo 5: o círculo aparece no traçado guiado (Fácil) e a caneta da mão vale (contexto "runa de teste")', caster.mode === 'practice' && caster.practiceRune === 'circulo' && !!caster.guide && ix.update() === 'calibrandoRuna');
    const rail = caster.guide.railStrokes()[0].filter((_, i) => i % 2 === 0);
    for (const q of rail) { commands.emit('pen.move', { px: q[0] + 5, py: q[1] - 4, pen: 0.05, t: performance.now(), source: 'hand' }); spin(15); sim(1 / 60); if (caster.state !== 'drawing') break; }
    await until(() => wizard.box.classList.contains('done'), 3);
    check('runa de teste traçada: a calibração mostra o resumo', wizard.box.classList.contains('done') && /Pinça/.test(wizard.eSum.textContent) && /Runa de teste/.test(wizard.eSum.textContent), wizard.eSum.textContent.slice(0, 120));
    const prof = wizard.profile;
    check('perfil com pinça, caneta, alcance e a runa de teste', prof.pinch && prof.pen && prof.camArea && prof.medidas.runa && prof.medidas.runa.ok);
    check('a runa de teste não entra nas estatísticas do treino e a dificuldade volta', caster.mode === 'play' && caster.trainer === R.trainer);
    wizard.btn('save').click();
    check('salvar: a pinça passa a usar os limites desta mão e a caneta também', !wizard.open && hand.profile && hand.pinch.config.calibrated && caster.tracker.config.penOn === prof.pen.on && ix.update() === 'mago');
    // depois de calibrar, a pinça continua pegando o mago
    const m2 = toScreen(tk.pos.x, 1.0, tk.pos.z);
    feedH(m2, 'point', 15); feedH(m2, 'pinch', 4);
    check('com a calibração salva, a pinça pega o mago', tk.holding);
    feedH(m2, 'point', 10);
    await until(() => !tk.busy, 4);
    // cancelar no meio não muda nada
    const p1 = hand.profile;
    commands.emit('vision.calibrate', { source: 'mouse' });
    key('Escape');
    check('Esc cancela a calibração sem mudar o perfil', !wizard.open && hand.profile === p1 && ix.update() === 'mago');

    // --- avaliação ---
    commands.emit('vision.eval', { source: 'mouse' });
    check('avaliação abre e a mão para de acionar o jogo (contexto "avaliando")', evalMode.open && evalMode.run && ix.update() === 'avaliando');
    feedH(m2, 'point', 10); feedH(m2, 'pinch', 4);
    check('avaliando, a pinça em cima do mago não o pega (mas a avaliação conta a pinça)', !tk.holding && !tk.busy);
    feedH(m2, 'point', 8);
    for (let i = 0; i < 20; i++) { evalMode.update(performance.now()); feedH(center, 'point', 1); }
    check('avaliação: o alvo e o cursor são desenhados (prova "parado")', evalMode.run && evalMode.run.stage === 'parado');
    key('Escape');
    check('Esc para a avaliação e devolve o jogo', !evalMode.open && ix.update() === 'mago' && hand.cursorMode === 'novo');

    // --- devolve como estava ---
    hand.useSimulated(false);
    hand.hand.visible && hand.loseHand();
    try { if (savedProfile === null) localStorage.removeItem('runa3d.perfilMao'); else localStorage.setItem('runa3d.perfilMao', savedProfile); if (savedArea === null) localStorage.removeItem('runa3d.camArea'); else localStorage.setItem('runa3d.camArea', savedArea); } catch { /* */ }
    if (savedProfile) hand.applyProfile(JSON.parse(savedProfile), false); else hand.clearProfile();
    hand.config.camArea = area0;
    caster.tracker.config = { ...caster.tracker.config, ...pen0 };
    void vision;
  }
  // Golpe Devastador, Guarda de Ferro, Investida, Contra-ataque e Onda de Choque, de ponta a ponta: o gesto pela mão
  // simulada (o mesmo caminho da câmera), o custo, o dano só no impacto e uma vez, a animação e o efeito de regra.
  async function otherAbilities(feed) {
    const { wctl, warrior, warriorUnit: W, gestures, wAnim } = R;
    const put = (u, t) => { combat.setUnitTile(u, t); const [x, z] = board.tileCenter(t.col, t.row); const v = R.views.get(u); if (v && v.dummy) v.dummy.object.position.set(x, 0, z); if (u === W) { warrior.object.position.set(x, 0, z); wctl.refreshReach(); } };
    const fresh = () => { Object.assign(W, { energy: 100, actionsLeft: 1, movesLeft: W.move }); combat.cooldowns = {}; for (const id of [...W.statuses.keys()]) combat.removeStatus(W, id); gestures.reset(); wctl.landedAt = -1e9; };
    const vstroke = (pose, y0, y1, x = 0.55, tail = 12) => { for (let i = 0; i < 9; i++) feed(pose, x, y0); for (let i = 0; i <= 9; i++) { const u = i / 9, e = u * u * (3 - 2 * u); feed(pose, x, y0 + (y1 - y0) * e); } for (let i = 0; i < tail && wctl.state === 'ready'; i++) feed(pose, x, y1); };
    const hold = (pose, n = 28) => { for (let i = 0; i < n && wctl.state === 'ready'; i++) feed(pose, 0.58, 0.62); };
    const runAnim = () => { const ph = new Set(); for (let k = 0; k < 200 && wctl.state !== 'ready' && wctl.state !== 'free'; k++) { sim(1 / 60); ph.add(wAnim.phaseName); } return ph; };
    const all = [...Array(8).keys()].flatMap(c => [...Array(8).keys()].map(r => ({ col: c, row: r })));
    const auto1 = unit('automato1'), auto2 = unit('automato2'), b1 = unit('boneco1'), b2 = unit('boneco2'), b3 = unit('boneco3');
    for (const u of [auto1, auto2, b1, b2, b3]) { for (const id of [...u.statuses.keys()]) combat.removeStatus(u, id); combat.revive(u); }
    // tabuleiro arrumado para os testes, longe do mago (que fica onde está): o guerreiro na coluna 6
    const mt = mageUnit.tile;
    check('o mago fica fora da área dos testes do guerreiro', mt.col < 4, `${mt.col},${mt.row}`);
    put(b1, { col: 0, row: 7 }); put(b2, { col: 1, row: 7 }); put(b3, { col: 0, row: 6 }); put(auto2, { col: 0, row: 0 });
    put(W, { col: 6, row: 6 }); put(auto1, { col: 7, row: 6 });
    if (R.party.active !== 'guerreiro') key('Tab');

    // Golpe Devastador: punho descendo, ao lado do Autômato 1
    fresh();
    const hp0 = auto1.hp;
    vstroke('fist', 0.38, 0.66);
    check('Golpe Devastador: punho descendo reconhecido (câmera simulada)', wctl.state === 'acting' && wctl.action && wctl.action.ab.id === 'golpeDevastador', wctl.feedback && wctl.feedback.text);
    check('Golpe Devastador: 30 de energia, recarga 2 e a ação, pagos no reconhecimento', W.energy === 70 && combat.cooldowns.golpeDevastador === 2 && W.actionsLeft === 0);
    check('Golpe Devastador: antes do impacto, nada de dano', auto1.hp === hp0);
    let ph = runAnim();
    check('Golpe Devastador: erguer, carga, golpe, acompanhamento, recuperação', ['erguer', 'carga', 'golpe', 'acompanhamento', 'recuperação'].every(p => ph.has(p)), [...ph].join(' > '));
    check('Golpe Devastador: 40 − 2 de defesa = 38, uma vez, e guarda quebrada no alvo', hp0 - auto1.hp === 38 && auto1.statuses.has('guardaQuebrada'), `${hp0} → ${auto1.hp}`);
    sim(0.5);
    check('Golpe Devastador: sem dano em dobro', hp0 - auto1.hp === 38);

    // Investida: punho subindo; Boneco 3 em linha reta a 4 casas (2,0)... o caminho livre
    fresh(); combat.removeStatus(auto1, 'guardaQuebrada');
    put(auto1, { col: 0, row: 1 }); put(b3, { col: 6, row: 2 }); // em cima, na mesma coluna, a 4 casas
    put(b2, { col: 4, row: 6 }); combat.addObstacle({ col: 5, row: 6 }, { kind: 'muralha', hp: 60, turns: 5 }); // à esquerda, atrás de uma muralha: essa linha não vale
    const hpB3 = b3.hp;
    vstroke('fist', 0.66, 0.38, 0.55, 14);
    check('Investida: punho subindo reconhecido (depois do instante de confirmação)', wctl.state === 'acting' && wctl.action && wctl.action.ab.id === 'investida', wctl.feedback && wctl.feedback.text);
    check('Investida: o caminho escolhido é a linha livre até o boneco 3 (o boneco 2 está atrás da muralha)', wctl.action && wctl.action.plan.target === b3 && wctl.action.plan.path.every(t => combat.isWalkable(t, W)), wctl.action && wctl.action.plan.target && wctl.action.plan.target.id);
    ph = runAnim();
    check('Investida: abaixar, avançar, impacto, desacelerar, recuperação', ['abaixar', 'avançar', 'impacto', 'desacelerar', 'recuperação'].every(p => ph.has(p)), [...ph].join(' > '));
    check('Investida: parou na casa ao lado do alvo (6,3), no combate e na cena', W.tile.col === 6 && W.tile.row === 3 && Math.abs(warrior.object.position.z - board.tileCenter(6, 3)[1]) < 0.05, `${W.tile.col},${W.tile.row}`);
    check('Investida: 18 de dano no boneco, uma vez', hpB3 - b3.hp === 18, `${hpB3} → ${b3.hp}`);
    for (const o of [...combat.obstacles.values()]) combat.removeObstacle(o, 'teste');

    // Guarda de Ferro: palma aberta parada
    fresh();
    hold('open', 34);
    check('Guarda de Ferro: palma parada 0,7 s reconhecida', wctl.state === 'acting' && wctl.action && wctl.action.ab.id === 'guardaDeFerro', wctl.feedback && wctl.feedback.text);
    ph = runAnim();
    check('Guarda de Ferro: recolher, erguer o escudo, firmar, em guarda', ['recolher', 'erguer o escudo', 'firmar', 'em guarda'].every(p => ph.has(p)), [...ph].join(' > '));
    sim(1);
    check('Guarda de Ferro: efeito no guerreiro, postura de guarda e o texto em cima dele', W.statuses.has('guardaDeFerro') && warrior.stance.guard > 0.8 && /guarda de ferro/.test(R.views.get(W).statusTag.textContent), `${warrior.stance.guard.toFixed(2)} "${R.views.get(W).statusTag.textContent}"`);
    const whp = W.hp;
    combat.meleeAttack(auto1, W, 20, 'fisico', { key: 'teste-guarda' });
    check('Guarda de Ferro: 20 de ataque − 4 de defesa = 16, pela metade = 8', whp - W.hp === 8, `${whp} → ${W.hp}`);
    combat.removeStatus(W, 'guardaDeFerro');

    // Contra-ataque: V parado; depois um autômato ao lado ataca no turno dos inimigos
    fresh();
    put(b3, { col: 0, row: 6 }); put(b2, { col: 1, row: 7 });
    put(W, { col: 6, row: 6 }); put(auto1, { col: 7, row: 6 });
    hold('two', 34);
    check('Contra-ataque: V parado 0,7 s reconhecido', wctl.state === 'acting' && wctl.action && wctl.action.ab.id === 'contraAtaque', wctl.feedback && wctl.feedback.text);
    ph = runAnim();
    check('Contra-ataque: recuar, aparar, esperar, em guarda', ['recuar', 'aparar', 'esperar', 'em guarda'].every(p => ph.has(p)), [...ph].join(' > '));
    sim(1);
    check('Contra-ataque armado: efeito e postura de aparar', W.statuses.has('aparar') && warrior.stance.parry > 0.8);
    const wh1 = W.hp, ah1 = auto1.hp;
    flow.enemiesAct = true;
    put(auto2, { col: 0, row: 0 });
    key('n');
    let reacted = false, waited = false;
    for (let k = 0; k < 900 && flow.busy; k++) { sim(1 / 60); if (wctl.reacting) { reacted = true; if (flow.busy) waited = true; } }
    flow.enemiesAct = false;
    check('Contra-ataque: o ataque do autômato foi aparado (o guerreiro não perdeu vida)', W.hp === wh1, `${wh1} → ${W.hp}`);
    check('Contra-ataque: a resposta tirou 20 − 2 = 18 do atacante, uma vez', ah1 - auto1.hp === 18, `${ah1} → ${auto1.hp}`);
    check('Contra-ataque: a resposta animou e o turno dos inimigos esperou por ela', reacted && waited);
    check('Contra-ataque: gasto (não fica armado, não responde de novo)', !W.statuses.has('aparar') && wctl.log.filter(l => l.id === 'contraAtaque' && l.source === 'reação').length === 1);
    await until(() => !flow.busy && combat.phase === 'player', 15);
    if (R.party.active !== 'guerreiro') key('Tab');

    // Onda de Choque: círculo com o indicador; dois vizinhos, um com espaço atrás, outro encostado em alguém
    fresh();
    put(W, { col: 6, row: 5 }); put(auto1, { col: 7, row: 5 }); put(b3, { col: 6, row: 4 }); put(b2, { col: 6, row: 3 }); // b2 atrás do b3: b3 não é empurrado
    const h1 = auto1.hp, h3 = b3.hp;
    for (let i = 0; i < 8; i++) feed('point', 0.55, 0.43);
    for (let i = 0; i <= 30 && wctl.state === 'ready'; i++) { const a = -Math.PI / 2 + (i / 30) * Math.PI * 2.15; feed('point', 0.55 + 0.12 * Math.cos(a), 0.55 + 0.16 * Math.sin(a)); }
    check('Onda de Choque: círculo com o indicador reconhecido', wctl.state === 'acting' && wctl.action && wctl.action.ab.id === 'ondaDeChoque', wctl.feedback && wctl.feedback.text);
    ph = runAnim();
    check('Onda de Choque: segurar, erguer, carga, golpear o chão, acompanhamento, recuperação', ['segurar', 'erguer', 'carga', 'golpear o chão', 'acompanhamento', 'recuperação'].every(p => ph.has(p)), [...ph].join(' > '));
    check('Onda de Choque: 15 − defesa em cada vizinho, uma vez', h1 - auto1.hp === 13 && h3 - b3.hp === 15, `${h1 - auto1.hp} ${h3 - b3.hp}`);
    check('Onda de Choque: não empurra para fora do tabuleiro (autômato na borda fica) nem para casa ocupada (boneco 3 fica)', auto1.tile.col === 7 && auto1.tile.row === 5 && b3.tile.col === 6 && b3.tile.row === 4, `${JSON.stringify(auto1.tile)} ${JSON.stringify(b3.tile)}`);
    // de novo, com espaço: o autômato do outro lado é empurrado
    fresh(); put(auto1, { col: 5, row: 5 });
    const h1b = auto1.hp;
    wctl.use('ondaDeChoque', { source: 'teclado' });
    runAnim();
    check('Onda de Choque: com espaço atrás, empurra 1 casa (autômato de 5,5 para 4,5)', auto1.tile.col === 4 && auto1.tile.row === 5 && h1b - auto1.hp === 13, `${JSON.stringify(auto1.tile)} ${h1b - auto1.hp}`);
    sim(1);
    check('Onda de Choque: o empurrado foi para a casa nova também na cena', Math.abs(R.views.get(auto1).dummy.object.position.x - board.tileCenter(4, 5)[0]) < 0.1);

    // conflito: pinça não golpeia; golpe não começa durante outro
    fresh();
    const n0 = wctl.log.length;
    for (let i = 0; i < 9; i++) feed('pinch', 0.7, 0.6);
    for (let i = 0; i <= 10; i++) { const u = i / 10; feed('pinch', 0.7, 0.6 - 0.3 * u); }
    feed('point', 0.7, 0.3); for (let i = 0; i < 8; i++) feed('point', 0.7, 0.3);
    check('pinça subindo/descendo: nenhuma habilidade', wctl.log.length === n0 && W.energy === 100);
    // o ponteiro da mão passando por cima do guerreiro no meio de um gesto não apaga o gesto
    fresh();
    const g0 = gestures.history.length;
    for (let i = 0; i < 6; i++) feed('sword', 0.62, 0.6);
    R.wtk.setState('selected'); R.wtk.setState('idle');
    check('passar o cursor por cima do guerreiro não apaga o gesto em andamento', gestures.history.length >= g0 + 6, `${gestures.history.length}`);
    // devolve o tabuleiro como estava
    for (const [u, t] of [[b1, { col: 1, row: 1 }], [b2, { col: 4, row: 0 }], [b3, { col: 6, row: 2 }], [auto1, { col: 5, row: 1 }], [auto2, { col: 6, row: 3 }]]) { for (const id of [...u.statuses.keys()]) combat.removeStatus(u, id); combat.revive(u); put(u, t); }
    fresh();
    void all;
  }
  function views() { return [...R.views.values()].filter(v => v.dummy); }
}

const sameTileOk = (a, b) => a && b && a.col === b.col && a.row === b.row;
// conta os objetos da cena, sem os números de dano (rótulos HTML que somem sozinhos)
function countObjects(root) { let n = 0; root.traverse(o => { if (!o.isCSS2DObject) n++; }); return n; }
