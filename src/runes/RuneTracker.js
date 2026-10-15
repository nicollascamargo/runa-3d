// Rastreamento da trajetória da runa: transforma amostras da ponta do dedo (ou do mouse) em traços limpos.
// Não sabe que runa é: só decide quando um traço começa e termina e suaviza o caminho.
//
// Caneta da mão: o indicador esticado e os outros dedos dobrados "encostam a caneta". Com folga (histerese):
// encosta acima de penOn por alguns quadros e só levanta abaixo de penOff por um tempo, para um tremor não
// cortar o traço. Mouse: a caneta é o botão.
//
// Um traço termina quando:
//   - a caneta levanta;
//   - a mão fica parada (dwellMs) depois de um traço de tamanho razoável, e o desenho já parece pronto
//     (quem decide é o gancho dwellOk, ligado ao reconhecedor); parada mais longa (longDwellMs) termina sempre:
//     assim dá para parar um instante num canto do triângulo sem cortar o desenho no meio;
//   - passa de maxStrokeMs;
//   - a mão some por mais de lostMs (o que já foi desenhado vale). Se ela voltar em até resumeMs perto de onde
//     sumiu, o MESMO traço continua (a câmera perdeu a mão por um instante, o desenho não acabou).
// Traços curtos demais (minStrokeMs, minStrokePx) são descartados: foram um esbarrão, não um desenho.
// Suavização adaptativa: o rastreador mede o tremor da ponta do dedo (a parte do movimento que muda de
// direção a cada quadro) e, quanto mais tremido, mais forte o filtro segura a mão parada ou lenta.
import { OneEuro } from '../input/hand/handReading.js';

export const TRACKER_CONFIG = {
  euro: { minCutoff: 1.4, beta: 0.015, dCutoff: 1.0 }, // suavização da ponta do dedo (a mão treme mais que o mouse)
  // filtro adaptativo: tremor (pixels) abaixo de tremorLow usa o filtro normal; acima de tremorHigh, o filtro "tremido"
  // (corte mínimo e beta menores: segura mais, inclusive com a mão andando; atrasa uns 30 ms a 600 px/s)
  adaptive: { tremorLow: 2.5, tremorHigh: 9, minCutoffShaky: 0.55, betaShaky: 0.006 },
  penOn: 0.55, penOff: 0.32, penOnFrames: 2, penOffMs: 160,
  minStrokeMs: 220, minStrokePx: 70,
  maxStrokeMs: 9000,
  maxAttemptMs: 16000,  // uma tentativa inteira (todos os traços)
  dwellMs: 600, dwellPx: 16, dwellMinPx: 160, // parado esse tempo, dentro desse raio, termina o traço (se já parece pronto)
  longDwellMs: 1100,    // parado esse tempo, termina de qualquer jeito
  nextStrokeMs: 2200,   // runa de dois traços: espera o segundo por esse tempo
  lostMs: 450,          // a mão some por mais que isto (além da folga da câmera): o traço para
  resumeMs: 1400, resumeFrac: 0.45, resumeMinPx: 120, // ...e continua se ela voltar logo, perto de onde sumiu
  minStepPx: 1.5,       // pontos mais próximos que isto não entram (economia, e nada muda no desenho)
};

export class RuneTracker {
  constructor(config = TRACKER_CONFIG) {
    this.config = config;
    this.fx = new OneEuro(config.euro);
    this.fy = new OneEuro(config.euro);
    // ganchos: onStrokeStart(stroke), onStrokeEnd(stroke, motivo), onDiscard(stroke, motivo), onTimeout(motivo),
    // onResume(stroke): o traço interrompido continuou; dwellOk(): o desenho até aqui já parece pronto?
    this.onStrokeStart = null; this.onStrokeEnd = null; this.onDiscard = null; this.onTimeout = null; this.onResume = null; this.dwellOk = null;
    this.reset();
  }

  reset() {
    this.active = false;
    this.state = 'idle';        // idle | ready | stroke | between
    this.strokes = [];          // traços completos: { points: [[x, y, t]], raw: [[x, y, t]], start, end, source }
    this.current = null;
    this.pen = false; this.penFrames = 0; this.penOffSince = 0;
    this.lastSample = null; this.lostSince = 0; this.betweenSince = 0; this.attemptStart = 0;
    this.tip = null;            // última posição suavizada (para a ponta luminosa)
    this.fx.reset(); this.fy.reset();
    this.resumable = null;      // traço interrompido pela câmera que ainda pode continuar
    this.resumed = 0;           // quantas vezes um traço continuou depois de a mão sumir
    this.shake = { prev: null, prev2: null, d2: [0, 0], level: 0 }; // medida do tremor
    this.dwellCache = null;
  }

