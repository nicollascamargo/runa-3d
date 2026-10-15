// A runa desenhada no ar: uma camada 2D por cima da cena.
//   - trilha de energia: halo largo, faixa colorida que cintila e um fio quente no meio, somando luz;
//   - ponta da caneta brilhando onde o dedo está;
//   - partículas do elemento: brasas sobem no fogo, cristais caem devagar no gelo, faíscas estalam no raio,
//     poeira dourada cai na terra;
//   - guia: a runa escolhida, apagada no centro da tela, com o ponto de partida e o sentido;
//     no modo ímã (src/runes/RuneGuide.js) ela é o trilho: grande, sempre visível (com um fundo escuro para se
//     destacar do cenário), com a faixa onde a caneta gruda, o ponto de partida pulsando ("comece aqui") até a
//     caneta grudar, depois o trecho logo à frente para seguir, e uma linha fina do dedo até onde ele grudou;
//     o caminho já percorrido brilha mais conforme a runa se completa;
//   - acerto: a trilha brilha, a runa limpa se acende por cima e solta partículas;
//   - erro: a trilha esfria, treme e some devagar.
// Só desenha quando há algo para mostrar: parada, não gasta nada.
import { RUNES } from '../runes/runeShapes.js';
import { GFX } from '../core/Settings.js';

export const PALETTE = {
  fogo: { core: [255, 246, 220], mid: [255, 140, 50], glow: [255, 70, 20], spark: [255, 180, 80], ui: '#ff9a52' },
  gelo: { core: [240, 251, 255], mid: [120, 210, 255], glow: [60, 140, 255], spark: [190, 240, 255], ui: '#9adfff' },
  raio: { core: [252, 248, 255], mid: [190, 160, 255], glow: [120, 90, 255], spark: [240, 230, 140], ui: '#c49cff' },
  terra: { core: [255, 246, 220], mid: [235, 190, 90], glow: [200, 140, 40], spark: [240, 210, 140], ui: '#e6b85c' },
};
const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
const MAX_PARTICLES = 420;

export class RuneCanvas {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.dpr = 1;
    this.element = 'fogo';
    this.strokes = [];        // traços completos (pontos em pixels CSS)
    this.current = null;      // traço em andamento
    this.tip = null; this.penDown = false;
    this.guide = null;        // { id, alpha, rails (trilho em pixels, no modo ímã), band (largura da faixa do ímã) }
    this.magnet = null;       // { raw: {x, y}, at: {x, y} }: o dedo e onde ele grudou no trilho
    this.result = null;       // { kind: 'ok'|'fail', t, strokes, runeId }
    this.particles = [];
    this.time = 0;
    this.visible = false;
    this.lastSpawn = null;
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  resize() {
    this.dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    this.canvas.width = Math.round(innerWidth * this.dpr);
    this.canvas.height = Math.round(innerHeight * this.dpr);
  }

  setElement(el) { this.element = PALETTE[el] ? el : 'fogo'; }
  showGuide(id, rails = null, band = 0) { this.guide = id ? { id, alpha: 0, rails, band, state: null } : null; }
  // Estado do traçado guiado: { progress, start: {x, y, next} | null, ahead: [[x, y]...] | null, head }
  setGuideState(st) { if (this.guide) this.guide.state = st; }

  // Onde e de que tamanho a runa-guia aparece (a mesma caixa vale para o trilho do ímã).
  // size: fração do menor lado da tela (true = 0,44, o tamanho antigo do ímã; false = 0,34, a guia do desenho livre).
  guideBox(size = false) {
    const k = typeof size === 'number' ? size : size ? 0.44 : 0.34;
    return { x: innerWidth / 2, y: innerHeight * 0.52, size: Math.min(innerWidth, innerHeight) * k };
  }

  setMagnet(raw, at) { this.magnet = raw && at ? { raw, at } : null; }

  // A cada quadro, durante o desenho.
  setInk(strokes, current, tip, penDown) {
    this.strokes = strokes; this.current = current; this.tip = tip; this.penDown = penDown;
    if (penDown && tip) this.emitAlong(tip);
  }

  clearInk() { this.strokes = []; this.current = null; this.tip = null; this.penDown = false; this.lastSpawn = null; this.magnet = null; }

