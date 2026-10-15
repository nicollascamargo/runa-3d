// Ponto de entrada. Etapa A: o mago e a arena. Etapa B: telecinese com o mouse ou com a mão na câmera.
// Etapa D: magias por runas desenhadas no ar, combate por turnos e arena de treino.
// Guerreiro: a segunda classe jogável, com golpes por movimentos da mão (mesma arena, turnos e câmera).
import * as THREE from 'three';
import { Engine } from './core/Engine.js';
import { GFX, applyGfx, cycleGfx, AutoQuality } from './core/Settings.js';
import { Arena } from './world/Arena.js';
import { TrainingDummy } from './world/TrainingDummy.js';
import { TargetMarkers } from './world/TargetMarkers.js';
import { Mage, TEST_POSES } from './character/Mage.js';
import { CastAnimator, SCHOOLS } from './character/CastAnimator.js';
import { downloadGLB, exportGLB } from './character/exportGLB.js';
import { loadMageGLB, loadWarriorGLB } from './character/loadGLB.js';
import { Commands, keyboardSource, pointerSource } from './input/Commands.js';
import { HandInput } from './input/HandInput.js';
import { Telekinesis, TelekinesisGroup, tileName } from './gameplay/Telekinesis.js';
import { MagicFx } from './fx/MagicFx.js';
import { SpellFx } from './fx/SpellFx.js';
import { Sfx } from './audio/Sfx.js';
import { Hud } from './ui/Hud.js';
import { HandView } from './ui/HandView.js';
import { RuneCanvas } from './ui/RuneCanvas.js';
import { SpellUi } from './ui/SpellUi.js';
import { Combat, makeUnit, sameTile } from './combat/Combat.js';
import { TurnFlow } from './combat/TurnFlow.js';
import { DummyView, MageView } from './combat/UnitViews.js';
import { RuneTracker } from './runes/RuneTracker.js';
import { RuneRecognizer } from './runes/RuneRecognizer.js';
import { SPELLS } from './spells/spellBook.js';
import { SpellCaster, CASTER_STATES } from './spells/SpellCaster.js';
import { runSelfTest } from './dev/selfTest.js';
import { Warrior } from './character/Warrior.js';
import { WARRIOR_MOVES } from './character/warriorMoves.js';
import { WarriorView } from './combat/UnitViews.js';
import { WARRIOR, ABILITIES } from './warrior/abilities.js';
import { canUse } from './warrior/warriorRules.js';
import { WarriorGestures } from './warrior/WarriorGestures.js';
import { WarriorController, WARRIOR_STATES } from './warrior/WarriorController.js';
import { WarriorFx } from './fx/WarriorFx.js';
import { WarriorUi } from './ui/WarriorUi.js';
import { RUNE_IDS } from './runes/runeShapes.js';
import { RunePractice } from './runes/RunePractice.js';
import { DIFFICULTIES, loadDifficulty, saveDifficulty } from './runes/difficulty.js';
import { RuneTrainerUi } from './ui/RuneTrainerUi.js';
import { InteractionContext } from './input/InteractionContext.js';
import { CalibrationWizard } from './ui/CalibrationWizard.js';
import { VisionDiagnostics } from './ui/VisionDiagnostics.js';
import { VisionEval } from './ui/VisionEval.js';

const nextFrame = () => new Promise(r => requestAnimationFrame(() => r()));

// Relógio de eventos no tempo do jogo (anda com engine.simulate() nos testes, ao contrário do setTimeout).
class Timers {
  constructor() { this.list = []; }
  after(seconds, fn) { this.list.push({ t: seconds, fn }); }
  update(dt) {
    for (const it of [...this.list]) { it.t -= dt; if (it.t <= 0) { this.list.splice(this.list.indexOf(it), 1); it.fn(); } }
  }
}

