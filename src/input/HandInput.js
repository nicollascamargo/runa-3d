// Fonte de comandos: a mão na câmera (MediaPipe Gesture Recognizer, tudo no navegador).
// Emite os MESMOS comandos do mouse, então o resto do jogo não sabe se veio da mão ou do mouse:
//   cursor da mão  -> pointer.move   (posição normalizada da tela, -1 a 1)
//   fechar a pinça -> pointer.down   (vale onde o cursor estava um instante antes de os dedos fecharem)
//   abrir os dedos -> pointer.up
//   mão some segurando algo -> pointer.cancel
//   gestos segurados (polegar, V...) -> o comando ligado a eles em 'gestureCommands'
//   ponta do indicador -> pen.move { px, py, pen (0 a 1: indicador esticado, os outros dobrados), t }
//   mão some -> pen.lost   (as runas usam os dois: src/runes/RuneTracker.js)
//   a mão inteira, a cada quadro -> hand.frame { t, lm, prob, W, H }; mão some -> hand.lost
//   (os golpes do guerreiro usam: src/warrior/WarriorGestures.js; é o mesmo MediaPipe, uma instância só)
// O vídeo nunca sai do computador e não é gravado.
//
// Runa Vision 2.0:
//   - a hora de cada quadro é a da CAPTURA (requestVideoFrameCallback dá), não a do processamento;
//   - o cursor passa por um filtro só (src/input/hand/CursorFilter.js), na área da câmera, com recusa de salto
//     de um quadro; na tela ele é desenhado um pouco adiantado entre um quadro e outro (displayCursor);
//   - a âncora do cursor fica perto do nó do indicador (treme menos e quase não anda quando os dedos fecham);
//   - a pinça é de src/input/hand/PinchDetector.js (histerese, confirmação curta, folga quando a mão some,
//     limites pessoais da calibração do jogador); o freio do cursor só age com os dedos fechando de verdade;
//   - o perfil do jogador (calibração) fica no navegador: alcance, pinça e mão de referência.
import { HAND_CONFIG, TRACKED, COMMAND_GESTURES, OneEuro, readHand, fuse, clamp01 } from './hand/handReading.js';
import { CursorFilter } from './hand/CursorFilter.js';
import { PinchDetector, pinchFromCalibration } from './hand/PinchDetector.js';

const loadPref = (key) => { try { return localStorage.getItem(key); } catch { return null; } };
const savePref = (key, v) => { try { localStorage.setItem(key, v); } catch { /* sem armazenamento: só não lembra */ } };