  success(strokes, runeId) {
    this.result = { kind: 'ok', t: 0, strokes: strokes.map(s => s.map(p => [...p])), runeId, fit: fitRune(runeId, strokes) };
    this.clearInk();
    const pal = PALETTE[this.element];
    for (const s of strokes) for (let i = 0; i < s.length; i += 2) this.spawn(s[i][0], s[i][1], { speed: 160, life: 0.9, size: 3.2, col: Math.random() < 0.5 ? pal.spark : pal.mid, up: -40 });
  }

  fail(strokes) {
    this.result = { kind: 'fail', t: 0, strokes: strokes.map(s => s.map(p => [...p])) };
    this.clearInk();
    for (const s of strokes) for (let i = 0; i < s.length; i += 4) this.spawn(s[i][0], s[i][1], { speed: 30, life: 0.8, size: 2.2, col: [150, 120, 130], up: 60 });
  }

  reset() { this.clearInk(); this.result = null; this.particles.length = 0; this.guide = null; }

  // ---------- partículas ----------
  // kind: 'dot' (bolinha), 'diamond' (cristal de gelo girando) ou 'arc' (faísca em zigue-zague)
  spawn(x, y, { speed = 60, life = 0.6, size = 2.5, col = [255, 200, 120], up = -30, kind = 'dot' } = {}) {
    if (this.particles.length >= MAX_PARTICLES * GFX.particles) this.particles.shift();
    const a = Math.random() * Math.PI * 2, s = speed * (0.3 + Math.random() * 0.7);
    this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life, span: life, size: size * (0.6 + Math.random() * 0.8), col, up, kind, rot: Math.random() * 6 });
  }

  emitAlong(tip) {
    const pal = PALETTE[this.element];
    if (!this.lastSpawn) this.lastSpawn = { x: tip.x, y: tip.y };
    const d = Math.hypot(tip.x - this.lastSpawn.x, tip.y - this.lastSpawn.y);
    const n = Math.min(8, Math.floor(d / 9 * GFX.particles));
    for (let i = 0; i < n; i++) {
      const k = (i + 1) / n;
      const x = this.lastSpawn.x + (tip.x - this.lastSpawn.x) * k, y = this.lastSpawn.y + (tip.y - this.lastSpawn.y) * k;
      const col = Math.random() < 0.6 ? pal.spark : pal.mid;
      if (this.element === 'fogo') this.spawn(x, y, { speed: 35, life: 0.5 + Math.random() * 0.5, size: 2.4, col, up: -70 });          // brasas sobem
      else if (this.element === 'gelo') this.spawn(x, y, { speed: 18, life: 0.8 + Math.random() * 0.6, size: 3.2, col, up: 25, kind: 'diamond' }); // cristais caem devagar
      else if (this.element === 'raio') this.spawn(x, y, { speed: 90, life: 0.12 + Math.random() * 0.12, size: 7, col, up: 0, kind: 'arc' }); // faíscas estalando
      else this.spawn(x, y, { speed: 25, life: 0.7 + Math.random() * 0.5, size: 2.2, col, up: 70 });                                       // poeira dourada cai
    }
    if (n) this.lastSpawn = { x: tip.x, y: tip.y };
  }

  // ---------- desenho ----------
  get active() { return !!(this.strokes.length || this.current || this.guide || this.result || this.particles.length || this.tip); }

  path(ctx, pts, jitter = 0, seed = 0) {
    if (pts.length < 2) return;
    const j = (i, axis) => (jitter ? Math.sin(this.time * 23 + i * 0.9 + seed + axis * 1.7) * jitter : 0);
    ctx.beginPath();
    ctx.moveTo(pts[0][0] + j(0, 0), pts[0][1] + j(0, 1));
    for (let i = 1; i < pts.length - 1; i++) {
      const mx = (pts[i][0] + pts[i + 1][0]) / 2, my = (pts[i][1] + pts[i + 1][1]) / 2;
      ctx.quadraticCurveTo(pts[i][0] + j(i, 0), pts[i][1] + j(i, 1), mx, my);
    }
    const l = pts[pts.length - 1];
    ctx.lineTo(l[0], l[1]);
  }

  // Uma trilha de energia: camadas somando luz. k: brilho (0 a ~2); cool: 0 = cor do elemento, 1 = cinza apagado.
  energy(ctx, pts, k = 1, cool = 0, widthK = 1) {
    if (pts.length < 2) return;
    const pal = PALETTE[this.element];
    const mix = (c, g) => c.map((v, i) => Math.round(v + (g[i] - v) * cool));
    const grey = [120, 110, 125];
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (GFX.trailGlow) {
      ctx.strokeStyle = rgba(mix(pal.glow, grey), 0.09 * k); ctx.lineWidth = 30 * widthK; this.path(ctx, pts); ctx.stroke();
      ctx.strokeStyle = rgba(mix(pal.glow, grey), 0.16 * k); ctx.lineWidth = 17 * widthK; this.path(ctx, pts); ctx.stroke();
    }
    ctx.strokeStyle = rgba(mix(pal.mid, grey), 0.5 * k); ctx.lineWidth = 8 * widthK; this.path(ctx, pts, 1.6, 0); ctx.stroke();
    ctx.strokeStyle = rgba(mix(pal.mid, grey), 0.35 * k); ctx.lineWidth = 2 * widthK; this.path(ctx, pts, 3.2, 5); ctx.stroke();
    ctx.strokeStyle = rgba(mix(pal.core, grey), Math.min(1, 0.95 * k)); ctx.lineWidth = 3.2 * widthK; this.path(ctx, pts); ctx.stroke();
  }

  drawGuide(ctx, dt) {
    const g = this.guide, rune = RUNES[g.id];
    if (!rune) return;
    // desenho livre: some enquanto o jogador desenha, volta quando ele para. Ímã: o trilho fica sempre à vista
    const want = g.rails ? 0.7 : this.penDown || this.strokes.length ? 0.16 : 0.42;
    g.alpha += (want - g.alpha) * (1 - Math.exp(-6 * dt));
    const pal = PALETTE[this.element];
    const box = this.guideBox(false), size = box.size, ox = box.x - size / 2, oy = box.y - size / 2;
    const paths = g.rails || rune.strokes.map(s => s.map(([x, y]) => [ox + x * size, oy + y * size]));
    ctx.save();
    if (g.rails && g.band) {
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      // fundo escuro embaixo do trilho: a runa se destaca do cenário (desenhado por cima da cena, sem somar luz)
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = `rgba(4,6,16,${0.3 * Math.min(1, g.alpha / 0.7)})`;
      ctx.lineWidth = Math.max(26, g.band * 0.5);
      for (const pts of paths) { this.path(ctx, pts); ctx.stroke(); }
      ctx.globalCompositeOperation = 'lighter';
      // faixa do ímã: onde a caneta gruda
      ctx.strokeStyle = rgba(pal.glow, 0.05);
      ctx.lineWidth = g.band * 1.4;
      for (const pts of paths) { this.path(ctx, pts); ctx.stroke(); }
      // o trilho inteiro, contínuo e suave, por baixo do tracejado que corre
      ctx.strokeStyle = rgba(pal.mid, g.alpha * 0.35);
      ctx.lineWidth = 7;
      for (const pts of paths) { this.path(ctx, pts); ctx.stroke(); }
    }
    ctx.setLineDash([10, 9]);
    ctx.lineDashOffset = -this.time * 30;
    ctx.lineCap = 'round';
    paths.forEach((pts, si) => {
      ctx.strokeStyle = rgba(pal.mid, g.alpha);
      ctx.lineWidth = g.rails ? 4 : 3;
      this.path(ctx, pts);
      ctx.stroke();
      // ponto de partida pulsando e uma seta no sentido do traço (no ímã, só até a caneta grudar)
      const p0 = pts[0], p1 = pts[Math.min(pts.length - 1, Math.max(1, Math.floor(pts.length * 0.12)))];
      ctx.setLineDash([]);
      if (g.rails && g.state && !g.state.start) { ctx.setLineDash([10, 9]); return; }
      ctx.fillStyle = rgba(pal.core, g.alpha * 1.6);
      ctx.beginPath(); ctx.arc(p0[0], p0[1], 6 + 2 * Math.sin(this.time * 6), 0, Math.PI * 2); ctx.fill();
      const a = Math.atan2(p1[1] - p0[1], p1[0] - p0[0]), ax = p0[0] + Math.cos(a) * 26, ay = p0[1] + Math.sin(a) * 26;
      ctx.strokeStyle = rgba(pal.core, g.alpha * 1.4); ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(ax - Math.cos(a - 0.5) * 11, ay - Math.sin(a - 0.5) * 11); ctx.lineTo(ax, ay); ctx.lineTo(ax - Math.cos(a + 0.5) * 11, ay - Math.sin(a + 0.5) * 11); ctx.stroke();
      if (paths.length > 1) { ctx.font = '600 16px Cinzel, Georgia, serif'; ctx.fillText(String(si + 1), p0[0] - 18, p0[1] - 8); }
      ctx.setLineDash([10, 9]);
    });
    ctx.setLineDash([]);
    if (g.rails && g.state) this.drawGuideHints(ctx, g, pal);
    ctx.restore();
  }

  // Ímã: "comece aqui" no ponto de partida (anel grande pulsando e um cometa mostrando o sentido) e, depois que
  // a caneta grudou, o trecho logo à frente acendendo em ondas (o caminho a seguir).
  drawGuideHints(ctx, g, pal) {
    const st = g.state, t = this.time;
    if (st.start) {
      const { x, y } = st.start, r = 16 + 5 * Math.sin(t * 5);
      ctx.strokeStyle = rgba(pal.core, 0.85); ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = rgba(pal.mid, 0.5 * (1 - ((t * 1.2) % 1))); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, r + 14 * ((t * 1.2) % 1), 0, Math.PI * 2); ctx.stroke();
      ctx.font = '600 15px Cinzel, Georgia, serif'; ctx.textAlign = 'center';
      ctx.fillStyle = rgba(pal.core, 0.95);
      ctx.fillText('comece aqui', x, y - r - 12);
      ctx.textAlign = 'start';
      // cometa: corre do ponto de partida pelo começo do trilho, mostrando para que lado ir
      const rail = g.rails[st.start.stroke || 0];
      if (rail) {
        const n = Math.max(2, Math.floor(rail.length * 0.22)), u = (t * 0.9) % 1, i = Math.floor(u * n);
        for (let k = 0; k < 6; k++) {
          const p = rail[Math.max(0, i - k * 2)];
          if (!p) break;
          ctx.fillStyle = rgba(pal.core, 0.8 * (1 - k / 6) * (1 - u * 0.5));
          ctx.beginPath(); ctx.arc(p[0], p[1], 5 - k * 0.6, 0, Math.PI * 2); ctx.fill();
        }
      }
    } else if (st.ahead) {
      // o trecho à frente acende em ondas que andam no sentido do traço
      const a = st.ahead;
      for (let k = 0; k < a.length; k++) {
        const w = 0.5 + 0.5 * Math.sin(t * 9 - k * 0.55);
        ctx.fillStyle = rgba(pal.core, (0.15 + 0.45 * w) * (1 - k / a.length));
        ctx.beginPath(); ctx.arc(a[k][0], a[k][1], 3.2, 0, Math.PI * 2); ctx.fill();
      }
    }
  }

  update(dt) {
    this.time += dt;
    const ctx = this.ctx;
    if (!this.active) { if (this.visible) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, this.canvas.width, this.canvas.height); this.visible = false; } return; }
    this.visible = true;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    ctx.globalCompositeOperation = 'lighter';
    if (this.guide) this.drawGuide(ctx, dt);

    // no ímã, o caminho aceso brilha e engrossa conforme a runa se completa
    const gs = this.guide && this.guide.rails && this.guide.state;
    const lit = gs ? 0.75 + 0.9 * Math.min(1, gs.progress) : 1, litW = gs ? 0.9 + 0.6 * Math.min(1, gs.progress) : 1;
    for (const s of this.strokes) this.energy(ctx, s, lit, 0, litW);
    if (this.current && this.current.length > 1) this.energy(ctx, this.current);

    const r = this.result;
    if (r) {
      r.t += dt;
      if (r.kind === 'ok') {
        const u = Math.min(1, r.t / 1.1);
        const flash = u < 0.18 ? u / 0.18 : 1 - (u - 0.18) / 0.82;
        for (const s of r.strokes) this.energy(ctx, s, 1 + flash * 1.2, 0, 1 + flash * 0.8);
        // a runa limpa acende por cima do desenho
        if (r.fit) for (const s of r.fit) this.energy(ctx, s, Math.max(0, flash) * 1.6, 0, 0.8 + u * 0.6);
        if (u >= 1) this.result = null;
      } else {
        const u = Math.min(1, r.t / 0.85);
        for (const s of r.strokes) {
          const shaken = s.map(([x, y], i) => [x + Math.sin(i * 1.3 + r.t * 40) * 4 * u, y + u * u * 18]);
          this.energy(ctx, shaken, (1 - u) ** 1.5, Math.min(1, u * 2.5));
        }
        if (u >= 1) this.result = null;
      }
    }

    // ímã: linha fina do dedo até o ponto do trilho onde ele grudou
    if (this.magnet) {
      const pal = PALETTE[this.element], { raw, at } = this.magnet;
      ctx.setLineDash([3, 5]);
      ctx.strokeStyle = rgba(pal.mid, 0.45); ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(raw.x, raw.y); ctx.lineTo(at.x, at.y); ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath(); ctx.arc(raw.x, raw.y, 7, 0, Math.PI * 2); ctx.stroke();
    }

    // ponta da caneta
    if (this.tip) {
      const pal = PALETTE[this.element], { x, y } = this.tip;
      const rad = this.penDown ? 16 : 10;
      const g = ctx.createRadialGradient(x, y, 0, x, y, rad * 2.2);
      g.addColorStop(0, rgba(pal.core, this.penDown ? 0.95 : 0.55));
      g.addColorStop(0.3, rgba(pal.mid, this.penDown ? 0.55 : 0.25));
      g.addColorStop(1, rgba(pal.glow, 0));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, rad * 2.2, 0, Math.PI * 2); ctx.fill();
      if (!this.penDown) { ctx.strokeStyle = rgba(pal.mid, 0.6); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y, 12, 0, Math.PI * 2); ctx.stroke(); }
    }

    // partículas
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) { this.particles.splice(i, 1); continue; }
      const d = Math.exp(-2.2 * dt);
      p.vx *= d; p.vy = p.vy * d + p.up * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      const u = p.life / p.span, sz = p.size * (0.5 + 0.5 * u);
      if (p.kind === 'diamond') {
        p.rot += dt * 3;
        ctx.fillStyle = rgba(p.col, Math.min(1, u * 1.6));
        ctx.beginPath();
        for (let k = 0; k < 4; k++) { const a = p.rot + k * Math.PI / 2, r = k % 2 ? sz * 0.55 : sz * 1.3; ctx.lineTo(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r); }
        ctx.closePath(); ctx.fill();
      } else if (p.kind === 'arc') {
        ctx.strokeStyle = rgba(p.col, Math.min(1, u * 2)); ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(p.x, p.y);
        for (let k = 1; k <= 3; k++) ctx.lineTo(p.x + (Math.random() - 0.5) * sz * 2, p.y + (Math.random() - 0.5) * sz * 2);
        ctx.stroke();
      } else {
        ctx.fillStyle = rgba(p.col, Math.min(1, u * 1.6));
        ctx.beginPath(); ctx.arc(p.x, p.y, sz, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.globalCompositeOperation = 'source-over';
  }
}

// A runa-modelo encaixada na caixa do desenho do jogador (para o brilho do acerto).
function fitRune(id, strokes) {
  const rune = RUNES[id];
  if (!rune || !strokes.length) return null;
  const all = strokes.flat();
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of all) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  const size = Math.max(x1 - x0, y1 - y0), cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const tb = rune.strokes.flat();
  let a0 = Infinity, b0 = Infinity, a1 = -Infinity, b1 = -Infinity;
  for (const [x, y] of tb) { a0 = Math.min(a0, x); b0 = Math.min(b0, y); a1 = Math.max(a1, x); b1 = Math.max(b1, y); }
  const ts = Math.max(a1 - a0, b1 - b0) || 1, tcx = (a0 + a1) / 2, tcy = (b0 + b1) / 2;
  return rune.strokes.map(s => s.map(([x, y]) => [cx + ((x - tcx) / ts) * size, cy + ((y - tcy) / ts) * size]));
}
