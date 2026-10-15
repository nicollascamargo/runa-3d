// Golpes do guerreiro, em código nos ossos (o mesmo formato das animações do mago, src/character/CastAnimator.js).
// Cada golpe: antecipação, execução (com o evento 'impact' no instante em que o golpe acerta), acompanhamento e
// recuperação. O dano entra no 'impact': nunca antes, nunca duas vezes. A investida tem também o evento 'dash'
// (começa a arrancada: quem move o guerreiro pelo tabuleiro é o controlador).
// Guarda de Ferro e Contra-ataque terminam numa postura que fica (src/character/Warrior.js, camada 'stance')
// enquanto o efeito durar.
//
// Eixos (esqueleto do mago): X dobra para a frente (negativo, nos braços, ergue o braço para a frente),
// Z abre o braço para o lado (negativo no braço direito), Y gira o tronco (positivo vira para a esquerda).

// Corte Horizontal: gira o tronco para a direita com a espada aberta para trás, e varre da direita para a
// esquerda na altura da cintura, transferindo o peso da perna de trás para a da frente.
const SLASH = [
  { name: 'preparação', dur: 0.24, curve: 'out', hips: -0.05, pose: {
    Spine: [0.04, -0.12, 0], Spine1: [0.02, -0.42, 0], Spine2: [0, -0.24, 0], Head: [0.04, 0.5, 0],
    RightArm: [0.2, -0.2, -1.05], RightForeArm: [-0.55, 0, 0], RightHand: [0.45, 0, -0.35],
    LeftArm: [-0.25, 0, 0.12], LeftForeArm: [-0.15, 0, 0],
    LeftUpLeg: [-0.26, 0, 0.14], LeftLeg: [0.36, 0, 0], RightUpLeg: [0.2, 0, -0.14], RightLeg: [0.32, 0, 0],
  } },
  { name: 'corte', dur: 0.16, curve: 'snap', hips: -0.07, event: { at: 0.5, name: 'impact' }, pose: {
    Spine: [0.08, 0.14, 0], Spine1: [0.06, 0.5, 0], Spine2: [0, 0.28, 0], Head: [0.02, -0.55, 0],
    // o braço sobe até a altura do peito; o pulso gira para baixo e a lâmina fica na horizontal
    RightArm: [-1.05, 0.2, 0.4], RightForeArm: [-0.1, 0, 0], RightHand: [0.9, 0, 0.25],
    LeftArm: [0.15, 0, 0.35], LeftForeArm: [-0.1, 0, 0],
    LeftUpLeg: [-0.38, 0, 0.12], LeftLeg: [0.42, 0, 0], RightUpLeg: [0.3, 0, -0.12], RightLeg: [0.16, 0, 0],
  } },
  { name: 'acompanhamento', dur: 0.24, curve: 'out', hold: true },
  { name: 'recuperação', dur: 0.45, curve: 'inOut', hips: 0, pose: {} },
];

// Golpe Devastador: ergue a espada sobre a cabeça arqueando as costas, segura um instante (o peso da arma),
// desce com tudo dobrando o tronco e afundando a perna da frente, fica embaixo e volta devagar.
const SLAM = [
  { name: 'erguer', dur: 0.36, curve: 'inOut', hips: -0.02, pose: {
    Spine: [-0.1, 0, 0], Spine1: [-0.16, -0.12, 0], Spine2: [-0.08, 0, 0], Head: [-0.12, 0.08, 0],
    RightArm: [-2.55, 0.1, -0.12], RightForeArm: [-1.0, 0, 0], RightHand: [-0.45, 0, 0],
    LeftArm: [-0.75, 0.1, 0.45], LeftForeArm: [-0.9, 0, 0],
    LeftUpLeg: [-0.32, 0, 0.12], LeftLeg: [0.3, 0, 0], RightUpLeg: [0.28, 0, -0.1], RightLeg: [0.22, 0, 0],
  } },
  { name: 'carga', dur: 0.12, curve: 'linear', tremble: 0.02, hold: true },
  { name: 'golpe', dur: 0.15, curve: 'in', hips: -0.17, event: { at: 1, name: 'impact' }, pose: {
    Spine: [0.36, 0, 0], Spine1: [0.3, 0.05, 0], Spine2: [0.12, 0, 0], Head: [0.22, 0, 0],
    // (ângulos achados por busca na cena: a ponta da lâmina termina ~1 m à frente, baixa, na direção do alvo)
    RightArm: [-0.1, 0.05, 0.4], RightForeArm: [-0.15, 0, 0], RightHand: [-0.4, 0, 0],
    LeftArm: [0.3, 0, 0.62], LeftForeArm: [-0.25, 0, 0],
    LeftUpLeg: [-0.62, 0, 0.1], LeftLeg: [0.9, 0, 0], RightUpLeg: [0.46, 0, -0.1], RightLeg: [0.42, 0, 0],
  } },
  { name: 'acompanhamento', dur: 0.32, curve: 'out', hold: true },
  { name: 'recuperação', dur: 0.7, curve: 'inOut', hips: 0, pose: {} },
];