  // Tremor: a segunda diferença das amostras cruas (aceleração quadro a quadro) menos a sua média lenta;
  // movimento liso varia devagar, tremor troca de sentido a cada quadro.
  measureShake(x, y) {
    const S = this.shake;
    if (S.prev && S.prev2) {
      const ax = x - 2 * S.prev[0] + S.prev2[0], ay = y - 2 * S.prev[1] + S.prev2[1];
      S.d2[0] += (ax - S.d2[0]) * 0.2; S.d2[1] += (ay - S.d2[1]) * 0.2;
      const dev = Math.hypot(ax - S.d2[0], ay - S.d2[1]);
      S.level += (dev - S.level) * 0.08;
    }
    S.prev2 = S.prev; S.prev = [x, y];
    const A = this.config.adaptive, E = this.config.euro;
    if (!A) return;
    const k = Math.min(1, Math.max(0, (S.level - A.tremorLow) / (A.tremorHigh - A.tremorLow)));
    this.fx.minCutoff = this.fy.minCutoff = E.minCutoff + (A.minCutoffShaky - E.minCutoff) * k;
    this.fx.beta = this.fy.beta = E.beta + ((A.betaShaky ?? E.beta) - E.beta) * k;
  }
  get tremor() { return this.shake.level; }

  // Começa uma tentativa de desenho.
  begin(now) { this.reset(); this.active = true; this.state = 'ready'; this.armedAt = now; }
  stop() { this.reset(); }

  // Uma amostra: { x, y } em pixels de tela, t em ms, pen (0..1 para a mão, true/false para o mouse), source.
  sample({ x, y, t, pen, source = 'hand' }) {
    if (!this.active) return;
    const cfg = this.config;
    this.lostSince = 0;
    // o filtro recomeça onde o traço começa (mouse) e depois de um salto ou de um buraco nas amostras (mão
    // que sumiu e voltou): senão o começo do traço sairia puxado para a posição antiga, com uma cauda
    const prev = this.tip;
    const penNow = source === 'mouse' ? !!pen : this.pen;
    if (!prev || t - prev.t > 150 || Math.hypot(x - prev.raw.x, y - prev.raw.y) > 140 || (source === 'mouse' && penNow && !this.pen)) { this.fx.reset(); this.fy.reset(); this.shake.prev = this.shake.prev2 = null; }
    if (source !== 'mouse') this.measureShake(x, y);
    const sx = this.fx.filter(x, t / 1000), sy = this.fy.filter(y, t / 1000);
    this.tip = { x: sx, y: sy, raw: { x, y }, t, source };
    // caneta com folga
    if (source === 'mouse') this.pen = !!pen;
    else {
      const p = typeof pen === 'number' ? pen : pen ? 1 : 0;
      if (!this.pen) {
        this.penFrames = p > cfg.penOn ? this.penFrames + 1 : 0;
        if (this.penFrames >= cfg.penOnFrames) { this.pen = true; this.penOffSince = 0; }
      } else if (p < cfg.penOff) {
        if (!this.penOffSince) this.penOffSince = t;
        if (t - this.penOffSince >= cfg.penOffMs) this.pen = false;
      } else this.penOffSince = 0;
    }
    if (this.pen && this.state !== 'stroke') this.startStroke(sx, sy, x, y, t, source);
    else if (!this.pen && this.state === 'stroke') this.endStroke(t, 'caneta');
    if (this.state === 'stroke') this.addPoint(sx, sy, x, y, t);
    this.lastSample = t;
  }

  // A mão sumiu da câmera.
  lost(t) {
    if (!this.active) return;
    if (!this.lostSince) this.lostSince = t;
  }

  startStroke(sx, sy, x, y, t, source) {
    if (!this.attemptStart) this.attemptStart = t;
    // a mão voltou logo depois de a câmera perdê-la, perto de onde sumiu: o mesmo traço continua
    const R = this.resumable, cfg = this.config;
    if (R && t - R.t <= cfg.resumeMs && this.strokes[this.strokes.length - 1] === R.stroke) {
      const last = R.stroke.points[R.stroke.points.length - 1], b = R.size;
      if (Math.hypot(sx - last[0], sy - last[1]) <= Math.max(cfg.resumeMinPx, cfg.resumeFrac * b)) {
        this.strokes.pop();
        this.current = R.stroke;
        this.resumable = null;
        this.resumed++;
        this.state = 'stroke';
        this.addPoint(sx, sy, x, y, t);
        if (this.onResume) this.onResume(this.current);
        return;
      }
    }
    this.resumable = null;
    this.current = { points: [[sx, sy, t]], raw: [[x, y, t]], start: t, end: t, source, len: 0 };
    this.state = 'stroke';
    if (this.onStrokeStart) this.onStrokeStart(this.current);
  }

