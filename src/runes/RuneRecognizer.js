// Reconhecimento de runas desenhadas no ar. Nada de tela aqui: recebe traços (listas de pontos) e devolve
// qual runa é, com uma nota de 0 a 1.
//
// Base: o $1 Unistroke Recognizer (Wobbrock, Wilson e Li, UIST 2007), com quatro ajustes para o jogo:
//   1. Escala uniforme (a maior dimensão vira 1). O $1 original estica cada eixo para um quadrado, o que
//      deforma formas achatadas como a onda.
//   2. Formas fechadas (círculo, losango, triângulo) valem começando em qualquer ponto e em qualquer sentido.
//   3. O giro aceito depende da runa: o círculo e a espiral giram à vontade; o V e o raio, só um pouco
//      (girado demais, um raio parece outra coisa).
//   4. Conferências de forma (cantos, ondulações, fechamento, espiral para dentro) separam runas que a
//      distância média sozinha confundiria, e recusam rabiscos.
//   5. Aceitar não depende só da nota: a melhor runa precisa ficar à frente da segunda com uma folga que cresce
//      quando a nota é mais baixa, e, abaixo da nota "firme", as conferências de forma daquela runa precisam
//      passar quase inteiras. Rabiscos são barrados pela forma: trocas de sentido da curva e comprimento demais
//      para o tamanho do desenho.
//   6. A suavização se adapta ao tremor: um traço tremido é alisado mais antes de comparar.
// Runas de vários traços (raio duplo): cada traço é reconhecido sozinho e o conjunto é conferido pela
// posição (lado a lado). Os traços juntos num só também são comparados, para quem não tira o dedo.
import { RUNES } from './runeShapes.js';

export const RECOGNIZER_CONFIG = {
  points: 64,          // pontos depois da reamostragem
  minScore: 0.75,      // nota mínima para aceitar
  strictScore: 0.82,   // a partir desta nota, a runa vale só pela nota e pela folga mínima
  minMargin: 0.035,    // a melhor runa precisa ficar essa distância à frente da segunda...
  marginSlope: 0.6,    // ...mais isto vezes o que falta para a nota firme (nota baixa pede folga maior)
  gateCheck: 0.92,     // abaixo da nota firme, o fator anti-rabisco da runa precisa dar pelo menos isto
  closedRatio: 0.22,   // ponta a ponta menor que isto (em relação ao tamanho) = forma fechada
  nearClosedRatio: 0.6, // até isto, uma forma fechada que a mão não fechou direito ainda vale (com desconto)
  minPathPx: 90,       // traço mais curto que isto (pixels de tela) é ignorado
  minSizePx: 55,       // desenho menor que isto (maior lado, em pixels) é ignorado
  shiftStep: 2,        // passo da busca do ponto de partida nas formas fechadas
  nearMiss: 0.12,      // a runa pedida ficou até isto abaixo da nota mínima: "quase", com uma dica
};

// Níveis de exigência do desenho livre (a dificuldade escolhe um; src/runes/difficulty.js).
export const RECOGNIZER_LEVELS = {
  normal: { ...RECOGNIZER_CONFIG },
  avancado: { ...RECOGNIZER_CONFIG, minScore: 0.8, strictScore: 0.86, minMargin: 0.05, marginSlope: 0.6, gateCheck: 0.99, nearClosedRatio: 0.5 },
};

const HALF_DIAG = 0.5 * Math.SQRT2;
const PHI = 0.5 * (-1 + Math.sqrt(5));

// ---------- geometria dos traços ----------
export function pathLength(pts) {
  let d = 0;
  for (let i = 1; i < pts.length; i++) d += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return d;
}

export function bounds(pts) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of pts) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; }
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
}

// Reamostra em n pontos igualmente espaçados ao longo do caminho: tira a velocidade do desenho.
export function resample(pts, n) {
  const src = pts.filter((p, i) => i === 0 || p[0] !== pts[i - 1][0] || p[1] !== pts[i - 1][1]);
  if (src.length < 2) return Array.from({ length: n }, () => [...(src[0] || [0, 0])]);
  const step = pathLength(src) / (n - 1);
  const out = [[src[0][0], src[0][1]]];
  let acc = 0, prev = src[0];
  for (let i = 1; i < src.length; i++) {
    const cur = src[i];
    let d = Math.hypot(cur[0] - prev[0], cur[1] - prev[1]);
    while (acc + d >= step && out.length < n) {
      const t = (step - acc) / d;
      const q = [prev[0] + t * (cur[0] - prev[0]), prev[1] + t * (cur[1] - prev[1])];
      out.push(q);
      prev = q; d = Math.hypot(cur[0] - prev[0], cur[1] - prev[1]); acc = 0;
    }
    acc += d; prev = cur;
  }
  while (out.length < n) out.push([...src[src.length - 1]]);
  return out;
}

