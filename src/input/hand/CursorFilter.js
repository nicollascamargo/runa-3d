// Filtro do cursor da mão (Runa Vision 2.0). Um filtro só, no lugar certo:
//   - trabalha em coordenadas normalizadas da área da câmera (0 a 1), não em pixels de tela: o mesmo gesto da
//     mão se comporta igual numa tela pequena ou grande;
//   - One Euro em 2D (Casiez, Roussel e Vogel, CHI 2012): a velocidade é a do vetor (não de cada eixo), então
//     o corte é o mesmo nos dois eixos e a diagonal não entorta;
//   - a derivada (velocidade) é estimada já sem o tremor fino e com um corte mais alto que o do filtro antigo:
//     parado, o tremor não engana o filtro; ao começar a mexer, ele solta logo;
//   - usa a hora real de cada quadro (a da captura, quando o navegador dá), não a hora do processamento;
//   - recusa um salto impossível de um quadro só (o MediaPipe errando a mão por um instante); se o quadro
//     seguinte confirma o salto, aceita (a mão foi achada em outro lugar);
//   - entre um quadro da câmera e outro (30 por segundo), a tela (60 ou 120) pode mostrar o cursor um pouco à
//     frente, pela velocidade filtrada (predict): menos degraus e menos atraso visível, com teto pequeno.
// Nada de tela aqui: recebe (x, y, t) e devolve a posição filtrada. Testado em tests/cursor.test.mjs.

// Números escolhidos na bancada tests/cursorBench.mjs (busca em grade; ver tests/cursor.test.mjs). Sintéticos:
// confirme com a câmera de verdade no modo de avaliação.
export const CURSOR_CONFIG = {
  minCutoff: 0.9,     // Hz: corte com a mão parada (menor = segura mais o tremor)
  beta: 45,           // quanto o corte sobe com a velocidade (por área da câmera por segundo)
  dCutoff: 3.5,       // Hz: corte da estimativa de velocidade
  jumpPalms: 1.2,     // um quadro que pula mais que isto (em palmos; ~36 palmos por segundo) é suspeito
  predictMs: 30,      // na tela, adiantar no máximo isto (ms) pela velocidade
  predictMinSpeed: 0.05, // abaixo desta velocidade (área/s), não adianta nada (parado não "escorrega")
  predictSlack: 6,    // ms: quanto o desenho pode passar da última medida (numa freada, passa no máximo isto)
};

const alpha = (cutoff, dt) => { const tau = 1 / (2 * Math.PI * cutoff); return 1 / (1 + tau / dt); };

export class CursorFilter {
  constructor(config = {}) {
    this.config = { ...CURSOR_CONFIG, ...config };
    this.reset();
  }

  reset() {
    this.x = null; this.y = null;       // posição filtrada
    this.vx = 0; this.vy = 0;           // velocidade filtrada (área por segundo)
    this.t = null;                      // hora do último quadro (s)
    this.pending = null;                // salto suspeito esperando confirmação
    this.raw = null;                    // última amostra crua aceita
    this.rejected = 0;                  // saltos recusados (para o diagnóstico)
  }

  get speed() { return Math.hypot(this.vx, this.vy); }

  // x, y: posição crua (0 a 1 na área da câmera); t: segundos; palm: tamanho da palma na mesma unidade (para o
  // teste de salto). Devolve { x, y }.
  filter(x, y, t, palm = 0.08) {
    const c = this.config;
    if (this.x === null || this.t === null || t <= this.t) {
      if (this.x === null || this.t === null) { this.x = x; this.y = y; this.t = t; this.raw = { x, y }; this.vx = this.vy = 0; }
      return { x: this.x, y: this.y };
    }
    // salto de um quadro: mais que jumpPalms palmos desde a última amostra aceita, num intervalo normal
    const dt = Math.min(0.25, t - this.t);
    const jump = Math.hypot(x - this.raw.x, y - this.raw.y);
    if (jump > c.jumpPalms * palm && dt < 0.1) {
      if (!this.pending || Math.hypot(x - this.pending.x, y - this.pending.y) > c.jumpPalms * palm * 0.5) {
        this.pending = { x, y, t };
        this.rejected++;
        return { x: this.x, y: this.y };
      }
      // o quadro seguinte confirmou: a mão está mesmo lá. Recomeça dali, sem arrastar o cursor pelo caminho
      this.pending = null;
      this.x = x; this.y = y; this.t = t; this.raw = { x, y }; this.vx = this.vy = 0;
      return { x, y };
    }
    this.pending = null;
    this.raw = { x, y };
    // velocidade: derivada da amostra crua em relação à posição filtrada anterior (já sem o tremor fino),
    // passada por um filtro passa-baixa próprio
    const ad = alpha(c.dCutoff, dt);
    this.vx += ad * ((x - this.x) / dt - this.vx);
    this.vy += ad * ((y - this.y) / dt - this.vy);
    const a = alpha(c.minCutoff + c.beta * this.speed, dt);
    this.x += a * (x - this.x);
    this.y += a * (y - this.y);
    this.t = t;
    return { x: this.x, y: this.y };
  }

  // Posição para desenhar na tela agora (tNow em segundos): adianta pela velocidade, no máximo predictMs, só
  // com a mão andando, e nunca além da última posição medida da mão (andando, a medida está à frente do filtro e o
  // adiantamento ajuda; numa parada brusca, ele some sozinho em vez de passar do ponto). Não muda o filtro.
  predict(tNow) {
    if (this.x === null) return null;
    const c = this.config, s = this.speed;
    if (s < c.predictMinSpeed || this.t === null || !this.raw) return { x: this.x, y: this.y };
    const ahead = Math.max(0, Math.min(c.predictMs / 1000, tNow - this.t));
    const k = Math.min(1, (s - c.predictMinSpeed) / c.predictMinSpeed); // entra suave
    let px = this.vx * ahead * k, py = this.vy * ahead * k;
    const len = Math.hypot(px, py);
    if (len > 0) {
      // até a medida, no sentido do movimento, mais uma folga pequena (predictSlack da velocidade)
      const room = Math.max(0, ((this.raw.x - this.x) * this.vx + (this.raw.y - this.y) * this.vy) / s) + s * c.predictSlack / 1000;
      if (len > room) { px *= room / len; py *= room / len; }
    }
    return { x: this.x + px, y: this.y + py };
  }
}
