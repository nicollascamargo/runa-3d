// Contexto de interação (Runa Vision 2.0): um lugar só decide o que a mão pode fazer agora.
// Antes, essas regras estavam espalhadas pelo src/main.js; aqui elas viram uma tabela que dá para ler e testar.
//
// Cada contexto diz quais entradas da mão valem:
//   pinch     a pinça vira clique (pointer.down/up): pegar personagem, andar, escolher na roda, travar o alvo
//   gestures  quais gestos segurados viram comando (mão aberta, punho, polegares, V)
//   pen       a ponta do indicador desenha a runa
//   warrior   os quadros da mão chegam ao reconhecedor de golpes do guerreiro
// Assim: a pinça não ativa um golpe (segurando alguém, os golpes estão desligados); desenhar a runa não move
// ninguém (no desenho, a pinça não é clique); os gestos do guerreiro não chegam ao mago e vice-versa (cada
// personagem tem o seu contexto); e cada gesto só vale onde faz sentido.
// "O mesmo gesto não dispara duas ações" fica com quem já cuidava: o HandInput (um gesto dispara uma vez por
// segurada, com intervalo mínimo, e a pinça precisa de os dedos se abrirem depois de um gesto) e o main.js
// (cada clique tem um dono só).

const ALL = ['Open_Palm', 'Closed_Fist', 'Thumb_Up', 'Thumb_Down', 'Victory'];

export const CONTEXTS = {
  calibrando: { label: 'calibrando a mão', pinch: false, gestures: [], pen: false, warrior: false },
  calibrandoRuna: { label: 'calibração: runa de teste', pinch: false, gestures: ['Thumb_Down'], pen: true, warrior: false },
  avaliando: { label: 'avaliação da câmera', pinch: false, gestures: [], pen: false, warrior: false },
  segurando: { label: 'segurando um personagem', pinch: true, gestures: [], pen: false, warrior: false },
  pousando: { label: 'personagem pousando', pinch: false, gestures: [], pen: false, warrior: false },
  roda: { label: 'roda de magias', pinch: true, gestures: ['Closed_Fist', 'Open_Palm', 'Thumb_Down', 'Victory'], pen: false, warrior: false },
  desenhando: { label: 'desenhando a runa', pinch: false, gestures: ['Thumb_Down'], pen: true, warrior: false },
  treinoRunas: { label: 'treino de runas', pinch: false, gestures: ['Thumb_Down'], pen: true, warrior: false },
  runaPronta: { label: 'runa reconhecida', pinch: false, gestures: ['Thumb_Down'], pen: false, warrior: false },
  mirando: { label: 'escolhendo o alvo', pinch: true, gestures: ['Closed_Fist', 'Thumb_Down', 'Victory'], pen: false, warrior: false },
  conjurando: { label: 'conjurando', pinch: false, gestures: ['Victory'], pen: false, warrior: false },
  mago: { label: 'mago: livre', pinch: true, gestures: ['Open_Palm', 'Thumb_Up', 'Thumb_Down', 'Victory'], pen: false, warrior: false },
  guerreiro: { label: 'guerreiro: pronto', pinch: true, gestures: ['Thumb_Up'], pen: false, warrior: true },
  guerreiroOcupado: { label: 'guerreiro: andando ou golpeando', pinch: false, gestures: [], pen: false, warrior: false },
  // no turno dos inimigos a pinça e os gestos chegam ao jogo só para ele explicar "espere o seu turno"
  inimigos: { label: 'turno dos inimigos', pinch: true, gestures: ['Victory', 'Open_Palm', 'Thumb_Up', 'Thumb_Down'], pen: false, warrior: false },
};

// Qual é o contexto agora. s: { calibrating, calibratingRune, evaluating, caster: {state, mode}, holding (alguém
// na pinça), flying (alguém pousando ou voltando), active ('mago'|'guerreiro'), warrior: {state},
// enemyTurn, training (treino do guerreiro: age fora do turno) }.
export function resolveContext(s) {
  if (s.calibratingRune) return 'calibrandoRuna';
  if (s.calibrating) return 'calibrando';
  if (s.evaluating) return 'avaliando';
  if (s.holding) return 'segurando';
  if (s.flying) return 'pousando';
  const c = s.caster || {};
  if (c.mode === 'practice' && (c.state === 'drawing' || c.state === 'recognized')) return 'treinoRunas';
  switch (c.state) {
    case 'wheel': return 'roda';
    case 'drawing': return 'desenhando';
    case 'recognized': return 'runaPronta';
    case 'targeting': return 'mirando';
    case 'casting': return 'conjurando';
    default: break;
  }
  if (s.enemyTurn && !s.training) return 'inimigos';
  if (s.active === 'guerreiro') {
    const w = s.warrior && s.warrior.state;
    return w === 'walking' || w === 'acting' || w === 'recovering' || w === 'carried' ? 'guerreiroOcupado' : 'guerreiro';
  }
  return 'mago';
}

export class InteractionContext {
  constructor(read) { this.read = read; this.id = 'mago'; this.since = 0; this.history = []; }
  // recalcula (uma vez por quadro, ou quando alguém pergunta)
  update(now = performance.now()) {
    const id = resolveContext(this.read());
    if (id !== this.id) {
      this.history.push({ from: this.id, to: id, at: now });
      if (this.history.length > 30) this.history.shift();
      this.id = id; this.since = now;
    }
    return this.id;
  }
  get ctx() { return CONTEXTS[this.id]; }
  get label() { return this.ctx.label; }
  allowsPinch() { return this.update() && this.ctx.pinch; }
  allowsPen() { return this.update() && this.ctx.pen; }
  allowsWarrior() { return this.update() && this.ctx.warrior; }
  allowsGesture(g) { this.update(); return this.ctx.gestures.includes(g); }
}

export { ALL as ALL_GESTURES };