// Média móvel curta: tira o tremor fino antes de medir cantos e ondulações.
export function smoothPath(pts, k = 1) {
  if (pts.length < 3) return pts.map(p => [...p]);
  return pts.map((_, i) => {
    let sx = 0, sy = 0, n = 0;
    for (let j = Math.max(0, i - k); j <= Math.min(pts.length - 1, i + k); j++) { sx += pts[j][0]; sy += pts[j][1]; n++; }
    return [sx / n, sy / n];
  });
}

// Centro no zero e maior dimensão igual a 1 (mantém a proporção).
function normalize(pts) {
  const b = bounds(pts);
  const s = Math.max(b.w, b.h) || 1;
  let cx = 0, cy = 0;
  for (const [x, y] of pts) { cx += x; cy += y; }
  cx /= pts.length; cy /= pts.length;
  return pts.map(([x, y]) => [(x - cx) / s, (y - cy) / s]);
}

function rotate(pts, a) {
  const c = Math.cos(a), s = Math.sin(a);
  return pts.map(([x, y]) => [x * c - y * s, x * s + y * c]);
}

function avgDist(a, b) {
  let d = 0;
  for (let i = 0; i < a.length; i++) d += Math.hypot(a[i][0] - b[i][0], a[i][1] - b[i][1]);
  return d / a.length;
}

// Menor distância girando o desenho dentro de [-range, range] (busca da razão áurea, como no $1).
function distAtBestAngle(cand, tpl, range) {
  const at = a => avgDist(rotate(cand, a), tpl);
  if (range <= 0) return at(0);
  let lo = -range, hi = range;
  if (range > 1) { // giro livre: procura grosso em 16 passos e refina em volta do melhor
    let best = 0, bd = Infinity;
    for (let i = 0; i < 16; i++) { const a = -Math.PI + (i / 16) * Math.PI * 2, d = at(a); if (d < bd) { bd = d; best = a; } }
    lo = best - Math.PI / 8; hi = best + Math.PI / 8;
  }
  let x1 = PHI * lo + (1 - PHI) * hi, f1 = at(x1);
  let x2 = (1 - PHI) * lo + PHI * hi, f2 = at(x2);
  while (Math.abs(hi - lo) > 0.035) {
    if (f1 < f2) { hi = x2; x2 = x1; f2 = f1; x1 = PHI * lo + (1 - PHI) * hi; f1 = at(x1); }
    else { lo = x1; x1 = x2; f1 = f2; x2 = (1 - PHI) * lo + PHI * hi; f2 = at(x2); }
  }
  return Math.min(f1, f2);
}

// Desloca o ponto de partida de um caminho fechado (o último ponto repete o primeiro).
function shiftClosed(pts, k) {
  const m = pts.length - 1, out = new Array(pts.length);
  for (let i = 0; i < m; i++) out[i] = pts[(i + k) % m];
  out[m] = out[0];
  return out;
}

// ---------- medidas de forma ----------
// Cantos: mudanças de direção fortes, medidas numa janela para não contar o tremor.
function countCorners(p, minTurn = 1.0, win = 3) {
  const ang = [];
  for (let i = win; i < p.length - win; i++) {
    const a = Math.atan2(p[i][1] - p[i - win][1], p[i][0] - p[i - win][0]);
    const b = Math.atan2(p[i + win][1] - p[i][1], p[i + win][0] - p[i][0]);
    let d = Math.abs(b - a); if (d > Math.PI) d = Math.PI * 2 - d;
    ang.push(d);
  }
  let corners = 0;
  for (let i = 0; i < ang.length; i++) {
    if (ang[i] < minTurn) continue;
    let peak = true;
    for (let j = Math.max(0, i - win); j <= Math.min(ang.length - 1, i + win); j++) if (ang[j] > ang[i] || (ang[j] === ang[i] && j < i)) { peak = false; break; }
    if (peak) corners++;
  }
  return corners;
}

