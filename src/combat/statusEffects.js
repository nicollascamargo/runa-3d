// Efeitos de status. Só regras: quem desenha o fogo, o gelo etc. é a camada de efeitos visuais.
//
// Regras, iguais para todos:
//   - A duração conta turnos de QUEM sofre o efeito. No começo do turno da unidade, os efeitos agem
//     (a queimadura causa dano); no fim do turno, a duração cai 1. Em zero, o efeito acaba.
//   - Um efeito aplicado durante o próprio turno da unidade não perde duração no fim desse turno.
//   - O mesmo efeito não acumula: aplicar de novo renova a duração (fica a maior) e a força (fica a maior).
//     Assim, duas bolas de fogo não fazem a queimadura causar o dobro de dano por turno.
//   - Efeitos diferentes convivem (queimando e lento ao mesmo tempo, por exemplo).
//   - Efeitos com chance (atordoar 20%, derrubar 30%) sorteiam uma vez, na hora de aplicar.
export const STATUS_DEFS = {
  queimadura: { name: 'Queimadura', element: 'fogo', tick: 'damage', tip: 'perde vida no começo de cada turno' },
  lentidao: { name: 'Lentidão', element: 'gelo', moveDelta: -1, tip: 'anda 1 casa a menos' },
  imobilizado: { name: 'Imobilizado', element: 'gelo', noMove: true, tip: 'não sai do lugar, mas pode agir' },
  atordoado: { name: 'Atordoado', element: 'raio', noMove: true, noAction: true, tip: 'perde o próximo turno' },
  derrubado: { name: 'Derrubado', element: 'terra', noMove: true, noAction: true, tip: 'gasta o próximo turno para levantar' },
  // guerreiro
  guardaDeFerro: { name: 'Guarda de Ferro', element: 'fisico', damageTaken: 0.5, tip: 'recebe metade do dano' },
  aparar: { name: 'Contra-ataque armado', element: 'fisico', parry: true, tip: 'o próximo ataque corpo a corpo é aparado e devolvido' },
  guardaQuebrada: { name: 'Guarda quebrada', element: 'fisico', defenseZero: true, tip: 'a defesa não conta' },
};
