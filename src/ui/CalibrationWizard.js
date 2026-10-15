// Calibração do jogador, passo a passo (Runa Vision 2.0). A medição é de src/input/hand/handCalibration.js; aqui
// fica a janela: o passo, o que fazer, o que está sendo medido agora, o progresso e, no fim, o resumo com os
// números e o que cada um muda no jogo (salvar, refazer ou descartar).
// Enquanto calibra, a mão não aciona nada no jogo (contexto 'calibrando', src/input/InteractionContext.js).
import { HandCalibration, CALIB_STEPS } from '../input/hand/handCalibration.js';
import { pinchFromCalibration } from '../input/hand/PinchDetector.js';

const el = (tag, cls, parent, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; if (parent) parent.appendChild(e); return e; };
const n2 = v => (v === undefined || v === null ? '—' : v.toFixed(2).replace('.', ','));

export class CalibrationWizard {
  // hooks: onStart(), onEnd(), runeStep(done) (o jogo abre o círculo no traçado guiado e chama done({ ok, ms })),
  // onSave(profile), toast(text)
  constructor(hand, hooks) {
    this.hand = hand;
    Object.assign(this, { onStart: () => {}, onEnd: () => {}, runeStep: done => done({ ok: false, ms: 0, skipped: true }), onSave: () => {}, toast: () => {} }, hooks);
    this.box = el('section', 'calib-wizard', document.body);
    this.box.hidden = true;
    this.box.setAttribute('role', 'dialog');
    this.box.setAttribute('aria-label', 'Calibração da mão');
    this.box.innerHTML = `
      <div class="cw-head"><b>Calibração da mão</b><span class="cw-step"></span></div>
      <h4 class="cw-title"></h4>
      <p class="cw-text"></p>
      <p class="cw-msg" aria-live="polite"></p>
      <span class="cw-bar"><i></i></span>
      <p class="cw-live"></p>
      <div class="cw-summary"></div>
      <div class="cw-tools">
        <button type="button" data-a="skip">Pular este passo</button>
        <button type="button" data-a="cancel">Cancelar</button>
        <button type="button" data-a="save" class="primary">Salvar e usar</button>
        <button type="button" data-a="redo">Refazer</button>
        <button type="button" data-a="discard">Descartar</button>
      </div>`;
    const q = s => this.box.querySelector(s);
    Object.assign(this, { eStep: q('.cw-step'), eTitle: q('.cw-title'), eText: q('.cw-text'), eMsg: q('.cw-msg'), eBar: q('.cw-bar i'), eLive: q('.cw-live'), eSum: q('.cw-summary'), btn: a => q(`[data-a="${a}"]`) });
    this.box.addEventListener('click', e => { const b = e.target.closest('[data-a]'); if (b) this.action(b.dataset.a); });
    this.unlisten = null;
    this.i = -1;
  }

  get open() { return !this.box.hidden; }

  start() {
    if (!this.hand.on) { this.toast('Ligue a câmera (C) para calibrar a mão.'); return false; }
    this.cal = new HandCalibration();
    this.box.hidden = false;
    this.onStart();
    this.unlisten = this.hand.addRawListener(d => this.frame(d));
    this.go(0);
    return true;
  }

  go(i) {
    this.i = i;
    const S = CALIB_STEPS[i];
    this.box.classList.remove('done');
    this.eStep.textContent = `passo ${i + 1} de ${CALIB_STEPS.length}`;
    this.eTitle.textContent = S.title;
    this.eText.textContent = S.text;
    this.eMsg.textContent = '';
    this.eLive.textContent = '';
    this.eSum.innerHTML = '';
    this.eBar.style.width = '0';
    this.toggleButtons('run');
    if (S.id === 'runa') {
      this.eMsg.textContent = 'O círculo aparece no meio da tela.';
      this.cancelRune = this.runeStep(res => this.runeDone(res)) || null; // devolve como cancelar
      return;
    }
    this.cal.start(S.id); // começa a contar no primeiro quadro da câmera
  }

  toggleButtons(mode) {
    for (const a of ['skip', 'cancel']) this.btn(a).hidden = mode !== 'run';
    for (const a of ['save', 'redo', 'discard']) this.btn(a).hidden = mode !== 'end';
  }