// Vértices do contorno simplificado (Douglas-Peucker): triângulo 3, losango 4, círculo 6 ou mais.
// O contorno fechado é cortado nos dois pontos mais distantes entre si e cada metade é simplificada.
function simplify(pts, eps) {
  if (pts.length < 3) return pts;
  const [ax, ay] = pts[0], [bx, by] = pts[pts.length - 1];
  const L = Math.hypot(bx - ax, by - ay) || 1e-9;
  let dmax = 0, k = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = Math.abs((bx - ax) * (ay - pts[i][1]) - (ax - pts[i][0]) * (by - ay)) / L;
    if (d > dmax) { dmax = d; k = i; }
  }
  if (dmax <= eps) return [pts[0], pts[pts.length - 1]];
  return [...simplify(pts.slice(0, k + 1), eps).slice(0, -1), ...simplify(pts.slice(k), eps)];
}
function polygonVertices(closed, eps = 0.075) {
  const ring = closed.slice(0, -1);
  let a = 0, b = 0, best = -1;
  for (let i = 0; i < ring.length; i++) for (let j = i + 1; j < ring.length; j++) {
    const d = (ring[i][0] - ring[j][0]) ** 2 + (ring[i][1] - ring[j][1]) ** 2;
    if (d > best) { best = d; a = i; b = j; }
  }
  const half1 = ring.slice(a, b + 1), half2 = [...ring.slice(b), ...ring.slice(0, a + 1)];
  return simplify(half1, eps).length - 2 + simplify(half2, eps).length - 2 + 2;
}

// Regularidade da onda: as subidas e descidas têm alturas parecidas? (desvio ÷ média das alturas entre picos e
// vales; onda feita à mão ~0,15; zigue-zague com alturas ao acaso ~0,5)
function swingVariation(p, tol = 0.06) {
  const ext = [];
  let dir = 0, lo = p[0][1], hi = p[0][1];
  for (const q of p) {
    const v = q[1];
    if (dir === 0) { if (v > lo + tol) { dir = 1; hi = v; } else if (v < hi - tol) { dir = -1; lo = v; } else { lo = Math.min(lo, v); hi = Math.max(hi, v); } }
    else if (dir === 1) { if (v > hi) hi = v; else if (v < hi - tol) { ext.push(hi); dir = -1; lo = v; } }
    else if (v < lo) lo = v; else if (v > lo + tol) { ext.push(lo); dir = 1; hi = v; }
  }
  if (ext.length < 3) return 0;
  const sw = [];
  for (let i = 1; i < ext.length; i++) sw.push(Math.abs(ext[i] - ext[i - 1]));
  const m = sw.reduce((a, b) => a + b, 0) / sw.length;
  return Math.sqrt(sw.reduce((a, b) => a + (b - m) ** 2, 0) / sw.length) / (m || 1);
}

// Quantas vezes o desenho troca de sentido num eixo (com folga, para o tremor não contar).
function reversals(p, axis, tol) {
  let dir = 0, n = 0, lo = p[0][axis], hi = p[0][axis];
  for (const q of p) {
    const v = q[axis];
    if (dir === 0) {
      if (v > lo + tol) { dir = 1; hi = v; } else if (v < hi - tol) { dir = -1; lo = v; }
      else { lo = Math.min(lo, v); hi = Math.max(hi, v); }
    } else if (dir === 1) {
      if (v > hi) hi = v; else if (v < hi - tol) { dir = -1; lo = v; n++; }
    } else if (v < lo) lo = v; else if (v > lo + tol) { dir = 1; hi = v; n++; }
  }
  return n;
}

// Tremor do traço: quanto cada ponto foge do meio dos vizinhos, em relação ao espaçamento (curva lisa ~0,02;
// mão tremendo 0,3 ou mais).
export function jitterOf(dense) {
  if (dense.length < 3) return 0;
  let sum = 0, step = 0;
  for (let i = 1; i < dense.length - 1; i++) {
    const [a, b, c] = [dense[i - 1], dense[i], dense[i + 1]];
    sum += Math.hypot(b[0] - (a[0] + c[0]) / 2, b[1] - (a[1] + c[1]) / 2);
    step += Math.hypot(c[0] - a[0], c[1] - a[1]) / 2;
  }
  return step > 0 ? sum / step : 0;
}

