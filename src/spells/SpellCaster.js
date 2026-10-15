// Conjuração: o fluxo de uma magia, do gesto ao impacto. Cada parte é de um módulo separado:
//   1. gestos estáticos (mão aberta, punho, polegares): src/input/HandInput.js -> comandos
//   2. rastreamento da trajetória do dedo: src/runes/RuneTracker.js
//   3. reconhecimento da runa: src/runes/RuneRecognizer.js
//   4. seleção de alvo: src/spells/spellRules.js (regras) + src/world/TargetMarkers.js (marcas no chão)
//   5. execução: src/spells/castEffects.js (animação, efeitos, impacto) + spellRules.resolveSpell (dano)
// Este arquivo só decide em que etapa estamos e para onde cada comando leva.
//
// Etapas:
//   idle -> wheel (roda aberta) -> drawing (desenhando a runa) -> recognized (runa acende)
//   -> targeting (escolher/travar o alvo) -> casting (animação e efeito) -> idle
// Voltar (polegar para baixo, Esc): targeting -> drawing -> wheel -> idle. No desenho, se já há traço,
// voltar apaga o traço primeiro (recomeçar a tentativa).
//
// Dois jeitos de desenhar a runa:
//   ímã (padrão, 'guided'): a runa aparece grande e a caneta gruda nela; basta passar por cima até acender
//     tudo (src/runes/RuneGuide.js). Com a mão, não precisa da pose de caneta: o dedo só precisa seguir o trilho.
//   livre: desenhar de cabeça; quem decide é o reconhecedor (src/runes/RuneRecognizer.js).
// A dificuldade (src/runes/difficulty.js) escolhe entre os dois e o quanto cada um exige.
//
// Treino de runas (practice): escolhe uma runa, desenha, recebe acerto ou erro com a nota e o tempo, e repete;
// não gasta mana nem turno e não lança nada. 'livre' é o teste de rabisco: qualquer runa que disparar é um
// falso disparo. O registro fica em src/runes/RunePractice.js.
import { evaluateTarget, autoTarget, rangeTiles, resolveSpell } from './spellRules.js';
import { CAST_EFFECTS } from './castEffects.js';
import { RUNES } from '../runes/runeShapes.js';
import { RuneGuide } from '../runes/RuneGuide.js';
import { diagnose } from '../runes/RuneRecognizer.js';
import { DIFFICULTIES } from '../runes/difficulty.js';
import { sameTile } from '../combat/Combat.js';

export const CASTER_STATES = { idle: 'livre', wheel: 'roda de magias', drawing: 'desenhando a runa', recognized: 'runa reconhecida', targeting: 'escolhendo o alvo', casting: 'conjurando' };

export class SpellCaster {
  constructor(deps) {
    Object.assign(this, deps); // combat, spells, tracker, recognizer, canvas, ui, markers, anim, mage, tk, board, spellFx, sfx, toast, tileCenter, unitPoint
    this.state = 'idle';
    this.stateT = 0;
    this.spell = null;
    this.lastIndex = 0;
    this.hover = null;        // avaliação da casa sob o cursor
    this.locked = null;       // alvo travado
    this.effect = null;
    this.castSeq = 0;
    this.attempt = null;      // última tentativa de desenho (para a depuração)
    this.attempts = 0;
    this.liveAt = 0;
    this.onState = () => {};
    this.react = deps.react || (() => {}); // reação visual pedida pela magia (tremida do choque, por exemplo)
    this.difficulty = DIFFICULTIES[deps.difficulty] || DIFFICULTIES.facil;
    this.freeInNormal = !!deps.freeInNormal; // no Normal, o jogador escolheu desenhar livre (tecla I)
    this.guided = deps.guided ?? this.guidedFor(this.difficulty); // ímã nas runas
    this.recognizer.setLevel(this.difficulty.recognizer);
    this.guide = null;        // trilho da runa (modo ímã)
    this.guideTip = null;     // última amostra no trilho: { raw, snapped, down }
    this.log = [];            // histórico curto para os testes e para a depuração
    this.mode = 'play';       // 'play' (magia de verdade) ou 'practice' (treino de runas)
    this.practiceRune = null;
    this.trainer = deps.trainer || null; // registro do treino (src/runes/RunePractice.js)
    this.onPractice = () => {};          // resultado de cada tentativa do treino (para a interface)
    this.attemptT0 = null;    // quando a tentativa começou (primeira tinta), para o tempo por tentativa
    const tr = this.tracker;
    tr.onStrokeEnd = (s, why) => this.strokeEnded(why);
    tr.onDiscard = (s, why) => { if (this.state === 'drawing') this.ui.setMessage(why === 'rápido' ? 'Traço rápido demais: desenhe com calma.' : 'Traço curto: desenhe maior.', 'warn'); };
    tr.onTimeout = why => { if (this.state === 'drawing') this.recognizeNow(why === 'tempo' ? 'tempo' : 'espera'); };
    tr.onResume = () => { if (this.state === 'drawing') this.ui.setMessage('A mão voltou: o traço continua de onde parou.', 'ok'); };
    // parar com a mão no meio do desenho só termina o traço se ele já parece a runa (senão espera um pouco mais)
    tr.dwellOk = () => this.drawingLooksDone();
  }

