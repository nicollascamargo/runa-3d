// Interface das magias, no mesmo estilo do painel do jogo:
//   roda de magias (mão aberta): oito setores com a runa, o nome, a mana e a recarga de cada uma;
//   cartão da magia (em cima, no meio): nome, runa escolhida, o que fazer agora, confiança do desenho,
//     números, descrição, alvo e mensagens de acerto e erro;
//   barra de combate (embaixo): rodada, de quem é o turno, vida e mana do mago, as oito magias com recarga;
//   depuração das runas (tecla D): os pontos capturados, a runa reconhecida e a nota de cada uma.
import { RUNES } from '../runes/runeShapes.js';
import { PALETTE } from './RuneCanvas.js';
import { ELEMENT_LABEL } from '../spells/spellBook.js';
import { RECOGNIZER_CONFIG } from '../runes/RuneRecognizer.js';

const el = (tag, cls, parent, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; if (parent) parent.appendChild(e); return e; };
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Ícone SVG da runa (os traços do modelo, com o ponto de partida).
export function runeSvg(id, size = 44, stroke = 'currentColor', dot = true) {
  const r = RUNES[id];
  if (!r) return '';
  const pad = size * 0.14, s = size - pad * 2;
  const all = r.strokes.flat();
  const xs = all.map(p => p[0]), ys = all.map(p => p[1]);
  const w = Math.max(...xs) - Math.min(...xs), h = Math.max(...ys) - Math.min(...ys), k = s / Math.max(w, h);
  const ox = pad + (s - w * k) / 2 - Math.min(...xs) * k, oy = pad + (s - h * k) / 2 - Math.min(...ys) * k;
  const lines = r.strokes.map(st => `<polyline points="${st.map(([x, y]) => `${(ox + x * k).toFixed(1)},${(oy + y * k).toFixed(1)}`).join(' ')}"/>`).join('');
  const dots = dot ? r.strokes.map(st => `<circle cx="${(ox + st[0][0] * k).toFixed(1)}" cy="${(oy + st[0][1] * k).toFixed(1)}" r="${(size * 0.05).toFixed(1)}"/>`).join('') : '';
  return `<svg class="rune-svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" aria-hidden="true"><g fill="none" stroke="${stroke}" stroke-width="${(size * 0.055).toFixed(1)}" stroke-linecap="round" stroke-linejoin="round">${lines}</g><g fill="${stroke}">${dots}</g></svg>`;
}