async function boot() {
  const loading = document.getElementById('loading');
  await nextFrame();
  await nextFrame();

  const engine = new Engine(document.getElementById('stage'));
  applyGfx(engine);
  const arena = new Arena(engine);
  const board = arena.board;
  const fx = new MagicFx(engine);
  const spellFx = new SpellFx(engine, fx);
  const sfx = new Sfx();
  const timers = new Timers();

  // ?modelo=assets/arquivo.glb troca o mago feito em código por um modelo em arquivo
  const modelUrl = new URLSearchParams(location.search).get('modelo');
  let built = null, modelNote = '';
  if (modelUrl) {
    try {
      built = await loadMageGLB(modelUrl);
      modelNote = built.missing.length ? `Modelo carregado, mas faltam ossos: ${built.missing.join(', ')}` : `Modelo carregado de ${modelUrl}`;
    } catch (err) {
      console.error(err);
      modelNote = `Não deu para abrir ${modelUrl} (${err.message}). Usando o mago feito em código.`;
    }
  }
  const mage = new Mage({ built });
  const anim = new CastAnimator(mage);
  const startTile = { col: 3, row: 4 };
  const [mx, mz] = board.tileCenter(startTile.col, startTile.row);
  mage.placeAt(mx, mz, Math.PI / 4);
  engine.scene.add(mage.object, mage.helper, mage.joints);

  // ---------- arena de treino: bonecos (só apanham) e autômatos (andam e atacam) ----------
  const combat = new Combat();
  const mageUnit = combat.addUnit(makeUnit({ id: 'mago', name: 'Mago', team: 'player', maxHp: 120, maxMana: 100, defense: 1, tile: startTile, training: true }));
  const views = new Map([[mageUnit, new MageView(mageUnit, mage, anim, { spellFx })]]);
  const dummies = [];
  const place = (d, col, row) => {
    const [x, z] = board.tileCenter(col, row);
    d.placeAt(x, z, Math.atan2(mx - x, mz - z));
    d.tile = { col, row };
    engine.scene.add(d.object);
    dummies.push(d);
  };
  [[1, 1], [4, 0], [6, 2]].forEach(([col, row], i) => {
    const d = new TrainingDummy({ name: `Boneco ${i + 1}` });
    place(d, col, row);
    const u = combat.addUnit(makeUnit({ id: `boneco${i + 1}`, name: d.name, team: 'neutral', maxHp: 100, training: true, tile: { col, row } }));
    views.set(u, new DummyView(u, d, { board, spellFx }));
  });
  [[5, 1], [6, 3]].forEach(([col, row], i) => {
    const d = new TrainingDummy({ name: `Autômato ${i + 1}`, maxHp: 110, variant: 'automato' });
    place(d, col, row);
    const u = combat.addUnit(makeUnit({ id: `automato${i + 1}`, name: d.name, team: 'enemy', maxHp: 110, defense: 2, move: 2, attack: 8, resist: { gelo: 0.2, raio: -0.2 }, training: true, tile: { col, row } }));
    d.setHp(u.hp);
    views.set(u, new DummyView(u, d, { board, spellFx }));
  });
  // ---------- o guerreiro: segunda classe jogável, no mesmo combate ----------
  // ?guerreiro=assets/arquivo.glb troca o guerreiro feito em código por um modelo em arquivo
  const warriorUrl = new URLSearchParams(location.search).get('guerreiro');
  let warriorBuilt = null;
  if (warriorUrl) {
    try {
      warriorBuilt = await loadWarriorGLB(warriorUrl);
      modelNote = `${modelNote ? `${modelNote} ` : ''}Guerreiro carregado de ${warriorUrl}${warriorBuilt.missing.length ? ` (faltam ossos: ${warriorBuilt.missing.join(', ')})` : ''}${warriorBuilt.sword ? '' : ' (sem objeto Espada)'}.`;
    } catch (err) {
      console.error(err);
      modelNote = `${modelNote ? `${modelNote} ` : ''}Não deu para abrir ${warriorUrl} (${err.message}). Usando o guerreiro feito em código.`;
    }
  }
  const warrior = new Warrior({ built: warriorBuilt });
  const wAnim = new CastAnimator(warrior, WARRIOR_MOVES);
  const warriorTile = { col: 1, row: 6 };
  { const [x, z] = board.tileCenter(warriorTile.col, warriorTile.row); warrior.placeAt(x, z, Math.atan2(-x, -z)); }
  engine.scene.add(warrior.object);
  const warriorUnit = combat.addUnit(makeUnit({ id: 'guerreiro', name: 'Guerreiro', team: 'player', maxHp: WARRIOR.maxHp, defense: WARRIOR.defense, maxEnergy: WARRIOR.maxEnergy,
    energyRegen: WARRIOR.energyRegen, move: WARRIOR.move, maxActions: WARRIOR.maxActions, tile: warriorTile, training: true }));
  views.set(warriorUnit, new WarriorView(warriorUnit, warrior, wAnim, { spellFx }));
  const unitAt = tile => { const u = combat.unitAt(tile); return u && u !== mageUnit ? u : null; };

  const commands = new Commands();
  const hud = new Hud(commands);
  hud.setStats({ tris: mage.triangleCount, bones: mage.boneCount });
  hud.setMageTile(startTile);
  if (modelNote) hud.toast(modelNote);

  // ---------- telecinese ----------
  const history = []; // casas por onde o mago passou, para "voltar"
  const tk = new Telekinesis({
    mage, board, fx, scene: engine.scene, tile: startTile,
    isFree: tile => !!tile && combat.isWalkable(tile, mageUnit),
    occupant: tile => { const u = unitAt(tile); return u ? u.name : combat.obstacleAt(tile) ? 'uma muralha' : ''; },
    sfx: name => sfx.play(name),
    onState: () => hud.setState(tk.stateName),
    onMessage: text => hud.toast(text, 3200),
    onLand: (to, from, { undo }) => {
      hud.setMageTile(to);
      combat.enterTile(mageUnit, to); // o combate sabe onde o mago está (e as áreas perigosas valem para ele também)
      if (!undo && !sameTile(to, from)) history.push(from);
      if (undo) hud.toast(`O mago voltou para ${tileName(to)}.`);
    },
  });

  // ---------- magias: rastreamento, reconhecimento, interface, alvo e execução ----------
  const runeLayer = document.createElement('canvas');
  runeLayer.id = 'runeLayer';
  runeLayer.setAttribute('aria-hidden', 'true');
  document.body.insertBefore(runeLayer, document.querySelector('.title'));
  const runeCanvas = new RuneCanvas(runeLayer);
  const ui = new SpellUi(SPELLS);
  const markers = new TargetMarkers(board);
  const tracker = new RuneTracker();
  const recognizer = new RuneRecognizer();
  // dificuldade das runas (Fácil = guiada, o padrão; Normal; Avançado), salva no navegador
  const diffPref = loadDifficulty();
  const trainer = new RunePractice(); // registro do treino de runas (tecla O)
  const caster = new SpellCaster({
    difficulty: diffPref.id, freeInNormal: diffPref.freeInNormal, trainer,
    combat, spells: SPELLS, tracker, recognizer, canvas: runeCanvas, ui, markers, anim, mage, tk, board, spellFx,
    sfx: name => sfx.play(name), toast: text => hud.toast(text, 3200),
    tileCenter: t => board.tileCenter(t.col, t.row),
    react: (unit, kind, k) => { const v = views.get(unit); if (v && v.react) v.react(kind, k); },
    unitPoint: ev => { const v = ev.unit && views.get(ev.unit); if (v) return v.point(); const [x, z] = board.tileCenter(ev.tile.col, ev.tile.row); return new THREE.Vector3(x, 0.6, z); },
  });
  ui.setThreshold(caster.difficulty.recognizer.minScore);
  caster.onState = s => {
    hud.setText('statSpell', caster.mode === 'practice' ? `treino: ${CASTER_STATES[s]}` : CASTER_STATES[s]);
    if (s === 'idle' && tui.open) tui.show(false); // saiu do treino (Esc, polegar para baixo)
    refreshBar(); showCursor();
  };
  // treino de runas: escolher a runa, desenhar, ver acerto/erro, nota e tempo; sem mana nem turno
  const tui = new RuneTrainerUi(RUNE_IDS, SPELLS);
  let practiceRune = 'circulo';
  tui.onRune = rune => commands.emit('rune.practice', { source: 'mouse', rune });
  tui.onCommand = cmd => commands.emit(cmd, { source: 'mouse' });
  caster.onPractice = res => tui.update(trainer, caster.difficulty, res);

  // ---------- guerreiro: gestos, golpes, interface ----------
  const moveMarkers = new TargetMarkers(board);
  const wfx = new WarriorFx(engine, fx, spellFx);
  const gestures = new WarriorGestures();
  const wui = new WarriorUi(ABILITIES);
  const wctl = new WarriorController({
    combat, unit: warriorUnit, warrior, anim: wAnim, board, markers: moveMarkers, wfx, engine,
    sfx: name => sfx.play(name),
    onChange: s => { hud.setText('statWarrior', WARRIOR_STATES[s]); refreshBar(); },
    // Onda de Choque empurra (o boneco pula para a casa nova); Investida dá um tranco no alvo
    onPush: (unit, tile) => { const v = views.get(unit); if (!v) return; if (tile && v.hopTo) v.hopTo(tile); else if (v.dummy) v.dummy.shake = 1.4; },
    onUsed: ab => wui.flash(ab.id),
  });
  gestures.setEnabled(ABILITIES.filter(a => a.ready).map(a => a.id)); // só as habilidades prontas
  // telecinese do guerreiro: a mesma do mago (src/gameplay/Telekinesis.js), com o peso da armadura e as regras
  // de movimento dele (pousa só nas casas que alcança neste turno; o pouso gasta o movimento)
  const wtk = new Telekinesis({
    body: warrior, board, fx, scene: engine.scene, tile: warriorTile, name: 'o guerreiro',
    feel: { hover: 0.6, follow: 8.5, lift: 4.2, drop: 8, bob: 0.035, bobRate: 1.6, lean: 0.11, swing: 1, landTime: 0.62, grabTime: 0.2 },
    controlsYaw: 'flight', idleGlow: false,
    tileOf: () => warriorUnit.tile,
    isFree: tile => wctl.canLand(tile),
    isBlocked: tile => !!tile && !combat.isWalkable(tile, warriorUnit),
    invalidReason: tile => wctl.landReason(tile),
    canGrab: () => wctl.grabReason(),
    sfx: name => sfx.play(name),
    onState: s => {
      if (s === 'grabbed' || wtk.flying) wctl.carry(true);
      // terminou o pouso: o gesto recomeça do zero. (Só nessa hora: o ponteiro passando por cima do guerreiro
      // também muda o estado para 'selecionado'/'parado' e não pode apagar um golpe no meio do movimento.)
      else if ((s === 'idle' || s === 'selected') && wctl.state === 'carried') { wctl.carry(false); gestures.reset(); }
    },
    onMessage: text => { hud.toast(text, 3200); wctl.say(text, 'warn'); },
    onLand: (to, from) => { wctl.landed(to, from); engine.shake(0.03, 0.22); refreshBar(); },
  });
  wctl.tk = wtk;
  const tks = new TelekinesisGroup([tk, wtk]); // uma mão, dois personagens: o ponteiro decide qual

  gestures.onGesture = r => wctl.use(r.id, { source: 'mão', confidence: r.confidence, dir: r.dir });
  gestures.onReject = r => wctl.say(`Gesto não reconhecido: ${r.reason}.`, 'err');
  let gestureMs = 0, meterAt = 0;

  // Quem o jogador controla agora: 'mago' (runas e telecinese) ou 'guerreiro' (golpes e caminhada).
  let active = 'mago';
  function setActive(who, { force = false } = {}) {
    if (who === active) { if (who === 'guerreiro') wctl.select(); return true; }
    if (!force && (caster.busy || tks.busy || wctl.busy)) { hud.toast('Termine o que está fazendo antes de trocar de personagem.'); return false; }
    active = who;
    if (who === 'guerreiro') { tk.pointerLeave(); wctl.select(); }
    else { wctl.deselect(); gestures.reset(); }
    ui.bar.hidden = who !== 'mago';
    wui.setActive(who);
    hud.setText('statActive', who === 'mago' ? 'Mago' : 'Guerreiro');
    refreshBar();
    return true;
  }
  wui.onParty = who => setActive(who);
  wui.onAbility = id => commands.emit('warrior.use', { source: 'mouse', id });
  wui.onCommand = cmd => commands.emit(cmd, { source: 'mouse' });

  const flow = new TurnFlow({
    combat, views,
    waitFor: () => wctl.reacting, // o turno dos inimigos espera a resposta do contra-ataque
    onPhase: phase => {
      wctl.refreshReach(); // turno novo: movimento de volta (no turno dos inimigos, nada)
      refreshBar();
      hud.setText('statTurn', phase === 'player' ? `jogador · rodada ${combat.round}` : 'inimigos');
      if (phase === 'player') { hud.toast(`Rodada ${combat.round}: seu turno. Mana ${mageUnit.mana}/${mageUnit.maxMana}.`, 2600); sfx.play('turn'); }
    },
    onMessage: text => hud.toast(text, 2400),
  });

  // eventos do combate -> figuras na cena e interface
  combat.on('damage', e => { const v = views.get(e.target); if (v) v.onDamage(e); refreshBar(); });
  for (const ev of ['statusAdd', 'statusRemove', 'statusRefresh']) combat.on(ev, e => { const v = views.get(e.unit); if (v) v.refreshStatus(); });
  // Contra-ataque: o combate aparou um ataque corpo a corpo no guerreiro; ele responde
  combat.on('parry', e => { if (e.target === warriorUnit) wctl.onParry(e); });
  combat.on('death', ({ unit }) => {
    const v = views.get(unit);
    if (v) v.onDeath();
    if (unit === mageUnit) hud.toast('O mago caiu! Na arena de treino, ele se recompõe em instantes.', 3200);
    if (unit.training) timers.after(combat.config.reviveSeconds, () => combat.revive(unit));
  });
  combat.on('revive', ({ unit }) => { const v = views.get(unit); if (v) v.onRevive(); refreshBar(); });
  combat.on('mana', () => refreshBar());

  // muralhas e paredes de chamas na cena: nascem, apanham e somem com os obstáculos e perigos do combate
  let fieldAt = 0, fieldK = 0;
  const stagger = () => { const now = performance.now(); fieldK = now - fieldAt < 300 ? fieldK + 1 : 0; fieldAt = now; return fieldK * 0.09; };
  combat.on('obstacleAdd', ({ obstacle: o }) => {
    const [x, z] = board.tileCenter(o.tile.col, o.tile.row), me = mageUnit.tile;
    spellFx.earth.raiseWall(o, x, z, Math.abs(o.tile.col - me.col) >= Math.abs(o.tile.row - me.row), stagger());
  });
  combat.on('obstacleDamage', ({ obstacle: o }) => spellFx.earth.hitWall(o));
  combat.on('obstacleRemove', ({ obstacle: o, reason }) => {
    spellFx.earth.endWall(o, reason);
    if (reason === 'destruido') hud.toast('Um bloco da muralha desmoronou.', 2000);
  });
  combat.on('hazardAdd', ({ hazard: h }) => { const [x, z] = board.tileCenter(h.tile.col, h.tile.row); spellFx.fireWall.ignite(h, x, z, stagger()); });
  combat.on('hazardRemove', ({ hazard: h }) => spellFx.fireWall.extinguish(h));
  combat.on('statusResisted', ({ unit, id }) => { if (views.get(unit) && unit.team !== 'player') hud.toast(`${unit.name} resistiu (${id === 'atordoado' ? 'não ficou atordoado' : id === 'derrubado' ? 'não caiu' : id}).`, 1800); });
  combat.on('cooldowns', () => refreshBar());
  combat.on('cast', () => refreshBar());

  let barAt = 0;
  function refreshBar() {
    ui.updateBar(combat, caster.spellStates(), caster.spell && caster.spell.id, combat.castsLeft);
    wui.updateBar(combat, warriorUnit, ABILITIES.map(a => ({ ...canUse(combat, warriorUnit, a, { training: wctl.training }), cooldown: combat.cooldowns[a.id] || 0 })), wctl.training);
    wui.updateParty({ mago: mageUnit, guerreiro: warriorUnit });
    barAt = 0;
  }
  ui.onSlot = i => { if (caster.state === 'idle' || caster.state === 'wheel' || caster.state === 'drawing') caster.choose(i); };
  ui.onSector = i => caster.choose(i);
  ui.onCommand = cmd => commands.emit(cmd, { source: 'mouse' });
  combat.start();
  refreshBar();

  // ---------- fontes de comando: teclado, mouse e mão ----------
  keyboardSource(commands, {
    q: 'camera.rotateLeft', e: 'camera.rotateRight', r: 'camera.reset', f: 'mage.focus',
    '+': 'camera.zoomIn', '=': 'camera.zoomIn', '-': 'camera.zoomOut',
    k: 'rig.toggle', p: 'rig.nextPose', v: 'cloth.toggle', t: 'dummy.testHit', g: 'mage.export', h: 'ui.togglePanel',
    c: 'hand.camera', escape: 'action.cancel', backspace: 'action.cancel',
    m: 'spell.open', enter: 'spell.confirm', n: 'turn.end', d: 'rune.debug', l: 'gfx.quality', u: 'combat.restore', i: 'rune.guided', o: 'rune.trainer',
    tab: 'party.toggle', y: 'warrior.training', x: 'vision.diag',
    1: 'spell.pick', 2: 'spell.pick', 3: 'spell.pick', 4: 'spell.pick', 5: 'spell.pick', 6: 'spell.pick', 7: 'spell.pick', 8: 'spell.pick',
  });
  pointerSource(commands, engine.labels.domElement);

  let lastRelease = -1e9; // quando a mão soltou o mago: a mão aberta logo depois não abre a roda
  // contexto de interação: um lugar só decide o que a mão pode fazer agora (src/input/InteractionContext.js)
  const vision = { calibrating: false, calibratingRune: false, evaluating: false }; // ligados pela calibração e pela avaliação
  const ix = new InteractionContext(() => ({
    ...vision, holding: tks.holding, flying: !!tks.flying && !tks.holding, caster: { state: caster.state, mode: caster.mode },
    active, warrior: { state: wctl.state }, enemyTurn: combat.phase !== 'player' || flow.busy, training: wctl.training,
  }));
  const spellName = () => (SPELLS[ui.highlighted] || caster.spell || {}).name || 'magia';
  const HOLD_LABELS = { Thumb_Up: 'Encerrar turno', Victory: 'Painel', Open_Palm: 'Abrir magias' };
  const hand = new HandInput(commands, {
    video: document.getElementById('camVideo'),
    isHolding: () => tks.holding,
    gestureCommands: { Thumb_Down: 'action.cancel', Thumb_Up: 'turn.end', Victory: 'ui.togglePanel', Open_Palm: 'spell.open', Closed_Fist: 'spell.confirm' },
    // '' = o gesto vale agora; texto = por que não vale; ' ' = não vale e não precisa explicar
    gestureState: g => {
      if (!ix.allowsGesture(g)) return ' '; // este gesto não faz nada neste contexto
      const enemyTurn = combat.phase !== 'player' || flow.busy;
      // com o guerreiro, a mão aberta, o punho e os dois dedos são dos golpes dele (não dos comandos do mago)
      if (active === 'guerreiro') {
        if (g === 'Thumb_Up') return wctl.busy || tks.busy ? ' ' : enemyTurn ? 'turno dos inimigos' : '';
        return g === 'Victory' ? ' ' : ' ';
      }
      if (g === 'Victory') return caster.drawing ? ' ' : '';
      if (g === 'Thumb_Up') return caster.busy || tks.busy ? ' ' : enemyTurn ? 'turno dos inimigos' : '';
      if (g === 'Thumb_Down') {
        if (caster.busy) return caster.state === 'casting' ? ' ' : '';
        return tks.busy ? ' ' : history.length ? '' : 'nada para voltar';
      }
      if (g === 'Open_Palm') {
        if (caster.busy || tks.busy || performance.now() - lastRelease < 1000) return ' ';
        return enemyTurn ? 'turno dos inimigos' : '';
      }
      if (g === 'Closed_Fist') {
        if (caster.state === 'wheel') { const st = caster.spellStates()[ui.highlighted]; return !st ? ' ' : st.ok ? '' : st.reason; }
        if (caster.state === 'targeting') return caster.locked || (caster.hover && caster.hover.valid) ? '' : 'trave um alvo com a pinça';
        return ' ';
      }
      return ' ';
    },
    sfx: name => sfx.play(name),
  });
  const handView = new HandView(hand, commands, {
    holdLabel: g => {
      if (g === 'Thumb_Down') return caster.busy ? 'Voltar uma etapa' : tks.holding ? 'Cancelar' : 'Voltar o último movimento';
      if (g === 'Closed_Fist') return caster.state === 'wheel' ? `Escolher ${spellName()}` : `Lançar ${spellName()}`;
      return HOLD_LABELS[g] || '';
    },
    hint: kind => {
      if (active === 'guerreiro' || wtk.busy) {
        if (wtk.holding) return 'leve até uma casa verde e abra os dedos';
        if (wtk.busy) return 'pousando…';
        if (wctl.state === 'walking') return 'andando…';
        if (wctl.state === 'acting' || wctl.state === 'recovering') return 'golpe!';
        if (wtk.state === 'selected') return 'feche a pinça para levantar o guerreiro';
        return 'espada ↔ corte · punho ↓ devastador · punho ↑ investida · palma ou V (segure) guarda ou contra · círculo: onda';
      }
      if (caster.state === 'wheel') return 'aponte para uma magia e feche o punho';
      if (caster.state === 'drawing') return caster.guided ? 'passe o indicador por cima da runa' : 'aponte o indicador e desenhe a runa';
      if (caster.state === 'targeting') return caster.locked ? 'feche o punho para lançar, ou a pinça em outro alvo' : 'aponte um inimigo e feche a pinça';
      if (caster.state === 'casting' || caster.state === 'recognized') return 'conjurando…';
      if (combat.phase !== 'player' || flow.busy) return 'turno dos inimigos…';
      if (kind === 'pressed') return tk.holding ? 'leve até uma casa livre e abra os dedos' : 'pinça fechada fora do mago';
      if (wtk.state === 'selected') return 'feche a pinça para levantar o guerreiro';
      return tk.state === 'selected' ? 'feche a pinça para pegar o mago' : 'aponte para o mago, ou abra a mão para as magias';
    },
    penMode: () => caster.drawing,
    penLabel: () => (caster.guided ? (caster.guideTip && caster.guideTip.snapped ? 'Seguindo a runa' : 'Leve o dedo até a runa') : ''),
  });
  handView.onMessage = text => hud.toast(text, 3200);

  // ---------- Runa Vision 2.0: calibração do jogador, diagnóstico e avaliação com a webcam ----------
  // perfil do jogador: a pinça e o alcance o HandInput já aplicou; a caneta das runas é daqui
  const applyPenProfile = p => { if (p && p.pen) caster.tracker.config = { ...caster.tracker.config, penOn: p.pen.on, penOff: p.pen.off }; };
  applyPenProfile(hand.profile);
  const quietGame = () => { // calibrando ou avaliando: nada de magia ou personagem pela metade
    if (caster.busy) caster.close();
    tui.show(false);
    tks.cancel();
  };
  const wizard = new CalibrationWizard(hand, {
    onStart: () => { quietGame(); vision.calibrating = true; },
    onEnd: () => { vision.calibrating = false; vision.calibratingRune = false; },
    // passo 5: um círculo no traçado guiado (Fácil), pelo treino de runas, sem contar nas estatísticas do treino
    runeStep: done => {
      vision.calibrating = false; vision.calibratingRune = true;
      if (active !== 'mago') setActive('mago', { force: true });
      const prev = { diff: caster.difficulty.id, trainer: caster.trainer, onPractice: caster.onPractice };
      let finished = false;
      const finish = res => {
        if (finished) return;
        finished = true;
        caster.onPractice = prev.onPractice; caster.trainer = prev.trainer;
        if (caster.mode === 'practice') caster.close();
        caster.setDifficulty(prev.diff);
        vision.calibratingRune = false; vision.calibrating = true;
        if (res) done(res);
      };
      caster.setDifficulty('facil'); caster.trainer = null;
      caster.onPractice = ({ item, accuracy }) => timers.after(0.6, () => finish({ ok: item.ok, ms: item.ms, accuracy }));
      caster.practice('circulo');
      timers.after(30, () => finish({ ok: false, ms: 0 }));
      return () => finish(null); // cancelar (pular o passo ou fechar a calibração)
    },
    onSave: profile => {
      hand.applyProfile(profile);
      applyPenProfile(profile);
      if (profile.sugestao && profile.sugestao !== caster.difficulty.id) timers.after(3.6, () => hud.toast(`Sugestão: dificuldade das runas ${profile.sugestao === 'normal' ? 'Normal' : 'Fácil'} (painel › Configurações).`, 4200));
    },
    toast: text => hud.toast(text, 3600),
  });
  const evalMode = new VisionEval(hand, commands, {
    onStart: () => { quietGame(); vision.evaluating = true; },
    onEnd: () => { vision.evaluating = false; },
    toast: text => hud.toast(text, 3600),
  });
  const diag = new VisionDiagnostics(hand, () => ({ hud, ix, caster, openEval: () => commands.emit('vision.eval', { source: 'mouse' }) }));
  commands.on('vision.calibrate', () => { if (wizard.open) return; if (evalMode.open) evalMode.close(); wizard.start(); });
  commands.on('vision.diag', () => { const on = diag.toggle(); hud.setPressed('vision.diag', on); });
  commands.on('vision.eval', () => { if (evalMode.open) return; if (wizard.open) wizard.close(''); evalMode.start(hand.cursorMode); });
  commands.on('vision.resetProfile', () => { hand.clearProfile(); caster.tracker.config = { ...caster.tracker.config, penOn: 0.55, penOff: 0.32 }; hud.toast('Calibração apagada: o jogo volta aos limites padrão (o alcance fica o último calibrado).', 3600); });
  for (const b of document.querySelectorAll('.cam-tools [data-cmd]')) b.addEventListener('click', () => commands.emit(b.dataset.cmd, { source: 'mouse' }));

  commands.on('hand.camera', async () => {
    if (hand.cameraOn) { hand.stop(); handView.refresh(true); hud.setCamera(false); return; }
    handView.card.classList.remove('mini');
    const ok = await hand.start();
    handView.refresh();
    if (!ok) return;
    hud.setCamera(true);
    hud.toast('Câmera ligada. Aponte com o indicador e feche a pinça em cima do mago. Abra a mão para as magias.', 3600);
  });
  commands.on('hand.calibrate', () => hand.startCalibration());

  // ---------- câmera do jogo ----------
  commands.on('camera.rotateLeft', () => engine.rotateBy(-Math.PI / 4));
  commands.on('camera.rotateRight', () => engine.rotateBy(Math.PI / 4));
  commands.on('camera.zoomIn', () => engine.zoomBy(0.85));
  commands.on('camera.zoomOut', () => engine.zoomBy(1 / 0.85));
  commands.on('camera.reset', () => engine.resetView());
  commands.on('mage.focus', () => {
    const p = mage.object.position.clone().add(new THREE.Vector3(0, 0.95, 0));
    engine.focusOn(p, 5.2);
  });

  // ---------- rig e tecido ----------
  let skeletonOn = false;
  commands.on('rig.toggle', () => { skeletonOn = !skeletonOn; mage.showSkeleton(skeletonOn); hud.setPressed('rig.toggle', skeletonOn); });
  commands.on('rig.nextPose', () => hud.setPose(mage.nextTestPose()));
  commands.on('cloth.toggle', () => { mage.wind = !mage.wind; hud.setPressed('cloth.toggle', mage.wind); });

  // dano de teste num boneco sorteado (passa pelo combate, como qualquer golpe)
  const kinds = ['fogo', 'gelo', 'raio', 'arcano'];
  let testHits = 0;
  commands.on('dummy.testHit', () => {
    const alive = combat.units.filter(u => u.alive && u.team !== 'player');
    if (!alive.length) return;
    const u = alive[Math.floor(Math.random() * alive.length)];
    combat.damage(u, 8 + Math.floor(Math.random() * 18), kinds[Math.floor(Math.random() * kinds.length)], { key: `teste:${++testHits}`, ignoreDefense: true });
  });

  commands.on('mage.export', async () => {
    if (tk.busy) { hud.toast('Pouse o mago antes de exportar.'); return; }
    hud.toast('Gerando mago.glb…');
    const bytes = await downloadGLB(mage.root, 'mago.glb');
    hud.toast(`mago.glb baixado (${(bytes / 1024 / 1024).toFixed(1)} MB)`);
  });
  commands.on('ui.togglePanel', () => hud.togglePanel());
  commands.on('warrior.export', async () => {
    if (wctl.busy) { hud.toast('Espere o guerreiro parar antes de exportar.'); return; }
    hud.toast('Gerando guerreiro.glb…');
    const bytes = await downloadGLB(warrior.root, 'guerreiro.glb');
    hud.toast(`guerreiro.glb baixado (${(bytes / 1024 / 1024).toFixed(1)} MB)`);
  });

  // ---------- magias e turnos ----------
  commands.on('spell.open', () => { if (active !== 'mago' && !setActive('mago')) return; caster.open(); });
  commands.on('spell.confirm', () => caster.confirm());
  commands.on('spell.pick', p => {
    if (active === 'guerreiro') { const a = ABILITIES.find(x => x.key === String(p.key)); if (a) commands.emit('warrior.use', { source: 'teclado', id: a.id }); return; }
    if (caster.state === 'idle' || caster.state === 'wheel' || caster.state === 'drawing') caster.choose(Number(p.key) - 1);
  });
  commands.on('warrior.use', p => { if (active !== 'guerreiro' && !setActive('guerreiro')) return; wctl.use(p.id, { source: p.source === 'mouse' ? 'clique' : p.source }); });
  commands.on('party.toggle', () => setActive(active === 'mago' ? 'guerreiro' : 'mago'));
  commands.on('warrior.training', () => {
    wctl.training = !wctl.training;
    wctl.refreshReach();
    refreshBar();
    hud.toast(wctl.training ? 'Treino do guerreiro: os golpes não gastam energia, ação nem recarga, e valem sem alvo.' : 'Treino desligado.', 3000);
  });
  // quadros da mão: só chegam ao reconhecedor do guerreiro com ele selecionado e parado, e sem a pinça fechada
  // (levando alguém pela telecinese, ou clicando numa casa, a mão não está golpeando)
  commands.on('hand.frame', f => {
    if (!ix.allowsWarrior() || !wctl.acceptsGestures || hand.hand.pressed || tks.busy) { if (gestures.history.length) gestures.reset(); return; }
    const t0 = performance.now();
    gestures.frame(f);
    gestureMs = gestureMs * 0.9 + (performance.now() - t0) * 0.1;
  });
  commands.on('hand.lost', () => gestures.lost());
  commands.on('turn.end', p => {
    if (caster.busy) { hud.toast(caster.mode === 'practice' ? 'Feche o treino de runas (Esc) antes de encerrar o turno.' : 'Termine ou cancele a magia antes de encerrar o turno.'); return; }
    if (wctl.busy) { hud.toast('Espere o guerreiro terminar.'); return; }
    if (tks.busy) { hud.toast(`Pouse ${tks.flying ? tks.flying.name : 'o personagem'} antes de encerrar o turno.`); return; }
    if (!flow.endPlayerTurn()) return;
    if (p.source === 'hand') engine.resetView(); // o polegar para cima também mostra o tabuleiro inteiro, como antes
    hud.toast('Turno encerrado. Os inimigos agem…', 2000);
    sfx.play('turn');
  });
  // tecla I: no Normal, troca entre a runa guiada e o desenho livre (no Fácil é sempre guiada; no Avançado, sempre livre)
  commands.on('rune.guided', () => {
    const d = caster.difficulty;
    if (d.guided !== 'opcional') {
      hud.toast(d.guided === 'sempre' ? 'No Fácil a runa é sempre guiada. Para desenhar livre, mude a dificuldade para Normal ou Avançado (Configurações, no painel).' : 'No Avançado o desenho é sempre livre. Para o trilho, mude a dificuldade para Fácil ou Normal (Configurações, no painel).', 4200);
      return;
    }
    const on = caster.toggleGuided();
    try { localStorage.setItem('runa3d.guided', on ? '1' : '0'); } catch { /* só não lembra */ }
    hud.setPressed('rune.guided', on);
    hud.toast(on ? 'Trilho ligado: a runa aparece grande e o cursor gruda nela.' : 'Desenho livre: desenhe a runa de cabeça.', 2800);
  });
  // dificuldade das runas (Configurações, no painel)
  const showDifficulty = () => {
    const d = caster.difficulty;
    for (const b of document.querySelectorAll('[data-cmd="rune.difficulty"]')) b.setAttribute('aria-pressed', String(b.dataset.value === d.id));
    hud.setText('diffHelp', `${d.name}: ${d.summary}.`);
    hud.setPressed('rune.guided', caster.guided);
    if (tui.open) tui.update(trainer, d);
  };
  commands.on('rune.difficulty', p => {
    if (!DIFFICULTIES[p.value]) return;
    const d = caster.setDifficulty(p.value);
    saveDifficulty(d.id);
    showDifficulty();
    hud.toast(`Dificuldade das runas: ${d.name} (${d.summary}).`, 3200);
  });
  // treino de runas (tecla O): abre com a última runa treinada; fechar volta ao jogo
  const openTrainer = rune => {
    if (caster.busy && caster.mode !== 'practice') { hud.toast('Termine ou cancele a magia antes de treinar.'); return false; }
    if (active !== 'mago' && !setActive('mago')) return false; // o treino é das runas do mago (os gestos do guerreiro ficam de fora)
    if (!caster.practice(rune)) return false;
    practiceRune = rune;
    tui.show(true);
    tui.setCurrent(rune);
    tui.update(trainer, caster.difficulty);
    return true;
  };
  commands.on('rune.trainer', () => {
    if (tui.open) { if (caster.mode === 'practice') caster.close(); tui.show(false); return; }
    if (openTrainer(practiceRune)) hud.toast('Treino de runas: escolha uma runa à esquerda e desenhe. Não gasta mana nem turno. Esc fecha.', 3600);
  });
  commands.on('rune.practice', p => openTrainer(p.rune));
  commands.on('rune.practiceExport', () => {
    const blob = new Blob([trainer.export()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `treino-runas-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    hud.toast(`Resultados exportados (${trainer.attempts.length} tentativas).`);
  });
  commands.on('rune.practiceReset', () => { trainer.reset(); tui.update(trainer, caster.difficulty); hud.toast('Estatísticas do treino zeradas.'); });
  commands.on('rune.debug', () => { const on = ui.toggleDebug(); hud.setPressed('rune.debug', on); if (on) ui.drawDebug(caster.attempt); });
  const autoQuality = new AutoQuality(engine, g => {
    hud.setText('gfxName', g.label);
    hud.toast(`O jogo estava lento: baixei a qualidade gráfica para ${g.label}. Para escolher na mão, tecla L.`, 4200);
  });
  commands.on('gfx.quality', () => {
    autoQuality.enabled = false; // escolha manual manda
    const g = cycleGfx(engine);
    hud.setText('gfxName', g.label);
    hud.toast(`Qualidade gráfica: ${g.label}.${g.lights !== g.bootLights ? ' O número de luzes muda ao recarregar a página.' : ''}`, 3000);
  });
  commands.on('combat.restore', () => {
    combat.restoreResources();
    Object.assign(warriorUnit, { energy: warriorUnit.maxEnergy, actionsLeft: warriorUnit.maxActions, movesLeft: warriorUnit.move });
    wctl.refreshReach();
    refreshBar();
    hud.toast('Mana, energia, movimento e recargas restaurados (modo de treino).');
  });
  commands.on('combat.enemies', () => { flow.enemiesAct = !flow.enemiesAct; hud.setPressed('combat.enemies', flow.enemiesAct); hud.toast(flow.enemiesAct ? 'Os autômatos voltam a andar e atacar.' : 'Os autômatos ficam parados (só os efeitos agem).'); });
  hud.setText('gfxName', GFX.label);
  showDifficulty();
  hud.setText('statSpell', CASTER_STATES.idle);
  hud.setText('statTurn', `jogador · rodada ${combat.round}`);

  // caneta da mão: só vale durante o desenho da runa (e na runa de teste da calibração)
  commands.on('pen.move', p => { if (p.source === 'hand' && !ix.allowsPen()) return; caster.penSample(p); });
  commands.on('pen.lost', p => caster.penLost(p.t));

  // ---------- ponteiro: casa sob o cursor, telecinese e conjuração ----------
  const ray = new THREE.Raycaster(), floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  // unitTile: a casa da unidade cujo corpo o raio atravessa (apontar o boneco, não o chão atrás dele)
  const capA = new THREE.Vector3(), capB = new THREE.Vector3(), onRay = new THREE.Vector3();
  const unitUnder = r => {
    let best = null, bestD = Infinity;
    for (const [u, v] of views) {
      if (u === mageUnit || !u.tile || !v.object) continue;
      const p = v.object.position;
      capA.set(p.x, 0.15, p.z); capB.set(p.x, 1.62, p.z);
      if (r.distanceSqToSegment(capA, capB, onRay) > 0.3 * 0.3) continue;
      const d = onRay.distanceTo(r.origin);
      if (d < bestD) { bestD = d; best = u; }
    }
    return best ? { ...best.tile } : null;
  };
  const pick = ({ x, y }) => {
    ray.setFromCamera({ x, y }, engine.camera);
    const hit = new THREE.Vector3();
    const onFloor = ray.ray.intersectPlane(floor, hit);
    return { ray: ray.ray.clone(), floor: onFloor ? hit : null, tile: onFloor ? board.tileAt(hit.x, hit.z) : null, unitTile: unitUnder(ray.ray) };
  };
  const stage = document.getElementById('stage');
  function showCursor() {
    stage.classList.toggle('can-grab', (tk.state === 'selected' || wtk.state === 'selected') && !caster.busy);
    stage.classList.toggle('grabbing', tks.holding);
    stage.classList.toggle('casting', caster.busy);
    stage.classList.toggle('drawing', caster.drawing);
  }
  // durante a conjuração, o ponteiro é da magia (roda, desenho, alvo); fora dela, da telecinese
  commands.on('pointer.move', p => {
    const k = pick(p);
    hud.setTile(k.tile);
    hud.setInput(p.source === 'hand' ? 'mão' : 'mouse');
    if (caster.capturesPointer) { board.setHover(null); caster.pointerMove(p, k); return; }
    wctl.pointerMove(k);
    tks.pointerMove(k);
    // com alguém no ar quem mostra a casa é o marcador de destino; com o ponteiro num personagem, acende a casa dele;
    // com o guerreiro selecionado, quem mostra as casas são os marcadores de caminhada
    const over = tks.hovered && tks.hovered.state === 'selected' ? tks.hovered : null;
    board.setHover(tks.busy || wctl.selected ? null : over ? over.tile : k.tile);
    showCursor();
  });
  commands.on('pointer.down', p => {
    // a pinça só vira clique onde faz sentido (desenhando a runa, calibrando ou com alguém pousando, não)
    if (p.source === 'hand' && !ix.allowsPinch()) return;
    if (caster.capturesPointer) { caster.pointerDown(p, pick(p)); return; }
    if ((combat.phase !== 'player' || flow.busy) && !wctl.training) { if (tk.state === 'selected' || wtk.state === 'selected') hud.toast('Espere o turno dos inimigos terminar.'); return; }
    const k = pick(p);
    // pinça (ou botão) num personagem: a telecinese pega ele, e ele passa a ser o personagem ativo
    const got = tks.pointerDown(k);
    if (got) {
      if (got.grabbed) setActive(got.tk === wtk ? 'guerreiro' : 'mago', { force: true });
      showCursor();
      return;
    }
    // com o guerreiro selecionado, pinça (ou clique) numa casa verde: ele anda até lá
    if (active === 'guerreiro') wctl.pointerDown(k);
    showCursor();
  });
  commands.on('pointer.up', p => {
    if (caster.capturesPointer) { caster.pointerUp(p); return; }
    const wasHolding = tks.holding;
    tks.pointerUp(pick(p)); showCursor();
    if (wasHolding && p.source === 'hand') lastRelease = performance.now();
  });
  commands.on('pointer.cancel', p => {
    if (caster.capturesPointer) { caster.pointerUp(p); return; }
    tks.cancel(h => (p.source === 'hand' ? `A mão saiu da câmera: ${h.name} voltou para ${tileName(h.origin)}.` : ''));
    showCursor();
  });
  commands.on('pointer.leave', () => { board.setHover(null); hud.setTile(null); tks.pointerLeave(); wctl.pointerLeave(); showCursor(); });

  // Esc / polegar para baixo: na conjuração, volta uma etapa; com o mago no ar, cancela; no chão, desfaz o último movimento
  commands.on('action.cancel', () => {
    if (wizard.open) { wizard.action('cancel'); return; }
    if (evalMode.open) { evalMode.action(evalMode.run ? 'stop' : 'close'); return; }
    if (caster.busy) { caster.back(); return; }
    if (tks.holding) { tks.cancel(); return; } // no ar: volta para a casa de origem (mago ou guerreiro)
    if (active === 'guerreiro') return; // o "voltar o último movimento" é do mago
    if (tk.busy) return;
    if (combat.phase !== 'player' || flow.busy) return;
    const back = history.pop();
    if (!back) { hud.toast('Nada para voltar.'); return; }
    if (!combat.isWalkable(back, mageUnit)) { history.push(back); hud.toast(`A casa ${tileName(back)} está ocupada.`); return; }
    tk.flyTo(back, { undo: true });
  });

  engine.onUpdate((dt, t) => {
    const now = performance.now();
    ix.update(now);
    if (engine.realDt !== undefined) autoQuality.update(engine.realDt);
    timers.update(dt);
    flow.update(dt);
    tk.update(dt, t);
    wtk.update(dt, t);
    anim.update(dt, t);
    mage.update(dt, t);
    caster.update(dt, now);
    wctl.update(dt);
    wAnim.update(dt, t);
    warrior.update(dt, t);
    wfx.update(dt);
    moveMarkers.update(dt, t);
    if ((meterAt += dt) > 0.1 && active === 'guerreiro') {
      meterAt = 0;
      wui.updateMeter({ state: WARRIOR_STATES[wctl.state] + (wctl.training ? ' · treino' : ''), live: gestures.live, feedback: wctl.feedback, handOn: hand.on && hand.hand.visible,
        stats: hand.on ? `leitura da mão ${hand.hand.inferMs.toFixed(1)} ms · reconhecimento ${gestureMs.toFixed(2)} ms · ${Math.round(hud.fps)} quadros/s` : `${Math.round(hud.fps)} quadros/s` });
    }
    arena.update(dt, t);
    fx.update(dt);
    spellFx.update(dt);
    markers.update(dt, t);
    for (const v of views.values()) v.update(dt, t);
    hud.update(dt);
    handView.update();
    runeCanvas.update(dt);
    diag.update(now);
    evalMode.update(now);
    if ((barAt += dt) > 0.25) refreshBar();
  });
  // compila os shaders de todos os efeitos agora, atrás da tela de carregamento (senão cada magia trava na 1ª vez)
  loading.textContent = 'Preparando as magias…';
  await spellFx.prewarm([markers.group, moveMarkers.group, wfx.trail, wfx.ensureComet(), ...dummies.map(d => d.frostShell)]);
  engine.start();
  loading.classList.add('done');
  setTimeout(() => loading.remove(), 800);

  // para testes e para mexer pelo console do navegador
  window.runa3d = {
    THREE, engine, arena, board, mage, dummies, commands, hud, tk, hand, handView, fx, sfx, history, pick, exportGLB, TEST_POSES,
    combat, mageUnit, views, flow, caster, tracker, recognizer, runeCanvas, ui, markers, anim, spellFx, timers, SPELLS, GFX, animSchools: { SCHOOLS }, autoQuality,
    warrior, warriorUnit, wctl, wAnim, wfx, wui, gestures, moveMarkers, ABILITIES, WARRIOR, wtk, tks,
    trainer, tui, DIFFICULTIES, ix, vision, wizard, diag, evalMode, party: { get active() { return active; }, set: setActive },
  };
  if (new URLSearchParams(location.search).has('testes')) runSelfTest(window.runa3d);
}

boot().catch(err => {
  console.error(err);
  const el = document.getElementById('loading');
  el.textContent = `Erro ao montar a cena: ${err.message}`;
  el.classList.add('error');
});