// Guarda de Ferro: recolhe o escudo, ergue na frente do peito e do rosto, flexiona os joelhos, firma.
// Depois a postura de guarda (camada 'stance') segura enquanto o efeito durar.
const GUARD = [
  { name: 'recolher', dur: 0.16, curve: 'out', hips: -0.03, pose: {
    Spine: [0.05, 0, 0], Spine1: [0.02, 0.1, 0],
    LeftArm: [-0.35, -0.35, -0.35], LeftForeArm: [0, -0.4, 0],
    RightArm: [0.05, 0, -0.3], RightForeArm: [-0.5, 0, 0],
    LeftUpLeg: [-0.18, 0, 0.12], LeftLeg: [0.28, 0, 0], RightUpLeg: [0.02, 0, -0.12], RightLeg: [0.26, 0, 0],
  } },
  { name: 'erguer o escudo', dur: 0.2, curve: 'snap', hips: -0.11, event: { at: 0.6, name: 'impact' }, pose: {
    Spine: [0.12, 0, 0], Spine1: [0.05, 0.22, 0], Spine2: [0, 0.08, 0], Head: [0.12, -0.12, 0],
    // (escudo na frente do peito, virado para a frente: ângulos achados por busca na cena)
    LeftArm: [-0.6, -0.74, -0.8], LeftForeArm: [0.06, -0.89, 0],
    RightArm: [0.18, 0, -0.38], RightForeArm: [-0.45, 0, 0], RightHand: [0.2, 0, 0],
    LeftUpLeg: [-0.4, 0, 0.18], LeftLeg: [0.65, 0, 0], RightUpLeg: [-0.06, 0, -0.18], RightLeg: [0.58, 0, 0],
  } },
  { name: 'firmar', dur: 0.35, curve: 'out', hold: true },
  { name: 'em guarda', dur: 0.45, curve: 'inOut', hips: 0, pose: {} }, // a postura segue pela camada 'stance'
];

