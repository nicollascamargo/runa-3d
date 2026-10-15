// Texturas feitas no código (canvas): tecido com barrado dourado e runas, pedra, madeira, couro,
// círculos de runas do chão e partículas. Nada é baixado: o protótipo roda sem arquivos externos.
import * as THREE from 'three';
import { rng, clamp } from './random.js';

const srgb255 = hex => { const c = parseInt(hex.slice(1), 16); return [(c >> 16) & 255, (c >> 8) & 255, c & 255]; };

export function makeCanvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d', { willReadFrequently: true })];
}

export function toTexture(canvas, { color = true, repeat = null, flipY = false } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.flipY = flipY;
  t.anisotropy = 8;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.userData.mimeType = 'image/jpeg'; // ao exportar para .glb, JPEG deixa o arquivo bem menor que PNG
  if (repeat) t.repeat.set(repeat[0], repeat[1]);
  t.needsUpdate = true;
  return t;
}

// ---------- ruído ----------
// Ruído de valor fractal que fecha nas bordas (a textura repete sem emenda).
export function makeNoise(seed, period = 16) {
  const r = rng(seed);
  const grid = new Float32Array(period * period).map(() => r());
  const at = (x, y) => grid[((y % period) + period) % period * period + ((x % period) + period) % period];
  const fade = t => t * t * (3 - 2 * t);
  function base(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = fade(x - xi), yf = fade(y - yi);
    const a = at(xi, yi), b = at(xi + 1, yi), c = at(xi, yi + 1), d = at(xi + 1, yi + 1);
    return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
  }
  // u, v em [0, 1): ruído com 'octaves' camadas
  return function noise(u, v, octaves = 4, freq = 1) {
    let sum = 0, amp = 0.5, f = freq, norm = 0;
    for (let o = 0; o < octaves; o++) {
      sum += amp * base(u * period * f, v * period * f);
      norm += amp;
      amp *= 0.5;
      f *= 2;
    }
    return sum / norm;
  };
}

