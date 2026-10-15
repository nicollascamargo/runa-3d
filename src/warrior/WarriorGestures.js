// Gestos do guerreiro: posturas e movimentos da mão ao longo do tempo (nunca um quadro só).
// Recebe, a cada quadro da câmera, a mão já lida pelo HandInput (os 21 pontos e a probabilidade de cada pose)
// e decide se uma habilidade foi pedida. Nada de tela aqui: os testes alimentam quadros sintéticos.
//
//   Corte Horizontal  "espada" (indicador e médio esticados e JUNTOS) varrendo para o lado, curto e rápido
//   Golpe Devastador  punho fechado descendo rápido
//   Investida         punho fechado subindo rápido (na imagem). Espera um instante para confirmar: se o punho
//                     descer logo em seguida, era a preparação de um Golpe Devastador, e a investida é descartada
//   Guarda de Ferro   palma aberta, parada, por 0,7 s
//   Contra-ataque     dois dedos em V (indicador e médio ABERTOS), parado, por 0,7 s
//   Onda de Choque    círculo desenhado com a ponta do indicador (reconhecido pelo mesmo reconhecedor das runas)
//
// A pose vem da geometria dos pontos, não só do classificador do MediaPipe (que chama de "Victory" tanto os dois
// dedos juntos quanto o V): a distância entre as pontas do indicador e do médio, em palmos, e o ângulo entre os
// dois dedos separam a espada (juntos) do V (abertos); no meio do caminho, a pose é ambígua e não vale nada.
// A pinça (polegar encostado no indicador) nunca é pose de golpe.
//
// Medidas normalizadas pelo tamanho da palma (a distância da câmera não importa): centro da palma suavizado (One
// Euro), velocidade em palmos por segundo, direção. Um golpe só dispara uma vez: depois dele, um intervalo sem
// reconhecer nada, e as posturas seguradas (guarda, V) só valem de novo depois de a mão mudar de pose.
import { OneEuro, readHand } from '../input/hand/handReading.js';
import { RuneRecognizer } from '../runes/RuneRecognizer.js';

export const WARRIOR_GESTURE_CONFIG = {
  euro: { minCutoff: 2.2, beta: 0.05, dCutoff: 1 },
  historyMs: 2600,
  // pose pela geometria: dedo esticado acima de 'ext', dobrado abaixo de 'curl'
  pose: { ext: 0.55, curl: 0.45, swordGap: 0.3, swordAngle: 16, veeGap: 0.45, veeAngle: 22, pinch: 0.35, fistMin: 0.55, fistMargin: 0.1 },
  // movimentos (golpes): duração, distância em palmos, quanto o eixo certo domina o outro, caminho reto,
  // velocidade de pico, fração dos quadros em movimento com a pose certa, salto máximo de um quadro
  strokes: {
    corteHorizontal: { axis: 'x', sign: 0, pose: 'espada', minMs: 90, maxMs: 600, minTravel: 1.1, ratio: 1.8, straight: 0.7, minPeakSpeed: 2.0, share: 0.7 },
    golpeDevastador: { axis: 'y', sign: 1, pose: 'punho', minMs: 90, maxMs: 600, minTravel: 1.2, ratio: 1.8, straight: 0.7, minPeakSpeed: 2.2, share: 0.7 },
    investida: { axis: 'y', sign: -1, pose: 'punho', minMs: 90, maxMs: 600, minTravel: 1.2, ratio: 1.8, straight: 0.7, minPeakSpeed: 2.6, share: 0.7, confirmMs: 260 },
  },
  moving: 1.0,          // palmos por segundo: abaixo disto o quadro conta como parado
  maxStep: 0.5,         // nenhum passo sozinho pode ter mais que esta fração do movimento (salto de um quadro)
  minConfidence: 0.55,
  // posturas seguradas: pose, tempo, velocidade máxima (palmos/s) e a fração dos quadros com a pose
  holds: {
    guardaDeFerro: { pose: 'palma', ms: 700, maxSpeed: 0.9, share: 0.85 },
    contraAtaque: { pose: 'v', ms: 700, maxSpeed: 0.9, share: 0.85 },
  },
  // círculo com a ponta do indicador
  circle: { pose: 'apontando', minMs: 350, maxMs: 2600, minDiameter: 1.3, closeK: 0.35, minScore: 0.72, share: 0.75, everyMs: 90 },
  refractoryMs: 800,    // depois de um golpe, um tempo sem reconhecer outro
  rejectMs: 1500,       // intervalo mínimo entre dois avisos de gesto errado
};