// Caminho pronto para comparar: denso e igualmente espaçado ANTES de suavizar (com poucos pontos, a média
// móvel comeria os cantos), suavizado contra o tremor (mais forte quanto mais tremido), reamostrado e normalizado.
function prepare(raw, n) {
  const dense = resample(raw, n * 2), j = jitterOf(dense);
  const k = j < 0.25 ? 1 : j < 0.5 ? 2 : 3;
  return normalize(resample(smoothPath(dense, k), n));
}

// Trocas de sentido da curva (esquerda <-> direita): um círculo, um V ou uma espiral não trocam; o zigue-zague do
// raio troca a cada canto; um rabisco troca o tempo todo. Medido num caminho bem alisado (o tremor não conta)
// e só quando a curva já tinha virado de verdade para um lado (minRun radianos) antes de trocar.
function turnFlips(raw, n = 40, win = 2, minTurn = 0.45, minRun = 0.7) {
  const p = resample(smoothPath(resample(raw, n * 2), 3), n);
  let last = 0, run = 0, flips = 0;
  for (let i = win; i < p.length - win; i++) {
    const a = Math.atan2(p[i][1] - p[i - win][1], p[i][0] - p[i - win][0]);
    const b = Math.atan2(p[i + win][1] - p[i][1], p[i + win][0] - p[i][0]);
    let d = b - a;
    if (d > Math.PI) d -= Math.PI * 2; else if (d < -Math.PI) d += Math.PI * 2;
    if (Math.abs(d) < minTurn) continue;
    const sg = Math.sign(d);
    if (sg === last) run += Math.abs(d);
    else { if (last && run >= minRun) flips++; last = sg; run = Math.abs(d); }
  }
  return flips;
}

export function features(raw) {
  const b = bounds(raw), size = Math.max(b.w, b.h) || 1, len = pathLength(raw);
  const p = prepare(raw, RECOGNIZER_CONFIG.points);
  const ends = Math.hypot(raw[0][0] - raw[raw.length - 1][0], raw[0][1] - raw[raw.length - 1][1]) / size;
  // espiral para dentro: o raio (ao centro da caixa) cai do começo para o fim
  const nb = bounds(p), cx = (nb.x0 + nb.x1) / 2, cy = (nb.y0 + nb.y1) / 2;
  const rad = q => Math.hypot(q[0] - cx, q[1] - cy);
  const k = Math.floor(p.length * 0.25);
  let r0 = 0, r1 = 0;
  for (let i = 0; i < k; i++) { r0 += rad(p[i]); r1 += rad(p[p.length - 1 - i]); }
  const nearlyClosed = ends < RECOGNIZER_CONFIG.nearClosedRatio;
  // redondeza: quanto a distância ao centro varia (círculo ~0,05; losango ~0,15; triângulo ~0,25)
  let rm = 0, rv = 0;
  for (const q of p) rm += rad(q);
  rm /= p.length;
  for (const q of p) rv += (rad(q) - rm) ** 2;
  const radiusVar = Math.sqrt(rv / p.length) / (rm || 1);
  // V: as duas pontas na mesma altura (um V em pé) e o canto (o ponto mais baixo) entre elas
  const endsDy = Math.abs(raw[0][1] - raw[raw.length - 1][1]) / size;
  // faixa: altura do desenho na perpendicular da linha começo-fim, em relação a essa linha (não muda com o giro);
  // a onda feita à mão fica entre 0,2 e 0,45; um zigue-zague com alturas ao acaso passa disso
  const ux = raw[raw.length - 1][0] - raw[0][0], uy = raw[raw.length - 1][1] - raw[0][1], uL = Math.hypot(ux, uy) || 1;
  let bLo = Infinity, bHi = -Infinity;
  for (const q of raw) { const d = ((q[0] - raw[0][0]) * -uy + (q[1] - raw[0][1]) * ux) / uL; if (d < bLo) bLo = d; if (d > bHi) bHi = d; }
  const band = (bHi - bLo) / uL;
  return {
    size, len, aspect: Math.min(b.w, b.h) / size, ends, closed: ends < RECOGNIZER_CONFIG.closedRatio, nearlyClosed, endsDy, band,
    flips: turnFlips(raw), lenRatio: pathLength(p), jitter: jitterOf(resample(raw, RECOGNIZER_CONFIG.points * 2)), swing: swingVariation(p),
    // a mesma forma com a ponta ligada ao começo: é ela que se compara com as runas fechadas
    closedNorm: nearlyClosed ? prepare([...raw, raw[0]], RECOGNIZER_CONFIG.points) : null,
    corners: countCorners(p), radiusVar, verts: nearlyClosed ? polygonVertices(prepare([...raw, raw[0]], RECOGNIZER_CONFIG.points)) : 0, xRev: reversals(p, 0, 0.06), yRev: reversals(p, 1, 0.06),
    inward: r1 > 0 ? r0 / r1 : 9, straightness: Math.hypot(raw[0][0] - raw[raw.length - 1][0], raw[0][1] - raw[raw.length - 1][1]) / (len || 1),
    norm: p,
  };
}