// Mapa de normais a partir de um mapa de altura (Sobel).
export function heightToNormal(height, w, h, strength = 2) {
  const [c, ctx] = makeCanvas(w, h);
  const img = ctx.createImageData(w, h);
  const H = (x, y) => height[((y + h) % h) * w + ((x + w) % w)];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (H(x + 1, y - 1) + 2 * H(x + 1, y) + H(x + 1, y + 1)) - (H(x - 1, y - 1) + 2 * H(x - 1, y) + H(x - 1, y + 1));
      const dy = (H(x - 1, y + 1) + 2 * H(x, y + 1) + H(x + 1, y + 1)) - (H(x - 1, y - 1) + 2 * H(x, y - 1) + H(x + 1, y - 1));
      let nx = -dx * strength, ny = -dy * strength, nz = 1;
      const len = Math.hypot(nx, ny, nz);
      nx /= len; ny /= len; nz /= len;
      const i = (y * w + x) * 4;
      img.data[i] = (nx * 0.5 + 0.5) * 255;
      img.data[i + 1] = (-ny * 0.5 + 0.5) * 255; // flipY desligado: o eixo v aponta para baixo no canvas
      img.data[i + 2] = (nz * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

export function readHeight(ctx, w, h) {
  const d = ctx.getImageData(0, 0, w, h).data;
  const out = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) out[i] = d[i * 4] / 255;
  return out;
}

// ---------- runas ----------
// Glifos originais no estilo rúnico: traços retos numa grade 3×5 (uma haste e galhos).
export function makeGlyphs(count, seed = 7) {
  const r = rng(seed);
  const pts = [];
  for (let gx = 0; gx <= 2; gx++) for (let gy = 0; gy <= 4; gy++) pts.push([gx / 2, gy / 4]);
  const glyphs = [];
  for (let i = 0; i < count; i++) {
    const strokes = [];
    const stave = r() < 0.8 ? (r() < 0.5 ? 0 : 0.5) : 1;
    strokes.push([stave, 0, stave, 1]);
    if (r() < 0.35) strokes.push([1 - stave === 0.5 ? 1 : 1 - stave, 0, 1 - stave === 0.5 ? 1 : 1 - stave, 1]);
    const branches = 1 + Math.floor(r() * 3);
    for (let b = 0; b < branches; b++) {
      const a = pts[Math.floor(r() * pts.length)], c = pts[Math.floor(r() * pts.length)];
      if (Math.hypot(a[0] - c[0], a[1] - c[1]) < 0.4) { b--; continue; }
      strokes.push([a[0], a[1], c[0], c[1]]);
    }
    glyphs.push(strokes);
  }
  return glyphs;
}

export function drawGlyph(ctx, glyph, x, y, w, h, lw) {
  ctx.lineWidth = lw;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  for (const [x0, y0, x1, y1] of glyph) {
    ctx.moveTo(x + x0 * w, y + y0 * h);
    ctx.lineTo(x + x1 * w, y + y1 * h);
  }
  ctx.stroke();
}

// ---------- tecidos ----------
// Um tecido de veludo com barrados dourados. Cada barrado é um retângulo em UV (u0..u1, v0..v1);
// 'axis' diz para onde as runas correm ('v' = de cima para baixo, 'u' = em volta).
// Devolve cor, rugosidade/metal (canal G = rugosidade, B = metal) e normais.
export function clothTextures({ size = 1024, base = '#1d3591', shade = 0.35, seed = 1, trims = [], weave = 0.25 }) {
  const w = size, h = size;
  const noise = makeNoise(seed, 8);
  const fine = makeNoise(seed + 11, 64);
  const [col, cx] = makeCanvas(w, h);
  const [orm, ox] = makeCanvas(w, h);
  const [hgt, hx] = makeCanvas(w, h);

  // veludo: cor base com manchas suaves (o pelo do veludo pega luz de jeito diferente)
  const b = srgb255(base);
  const img = cx.createImageData(w, h);
  const himg = hx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = x / w, v = y / h;
      const n = noise(u, v, 4);
      const f = fine(u, v, 2, 1);
      const k = 1 - shade * 0.5 + shade * n + (f - 0.5) * 0.06;
      const i = (y * w + x) * 4;
      img.data[i] = clamp(b[0] * k, 0, 255);
      img.data[i + 1] = clamp(b[1] * k, 0, 255);
      img.data[i + 2] = clamp(b[2] * k, 0, 255);
      img.data[i + 3] = 255;
      const weaveH = 0.5 + 0.25 * weave * (Math.sin(x * 2.2) * Math.sin(y * 2.2)) + (f - 0.5) * 0.35;
      himg.data[i] = himg.data[i + 1] = himg.data[i + 2] = clamp(weaveH * 255, 0, 255);
      himg.data[i + 3] = 255;
    }
  }
  cx.putImageData(img, 0, 0);
  hx.putImageData(himg, 0, 0);
  ox.fillStyle = 'rgb(255, 225, 0)'; // G = rugosidade alta, B = sem metal
  ox.fillRect(0, 0, w, h);

  const glyphs = makeGlyphs(24, seed * 3 + 1);
  for (const t of trims) paintTrim({ cx, ox, hx, w, h, t, glyphs });

  const height = readHeight(hx, w, h);
  const normal = heightToNormal(height, w, h, 1.6);
  return {
    map: toTexture(col),
    orm: toTexture(orm, { color: false }),
    normal: toTexture(normal, { color: false }),
  };
}