export class SpellUi {
  constructor(spells) {
    this.spells = spells;
    // ---------- roda ----------
    this.wheel = el('div', 'spell-wheel', document.body);
    this.wheel.hidden = true;
    this.wheel.setAttribute('role', 'dialog');
    this.wheel.setAttribute('aria-label', 'Roda de magias');
    this.ring = el('div', 'wheel-ring', this.wheel);
    this.center = el('div', 'wheel-center', this.ring);
    this.sectors = spells.map((s, i) => {
      const b = el('button', `wheel-sector ${s.element}`, this.ring);
      b.type = 'button';
      b.dataset.index = i;
      const a = -Math.PI / 2 + (i / spells.length) * Math.PI * 2;
      b.style.setProperty('--x', Math.cos(a).toFixed(3));
      b.style.setProperty('--y', Math.sin(a).toFixed(3));
      b.style.setProperty('--c', PALETTE[s.element].ui);
      b.innerHTML = `${runeSvg(s.rune, 40)}<b>${esc(s.name)}</b><small class="cost">${s.mana} mana</small><span class="cd"></span>`;
      return b;
    });
    this.highlighted = -1;

    // ---------- cartão ----------
    this.card = el('section', 'spell-card', document.body);
    this.card.hidden = true;
    this.card.setAttribute('aria-live', 'polite');
    this.card.innerHTML = `
      <div class="sc-head"><div class="sc-rune"></div><div><h3 class="sc-name"></h3><span class="sc-el"></span></div></div>
      <p class="sc-step"></p>
      <div class="sc-meter"><span class="sc-meter-bar"><i></i><em></em></span><span class="sc-meter-text"></span></div>
      <p class="sc-stats"></p>
      <p class="sc-desc"></p>
      <p class="sc-target"></p>
      <p class="sc-msg"></p>`;
    const q = s => this.card.querySelector(s);
    Object.assign(this, { cRune: q('.sc-rune'), cName: q('.sc-name'), cEl: q('.sc-el'), cStep: q('.sc-step'), cMeter: q('.sc-meter'), cBar: q('.sc-meter-bar i'), cMark: q('.sc-meter-bar em'), cMeterText: q('.sc-meter-text'), cStats: q('.sc-stats'), cDesc: q('.sc-desc'), cTarget: q('.sc-target'), cMsg: q('.sc-msg') });
    this.cMark.style.left = `${RECOGNIZER_CONFIG.minScore * 100}%`;

    // ---------- barra de combate ----------
    this.bar = el('section', 'combat-bar', document.body);
    this.bar.setAttribute('aria-label', 'Combate');
    this.bar.innerHTML = `
      <div class="cb-turn"><b class="cb-phase">Seu turno</b><span class="cb-round">Rodada 1</span></div>
      <div class="cb-res">
        <span class="cb-row"><span class="cb-label">Vida</span><span class="cb-meter hp"><i></i></span><span class="cb-num hp-num"></span></span>
        <span class="cb-row"><span class="cb-label">Mana</span><span class="cb-meter mana"><i></i></span><span class="cb-num mana-num"></span></span>
      </div>
      <div class="cb-slots"></div>
      <button type="button" class="cb-end" data-cmd="turn.end">Encerrar turno <kbd>N</kbd></button>`;
    const b = s => this.bar.querySelector(s);
    Object.assign(this, { bPhase: b('.cb-phase'), bRound: b('.cb-round'), bHp: b('.hp i'), bHpNum: b('.hp-num'), bMana: b('.mana i'), bManaNum: b('.mana-num'), bEnd: b('.cb-end') });
    this.slots = spells.map((s, i) => {
      const d = el('button', `cb-slot ${s.element}`, b('.cb-slots'));
      d.type = 'button';
      d.dataset.index = i;
      d.style.setProperty('--c', PALETTE[s.element].ui);
      d.title = `${s.name} (${i + 1})`;
      d.innerHTML = `${runeSvg(s.rune, 28, 'currentColor', false)}<span class="cd"></span><kbd>${i + 1}</kbd>`;
      return d;
    });
    this.onSlot = null; this.onSector = null; this.onCommand = null;
    this.bar.addEventListener('click', e => {
      const slot = e.target.closest('.cb-slot');
      if (slot && this.onSlot) this.onSlot(+slot.dataset.index);
      const cmd = e.target.closest('[data-cmd]');
      if (cmd && this.onCommand) this.onCommand(cmd.dataset.cmd);
    });
    this.ring.addEventListener('click', e => { const s = e.target.closest('.wheel-sector'); if (s && this.onSector) this.onSector(+s.dataset.index); });

    // ---------- depuração ----------
    this.debug = el('section', 'rune-debug', document.body);
    this.debug.hidden = true;
    this.debug.innerHTML = `<h4>Depuração das runas <kbd>D</kbd></h4><canvas width="240" height="150"></canvas><pre></pre>`;
    this.dCanvas = this.debug.querySelector('canvas');
    this.dText = this.debug.querySelector('pre');
  }

  // ---------- roda ----------
  openWheel(states) {
    this.wheel.hidden = false;
    requestAnimationFrame(() => this.wheel.classList.add('open'));
    this.refreshWheel(states);
  }

  closeWheel() { this.wheel.classList.remove('open'); this.wheel.hidden = true; this.highlighted = -1; }

  // states[i] = { ok, reason, cooldown }
  refreshWheel(states) {
    this.sectors.forEach((b, i) => {
      const st = states[i];
      b.classList.toggle('locked', !st.ok);
      b.classList.toggle('soon', !this.spells[i].ready);
      b.querySelector('.cd').textContent = !this.spells[i].ready ? 'em breve' : st.cooldown ? `recarga ${st.cooldown}` : st.ok ? '' : st.reason;
    });
    this.renderCenter(states);
  }

  highlight(i, states) {
    if (i === this.highlighted) return;
    this.highlighted = i;
    this.sectors.forEach((b, k) => b.classList.toggle('hot', k === i));
    this.renderCenter(states);
  }

  renderCenter(states) {
    const i = this.highlighted, s = this.spells[i];
    if (!s) { this.center.innerHTML = '<b>Escolha uma magia</b><span>aponte para um setor e feche o punho, ou clique</span>'; return; }
    const st = states[i];
    this.center.innerHTML = `<b style="color:${PALETTE[s.element].ui}">${esc(s.name)}</b><span>${esc(RUNES[s.rune].hint)}</span>
      <span class="wc-stats">${statsLine(s)}</span>
      <span class="wc-state ${st.ok ? 'ok' : 'no'}">${st.ok ? 'feche o punho para escolher' : esc(st.reason)}</span>`;
  }