  guidedFor(d) { return d.guided === 'sempre' ? true : d.guided === 'nunca' ? false : !this.freeInNormal; }

  // Troca a dificuldade. Desenhando, recomeça a runa no modo novo.
  setDifficulty(id) {
    const d = DIFFICULTIES[id];
    if (!d) return this.difficulty;
    this.difficulty = d;
    this.recognizer.setLevel(d.recognizer);
    this.guided = this.guidedFor(d);
    if (this.ui.setThreshold) this.ui.setThreshold(d.recognizer.minScore);
    if (this.state === 'drawing') this.startDrawing(this.spell, `Dificuldade: ${d.name}.`);
    return d;
  }

  // O desenho até aqui já é a runa pedida? (para terminar o traço numa parada da mão)
  drawingLooksDone() {
    const tr = this.tracker;
    if (this.state !== 'drawing' || !tr.current) return true;
    const live = [...tr.strokePoints, tr.current.points.map(([x, y]) => [x, y])];
    const r = this.recognizer.recognize(live);
    if (this.practiceRune === 'livre') return r.accepted || r.reason === 'diferente';
    return r.accepted && r.id === this.spell.rune;
  }

  get busy() { return this.state !== 'idle'; }
  get capturesPointer() { return this.state !== 'idle'; }
  get drawing() { return this.state === 'drawing'; }

  setState(s) {
    if (s === this.state) return;
    this.state = s;
    this.stateT = 0;
    this.log.push({ state: s, at: performance.now() });
    if (this.log.length > 40) this.log.shift();
    this.onState(s);
  }

  spellStates() {
    return this.spells.map(s => ({ ...this.combat.canCast(s), cooldown: this.combat.cooldowns[s.id] || 0 }));
  }

  // Pode abrir a roda agora? '' = pode; senão, o motivo.
  blockReason() {
    if (this.combat.phase !== 'player') return 'turno dos inimigos';
    if (this.tk.busy) return 'pouse o mago primeiro';
    if (!this.combat.player.alive) return 'o mago caiu';
    return '';
  }

  // ---------- comandos ----------
  open() {
    if (this.state === 'wheel') { this.close(); return; }
    if (this.state !== 'idle') return;
    const why = this.blockReason();
    if (why) { this.toast(`Não dá para conjurar agora: ${why}.`); this.sfx('error'); return; }
    this.tk.pointerLeave();
    this.setState('wheel');
    const states = this.spellStates();
    this.ui.openWheel(states);
    this.ui.highlight(states[this.lastIndex] && states[this.lastIndex].ok ? this.lastIndex : Math.max(0, states.findIndex(s => s.ok)), states);
    this.sfx('confirm');
  }

  close() {
    this.ui.closeWheel();
    this.ui.hideCard();
    this.canvas.reset();
    this.tracker.stop();
    this.markers.hide();
    this.spell = null; this.hover = null; this.locked = null; this.guide = null; this.guideTip = null;
    this.mode = 'play'; this.practiceRune = null;
    this.setState('idle');
  }

  // ---------- treino de runas ----------
  // Começa (ou troca) o treino de uma runa. 'livre' = teste de rabisco. Não pede turno, mana nem alvo.
  practice(runeId) {
    if (this.state === 'casting') { this.toast('Espere a magia terminar para treinar.'); return false; }
    if (runeId !== 'livre' && !RUNES[runeId]) return false;
    this.ui.closeWheel();
    this.markers.hide();
    this.locked = null; this.hover = null;
    this.mode = 'practice';
    this.practiceRune = runeId;
    const r = RUNES[runeId], el = r ? ELEMENT_OF[runeId] : 'raio';
    const spell = { id: 'treino', name: r ? `Treino: ${r.name}` : 'Treino: rabisco livre', rune: r ? runeId : null, element: el, practice: true };
    this.tk.pointerLeave();
    this.startDrawing(spell);
    return true;
  }

