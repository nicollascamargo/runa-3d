// Treino de runas: escolher uma runa, ver o símbolo, desenhar (câmera ou mouse) e ver acertos, erros, a nota
// e o tempo de cada tentativa, sem gastar mana nem turno. O cartão da magia (em cima) mostra o passo a passo
// e o medidor; este painel (à esquerda) mostra as runas, o placar da sessão e as ferramentas (exportar, zerar).
// "Rabisco livre" mede falsos disparos: desenhe qualquer coisa que não seja runa e veja se alguma dispara.
import { RUNES } from '../runes/runeShapes.js';
import { runeSvg } from './SpellUi.js';
import { PALETTE } from './RuneCanvas.js';

const el = (tag, cls, parent, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; if (parent) parent.appendChild(e); return e; };
const ELEMENT_OF = { circulo: 'fogo', onda: 'fogo', v: 'gelo', losango: 'gelo', raio: 'raio', raioDuplo: 'raio', triangulo: 'terra', espiral: 'terra' };
const pct = v => `${Math.round(v * 100)}%`;
const secs = ms => (ms ? `${(ms / 1000).toFixed(1).replace('.', ',')} s` : '—');

export class RuneTrainerUi {
  constructor(runeIds, spells = []) {
    this.runeIds = runeIds;
    this.onRune = null; this.onCommand = null;
    this.panel = el('section', 'rune-trainer', document.body);
    this.panel.hidden = true;
    this.panel.setAttribute('aria-label', 'Treino de runas');
    const spellOf = id => spells.find(s => s.rune === id);
    this.panel.innerHTML = `
      <div class="rt-head"><b>Treino de runas</b><button type="button" class="rt-close" data-cmd="rune.trainer" aria-label="Fechar o treino">Fechar <kbd>Esc</kbd></button></div>
      <p class="rt-diff"></p>
      <div class="rt-grid">${runeIds.map(id => `<button type="button" class="rt-rune" data-rune="${id}" style="--c:${PALETTE[ELEMENT_OF[id]].ui}" title="${RUNES[id].name}${spellOf(id) ? ` (${spellOf(id).name})` : ''}: ${RUNES[id].hint}">${runeSvg(id, 34)}<span class="rt-name">${RUNES[id].name}</span><span class="rt-st">—</span></button>`).join('')}</div>
      <button type="button" class="rt-rune rt-free" data-rune="livre" title="Desenhe qualquer coisa que não seja runa: conta quantas vezes uma magia dispararia sem querer"><span class="rt-name">Rabisco livre</span><span class="rt-st">falsos disparos: —</span></button>
      <div class="rt-last" aria-live="polite"></div>
      <dl class="rt-sum"></dl>
      <div class="rt-tools"><button type="button" data-cmd="rune.practiceExport">Exportar resultados</button><button type="button" data-cmd="rune.practiceReset">Zerar</button></div>`;
    this.panel.addEventListener('click', e => {
      const r = e.target.closest('[data-rune]');
      if (r && this.onRune) { this.onRune(r.dataset.rune); return; }
      const c = e.target.closest('[data-cmd]');
      if (c && this.onCommand) this.onCommand(c.dataset.cmd);
    });
    const q = s => this.panel.querySelector(s);
    Object.assign(this, { diff: q('.rt-diff'), last: q('.rt-last'), sum: q('.rt-sum') });
  }

  get open() { return !this.panel.hidden; }
  show(on) { this.panel.hidden = !on; }

  setCurrent(rune) { for (const b of this.panel.querySelectorAll('[data-rune]')) b.setAttribute('aria-pressed', String(b.dataset.rune === rune)); }

  // trainer: o registro (src/runes/RunePractice.js); difficulty: a dificuldade atual; last: a última tentativa
  update(trainer, difficulty, last = null) {
    this.diff.innerHTML = `Dificuldade <b>${difficulty.name}</b>: ${difficulty.summary}. Mude em Configurações.`;
    for (const b of this.panel.querySelectorAll('[data-rune]')) {
      const id = b.dataset.rune, st = trainer.stats({ rune: id, session: true });
      b.querySelector('.rt-st').textContent = id === 'livre'
        ? `falsos disparos: ${st.attempts ? `${st.wrong} de ${st.attempts}` : '—'}`
        : st.attempts ? `${st.hits}/${st.attempts} · ${secs(st.avgMs)}` : '—';
    }
    if (last) {
      const it = last.item, name = it.rune === 'livre' ? 'Rabisco' : RUNES[it.rune].name;
      const text = it.rune === 'livre'
        ? (it.ok ? 'nenhuma runa disparou' : `falso disparo: ${RUNES[it.read].name.toLowerCase()}`)
        : it.ok ? `acerto · nota ${pct(it.score)}${last.accuracy != null ? ` · precisão ${pct(last.accuracy)}` : ''}` : `erro${it.read ? ` (leu ${RUNES[it.read].name.toLowerCase()})` : ''} · ${pct(it.score)} parecido`;
      this.last.className = `rt-last ${it.ok ? 'ok' : 'err'}`;
      this.last.textContent = `${name}: ${text} · ${secs(it.ms)}`;
    }
    const all = trainer.stats({ session: true }), runes = trainer.attempts.filter(a => trainer.inSession(a) && a.rune !== 'livre');
    const real = runes.length ? trainer.constructor.summarize(runes) : null;
    this.sum.innerHTML = real
      ? `<dt>Nesta sessão</dt><dd>${real.hits} de ${real.attempts} (${pct(real.rate)})</dd><dt>Tempo médio</dt><dd>${secs(real.avgMs)} por tentativa</dd><dt>Runa trocada</dt><dd>${real.wrong} ${real.wrong === 1 ? 'vez' : 'vezes'}</dd>`
      : all.attempts ? '' : '<dt>Nesta sessão</dt><dd>nenhuma tentativa ainda</dd>';
  }
}