// Investida: abaixa o corpo com o escudo na frente, arranca (o controlador leva o guerreiro até a casa ao lado
// do alvo), acerta com o ombro e o escudo, desacelera e recupera o equilíbrio.
const CHARGE = [
  { name: 'abaixar', dur: 0.26, curve: 'out', hips: -0.13, pose: {
    Spine: [0.3, 0, 0], Spine1: [0.14, 0.28, 0], Spine2: [0.04, 0.1, 0], Head: [-0.12, -0.28, 0],
    LeftArm: [-0.45, 0.1, -0.45], LeftForeArm: [0.45, 0.55, 0],
    RightArm: [0.25, 0, -0.22], RightForeArm: [-0.55, 0, 0],
    LeftUpLeg: [-0.5, 0, 0.1], LeftLeg: [0.8, 0, 0], RightUpLeg: [0.2, 0, -0.1], RightLeg: [0.72, 0, 0],
  } },
  { name: 'avançar', dur: 0.3, curve: 'linear', hips: -0.1, event: { at: 0, name: 'dash' }, pose: {
    Spine: [0.42, 0, 0], Spine1: [0.16, 0.32, 0], Spine2: [0.05, 0.1, 0], Head: [-0.22, -0.3, 0],
    LeftArm: [-0.6, 0.17, -0.6], LeftForeArm: [0.6, 0.74, 0], // escudo à frente, na altura do ombro
    RightArm: [0.35, 0, -0.25], RightForeArm: [-0.6, 0, 0],
  } },
  { name: 'impacto', dur: 0.1, curve: 'snap', hips: -0.12, event: { at: 0, name: 'impact' }, pose: {
    Spine: [0.3, 0, 0], Spine1: [0.22, 0.5, 0], Spine2: [0.06, 0.15, 0], Head: [-0.1, -0.4, 0],
    LeftArm: [-0.7, 0.17, -0.65], LeftForeArm: [0.7, 0.74, 0],
    RightArm: [0.3, 0, -0.3], RightForeArm: [-0.5, 0, 0],
    LeftUpLeg: [-0.55, 0, 0.1], LeftLeg: [0.6, 0, 0], RightUpLeg: [0.4, 0, -0.1], RightLeg: [0.35, 0, 0],
  } },
  { name: 'desacelerar', dur: 0.26, curve: 'out', hips: -0.05, pose: {
    Spine: [0.06, 0, 0], Spine1: [-0.08, 0.2, 0], Spine2: [0, 0.05, 0], Head: [0.02, -0.15, 0],
    LeftArm: [-0.3, 0.08, -0.3], LeftForeArm: [0.3, 0.37, 0],
    RightArm: [0.1, 0, -0.35], RightForeArm: [-0.5, 0, 0],
    LeftUpLeg: [-0.2, 0, 0.12], LeftLeg: [0.3, 0, 0], RightUpLeg: [0.15, 0, -0.12], RightLeg: [0.25, 0, 0],
  } },
  { name: 'recuperação', dur: 0.5, curve: 'inOut', hips: 0, pose: {} },
];

// Contra-ataque (armar): um passo atrás e a postura de aparar: espada atravessada na frente, escudo pronto.
// Depois a postura (camada 'stance') segura até alguém atacar ou o efeito acabar.
const PARRY = [
  { name: 'recuar', dur: 0.18, curve: 'out', hips: -0.03, pose: {
    Spine: [-0.04, 0, 0], Spine1: [0, -0.1, 0],
    RightArm: [-0.5, 0.1, 0.1], RightForeArm: [-0.8, 0, 0],
    LeftArm: [-0.06, -0.2, -0.3], LeftForeArm: [0, -0.2, 0],
    LeftUpLeg: [-0.1, 0, 0.12], LeftLeg: [0.25, 0, 0], RightUpLeg: [0.18, 0, -0.12], RightLeg: [0.28, 0, 0],
  } },
  { name: 'aparar', dur: 0.2, curve: 'out', hips: -0.08, event: { at: 0.7, name: 'impact' }, pose: {
    Spine: [0.08, 0, 0], Spine1: [0.04, 0.12, 0], Head: [0.06, -0.1, 0],
    RightArm: [-1.2, 0.3, 0.5], RightForeArm: [-0.6, 0, 0], RightHand: [0.2, 0, -0.9],
    LeftArm: [-0.12, -0.42, -0.6], LeftForeArm: [0, -0.39, 0],
    LeftUpLeg: [-0.3, 0, 0.15], LeftLeg: [0.5, 0, 0], RightUpLeg: [0.05, 0, -0.15], RightLeg: [0.45, 0, 0],
  } },
  { name: 'esperar', dur: 0.3, curve: 'out', hold: true },
  { name: 'em guarda', dur: 0.4, curve: 'inOut', hips: 0, pose: {} },
];

