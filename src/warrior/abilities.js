// O guerreiro: atributos e as seis habilidades, com os gestos de cada uma.
// São valores iniciais de balanceamento: mude aqui (ou pelo console, runa3d.WARRIOR e runa3d.ABILITIES).
//
// 'ready' marca as habilidades implementadas de ponta a ponta (gesto, animação, efeito e regras), testadas.
// Alcance em casas, com a diagonal valendo 1.
export const WARRIOR = {
  maxHp: 160,
  defense: 4,           // tira 4 de cada golpe recebido
  maxEnergy: 100,
  energyRegen: 25,      // energia recuperada no começo de cada turno
  move: 3,              // casas por turno (andando; 3 casas ou mais, ele corre)
  maxActions: 1,        // habilidades por turno
};

export const ABILITIES = [
  {
    id: 'corteHorizontal', name: 'Corte Horizontal', key: '1', ready: true, icon: 'corte',
    energy: 15, cooldown: 1, damage: 22, element: 'fisico', target: 'arco', range: 1, anim: 'corteHorizontal',
    gesture: 'indicador e médio juntos (a espada), varrendo para o lado', short: 'espada ↔',
    description: 'Um golpe em arco que atinge os inimigos nas três casas à frente do guerreiro.',
  },
  {
    id: 'golpeDevastador', name: 'Golpe Devastador', key: '2', ready: true, icon: 'devastador',
    energy: 30, cooldown: 2, damage: 40, element: 'fisico', target: 'unit', range: 1, breakTurns: 2, anim: 'golpeDevastador',
    gesture: 'punho fechado, descendo rápido', short: 'punho ↓',
    description: 'Ergue a espada sobre a cabeça e desce com tudo num inimigo ao lado: dano alto e quebra a guarda (a defesa dele não conta por 2 turnos).',
  },
  {
    id: 'guardaDeFerro', name: 'Guarda de Ferro', key: '3', ready: true, icon: 'guarda',
    energy: 20, cooldown: 3, reduction: 0.5, turns: 1, target: 'self', anim: 'guardaDeFerro',
    gesture: 'palma aberta, parada por 0,7 s', short: 'palma (segure)',
    description: 'Ergue o escudo e firma os pés: recebe metade do dano até o fim do seu próximo turno.',
  },
  {
    id: 'investida', name: 'Investida', key: '4', ready: true, icon: 'investida',
    energy: 25, cooldown: 3, damage: 18, element: 'fisico', target: 'line', range: 4, anim: 'investida',
    gesture: 'punho fechado, subindo rápido', short: 'punho ↑',
    description: 'Avança em linha reta até o primeiro inimigo a até 4 casas (o caminho precisa estar livre) e acerta com o ombro e o escudo.',
  },
  {
    id: 'contraAtaque', name: 'Contra-ataque', key: '5', ready: true, icon: 'contra',
    energy: 15, cooldown: 2, damage: 20, element: 'fisico', target: 'self', turns: 1, anim: 'contraAtaque',
    gesture: 'V (indicador e médio abertos), parado por 0,7 s', short: 'V (segure)',
    description: 'Fica em posição de aparar: o próximo ataque corpo a corpo é aparado (sem dano) e devolvido com um golpe rápido. Uma vez só.',
  },
  {
    id: 'ondaDeChoque', name: 'Onda de Choque', key: '6', ready: true, icon: 'onda',
    energy: 35, cooldown: 4, damage: 15, element: 'fisico', target: 'self', area: 1, push: 1, anim: 'ondaDeChoque',
    gesture: 'círculo desenhado com o indicador', short: 'círculo ○',
    description: 'Golpeia o chão: todos os inimigos em volta levam dano e são empurrados uma casa (se a casa de trás estiver livre).',
  },
];

export const abilityById = id => ABILITIES.find(a => a.id === id) || null;
