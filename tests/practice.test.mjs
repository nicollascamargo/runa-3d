// Teste do registro do treino de runas, sem navegador:  node tests/practice.test.mjs
// Acertos, erros, falsos disparos, tempo médio, filtro por sessão, gravação entre sessões e exportação.
import { RunePractice } from '../src/runes/RunePractice.js';

let failures = 0, passed = 0;
const check = (name, cond, extra = '') => { if (cond) passed++; else { failures++; console.log(`FALHOU: ${name} ${extra}`); } };
const memory = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) }; };

const store = memory();
const p = new RunePractice({ storage: store });
p.record({ rune: 'circulo', ok: true, read: 'circulo', score: 0.91, ms: 2100, difficulty: 'facil', guided: true });
p.record({ rune: 'circulo', ok: false, read: 'losango', score: 0.7, ms: 3100, difficulty: 'facil', guided: true });
p.record({ rune: 'circulo', ok: true, read: 'circulo', score: 0.85, ms: 1800, difficulty: 'normal' });
p.record({ rune: 'livre', ok: true, read: null, score: 0.3, ms: 2500, difficulty: 'normal' });
p.record({ rune: 'livre', ok: false, read: 'onda', score: 0.78, ms: 2000, difficulty: 'normal' });
const c = p.stats({ rune: 'circulo' });
check('acertos e tentativas por runa', c.attempts === 3 && c.hits === 2 && Math.abs(c.rate - 2 / 3) < 1e-9);
check('runa trocada conta como erro com leitura diferente', c.wrong === 1);
check('tempo médio por tentativa', Math.abs(c.avgMs - (2100 + 3100 + 1800) / 3) < 1e-9, c.avgMs);
check('melhor nota e nota média dos acertos', c.bestScore === 0.91 && Math.abs(c.avgScore - 0.88) < 1e-9);
const f = p.stats({ rune: 'livre' });
check('rabisco: falso disparo quando alguma runa disparou', f.attempts === 2 && f.wrong === 1 && f.falseRate === 0.5);
check('filtro por dificuldade', p.stats({ difficulty: 'facil' }).attempts === 2);
const again = new RunePractice({ storage: store });
check('fica gravado entre uma sessão e outra', again.attempts.length === 5);
check('...mas "desta sessão" começa vazio', again.stats({ session: true }).attempts === 0);
const ex = JSON.parse(again.export());
check('exportar: total (só runas), rabiscos com falsos disparos, por runa e as tentativas', ex.total.attempts === 3 && ex.rabiscos.falsosDisparos === 1 && ex.porRuna.circulo.hits === 2 && ex.tentativas.length === 5);
again.reset();
check('zerar apaga tudo (também o gravado)', again.attempts.length === 0 && new RunePractice({ storage: store }).attempts.length === 0);
const broken = memory(); broken.setItem('runa3d.treino', '{estragado');
check('registro estragado: começa de novo sem quebrar', new RunePractice({ storage: broken }).attempts.length === 0);
check('sem armazenamento (navegador bloqueado): funciona na memória', (() => { const q = new RunePractice({ storage: null }); q.record({ rune: 'v', ok: true, ms: 1000 }); return q.stats().attempts === 1; })());

console.log(failures ? `\n${failures} falha(s), ${passed} ok` : `Todos os ${passed} testes do registro do treino passaram.`);
process.exit(failures ? 1 : 0);
