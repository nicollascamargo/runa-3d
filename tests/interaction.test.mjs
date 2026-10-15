// Teste dos contextos de interação, sem navegador:  node tests/interaction.test.mjs
// Confere a tabela de src/input/InteractionContext.js contra as regras pedidas: a pinça não ativa golpe; o
// desenho da runa não move ninguém; os gestos do guerreiro não chegam ao mago (e vice-versa); cada coisa só
// vale no contexto certo; calibrando e avaliando, a mão não aciona nada no jogo.
import { CONTEXTS, resolveContext, InteractionContext } from '../src/input/InteractionContext.js';

let failures = 0, passed = 0;
const check = (name, cond, extra = '') => { if (cond) passed++; else { failures++; console.log(`FALHOU: ${name} ${extra}`); } };
const base = { caster: { state: 'idle', mode: 'play' }, active: 'mago', warrior: { state: 'free' }, enemyTurn: false };
const ctx = s => CONTEXTS[resolveContext({ ...base, ...s })];

// regras gerais da tabela
for (const [id, c] of Object.entries(CONTEXTS)) {
  check(`${id}: a caneta e os golpes nunca valem juntos`, !(c.pen && c.warrior));
  check(`${id}: desenhando, a pinça não é clique`, !(c.pen && c.pinch));
  check(`${id}: golpes do guerreiro só com os gestos dele (nada de mão aberta nem punho do mago)`, !c.warrior || (!c.gestures.includes('Open_Palm') && !c.gestures.includes('Closed_Fist')));
}

// contextos
check('mago livre: pinça e gestos do mago; sem golpes do guerreiro', resolveContext(base) === 'mago' && ctx({}).pinch && ctx({}).gestures.includes('Open_Palm') && !ctx({}).warrior);
check('guerreiro pronto: golpes de mão valem; os gestos do mago não', resolveContext({ ...base, active: 'guerreiro', warrior: { state: 'ready' } }) === 'guerreiro' && ctx({ active: 'guerreiro', warrior: { state: 'ready' } }).warrior && !ctx({ active: 'guerreiro', warrior: { state: 'ready' } }).gestures.includes('Open_Palm'));
check('segurando alguém na pinça: nenhum golpe, nenhum gesto, nada de caneta (a pinça só solta)', (c => c.pinch && !c.warrior && !c.pen && c.gestures.length === 0)(ctx({ holding: true, active: 'guerreiro', warrior: { state: 'carried' } })));
check('alguém pousando: a pinça não clica (não pega outro sem querer)', !ctx({ flying: true }).pinch);
check('guerreiro andando, golpeando ou levitando: nada de golpe novo', ['walking', 'acting', 'recovering', 'carried'].every(w => !ctx({ active: 'guerreiro', warrior: { state: w } }).warrior));
check('roda aberta: punho escolhe; nada de caneta nem golpe', (c => c.gestures.includes('Closed_Fist') && !c.pen && !c.warrior)(ctx({ caster: { state: 'wheel', mode: 'play' } })));
check('desenhando a runa: caneta sim; pinça não é clique; punho não lança', (c => c.pen && !c.pinch && !c.gestures.includes('Closed_Fist'))(ctx({ caster: { state: 'drawing', mode: 'play' } })));
check('desenhando com o guerreiro ativo (não acontece, mas se acontecer): a runa manda, sem golpe', !ctx({ active: 'guerreiro', caster: { state: 'drawing', mode: 'play' } }).warrior);
check('treino de runas: caneta sim, sem golpe', (c => c.pen && !c.warrior)(ctx({ caster: { state: 'drawing', mode: 'practice' } })));
check('mirando: pinça trava o alvo, punho lança', (c => c.pinch && c.gestures.includes('Closed_Fist'))(ctx({ caster: { state: 'targeting', mode: 'play' } })));
check('conjurando: nada aciona (nem pinça, nem punho, nem polegar)', (c => !c.pinch && !c.pen && !c.warrior && !c.gestures.includes('Closed_Fist') && !c.gestures.includes('Thumb_Down'))(ctx({ caster: { state: 'casting', mode: 'play' } })));
check('turno dos inimigos: golpes não valem (no treino do guerreiro, valem)', !ctx({ enemyTurn: true, active: 'guerreiro', warrior: { state: 'ready' } }).warrior && ctx({ enemyTurn: true, training: true, active: 'guerreiro', warrior: { state: 'ready' } }).warrior);
check('calibrando: a mão não aciona nada no jogo', (c => !c.pinch && !c.pen && !c.warrior && !c.gestures.length)(ctx({ calibrating: true, holding: true })));
check('calibração, runa de teste: só a caneta (e voltar)', (c => c.pen && !c.pinch && !c.warrior)(ctx({ calibratingRune: true })));
check('avaliando a câmera: nada aciona no jogo', (c => !c.pinch && !c.pen && !c.warrior && !c.gestures.length)(ctx({ evaluating: true })));

// a classe: troca de contexto registrada, consultas
{
  let s = { ...base };
  const ix = new InteractionContext(() => s);
  check('começa no mago', ix.update(0) === 'mago' && ix.allowsPinch());
  s = { ...base, holding: true };
  check('segurando: a consulta já vê o contexto novo', !ix.allowsWarrior() && !ix.allowsGesture('Open_Palm') && ix.id === 'segurando');
  check('a troca fica no histórico (para o diagnóstico)', ix.history.length === 1 && ix.history[0].from === 'mago' && ix.history[0].to === 'segurando');
}

console.log(failures ? `\n${failures} falha(s), ${passed} ok` : `Todos os ${passed} testes dos contextos de interação passaram.`);
process.exit(failures ? 1 : 0);
