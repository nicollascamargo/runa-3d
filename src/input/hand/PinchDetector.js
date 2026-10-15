// Pinça (Runa Vision 2.0): decide quando os dedos fecharam (agarrar) e abriram (soltar), sem nada de tela.
//
// Medida: distância entre as pontas do polegar e do indicador dividida pelo tamanho da palma (pulso até o nó do
// dedo médio), em 3D quando o MediaPipe dá a mão em metros: não muda com a distância até a câmera nem com a mão
// de lado. É a mesma medida para fechar e para abrir (antes, soltar usava a menor entre 3D e 2D, que fica pequena
// com a mão de lado e prendia o personagem).
//
// Regras:
//   - suavização curta da medida (smoothMs), para um quadro solto não fechar nem abrir a pinça;
//   - histerese: fecha abaixo de 'on' e só abre acima de 'off' (segurando um personagem, acima de 'offHold');
//   - confirmação curta: abaixo de 'on' por confirmMs (ou bem fechada, abaixo de 'deep', na hora);
//     soltar: acima de 'off' por releaseMs (segurando, releaseHoldMs);
//   - punho não é pinça: o indicador precisa estar minimamente aberto (ponta longe do próprio nó) e o
//     classificador não pode estar certo de que é punho; aceita a pinça com o indicador curvado;
//   - freio: só enquanto os dedos ESTÃO fechando (a medida caindo rápido perto do limite). A mão parada e meio
//     fechada (relaxada) não freia mais o cursor;
//   - a mão some: a pinça fica como estava por lostGraceMs (segurando um personagem, lostGraceHoldMs). Se a mão
//     voltar nesse tempo, nada aconteceu; senão, quem chama decide (soltar se os dedos já abriam, ou cancelar);
//   - calibração individual: com as medidas da mão aberta e fechada do jogador, os limites vão para o meio
//     certo entre as duas (fromCalibration).
// Devolve eventos 'down' e 'up' e um nível de fechamento de 0 a 1 para o indicador visual.

export const PINCH_CONFIG = {
  on: 0.33, off: 0.48, offHold: 0.58, deep: 0.22, // limites (padrão: os de antes, com soltar um pouco mais fácil)
  near: 0.62,          // abaixo disto, fechando rápido: o cursor freia
  closingRate: -1.2,   // palmos por segundo: a medida caindo mais rápido que isto = os dedos estão fechando
  smoothMs: 35,        // suavização da medida (as duas direções)
  confirmMs: 45,       // tempo abaixo de 'on' para fechar (~2 quadros)...
  confirmFrames: 2,    // ...e pelo menos este número de quadros seguidos abaixo de 'on' (um quadro solto não fecha)
  releaseMs: 40, releaseHoldMs: 100,
  indexOpenMin: 0.38,  // ponta do indicador até o próprio nó, em palmos: pinça curvada ~0,45; punho ~0,25
  fistVeto: 0.7,       // o classificador acha punho com esta certeza: não é pinça
  lostGraceMs: 220, lostGraceHoldMs: 700,
};

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// Limites pessoais a partir da calibração: open = medida com a mão aberta e relaxada, closed = pinça fechada.
export function pinchFromCalibration({ open, closed, indexOpen = null } = {}, base = PINCH_CONFIG) {
  if (!(open > 0) || !(closed >= 0) || open - closed < 0.15) return { ...base }; // medidas ruins: fica no padrão
  const span = open - closed, at = k => closed + span * k;
  const on = clamp(at(0.3), 0.18, 0.45);
  const off = clamp(Math.max(at(0.5), on + 0.08), on + 0.08, 0.75);
  const offHold = clamp(Math.max(at(0.62), off + 0.05), off + 0.05, Math.max(off + 0.05, open - 0.06));
  return {
    ...base, on, off, offHold,
    deep: clamp(at(0.12), 0.08, on - 0.05),
    near: clamp(at(0.8), off, open),
    indexOpenMin: indexOpen ? clamp(indexOpen * 0.75, 0.3, base.indexOpenMin) : base.indexOpenMin,
    calibrated: { open, closed, indexOpen },
  };
}

