// Modelos das oito runas: os traços de referência que o reconhecedor compara com o desenho do jogador.
// Coordenadas de tela (x para a direita, y para baixo), num quadro de mais ou menos 1×1. O tamanho e a
// posição não importam: o reconhecedor normaliza escala, posição e velocidade antes de comparar.
//
// Campos de cada runa:
//   strokes   traços do modelo principal (o que aparece na prévia, com o ponto de partida e a seta)
//   variants  outros jeitos aceitos de desenhar a mesma runa (um traço cada)
//   closed    forma fechada: pode começar em qualquer ponto e ir para qualquer lado
//   reversible  forma aberta que também vale desenhada de trás para a frente
//   rotation  quanto o desenho pode estar girado (radianos). Math.PI = qualquer giro
//   multi     runa de vários traços: cada traço é a runa 'part', lado a lado

const TAU = Math.PI * 2;

const circle = (n = 40, start = -Math.PI / 2, dir = 1) =>
  Array.from({ length: n + 1 }, (_, i) => { const a = start + dir * (i / n) * TAU; return [0.5 + 0.5 * Math.cos(a), 0.5 + 0.5 * Math.sin(a)]; });

const wave = (periods = 2, amp = 0.13, n = 60) =>
  Array.from({ length: n + 1 }, (_, i) => { const x = i / n; return [x, 0.5 - amp * Math.sin(x * periods * TAU)]; });

const spiral = (turns = 2.25, dir = 1, n = 90, r1 = 0.08) =>
  Array.from({ length: n + 1 }, (_, i) => {
    const u = i / n, r = 0.5 * (1 - u) + r1 * u, a = -Math.PI / 2 + dir * u * turns * TAU;
    return [0.5 + r * Math.cos(a), 0.5 + r * Math.sin(a)];
  });

const close = pts => [...pts, pts[0]];
const BOLT = [[0.62, 0], [0.22, 0.56], [0.7, 0.44], [0.3, 1]];
const mirror = pts => pts.map(([x, y]) => [1 - x, y]);

export const RUNES = {
  circulo: {
    name: 'Círculo', element: 'fogo', hint: 'um círculo completo',
    strokes: [circle()], closed: true, rotation: Math.PI,
  },
  onda: {
    name: 'Onda', element: 'fogo', hint: 'uma linha ondulada, da esquerda para a direita',
    strokes: [wave(2)], variants: [wave(1.5), wave(2.5), wave(3, 0.11)], reversible: true, rotation: 0.35,
  },
  v: {
    name: 'V', element: 'gelo', hint: 'um V: desce e sobe',
    strokes: [[[0, 0], [0.5, 1], [1, 0]]], variants: [[[0.1, 0], [0.5, 1], [0.9, 0]]], reversible: true, rotation: 0.4,
  },
  losango: {
    name: 'Losango', element: 'gelo', hint: 'um losango fechado, como um cristal',
    strokes: [close([[0.5, 0], [0.88, 0.5], [0.5, 1], [0.12, 0.5]])], variants: [close([[0.5, 0], [1, 0.5], [0.5, 1], [0, 0.5]])], closed: true, rotation: 0.3,
  },
  raio: {
    name: 'Raio', element: 'raio', hint: 'um zigue-zague de cima para baixo, como um raio',
    strokes: [BOLT], variants: [mirror(BOLT), BOLT.map(([x, y]) => [0.3 + x * 0.45, y]), [[0.25, 0], [0.75, 0.33], [0.25, 0.66], [0.75, 1]], [[0.75, 0], [0.25, 0.33], [0.75, 0.66], [0.25, 1]]], rotation: 0.4,
  },
  raioDuplo: {
    name: 'Raio duplo', element: 'raio', hint: 'dois raios lado a lado (dois traços, ou um só sem tirar o dedo)',
    strokes: [BOLT.map(([x, y]) => [x * 0.45, y]), BOLT.map(([x, y]) => [0.55 + x * 0.45, y])],
    variants: [[...BOLT.map(([x, y]) => [x * 0.45, y]), ...BOLT.map(([x, y]) => [0.55 + x * 0.45, y])]],
    multi: { part: 'raio', count: 2 }, rotation: 0.4,
  },
  triangulo: {
    name: 'Triângulo', element: 'terra', hint: 'um triângulo fechado',
    strokes: [close([[0.5, 0], [1, 0.87], [0, 0.87]])], variants: [close([[0.5, 0], [0.95, 1], [0.05, 1]])], closed: true, rotation: 0.35,
  },
  espiral: {
    name: 'Espiral', element: 'terra', hint: 'uma espiral, começando por fora e terminando no centro',
    strokes: [spiral(2.25, 1)], variants: [spiral(2.25, -1), spiral(1.75, 1), spiral(1.75, -1), spiral(2.75, 1), spiral(2.75, -1)], rotation: Math.PI,
  },
};

export const RUNE_IDS = Object.keys(RUNES);