  // Punho fechado / Enter.
  confirm() {
    if (this.state === 'wheel') return this.choose(this.ui.highlighted);
    if (this.state === 'drawing') return this.recognizeNow('confirmar');
    if (this.state === 'targeting') return this.launch();
    return false;
  }

  // Polegar para baixo / Esc: volta uma etapa. Devolve false quando não havia o que voltar.
  back() {
    switch (this.state) {
      case 'wheel': this.close(); return true;
      case 'drawing':
        if (this.tracker.strokes.length || this.tracker.current || (this.guide && this.guide.progress > 0)) { this.restartDrawing('Traço apagado. Desenhe de novo.'); return true; }
        if (this.mode === 'practice') { this.close(); return true; }
        this.ui.hideCard(); this.canvas.reset(); this.tracker.stop();
        this.setState('wheel');
        this.ui.openWheel(this.spellStates());
        return true;
      case 'recognized': case 'targeting':
        this.markers.hide(); this.locked = null; this.hover = null;
        this.startDrawing(this.spell, 'Voltou para o desenho da runa.');
        return true;
      default: return false;
    }
  }

  // Escolhe a magia da roda (ou pelas teclas 1 a 8).
  choose(index) {
    const spell = this.spells[index];
    if (!spell) return false;
    if (this.mode === 'practice') return this.practice(spell.rune); // no treino, as teclas 1 a 8 trocam a runa
    if (this.state === 'idle') { const why = this.blockReason(); if (why) { this.toast(`Não dá para conjurar agora: ${why}.`); return false; } this.tk.pointerLeave(); }
    if (this.state !== 'idle' && this.state !== 'wheel' && this.state !== 'drawing') return false;
    const can = this.combat.canCast(spell);
    if (!can.ok) {
      this.toast(`${spell.name}: ${can.reason}.`);
      this.sfx('error');
      if (this.state === 'wheel') this.ui.highlight(index, this.spellStates());
      return false;
    }
    this.lastIndex = index;
    this.ui.closeWheel();
    this.startDrawing(spell);
    return true;
  }

  startDrawing(spell, message = '') {
    this.spell = spell;
    this.attempts = 0;
    this.attemptT0 = null;
    this.setState('drawing');
    if (spell.practice) this.ui.showPracticeCard(spell, this.difficulty); else this.ui.showCard(spell);
    this.ui.setCompact(true);
    this.canvas.reset();
    this.canvas.setElement(spell.element);
    this.guideTip = null;
    const guided = this.guided && !!spell.rune; // rabisco livre: sempre sem trilho
    if (guided) {
      this.guide = new RuneGuide(spell.rune, this.canvas.guideBox(this.difficulty.guideSize), this.difficulty.guide);
      this.canvas.showGuide(spell.rune, this.guide.railStrokes(), this.guide.snapPx);
    } else {
      this.guide = null;
      this.canvas.showGuide(spell.rune && this.difficulty.showGuide ? spell.rune : null);
    }
    this.tracker.begin(performance.now());
    this.drawingStep();
    if (message) this.ui.setMessage(message, 'info');
  }

  drawingStep() {
    if (!this.spell.rune) {
      this.ui.setStep('Desenhe <b>qualquer coisa que não seja runa</b> (rabiscos, linhas, mão passeando). Se alguma runa disparar, conta como <b>falso disparo</b>. Pare a mão para terminar cada desenho.');
      return;
    }
    const r = RUNES[this.spell.rune], d = this.difficulty;
    if (this.guided && this.guide) {
      const pct = Math.round(d.guide.complete * 100);
      this.ui.setStep(`Comece no <b>ponto que pulsa</b> e passe por cima da runa: o cursor gruda nela e cada trecho acende. Com a mão: mova o indicador sobre o trilho. Com o mouse: arraste por cima. Com <b>${pct}%</b> aceso, a runa vale.${d.guided === 'opcional' ? ' Desenho livre: tecla <b>I</b>.' : ''}`);
      return;
    }
    const two = r.multi ? ' Para o segundo traço, relaxe o dedo, mude de lugar e aponte de novo.' : '';
    const look = d.showGuide ? '' : ' (a runa está no cartão)';
    this.ui.setStep(`Desenhe <b>${r.hint}</b>${look}. Com a mão: aponte com o indicador para desenhar e pare (ou relaxe o dedo) para terminar.${two} Com o mouse: arraste com o botão esquerdo.`);
  }