export class PinchDetector {
  constructor(config = PINCH_CONFIG) { this.setConfig(config); this.reset(); }
  setConfig(config) { this.config = { ...PINCH_CONFIG, ...config }; }

  reset() {
    this.pressed = false;
    this.m = null;          // medida suavizada
    this.rate = 0;          // quanto a medida muda por segundo (suavizado)
    this.belowSince = 0;    // desde quando está abaixo de 'on'
    this.belowFrames = 0;
    this.aboveSince = 0;    // desde quando está acima de 'off' (pressionada)
    this.t = null;
    this.lostAt = 0;
    this.braking = false;
    this.lastRaw = null;
  }

  // Nível de fechamento para o desenho (0 aberta, 1 fechada), relativo aos limites deste jogador.
  get level() {
    const c = this.config;
    if (this.pressed) return 1;
    if (this.m === null) return 0;
    return clamp((c.near - this.m) / (c.near - c.on), 0, 1);
  }

  // Estado para o indicador e o diagnóstico: 'aberta' | 'fechando' | 'pinça' | 'abrindo'
  get state() {
    if (this.pressed) return this.aboveSince ? 'abrindo' : 'pinça';
    return this.braking || this.belowSince ? 'fechando' : 'aberta';
  }

  // Um quadro com a mão. f: { t (ms), ratio (medida), indexOpen, fist (certeza de punho, 0 a 1) }.
  // holding: a pinça está segurando um personagem (soltar pede mais certeza). armed: pode começar uma pinça
  // (depois de um gesto, os dedos precisam se abrir antes). Devolve 'down', 'up' ou ''.
  update({ t, ratio, indexOpen = 1, fist = 0 }, { holding = false, armed = true } = {}) {
    const c = this.config;
    this.lostAt = 0;
    this.lastRaw = ratio;
    if (this.m === null || this.t === null || t - this.t > 250) { this.m = ratio; this.rate = 0; this.t = t; }
    else {
      const dt = Math.max(1, t - this.t), a = 1 - Math.exp(-dt / c.smoothMs);
      const prev = this.m;
      this.m += a * (ratio - this.m);
      this.rate += (1 - Math.exp(-dt / 60)) * (((this.m - prev) / dt) * 1000 - this.rate);
      this.t = t;
    }
    const m = this.m;
    if (!this.pressed) {
      this.aboveSince = 0;
      const shape = indexOpen >= c.indexOpenMin && fist < c.fistVeto;
      this.braking = armed && shape && m < c.near && this.rate < c.closingRate;
      if (!armed || !shape || m >= c.on) { this.belowSince = 0; this.belowFrames = 0; return ''; }
      if (!this.belowSince) this.belowSince = t;
      this.belowFrames++;
      // bem fechada (abaixo de 'deep'), basta o número de quadros; senão, também o tempo
      if (this.belowFrames >= c.confirmFrames && (m < c.deep || t - this.belowSince >= c.confirmMs)) {
        this.pressed = true; this.belowSince = 0; this.belowFrames = 0; this.braking = false;
        return 'down';
      }
      return '';
    }
    // pressionada: solta acima de off (segurando, offHold) por um instante
    this.braking = false;
    if (m > (holding ? c.offHold : c.off)) {
      if (!this.aboveSince) this.aboveSince = t;
      if (t - this.aboveSince >= (holding ? c.releaseHoldMs : c.releaseMs)) { this.pressed = false; this.aboveSince = 0; return 'up'; }
    } else this.aboveSince = 0;
    return '';
  }

  // Quadro sem a mão. Devolve '' enquanto dá para esperar, ou 'lost' quando a folga acabou (quem chama decide
  // se solta ou cancela; 'opening' diz se os dedos já estavam abrindo). lastSeen: quando a mão foi vista pela
  // última vez (a folga conta dali); sem ele, do primeiro quadro sem a mão.
  lost(t, { holding = false, lastSeen = null } = {}) {
    if (!this.lostAt) this.lostAt = lastSeen ?? t;
    this.braking = false;
    const grace = this.pressed && holding ? this.config.lostGraceHoldMs : this.config.lostGraceMs;
    return t - this.lostAt > grace ? 'lost' : '';
  }

  get opening() { return this.pressed && !!this.aboveSince; }
}
