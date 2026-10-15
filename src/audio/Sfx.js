// Sons curtos sintetizados na hora (sem arquivos). É o gancho de áudio do jogo:
// cada evento chama sfx.play('nome'). Para trocar por sons gravados, basta mudar play().
const TONES = {
  press: [[620, 0.035, 0.035]],
  confirm: [[523, 0.05, 0.045], [784, 0.07, 0.045]],
  grab: [[392, 0.05, 0.04], [587, 0.06, 0.04], [880, 0.09, 0.035]],
  drop: [[587, 0.05, 0.045], [880, 0.06, 0.045]],
  land: [[196, 0.09, 0.06], [392, 0.12, 0.035]],
  back: [[494, 0.05, 0.04], [370, 0.07, 0.04]],
  error: [[180, 0.12, 0.05]],
  rune: [[523, 0.06, 0.04], [659, 0.06, 0.04], [784, 0.07, 0.04], [1047, 0.16, 0.035]],
  cast: [[294, 0.06, 0.05], [440, 0.08, 0.05], [220, 0.18, 0.04]],
  turn: [[392, 0.07, 0.035], [330, 0.1, 0.035]],
};

export class Sfx {
  constructor() {
    this.on = true;
    this.ctx = null;
    // o navegador só libera o áudio depois de um clique ou tecla
    const unlock = () => this.unlock();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
  }

  unlock() {
    if (!this.on) return;
    try {
      if (!this.ctx) { const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return; this.ctx = new AC(); }
      if (this.ctx.state === 'suspended') this.ctx.resume();
    } catch { /* sem áudio: o jogo segue mudo */ }
  }

  play(kind) {
    if (!this.on || !this.ctx || this.ctx.state !== 'running') return;
    try {
      let t = this.ctx.currentTime;
      for (const [freq, dur, vol] of TONES[kind] || []) {
        const o = this.ctx.createOscillator(), g = this.ctx.createGain();
        o.type = 'triangle';
        o.frequency.value = freq;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(g).connect(this.ctx.destination);
        o.start(t);
        o.stop(t + dur + 0.02);
        t += dur * 0.85;
      }
    } catch { /* ignora */ }
  }
}