export class HandInput {
  // commands: a camada de comandos. video: o elemento <video> da prévia.
  // isHolding(): o jogo diz se a pinça está segurando algo (o mago no ar): aí soltar pede mais certeza.
  // gestureCommands: gesto -> comando. gestureState(g): '' vale agora, 'texto' explica por que não, ' ' não vale e não precisa explicar.
  constructor(commands, { video, isHolding = () => false, gestureCommands = {}, gestureState = null, sfx = () => {} } = {}) {
    this.commands = commands;
    this.video = video;
    this.isHolding = isHolding;
    this.gestureCommands = gestureCommands;
    this.gestureState = gestureState || (g => (gestureCommands[g] ? '' : ' '));
    this.sfx = sfx;
    this.config = structuredClone(HAND_CONFIG);
    const saved = loadPref('runa3d.camArea');
    if (saved) try { this.config.camArea = JSON.parse(saved); } catch { /* ignora */ }
    this.cursorFilter = new CursorFilter();
    this.pinch = new PinchDetector();
    this.profile = null;     // calibração do jogador (src/ui/CalibrationWizard.js): { pinch, camArea, ... }
    try { const p = JSON.parse(loadPref('runa3d.perfilMao') || 'null'); if (p) this.applyProfile(p, false); } catch { /* perfil estragado: ignora */ }
    this.lastCapture = 0;    // hora da captura do último quadro (ms)
    this.latency = { capture: 0, total: 0 }; // da captura até o comando sair (ms), suavizado
    this.rawListeners = new Set(); // (dados de cada quadro): calibração, painel de diagnóstico, modo de avaliação
    // 'novo' (padrão) ou 'antigo': o cursor de antes (One Euro em pixels, âncora a 35% da ponta, sem adiantar),
    // só para comparar os dois no modo de avaliação com a webcam
    this.cursorMode = 'novo';
    this.legacy = { fx: new OneEuro(HAND_CONFIG.euro), fy: new OneEuro(HAND_CONFIG.euro) };
    this.recognizer = null;
    this.cameraOn = false;
    this.simulated = false;
    this.lastVideoTime = -1;
    this.onFrame = null;   // (landmarks, now) a cada quadro: a prévia desenha a mão
    this.onStatus = null;  // (texto, éErro) mensagens da câmera
    this.onCalib = null;   // (progresso 0..1 | null, mensagem)
    this.calib = { active: false, start: null, samples: [], durationMs: 4500 };
    const e = this.config.euro;
    this.hand = {
      visible: false, lastSeen: 0,
      ratio: 1, ratioHold: 1, indexOpen: 1, speed: 0, ext: { thumb: 0, index: 0, middle: 0, ring: 0, pinky: 0 },
      cls: {}, geo: {}, prob: {}, top: [],
      cursor: { x: innerWidth / 2, y: innerHeight / 2 }, rawCursor: { x: innerWidth / 2, y: innerHeight / 2 },
      anchor: { x: 0.5, y: 0.5 }, offset: { x: 0, y: 0 }, frozen: false, history: [], lastT: 0, prevAnchorPx: null,
      pressed: false, below: 0, openSince: 0, armed: true, armSince: 0, braking: false, brakeAt: 0, lastRewind: 0,
      active: null, activeSince: 0, holdStart: 0, fired: false, lastCmdAt: -1e9, firedAt: -1e9, firedCmd: '',
      fps: 0, frames: 0, fpsT: 0, inferMs: 0, pinchLevel: 0, pinchState: 'aberta',
    };
    void e;
  }

  // Perfil do jogador (calibração): limites pessoais da pinça e alcance da câmera. save: guarda no navegador.
  applyProfile(profile, save = true) {
    this.profile = profile;
    if (profile.pinch) this.pinch.setConfig(pinchFromCalibration(profile.pinch));
    if (profile.camArea) this.config.camArea = { ...profile.camArea };
    if (profile.cursor) this.cursorFilter.config.minCutoff = profile.cursor.minCutoff;
    if (save) { savePref('runa3d.perfilMao', JSON.stringify(profile)); if (profile.camArea) savePref('runa3d.camArea', JSON.stringify(profile.camArea)); }
  }

  addRawListener(fn) { this.rawListeners.add(fn); return () => this.rawListeners.delete(fn); }
  emitRaw(data) { for (const fn of this.rawListeners) fn(data); }

  clearProfile() {
    this.profile = null;
    this.pinch.setConfig({});
    this.cursorFilter.config.minCutoff = new CursorFilter().config.minCutoff;
    try { localStorage.removeItem('runa3d.perfilMao'); } catch { /* */ }
  }

  get on() { return this.cameraOn || this.simulated; }
  get active() { return this.on && this.hand.visible; }

  status(text, isError = false) { if (this.onStatus) this.onStatus(text, isError); }