  restartDrawing(message, kind = 'warn') {
    this.canvas.clearInk();
    if (this.guide) this.guide.reset();
    this.guideTip = null;
    this.attemptT0 = null;
    this.tracker.begin(performance.now());
    this.ui.setMeter(null);
    this.ui.setMessage(message, kind);
  }

  attemptMs(now = performance.now()) { const t0 = this.attemptT0 ?? this.tracker.attemptStart; return t0 ? Math.max(0, now - t0) : 0; }

  // ---------- desenho ----------
  // Amostra da caneta: { px, py, pen, t, source }.
  penSample(p) {
    if (this.state !== 'drawing') return;
    this.lastSource = p.source;
    const t = p.t ?? performance.now();
    if (this.guided && this.guide) {
      // ímã: o rastreador só suaviza a ponta do dedo; quem decide o que acende é o trilho
      this.tracker.sample({ x: p.px, y: p.py, t, pen: false, source: p.source });
      const tip = this.tracker.tip;
      const down = p.source === 'mouse' ? !!p.pen : true; // com a mão, basta o dedo seguir o trilho
      if (!down) this.guide.penUp();
      const st = this.guide.sample(tip.x, tip.y, down, t);
      if (this.attemptT0 === null && this.guide.started) this.attemptT0 = t;
      this.guideTip = { raw: { x: tip.x, y: tip.y }, snapped: st.snapped, down };
      if (st.done) this.finishGuided('completo');
      return;
    }
    this.tracker.sample({ x: p.px, y: p.py, t, pen: p.pen, source: p.source });
  }

  penLost(t = performance.now()) {
    if (this.state !== 'drawing') return;
    if (this.guide) { this.guide.pause(t); this.guideTip = null; this.ui.setMessage('Mão fora da câmera. Volte logo: o traço continua de onde parou, e o que já acendeu fica aceso.', 'warn'); return; }
    this.tracker.lost(t);
    this.ui.setMessage('Mão fora da câmera: o traço para aqui.', 'warn');
  }

  // Ímã: a runa acendeu (sozinha, ou com o punho/Enter a partir de finishEarly).
  finishGuided(why) {
    const g = this.guide, want = this.spell.rune;
    const pct = Math.round(g.progress * 100), acc = Math.round(g.accuracy * 100), ms = this.attemptMs();
    const r = { id: want, score: Math.min(1, g.progress), accepted: true, reason: 'ímã', ranking: [{ id: want, score: Math.min(1, g.progress) }], strokes: g.strokes.length, margin: 1 };
    this.attempt = { strokes: g.litStrokes(), raw: [], result: r, expected: want, ms: 0, why, bridges: g.bridges };
    this.ui.drawDebug(this.attempt);
    this.ui.setMeter(r.score, `runa traçada: ${pct}% · precisão ${acc}%`);
    this.ui.setMessage(`${RUNES[want].name} completo!`, 'ok');
    this.canvas.setMagnet(null);
    this.canvas.success(g.railStrokes(), want);
    this.tracker.stop();
    this.guide = null; this.guideTip = null;
    this.sfx('rune');
    if (this.mode === 'practice') this.practiceResult({ ok: true, read: want, score: r.score, ms, accuracy: g.accuracy });
    this.setState('recognized');
    return true;
  }

  // Liga e desliga o ímã (só no Normal: no Fácil o trilho é sempre ligado; no Avançado, nunca).
  // Desenhando, recomeça a runa no modo novo. Devolve o modo atual.
  toggleGuided() {
    if (this.difficulty.guided !== 'opcional') return this.guided;
    this.freeInNormal = !this.freeInNormal;
    this.guided = !this.freeInNormal;
    if (this.state === 'drawing') this.startDrawing(this.spell, this.guided ? 'Ímã ligado: passe por cima da runa.' : 'Desenho livre: desenhe a runa de cabeça.');
    return this.guided;
  }

