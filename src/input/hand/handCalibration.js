// Calibração do jogador (Runa Vision 2.0), sem nada de tela: mede a mão de quem joga e devolve um perfil com os
// limites pessoais. Passos (a interface é src/ui/CalibrationWizard.js):
//   1. mão aberta        abertura natural entre polegar e indicador (o "aberto" da pinça) e o tamanho da palma
//   2. pinça             fechar e abrir três vezes: o "fechado" da pinça e como o indicador fica na pinça
//   3. apontar           o quanto a pose de apontar é lida (a "caneta" das runas no desenho livre)
//   4. alcance           até onde a mão vai (a parte da imagem que cobre a tela) e o tremor com a mão parada
//   5. runa de teste     um círculo no traçado guiado (quem cuida é o jogo; aqui só o resultado)
// Cada passo recebe quadros { t (ms), f (leitura da mão: src/input/hand/handReading.js readHand), pen (0 a 1),
// anchor ({ x, y } na imagem, já espelhado: 1 - x) } e diz quando terminou.

export const CALIB_STEPS = [
  { id: 'aberta', title: 'Mão aberta', text: 'Mostre a palma aberta para a câmera, com os dedos afastados, a uns 50 cm. Segure parada.' },
  { id: 'pinca', title: 'Pinça', text: 'Encoste a ponta do polegar na ponta do indicador e abra de novo. Três vezes, no seu ritmo.' },
  { id: 'apontar', title: 'Apontar', text: 'Aponte com o indicador esticado e os outros dedos dobrados, como quem vai desenhar. Segure.' },
  { id: 'alcance', title: 'Alcance', text: 'Passeie a mão devagar até os cantos que você alcança com conforto: direita, esquerda, cima e baixo. No fim, pare a mão no meio.' },
  { id: 'runa', title: 'Runa de teste', text: 'Comece no ponto que pulsa e passe o indicador por cima do círculo.' },
];

const median = a => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.floor((s.length - 1) / 2)]; };
const quantile = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.round(p * (s.length - 1))]; };
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// Área da câmera a partir das posições da mão (a mesma regra da calibração de alcance antiga).
export function areaFromSamples(xs, ys) {
  const span = (lo, hi) => {
    const pad = 0.03, min = 0.25;
    let a = lo + pad, b = hi - pad;
    if (b - a < min) { const m = (a + b) / 2; a = m - min / 2; b = m + min / 2; }
    return [Math.max(0, a), Math.min(1, b)];
  };
  const [x0, x1] = span(quantile(xs, 0.05), quantile(xs, 0.95));
  const [y0, y1] = span(quantile(ys, 0.05), quantile(ys, 0.95));
  return { x0, x1, y0, y1 };
}

export class HandCalibration {
  constructor({ openMs = 1600, pointMs = 1400, rangeMs = 6000, stillMs = 1200, cycles = 3, stepTimeoutMs = 15000 } = {}) {
    Object.assign(this, { openMs, pointMs, rangeMs, stillMs, cycles, stepTimeoutMs });
    this.results = {};
    this.step = null;
  }

  // t: hora do começo; sem ela, o passo começa a contar no primeiro quadro (o mesmo relógio dos quadros)
  start(id, t = null) {
    this.step = { id, t0: t, valid: 0, lastT: null, data: [], cyc: { phase: 'aberta', min: Infinity, minIndex: null, list: [] }, msg: '' };
  }

  // Um quadro. Devolve { progress (0 a 1), done, msg }.
  sample({ t, f = null, pen = 0, anchor = null }) {
    const S = this.step;
    if (!S) return { progress: 0, done: false, msg: '' };
    if (S.t0 === null) S.t0 = t;
    const dt = S.lastT === null ? 0 : Math.min(100, t - S.lastT);
    S.lastT = t;
    if (t - S.t0 > this.stepTimeoutMs && S.id !== 'runa') return this.finish('tempo');
    if (!f) { S.msg = 'Mão fora da câmera.'; return this.state(); }
    switch (S.id) {
      case 'aberta': {
        const open = f.geo.Open_Palm || 0;
        if (open < 0.55) { S.msg = 'Abra mais os dedos.'; S.valid = Math.max(0, S.valid - dt); break; }
        S.msg = 'Assim. Segure…';
        S.valid += dt;
        S.data.push({ ratio: f.ratio, palm: f.palmImg });
        if (S.valid >= this.openMs) return this.finish();
        break;
      }
      case 'pinca': {
        // ciclos pela medida relativa à mão aberta do passo 1: fechou abaixo de 45% dela, abriu acima de 75%
        const open = (this.results.aberta && this.results.aberta.open) || 1.0, C = S.cyc;
        if (C.phase === 'aberta' && f.ratio < open * 0.45) { C.phase = 'fechada'; C.min = f.ratio; C.minIndex = f.indexOpen; }
        else if (C.phase === 'fechada') {
          if (f.ratio < C.min) { C.min = f.ratio; C.minIndex = f.indexOpen; }
          if (f.ratio > open * 0.75) { C.list.push({ closed: C.min, indexOpen: C.minIndex }); C.phase = 'aberta'; }
        }
        S.msg = C.phase === 'fechada' ? 'Fechou. Agora abra.' : `Pinça ${C.list.length} de ${this.cycles}.`;
        if (C.list.length >= this.cycles) return this.finish();
        break;
      }
      case 'apontar': {
        const point = Math.max(pen, f.geo.Pointing_Up || 0);
        if (point < 0.3) { S.msg = 'Estique só o indicador; dobre os outros dedos.'; S.valid = Math.max(0, S.valid - dt); break; }
        S.msg = 'Assim. Segure…';
        S.valid += dt;
        S.data.push(point);
        if (S.valid >= this.pointMs) return this.finish();
        break;
      }
      case 'alcance': {
        if (!anchor) break;
        S.data.push({ t, x: anchor.x, y: anchor.y });
        const left = this.rangeMs + this.stillMs - (t - S.t0);
        S.msg = t - S.t0 < this.rangeMs ? 'Passeie até os cantos…' : 'Agora pare a mão no meio…';
        if (left <= 0) return this.finish();
        break;
      }
      default: break;
    }
    return this.state();
  }

