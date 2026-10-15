// Painel de diagnóstico da visão (Runa Vision 2.0), opcional (tecla X ou botão no painel). Mostra o que a câmera
// e o jogo estão lendo agora: quadros por segundo da câmera e da tela, tempo da inferência e da captura até o
// comando, os pontos da mão, a posição crua e a filtrada do cursor (com o rastro dos últimos 2 s), a pinça (a
// medida, os limites deste jogador e o estado), os gestos, o contexto de interação e o último resultado das runas.
// Atualiza os números 10 vezes por segundo; os desenhos, a cada quadro da câmera. Desligado, não custa nada.
import { HAND_LINKS, GESTURE_NAMES } from '../input/hand/handReading.js';
import { RUNES } from '../runes/runeShapes.js';

const el = (tag, cls, parent, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; if (parent) parent.appendChild(e); return e; };
const f1 = v => (v === undefined || v === null || Number.isNaN(v) ? '—' : v.toFixed(1).replace('.', ','));
const f2 = v => (v === undefined || v === null || Number.isNaN(v) ? '—' : v.toFixed(2).replace('.', ','));

export class VisionDiagnostics {
  // get(): { hud (fps da tela), ix (contexto), caster (runas), eval (abre a avaliação) }
  constructor(hand, get) {
    this.hand = hand; this.get = get;
    this.box = el('section', 'vision-diag', document.body);
    this.box.hidden = true;
    this.box.setAttribute('aria-label', 'Diagnóstico da visão');
    this.box.innerHTML = `
      <div class="vd-head"><b>Diagnóstico da visão</b><button type="button" data-a="close" aria-label="Fechar o diagnóstico">Fechar <kbd>X</kbd></button></div>
      <dl class="vd-nums"></dl>
      <div class="vd-canvases"><canvas class="vd-hand" width="150" height="150"></canvas><canvas class="vd-trace" width="150" height="150"></canvas></div>
      <p class="vd-cap"><span>mão (pontos do MediaPipe)</span><span>cursor: <i class="raw">cru</i> · <i class="filt">filtrado</i></span></p>
      <div class="vd-pinch"><span class="vd-pbar"><i class="m"></i><em class="on"></em><em class="off"></em><em class="hold"></em></span><span class="vd-ptext"></span></div>
      <dl class="vd-more"></dl>
      <div class="vd-tools"><button type="button" data-a="eval">Avaliar com a webcam</button><button type="button" data-a="cursor">Cursor: novo</button></div>`;
    const q = s => this.box.querySelector(s);
    Object.assign(this, { eNums: q('.vd-nums'), cHand: q('.vd-hand'), cTrace: q('.vd-trace'), ePbar: q('.vd-pbar'), eM: q('.vd-pbar .m'), eOn: q('.vd-pbar .on'), eOff: q('.vd-pbar .off'), eHold: q('.vd-pbar .hold'), ePtext: q('.vd-ptext'), eMore: q('.vd-more'), bCursor: q('[data-a="cursor"]') });
    this.box.addEventListener('click', e => {
      const b = e.target.closest('[data-a]');
      if (!b) return;
      if (b.dataset.a === 'close') this.toggle(false);
      if (b.dataset.a === 'eval') get().openEval();
      if (b.dataset.a === 'cursor') { hand.cursorMode = hand.cursorMode === 'novo' ? 'antigo' : 'novo'; this.bCursor.textContent = `Cursor: ${hand.cursorMode}`; }
    });
    this.trace = [];     // { t, raw: {x,y}, filt: {x,y} } dos últimos 2 s
    this.last = null;
    this.at = 0;
    this.unlisten = null;
  }

  get open() { return !this.box.hidden; }

  toggle(on = !this.open) {
    this.box.hidden = !on;
    if (on && !this.unlisten) this.unlisten = this.hand.addRawListener(d => this.frame(d));
    if (!on && this.unlisten) { this.unlisten(); this.unlisten = null; }
    return on;
  }

  frame(d) {
    this.last = d;
    if (d.lm) {
      this.trace.push({ t: d.now, raw: { ...d.raw }, filt: { ...d.filtered } });
      while (this.trace.length && d.now - this.trace[0].t > 2000) this.trace.shift();
    }
    this.drawHand(d.lm);
    this.drawTrace();
  }