  // Treino: registra a tentativa e mostra o resultado (a próxima começa sozinha, em seguida).
  practiceResult({ ok, read = null, score = 0, ms = 0, accuracy = null }) {
    const item = this.trainer ? this.trainer.record({ rune: this.practiceRune, ok, read, score, ms, difficulty: this.difficulty.id, guided: this.guided && this.practiceRune !== 'livre', source: this.lastSource || '' }) : { rune: this.practiceRune, ok, read, score, ms };
    const st = this.trainer ? this.trainer.stats({ rune: this.practiceRune, session: true }) : null;
    this.onPractice({ item, stats: st, accuracy });
    return item;
  }

  strokeEnded(why) {
    if (this.state !== 'drawing') return;
    // a câmera perdeu a mão: o traço pode continuar se ela voltar logo (o rastreador junta); senão, a espera
    // do próximo traço termina a tentativa
    if (why === 'perdida') { this.ui.setMessage('Mão fora da câmera: volte a apontar perto de onde parou para continuar o traço.', 'warn'); return; }
    if (this.mode === 'practice' && this.practiceRune === 'livre') { this.recognizeNow(why); return; }
    const rune = RUNES[this.spell.rune];
    const strokes = this.tracker.strokePoints;
    // runa de dois traços: o primeiro sozinho pode ser só a metade
    if (rune.multi && strokes.length < rune.multi.count) {
      const r = this.recognizer.recognize(strokes);
      if (r.accepted && r.id === this.spell.rune) return this.finishAttempt(r, why);
      const part = this.recognizer.recognize(strokes.slice(-1));
      if (part.id === rune.multi.part && part.score > 0.7) {
        this.ui.setMessage(`Primeiro raio ok (${Math.round(part.score * 100)}%). Agora o segundo, ao lado.`, 'ok');
        this.sfx('press');
        return;
      }
    }
    this.recognizeNow(why);
  }

  recognizeNow(why) {
    if (this.state !== 'drawing') return false;
    if (this.guided && this.guide) {
      if (this.guide.enough) return this.finishGuided(why);
      if (why === 'confirmar') this.ui.setMessage(`Falta traçar mais um pouco: ${Math.round(this.guide.progress * 100)}% aceso${this.guide.progress >= this.guide.config.finishEarly ? ', num trecho só, sem pular' : ''}.`, 'warn');
      return false;
    }
    const t0 = performance.now();
    if (this.tracker.state === 'stroke') this.tracker.endStroke(t0, 'confirmar');
    if (this.state !== 'drawing') return true; // o fim do traço já resolveu
    const strokes = this.tracker.strokePoints;
    if (!strokes.length) { if (why === 'confirmar') this.ui.setMessage('Nada desenhado ainda.', 'warn'); return false; }
    const r = this.recognizer.recognize(strokes);
    return this.finishAttempt(r, why, performance.now() - t0);
  }