  // Setor sob um ponto da tela (-1 = nenhum). O centro da roda não escolhe nada.
  sectorAt(px, py) {
    if (this.wheel.hidden) return -1;
    const r = this.ring.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2, R = r.width / 2;
    const dx = px - cx, dy = py - cy, d = Math.hypot(dx, dy);
    if (d < R * 0.3 || d > R * 1.7) return -1;
    let a = Math.atan2(dy, dx) + Math.PI / 2;
    if (a < 0) a += Math.PI * 2;
    return Math.round(a / (Math.PI * 2 / this.spells.length)) % this.spells.length;
  }

  // ---------- cartão ----------
  showCard(spell) {
    this.card.hidden = false;
    this.card.classList.remove('practice');
    this.card.style.setProperty('--c', PALETTE[spell.element].ui);
    this.cRune.innerHTML = runeSvg(spell.rune, 64);
    this.cName.textContent = spell.name;
    this.cEl.textContent = `${ELEMENT_LABEL[spell.element]} · runa: ${RUNES[spell.rune].name}`;
    this.cStats.innerHTML = statsLine(spell);
    this.cDesc.textContent = spell.description;
    this.setMeter(null);
    this.setTarget('');
    this.setMessage('');
  }

  // Cartão do treino de runas: a runa pedida, a dificuldade e o que conta como acerto.
  showPracticeCard(spell, difficulty) {
    this.card.hidden = false;
    this.card.classList.add('practice');
    this.card.style.setProperty('--c', PALETTE[spell.element].ui);
    this.cRune.innerHTML = spell.rune ? runeSvg(spell.rune, 64) : '<span class="sc-scribble">?</span>';
    this.cName.textContent = spell.name;
    this.cEl.textContent = `Treino · dificuldade ${difficulty.name}${spell.rune ? ` · ${RUNES[spell.rune].hint}` : ''}`;
    this.cStats.innerHTML = spell.rune ? `sem mana, sem turno · ${difficulty.guided === 'nunca' || !difficulty.showGuide ? 'desenho livre' : difficulty.summary}` : 'conta quantas vezes um desenho qualquer dispararia uma magia';
    this.cDesc.textContent = '';
    this.setMeter(null);
    this.setTarget('');
    this.setMessage('');
  }

  hideCard() { this.card.hidden = true; this.card.classList.remove('practice'); }
  // desenhando, o cartão encolhe para não esconder a área do desenho
  setCompact(on) { this.card.classList.toggle('compact', on); }
  setStep(html) { this.cStep.innerHTML = html; }

  // Nota mínima do desenho livre (muda com a dificuldade): onde fica a marca do medidor.
  setThreshold(v) { this.threshold = v; }

  // Confiança do desenho: nota da runa esperada (0 a 1); a marca mostra o mínimo para aceitar
  // (no traçado guiado, mark = a fração acesa em que a runa vale).
  setMeter(score, label = '', mark = null) {
    this.cMeter.hidden = score === null;
    if (score === null) return;
    const need = mark ?? this.threshold ?? RECOGNIZER_CONFIG.minScore;
    this.cMark.style.left = `${need * 100}%`;
    this.cBar.style.width = `${Math.round(Math.min(1, score) * 100)}%`;
    this.cMeter.classList.toggle('good', score >= need);
    this.cMeterText.textContent = label || `${Math.round(score * 100)}% parecido`;
  }

  setTarget(html) { this.cTarget.innerHTML = html; this.cTarget.hidden = !html; }

  setMessage(text, kind = 'info') {
    this.cMsg.textContent = text;
    this.cMsg.className = `sc-msg ${kind}`;
    this.cMsg.hidden = !text;
  }

  // ---------- barra ----------
  updateBar(combat, states, selectedId = null, castsLeft = 1) {
    const p = combat.player;
    const enemyTurn = combat.phase !== 'player';
    this.bar.classList.toggle('enemy-turn', enemyTurn);
    this.bPhase.textContent = enemyTurn ? 'Turno dos inimigos' : castsLeft > 0 ? 'Seu turno' : 'Seu turno · magia usada';
    this.bRound.textContent = `Rodada ${combat.round}`;
    if (p) {
      this.bHp.style.width = `${(p.hp / p.maxHp) * 100}%`;
      this.bHpNum.textContent = `${p.hp}/${p.maxHp}`;
      this.bMana.style.width = `${(p.mana / p.maxMana) * 100}%`;
      this.bManaNum.textContent = `${p.mana}/${p.maxMana}`;
    }
    this.bEnd.disabled = enemyTurn;
    this.slots.forEach((d, i) => {
      const s = this.spells[i], st = states[i];
      d.classList.toggle('locked', !st.ok);
      d.classList.toggle('soon', !s.ready);
      d.classList.toggle('selected', s.id === selectedId);
      d.querySelector('.cd').textContent = st.cooldown ? String(st.cooldown) : '';
      d.title = `${s.name} (${i + 1}) · ${s.ready ? (st.ok ? `${s.mana} de mana` : st.reason) : 'em breve'}`;
    });
  }

