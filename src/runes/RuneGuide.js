// Traçado guiado (ímã): a runa escolhida aparece grande na tela e funciona como um trilho.
// Perto do trilho, a caneta gruda nele; cada trecho por onde ela passa acende. Quando boa parte da runa
// está acesa, ela está feita. É o modo fácil de conjurar: não precisa desenhar de cabeça, só passar por cima.
//
// Regras:
//   - a caneta gruda no trilho dentro de snapRadius (fração do tamanho da runa);
//   - a caneta anda pelo trilho de ponto vizinho em ponto vizinho (janela 'window'): um salto grande não acende
//     o caminho entre os dois pontos, então rabiscar por cima não completa a runa;
//   - interrupções curtas (a câmera perdeu a mão por um instante, ou o dedo saiu um pouco do trilho e voltou
//     perto) não quebram o traço: se a caneta volta em até gapMs, logo à frente de onde estava, o trecho entre
//     os dois pontos acende (até gapWindow do traço; sem interrupção, só a janela normal mais a faixa do ímã,
//     uns 20%). Rabisco não ganha nada com isso: a caneta precisa ter
//     sumido (sem amostras) ou ter ficado perto do trilho durante a saída;
//   - longe do trecho atual mas perto de outro ponto da runa, a caneta recomeça dali (pode começar em qualquer
//     ponto e ir para qualquer lado; o que já acendeu continua aceso);
//   - pronta quando cada traço tem pelo menos 'complete' do seu comprimento aceso, um trecho contínuo de pelo
//     menos 'minRun' (continuidade: pedaços soltos de várias passadas não fecham a runa) E uma varredura de pelo
//     menos 'minSweep': um percurso pelo trilho num sentido só (voltar um pouquinho, o tremor, não conta; voltar
//     mais que 'reverseTol' começa outra varredura) e eficiente: a mão andou no máximo uns 2 trilhos para cada
//     trilho acendido ('minEfficiency'). Quem traça anda num sentido, perto do trilho; um rabisco dentro da faixa do
//     ímã vai e volta o tempo todo e anda muito para acender pouco: não faz uma varredura longa e eficiente.
//   - o ponto no trilho não escorrega muito mais do que a mão andou (slideK): perto de cantos e vértices, um passo
//     pequeno da mão faria a projeção pular longe; aí ele espera a mão chegar.
//   - dois raios: o ímã visual (snapRadius, largo) puxa o cursor para a runa; acender pede estar mais perto
//     (lightRadius).
// Nada de tela aqui: recebe pontos em pixels e devolve onde a caneta grudou e quanto já acendeu.
import { RUNES } from './runeShapes.js';
import { resample, bounds, pathLength } from './RuneRecognizer.js';

// Níveis do traçado guiado (a dificuldade escolhe um; src/runes/difficulty.js).
export const GUIDE_LEVELS = {
  // fácil: faixa larga, aceita com ~72% aceso, perdoa interrupções mais longas
  facil: { pointsPerStroke: 160, snapRadius: 0.27, lightRadius: 0.2, slideK: 1.8, window: 0.12, complete: 0.72, finishEarly: 0.6, magnet: 0.9, gapMs: 650, gapWindow: 0.3, minRun: 0.3, minSweep: 0.5, reverseTol: 0.04, reversePx: 0.09, minEfficiency: 0.45 },
  // normal: faixa moderada, aceita com 80% aceso
  normal: { pointsPerStroke: 160, snapRadius: 0.22, lightRadius: 0.18, slideK: 1.8, window: 0.1, complete: 0.8, finishEarly: 0.7, magnet: 0.85, gapMs: 450, gapWindow: 0.25, minRun: 0.35, minSweep: 0.55, reverseTol: 0.04, reversePx: 0.08, minEfficiency: 0.45 },
};

export const GUIDE_CONFIG = GUIDE_LEVELS.facil;

export class RuneGuide {
  // box: { x, y, size } em pixels: centro e tamanho (maior lado) da runa na tela.
  constructor(runeId, box, config = GUIDE_CONFIG) {
    this.config = { ...GUIDE_LEVELS.facil, ...config };
    this.runeId = runeId;
    const rune = RUNES[runeId];
    const all = rune.strokes.flat();
    const b = bounds(all), k = box.size / Math.max(b.w, b.h);
    const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
    this.size = box.size;
    this.strokes = rune.strokes.map(s => {
      const closed = !!rune.closed;
      let pts = resample(s.map(([x, y]) => [box.x + (x - cx) * k, box.y + (y - cy) * k]), this.config.pointsPerStroke + (closed ? 1 : 0));
      if (closed) pts = pts.slice(0, -1); // o último repete o primeiro
      return { pts, closed, covered: new Uint8Array(pts.length), count: 0, sweep: { dir: 0, pos: 0, max: 0, pen: 0 }, bestSweep: 0, step: pathLength(closed ? [...pts, pts[0]] : pts) / pts.length };
    });
    this.reset();
  }

