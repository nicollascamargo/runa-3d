// Leitura da mão, sem nada de tela: medidas dos dedos, votos dos gestos e o filtro do cursor.
// Veio do Runa 2D. Os números de HAND_CONFIG foram ajustados lá, com mãos de verdade na câmera.

export const HAND_CONFIG = {
  mediapipeVersion: '0.10.21',
  modelUrl: 'https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task',

  // Cursor
  camArea: { x0: 0.15, x1: 0.85, y0: 0.12, y1: 0.72 }, // parte da imagem que cobre a tela inteira (a calibração ajusta)
  anchorTipWeight: 0.15,   // cursor entre o nó (0) e a ponta (1) do indicador: o nó treme menos e não anda na pinça (era 0,35)
  euro: { minCutoff: 1.2, beta: 0.012, dCutoff: 1.0 }, // filtro antigo do cursor (em pixels); o atual é src/input/hand/CursorFilter.js
  offsetDecayMs: 260,      // depois de soltar a pinça, o cursor volta suave para onde a mão aponta

  // Pinça. Medida = distância polegar–indicador ÷ tamanho da palma, em 3D quando o modelo dá profundidade.
  pinchOn: 0.33,           // abaixo disto por 2 quadros, a pinça começa
  pinchDeep: 0.22,         // abaixo disto, começa no mesmo quadro
  pinchOff: 0.48,          // acima disto, a pinça solta (a folga evita cliques duplos)
  pinchOffHold: 0.6,       // segurando o mago, só solta acima disto
  releaseMs: 30,           // tempo com os dedos abertos para soltar um clique
  releaseHoldMs: 120,      // tempo com os dedos abertos para soltar o mago
  pinchBrake: 0.6,         // abaixo disto o cursor freia, para não escorregar enquanto os dedos fecham
  pinchIndexOpen: 0.46,    // ponta do indicador longe do próprio nó: aceita pinça firme, recusa punho
  rearmMs: 80,             // depois de um gesto, os dedos precisam se abrir por esse tempo antes da próxima pinça
  pressFrames: 2,
  rewindMs: 110,           // a pinça vale onde o cursor estava um instante antes de os dedos fecharem
  lostGraceMs: 220,        // a mão pode sumir por esse tempo sem soltar a pinça
  lostGraceHoldMs: 450,    // segurando o mago, a mão pode sumir por mais tempo

  // Gestos: o modelo do MediaPipe e a geometria dos dedos votam juntos
  classifierTrust: 0.9,
  geometryTrust: 0.7,
  geometryVeto: 0.3,       // se a geometria discorda muito, o voto cai pela metade
  smoothMs: 70,            // suavização das probabilidades no tempo
  gestureEnter: 0.6,
  gestureExit: 0.4,
  gestureMargin: 0.12,     // o gesto vencedor precisa ficar essa distância à frente do segundo
  // mão aberta (abre a roda) e punho (confirma) seguram mais tempo: são comandos de magia e não podem disparar sem querer
  holdMs: { Open_Palm: 420, Closed_Fist: 360, Thumb_Down: 320, Thumb_Up: 550, Victory: 480 },
  refractoryMs: 280,       // intervalo mínimo entre dois comandos por gesto
  fastHand: 2.2,           // palmas por segundo: acima disto a mão está em transição e os gestos perdem força
  // Caneta das runas: a ponta do indicador, com o filtro próprio em src/runes/RuneTracker.js
  pointBeatsGestures: true, // um gesto de comando só começa se também vencer o "apontar" (desenhando ou mirando, nada dispara)
};

export const HAND_LINKS = [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [0, 17], [17, 18], [18, 19], [19, 20]];

export const GESTURE_NAMES = {
  Open_Palm: 'Mão aberta', Closed_Fist: 'Punho fechado', Thumb_Up: 'Polegar para cima', Thumb_Down: 'Polegar para baixo',
  Pointing_Up: 'Indicador para cima', Victory: 'Sinal de V', ILoveYou: 'Sinal ILY', None: 'Nenhum gesto',
};
export const COMMAND_GESTURES = ['Open_Palm', 'Closed_Fist', 'Thumb_Down', 'Thumb_Up', 'Victory'];
export const TRACKED = [...COMMAND_GESTURES, 'Pointing_Up'];

