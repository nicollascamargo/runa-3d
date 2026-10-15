// Registro do treino de runas (sem tela): cada tentativa com a runa pedida, o que foi lido, a nota, o tempo
// e a dificuldade. Dá a taxa de acerto, os falsos disparos e o tempo médio por tentativa, por runa e no total.
// Fica salvo no navegador (localStorage) entre uma sessão e outra, para medir sessões reais com a webcam;
// 'exportar' devolve tudo em JSON.
//
// Tentativa: { rune, ok, read (runa lida ou null), score, ms, difficulty, guided, at }
//   rune = 'livre': teste de rabisco (desenhar qualquer coisa que NÃO seja runa). ok = nenhuma runa disparou;
//   read = a runa que disparou sem querer (falso disparo).
const KEY = 'runa3d.treino';
const MAX = 3000;

export class RunePractice {
  constructor({ storage = defaultStorage() } = {}) {
    this.storage = storage;
    this.attempts = [];
    this.sessionStart = Date.now();
    this.sessionId = `${this.sessionStart.toString(36)}-${Math.random().toString(36).slice(2, 8)}`; // separa esta sessão das anteriores
    try { const saved = storage && JSON.parse(storage.getItem(KEY) || '[]'); if (Array.isArray(saved)) this.attempts = saved; } catch { /* registro estragado: começa de novo */ }
  }

  record(a) {
    const item = { rune: a.rune, ok: !!a.ok, read: a.read || null, score: round(a.score || 0, 3), ms: Math.round(a.ms || 0), difficulty: a.difficulty || '', guided: !!a.guided, source: a.source || '', at: Date.now(), session: this.sessionId };
    this.attempts.push(item);
    if (this.attempts.length > MAX) this.attempts.splice(0, this.attempts.length - MAX);
    this.save();
    return item;
  }

  save() { try { if (this.storage) this.storage.setItem(KEY, JSON.stringify(this.attempts)); } catch { /* sem espaço: segue sem salvar */ } }
  reset() { this.attempts = []; this.save(); }

  // Estatísticas de uma lista de tentativas.
  static summarize(list) {
    const n = list.length, hits = list.filter(a => a.ok).length;
    const wrong = list.filter(a => !a.ok && a.read && a.read !== a.rune).length; // leu outra runa (ou disparou num rabisco)
    const times = list.filter(a => a.ms > 0).map(a => a.ms);
    const scores = list.filter(a => a.ok && a.rune !== 'livre').map(a => a.score);
    return {
      attempts: n, hits, misses: n - hits, wrong,
      rate: n ? hits / n : 0,
      falseRate: n ? wrong / n : 0,
      avgMs: times.length ? times.reduce((s, v) => s + v, 0) / times.length : 0,
      bestScore: scores.length ? Math.max(...scores) : 0,
      avgScore: scores.length ? scores.reduce((s, v) => s + v, 0) / scores.length : 0,
    };
  }

  // filtro: { rune, difficulty, session (só desta sessão) }
  stats({ rune = null, difficulty = null, session = false } = {}) {
    return RunePractice.summarize(this.attempts.filter(a => (!rune || a.rune === rune) && (!difficulty || a.difficulty === difficulty) && (!session || this.inSession(a))));
  }

  inSession(a) { return a.session ? a.session === this.sessionId : a.at >= this.sessionStart; }

  // Resumo para exportar: por runa e no total, mais as tentativas.
  export() {
    const runes = [...new Set(this.attempts.map(a => a.rune))];
    const real = this.attempts.filter(a => a.rune !== 'livre'), free = this.attempts.filter(a => a.rune === 'livre');
    return JSON.stringify({
      gerado: new Date().toISOString(),
      total: RunePractice.summarize(real),
      rabiscos: { ...RunePractice.summarize(free), falsosDisparos: free.filter(a => !a.ok).length },
      porRuna: Object.fromEntries(runes.map(r => [r, RunePractice.summarize(this.attempts.filter(a => a.rune === r))])),
      tentativas: this.attempts,
    }, null, 2);
  }
}

const round = (v, d) => Math.round(v * 10 ** d) / 10 ** d;
function defaultStorage() { try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch { return null; } }