  finishAttempt(r, why, ms = 0) {
    const strokes = this.tracker.strokePoints, took = this.attemptMs();
    this.attempt = { strokes, raw: this.tracker.strokes.map(s => s.raw.map(([x, y]) => [x, y])), result: r, expected: this.spell.rune, ms, why, resumed: this.tracker.resumed };
    this.ui.drawDebug(this.attempt);
    this.attempts++;
    const want = this.spell.rune;
    // teste de rabisco: nada pode disparar
    if (this.mode === 'practice' && !want) {
      if (r.accepted) {
        this.ui.setMessage(`Falso disparo: o rabisco foi lido como ${RUNES[r.id].name.toLowerCase()} (${Math.round(r.score * 100)}%).`, 'err');
        this.canvas.success(strokes, r.id);
        this.sfx('error');
      } else {
        this.ui.setMessage(r.reason === 'curto' || r.reason === 'pequeno' ? 'Pequeno demais: nem conta como desenho.' : `Nenhuma runa disparou (o mais parecido: ${r.id ? RUNES[r.id].name.toLowerCase() : '—'}, ${Math.round(r.score * 100)}%).`, 'ok');
        this.canvas.fail(strokes);
      }
      this.tracker.stop();
      this.practiceResult({ ok: !r.accepted, read: r.accepted ? r.id : null, score: r.score, ms: took });
      this.setState('recognized');
      return !r.accepted;
    }
    const wantScore = (r.ranking.find(x => x.id === want) || { score: 0 }).score;
    if (r.accepted && r.id === want) {
      this.ui.setMeter(r.score, `runa reconhecida: ${Math.round(r.score * 100)}%`);
      this.ui.setMessage(`${RUNES[want].name} reconhecido!`, 'ok');
      this.canvas.success(strokes, want);
      this.tracker.stop();
      this.sfx('rune');
      if (this.mode === 'practice') this.practiceResult({ ok: true, read: want, score: r.score, ms: took });
      this.setState('recognized');
      return true;
    }
    const cfg = this.recognizer.config, tip = diagnose(want, r.features, r.strokes);
    const near = wantScore >= cfg.minScore - cfg.nearMiss;
    let msg;
    if (r.reason === 'curto' || r.reason === 'pequeno') msg = 'Desenho pequeno demais. Faça a runa maior, usando bem o espaço.';
    else if (r.accepted) msg = `Isso parece ${artigo(r.id)} ${RUNES[r.id].name.toLowerCase()}. ${this.mode === 'practice' ? 'O treino' : `A ${this.spell.name}`} pede ${RUNES[want].hint}.`;
    else if (r.id === want && near && r.reason !== 'diferente') msg = `Quase! ${RUNES[want].name} com ${Math.round(wantScore * 100)}%, mas ${r.reason === 'forma' ? 'com cara de rabisco' : `perto demais de ${RUNES[r.ranking[1].id].name.toLowerCase()}`}.${tip ? ` Dica: ${tip}.` : ' Tente de novo, com mais capricho.'}`;
    else if (near) msg = `Quase! ${Math.round(wantScore * 100)}% parecido com ${RUNES[want].name.toLowerCase()} (precisa de ${Math.round(cfg.minScore * 100)}%).${tip ? ` Dica: ${tip}.` : ` Tente de novo: ${RUNES[want].hint}.`}`;
    else if (r.reason === 'ambiguo') msg = `Quase: ficou entre ${RUNES[r.ranking[0].id].name.toLowerCase()} e ${RUNES[r.ranking[1].id].name.toLowerCase()}. Tente de novo, com mais capricho.`;
    else msg = `Não reconheci a runa (${Math.round(wantScore * 100)}% parecida). Tente de novo: ${RUNES[want].hint}.${tip ? ` Dica: ${tip}.` : ''}`;
    if (why === 'tempo') msg = `Tempo esgotado. ${msg}`;
    this.canvas.fail(strokes);
    this.sfx('error');
    if (this.mode === 'practice') this.practiceResult({ ok: false, read: r.accepted ? r.id : null, score: wantScore, ms: took });
    this.restartDrawing(msg, near ? 'warn' : 'err');
    this.ui.setMeter(wantScore, `${Math.round(wantScore * 100)}% parecido com ${RUNES[want].name.toLowerCase()}`);
    return false;
  }

  // ---------- alvo ----------
  enterTargeting() {
    this.setState('targeting');
    this.ui.setCompact(false);
    this.canvas.showGuide(null);
    const auto = autoTarget(this.combat, this.spell);
    this.locked = auto && auto.valid ? auto : null;
    this.hover = null;
    this.ui.setStep('Escolha o alvo: aponte para um inimigo e feche a pinça (ou clique) para travar. <b>Feche o punho</b> (ou Enter, ou clique de novo no alvo travado) para lançar.');
    this.ui.setMeter(null);
    this.refreshTarget();
    if (!this.locked) this.ui.setMessage('Nenhum alvo ao alcance. Volte (polegar para baixo ou Esc) ou escolha uma casa.', 'warn');
  }

  // Ponteiro (mouse ou cursor da mão) durante a conjuração. pick: { tile, floor }.
  pointerMove(p, pick) {
    this.lastSource = p.source;
    if (this.state === 'wheel') { const i = this.ui.sectorAt(p.px, p.py); if (i >= 0) this.ui.highlight(i, this.spellStates()); return; }
    if (this.state === 'drawing' && p.source === 'mouse') { this.penSample({ ...p, pen: this.mouseDown, t: performance.now() }); return; }
    if (this.state === 'targeting') {
      const tile = pick.unitTile || pick.tile;
      if (!sameTile(tile, this.hover && this.hover.tile)) {
        this.hover = tile ? evaluateTarget(this.combat, this.spell, tile) : null;
        this.refreshTarget();
      }
    }
  }