export const POSE_NAMES = { punho: 'punho', palma: 'palma aberta', espada: 'espada (dois dedos juntos)', v: 'V (dois dedos abertos)', 'dois dedos': 'dois dedos (junte ou abra mais)', apontando: 'apontando', 'pinça': 'pinça', nenhuma: 'nenhuma' };

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const clamp01 = v => Math.max(0, Math.min(1, v));

// Pose da mão pelos pontos (e o classificador para o punho). W, H: tamanho da imagem.
export function classifyPose(lm, prob = {}, W = 640, H = 480, cfg = WARRIOR_GESTURE_CONFIG.pose) {
  const f = readHand(lm, null, [], W, H);
  const P = i => ({ x: lm[i].x * W, y: lm[i].y * H });
  const palm = Math.hypot(P(9).x - P(0).x, P(9).y - P(0).y) || 1;
  const e = f.ext, up = k => e[k] >= cfg.ext, down = k => e[k] <= cfg.curl;
  const gap = dist(P(8), P(12)) / palm;
  const vi = { x: P(8).x - P(5).x, y: P(8).y - P(5).y }, vm = { x: P(12).x - P(9).x, y: P(12).y - P(9).y };
  const angle = Math.acos(Math.max(-1, Math.min(1, (vi.x * vm.x + vi.y * vm.y) / ((Math.hypot(vi.x, vi.y) * Math.hypot(vm.x, vm.y)) || 1)))) * 180 / Math.PI;
  const pf = prob.Closed_Fist || 0, others = Math.max(prob.Open_Palm || 0, prob.Pointing_Up || 0, prob.Victory || 0);
  let pose = 'nenhuma';
  if (f.ratio < cfg.pinch && f.indexOpen > 0.38 && !down('index')) pose = 'pinça';
  else if ((down('index') && down('middle') && down('ring') && down('pinky')) || (pf >= cfg.fistMin && pf >= others + cfg.fistMargin)) pose = 'punho';
  else if (up('index') && up('middle') && up('ring') && up('pinky')) pose = 'palma';
  else if (up('index') && up('middle') && down('ring') && down('pinky')) {
    if (gap <= cfg.swordGap && angle <= cfg.swordAngle) pose = 'espada';
    else if (gap >= cfg.veeGap || angle >= cfg.veeAngle) pose = 'v';
    else pose = 'dois dedos';
  } else if (up('index') && down('middle') && down('ring') && down('pinky')) pose = 'apontando';
  return { pose, gap, angle, palm, f };
}

export class WarriorGestures {
  constructor(config = WARRIOR_GESTURE_CONFIG) {
    this.config = config;
    this.fx = new OneEuro(config.euro);
    this.fy = new OneEuro(config.euro);
    this.history = [];
    this.lastFire = -1e9;
    this.lastReject = -1e9;
    this.enabled = new Set(['corteHorizontal']);
    this.onGesture = null; // ({ id, confidence, dir, info })
    this.onReject = null;  // ({ id, reason })
    this.recognizer = new RuneRecognizer();
    this.reset();
  }

  setEnabled(ids) { this.enabled = new Set(ids); }

