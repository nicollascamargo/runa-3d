// Painel de testes: botões que emitem comandos, estado do mago, casa sob o cursor e estatísticas.
export class Hud {
  constructor(commands) {
    this.commands = commands;
    this.panel = document.getElementById('panel');
    this.fpsEl = document.getElementById('statFps');
    this.triEl = document.getElementById('statTris');
    this.boneEl = document.getElementById('statBones');
    this.tileEl = document.getElementById('statTile');
    this.poseEl = document.getElementById('poseName');
    this.toastEl = document.getElementById('toast');
    this.stateEl = document.getElementById('statState');
    this.mageTileEl = document.getElementById('statMageTile');
    this.inputEl = document.getElementById('statInput');
    this.camBtn = document.getElementById('panelCam');
    this.fps = 60;
    this.panel.addEventListener('click', e => {
      const b = e.target.closest('[data-cmd]');
      if (b) commands.emit(b.dataset.cmd, { source: 'mouse', value: b.dataset.value });
    });
    document.getElementById('panelToggle').addEventListener('click', () => this.togglePanel());
  }

  togglePanel() { this.panel.classList.toggle('collapsed'); }

  setPressed(cmd, on) {
    const b = this.panel.querySelector(`[data-cmd="${cmd}"]`);
    if (b) b.setAttribute('aria-pressed', String(on));
  }

  setStats({ tris, bones }) {
    this.triEl.textContent = tris.toLocaleString('pt-BR');
    this.boneEl.textContent = bones;
  }

  setPose(name) { this.poseEl.textContent = name; }

  setTile(tile) { this.tileEl.textContent = tileLabel(tile); }
  setMageTile(tile) { this.mageTileEl.textContent = tileLabel(tile); }
  setState(name) { this.stateEl.textContent = name; }
  setInput(name) { if (this.inputEl.textContent !== name) this.inputEl.textContent = name; }
  setText(id, text) { const e = document.getElementById(id); if (e && e.textContent !== text) e.textContent = text; }
  setCamera(on) { this.camBtn.firstChild.textContent = on ? 'Desligar câmera ' : 'Ligar câmera (gestos) '; }

  toast(text, ms = 2400) {
    this.toastEl.textContent = text;
    this.toastEl.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toastEl.classList.remove('show'), ms);
  }

  update(dt) {
    if (dt > 0) this.fps += (1 / dt - this.fps) * 0.05;
    this.fpsEl.textContent = Math.round(this.fps);
  }
}

const tileLabel = tile => (tile ? `${'ABCDEFGH'[tile.col]}${8 - tile.row}` : '–');