function paintTrim({ cx, ox, hx, w, h, t, glyphs }) {
  const x0 = t.u0 * w, x1 = t.u1 * w, y0 = t.v0 * h, y1 = t.v1 * h;
  const bw = x1 - x0, bh = y1 - y0;
  const gold = t.gold || '#c9a050', dark = t.dark || '#5b3f12';
  const along = t.axis === 'u' ? bw : bh, across = t.axis === 'u' ? bh : bw;
  const grad = t.axis === 'u' ? cx.createLinearGradient(0, y0, 0, y1) : cx.createLinearGradient(x0, 0, x1, 0);
  grad.addColorStop(0, '#8a6424');
  grad.addColorStop(0.18, gold);
  grad.addColorStop(0.5, '#e8c977');
  grad.addColorStop(0.82, gold);
  grad.addColorStop(1, '#8a6424');
  cx.fillStyle = grad;
  cx.fillRect(x0, y0, bw, bh);
  ox.fillStyle = 'rgb(255, 90, 255)'; // dourado: rugosidade baixa, metal
  ox.fillRect(x0, y0, bw, bh);
  hx.fillStyle = 'rgb(200, 200, 200)';
  hx.fillRect(x0, y0, bw, bh);

  // fio de contorno dos dois lados
  const inset = across * 0.14;
  cx.strokeStyle = dark;
  hx.strokeStyle = 'rgb(90, 90, 90)';
  for (const ctx of [cx, hx]) {
    ctx.lineWidth = Math.max(1.5, across * 0.05);
    ctx.beginPath();
    if (t.axis === 'u') {
      ctx.moveTo(x0, y0 + inset); ctx.lineTo(x1, y0 + inset);
      ctx.moveTo(x0, y1 - inset); ctx.lineTo(x1, y1 - inset);
    } else {
      ctx.moveTo(x0 + inset, y0); ctx.lineTo(x0 + inset, y1);
      ctx.moveTo(x1 - inset, y0); ctx.lineTo(x1 - inset, y1);
    }
    ctx.stroke();
  }
  if (t.pattern === 'plain') return;

  // runas (ou um ornamento em losangos) ao longo do barrado
  const gSize = across * (t.pattern === 'ornament' ? 0.5 : 0.56);
  const step = gSize * (t.pattern === 'ornament' ? 1.0 : 1.45);
  const n = Math.floor(along / step);
  const offset = (along - n * step) / 2 + step / 2;
  for (let i = 0; i < n; i++) {
    const c = offset + i * step;
    const gx = t.axis === 'u' ? x0 + c : x0 + bw / 2;
    const gy = t.axis === 'u' ? y0 + bh / 2 : y0 + c;
    for (const [ctx, stroke] of [[cx, dark], [hx, 'rgb(250, 250, 250)']]) {
      ctx.strokeStyle = stroke;
      if (t.pattern === 'ornament') {
        ctx.lineWidth = Math.max(1.2, gSize * 0.1);
        ctx.beginPath();
        ctx.moveTo(gx - gSize / 2, gy); ctx.lineTo(gx, gy - gSize / 2); ctx.lineTo(gx + gSize / 2, gy); ctx.lineTo(gx, gy + gSize / 2); ctx.closePath();
        ctx.moveTo(gx - gSize * 0.12, gy); ctx.arc(gx, gy, gSize * 0.12, Math.PI, Math.PI * 3);
        ctx.stroke();
      } else {
        const gw = gSize * 0.62, gh = gSize;
        drawGlyph(ctx, glyphs[(i + (t.seed || 0)) % glyphs.length], gx - gw / 2, gy - gh / 2, gw, gh, Math.max(1.4, gSize * 0.11));
      }
    }
  }
}

// ---------- couro, madeira, pedra ----------
export function leatherTextures(seed = 3, base = '#4a2c19') {
  const w = 256, noise = makeNoise(seed, 16), fine = makeNoise(seed + 5, 64);
  const [c, cx] = makeCanvas(w);
  const [hc, hx] = makeCanvas(w);
  const img = cx.createImageData(w, w), him = hx.createImageData(w, w);
  const b = srgb255(base);
  for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) {
    const n = noise(x / w, y / w, 4), f = fine(x / w, y / w, 2);
    const k = 0.75 + 0.45 * n;
    const i = (y * w + x) * 4;
    img.data[i] = b[0] * k; img.data[i + 1] = b[1] * k; img.data[i + 2] = b[2] * k; img.data[i + 3] = 255;
    him.data[i] = him.data[i + 1] = him.data[i + 2] = (0.4 * n + 0.6 * f) * 255; him.data[i + 3] = 255;
  }
  cx.putImageData(img, 0, 0);
  hx.putImageData(him, 0, 0);
  return { map: toTexture(c), normal: toTexture(heightToNormal(readHeight(hx, w, w), w, w, 1.2), { color: false }) };
}

export function woodTextures(seed = 4) {
  const w = 256, h = 1024, noise = makeNoise(seed, 16);
  const [c, cx] = makeCanvas(w, h);
  const [hc, hx] = makeCanvas(w, h);
  const img = cx.createImageData(w, h), him = hx.createImageData(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const n = noise(x / w, y / h * 0.25, 3);
    const grain = Math.sin((x / w) * 60 + n * 14) * 0.5 + 0.5;
    const k = 0.55 + 0.35 * grain * (0.6 + 0.4 * n);
    const i = (y * w + x) * 4;
    img.data[i] = 78 * k; img.data[i + 1] = 50 * k; img.data[i + 2] = 30 * k; img.data[i + 3] = 255;
    him.data[i] = him.data[i + 1] = him.data[i + 2] = grain * 255; him.data[i + 3] = 255;
  }
  cx.putImageData(img, 0, 0);
  hx.putImageData(him, 0, 0);
  return { map: toTexture(c), normal: toTexture(heightToNormal(readHeight(hx, w, h), w, h, 2.5), { color: false }) };
}