  reset() {
    this.history.length = 0;
    this.fx.reset(); this.fy.reset();
    this.pending = null;      // investida esperando confirmação
    this.holdLatch = null;    // postura segurada que já disparou (só vale de novo depois de a pose mudar)
    this.circleAt = 0;
    // para o indicador na tela: pose lida, o gesto em preparo (id), o quanto falta (progress) e a velocidade
    this.live = { pose: 'nenhuma', progress: 0, id: null, speed: 0, prepared: null, label: '' };
  }

  // A mão saiu da câmera: perdas curtas não apagam nada (o próximo quadro continua); quem chama decide quando é
  // perda de verdade (HandInput emite hand.lost depois da folga). Aí recomeça do zero.
  lost() { this.reset(); }

  // Um quadro: { t (ms), lm: 21 pontos normalizados da imagem, prob: { Closed_Fist, Open_Palm, Pointing_Up, Victory }, W, H }.
  frame({ t, lm, prob = {}, W = 640, H = 480 }) {
    const cfg = this.config;
    const cls = classifyPose(lm, prob, W, H, cfg.pose);
    // centro da palma (punho e as juntas dos dedos), espelhado: a mão vai para a direita, o ponto também
    const ids = [0, 5, 9, 13, 17];
    let cx = 0, cy = 0;
    for (const i of ids) { cx += lm[i].x; cy += lm[i].y; }
    cx = (1 - cx / ids.length) * W; cy = (cy / ids.length) * H;
    const x = this.fx.filter(cx, t / 1000), y = this.fy.filter(cy, t / 1000);
    const tip = { x: (1 - lm[8].x) * W, y: lm[8].y * H };
    const h = this.history;
    const prevT = h.length ? h[h.length - 1].t : null;
    if (prevT !== null && t - prevT > 400) h.length = 0; // a mão sumiu por um tempo: o movimento recomeça
    h.push({ t, x, y, palm: cls.palm, pose: cls.pose, tip });
    while (h.length && t - h[0].t > cfg.historyMs) h.shift();
    const prev = h[h.length - 2];
    const speed = prev ? dist(h[h.length - 1], prev) / ((t - prev.t) / 1000 || 1e-3) / cls.palm : 0;
    const L = this.live;
    L.pose = cls.pose;
    L.speed = L.speed * 0.6 + speed * 0.4;
    if (this.holdLatch && this.holdLatch.pose !== cls.pose) this.holdLatch = null;

    // investida pendente: se o punho começou a descer, era a preparação do Golpe Devastador
    if (this.pending) {
      const down = prev ? (h[h.length - 1].y - prev.y) / ((t - prev.t) / 1000 || 1e-3) / cls.palm : 0;
      if (down > cfg.moving * 1.5 && cls.pose === 'punho') this.pending.cancel = true;
    }
    if (t - this.lastFire < cfg.refractoryMs) { L.progress = 0; L.id = null; return null; }

    // golpes (movimentos)
    let best = null, prog = { id: null, p: 0 };
    for (const [id, c] of Object.entries(cfg.strokes)) {
      if (!this.enabled.has(id)) continue;
      const r = this.detectStroke(id, c, t, prog);
      if (r && (!best || r.confidence > best.confidence)) best = r;
    }
    if (best && best.id === 'golpeDevastador' && this.pending) this.pending = null; // desceu: é o devastador
    if (best && best.id === 'investida') {
      // espera um instante: se descer em seguida, era a preparação do devastador
      if (!this.pending) this.pending = { r: best, at: t, cancel: false };
      best = null;
    }
    if (best) return this.fire(best, t);
    if (this.pending && t - this.pending.at >= cfg.strokes.investida.confirmMs) {
      const p = this.pending;
      this.pending = null;
      if (!p.cancel) return this.fire(p.r, t);
    }

    // posturas seguradas
    for (const [id, c] of Object.entries(cfg.holds)) {
      if (!this.enabled.has(id)) continue;
      const r = this.detectHold(id, c, t, prog);
      if (r) return this.fire(r, t);
    }

    // círculo
    if (this.enabled.has('ondaDeChoque')) {
      const r = this.detectCircle(t, prog);
      if (r) return this.fire(r, t);
    }

    L.progress = prog.p;
    L.id = prog.p > 0.15 ? prog.id : null;
    L.prepared = this.preparedFor(cls.pose);
    return null;
  }

