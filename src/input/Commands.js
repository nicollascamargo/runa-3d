// Camada de comandos. O jogo só conhece comandos ("girar câmera", "próxima pose", "pegar o mago"...).
// Teclado, mouse e a mão na câmera (src/input/HandInput.js) são apenas fontes que emitem esses comandos.
// O ponteiro tem cinco comandos, iguais para o mouse e para a mão:
//   pointer.move, pointer.down, pointer.up, pointer.cancel e pointer.leave, com { x, y } de -1 a 1 e a fonte.
export class Commands {
  constructor() {
    this.handlers = new Map();
    this.log = [];
  }

  on(name, fn) {
    if (!this.handlers.has(name)) this.handlers.set(name, new Set());
    this.handlers.get(name).add(fn);
    return () => this.handlers.get(name).delete(fn);
  }

  emit(name, payload = {}) {
    this.log.push({ name, source: payload.source || 'code', at: performance.now() });
    if (this.log.length > 50) this.log.shift();
    const set = this.handlers.get(name);
    if (!set) return false;
    for (const fn of set) fn(payload);
    return true;
  }
}

// Fonte: teclado. 'map' liga tecla -> comando.
export function keyboardSource(commands, map) {
  window.addEventListener('keydown', e => {
    if (e.target.closest && e.target.closest('input, textarea')) return;
    const cmd = map[e.key.toLowerCase()];
    if (!cmd) return;
    e.preventDefault();
    commands.emit(cmd, { source: 'keyboard', key: e.key });
  });
}

// Fonte: ponteiro (mouse ou toque) sobre o palco 3D. Emite posições normalizadas; quem ouve decide
// o que fazer (destacar a casa, pegar e levar o mago).
export function pointerSource(commands, element) {
  const norm = e => {
    const r = element.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * 2 - 1, y: -((e.clientY - r.top) / r.height) * 2 + 1, px: e.clientX, py: e.clientY, source: 'mouse' };
  };
  let down = false;
  element.addEventListener('pointermove', e => commands.emit('pointer.move', norm(e)));
  element.addEventListener('pointerleave', () => { if (!down) commands.emit('pointer.leave', { source: 'mouse' }); });
  element.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    down = true;
    try { element.setPointerCapture(e.pointerId); } catch { /* sem captura: segue sem */ }
    commands.emit('pointer.down', norm(e));
  });
  element.addEventListener('pointerup', e => {
    if (e.button !== 0 || !down) return;
    down = false;
    commands.emit('pointer.up', norm(e));
  });
  element.addEventListener('pointercancel', e => { if (down) { down = false; commands.emit('pointer.cancel', norm(e)); } });
}