// Pedra de piso: laje com manchas, rachaduras e borda gasta. 'variant' muda a semente.
export function stoneTextures(variant = 0, size = 512) {
  const w = size, noise = makeNoise(100 + variant * 17, 8), fine = makeNoise(200 + variant, 64);
  const r = rng(300 + variant);
  const [c, cx] = makeCanvas(w);
  const [hc, hx] = makeCanvas(w);
  const [rc, rx] = makeCanvas(w);
  const img = cx.createImageData(w, w), him = hx.createImageData(w, w), rim = rx.createImageData(w, w);
  const tint = [[62, 66, 78], [58, 60, 70], [66, 64, 72], [54, 60, 72]][variant % 4];
  for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) {
    const u = x / w, v = y / w;
    const n = noise(u, v, 5), f = fine(u, v, 2);
    const edge = Math.min(u, v, 1 - u, 1 - v);
    const bevel = Math.min(1, edge / 0.035);
    const k = (0.62 + 0.55 * n + (f - 0.5) * 0.15) * (0.55 + 0.45 * bevel);
    const i = (y * w + x) * 4;
    img.data[i] = tint[0] * k; img.data[i + 1] = tint[1] * k; img.data[i + 2] = tint[2] * k; img.data[i + 3] = 255;
    const hgt = 0.35 + 0.35 * n + 0.1 * f;
    him.data[i] = him.data[i + 1] = him.data[i + 2] = clamp(hgt * bevel * 255, 0, 255); him.data[i + 3] = 255;
    rim.data[i] = 255; rim.data[i + 1] = clamp((0.72 + 0.25 * (1 - n)) * 255, 0, 255); rim.data[i + 2] = 0; rim.data[i + 3] = 255;
  }
  cx.putImageData(img, 0, 0);
  hx.putImageData(him, 0, 0);
  rx.putImageData(rim, 0, 0);
  // rachaduras: linhas quebradas escuras
  for (let k = 0; k < 2 + Math.floor(r() * 3); k++) {
    let x = r() * w, y = r() * w, a = r() * Math.PI * 2;
    for (const ctx of [cx, hx]) {
      ctx.strokeStyle = ctx === cx ? 'rgba(10, 10, 16, .65)' : 'rgb(0, 0, 0)';
      ctx.lineWidth = 1.2 + r() * 1.2;
    }
    const pts = [[x, y]];
    for (let s = 0; s < 6 + r() * 8; s++) {
      a += (r() - 0.5) * 1.1;
      x += Math.cos(a) * (8 + r() * 18);
      y += Math.sin(a) * (8 + r() * 18);
      pts.push([x, y]);
    }
    for (const ctx of [cx, hx]) {
      ctx.beginPath();
      pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
      ctx.stroke();
    }
  }
  const normal = heightToNormal(readHeight(hx, w, w), w, w, 3.2);
  return { map: toTexture(c), normal: toTexture(normal, { color: false }), orm: toTexture(rc, { color: false }) };
}

export function rockTextures(seed = 9) {
  const w = 512, noise = makeNoise(seed, 8), fine = makeNoise(seed + 3, 32);
  const [c, cx] = makeCanvas(w);
  const [hc, hx] = makeCanvas(w);
  const img = cx.createImageData(w, w), him = hx.createImageData(w, w);
  for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) {
    const n = noise(x / w, y / w, 5), f = fine(x / w, y / w, 3);
    const k = 0.45 + 0.6 * n * (0.7 + 0.3 * f);
    const i = (y * w + x) * 4;
    img.data[i] = 38 * k; img.data[i + 1] = 42 * k; img.data[i + 2] = 58 * k; img.data[i + 3] = 255;
    him.data[i] = him.data[i + 1] = him.data[i + 2] = (0.6 * n + 0.4 * f) * 255; him.data[i + 3] = 255;
  }
  cx.putImageData(img, 0, 0);
  hx.putImageData(him, 0, 0);
  return { map: toTexture(c), normal: toTexture(heightToNormal(readHeight(hx, w, w), w, w, 4), { color: false }) };
}