  // um quadro da câmera (src/input/HandInput.js emitRaw)
  frame(d) {
    if (!this.cal || !this.cal.step) return;
    const st = this.cal.sample({ t: d.now ?? d.t, f: d.lm ? d.f : null, pen: d.pen || 0, anchor: d.anchor });
    this.eMsg.textContent = st.msg;
    this.eBar.style.width = `${Math.round(st.progress * 100)}%`;
    if (d.f) {
      const id = this.cal.step ? this.cal.step.id : CALIB_STEPS[this.i].id;
      this.eLive.textContent = id === 'aberta' || id === 'pinca' ? `polegar–indicador: ${n2(d.f.ratio)} palmo` : id === 'apontar' ? `apontar: ${Math.round(Math.max(d.pen || 0, d.f.geo.Pointing_Up || 0) * 100)}%` : `mão em ${Math.round(d.anchor.x * 100)}%, ${Math.round(d.anchor.y * 100)}% da imagem`;
    }
    if (st.done) this.next();
  }

  next() {
    if (this.i + 1 < CALIB_STEPS.length) this.go(this.i + 1);
    else this.end();
  }

  runeDone({ ok, ms, skipped = false, accuracy = null }) {
    if (!this.open || CALIB_STEPS[this.i].id !== 'runa' || this.box.classList.contains('done')) return;
    const cancel = this.cancelRune; this.cancelRune = null;
    if (cancel) cancel();
    if (!skipped) this.cal.setRune({ ok, ms, accuracy });
    this.end();
  }

  action(a) {
    if (a === 'skip') {
      if (CALIB_STEPS[this.i].id === 'runa') { this.runeDone({ skipped: true }); return; }
      this.cal.step = null;
      this.next();
    } else if (a === 'cancel' || a === 'discard') this.close(a === 'cancel' ? 'Calibração cancelada: nada mudou.' : 'Medidas descartadas: nada mudou.');
    else if (a === 'redo') { this.close(''); this.start(); }
    else if (a === 'save') { this.onSave(this.profile); this.close('Calibração salva: o jogo agora usa as medidas da sua mão.'); }
  }

  end() {
    this.profile = this.cal.profile();
    this.box.classList.add('done');
    this.eStep.textContent = 'resultado';
    this.eTitle.textContent = 'Medidas da sua mão';
    this.eText.textContent = 'Confira e salve. Dá para refazer quando quiser (painel › Calibrar a mão).';
    this.eMsg.textContent = '';
    this.eLive.textContent = '';
    this.eBar.style.width = '100%';
    const P = this.profile, R = P.medidas, rows = [];
    if (P.pinch) { const L = pinchFromCalibration(P.pinch); rows.push(['Pinça', `aberta ${n2(P.pinch.open)}, fechada ${n2(P.pinch.closed)} palmo`, `fecha abaixo de ${n2(L.on)}, solta acima de ${n2(L.off)} (segurando: ${n2(L.offHold)})`]); }
    else rows.push(['Pinça', R.pinca ? 'não deu para medir direito' : 'pulada', 'fica o padrão do jogo']);
    rows.push(['Apontar', P.pen ? `lido com ${Math.round(R.apontar.point * 100)}%` : 'pulado', P.pen ? `caneta das runas encosta acima de ${Math.round(P.pen.on * 100)}%` : 'padrão']);
    rows.push(['Alcance', P.camArea ? `${Math.round((P.camArea.x1 - P.camArea.x0) * 100)}% × ${Math.round((P.camArea.y1 - P.camArea.y0) * 100)}% da imagem` : 'pulado', P.camArea ? 'o cursor chega às bordas da tela com esse movimento' : 'fica o alcance atual']);
    rows.push(['Tremor parado', P.tremor !== undefined ? `${(P.tremor * 640).toFixed(1).replace('.', ',')} px na câmera` : '—', P.cursor ? `filtro do cursor parado: ${n2(P.cursor.minCutoff)} Hz` : 'padrão']);
    rows.push(['Runa de teste', R.runa ? (R.runa.ok ? `círculo em ${(R.runa.ms / 1000).toFixed(1).replace('.', ',')} s` : 'não completou') : 'pulada', P.sugestao ? `dificuldade sugerida: ${P.sugestao === 'normal' ? 'Normal' : 'Fácil'}` : '']);
    this.eSum.innerHTML = `<table>${rows.map(r => `<tr><th>${r[0]}</th><td>${r[1]}</td><td>${r[2]}</td></tr>`).join('')}</table>`;
    this.toggleButtons('end');
  }

  close(msg) {
    const cancel = this.cancelRune; this.cancelRune = null;
    if (cancel) cancel();
    if (this.unlisten) this.unlisten();
    this.unlisten = null;
    if (this.cal) this.cal.step = null;
    this.box.hidden = true;
    this.onEnd();
    if (msg) this.toast(msg);
  }
}
