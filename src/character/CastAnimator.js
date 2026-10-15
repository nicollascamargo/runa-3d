// Animações de conjuração do mago, feitas em código nos ossos (o modelo não tem clipes de animação).
// Cada escola tem uma sequência de fases; cada fase leva a pose até um alvo em um tempo, com uma curva.
// Entre as fases a pose é contínua: a fase nova parte de onde a anterior estava (transições suaves).
//
//   repouso -> preparação -> conjuração (segura, energia crescendo) -> lançamento -> recuperação -> repouso
//
// Os eventos ('release' etc.) avisam a magia do instante certo: soltar a bola de fogo, por exemplo.
// As poses usam os eixos do esqueleto do mago feito em código (src/character/skeleton.js): X dobra para a
// frente (negativo, nos braços, ergue o braço para a frente), Z abre o braço para o lado, Y gira.
// Um modelo de outro programa, com outros eixos, pode dobrar para o lado errado.

const ease = {
  linear: t => t,
  out: t => 1 - (1 - t) ** 3,
  in: t => t * t * t,
  inOut: t => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  snap: t => 1 - (1 - t) ** 5,
};

// Fogo: rápido e agressivo. Junta as mãos (a esfera nasce entre elas), puxa o braço livre para trás e arremessa.
const FIRE = [
  { name: 'preparação', dur: 0.26, curve: 'out', hips: -0.03, pose: {
    Spine: [0.06, 0, 0], Spine1: [0.02, -0.22, 0], Spine2: [0, -0.08, 0], Head: [0.12, 0.18, 0],
    LeftArm: [-0.95, 0, -0.38], LeftForeArm: [-1.25, 0, 0], LeftHand: [0.1, 0, -0.2],
    RightArm: [-0.25, 0, 0.28], RightForeArm: [-0.15, 0, 0],
    LeftUpLeg: [-0.28, 0, 0.12], LeftLeg: [0.38, 0, 0], RightUpLeg: [0.16, 0, -0.12], RightLeg: [0.22, 0, 0],
  } },
  { name: 'conjuração', dur: 0.5, curve: 'linear', tremble: 0.025, hold: true },
  { name: 'impulso', dur: 0.2, curve: 'inOut', hips: -0.05, event: { at: 0, name: 'windup' }, pose: {
    Spine: [-0.06, 0, 0], Spine1: [-0.08, -0.5, 0], Spine2: [0, -0.22, 0], Head: [0.05, 0.42, 0],
    LeftArm: [0.55, 0, 0.75], LeftForeArm: [-0.85, 0, 0], LeftHand: [-0.2, 0, 0],
    RightArm: [-0.1, 0, -0.35], RightForeArm: [0, 0, 0],
    LeftUpLeg: [-0.22, 0, 0.14], LeftLeg: [0.34, 0, 0], RightUpLeg: [0.2, 0, -0.14], RightLeg: [0.3, 0, 0],
  } },
  { name: 'lançamento', dur: 0.15, curve: 'snap', hips: -0.07, event: { at: 0.7, name: 'release' }, pose: {
    Spine: [0.14, 0, 0], Spine1: [0.12, 0.42, 0], Spine2: [0.04, 0.16, 0], Head: [-0.05, -0.3, 0],
    LeftArm: [-1.55, 0, -0.12], LeftForeArm: [-0.12, 0, 0], LeftHand: [0.35, 0, 0],
    RightArm: [0.1, 0, -0.45], RightForeArm: [0.2, 0, 0],
    LeftUpLeg: [-0.48, 0, 0.1], LeftLeg: [0.5, 0, 0], RightUpLeg: [0.36, 0, -0.1], RightLeg: [0.22, 0, 0],
  } },
  { name: 'acompanhamento', dur: 0.2, curve: 'out', hold: true },
  { name: 'recuperação', dur: 0.55, curve: 'inOut', hips: 0, event: { at: 0, name: 'recover' }, pose: {} },
];