  reset() {
    for (const s of this.strokes) { s.covered.fill(0); s.count = 0; s.sweep = { dir: 0, pos: 0, max: 0, pen: 0 }; s.bestSweep = 0; }
    this.lastP = null;      // última posição da caneta (para medir quanto a mão andou)
    this.moved = 0;
    this.head = null;       // { s, i }: onde a caneta está no trilho
    this.snapped = null;    // ponto mostrado (grudado)
    this.onPath = false;
    this.errSum = 0; this.errN = 0;
    this.lastT = null;      // hora da última amostra (ms)
    this.off = null;        // saída do trilho em andamento: { at, maxD }
    this.pausedAt = null;   // a câmera perdeu a mão (pause)
    this.dir = 0;           // sentido em que a caneta vem andando no trilho (+1, -1)
    this.bridges = 0;       // interrupções atravessadas (para a depuração e os testes)
    this.started = false;   // a caneta já grudou alguma vez
  }

  get snapPx() { return this.config.snapRadius * this.size; }
  // perto o bastante para acender (o ímã visual alcança mais longe: puxa o cursor, mas só acende quem está perto)
  get lightPx() { return (this.config.lightRadius ?? this.config.snapRadius) * this.size; }

  // índice mais perto de (x, y) num traço, só entre 'from' e 'to' (com volta nos fechados)
  nearest(st, x, y, center = null, span = Infinity) {
    const n = st.pts.length;
    let best = -1, bd = Infinity;
    const scan = i => { const p = st.pts[i], d = (p[0] - x) ** 2 + (p[1] - y) ** 2; if (d < bd) { bd = d; best = i; } };
    if (center === null || span >= n) for (let i = 0; i < n; i++) scan(i);
    else for (let k = -span; k <= span; k++) {
      let i = center + k;
      if (st.closed) i = ((i % n) + n) % n; else if (i < 0 || i >= n) continue;
      scan(i);
    }
    return { i: best, d: Math.sqrt(bd) };
  }

  // passos de a até b pelo caminho mais curto (nos fechados, pode dar a volta)
  delta(st, a, b) {
    const n = st.pts.length;
    let d = b - a;
    if (st.closed) { if (d > n / 2) d -= n; else if (d < -n / 2) d += n; }
    return d;
  }

  // Varredura: quanto a caneta já andou pelo trilho num sentido só (em pontos), desde a última volta para trás,
  // e quanto a mão andou de verdade nesse tempo (pen, em pixels). Só conta se foi eficiente.
  sweepMove(st, delta) {
    const S = st.sweep, d = Math.abs(delta), sg = Math.sign(delta);
    if (!sg) return;
    if (!S.dir) S.dir = sg;
    if (sg === S.dir) { S.pos += d; S.max = Math.max(S.max, S.pos); }
    else {
      S.pos -= d;
      // voltou mais que o tremor: é outra varredura, no sentido novo (começa com o que já voltou)
      // (tolerância: uma fração do traço ou do tamanho da runa, o que for maior: traços curtos, como cada raio do
      // raio duplo, têm pontos muito juntos e o tremor parece uma volta grande)
      if (S.max - S.pos > Math.max(this.config.reverseTol * st.pts.length, (this.config.reversePx ?? 0) * this.size / st.step)) { const back = S.max - S.pos; st.sweep = { dir: sg, pos: back, max: back, pen: back * st.step }; }
    }
    const W = st.sweep, rail = W.max * st.step;
    if (rail >= W.pen * (this.config.minEfficiency ?? 0)) st.bestSweep = Math.max(st.bestSweep, Math.min(1, W.max / st.pts.length));
  }

  cover(st, a, b) {
    const n = st.pts.length, delta = this.delta(st, a, b);
    const dir = Math.sign(delta) || 1;
    if (Math.abs(delta) >= 2) this.dir = dir;
    this.sweepMove(st, delta);
    for (let k = 0; k <= Math.abs(delta); k++) {
      let i = a + dir * k;
      if (st.closed) i = ((i % n) + n) % n;
      if (!st.covered[i]) { st.covered[i] = 1; st.count++; }
    }
  }

  // A câmera perdeu a mão: a caneta fica onde estava por gapMs (se voltar logo, o traço continua).
  pause(t) { this.pausedAt = t ?? this.lastT ?? 0; this.snapped = null; this.onPath = false; }