  // Habilidade cuja pose já está montada (para o "preparando" na tela).
  preparedFor(pose) {
    const map = { espada: 'corteHorizontal', v: 'contraAtaque', palma: 'guardaDeFerro', apontando: 'ondaDeChoque', punho: 'golpeDevastador' };
    const id = map[pose];
    return id && this.enabled.has(id) ? id : null;
  }

  // Um golpe: procura, entre os quadros recentes, um trecho que termina agora com a pose certa andando no eixo
  // certo (e no sentido certo): longe o bastante, rápido o bastante, quase reto, sem salto de um quadro.
  detectStroke(id, c, t, prog) {
    const cfg = this.config, h = this.history, end = h[h.length - 1];
    let best = null;
    for (let i = h.length - 2; i >= 0; i--) {
      const a = h[i], ms = end.t - a.t;
      if (ms > c.maxMs) break;
      const seg = h.slice(i);
      const palm = seg.map(s => s.palm).sort((p, q) => p - q)[seg.length >> 1];
      const dMain = (c.axis === 'x' ? end.x - a.x : end.y - a.y) / palm, dCross = (c.axis === 'x' ? end.y - a.y : end.x - a.x) / palm;
      if (c.sign && Math.sign(dMain) !== c.sign) continue;
      let path = 0, peak = 0, step = 0, moving = 0, good = 0, other = {};
      for (let k = 1; k < seg.length; k++) {
        const d = dist(seg[k], seg[k - 1]) / palm, v = d / ((seg[k].t - seg[k - 1].t) / 1000 || 1e-3);
        path += d;
        peak = Math.max(peak, v);
        step = Math.max(step, Math.abs(c.axis === 'x' ? seg[k].x - seg[k - 1].x : seg[k].y - seg[k - 1].y) / palm);
        if (v >= cfg.moving) { moving++; if (seg[k].pose === c.pose) good++; else other[seg[k].pose] = (other[seg[k].pose] || 0) + 1; }
      }
      // a pose vale pelos quadros em movimento (parado antes não conta)
      const share = moving ? good / moving : 0;
      if (share >= c.share) { const p = Math.min(1, Math.abs(dMain) / c.minTravel); if (p > prog.p) { prog.p = p; prog.id = id; } }
      if (ms < c.minMs || seg.length < 4) continue;
      const straight = path > 0 ? Math.abs(dMain) / path : 0;
      const ok = Math.abs(dMain) >= c.minTravel && Math.abs(dMain) >= c.ratio * Math.abs(dCross) && straight >= c.straight && peak >= c.minPeakSpeed
        && moving >= 3 && step <= cfg.maxStep * Math.abs(dMain);
      if (!ok) continue;
      if (share < c.share) { this.rejectWrongPose(id, other, t); continue; }
      const confidence = 0.35 * clamp01(share) + 0.25 * clamp01(Math.abs(dMain) / (c.minTravel * 1.6)) + 0.2 * clamp01(straight) + 0.2 * clamp01(peak / (c.minPeakSpeed * 2));
      if (confidence < cfg.minConfidence) continue;
      if (!best || confidence > best.confidence) best = { id, confidence, dir: Math.sign(dMain), info: { travel: Math.abs(dMain), ms, straight, peak, share } };
    }
    return best;
  }

  // O movimento certo com a pose errada: explica o que faltou (no máximo um aviso a cada rejectMs).
  rejectWrongPose(id, other, t) {
    const top = Object.entries(other).sort((a, b) => b[1] - a[1])[0];
    const got = top ? top[0] : '';
    let reason;
    if (id === 'corteHorizontal') reason = got === 'v' || got === 'dois dedos' ? 'junte o indicador e o médio (a espada) para o corte' : 'faça a espada: indicador e médio esticados e juntos';
    else reason = got === 'palma' || got === 'espada' || got === 'v' ? 'feche o punho para o golpe' : 'feche bem o punho';
    this.reject(id, reason, t);
  }