  state() {
    const S = this.step;
    let progress = 0;
    if (S.id === 'aberta') progress = S.valid / this.openMs;
    else if (S.id === 'apontar') progress = S.valid / this.pointMs;
    else if (S.id === 'pinca') progress = S.cyc.list.length / this.cycles;
    else if (S.id === 'alcance') progress = (S.lastT - S.t0) / (this.rangeMs + this.stillMs);
    return { progress: clamp(progress, 0, 1), done: false, msg: S.msg };
  }

  // Termina o passo atual e guarda o resultado (por tempo esgotado também, com o que deu para medir).
  finish(why = 'ok') {
    const S = this.step;
    if (!S) return { progress: 1, done: true, msg: '' };
    const r = { why };
    if (S.id === 'aberta' && S.data.length) { r.open = median(S.data.map(d => d.ratio)); r.palmImg = median(S.data.map(d => d.palm)); }
    if (S.id === 'pinca' && S.cyc.list.length) { r.closed = median(S.cyc.list.map(c => c.closed)); r.indexOpen = median(S.cyc.list.map(c => c.indexOpen)); r.cycles = S.cyc.list.length; }
    if (S.id === 'apontar' && S.data.length) r.point = median(S.data);
    if (S.id === 'alcance' && S.data.length > 30) {
      const move = S.data.filter(d => d.t - S.t0 < this.rangeMs), still = S.data.filter(d => d.t - S.t0 >= this.rangeMs + 300);
      r.camArea = areaFromSamples(move.map(d => d.x), move.map(d => d.y));
      if (still.length > 8) {
        const mx = still.reduce((a, d) => a + d.x, 0) / still.length, my = still.reduce((a, d) => a + d.y, 0) / still.length;
        r.tremor = Math.sqrt(still.reduce((a, d) => a + (d.x - mx) ** 2 + (d.y - my) ** 2, 0) / still.length); // fração da imagem
      }
    }
    this.results[S.id] = r;
    this.step = null;
    return { progress: 1, done: true, msg: why === 'tempo' ? 'Tempo esgotado: guardei o que deu para medir.' : 'Pronto.' };
  }

  // Resultado da runa de teste (quem mede é o jogo).
  setRune({ ok, ms, accuracy = null }) { this.results.runa = { ok, ms, accuracy }; }

  // O perfil do jogador. Só entra o que foi medido direito; o resto fica no padrão do jogo.
  profile() {
    const R = this.results, p = { versao: 1, em: new Date().toISOString(), medidas: R };
    if (R.aberta && R.aberta.open && R.pinca && R.pinca.closed !== undefined && R.aberta.open - R.pinca.closed >= 0.15) {
      p.pinch = { open: R.aberta.open, closed: R.pinca.closed, indexOpen: R.pinca.indexOpen };
    }
    if (R.apontar && R.apontar.point) {
      // a caneta encosta um pouco abaixo de como a pose de apontar deste jogador é lida
      const on = clamp(R.apontar.point * 0.7, 0.35, 0.6);
      p.pen = { on, off: clamp(on * 0.6, 0.2, on - 0.1) };
    }
    if (R.alcance && R.alcance.camArea) p.camArea = R.alcance.camArea;
    if (R.alcance && R.alcance.tremor !== undefined) {
      p.tremor = R.alcance.tremor;
      // mão que treme mais: o filtro do cursor segura um pouco mais com a mão parada
      p.cursor = { minCutoff: R.alcance.tremor > 0.004 ? 0.6 : R.alcance.tremor > 0.0025 ? 0.75 : 0.9 };
    }
    if (R.runa) p.sugestao = R.runa.ok && R.runa.ms && R.runa.ms < 4000 ? 'normal' : 'facil';
    return p;
  }
}