// Fogo, Parede de Chamas: ergue o cajado bem alto e varre para a frente; as chamas sobem nesse gesto.
const FIRE_WALL = [
  { name: 'preparação', dur: 0.28, curve: 'out', hips: -0.02, pose: {
    Spine: [-0.06, 0, 0], Head: [-0.08, 0, 0], RightArm: [-1.0, 0, 0.05], RightForeArm: [-0.3, 0, 0],
    LeftArm: [-0.45, 0, 0.55], LeftForeArm: [-0.4, 0, 0],
  } },
  { name: 'erguer', dur: 0.32, curve: 'inOut', hips: -0.02, pose: {
    Spine: [-0.14, 0, 0], Spine1: [-0.06, 0, 0], Head: [-0.22, 0, 0],
    RightArm: [-2.2, 0, 0.02], RightForeArm: [0.15, 0, 0], LeftArm: [-0.55, 0, 0.95], LeftForeArm: [-0.2, 0, 0],
  } },
  { name: 'conjuração', dur: 0.35, curve: 'linear', tremble: 0.02, hold: true },
  { name: 'varrer', dur: 0.2, curve: 'snap', hips: -0.06, event: { at: 0.6, name: 'release' }, pose: {
    Spine: [0.16, 0, 0], Spine1: [0.06, 0, 0], Head: [0.05, 0, 0],
    RightArm: [-1.15, 0, -0.05], RightForeArm: [0.35, 0, 0], LeftArm: [-0.2, 0, 0.75], LeftForeArm: [-0.3, 0, 0],
    LeftUpLeg: [-0.32, 0, 0.1], LeftLeg: [0.36, 0, 0], RightUpLeg: [0.18, 0, -0.08], RightLeg: [0.12, 0, 0],
  } },
  { name: 'acompanhamento', dur: 0.25, curve: 'out', hold: true },
  { name: 'recuperação', dur: 0.55, curve: 'inOut', hips: 0, pose: {} },
];

// Gelo, Lança: controlado e preciso. Postura de concentração (cabeça baixa, joelhos firmes), a mão livre
// segura os cristais que crescem devagar; depois aponta e dispara.
const ICE = [
  { name: 'preparação', dur: 0.45, curve: 'inOut', hips: -0.02, pose: {
    Spine: [0.05, 0, 0], Head: [0.24, 0, 0], LeftArm: [-0.75, 0, -0.12], LeftForeArm: [-0.95, 0, 0], LeftHand: [0, 0, -0.35],
    RightArm: [0, 0, 0.08], LeftUpLeg: [-0.12, 0, 0.06], LeftLeg: [0.2, 0, 0], RightUpLeg: [-0.04, 0, -0.06], RightLeg: [0.14, 0, 0],
  } },
  { name: 'conjuração', dur: 0.7, curve: 'linear', tremble: 0.006, hold: true },
  { name: 'mirar', dur: 0.26, curve: 'inOut', hips: -0.02, event: { at: 0, name: 'aim' }, pose: {
    Spine: [0.03, 0, 0], Spine1: [0, 0.12, 0], Head: [0.02, 0, 0], LeftArm: [-1.45, 0, -0.06], LeftForeArm: [-0.08, 0, 0], LeftHand: [0.12, 0, 0],
    RightArm: [0.05, 0, -0.12], LeftUpLeg: [-0.12, 0, 0.06], LeftLeg: [0.2, 0, 0], RightUpLeg: [-0.04, 0, -0.06], RightLeg: [0.14, 0, 0],
  } },
  { name: 'disparo', dur: 0.1, curve: 'snap', event: { at: 0.3, name: 'release' }, pose: {
    Spine: [0.08, 0, 0], Spine1: [0, 0.14, 0], Head: [0.02, 0, 0], LeftArm: [-1.52, 0, -0.06], LeftForeArm: [-0.02, 0, 0], LeftHand: [0.2, 0, 0],
    RightArm: [0.05, 0, -0.12], LeftUpLeg: [-0.12, 0, 0.06], LeftLeg: [0.2, 0, 0], RightUpLeg: [-0.04, 0, -0.06], RightLeg: [0.14, 0, 0],
  } },
  { name: 'acompanhamento', dur: 0.3, curve: 'out', hold: true },
  { name: 'recuperação', dur: 0.6, curve: 'inOut', hips: 0, pose: {} },
];