// ---------- brilhos ----------
// Círculo mágico para o chão: anéis, glifos e marcas. Branco sobre transparente; a cor vem do material.
export function runeCircleTexture(size = 1024, seed = 21) {
  const [c, cx] = makeCanvas(size);
  const R = size / 2, glyphs = makeGlyphs(40, seed);
  cx.translate(R, R);
  cx.strokeStyle = 'rgba(255,255,255,1)';
  const ring = (r, lw) => { cx.lineWidth = lw; cx.beginPath(); cx.arc(0, 0, r, 0, Math.PI * 2); cx.stroke(); };
  ring(R * 0.98, 4); ring(R * 0.93, 2); ring(R * 0.79, 3); ring(R * 0.75, 1.5); ring(R * 0.42, 2.5);
  const n = 30;
  for (let i = 0; i < n; i++) {
    cx.save();
    cx.rotate((i / n) * Math.PI * 2);
    drawGlyph(cx, glyphs[i % glyphs.length], -R * 0.025, -R * 0.915, R * 0.05, R * 0.09, 3);
    cx.restore();
  }
  cx.lineWidth = 2;
  for (let k = 0; k < 2; k++) {
    cx.beginPath();
    for (let i = 0; i <= 3; i++) {
      const a = (i / 3) * Math.PI * 2 + k * Math.PI / 3 - Math.PI / 2;
      i ? cx.lineTo(Math.cos(a) * R * 0.75, Math.sin(a) * R * 0.75) : cx.moveTo(Math.cos(a) * R * 0.75, Math.sin(a) * R * 0.75);
    }
    cx.stroke();
  }
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
    cx.beginPath(); cx.arc(Math.cos(a) * R * 0.6, Math.sin(a) * R * 0.6, R * 0.06, 0, Math.PI * 2); cx.stroke();
  }
  return toTexture(c, { color: true });
}

// Faixa de runas para a moldura do tabuleiro e paredes.
export function runeStripTexture(count = 16, seed = 33, w = 2048, h = 128) {
  const [c, cx] = makeCanvas(w, h);
  const glyphs = makeGlyphs(count, seed);
  cx.strokeStyle = '#fff';
  const step = w / count;
  for (let i = 0; i < count; i++) drawGlyph(cx, glyphs[i], i * step + step * 0.3, h * 0.18, step * 0.4, h * 0.64, h * 0.07);
  return toTexture(c);
}

export function glyphTexture(seed = 5, size = 128) {
  const [c, cx] = makeCanvas(size);
  cx.strokeStyle = '#fff';
  drawGlyph(cx, makeGlyphs(1, seed)[0], size * 0.25, size * 0.12, size * 0.5, size * 0.76, size * 0.09);
  return toTexture(c);
}

export function softDotTexture(size = 64) {
  const [c, cx] = makeCanvas(size);
  const g = cx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  cx.fillStyle = g;
  cx.fillRect(0, 0, size, size);
  return toTexture(c);
}

export function mistTexture(size = 512, seed = 41) {
  const noise = makeNoise(seed, 6);
  const [c, cx] = makeCanvas(size);
  const img = cx.createImageData(size, size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size, v = y / size;
    const d = Math.hypot(u - 0.5, v - 0.5) * 2;
    const a = clamp((noise(u, v, 4) - 0.35) * 1.8, 0, 1) * clamp(1 - d, 0, 1);
    const i = (y * size + x) * 4;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
    img.data[i + 3] = a * 255;
  }
  cx.putImageData(img, 0, 0);
  return toTexture(c);
}

// Alvo pintado no saco de palha do boneco de treino.
export function dummyTextures() {
  const w = 512, noise = makeNoise(77, 32);
  const [c, cx] = makeCanvas(w);
  const img = cx.createImageData(w, w);
  for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) {
    const n = noise(x / w, y / w, 3);
    const stripe = Math.sin(y * 0.6 + n * 8) * 0.5 + 0.5;
    const k = 0.7 + 0.3 * stripe * n;
    const i = (y * w + x) * 4;
    img.data[i] = 168 * k; img.data[i + 1] = 136 * k; img.data[i + 2] = 82 * k; img.data[i + 3] = 255;
  }
  cx.putImageData(img, 0, 0);
  // alvo na frente (u = 0,5 é a frente do saco)
  const cxp = w * 0.5, cyp = w * 0.42;
  [[0.2, '#7d1d1d'], [0.15, '#d9c9a0'], [0.1, '#7d1d1d'], [0.05, '#d9c9a0']].forEach(([r, col]) => {
    cx.fillStyle = col;
    cx.beginPath();
    cx.ellipse(cxp, cyp, r * w * 0.55, r * w, 0, 0, Math.PI * 2);
    cx.fill();
  });
  return { map: toTexture(c) };
}