  addPoint(sx, sy, x, y, t) {
    const s = this.current, last = s.points[s.points.length - 1];
    s.raw.push([x, y, t]);
    const d = Math.hypot(sx - last[0], sy - last[1]);
    if (d < this.config.minStepPx) return;
    s.points.push([sx, sy, t]);
    s.len += d;
    s.end = t;
  }

  endStroke(t, reason) {
    const s = this.current, cfg = this.config;
    this.current = null;
    if (!s) return;
    s.end = t;
    // tira a cauda parada do fim (a pausa que terminou o traço não faz parte do desenho)
    if (reason === 'parado') while (s.points.length > 2 && t - s.points[s.points.length - 1][2] < cfg.dwellMs * 0.8 && Math.hypot(s.points[s.points.length - 1][0] - s.points[s.points.length - 2][0], s.points[s.points.length - 1][1] - s.points[s.points.length - 2][1]) < cfg.dwellPx) s.points.pop();
    const ms = s.end - s.start;
    if (ms < cfg.minStrokeMs || s.len < cfg.minStrokePx) {
      this.state = this.strokes.length ? 'between' : 'ready';
      this.betweenSince = t;
      if (this.onDiscard) this.onDiscard(s, ms < cfg.minStrokeMs ? 'rápido' : 'curto');
      return;
    }
    this.strokes.push(s);
    this.state = 'between';
    this.betweenSince = t;
    if (reason === 'perdida') {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const [x, y] of s.points) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
      this.resumable = { stroke: s, t, size: Math.max(x1 - x0, y1 - y0) };
    }
    if (this.onStrokeEnd) this.onStrokeEnd(s, reason);
  }

  // Relógio: pausa, tempo máximo, mão perdida, espera do próximo traço. Chame a cada quadro.
  update(now) {
    if (!this.active) return;
    const cfg = this.config;
    if (this.state === 'stroke') {
      const s = this.current;
      if (this.lostSince && now - this.lostSince > cfg.lostMs) { this.pen = false; this.endStroke(now, 'perdida'); return; }
      if (now - s.start > cfg.maxStrokeMs) { this.pen = false; this.endStroke(now, 'tempo'); return; }
      // parado: a caneta ficou dentro de um raio pequeno por dwellMs (só para a mão; o mouse solta o botão)
      // (todas as amostras da última janela cabem num círculo pequeno: o tremor não conta como movimento).
      // Termina se o desenho já parece pronto; senão, só depois de longDwellMs (deu para pensar num canto).
      if (s.source !== 'mouse' && s.len > cfg.dwellMinPx && s.raw.length > 3 && s.raw[0][2] <= now - cfg.dwellMs) {
        const stillFor = ms => {
          if (s.raw[0][2] > now - ms) return false;
          let i = s.raw.length - 1, mx = 0, my = 0, n = 0;
          for (; i >= 0 && now - s.raw[i][2] <= ms; i--) { mx += s.raw[i][0]; my += s.raw[i][1]; n++; }
          if (n < 4) return false;
          mx /= n; my /= n;
          for (let j = s.raw.length - 1; j > i; j--) if (Math.hypot(s.raw[j][0] - mx, s.raw[j][1] - my) > cfg.dwellPx) return false;
          return true;
        };
        let end = false;
        if (stillFor(cfg.dwellMs)) {
          if (!this.dwellOk) end = true;
          else {
            const key = `${this.strokes.length}:${s.points.length}`;
            if (!this.dwellCache || this.dwellCache.key !== key) this.dwellCache = { key, ok: !!this.dwellOk() };
            end = this.dwellCache.ok || stillFor(cfg.longDwellMs);
          }
        }
        // depois da pausa, a caneta só encosta de novo quando o dedo relaxa e volta a apontar
        if (end) { this.endStroke(now, 'parado'); this.pen = false; this.penFrames = -9999; return; }
      }
    }
    if (this.state === 'between' && this.strokes.length && now - this.betweenSince > cfg.nextStrokeMs) { this.state = 'ready'; if (this.onTimeout) this.onTimeout('espera'); }
    if (this.attemptStart && now - this.attemptStart > cfg.maxAttemptMs && this.state !== 'idle') {
      if (this.state === 'stroke') this.endStroke(now, 'tempo');
      if (this.onTimeout) this.onTimeout('tempo');
    }
  }

  get strokePoints() { return this.strokes.map(s => s.points.map(([x, y]) => [x, y])); }
  get drawing() { return this.state === 'stroke'; }
}