// Resposta do Contra-ataque: desvia o golpe com o escudo e a espada, devolve um corte rápido, volta à guarda.
const RIPOSTE = [
  { name: 'desviar', dur: 0.12, curve: 'snap', hips: -0.09, pose: {
    Spine: [0.04, -0.22, 0], Spine1: [0, -0.3, 0], Head: [0.04, 0.3, 0],
    RightArm: [-1.3, 0.3, 0.7], RightForeArm: [-0.5, 0, 0], RightHand: [0.25, 0, -1.0],
    LeftArm: [-0.3, -0.5, -0.7], LeftForeArm: [0, -0.45, 0],
    LeftUpLeg: [-0.15, 0, 0.15], LeftLeg: [0.45, 0, 0], RightUpLeg: [0.2, 0, -0.15], RightLeg: [0.4, 0, 0],
  } },
  { name: 'resposta', dur: 0.14, curve: 'snap', hips: -0.07, event: { at: 0.6, name: 'impact' }, pose: {
    Spine: [0.1, 0.16, 0], Spine1: [0.08, 0.48, 0], Spine2: [0, 0.25, 0], Head: [0, -0.45, 0],
    RightArm: [-1.1, 0.2, 0.35], RightForeArm: [-0.1, 0, 0], RightHand: [0.85, 0, 0.25],
    LeftArm: [0.1, 0, 0.35], LeftForeArm: [-0.2, 0, 0],
    LeftUpLeg: [-0.4, 0, 0.12], LeftLeg: [0.45, 0, 0], RightUpLeg: [0.3, 0, -0.12], RightLeg: [0.2, 0, 0],
  } },
  { name: 'acompanhamento', dur: 0.18, curve: 'out', hold: true },
  { name: 'retorno', dur: 0.4, curve: 'inOut', hips: 0, pose: {} },
];

// Onda de Choque: segura o punho da espada com força, ergue a arma bem alto (na ponta dos pés), crava no chão
// afundando os joelhos (o impacto solta a onda), fica embaixo um instante e levanta.
const QUAKE = [
  { name: 'segurar', dur: 0.3, curve: 'out', hips: -0.04, pose: {
    Spine: [0.06, 0, 0], Spine1: [0.04, 0.1, 0],
    RightArm: [-0.95, 0.35, 0.3], RightForeArm: [-1.25, 0, 0], RightHand: [-0.2, 0, 0],
    LeftArm: [-0.95, -0.25, -0.05], LeftForeArm: [-1.3, 0, 0],
    LeftUpLeg: [-0.15, 0, 0.16], LeftLeg: [0.3, 0, 0], RightUpLeg: [0.05, 0, -0.16], RightLeg: [0.28, 0, 0],
  } },
  { name: 'erguer', dur: 0.3, curve: 'inOut', hips: 0.025, pose: {
    Spine: [-0.14, 0, 0], Spine1: [-0.14, 0, 0], Spine2: [-0.06, 0, 0], Head: [-0.22, 0, 0],
    RightArm: [-2.75, 0.2, 0.2], RightForeArm: [-0.35, 0, 0], RightHand: [-0.55, 0, 0],
    LeftArm: [-2.35, -0.2, -0.1], LeftForeArm: [-0.45, 0, 0],
    LeftUpLeg: [0.02, 0, 0.1], LeftLeg: [0.05, 0, 0], RightUpLeg: [0.02, 0, -0.1], RightLeg: [0.05, 0, 0],
    LeftFoot: [-0.25, 0, 0], RightFoot: [-0.25, 0, 0],
  } },
  { name: 'carga', dur: 0.14, curve: 'linear', tremble: 0.025, hold: true },
  { name: 'golpear o chão', dur: 0.14, curve: 'in', hips: -0.26, event: { at: 1, name: 'impact' }, pose: {
    Spine: [0.5, 0, 0], Spine1: [0.35, 0, 0], Spine2: [0.12, 0, 0], Head: [0.22, 0, 0],
    // (a ponta da lâmina termina no chão ~1,1 m à frente, na casa ao lado: ângulos achados por busca na cena)
    RightArm: [-0.2, 0.05, 0.4], RightForeArm: [-0.15, 0, 0], RightHand: [-0.6, 0, 0],
    LeftArm: [-0.45, -0.1, 0.05], LeftForeArm: [-0.3, 0, 0],
    LeftUpLeg: [-0.72, 0, 0.2], LeftLeg: [1.2, 0, 0], RightUpLeg: [-0.22, 0, -0.2], RightLeg: [1.1, 0, 0],
    LeftFoot: [-0.4, 0, 0], RightFoot: [-0.4, 0, 0],
  } },
  { name: 'acompanhamento', dur: 0.35, curve: 'out', hold: true },
  { name: 'recuperação', dur: 0.7, curve: 'inOut', hips: 0, pose: {} },
];

export const WARRIOR_MOVES = {
  corteHorizontal: SLASH, golpeDevastador: SLAM, guardaDeFerro: GUARD, investida: CHARGE,
  contraAtaque: PARRY, contraResposta: RIPOSTE, ondaDeChoque: QUAKE,
};