  // Uma amostra da caneta. down: a caneta está encostada (mouse apertado; com a mão, sempre). t: hora (ms),
  // opcional: sem ela, nenhuma interrupção é atravessada (só o caminho contínuo acende).
  sample(x, y, down = true, t = null) {
    const cfg = this.config, R = this.snapPx, L = this.lightPx;
    let hit = null, slid = null;
    // interrupção: a câmera perdeu a mão (pause ou um buraco nas amostras) ou o dedo saiu do trilho e ficou perto
    let gap = false;
    if (t !== null && this.head) {
      const since = this.pausedAt !== null ? this.pausedAt : this.off ? this.off.at : this.lastT !== null && t - this.lastT > 110 ? this.lastT : null;
      const nearOff = !this.off || this.off.maxD <= R * 2.2; // saiu do trilho, mas sem passear longe
      gap = since !== null && t - since <= cfg.gapMs && nearOff;
      if (since !== null && t - since > cfg.gapMs && this.pausedAt !== null) this.head = null; // demorou: recomeça
    }
    // acender: só perto do trilho (L); o ímã visual (R) alcança mais longe, mas só puxa o cursor
    if (this.head) {
      const st = this.strokes[this.head.s];
      const w = Math.max(3, Math.round(cfg.window * st.pts.length));
      const near = this.nearest(st, x, y, this.head.i, w);
      if (near.d <= L) {
        // o ponto no trilho não pode escorregar muito mais do que a mão andou (perto de cantos e vértices a projeção
        // pula longe com um passo pequeno): escorregou demais, só reposiciona, sem acender
        const slide = Math.abs(this.delta(st, this.head.i, near.i)) * st.step, moved = this.moved + (this.lastP ? Math.hypot(x - this.lastP[0], y - this.lastP[1]) : 0);
        if (slide <= Math.max(moved * cfg.slideK, L * 0.5)) hit = { s: this.head.s, i: near.i, d: near.d, follow: true };
        else slid = { s: this.head.s, i: near.i, d: near.d }; // fica onde estava; o cursor ainda gruda
      }
      else if (gap) {
        // depois de uma interrupção curta: aceita voltar mais à frente, no mesmo sentido em que vinha
        const W2 = Math.max(w, Math.round(cfg.gapWindow * st.pts.length));
        const far = this.nearest(st, x, y, this.head.i, W2);
        const dd = this.delta(st, this.head.i, far.i);
        // e a ponte não pode ser muito maior do que a mão andou durante a interrupção
        const moved = this.moved + (this.lastP ? Math.hypot(x - this.lastP[0], y - this.lastP[1]) : 0);
        if (far.d <= L && (!this.dir || Math.sign(dd) === this.dir || Math.abs(dd) <= w) && Math.abs(dd) * st.step <= Math.max(moved * cfg.slideK, L * 0.5)) { hit = { s: this.head.s, i: far.i, d: far.d, follow: true }; if (Math.abs(dd) > w) this.bridges++; }
      }
    }
    if (!hit && !slid) { // recomeça no ponto da runa mais perto (qualquer traço)
      let best = null;
      this.strokes.forEach((st, s) => { const n = this.nearest(st, x, y); if (n.d <= L && (!best || n.d < best.d)) best = { s, i: n.i, d: n.d, follow: false }; });
      hit = best;
    }
    let show = hit || slid; // onde o cursor aparece grudado
    if (!show && L < R) {
      let best = null;
      this.strokes.forEach((st, s) => { const n = this.nearest(st, x, y, this.head && this.head.s === s ? this.head.i : null, this.head && this.head.s === s ? Math.round(cfg.window * st.pts.length) : Infinity); if (n.i >= 0 && n.d <= R && (!best || n.d < best.d)) best = { s, i: n.i, d: n.d }; });
      show = best;
    }
    // quanto a mão andou (para a eficiência da varredura), inclusive atravessando uma interrupção
    if (down && this.head && this.lastP) this.strokes[this.head.s].sweep.pen += Math.hypot(x - this.lastP[0], y - this.lastP[1]);
    // quanto a mão andou desde a última vez que o ponto no trilho avançou
    this.moved = hit ? 0 : this.moved + (down && this.lastP ? Math.hypot(x - this.lastP[0], y - this.lastP[1]) : 0);
    this.lastP = down ? [x, y] : null;
    if (t !== null) this.lastT = t;
    this.pausedAt = null;
    this.onPath = !!show;
    const m = cfg.magnet;
    if (!hit) {
      if (show) { const p = this.strokes[show.s].pts[show.i]; this.snapped = { x: x + (p[0] - x) * m, y: y + (p[1] - y) * m, rail: { x: p[0], y: p[1] }, far: true }; }
      else this.snapped = null;
      if (!down) this.head = null;
      else if (this.head && t !== null && !slid) { // fora do trilho: começa (ou continua) uma saída
        const d = this.nearest(this.strokes[this.head.s], x, y).d;
        if (!this.off) this.off = { at: t, maxD: d }; else this.off.maxD = Math.max(this.off.maxD, d);
      }
      return this.state();
    }
    this.off = null;
    const st = this.strokes[hit.s], p = st.pts[hit.i];
    if (down) {
      // só acende andando pelo trilho; um salto (recomeço) só reposiciona a caneta
      if (hit.follow) this.cover(st, this.head.i, hit.i);
      else { this.dir = 0; st.sweep = { dir: 0, pos: 0, max: 0, pen: 0 }; } // recomeço: varredura nova
      this.head = { s: hit.s, i: hit.i };
      this.started = true;
      this.errSum += hit.d; this.errN++;
    } else this.head = null;
    this.snapped = { x: x + (p[0] - x) * m, y: y + (p[1] - y) * m, rail: { x: p[0], y: p[1] } };
    return this.state();
  }