// Conferências por runa: devolvem um fator (1 = combina; menor = desconfia).
// Fechamento: fechada vale inteira; quase fechada (a mão parou um pouco antes) vale com desconto pequeno.
const shut = f => (f.closed ? 1 : f.ends < 0.38 ? 0.96 : f.nearlyClosed ? 0.93 : 0.8);
// Rabisco: trocas de sentido da curva e comprimento acima do que a runa tem (com folga para a mão).
// (limites medidos em desenhos sintéticos de cada runa, com folga: tests/runes.test.mjs mostra a distribuição)
const LIMITS = {
  circulo: { flips: 1, len: 4.0 }, losango: { flips: 1, len: 3.8 }, triangulo: { flips: 1, len: 4.0 }, espiral: { flips: 1, len: 6.6 },
  onda: { flips: 6, len: 3.1 }, v: { flips: 1, len: 3.3 }, raio: { flips: 3, len: 3.3 }, raioDuplo: { flips: 7, len: 6.4 },
};
// fator de "arrumação" (1 = nada de rabisco): uma troca a mais passa (a mão ondula), várias não
// (na onda, alturas ao acaso e faixa alta também são sinal de zigue-zague sem querer, não de onda)
const waveShape = f => (f.swing < 0.35 ? 1 : f.swing < 0.5 ? 0.92 : 0.8) * (f.band < 0.5 ? 1 : f.band < 0.62 ? 0.9 : 0.78);
export const tidy = (f, id) => { const L = LIMITS[id]; const x = f.flips - L.flips; return (x <= 1 ? 1 : x === 2 ? 0.93 : x === 3 ? 0.85 : 0.72) * (f.lenRatio <= L.len ? 1 : f.lenRatio <= L.len * 1.2 ? 0.92 : 0.75) * (id === 'onda' ? waveShape(f) : 1); };
const CHECKS = {
  circulo: f => tidy(f, 'circulo') * shut(f) * (f.verts >= 6 ? 1 : f.verts === 5 ? 0.95 : 0.86) * (f.aspect < 0.55 ? 0.85 : 1) * (f.radiusVar < 0.1 ? 1 : f.radiusVar < 0.14 ? 0.94 : 0.85) * (f.corners <= 1 ? 1 : f.corners === 2 ? 0.96 : 0.9),
  onda: f => tidy(f, 'onda') * (f.yRev >= 2 ? 1 : f.yRev === 1 ? 0.88 : 0.7) * (f.xRev === 0 ? 1 : 0.8) * (f.closed ? 0.8 : 1) * (f.aspect > 0.75 ? 0.85 : 1),
  v: f => tidy(f, 'v') * (f.closed ? 0.8 : 1) * (f.corners <= 2 ? 1 : 0.9) * (f.endsDy < 0.38 ? 1 : f.endsDy < 0.55 ? 0.88 : 0.72),
  losango: f => tidy(f, 'losango') * shut(f) * (f.verts === 4 ? 1 : f.verts === 5 ? 0.96 : 0.9) * (f.radiusVar > 0.09 ? 1 : 0.92) * (f.radiusVar < 0.23 ? 1 : 0.95),
  raio: f => tidy(f, 'raio') * (f.closed ? 0.8 : 1) * (f.corners >= 2 ? 1 : 0.85) * (f.straightness > 0.5 ? 1 : 0.9),
  raioDuplo: f => tidy(f, 'raioDuplo') * (f.closed ? 0.8 : 1) * (f.corners >= 4 ? 1 : 0.88),
  triangulo: f => tidy(f, 'triangulo') * shut(f) * (f.verts === 3 ? 1 : f.verts === 4 ? 0.95 : 0.88) * (f.radiusVar > 0.2 ? 1 : 0.95),
  espiral: f => tidy(f, 'espiral') * (f.closed ? 0.8 : 1) * (f.inward > 2.2 ? 1 : f.inward > 1.5 ? 0.95 : f.inward > 1.25 ? 0.88 : 0.75),
};