// Gelo, Prisão: estende a mão aberta para o alvo, concentra e fecha a mão; os cristais brotam do chão.
const ICE_PRISON = [
  { name: 'preparação', dur: 0.45, curve: 'inOut', hips: -0.02, pose: {
    Spine: [0.04, 0, 0], Head: [0.12, 0, 0], LeftArm: [-1.3, 0, 0.04], LeftForeArm: [-0.2, 0, 0], LeftHand: [-0.35, 0, 0],
    RightArm: [0, 0, 0.06], LeftUpLeg: [-0.1, 0, 0.06], LeftLeg: [0.18, 0, 0], RightUpLeg: [-0.04, 0, -0.06], RightLeg: [0.14, 0, 0],
  } },
  { name: 'conjuração', dur: 0.6, curve: 'linear', tremble: 0.01, hold: true },
  { name: 'fechar a mão', dur: 0.18, curve: 'snap', hips: -0.04, event: { at: 0.6, name: 'release' }, pose: {
    Spine: [0.1, 0, 0], Head: [0.16, 0, 0], LeftArm: [-1.15, 0, 0.04], LeftForeArm: [-0.85, 0, 0], LeftHand: [0.95, 0, 0],
    RightArm: [0, 0, 0.06], LeftUpLeg: [-0.12, 0, 0.06], LeftLeg: [0.24, 0, 0], RightUpLeg: [-0.04, 0, -0.06], RightLeg: [0.18, 0, 0],
  } },
  { name: 'acompanhamento', dur: 0.35, curve: 'out', hold: true },
  { name: 'recuperação', dur: 0.6, curve: 'inOut', hips: 0, pose: {} },
];

// Raio: rápido e explosivo. O cajado sobe na frente e acumula energia; aponta de uma vez e o corpo recua.
const LIGHTNING = [
  { name: 'preparação', dur: 0.24, curve: 'out', hips: -0.03, pose: {
    Spine: [-0.05, 0, 0], RightArm: [-1.1, 0, 0.05], RightForeArm: [-0.3, 0, 0], LeftArm: [-0.3, 0, 0.6], LeftForeArm: [-0.5, 0, 0],
    LeftUpLeg: [-0.2, 0, 0.15], LeftLeg: [0.25, 0, 0], RightUpLeg: [0.15, 0, -0.15], RightLeg: [0.25, 0, 0],
  } },
  { name: 'carga', dur: 0.55, curve: 'linear', tremble: 0.03, hold: true },
  { name: 'apontar', dur: 0.12, curve: 'snap', hips: -0.03, event: { at: 0.9, name: 'release' }, pose: {
    Spine: [0.02, 0, 0], Spine1: [0, -0.18, 0], RightArm: [-1.5, 0, 0.1], RightForeArm: [0.55, 0, 0], LeftArm: [-0.2, 0, 0.75], LeftForeArm: [-0.4, 0, 0],
    LeftUpLeg: [-0.2, 0, 0.15], LeftLeg: [0.25, 0, 0], RightUpLeg: [0.15, 0, -0.15], RightLeg: [0.25, 0, 0],
  } },
  { name: 'recuo', dur: 0.2, curve: 'out', hips: -0.06, pose: {
    Spine: [-0.2, 0, 0], Spine1: [-0.1, -0.18, 0], Head: [-0.16, 0, 0], RightArm: [-1.35, 0, 0.1], RightForeArm: [0.4, 0, 0], LeftArm: [0.2, 0, 0.85], LeftForeArm: [-0.3, 0, 0],
    LeftUpLeg: [-0.1, 0, 0.15], LeftLeg: [0.32, 0, 0], RightUpLeg: [0.25, 0, -0.15], RightLeg: [0.3, 0, 0],
  } },
  { name: 'recuperação', dur: 0.55, curve: 'inOut', hips: 0, pose: {} },
];