  pointerDown(p, pick) {
    if (this.state === 'wheel') { const i = this.ui.sectorAt(p.px, p.py); if (i >= 0) this.choose(i); return; }
    if (this.state === 'drawing') { if (p.source === 'mouse') { this.mouseDown = true; this.penSample({ ...p, pen: true, t: performance.now() }); } return; }
    if (this.state !== 'targeting') return;
    const tile = pick.unitTile || pick.tile;
    const ev = tile ? evaluateTarget(this.combat, this.spell, tile) : null;
    if (!ev || !ev.valid) { this.ui.setMessage(`Alvo inválido: ${ev ? ev.reason : 'fora do tabuleiro'}.`, 'err'); this.sfx('error'); return; }
    if (this.locked && sameTile(this.locked.tile, ev.tile)) { this.launch(); return; }
    this.locked = ev;
    this.sfx('press');
    this.refreshTarget();
  }

  pointerUp(p) {
    if (this.state === 'drawing' && p.source === 'mouse' && this.mouseDown) { this.mouseDown = false; this.penSample({ ...p, pen: false, t: performance.now() }); }
    else this.mouseDown = false;
  }

  refreshTarget() {
    const show = this.hover && this.hover.valid ? this.hover : this.locked;
    const aimTile = this.hover ? this.hover.tile : this.locked ? this.locked.tile : null;
    this.markers.show({
      element: this.spell.element, range: rangeTiles(this.combat, this.spell),
      area: show ? show.area : [], target: aimTile, valid: this.hover ? this.hover.valid : !!this.locked,
      locked: !!this.locked && (!this.hover || sameTile(this.hover.tile, this.locked.tile)),
    });
    const L = this.locked;
    const tName = t => `${'ABCDEFGH'[t.col]}${8 - t.row}`;
    let html = L ? `Alvo travado: <b>${L.unit ? L.unit.name : tName(L.tile)}</b> (${tName(L.tile)}) · atinge ${L.hits.length}` : 'Sem alvo travado';
    if (this.hover && !this.hover.valid && this.hover.tile) html += ` · <span class="bad">${tName(this.hover.tile)}: ${this.hover.reason}</span>`;
    else if (this.hover && this.hover.valid && (!L || !sameTile(this.hover.tile, L.tile))) html += ` · apontando: ${this.hover.unit ? this.hover.unit.name : tName(this.hover.tile)} (pinça para travar)`;
    this.ui.setTarget(html);
  }

  // ---------- lançamento ----------
  launch() {
    if (this.state !== 'targeting') return false;
    const target = this.locked || (this.hover && this.hover.valid ? this.hover : null);
    if (!target) { this.ui.setMessage('Trave um alvo antes de lançar.', 'warn'); this.sfx('error'); return false; }
    const ev = evaluateTarget(this.combat, this.spell, target.tile); // o tabuleiro pode ter mudado
    if (!ev.valid) { this.ui.setMessage(`Alvo inválido: ${ev.reason}.`, 'err'); this.locked = null; this.refreshTarget(); return false; }
    const can = this.combat.canCast(this.spell);
    if (!can.ok) { this.ui.setMessage(`Não dá para lançar: ${can.reason}.`, 'err'); return false; }
    const effect = CAST_EFFECTS[this.spell.id];
    if (!effect) { this.ui.setMessage('Esta magia ainda não tem efeito.', 'err'); return false; }
    const spell = this.spell, castId = `cast-${++this.castSeq}`;
    this.combat.spendCast(spell); // mana, recarga e o uso do turno: uma vez, aqui
    this.locked = ev; this.hover = null;
    this.markers.show({ element: spell.element, range: [], area: ev.area, target: ev.tile, valid: true, locked: true });
    this.ui.setStep(`Conjurando <b>${spell.name}</b>…`);
    this.ui.setTarget('');
    this.ui.setMessage('');
    const [tx, tz] = this.tileCenter(ev.tile);
    this.tk.faceTo(tx, tz);
    this.lastCast = { spell: spell.id, castId, target: { ...ev.tile }, hits: null, at: performance.now() };
    this.lastCast.hits = [];
    this.effect = effect({
      spell, target: ev, mage: this.mage, anim: this.anim, spellFx: this.spellFx,
      targetPoint: this.unitPoint(ev),
      pointOf: unit => this.unitPoint({ unit, tile: unit.tile }),
      tileCenter: t => this.tileCenter(t),
      react: (unit, kind, k) => this.react(unit, kind, k),
      // part: para as magias em etapas (cada salto da Corrente Elétrica)
      resolve: (part = null) => {
        const res = resolveSpell(this.combat, spell, ev, castId, part);
        this.lastCast.hits.push(...res.hits.map(h => ({ id: h.target.id, amount: h.amount })));
        this.lastCast.resolved = (this.lastCast.resolved || 0) + 1;
        this.markers.hide();
      },
    });
    this.setState('casting');
    this.sfx('cast');
    return true;
  }

