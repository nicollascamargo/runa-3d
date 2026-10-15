// Modo de avaliação com a webcam de verdade (Runa Vision 2.0). Mede, com a mão de quem joga:
//   1. parado    o tremor do cursor (o desenhado e o cru) com a mão parada sobre um alvo
//   2. seguir    o erro e o atraso ao acompanhar um alvo em movimento (o atraso inclui a reação da pessoa:
//                serve para comparar configurações, não é só a latência do sistema)
//   3. pinça     oito pedidos de "feche" e "abra": quantas a pinça pegou, o tempo de reação e os cliques falsos
//                nos intervalos com a mão aberta e parada
// E, o tempo todo: quadros por segundo da câmera, tempo da inferência e da captura até o comando.
// Os resultados ficam no navegador (últimas 20 avaliações) e saem em JSON. "Repetir com o cursor antigo" roda o
// mesmo teste com o cursor de antes, para comparar os dois com a mesma câmera e a mesma mão.
// Enquanto avalia, a mão não aciona nada no jogo (contexto 'avaliando').

const el = (tag, cls, parent, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; if (parent) parent.appendChild(e); return e; };
const f1 = v => (v === undefined || v === null || !Number.isFinite(v) ? '—' : v.toFixed(1).replace('.', ','));
const mean = a => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN);
const pct = (a, p) => { if (!a.length) return NaN; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const KEY = 'runa3d.avaliacoes';

export class VisionEval {
  // hooks: onStart(), onEnd(), toast(text)
  constructor(hand, commands, hooks) {
    this.hand = hand; this.commands = commands;
    Object.assign(this, { onStart: () => {}, onEnd: () => {}, toast: () => {} }, hooks);
    this.root = el('section', 'vision-eval', document.body);
    this.root.hidden = true;
    this.root.setAttribute('aria-label', 'Avaliação da câmera');
    this.root.innerHTML = `<canvas class="ve-canvas"></canvas>
      <div class="ve-card"><div class="ve-head"><b>Avaliação da câmera</b><span class="ve-step"></span></div>
        <p class="ve-text"></p><span class="ve-bar"><i></i></span><div class="ve-res"></div>
        <div class="ve-tools"><button type="button" data-a="stop">Parar</button><button type="button" data-a="again">Repetir</button><button type="button" data-a="legacy">Repetir com o cursor antigo</button><button type="button" data-a="export">Exportar (JSON)</button><button type="button" data-a="close">Fechar</button></div></div>`;
    const q = s => this.root.querySelector(s);
    Object.assign(this, { cv: q('.ve-canvas'), eStep: q('.ve-step'), eText: q('.ve-text'), eBar: q('.ve-bar i'), eRes: q('.ve-res'), btn: a => q(`[data-a="${a}"]`) });
    this.root.addEventListener('click', e => { const b = e.target.closest('[data-a]'); if (b) this.action(b.dataset.a); });
    this.history = [];
    try { this.history = JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { this.history = []; }
    this.run = null;
  }

  get open() { return !this.root.hidden; }

  start(mode = 'novo') {
    if (!this.hand.on) { this.toast('Ligue a câmera (C) para avaliar.'); return false; }
    this.prevMode = this.hand.cursorMode;
    this.hand.cursorMode = mode;
    this.root.hidden = false;
    this.cv.width = innerWidth; this.cv.height = innerHeight;
    this.onStart();
    const r = this.run = { mode, stage: 'parado', t0: performance.now(), stageT0: performance.now(), samples: [], track: [], pinch: [], idleFalse: 0, lat: { fps: [], infer: [], total: [] }, results: {} };
    this.unRaw = this.hand.addRawListener(d => { if (d.lm) { r.lat.infer.push(this.hand.hand.inferMs); r.lat.total.push(this.hand.latency.total); } });
    this.unDown = this.commands.on('pointer.down', p => { if (p.source === 'hand') this.pinchEvent('down'); });
    this.unUp = this.commands.on('pointer.up', p => { if (p.source === 'hand') this.pinchEvent('up'); });
    this.toggleButtons('run');
    this.stage('parado');
    return true;
  }

  toggleButtons(mode) {
    this.btn('stop').hidden = mode !== 'run';
    for (const a of ['again', 'legacy', 'export', 'close']) this.btn(a).hidden = mode !== 'end';
  }

  stage(name) {
    const r = this.run;
    r.stage = name; r.stageT0 = performance.now(); r.samples = [];
    const S = {
      parado: ['1 de 3 · parado', 'Leve o cursor até o alvo dourado e deixe a mão parada até a barra encher.'],
      seguir: ['2 de 3 · seguir', 'Acompanhe o alvo com o cursor enquanto ele passeia pela tela.'],
      pinca: ['3 de 3 · pinça', 'Faça o que o alvo pede: FECHE a pinça, ABRA, e deixe a mão aberta e parada quando pedir.'],
    }[name];
    this.eStep.textContent = S[0];
    this.eText.textContent = S[1];
    if (name === 'pinca') { r.cycle = 0; r.phase = 'idle'; r.phaseT0 = performance.now() + 800; r.pinchLog = []; }
  }

  pinchEvent(type) {
    const r = this.run;
    if (!r || r.stage !== 'pinca') return;
    const now = performance.now();
    if (r.phase === 'idle' && type === 'down') r.idleFalse++;
    if (r.phase === 'close' && type === 'down' && !r.cur.down) { r.cur.down = now - r.phaseT0; r.phase = 'open'; r.phaseT0 = now; }
    else if (r.phase === 'open' && type === 'up' && !r.cur.up) { r.cur.up = now - r.phaseT0; this.nextCycle(now); }
  }

  nextCycle(now) {
    const r = this.run;
    r.pinchLog.push(r.cur);
    r.cycle++;
    r.phase = 'idle'; r.phaseT0 = now;
  }

  // a cada quadro da tela
  update(now = performance.now()) {
    const r = this.run;
    if (!r || !this.open) return;
    const h = this.hand.hand, cur = this.hand.displayCursor(now), raw = h.rawCursor;
    const g = this.cv.getContext('2d');
    g.clearRect(0, 0, this.cv.width, this.cv.height);
    r.lat.fps.push(h.fps);
    const cx = innerWidth / 2, cy = innerHeight / 2, T = now - r.stageT0;
    const target = (x, y, rad = 22, col = '#d6a85a', label = '') => {
      g.strokeStyle = col; g.lineWidth = 3; g.beginPath(); g.arc(x, y, rad, 0, 6.3); g.stroke();
      g.fillStyle = col; g.beginPath(); g.arc(x, y, 4, 0, 6.3); g.fill();
      if (label) { g.font = '700 22px Cinzel, Georgia, serif'; g.textAlign = 'center'; g.fillText(label, x, y - rad - 14); g.textAlign = 'start'; }
    };
    if (r.stage === 'parado') {
      target(cx, cy);
      const near = h.visible && Math.hypot(cur.x - cx, cur.y - cy) < 70;
      if (!r.holdFrom && near) r.holdFrom = now;
      if (!near && r.samples.length < 10) r.holdFrom = 0;
      if (r.holdFrom && now - r.holdFrom > 600 && h.visible) r.samples.push({ x: cur.x, y: cur.y, rx: raw.x, ry: raw.y });
      this.eBar.style.width = `${Math.min(100, (r.samples.length / 150) * 100)}%`;
      if (r.samples.length >= 150 || T > 20000) {
        const s = r.samples, j = (k, kx, ky) => { const mx = mean(s.map(p => p[kx])), my = mean(s.map(p => p[ky])); return Math.sqrt(mean(s.map(p => (p[kx] - mx) ** 2 + (p[ky] - my) ** 2))); };
        r.results.parado = s.length >= 30 ? { tremorPx: j(0, 'x', 'y'), tremorCruPx: j(0, 'rx', 'ry'), desvioDoAlvoPx: Math.hypot(mean(s.map(p => p.x)) - cx, mean(s.map(p => p.y)) - cy), amostras: s.length } : { falhou: 'não ficou parado no alvo' };
        this.stage('seguir');
      }
    } else if (r.stage === 'seguir') {
      const tt = T / 1000, A = innerWidth * 0.3, B = innerHeight * 0.28;
      const tx = cx + A * Math.sin(2 * Math.PI * 0.16 * tt), ty = cy + B * Math.sin(2 * Math.PI * 0.23 * tt + 0.6);
      target(tx, ty, 18);
      if (tt > 2 && h.visible) r.track.push({ t: now, tx, ty, x: cur.x, y: cur.y });
      this.eBar.style.width = `${Math.min(100, (tt / 12) * 100)}%`;
      if (tt > 12) {
        const tr = r.track;
        if (tr.length > 100) {
          const err = mean(tr.map(p => Math.hypot(p.x - p.tx, p.y - p.ty)));
          // atraso: o deslocamento no tempo que deixa o cursor mais perto do alvo de antes (inclui a reação)
          let best = 0, bestErr = Infinity;
          for (let s = 0; s <= 600; s += 10) {
            let sum = 0, n = 0;
            for (const p of tr) {
              const t2 = (p.t - s - r.stageT0) / 1000;
              const ox = cx + A * Math.sin(2 * Math.PI * 0.16 * t2), oy = cy + B * Math.sin(2 * Math.PI * 0.23 * t2 + 0.6);
              sum += Math.hypot(p.x - ox, p.y - oy); n++;
            }
            if (sum / n < bestErr) { bestErr = sum / n; best = s; }
          }
          r.results.seguir = { erroMedioPx: err, atrasoMs: best, erroSemAtrasoPx: bestErr, amostras: tr.length };
        } else r.results.seguir = { falhou: 'a mão saiu da câmera' };
        this.stage('pinca');
      }
    } else if (r.stage === 'pinca') {
      const since = now - r.phaseT0;
      if (r.phase === 'idle') {
        target(cx, cy, 30, '#9aa3c2', 'MÃO ABERTA, PARADA');
        if (since > 1600) { if (r.cycle >= 8) return this.finish(); r.phase = 'close'; r.phaseT0 = now; r.cur = { down: null, up: null }; }
      } else if (r.phase === 'close') {
        target(cx, cy, 30, '#9adfff', 'FECHE A PINÇA');
        if (since > 2500) { r.cur.down = null; r.phase = 'open'; r.phaseT0 = now; r.cur.missDown = true; }
      } else if (r.phase === 'open') {
        target(cx, cy, 30, '#d6a85a', 'ABRA');
        if (since > 2500) { r.cur.missUp = !!r.cur.down; this.nextCycle(now); }
      }
      this.eBar.style.width = `${(r.cycle / 8) * 100}%`;
    }
    // o cursor desenhado também aqui (por cima do alvo), para a pessoa ver
    if (h.visible) { g.strokeStyle = '#e6e9f5'; g.lineWidth = 2; g.beginPath(); g.arc(cur.x, cur.y, 10, 0, 6.3); g.stroke(); }
  }

  finish() {
    const r = this.run, L = r.pinchLog;
    const downs = L.filter(c => c.down !== null && !c.missDown), ups = L.filter(c => c.up);
    r.results.pinca = {
      pedidos: L.length, fechouNoTempo: downs.length, reacaoFecharMs: mean(downs.map(c => c.down)),
      abriuNoTempo: ups.length, reacaoAbrirMs: mean(ups.map(c => c.up)), cliquesFalsosComMaoAberta: r.idleFalse,
    };
    r.results.camera = {
      quadrosPorSegundo: mean(r.lat.fps.filter(v => v > 0)), inferenciaMs: mean(r.lat.infer), inferenciaP95Ms: pct(r.lat.infer, 0.95),
      capturaAteComandoMs: mean(r.lat.total.filter(v => v > 0)),
    };
    const out = { em: new Date().toISOString(), cursor: r.mode, calibrado: !!this.hand.profile, duracaoS: (performance.now() - r.t0) / 1000, ...r.results };
    this.history.push(out);
    if (this.history.length > 20) this.history.shift();
    try { localStorage.setItem(KEY, JSON.stringify(this.history)); } catch { /* sem espaço */ }
    this.showResults(out);
    this.stopListening();
    this.run = null;
    this.hand.cursorMode = this.prevMode || 'novo';
    this.cv.getContext('2d').clearRect(0, 0, this.cv.width, this.cv.height);
    this.toggleButtons('end');
  }

  showResults(o) {
    const prev = [...this.history].reverse().find(x => x !== o && x.cursor !== o.cursor);
    const P = o.parado || {}, S = o.seguir || {}, Q = o.pinca || {}, C = o.camera || {};
    const cmp = (v, k, sub) => { if (!prev || !prev[sub] || prev[sub][k] === undefined) return ''; return ` <small>(cursor ${prev.cursor}: ${f1(prev[sub][k])})</small>`; };
    this.eStep.textContent = `resultado · cursor ${o.cursor}${o.calibrado ? ' · calibrado' : ''}`;
    this.eText.textContent = 'Medido com a sua câmera e a sua mão. O atraso de "seguir" inclui a sua reação.';
    this.eBar.style.width = '100%';
    this.eRes.innerHTML = `<table>
      <tr><th>Parado</th><td>${P.falhou || `tremor ${f1(P.tremorPx)} px (cru ${f1(P.tremorCruPx)} px)${cmp(0, 'tremorPx', 'parado')}`}</td></tr>
      <tr><th>Seguir</th><td>${S.falhou || `erro ${f1(S.erroMedioPx)} px · atraso ${f1(S.atrasoMs)} ms${cmp(0, 'atrasoMs', 'seguir')}`}</td></tr>
      <tr><th>Pinça</th><td>fechou ${Q.fechouNoTempo}/${Q.pedidos} (${f1(Q.reacaoFecharMs)} ms) · abriu ${Q.abriuNoTempo}/${Q.pedidos} (${f1(Q.reacaoAbrirMs)} ms) · cliques falsos ${Q.cliquesFalsosComMaoAberta}</td></tr>
      <tr><th>Câmera</th><td>${f1(C.quadrosPorSegundo)} quadros/s · inferência ${f1(C.inferenciaMs)} ms (95%: ${f1(C.inferenciaP95Ms)}) · captura → comando ${f1(C.capturaAteComandoMs)} ms</td></tr></table>`;
  }

  stopListening() {
    for (const k of ['unRaw', 'unDown', 'unUp']) if (this[k]) { this[k](); this[k] = null; }
  }

  action(a) {
    if (a === 'stop') { this.stopListening(); this.run = null; this.hand.cursorMode = this.prevMode || 'novo'; this.close(); }
    else if (a === 'close') this.close();
    else if (a === 'again') { this.close(); this.start('novo'); }
    else if (a === 'legacy') { this.close(); this.start('antigo'); }
    else if (a === 'export') {
      const blob = new Blob([JSON.stringify(this.history, null, 2)], { type: 'application/json' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `avaliacao-camera-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 2000);
    }
  }

  close() {
    this.stopListening();
    this.root.hidden = true;
    this.eRes.innerHTML = '';
    this.onEnd();
  }
}