  // Liga a câmera e baixa o modelo de mãos (uns 8 MB, só na primeira vez; depois fica no cache do navegador).
  async start() {
    if (this.cameraOn) return true;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      this.status('Este navegador não liberou a câmera para esta página. Abra o index.html no Google Chrome (botão direito › Abrir com › Google Chrome). O mouse continua funcionando.', true);
      return false;
    }
    this.status('Pedindo acesso à câmera…');
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 }, facingMode: 'user' }, audio: false,
      });
      this.video.srcObject = stream;
      await this.video.play();
    } catch (err) {
      const msg = err.name === 'NotAllowedError' ? 'O acesso à câmera foi negado. Libere a câmera nas permissões do site e tente de novo.'
        : err.name === 'NotFoundError' ? 'Nenhuma câmera encontrada neste computador.'
        : `A câmera não abriu (${err.name}). Feche outros programas que estejam usando a câmera e tente de novo.`;
      this.status(`${msg} O mouse continua funcionando.`, true);
      return false;
    }
    this.status('Carregando o modelo de mãos. Na primeira vez leva alguns segundos…');
    try {
      const base = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${this.config.mediapipeVersion}`;
      const vision = await import(`${base}/vision_bundle.mjs`);
      const fileset = await vision.FilesetResolver.forVisionTasks(`${base}/wasm`);
      const options = delegate => ({
        baseOptions: { modelAssetPath: this.config.modelUrl, delegate },
        runningMode: 'VIDEO',
        numHands: 1,
        minHandDetectionConfidence: 0.6,
        minHandPresenceConfidence: 0.6,
        minTrackingConfidence: 0.5,
        cannedGesturesClassifierOptions: { maxResults: 8, scoreThreshold: 0 },
      });
      try { this.recognizer = await vision.GestureRecognizer.createFromOptions(fileset, options('GPU')); }
      catch { this.recognizer = await vision.GestureRecognizer.createFromOptions(fileset, options('CPU')); }
    } catch (err) {
      console.error(err);
      stream.getTracks().forEach(t => t.stop());
      this.video.srcObject = null;
      this.status('Não consegui baixar o modelo do MediaPipe. Confira a internet e tente de novo. O mouse continua funcionando.', true);
      return false;
    }
    this.cameraOn = true;
    this.status('');
    this.scheduleFrame();
    return true;
  }

  stop() {
    this.cameraOn = false;
    const s = this.video.srcObject;
    if (s) s.getTracks().forEach(t => t.stop());
    this.video.srcObject = null;
    if (this.hand.visible) this.loseHand();
  }

  // Para testes sem câmera: as mãos chegam por handleResult().
  useSimulated(on = true) { this.simulated = on; }

  // Um quadro por quadro de vídeo (requestVideoFrameCallback, com a hora da captura), com requestAnimationFrame
  // como reserva.
  scheduleFrame() {
    if (!this.cameraOn) return;
    if (typeof this.video.requestVideoFrameCallback === 'function') this.video.requestVideoFrameCallback((t, meta) => this.processFrame(meta));
    else requestAnimationFrame(() => this.processFrame());
  }

  processFrame(meta = null) {
    if (!this.cameraOn) return;
    const now = performance.now(), v = this.video, h = this.hand;
    if (v.readyState >= 2 && v.currentTime !== this.lastVideoTime && !document.hidden) {
      this.lastVideoTime = v.currentTime;
      // hora da captura (a câmera entrega o quadro um pouco depois): os filtros usam esta, e o MediaPipe pede
      // horas sempre crescentes
      let capture = meta && (meta.captureTime || meta.expectedDisplayTime) ? (meta.captureTime || meta.expectedDisplayTime) : now;
      if (capture > now || capture < now - 500) capture = now;
      const ts = Math.max(capture, this.lastCapture + 1);
      this.lastCapture = ts;
      let res = null;
      try { res = this.recognizer.recognizeForVideo(v, ts); } catch (err) { console.error(err); }
      h.inferMs = performance.now() - now;
      if (res) this.handleResult(res, now, ts);
      h.frames++;
      if (now - h.fpsT >= 1000) { h.fps = (h.frames * 1000) / (now - h.fpsT); h.frames = 0; h.fpsT = now; }
    }
    this.scheduleFrame();
  }

  // Parte da imagem da câmera -> pixels da tela, espelhado (a mão vai para a direita, o cursor também).
  toScreen(p) {
    const a = this.toArea(p);
    return { x: clamp01(a.x) * innerWidth, y: clamp01(a.y) * innerHeight };
  }

  // Imagem da câmera -> área da câmera (0 a 1 cobre a tela; fora disso, além da borda), espelhado.
  toArea(p) {
    const a = this.config.camArea;
    return { x: ((1 - p.x) - a.x0) / (a.x1 - a.x0), y: (p.y - a.y0) / (a.y1 - a.y0) };
  }

  // Onde desenhar o cursor agora (pixels): a posição filtrada, um pouco adiantada pela velocidade entre um quadro
  // da câmera e o próximo (src/input/hand/CursorFilter.js, predict), mais o desvio da pinça.
  displayCursor(now = performance.now()) {
    const h = this.hand, f = this.cursorFilter;
    if (this.cursorMode === 'antigo' || h.frozen || h.pressed || this.calib.active || f.x === null) return h.cursor;
    const p = f.predict(now);
    if (!p) return h.cursor;
    return { x: clamp01(p.x) * innerWidth + h.offset.x, y: clamp01(p.y) * innerHeight + h.offset.y };
  }

  emitPointer(name, x, y) {
    this.commands.emit(name, { x: (x / innerWidth) * 2 - 1, y: -(y / innerHeight) * 2 + 1, px: x, py: y, source: 'hand' });
  }

  // Recebe o resultado do reconhecedor a cada quadro. Também aceita mãos simuladas.
  // now: hora do processamento (ms); capture: hora da captura do quadro (ms; nas mãos simuladas, a mesma).
  handleResult(res, now, capture = now) {
    const cfg = this.config, h = this.hand, t = capture / 1000;
    const lm = res.landmarks && res.landmarks[0];
    if (this.onFrame) this.onFrame(lm, now);
    if (!lm) {
      // a pinça segura por um tempo (mais tempo segurando um personagem); se a mão voltar, nada aconteceu
      if (h.visible && (this.pinch.lost(now, { holding: h.pressed && this.isHolding(), lastSeen: h.lastSeen }) === 'lost' || (!h.pressed && now - h.lastSeen > cfg.lostGraceMs))) this.loseHand();
      if (this.calib.active && this.calib.start !== null && now - this.calib.start > this.calib.durationMs * 2) this.finishCalibration();
      this.emitRaw({ t: capture, now, lm: null });
      return;
    }
    const wasVisible = h.visible;
    h.visible = true;
    h.lastSeen = now;
    const W = this.video.videoWidth || 640, H = this.video.videoHeight || 480;
    const f = readHand(lm, res.worldLandmarks && res.worldLandmarks[0], (res.gestures && res.gestures[0]) || [], W, H);
    Object.assign(h, { ratio: f.ratio, indexOpen: f.indexOpen, ext: f.ext, geo: f.geo, cls: f.cls });

    // Âncora do cursor: perto do nó do indicador (anchorTipWeight do caminho até a ponta; no cursor antigo, 0,35).
    const w = this.cursorMode === 'antigo' ? 0.35 : cfg.anchorTipWeight;
    h.anchor = { x: lm[5].x + (lm[8].x - lm[5].x) * w, y: lm[5].y + (lm[8].y - lm[5].y) * w };
    const dt = h.lastT && wasVisible ? Math.max(1e-3, t - h.lastT) : 1 / 30;
    h.lastT = t;
    const ap = { x: h.anchor.x * W, y: h.anchor.y * H };
    if (h.prevAnchorPx && wasVisible) {
      const v = Math.hypot(ap.x - h.prevAnchorPx.x, ap.y - h.prevAnchorPx.y) / f.palmImg / dt;
      h.speed += (v - h.speed) * 0.5;
    } else h.speed = 0;
    h.prevAnchorPx = ap;
    // Medida da pinça para soltar: a menor entre 3D e 2D, suavizada. Um pico de um quadro não solta o mago.
    const minR = Math.min(f.ratio, f.ratio2);
    h.ratioHold = wasVisible ? h.ratioHold + (1 - Math.exp(-(dt * 1000) / 45)) * (minR - h.ratioHold) : minR;

    // Probabilidades dos gestos, suavizadas no tempo (independe da taxa de quadros).
    const raw = fuse(f, cfg, h.speed);
    const a = 1 - Math.exp(-(dt * 1000) / cfg.smoothMs);
    for (const g of TRACKED) h.prob[g] = (h.prob[g] || 0) + a * (raw[g] - (h.prob[g] || 0));
    h.top = TRACKED.map(g => ({ name: g, p: h.prob[g], c: f.cls[g] || 0, geo: f.geo[g] || 0 })).sort((x, y) => y.p - x.p).slice(0, 3);

    // Cursor: um filtro só, na área da câmera, com a hora da captura (a palma, na mesma unidade, mede saltos).
    const area = this.toArea(h.anchor), A = cfg.camArea;
    if (!wasVisible) { this.cursorFilter.reset(); this.legacy.fx.reset(); this.legacy.fy.reset(); }
    const filt = this.cursorFilter.filter(area.x, area.y, t, f.palmImg / W / (A.x1 - A.x0));
    let fx = clamp01(filt.x) * innerWidth, fy = clamp01(filt.y) * innerHeight;
    if (this.cursorMode === 'antigo') { // o de antes: limita à tela antes de filtrar, pixels, hora do processamento
      fx = this.legacy.fx.filter(clamp01(area.x) * innerWidth, now / 1000);
      fy = this.legacy.fy.filter(clamp01(area.y) * innerHeight, now / 1000);
    }
    h.rawCursor = { x: clamp01(area.x) * innerWidth, y: clamp01(area.y) * innerHeight };

    // Pinça: decide aqui, antes do freio (src/input/hand/PinchDetector.js)
    const pinchEv = this.calib.active ? '' : this.pinch.update({ t: now, ratio: f.ratio, indexOpen: f.indexOpen, fist: f.cls.Closed_Fist || 0 }, { holding: h.pressed && this.isHolding(), armed: h.armed && !h.pressed });
    h.pinchLevel = this.pinch.level; h.pinchState = this.pinch.state;

    if (this.calib.active) {
      h.cursor.x = fx; h.cursor.y = fy; h.offset = { x: 0, y: 0 };
      this.sampleCalibration(now);
      this.emitRaw({ t: capture, now, lm, f, pen: 0, anchor: { x: 1 - h.anchor.x, y: h.anchor.y }, raw: h.rawCursor, filtered: { x: fx, y: fy }, cursor: h.cursor, pinch: this.pinch, pressed: false, prob: h.prob, active: null, armed: h.armed });
      return;
    }

    // Freio: só enquanto os dedos estão fechando de verdade, o cursor para. Ao voltar a andar, guarda o desvio e
    // o desfaz aos poucos. (A mão parada e meio fechada não freia mais.)
    const braking = !h.pressed && h.armed && this.pinch.braking;
    if (braking && !h.braking) h.brakeAt = now;
    h.braking = braking;
    if (braking) h.frozen = true;
    else {
      if (h.frozen) { h.offset = { x: h.cursor.x - fx, y: h.cursor.y - fy }; h.frozen = false; }
      if (!h.pressed) {
        const decay = Math.exp(-(dt * 1000) / cfg.offsetDecayMs);
        h.offset.x *= decay; h.offset.y *= decay;
      }
      h.cursor.x = fx + h.offset.x;
      h.cursor.y = fy + h.offset.y;
      h.history.push({ t: now, x: h.cursor.x, y: h.cursor.y });
      if (h.history.length > 40) h.history.shift();
    }

    this.updatePinch(f, now, pinchEv);
    this.updateGesture(now);
    this.emitPointer('pointer.move', h.cursor.x, h.cursor.y);
    // caneta das runas: a ponta do indicador (sem o filtro do cursor: quem suaviza é o rastreador da runa)
    const tip = this.toScreen(lm[8]);
    h.tip = tip;
    h.pen = Math.max(f.geo.Pointing_Up || 0, h.prob.Pointing_Up || 0);
    this.commands.emit('pen.move', { px: tip.x, py: tip.y, pen: h.pen, t: capture, source: 'hand' });
    this.commands.emit('hand.frame', { t: capture, lm, prob: h.prob, W, H, inferMs: h.inferMs, source: 'hand' });
    // latência: da captura do quadro até os comandos saírem (inclui a inferência)
    const lat = performance.now() - capture;
    if (lat >= 0 && lat < 1000) this.latency.total += (lat - this.latency.total) * 0.1;
    this.emitRaw({ t: capture, now, lm, f, pen: h.pen, anchor: { x: 1 - h.anchor.x, y: h.anchor.y }, raw: h.rawCursor, filtered: { x: fx, y: fy }, cursor: h.cursor, pinch: this.pinch, pressed: h.pressed, prob: h.prob, active: h.active, armed: h.armed });
  }

  // Pinça: quem decide é o PinchDetector (eventos 'down' e 'up'); aqui só o "armar" depois de um gesto
  // (os dedos precisam se abrir antes da próxima pinça valer) e os comandos.
  updatePinch(f, now, ev) {
    const cfg = this.config, h = this.hand;
    if (!h.pressed) {
      if (!h.armed) {
        if (f.indexOpen > this.pinch.config.indexOpenMin && f.ratio > this.pinch.config.off) {
          if (!h.armSince) h.armSince = now;
          if (now - h.armSince >= cfg.rearmMs) h.armed = true;
        } else h.armSince = 0;
      }
      if (ev === 'down' && h.armed) this.beginPress(now);
      else if (ev === 'down') this.pinch.pressed = false; // desarmada: não vale
      return;
    }
    h.openSince = this.pinch.opening ? h.openSince || now : 0;
    if (ev === 'up') this.endPress();
  }

  // Onde o cursor estava antes de os dedos começarem a fechar.
  rewoundCursor(now) {
    const h = this.hand;
    const tRef = Math.min(now - this.config.rewindMs, h.braking ? h.brakeAt : Infinity);
    for (let i = h.history.length - 1; i >= 0; i--) if (h.history[i].t <= tRef) return h.history[i];
    return h.history[0] || h.cursor;
  }

  beginPress(now) {
    const h = this.hand;
    h.pressed = true; h.below = 0; h.openSince = 0;
    const r = this.rewoundCursor(now);
    h.lastRewind = Math.hypot(h.cursor.x - r.x, h.cursor.y - r.y);
    h.cursor.x = r.x; h.cursor.y = r.y;
    h.frozen = true; // no próximo quadro o cursor passa a seguir a mão a partir daqui, sem salto
    if (h.active && !h.fired) h.active = null;
    this.emitPointer('pointer.move', r.x, r.y);
    this.emitPointer('pointer.down', r.x, r.y);
    this.sfx('press');
  }

  endPress() {
    const h = this.hand;
    h.pressed = false; h.openSince = 0;
    this.emitPointer('pointer.up', h.cursor.x, h.cursor.y);
  }

  loseHand() {
    const h = this.hand;
    // Se os dedos já estavam abrindo quando a mão sumiu, vale como soltar: o personagem desce onde o cursor está.
    const wasPressed = h.pressed, releasing = h.pressed && (h.openSince > 0 || this.pinch.opening);
    this.pinch.reset();
    this.cursorFilter.reset();
    h.visible = false;
    h.pressed = false; h.braking = false; h.frozen = false; h.armed = false; h.armSince = 0; h.openSince = 0;
    if (wasPressed) this.emitPointer(releasing ? 'pointer.up' : 'pointer.cancel', h.cursor.x, h.cursor.y);
    this.commands.emit('pointer.leave', { source: 'hand' });
    this.commands.emit('pen.lost', { t: performance.now(), source: 'hand' });
    this.commands.emit('hand.lost', { t: performance.now(), source: 'hand' });
    Object.assign(h, { prob: {}, active: null, offset: { x: 0, y: 0 }, history: [], prevAnchorPx: null, speed: 0, top: [], pinchLevel: 0, pinchState: 'aberta' });
  }

  holdNeeded(g) { return this.config.holdMs[g]; }

  // Um gesto vira comando quando lidera com folga, fica estável pelo tempo dele e faz sentido no momento do jogo.
  updateGesture(now) {
    const cfg = this.config, h = this.hand;
    let best = null, bp = 0, sp = 0;
    for (const g of COMMAND_GESTURES) {
      const p = h.prob[g] || 0;
      if (p > bp) { sp = bp; bp = p; best = g; } else if (p > sp) sp = p;
    }
    if (h.active && (h.prob[h.active] || 0) < cfg.gestureExit) h.active = null;
    // apontando (cursor, mira, desenho de runa) nenhum gesto de comando começa
    const pointing = cfg.pointBeatsGestures && (h.prob.Pointing_Up || 0) >= bp;
    if (best && best !== h.active && !pointing && bp >= cfg.gestureEnter && bp - sp >= cfg.gestureMargin
      && (!h.active || bp >= (h.prob[h.active] || 0) + cfg.gestureMargin)) {
      h.active = best; h.activeSince = now; h.holdStart = now; h.fired = false;
    }
    const g = h.active;
    if (!g || h.fired) return;
    if (h.pressed || this.gestureState(g)) { h.holdStart = now; return; }
    if (now - h.holdStart >= this.holdNeeded(g) && now - h.lastCmdAt >= cfg.refractoryMs) {
      h.fired = true;
      h.lastCmdAt = h.firedAt = now;
      h.firedCmd = this.gestureCommands[g];
      h.firedGesture = g;
      h.armed = false; h.armSince = 0;
      this.sfx('confirm');
      this.commands.emit(this.gestureCommands[g], { source: 'hand', gesture: g });
    }
  }

  // ---------- Calibração do alcance ----------
  startCalibration() {
    if (!this.on || this.calib.active) return;
    if (this.hand.pressed) { this.hand.pressed = false; this.pinch.reset(); this.emitPointer('pointer.cancel', this.hand.cursor.x, this.hand.cursor.y); }
    Object.assign(this.calib, { active: true, start: null, samples: [] }); // o relógio começa no primeiro quadro da mão
    if (this.onCalib) this.onCalib(0, '');
  }

  sampleCalibration(now) {
    const c = this.calib;
    if (c.start === null) c.start = now;
    c.samples.push({ x: 1 - this.hand.anchor.x, y: this.hand.anchor.y });
    const p = (now - c.start) / c.durationMs;
    if (this.onCalib) this.onCalib(clamp01(p), '');
    if (p >= 1) this.finishCalibration();
  }

  finishCalibration() {
    const c = this.calib;
    c.active = false;
    if (c.samples.length < 40) { if (this.onCalib) this.onCalib(null, 'Não vi a mão o bastante. Calibre de novo com a mão na frente da câmera.'); return; }
    const q = (arr, p) => { const s = [...arr].sort((a, b) => a - b); return s[Math.round(p * (s.length - 1))]; };
    const span = (lo, hi) => {
      const pad = 0.03, min = 0.25;
      let a = lo + pad, b = hi - pad;
      if (b - a < min) { const m = (a + b) / 2; a = m - min / 2; b = m + min / 2; }
      return [Math.max(0, a), Math.min(1, b)];
    };
    const [x0, x1] = span(q(c.samples.map(s => s.x), 0.05), q(c.samples.map(s => s.x), 0.95));
    const [y0, y1] = span(q(c.samples.map(s => s.y), 0.05), q(c.samples.map(s => s.y), 0.95));
    this.config.camArea = { x0, x1, y0, y1 };
    savePref('runa3d.camArea', JSON.stringify(this.config.camArea));
    if (this.onCalib) this.onCalib(null, 'Alcance calibrado. Agora o cursor chega às bordas da tela com menos esforço.');
  }
}