// O que corrigir para a runa pedida passar (a conferência de forma que mais pesou). '' = nada específico.
export function diagnose(id, f, strokes = 1) {
  if (!f) return '';
  if (f.flips > LIMITS[id].flips + 2 || f.lenRatio > LIMITS[id].len * 1.2) return 'desenhe de uma vez, sem voltar nem rabiscar';
  switch (id) {
    case 'circulo': return !f.closed ? 'feche o círculo, voltando ao ponto de partida' : f.verts < 6 || f.radiusVar > 0.12 ? 'faça a volta mais redonda, sem cantos' : f.aspect < 0.55 ? 'faça o círculo menos achatado' : '';
    case 'losango': return !f.closed ? 'feche o losango, voltando ao começo' : f.verts !== 4 ? 'marque bem os quatro cantos' : '';
    case 'triangulo': return !f.closed ? 'feche o triângulo, voltando ao começo' : f.verts !== 3 ? 'faça três lados retos e três cantos marcados' : '';
    case 'onda': return f.yRev < 2 ? 'faça pelo menos duas ondas, subindo e descendo' : f.xRev > 0 ? 'vá sempre para o mesmo lado, sem voltar' : f.swing >= 0.35 || f.band >= 0.5 ? 'faça ondas baixas e da mesma altura' : '';
    case 'v': return f.corners > 2 ? 'um canto só, embaixo: desça e suba em linha reta' : f.closed ? 'não feche o V' : f.endsDy >= 0.38 ? 'termine o V na mesma altura em que começou' : '';
    case 'raio': return f.corners < 2 ? 'faça o zigue-zague com dois cantos bem marcados, de cima para baixo' : '';
    case 'raioDuplo': return strokes < 2 && f.corners < 4 ? 'faça os dois raios, lado a lado' : '';
    case 'espiral': return f.inward < 1.5 ? 'comece por fora e termine no centro, girando sempre para o mesmo lado' : '';
    default: return '';
  }
}

// ---------- o reconhecedor ----------
export class RuneRecognizer {
  constructor(runes = RUNES, config = RECOGNIZER_CONFIG) {
    this.config = config;
    this.runes = runes;
    this.templates = [];
    for (const [id, r] of Object.entries(runes)) {
      const paths = [];
      if (r.strokes.length === 1) paths.push(r.strokes[0]);
      for (const v of r.variants || []) paths.push(v);
      for (const path of paths) {
        const pts = normalize(resample(path, config.points));
        this.templates.push({ id, pts, closed: !!r.closed, rotation: r.rotation ?? 0.3 });
        if (r.reversible || (!r.closed && r.rotation >= Math.PI)) this.templates.push({ id, pts: normalize(resample([...path].reverse(), config.points)), closed: false, rotation: r.rotation ?? 0.3 });
      }
    }
  }

  // Compara um traço com todos os modelos. Devolve as runas em ordem de nota, sem repetir runa.
  rankStroke(raw, { only = null } = {}) {
    const cfg = this.config, f = features(raw);
    const cand = f.norm;
    const best = new Map();
    for (const t of this.templates) {
      if (only && !only.includes(t.id)) continue;
      let d;
      if (t.closed && f.nearlyClosed) {
        // começa em qualquer ponto, nos dois sentidos: acha os melhores deslocamentos sem girar e refina girando
        const closedCand = [...f.closedNorm.slice(0, -1), f.closedNorm[0]];
        const tries = [];
        for (const seq of [closedCand, [...closedCand].reverse()]) {
          for (let k = 0; k < seq.length - 1; k += cfg.shiftStep) { const s = shiftClosed(seq, k); tries.push({ s, d: avgDist(s, t.pts) }); }
        }
        tries.sort((a, b) => a.d - b.d);
        d = Math.min(...tries.slice(0, 4).map(o => distAtBestAngle(o.s, t.pts, t.rotation)));
      } else d = distAtBestAngle(cand, t.pts, t.rotation);
      const check = CHECKS[t.id] ? CHECKS[t.id](f) : 1;
      const score = Math.max(0, 1 - d / HALF_DIAG) * check;
      if (!best.has(t.id) || best.get(t.id).score < score) best.set(t.id, { score, check, tidy: LIMITS[t.id] ? tidy(f, t.id) : 1 });
    }
    return { ranking: [...best].map(([id, b]) => ({ id, score: b.score, check: b.check, tidy: b.tidy })).sort((a, b) => b.score - a.score), features: f };
  }