export const clamp01 = v => Math.min(1, Math.max(0, v));
const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len3 = v => Math.hypot(v[0], v[1], v[2]);
const cos3 = (a, b) => (a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / ((len3(a) * len3(b)) || 1);

// Filtro One Euro: segura o tremor com a mão parada e quase não atrasa com a mão rápida.
export class OneEuro {
  constructor({ minCutoff, beta, dCutoff }) { Object.assign(this, { minCutoff, beta, dCutoff }); this.reset(); }
  reset() { this.prev = null; this.dPrev = 0; this.tPrev = null; }
  static alpha(cutoff, dt) { const tau = 1 / (2 * Math.PI * cutoff); return 1 / (1 + tau / dt); }
  filter(x, t) {
    if (this.prev === null) { this.prev = x; this.tPrev = t; return x; }
    const dt = Math.max(1e-3, t - this.tPrev);
    this.tPrev = t;
    const d = (x - this.prev) / dt;
    this.dPrev = OneEuro.alpha(this.dCutoff, dt) * d + (1 - OneEuro.alpha(this.dCutoff, dt)) * this.dPrev;
    const a = OneEuro.alpha(this.minCutoff + this.beta * Math.abs(this.dPrev), dt);
    this.prev = a * x + (1 - a) * this.prev;
    return this.prev;
  }
}

// Lê a forma da mão: abertura de cada dedo, pinça e direção do polegar. Usa os pontos em 3D quando existem.
// lm: 21 pontos normalizados da imagem; wl: os mesmos em metros (opcional); cats: votos do classificador.
export function readHand(lm, wl, cats, W = 640, H = 480) {
  const P = wl && wl.length === 21 ? wl.map(p => [p.x, p.y, p.z || 0]) : lm.map(p => [p.x * W, p.y * H, (p.z || 0) * W]);
  const I = lm.map(p => [p.x * W, p.y * H]);
  const d3 = (a, b) => len3(sub3(P[a], P[b]));
  const palm = d3(0, 9) || 1;
  const palmImg = Math.hypot(I[9][0] - I[0][0], I[9][1] - I[0][1]) || 1;
  // Um dedo está esticado quando as falanges estão alinhadas E a ponta está mais longe do pulso que a junta do meio.
  const finger = ([a, b, c, d]) => {
    const s = (cos3(sub3(P[b], P[a]), sub3(P[c], P[b])) + cos3(sub3(P[c], P[b]), sub3(P[d], P[c]))) / 2;
    const straight = clamp01((s - 0.2) / 0.7);
    const reach = clamp01((d3(0, d) / (d3(0, b) || 1) - 0.95) / 0.3);
    return Math.min(straight, reach);
  };
  const ext = {
    thumb: clamp01((d3(4, 5) / palm - 0.35) / 0.35),
    index: finger([5, 6, 7, 8]), middle: finger([9, 10, 11, 12]), ring: finger([13, 14, 15, 16]), pinky: finger([17, 18, 19, 20]),
  };
  const thumbDy = (I[4][1] - I[2][1]) / palmImg; // positivo: polegar apontando para baixo na imagem
  const up = clamp01((-thumbDy - 0.25) / 0.45), down = clamp01((thumbDy - 0.25) / 0.45);
  const curl4 = 1 - (ext.index + ext.middle + ext.ring + ext.pinky) / 4;
  const geo = {
    Open_Palm: (1 - curl4) * (0.6 + 0.4 * ext.thumb),
    Closed_Fist: curl4 * (1 - Math.max(up, down) * ext.thumb),
    Victory: Math.sqrt(ext.index * ext.middle) * (1 - Math.max(ext.ring, ext.pinky)),
    Thumb_Up: curl4 * up * (0.4 + 0.6 * ext.thumb),
    Thumb_Down: curl4 * down * (0.4 + 0.6 * ext.thumb),
    Pointing_Up: ext.index * (1 - Math.max(ext.middle, ext.ring, ext.pinky)),
  };
  const cls = {};
  for (const c of cats) cls[c.categoryName] = c.score;
  const ratio2 = Math.hypot(I[4][0] - I[8][0], I[4][1] - I[8][1]) / palmImg;
  // indexOpen: ponta do indicador até o próprio nó. Pinça leve ~0,7, pinça firme ~0,55, punho ~0,35.
  return { ratio: d3(4, 8) / palm, ratio2, indexOpen: d3(5, 8) / palm, ext, geo, cls, palmImg };
}

// Junta os dois votos (OU ruidoso). Se a geometria discorda muito, o modelo perde metade da força.
export function fuse(f, cfg, speed) {
  const out = {};
  for (const g of TRACKED) {
    const c = f.cls[g] || 0, gm = f.geo[g] || 0;
    let p = 1 - (1 - cfg.classifierTrust * c) * (1 - cfg.geometryTrust * gm);
    if (gm < cfg.geometryVeto) p *= 0.5;
    out[g] = p;
  }
  // fechando a pinça, a mão parece um punho ou uma palma: esses votos perdem força
  if (f.ratio < cfg.pinchBrake && f.indexOpen > cfg.pinchIndexOpen) { out.Open_Palm *= 0.35; out.Closed_Fist *= 0.35; }
  if (speed > cfg.fastHand) for (const g of TRACKED) out[g] *= 0.6;
  return out;
}