  // Postura segurada: a pose certa, parada, por c.ms (o tempo conta só com a mão quase parada).
  detectHold(id, c, t, prog) {
    const h = this.history, cfg = this.config;
    if (this.holdLatch && this.holdLatch.id === id) return null;
    let start = null, n = 0, good = 0;
    for (let i = h.length - 1; i >= 1; i--) {
      const s = h[i], p = h[i - 1];
      const v = dist(s, p) / ((s.t - p.t) / 1000 || 1e-3) / s.palm;
      if (v > c.maxSpeed) break;
      n++;
      if (s.pose === c.pose) good++;
      else if (n - good > 2 && good / n < c.share) break; // a pose mudou de verdade (um quadro solto não quebra)
      start = p.t;
    }
    if (!start || !n || h[h.length - 1].pose !== c.pose) return null;
    const held = h[h.length - 1].t - start, share = good / n;
    if (share >= c.share) { const p = Math.min(1, held / c.ms); if (p > prog.p) { prog.p = p; prog.id = id; } }
    if (held < c.ms || share < c.share) return null;
    this.holdLatch = { id, pose: c.pose };
    return { id, confidence: 0.6 + 0.4 * clamp01(share), dir: 0, info: { held, share } };
  }

  // Círculo com a ponta do indicador: a trilha da pose "apontando" (até maxMs), fechada (o fim volta perto do
  // começo), do tamanho certo; quem confirma a forma é o reconhecedor das runas (src/runes/RuneRecognizer.js).
  detectCircle(t, prog) {
    const c = this.config.circle, h = this.history;
    let i = h.length - 1, bad = 0;
    for (; i > 0 && t - h[i - 1].t <= c.maxMs; i--) { if (h[i - 1].pose !== c.pose && ++bad > 3) break; }
    const seg = h.slice(i);
    if (seg.length < 8) return null;
    const ms = seg[seg.length - 1].t - seg[0].t;
    const good = seg.filter(s => s.pose === c.pose).length / seg.length;
    if (ms < c.minMs || good < c.share) return null;
    const pts = seg.map(s => [s.tip.x, s.tip.y]);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    const palm = seg.map(s => s.palm).sort((p, q) => p - q)[seg.length >> 1];
    const size = Math.max(x1 - x0, y1 - y0) / palm;
    const cp = Math.min(0.9, (size / c.minDiameter) * 0.5);
    if (cp > prog.p) { prog.p = cp; prog.id = 'ondaDeChoque'; }
    if (size < c.minDiameter) return null;
    // fechado: o fim volta perto de algum ponto do primeiro quarto da trilha
    const end = pts[pts.length - 1], sizePx = size * palm;
    const head = pts.slice(0, Math.max(2, pts.length >> 2));
    if (!head.some(p => Math.hypot(p[0] - end[0], p[1] - end[1]) <= c.closeK * sizePx)) return null;
    if (t - this.circleAt < c.everyMs) return null;
    this.circleAt = t;
    const r = this.recognizer.recognize([pts]);
    const circle = r.ranking.find(x => x.id === 'circulo');
    if (!circle || r.id !== 'circulo' || circle.score < c.minScore) return null;
    return { id: 'ondaDeChoque', confidence: circle.score, dir: 0, info: { size, ms, score: circle.score } };
  }

  reject(id, reason, t) {
    if (t - this.lastReject < this.config.rejectMs) return;
    this.lastReject = t;
    if (this.onReject) this.onReject({ id, reason });
  }

  fire(r, t) {
    this.lastFire = t;
    this.history.length = 0; // o mesmo movimento não dispara de novo
    this.pending = null;
    this.live.progress = 0; this.live.id = null;
    if (this.onGesture) this.onGesture(r);
    return r;
  }
}
