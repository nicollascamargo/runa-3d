// O que o jogador vê da leitura da mão: a prévia da câmera com os pontos da mão, o cursor da mão
// (encolhe enquanto a pinça fecha), o anel de "segurar o gesto" e a faixa de calibração.
import { HAND_LINKS, GESTURE_NAMES, clamp01 } from '../input/hand/handReading.js';

const $ = id => document.getElementById(id);

export class HandView {
  // hint(kind): texto do jogo para o momento ('pressed' com a pinça fechada, 'free' com a mão solta).
  // holdLabel(g): o que o gesto faz, mostrado no anel em volta do cursor.
  // penMode(): desenhando uma runa, o anel do cursor some (quem mostra a ponta do dedo é a trilha luminosa).
  // penLabel(): texto do estado da caneta no modo ímã (vazio = o de sempre, pela pose do indicador).
  constructor(hand, commands, { hint = () => '', holdLabel = g => GESTURE_NAMES[g], penMode = () => false, penLabel = () => '' } = {}) {
    Object.assign(this, { hand, commands, hint, holdLabel, penMode, penLabel });
    this.card = $('camCard');
    this.overlay = $('camOverlay');
    this.ctx = this.overlay.getContext('2d');
    this.empty = $('camEmpty');
    this.msg = $('camMsg');
    this.btn = $('camBtn');
    this.now = $('gestureNow');
    this.what = $('gestureWhat');
    this.holdBar = $('gestureHold');
    this.calibBtn = $('calibBtn');
    this.offBtn = $('camOff');
    this.cursor = $('handCursor');
    this.cursorLabel = $('cursorLabel');
    this.holdCircle = this.cursor.querySelector('.hold-ring circle');
    this.calibEl = $('calib');
    this.calibBar = $('calibBar');

    this.btn.addEventListener('click', () => commands.emit('hand.camera', { source: 'mouse' }));
    this.offBtn.addEventListener('click', () => commands.emit('hand.camera', { source: 'mouse' }));
    this.calibBtn.addEventListener('click', () => commands.emit('hand.calibrate', { source: 'mouse' }));
    $('camMin').addEventListener('click', () => this.card.classList.toggle('mini'));

    hand.onFrame = lm => this.drawHand(lm);
    hand.onStatus = (text, isError) => this.setMessage(text, isError);
    hand.onCalib = (p, message) => {
      this.calibEl.hidden = p === null;
      if (p !== null) this.calibBar.style.width = `${p * 100}%`;
      if (message && this.onMessage) this.onMessage(message);
    };
  }

  setMessage(text, isError = false) {
    if (text) this.msg.textContent = text;
    this.msg.classList.toggle('err', isError);
    this.btn.disabled = !!text && !isError;
  }

  // chamado quando a câmera liga ou desliga. resetMessage: volta ao texto inicial (ao desligar);
  // depois de uma falha ao ligar, a mensagem de erro fica na tela.
  refresh(resetMessage = false) {
    const on = this.hand.on;
    this.empty.hidden = on;
    this.calibBtn.hidden = !on;
    this.offBtn.hidden = !this.hand.cameraOn;
    this.card.classList.toggle('live', on);
    this.btn.disabled = false;
    if (!on) {
      if (resetMessage) {
        this.msg.textContent = 'Ligue a câmera para pegar o mago com a pinça e desenhar runas no ar. O vídeo fica só no seu computador e não é gravado.';
        this.msg.classList.remove('err');
      }
      this.ctx.clearRect(0, 0, this.overlay.width, this.overlay.height);
    }
  }

  drawHand(lm) {
    const v = this.hand.video, W = v.videoWidth || 640, H = v.videoHeight || 480, ctx = this.ctx, h = this.hand.hand;
    if (this.overlay.width !== W || this.overlay.height !== H) { this.overlay.width = W; this.overlay.height = H; }
    ctx.clearRect(0, 0, W, H);
    if (!lm) return;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(214, 168, 90, .9)';
    for (const [a, b] of HAND_LINKS) {
      ctx.beginPath();
      ctx.moveTo(lm[a].x * W, lm[a].y * H);
      ctx.lineTo(lm[b].x * W, lm[b].y * H);
      ctx.stroke();
    }
    ctx.fillStyle = '#e6e9f5';
    for (const p of lm) { ctx.beginPath(); ctx.arc(p.x * W, p.y * H, 3.5, 0, Math.PI * 2); ctx.fill(); }
    // linha da pinça: vermelha quando fechada
    ctx.strokeStyle = h.pressed ? '#ff7a6a' : 'rgba(230, 233, 245, .5)';
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.moveTo(lm[4].x * W, lm[4].y * H);
    ctx.lineTo(lm[8].x * W, lm[8].y * H);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#7fb2ff';
    ctx.beginPath();
    ctx.arc(h.anchor.x * W, h.anchor.y * H, 6, 0, Math.PI * 2);
    ctx.fill();
  }