  // ---------- depuração ----------
  toggleDebug() { this.debug.hidden = !this.debug.hidden; return !this.debug.hidden; }

  // attempt: { strokes (pontos suavizados), raw, result, expected, ms }
  drawDebug(attempt, live = null) {
    if (this.debug.hidden) return;
    const c = this.dCanvas, ctx = c.getContext('2d'), W = c.width, H = c.height;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(255,255,255,.04)'; ctx.fillRect(0, 0, W, H);
    const strokes = live ? live.strokes : attempt ? attempt.strokes : [];
    const raw = live ? live.raw : attempt ? attempt.raw : [];
    const all = [...strokes.flat(), ...raw.flat()];
    if (all.length) {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const [x, y] of all) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
      const k = Math.min((W - 20) / Math.max(1, x1 - x0), (H - 20) / Math.max(1, y1 - y0));
      const T = ([x, y]) => [10 + (x - x0) * k, 10 + (y - y0) * k];
      ctx.fillStyle = 'rgba(255,120,120,.55)'; // pontos crus da câmera
      for (const s of raw) for (const p of s) { const [x, y] = T(p); ctx.fillRect(x - 1, y - 1, 2, 2); }
      ctx.strokeStyle = '#7fb2ff'; ctx.lineWidth = 1.5; // trajetória suavizada
      for (const s of strokes) { ctx.beginPath(); s.forEach((p, i) => { const [x, y] = T(p); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }); ctx.stroke(); }
      ctx.fillStyle = '#ffd27a';
      for (const s of strokes) if (s.length) { const [x, y] = T(s[0]); ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill(); }
    }
    const r = live ? live.result : attempt && attempt.result;
    const lines = [];
    if (attempt && attempt.expected) lines.push(`esperada: ${RUNES[attempt.expected].name}`);
    if (r) {
      lines.push(`lida: ${r.id ? RUNES[r.id].name : '—'}  ${(r.score * 100).toFixed(0)}%  ${r.accepted ? 'ACEITA' : `recusada (${r.reason})`}`);
      for (const x of (r.ranking || []).slice(0, 4)) lines.push(`  ${RUNES[x.id].name.padEnd(11)} ${(x.score * 100).toFixed(1)}%`);
      if (r.features) lines.push(`traços ${r.strokes} · cantos ${r.features.corners} · vértices ${r.features.verts} · fechada ${r.features.closed ? 'sim' : 'não'}`);
    }
    const pts = raw.reduce((n, s) => n + s.length, 0);
    lines.push(`pontos: ${pts} crus, ${strokes.reduce((n, s) => n + s.length, 0)} suavizados${attempt && attempt.ms ? ` · ${attempt.ms.toFixed(1)} ms` : ''}`);
    this.dText.textContent = lines.join('\n');
  }
}

function statsLine(s) {
  const parts = [], st = s.status, turns = n => `<b>${n}</b> ${n === 1 ? 'turno' : 'turnos'}`;
  if (s.damage) parts.push(`dano <b>${s.damage}</b>`);
  if (s.area) parts.push(`área <b>${s.area}</b>`);
  if (s.chain) parts.push(`até <b>${s.chain.targets}</b> alvos, −<b>${Math.round(s.chain.falloff * 100)}%</b> por salto`);
  if (s.length) parts.push(`até <b>${s.length}</b> casas por ${turns(s.duration)}`);
  if (s.wallHp) parts.push(`vida <b>${s.wallHp}</b> por bloco`);
  if (st) {
    const chance = st.chance && st.chance < 1 ? `<b>${Math.round(st.chance * 100)}%</b> de chance de ` : '';
    const text = { queimadura: `queima <b>${st.power}</b>/turno por ${turns(st.turns)}`, lentidao: `lentidão (−${st.power} casa) por ${turns(st.turns)}`,
      imobilizado: `imobiliza por ${turns(st.turns)}`, atordoado: `${chance}atordoar por ${turns(st.turns)}`, derrubado: `${chance}derrubar` }[st.id];
    if (text) parts.push(text);
  }
  parts.push(`mana <b>${s.mana}</b>`, `recarga <b>${s.cooldown}</b>`, `alcance <b>${s.range}</b>`);
  return parts.join(' · ');
}