  // Folga exigida entre a primeira e a segunda runa para uma nota (nota baixa pede folga maior).
  marginFor(score, cfg = this.config) { return cfg.minMargin + Math.max(0, cfg.strictScore - score) * cfg.marginSlope; }

  // strokes: [[ [x,y], ... ], ...] em pixels de tela. Devolve { id, score, accepted, ranking, reason }.
  recognize(strokes) {
    const cfg = this.config;
    const valid = strokes.filter(s => s.length >= 2 && pathLength(s) >= cfg.minPathPx);
    if (!valid.length) return { id: null, score: 0, accepted: false, ranking: [], reason: 'curto' };
    const all = valid.flat();
    const b = bounds(all);
    if (Math.max(b.w, b.h) < cfg.minSizePx) return { id: null, score: 0, accepted: false, ranking: [], reason: 'pequeno' };

    // todos os traços juntos, como se fossem um só (quem não tira o dedo, ou tira sem querer)
    const joined = this.rankStroke(all);
    let ranking = joined.ranking.filter(r => !this.runes[r.id].multi || valid.length === 1);

    // runas de vários traços: cada traço sozinho, depois a posição entre eles
    for (const [id, r] of Object.entries(this.runes)) {
      if (!r.multi) continue;
      let score = 0;
      if (valid.length === r.multi.count) {
        const parts = valid.map(s => this.rankStroke(s, { only: [r.multi.part] }).ranking[0]);
        const boxes = valid.map(bounds);
        const sorted = [...boxes].sort((p, q) => p.x0 - q.x0);
        let side = 1;
        for (let i = 1; i < sorted.length; i++) {
          const gap = (sorted[i].x0 + sorted[i].x1) / 2 - (sorted[i - 1].x0 + sorted[i - 1].x1) / 2;
          const w = Math.max(sorted[i].w, sorted[i - 1].w, 1);
          const overlapY = Math.min(sorted[i].y1, sorted[i - 1].y1) - Math.max(sorted[i].y0, sorted[i - 1].y0);
          if (gap < w * 0.45) side *= 0.8;          // um em cima do outro, não lado a lado
          if (overlapY < 0.3 * Math.max(sorted[i].h, sorted[i - 1].h)) side *= 0.85;
        }
        score = Math.min(...parts.map(x => x.score)) * side;
        var check = Math.min(...parts.map(x => x.check)) * side, tidyK = Math.min(...parts.map(x => x.tidy));
      }
      const prev = ranking.find(x => x.id === id);
      if (prev) { if (score > prev.score) Object.assign(prev, { score, check, tidy: tidyK }); } else ranking.push({ id, score, check: check ?? 0, tidy: tidyK ?? 0 });
    }
    // com dois ou mais traços, uma runa de um traço só desconfia um pouco
    if (valid.length > 1) for (const x of ranking) if (!this.runes[x.id].multi) x.score *= 0.93;
    ranking.sort((p, q) => p.score - q.score).reverse();

    const top = ranking[0], second = ranking[1] || { score: 0 };
    const margin = top.score - second.score, needMargin = this.marginFor(top.score);
    // abaixo da nota firme, nada de sinal de rabisco (trocas de sentido e comprimento demais para a runa)
    const shapeOk = top.score >= cfg.strictScore || (top.tidy ?? 1) >= cfg.gateCheck;
    const accepted = top.score >= cfg.minScore && margin >= needMargin && shapeOk;
    const reason = accepted ? 'ok' : top.score < cfg.minScore ? 'diferente' : !shapeOk ? 'forma' : 'ambiguo';
    return { id: top.id, score: top.score, margin, needMargin, check: top.check, accepted, ranking, reason, strokes: valid.length, features: joined.features };
  }

  // Troca o nível de exigência (normal, avançado...) sem refazer os modelos.
  setLevel(cfg) { this.config = { ...this.config, ...cfg }; }
}