  // ---------- quadro a quadro ----------
  update(dt, now = performance.now()) {
    this.stateT += dt;
    if (this.state === 'drawing' && this.guided && this.guide) {
      const g = this.guideTip, at = g && g.snapped, G = this.guide;
      this.canvas.setInk(G.litStrokes(), null, at || (g && g.raw) || null, !!(g && g.down && at));
      this.canvas.setMagnet(at ? g.raw : null, at);
      // dicas do trilho: o ponto de partida até a caneta grudar; depois, o trecho logo à frente para seguir
      // (runa de dois traços: com o traço atual feito, acende o ponto de partida do próximo)
      const hs = G.head ? G.strokes[G.head.s] : null, curDone = !!hs && hs.count / hs.pts.length >= G.config.complete;
      const start = !G.started || curDone ? G.startPoint() : null;
      this.canvas.setGuideState({ progress: G.progress, start, ahead: start ? null : G.ahead(), head: G.headPoint() });
      const pct = Math.round(G.progress * 100), need = Math.round(G.config.complete * 100);
      this.ui.setMeter(G.progress, pct ? `traçado: ${pct}% (vale com ${need}%)` : 'comece no ponto que pulsa e passe por cima da runa', G.config.complete);
    } else if (this.state === 'drawing') {
      this.tracker.update(now);
      const tr = this.tracker;
      this.canvas.setInk(tr.strokePoints, tr.current ? tr.current.points.map(([x, y]) => [x, y]) : null, tr.tip, tr.pen && tr.state === 'stroke');
      // confiança ao vivo enquanto desenha (a cada 200 ms, só com traço de bom tamanho)
      if (now - this.liveAt > 200 && tr.current && tr.current.len > 150) {
        this.liveAt = now;
        const live = [...tr.strokePoints, tr.current.points.map(([x, y]) => [x, y])];
        const r = this.recognizer.recognize(live);
        const want = this.spell.rune;
        if (want) {
          const s = (r.ranking.find(x => x.id === want) || { score: 0 }).score;
          // a forma está chegando perto de outra runa conhecida? avisa enquanto desenha
          const other = r.ranking[0] && r.ranking[0].id !== want && r.ranking[0].score >= 0.7 ? r.ranking[0] : null;
          this.ui.setMeter(s, `desenhando: ${Math.round(s * 100)}% parecido com ${RUNES[want].name.toLowerCase()}${other ? ` · parece mais ${artigo(other.id)} ${RUNES[other.id].name.toLowerCase()}` : ''}`);
        } else {
          this.ui.setMeter(r.score, r.id && r.score >= 0.6 ? `o mais parecido agora: ${RUNES[r.id].name.toLowerCase()} (${Math.round(r.score * 100)}%)` : 'nenhuma runa à vista');
        }
        this.ui.drawDebug(this.attempt, { strokes: live, raw: [...tr.strokes.map(x => x.raw.map(([a, b]) => [a, b])), tr.current.raw.map(([a, b]) => [a, b])], result: r });
      }
    } else if (this.state === 'recognized') {
      if (this.mode === 'practice') { if (this.stateT > 1.1) this.startDrawing(this.spell, 'De novo: mais uma tentativa.'); }
      else if (this.stateT > 0.75) this.enterTargeting();
    } else if (this.state === 'casting') {
      if (this.effect && this.effect.update(dt)) {
        this.effect = null;
        this.ui.hideCard();
        this.canvas.reset();
        this.markers.hide();
        this.spell = null; this.locked = null;
        this.setState('idle');
      }
    }
  }
}

const artigo = id => (['circulo', 'v', 'losango', 'raio', 'raioDuplo', 'triangulo'].includes(id) ? 'um' : 'uma');
// elemento de cada runa (a cor do traço no treino)
const ELEMENT_OF = { circulo: 'fogo', onda: 'fogo', v: 'gelo', losango: 'gelo', raio: 'raio', raioDuplo: 'raio', triangulo: 'terra', espiral: 'terra' };
