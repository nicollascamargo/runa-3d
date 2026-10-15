// O livro de magias: os números de cada habilidade (dano, mana, recarga, alcance, área, efeitos).
// São valores iniciais de balanceamento: mude aqui, ou pelo console (runa3d.SPELLS), e o jogo usa na hora.
//
// 'ready' marca as magias implementadas de ponta a ponta (runa, animação, efeito visual, dano e status).
// Uma magia com ready: false aparece na roda como "em breve" e não pode ser conjurada.
// 'anim' é a animação do mago (src/character/CastAnimator.js); cada escola tem o seu jeito de se mover.
//
// Alcance e área são medidos em casas, com a diagonal valendo 1 (raio 1 = o quadrado 3×3 em volta do alvo).
export const SPELLS = [
  {
    id: 'bolaDeFogo', name: 'Bola de Fogo', element: 'fogo', school: 'fogo', anim: 'fogo', rune: 'circulo', ready: true,
    mana: 20, cooldown: 2, range: 6, needsSight: true, target: 'unit', area: 1,
    damage: 30, status: { id: 'queimadura', turns: 3, power: 5 },
    description: 'Uma esfera de fogo voa até o inimigo e explode, atingindo tudo num raio de 1 casa. Quem é atingido queima: 5 de dano por turno, durante 3 turnos.',
  },
  {
    id: 'paredeDeChamas', name: 'Parede de Chamas', element: 'fogo', school: 'fogo', anim: 'fogoParede', rune: 'onda', ready: true,
    mana: 30, cooldown: 4, range: 5, target: 'line', length: 3, duration: 3, damage: 12,
    description: 'Uma parede de fogo de até 3 casas, por 3 turnos. Quem entra ou atravessa as chamas sofre 12 de dano.',
  },
  {
    id: 'lancaDeGelo', name: 'Lança de Gelo', element: 'gelo', school: 'gelo', anim: 'gelo', rune: 'v', ready: true,
    mana: 15, cooldown: 1, range: 6, needsSight: true, target: 'unit',
    damage: 25, status: { id: 'lentidao', turns: 2, power: 1 },
    description: 'Uma lança de gelo disparada em alta velocidade. O alvo fica lento: anda 1 casa a menos por 2 turnos.',
  },
  {
    id: 'prisaoGlacial', name: 'Prisão Glacial', element: 'gelo', school: 'gelo', anim: 'geloPrisao', rune: 'losango', ready: true,
    mana: 30, cooldown: 4, range: 5, target: 'unit',
    damage: 10, status: { id: 'imobilizado', turns: 1 },
    description: 'Cristais gigantes prendem o alvo por 1 turno. Ele não sai do lugar, mas ainda pode agir.',
  },
  {
    id: 'relampago', name: 'Relâmpago', element: 'raio', school: 'raio', anim: 'raio', rune: 'raio', ready: true,
    mana: 25, cooldown: 2, range: 6, needsSight: true, target: 'unit',
    damage: 35, status: { id: 'atordoado', turns: 1, chance: 0.2 },
    description: 'Um relâmpago liga o mago ao inimigo. 20% de chance de atordoar por 1 turno.',
  },
  {
    id: 'correnteEletrica', name: 'Corrente Elétrica', element: 'raio', school: 'raio', anim: 'raioCorrente', rune: 'raioDuplo', ready: true,
    mana: 35, cooldown: 4, range: 6, needsSight: true, target: 'unit',
    damage: 25, chain: { targets: 3, falloff: 0.2, jump: 2 },
    description: 'Um raio atinge o alvo e salta para até 2 inimigos próximos (até 2 casas). Cada salto tira 20% do dano.',
  },
  {
    id: 'muralhaDePedra', name: 'Muralha de Pedra', element: 'terra', school: 'terra', anim: 'terra', rune: 'triangulo', ready: true,
    mana: 25, cooldown: 4, range: 5, target: 'line', length: 3, duration: 3, wallHp: 60,
    description: 'Uma muralha de rocha de até 3 casas, por 3 turnos. Bloqueia passagem e linha de visão. 60 de vida por bloco.',
  },
  {
    id: 'terremoto', name: 'Terremoto', element: 'terra', school: 'terra', anim: 'terraTremor', rune: 'espiral', ready: true,
    mana: 45, cooldown: 5, range: 5, target: 'tile', area: 2,
    damage: 40, status: { id: 'derrubado', turns: 1, chance: 0.3 },
    description: 'Uma onda sísmica atinge tudo num raio de 2 casas. 30% de chance de derrubar cada inimigo.',
  },
];

export const spellById = id => SPELLS.find(s => s.id === id) || null;
export const ELEMENT_LABEL = { fogo: 'Fogo', gelo: 'Gelo', raio: 'Raio', terra: 'Terra' };