  // a cada quadro da tela
  update(now = performance.now()) {
    const hi = this.hand, h = hi.hand, cfg = hi.config, active = hi.active;
    now = Math.max(now, h.lastSeen); // mãos simuladas nos testes têm relógio próprio
    this.cursor.hidden = !active || this.penMode();
    if (active) {
      // desenhado um pouco adiantado entre um quadro da câmera e o próximo (menos degraus e menos atraso)
      const c = hi.displayCursor ? hi.displayCursor(performance.now()) : h.cursor;
      this.cursor.style.transform = `translate3d(${c.x}px, ${c.y}px, 0)`;
      // indicador da pinça: o anel fecha conforme os dedos (nos limites deste jogador) e muda de cor por estado
      const close = h.pressed ? 1 : h.armed ? clamp01(h.pinchLevel || 0) : 0;
      this.cursor.style.setProperty('--close', close.toFixed(3));
      this.cursor.classList.toggle('pressed', h.pressed);
      this.cursor.classList.toggle('closing', !h.pressed && h.pinchState === 'fechando');
      this.cursor.classList.toggle('opening', h.pressed && h.pinchState === 'abrindo');
      void cfg;
      // anel de segurar em volta do cursor, onde o olho já está
      let text = '', progress = 0, blocked = false;
      const g = h.active;
      if (g && !h.fired && !h.pressed) {
        const b = hi.gestureState(g);
        if (!b) {
          const need = hi.holdNeeded(g);
          progress = clamp01((now - h.holdStart) / need);
          if (need >= 300) text = this.holdLabel(g);
        } else if (b.trim() && now - h.activeSince > 350) { text = b; blocked = true; }
      }
      this.cursor.classList.toggle('holding', !!text);
      this.cursor.classList.toggle('blocked', blocked);
      this.holdCircle.style.strokeDasharray = `${(blocked ? 1 : progress) * 100} 100`;
      this.cursorLabel.textContent = text;
    }
    if (!hi.on) {
      this.now.textContent = 'Câmera desligada';
      this.what.textContent = 'usando o mouse';
      this.holdBar.style.width = '0';
      return;
    }
    if (hi.calib.active) {
      this.now.textContent = 'Calibrando';
      this.what.textContent = 'passeie a mão até os cantos';
      this.holdBar.style.width = '0';
      return;
    }
    if (!h.visible) {
      this.now.textContent = 'Mão fora da câmera';
      this.what.textContent = 'mostre a palma, a uns 50 cm';
      this.holdBar.style.width = '0';
      return;
    }
    const g = h.active;
    this.now.textContent = this.penMode() ? (this.penLabel() || (h.pen > 0.55 ? 'Desenhando a runa' : 'Caneta levantada')) : h.pressed ? (h.pinchState === 'abrindo' ? 'Soltando' : 'Pinça') : h.braking || h.pinchState === 'fechando' ? 'Fechando a pinça' : g ? GESTURE_NAMES[g] : 'Apontando';
    let what;
    if (h.pressed) what = this.hint('pressed');
    else if (h.fired && now - h.firedAt < 900) what = this.holdLabel(h.firedGesture);
    else if (!h.armed) what = 'abra os dedos para a próxima pinça';
    else if (h.braking) what = 'feche mais para pegar';
    else if (g) { const b = hi.gestureState(g); what = b.trim() ? b : `${Math.round((h.prob[g] || 0) * 100)}% de certeza`; }
    else what = this.hint('free');
    this.what.textContent = what;
    this.holdBar.style.width = g && !h.fired && !hi.gestureState(g) ? `${clamp01((now - h.holdStart) / hi.holdNeeded(g)) * 100}%` : '0';
  }
}