// Raio, Corrente: a energia junta nas duas mãos, à frente do corpo, e sai de uma vez; o corpo recua.
const CHAIN = [
  { name: 'preparação', dur: 0.3, curve: 'out', hips: -0.03, pose: {
    Spine: [0.06, 0, 0], Head: [0.1, 0, 0], LeftArm: [-0.8, 0, 0.18], LeftForeArm: [-0.6, 0, 0], RightArm: [-0.6, 0, 0.12], RightForeArm: [-0.35, 0, 0],
    LeftUpLeg: [-0.15, 0, 0.12], LeftLeg: [0.22, 0, 0], RightUpLeg: [0.1, 0, -0.12], RightLeg: [0.2, 0, 0],
  } },
  { name: 'carga', dur: 0.55, curve: 'linear', tremble: 0.035, hold: true },
  { name: 'liberar', dur: 0.12, curve: 'snap', event: { at: 0.8, name: 'release' }, pose: {
    Spine: [0.08, 0, 0], LeftArm: [-1.45, 0, -0.1], LeftForeArm: [-0.05, 0, 0], RightArm: [-1.3, 0, 0.15], RightForeArm: [0.45, 0, 0],
    LeftUpLeg: [-0.15, 0, 0.12], LeftLeg: [0.22, 0, 0], RightUpLeg: [0.1, 0, -0.12], RightLeg: [0.2, 0, 0],
  } },
  { name: 'recuo', dur: 0.3, curve: 'out', hips: -0.05, pose: {
    Spine: [-0.18, 0, 0], Head: [-0.12, 0, 0], LeftArm: [-1.2, 0, 0.1], LeftForeArm: [-0.2, 0, 0], RightArm: [-1.1, 0, 0.1], RightForeArm: [0.3, 0, 0],
    LeftUpLeg: [-0.05, 0, 0.12], LeftLeg: [0.3, 0, 0], RightUpLeg: [0.2, 0, -0.12], RightLeg: [0.28, 0, 0],
  } },
  { name: 'recuperação', dur: 0.55, curve: 'inOut', hips: 0, pose: {} },
];

// Terra: pesado e firme. Base larga, ergue o cajado e golpeia o chão com o corpo todo.
const stance = { LeftUpLeg: [-0.2, 0, 0.24], LeftLeg: [0.3, 0, 0], RightUpLeg: [0.12, 0, -0.24], RightLeg: [0.26, 0, 0] };
const crouch = { LeftUpLeg: [-0.42, 0, 0.26], LeftLeg: [0.7, 0, 0], RightUpLeg: [-0.1, 0, -0.26], RightLeg: [0.62, 0, 0] };
const earth = ({ raise = 0.32, slam = 0.14, hold = 0.3, high = 2.0, heavy = 1 }) => [
  { name: 'preparação', dur: 0.38, curve: 'inOut', hips: -0.05, pose: {
    Spine: [-0.04, 0, 0], RightArm: [-1.5, 0, 0], RightForeArm: [-0.2, 0, 0], LeftArm: [-0.4, 0, 0.5], LeftForeArm: [-0.3, 0, 0], ...stance,
  } },
  { name: 'erguer', dur: raise, curve: 'inOut', hips: -0.04, pose: {
    Spine: [-0.14 * heavy, 0, 0], Spine1: [-0.05, 0, 0], Head: [-0.14, 0, 0], RightArm: [-high, 0, 0.05], RightForeArm: [0.1, 0, 0],
    LeftArm: [-high + 0.35 * heavy, 0, 0.35], LeftForeArm: [-0.25, 0, 0], ...stance,
  } },
  ...(heavy > 1 ? [{ name: 'conjuração', dur: 0.32, curve: 'linear', tremble: 0.015, hold: true }] : []),
  { name: 'golpe', dur: slam, curve: 'in', hips: -0.12 * heavy, event: { at: 1, name: 'release' }, pose: {
    Spine: [0.32 + 0.06 * heavy, 0, 0], Spine1: [0.12, 0, 0], Head: [0.14, 0, 0], RightArm: [-0.5, 0, 0.05], RightForeArm: [0.5, 0, 0],
    LeftArm: [-0.6, 0, 0.3], LeftForeArm: [-0.4, 0, 0], ...crouch,
  } },
  { name: 'segurar', dur: hold, curve: 'out', hold: true },
  { name: 'recuperação', dur: 0.7 + 0.1 * heavy, curve: 'inOut', hips: 0, pose: {} },
];

// Nome da animação (campo 'anim' do livro de magias) -> sequência.
export const SCHOOLS = {
  fogo: FIRE, fogoParede: FIRE_WALL,
  gelo: ICE, geloPrisao: ICE_PRISON,
  raio: LIGHTNING, raioCorrente: CHAIN,
  terra: earth({}), terraTremor: earth({ raise: 0.42, slam: 0.16, hold: 0.45, high: 2.3, heavy: 1.25 }),
};

// Reação a dano: um tranco para trás que some sozinho.
const HIT = { Spine1: [-0.22, 0, 0.05], Spine2: [-0.1, 0, 0], Head: [-0.32, 0, 0.08], LeftArm: [0, 0, 0.45], RightArm: [0, 0, -0.2] };