  drawHand(lm) {
    const c = this.cHand, g = c.getContext('2d'), W = c.width, H = c.height;
    g.clearRect(0, 0, W, H);
    g.fillStyle = 'rgba(255,255,255,.04)'; g.fillRect(0, 0, W, H);
    if (!lm) { g.fillStyle = '#9aa3c2'; g.font = '12px sans-serif'; g.fillText('sem mão', 52, 78); return; }
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of lm) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
    const k = 120 / Math.max(x1 - x0, y1 - y0, 1e-3), ox = (W - (x1 - x0) * k) / 2, oy = (H - (y1 - y0) * k) / 2;
    const T = p => [W - (ox + (p.x - x0) * k), oy + (p.y - y0) * k]; // espelhado, como o jogador vê
    g.strokeStyle = 'rgba(214,168,90,.9)'; g.lineWidth = 2;
    for (const [a, b] of HAND_LINKS) { const [ax, ay] = T(lm[a]), [bx, by] = T(lm[b]); g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke(); }
    g.fillStyle = '#e6e9f5';
    for (const p of lm) { const [x, y] = T(p); g.beginPath(); g.arc(x, y, 2.2, 0, 6.3); g.fill(); }
    const pressed = this.hand.hand.pressed;
    g.strokeStyle = pressed ? '#ff7a6a' : 'rgba(154,223,255,.8)'; g.setLineDash([4, 4]);
    const [tx, ty] = T(lm[4]), [ix, iy] = T(lm[8]);
    g.beginPath(); g.moveTo(tx, ty); g.lineTo(ix, iy); g.stroke(); g.setLineDash([]);
    const a = this.hand.hand.anchor, [axx, ayy] = T(a);
    g.fillStyle = '#7fb2ff'; g.beginPath(); g.arc(axx, ayy, 4, 0, 6.3); g.fill();
  }

  // rastro do cursor (a tela inteira encolhida no quadrado): cru em vermelho, filtrado em azul
  drawTrace() {
    const c = this.cTrace, g = c.getContext('2d'), W = c.width, H = c.height;
    g.clearRect(0, 0, W, H);
    g.fillStyle = 'rgba(255,255,255,.04)'; g.fillRect(0, 0, W, H);
    const sx = W / innerWidth, sy = H / innerHeight;
    g.fillStyle = 'rgba(255,120,120,.7)';
    for (const p of this.trace) g.fillRect(p.raw.x * sx - 1, p.raw.y * sy - 1, 2, 2);
    g.strokeStyle = '#7fb2ff'; g.lineWidth = 1.5; g.beginPath();
    this.trace.forEach((p, i) => { const x = p.filt.x * sx, y = p.filt.y * sy; if (i) g.lineTo(x, y); else g.moveTo(x, y); });
    g.stroke();
  }

  // números (chamado pelo laço do jogo; atualiza 10 vezes por segundo)
  update(now = performance.now()) {
    if (!this.open || now - this.at < 100) return;
    this.at = now;
    const hi = this.hand, h = hi.hand, G = this.get(), d = this.last, P = hi.pinch, c = P.config;
    const jitter = (() => { // tremor do cursor filtrado no último meio segundo (px), só com a mão parada
      const r = this.trace.filter(p => now - p.t < 500);
      if (r.length < 6) return null;
      const mx = r.reduce((a, p) => a + p.filt.x, 0) / r.length, my = r.reduce((a, p) => a + p.filt.y, 0) / r.length;
      return Math.sqrt(r.reduce((a, p) => a + (p.filt.x - mx) ** 2 + (p.filt.y - my) ** 2, 0) / r.length);
    })();
    this.eNums.innerHTML = [
      ['Câmera', hi.on ? `${f1(h.fps)} quadros/s` : 'desligada'], ['Tela', `${Math.round(G.hud.fps)} quadros/s`],
      ['Inferência', `${f1(h.inferMs)} ms`], ['Captura → comando', `${f1(hi.latency.total)} ms`],
      ['Cursor cru', d && d.raw ? `${Math.round(d.raw.x)}, ${Math.round(d.raw.y)} px` : '—'], ['Cursor filtrado', d && d.filtered ? `${Math.round(d.filtered.x)}, ${Math.round(d.filtered.y)} px` : '—'],
      ['Tremor (0,5 s)', jitter === null ? '—' : `${f1(jitter)} px${jitter > 25 ? ' (em movimento)' : ''}`], ['Saltos recusados', String(hi.cursorFilter.rejected)],
    ].map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
    // pinça: barra de 0 a 1 palmo com os limites deste jogador
    const pos = v => `${Math.min(100, Math.max(0, (v / 1.0) * 100))}%`;
    this.eM.style.width = pos(P.m ?? 1);
    this.eOn.style.left = pos(c.on); this.eOff.style.left = pos(c.off); this.eHold.style.left = pos(c.offHold);
    this.ePbar.classList.toggle('pressed', h.pressed);
    this.ePtext.textContent = `pinça: ${h.visible ? P.state : '—'} · medida ${f2(P.m)} (crua ${f2(P.lastRaw)}) · fecha < ${f2(c.on)} · solta > ${f2(c.off)}/${f2(c.offHold)}${c.calibrated ? ' · calibrada' : ' · padrão'}${h.armed ? '' : ' · desarmada'}`;
    const top = (h.top || []).map(x => `${GESTURE_NAMES[x.name] || x.name} ${Math.round(x.p * 100)}%`).join(' · ');
    const A = G.caster && G.caster.attempt, r = A && A.result;
    const rune = r ? `${A.expected ? `pedida ${RUNES[A.expected].name}, ` : ''}lida ${r.id ? RUNES[r.id].name : '—'} ${Math.round(r.score * 100)}% · ${r.accepted ? 'aceita' : `recusada (${r.reason})`}${r.margin !== undefined && r.margin < 1 ? ` · folga ${f2(r.margin)}` : ''}` : '—';
    const guide = G.caster && G.caster.guide ? ` · trilho ${Math.round(G.caster.guide.progress * 100)}%` : '';
    this.eMore.innerHTML = [
      ['Gestos', top || '—'], ['Gesto ativo', h.active ? `${GESTURE_NAMES[h.active]}${h.fired ? ' (disparou)' : ''}` : '—'],
      ['Contexto', `${G.ix.label}${guide}`], ['Runa', rune],
    ].map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
  }
}
