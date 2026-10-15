// Qualidade gráfica. 'alta' é o padrão; 'média' e 'baixa' aliviam a placa de vídeo.
// A escolha fica salva no navegador. O número de luzes dinâmicas das magias só muda ao recarregar a página
// (trocar a quantidade de luzes faz o Three.js recompilar todos os materiais, um soluço visível).
// Cada luz dinâmica pesa em todos os pixels dos materiais com brilho (o veludo do mago), mesmo apagada.
const LEVELS = {
  alta: { label: 'alta', particles: 1, lights: 2, bloom: true, pixelRatio: 2, trailGlow: true },
  media: { label: 'média', particles: 0.7, lights: 1, bloom: true, pixelRatio: 1.5, trailGlow: true },
  baixa: { label: 'baixa', particles: 0.45, lights: 0, bloom: false, pixelRatio: 1, trailGlow: false },
};
const ORDER = ['alta', 'media', 'baixa'];

const load = () => { try { return localStorage.getItem('runa3d.gfx'); } catch { return null; } };
const save = v => { try { localStorage.setItem('runa3d.gfx', v); } catch { /* sem armazenamento: só não lembra */ } };

export const GFX = { level: LEVELS[load()] ? load() : 'alta' };
Object.assign(GFX, LEVELS[GFX.level]);
GFX.bootLights = GFX.lights; // luzes criadas ao abrir a página

export function applyGfx(engine) {
  engine.renderer.setPixelRatio(Math.min(window.devicePixelRatio, GFX.pixelRatio));
  engine.bloom.enabled = GFX.bloom;
  engine.resize();
}

function setLevel(engine, level) {
  Object.assign(GFX, LEVELS[level], { level });
  save(level);
  applyGfx(engine);
  return GFX;
}

export function cycleGfx(engine) { return setLevel(engine, ORDER[(ORDER.indexOf(GFX.level) + 1) % ORDER.length]); }

// Qualidade automática: mede o tempo real entre quadros e, se o jogo ficar abaixo de 40 quadros por segundo
// por 2,5 s, desce um nível (alta -> média -> baixa) e avisa. Não conta pausas (aba escondida, um alerta),
// nem os primeiros segundos. Escolher a qualidade na mão (tecla L) desliga o ajuste automático.
export class AutoQuality {
  constructor(engine, onChange = () => {}) {
    Object.assign(this, { engine, onChange });
    this.enabled = true;
    this.wait = 4;        // segundos antes de começar a medir (carregamento, câmera ligando)
    this.avg = 0;         // média do tempo entre quadros
    this.slow = 0;        // tempo acumulado abaixo do mínimo
  }

  update(realDt) {
    if (!this.enabled || document.hidden || realDt > 0.25) return;
    if ((this.wait -= realDt) > 0) return;
    this.avg = this.avg ? this.avg * 0.94 + realDt * 0.06 : realDt;
    if (this.avg > 1 / 40) this.slow += realDt; else this.slow = Math.max(0, this.slow - realDt * 0.5);
    if (this.slow < 2.5) return;
    const i = ORDER.indexOf(GFX.level);
    if (i >= ORDER.length - 1) { this.enabled = false; return; } // já está no mínimo
    setLevel(this.engine, ORDER[i + 1]);
    this.slow = 0; this.avg = 0; this.wait = 3;
    this.onChange(GFX, 1 / Math.max(1e-3, realDt));
  }
}