// library: as sequências que este animador conhece (o mago usa SCHOOLS; o guerreiro, os golpes dele).
export class CastAnimator {
  constructor(mage, library = SCHOOLS) {
    this.mage = mage;
    this.library = library;
    this.seq = null;       // sequência em andamento
    this.i = 0; this.t = 0;
    this.from = {}; this.to = {}; this.cur = {};
    this.hipsFrom = 0; this.hipsTo = 0; this.hips = 0;
    this.hit = 0;
    this.onEvent = null;
    this.fired = new Set();
  }

  get playing() { return !!this.seq; }
  get phaseName() { return this.seq ? this.seq[this.i].name : 'repouso'; }

  // Começa a sequência da escola. onEvent(nome) recebe 'windup', 'release', 'recover' e 'done'.
  play(school, onEvent = null) {
    const seq = this.library[school];
    if (!seq) throw new Error(`Sem animação: ${school}`);
    this.seq = seq;
    this.onEvent = onEvent;
    this.fired.clear();
    this.enter(0);
  }

  stop() { this.seq = null; this.enterIdle(); }

  enter(i) {
    this.i = i; this.t = 0;
    const ph = this.seq[i];
    this.from = clone(this.cur);
    this.hipsFrom = this.hips;
    if (!ph.hold) { this.to = ph.pose; this.hipsTo = ph.hips ?? this.hipsTo; }
  }

  enterIdle() { this.from = clone(this.cur); this.to = {}; this.hipsFrom = this.hips; this.hipsTo = 0; this.t = 0; this.returning = 0.3; }

  emit(name) { if (this.onEvent) this.onEvent(name); }

  // Reação ao levar dano (some sozinha).
  flinch(k = 1) { this.hit = Math.min(1, this.hit + k); }

  update(dt, time) {
    if (this.seq) {
      const ph = this.seq[this.i];
      this.t += dt;
      const u = Math.min(1, this.t / ph.dur);
      if (ph.event && !this.fired.has(`${this.i}:${ph.event.name}`) && u >= ph.event.at) { this.fired.add(`${this.i}:${ph.event.name}`); this.emit(ph.event.name); }
      const k = ease[ph.curve](u);
      this.cur = blend(this.from, this.to, k);
      this.hips = this.hipsFrom + (this.hipsTo - this.hipsFrom) * k;
      if (ph.tremble) for (const name of ['LeftArm', 'LeftForeArm', 'RightArm']) {
        const r = this.cur[name];
        if (r) this.cur[name] = [r[0] + Math.sin(time * 41 + name.length) * ph.tremble, r[1], r[2] + Math.sin(time * 37) * ph.tremble];
      }
      if (u >= 1) {
        if (this.i + 1 < this.seq.length) this.enter(this.i + 1);
        else { this.seq = null; this.cur = {}; this.hips = 0; this.emit('done'); }
      }
    } else if (this.returning > 0) { // interrompido: volta ao repouso
      this.t += dt;
      const k = ease.inOut(Math.min(1, this.t / this.returning));
      this.cur = blend(this.from, {}, k);
      this.hips = this.hipsFrom * (1 - k);
      if (k >= 1) { this.returning = 0; this.cur = {}; }
    }
    // reação a dano por cima
    let pose = this.cur;
    if (this.hit > 0.001) {
      const w = Math.sin(Math.min(1, this.hit) * Math.PI * 0.5);
      pose = blend(pose, addPose(pose, HIT), w);
      this.hit = Math.max(0, this.hit - dt * 3.2);
    }
    this.mage.castPose = Object.keys(pose).length ? pose : null;
    this.mage.castHips = this.hips;
  }
}

const clone = p => Object.fromEntries(Object.entries(p).map(([k, v]) => [k, [...v]]));
function blend(a, b, k) {
  const out = {};
  for (const name of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const p = a[name] || [0, 0, 0], q = b[name] || [0, 0, 0];
    out[name] = [p[0] + (q[0] - p[0]) * k, p[1] + (q[1] - p[1]) * k, p[2] + (q[2] - p[2]) * k];
  }
  return out;
}
function addPose(a, b) {
  const out = clone(a);
  for (const [name, r] of Object.entries(b)) { const p = out[name] || [0, 0, 0]; out[name] = [p[0] + r[0], p[1] + r[1], p[2] + r[2]]; }
  return out;
}
