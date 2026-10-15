// Mão sintética para os testes: os 21 pontos do MediaPipe, numa pose, num lugar e num tamanho,
// mais o palpite do classificador de gestos. Serve para testar a leitura da mão sem câmera, pelo mesmo
// caminho que a câmera usa (HandInput.handleResult).
//
// Coordenadas da mão em "palmos" (punho na origem, dedos para cima na imagem = y negativo).
const MCP = { index: [-0.28, -0.95], middle: [-0.05, -1.0], ring: [0.17, -0.95], pinky: [0.36, -0.85] };
const LEN = { index: 1, middle: 1.08, ring: 1, pinky: 0.8 };

// dedo esticado numa direção (ângulo em radianos a partir de "para cima", positivo para a direita da imagem)
function aimed(name, angle) {
  const [mx, my] = MCP[name], k = LEN[name], sx = Math.sin(angle), sy = -Math.cos(angle);
  return [0, 0.42, 0.7, 0.92].map(f => [mx + sx * f * k, my + sy * f * k, 0]);
}

function finger(name, extended) {
  const [mx, my] = MCP[name], k = LEN[name];
  if (extended) return [[mx, my, 0], [mx, my - 0.42 * k, 0], [mx, my - 0.7 * k, 0], [mx, my - 0.92 * k, 0]];
  // dobrado: a ponta volta para perto da palma (e um pouco para a câmera)
  return [[mx, my, 0], [mx, my - 0.33, -0.12], [mx + 0.02, my - 0.2, -0.3], [mx + 0.02, my - 0.05, -0.22]];
}

const POSES = {
  open: { fingers: { index: 1, middle: 1, ring: 1, pinky: 1 }, thumb: 'out', cls: 'Open_Palm' },
  fist: { fingers: { index: 0, middle: 0, ring: 0, pinky: 0 }, thumb: 'across', cls: 'Closed_Fist' },
  point: { fingers: { index: 1, middle: 0, ring: 0, pinky: 0 }, thumb: 'across', cls: 'Pointing_Up' },
  // dois dedos em V (abertos): o MediaPipe chama de Victory
  two: { fingers: { index: 1, middle: 1, ring: 0, pinky: 0 }, thumb: 'across', cls: 'Victory', index: aimed('index', -0.3), middle: aimed('middle', 0.28) },
  // a "espada": indicador e médio esticados e juntos (o MediaPipe também costuma chamar de Victory)
  sword: { fingers: { index: 1, middle: 1, ring: 0, pinky: 0 }, thumb: 'across', cls: 'Victory', index: aimed('index', 0.1), middle: aimed('middle', -0.04) },
  // pinça: ponta do polegar encostada na ponta do indicador (meio dobrado); os outros dedos dobrados
  pinch: { fingers: { index: 1, middle: 0, ring: 0, pinky: 0 }, thumb: 'pinch', cls: 'None',
    index: [[-0.28, -0.95, 0], [-0.33, -1.3, 0], [-0.4, -1.5, 0], [-0.46, -1.56, 0]] },
};
const THUMBS = {
  out: [[-0.25, -0.15, 0], [-0.45, -0.35, 0], [-0.62, -0.55, 0], [-0.76, -0.74, 0]],
  across: [[-0.22, -0.18, 0], [-0.36, -0.42, -0.1], [-0.18, -0.58, -0.2], [-0.02, -0.62, -0.2]],
  pinch: [[-0.25, -0.15, 0], [-0.44, -0.5, 0], [-0.52, -0.95, 0], [-0.5, -1.5, 0]],
};

// x, y: posição do punho na imagem (0 a 1). size: comprimento da palma em fração da largura da imagem.
// Devolve o formato que o GestureRecognizer devolve: { landmarks: [[21 pontos]], gestures: [[categorias]] }.
export function fakeHand({ x = 0.5, y = 0.7, size = 0.13, pose = 'open', W = 640, H = 480, jitter = 0, rand = Math.random } = {}) {
  const P = POSES[pose];
  const pts = [[0, 0, 0], ...THUMBS[P.thumb]];
  for (const name of ['index', 'middle', 'ring', 'pinky']) pts.push(...(P[name] || finger(name, P.fingers[name])));
  const ky = W / H; // a mesma distância em pixels nos dois eixos
  const landmarks = pts.map(([hx, hy, hz]) => ({
    x: x + hx * size + (rand() - 0.5) * jitter,
    y: y + hy * size * ky + (rand() - 0.5) * jitter,
    z: hz * size,
  }));
  const names = ['Open_Palm', 'Closed_Fist', 'Pointing_Up', 'Victory', 'Thumb_Up', 'Thumb_Down', 'ILoveYou', 'None'];
  const gestures = names.map(categoryName => ({ categoryName, score: categoryName === P.cls ? 0.86 : 0.02 }));
  return { landmarks: [landmarks], worldLandmarks: [], gestures: [gestures] };
}