  penUp() { this.head = null; this.off = null; this.pausedAt = null; }

  // Maior trecho contínuo aceso de um traço (fração do traço), com volta nos fechados.
  longestRun(st) {
    const n = st.pts.length;
    if (st.count === n) return 1;
    let best = 0, run = 0;
    for (let k = 0; k < (st.closed ? 2 * n : n); k++) {
      if (st.covered[k % n]) { run++; if (run > best) best = run; } else run = 0;
    }
    return Math.min(n, best) / n;
  }

  // Fração acesa: média dos traços (cada traço vale o mesmo).
  get progress() { return this.strokes.reduce((a, s) => a + s.count / s.pts.length, 0) / this.strokes.length; }
  get done() { return this.strokes.every(s => s.count / s.pts.length >= this.config.complete && this.continuous(s)); }
  // pronta para terminar antes (punho/Enter): o mínimo de 'finishEarly' aceso, com a mesma continuidade
  get enough() { return this.strokes.every(s => s.count / s.pts.length >= this.config.finishEarly && this.continuous(s)); }
  // continuidade de um traço: um trecho aceso inteiro e uma varredura longa num sentido só
  continuous(s) { return this.longestRun(s) >= this.config.minRun && s.bestSweep >= this.config.minSweep; }
  // precisão: quão perto do trilho a caneta andou (1 = em cima)
  get accuracy() { return this.errN ? Math.max(0, 1 - this.errSum / this.errN / this.snapPx) : 0; }

  state() { return { snapped: this.snapped, onPath: this.onPath, progress: this.progress, done: this.done }; }

  // O ponto do trilho onde a caneta está e os próximos pontos ainda apagados à frente (para a dica de "siga por aqui").
  headPoint() { if (!this.head) return null; const p = this.strokes[this.head.s].pts[this.head.i]; return { x: p[0], y: p[1] }; }
  ahead(frac = 0.12) {
    if (!this.head) return null;
    const st = this.strokes[this.head.s], n = st.pts.length, dir = this.dir || 1, out = [];
    const steps = Math.round(frac * n);
    for (let k = 1; k <= steps; k++) {
      let i = this.head.i + dir * k;
      if (st.closed) i = ((i % n) + n) % n; else if (i < 0 || i >= n) break;
      out.push(st.pts[i]);
    }
    return out.length > 1 ? out : null;
  }
  // Ponto de partida sugerido (o primeiro traço que falta acender, no começo do desenho).
  startPoint() {
    const s = this.strokes.findIndex(st => st.count / st.pts.length < this.config.complete);
    if (s < 0) return null;
    const st = this.strokes[s];
    return { x: st.pts[0][0], y: st.pts[0][1], next: st.pts[Math.min(st.pts.length - 1, Math.round(st.pts.length * 0.08))], stroke: s };
  }

  // Trechos acesos, como polilinhas (para desenhar a trilha de energia por cima do trilho).
  litStrokes() {
    const out = [];
    for (const st of this.strokes) {
      const n = st.pts.length;
      if (!st.count) continue;
      if (st.count === n) { out.push(st.closed ? [...st.pts, st.pts[0]] : st.pts); continue; }
      // começa num ponto apagado para os trechos que dão a volta saírem inteiros
      let start = 0;
      if (st.closed) { start = st.covered.indexOf(0); }
      let run = [];
      for (let k = 0; k < n; k++) {
        const i = (start + k) % n;
        if (st.covered[i]) run.push(st.pts[i]);
        else { if (run.length > 1) out.push(run); run = []; }
      }
      if (run.length > 1) out.push(run);
    }
    return out;
  }

  // O trilho inteiro (para a guia na tela).
  railStrokes() { return this.strokes.map(st => (st.closed ? [...st.pts, st.pts[0]] : st.pts)); }
}
