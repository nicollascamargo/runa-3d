// Interface do guerreiro, no mesmo estilo da do mago:
//   troca de personagem (Mago | Guerreiro), sempre à vista, acima das barras;
//   barra do guerreiro: rodada, vida, energia, ação e movimento do turno, as seis habilidades (com o gesto,
//     a tecla, a energia e a recarga), o modo de treino e o fim do turno;
//   leitura do gesto (em cima, no meio): a pose que a câmera vê, o progresso do golpe, o último gesto
//     reconhecido (ou por que não valeu) e quanto tempo a leitura levou.
const el = (tag, cls, parent, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; if (parent) parent.appendChild(e); return e; };

// Ícones das habilidades (traço dourado, no estilo das runas): corte em arco, golpe descendo com impacto,
// escudo, investida, aparar e anéis de choque.
const ICON_PATHS = {
  corte: '<path d="M5 22 C12 10, 24 8, 31 14"/><path d="M27 10 l4 4 -5 1"/><path d="M9 26 l3 -3"/>',
  devastador: '<path d="M18 4 v18"/><path d="M14 8 h8"/><path d="M18 22 l-3 4 h6 z"/><path d="M8 30 h20"/><path d="M11 27 l-3 -3 M25 27 l3 -3"/>',
  guarda: '<path d="M18 4 C24 6, 29 6, 30 7 V16 C30 24, 24 29, 18 32 C12 29, 6 24, 6 16 V7 C7 6, 12 6, 18 4 Z"/><path d="M18 9 v18 M11 15 h14"/>',
  investida: '<path d="M4 18 h16"/><path d="M4 12 h9 M4 24 h9"/><path d="M22 9 C27 11, 30 14, 30 18 C30 22, 27 25, 22 27 Z"/>',
  contra: '<path d="M7 29 L27 9"/><path d="M24 7 l5 5"/><path d="M29 29 L9 9"/><path d="M12 7 l-5 5"/>',
  onda: '<circle cx="18" cy="20" r="3"/><path d="M10 20 a8 6 0 0 1 16 0"/><path d="M5 20 a13 10 0 0 1 26 0"/><path d="M18 4 v10"/>',
};
export const abilityIcon = (icon, size = 26) => `<svg class="ab-ic" viewBox="0 0 36 36" width="${size}" height="${size}" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${ICON_PATHS[icon] || ''}</g></svg>`;

export class WarriorUi {
  constructor(abilities) {
    this.abilities = abilities;
    this.onCommand = null; this.onAbility = null; this.onParty = null;

    this.party = el('div', 'party-switch', document.body);
    this.party.setAttribute('role', 'tablist');
    this.party.innerHTML = `
      <button type="button" role="tab" data-who="mago"><b>Mago</b><span class="ps-hp"><i></i></span></button>
      <button type="button" role="tab" data-who="guerreiro"><b>Guerreiro</b><span class="ps-hp"><i></i></span></button>
      <kbd>Tab</kbd>`;
    this.party.addEventListener('click', e => { const b = e.target.closest('[data-who]'); if (b && this.onParty) this.onParty(b.dataset.who); });

    this.bar = el('section', 'combat-bar warrior-bar', document.body);
    this.bar.hidden = true;
    this.bar.setAttribute('aria-label', 'Guerreiro');
    this.bar.innerHTML = `
      <div class="cb-turn"><b class="cb-phase">Seu turno</b><span class="cb-round">Rodada 1</span></div>
      <div class="cb-res">
        <span class="cb-row"><span class="cb-label">Vida</span><span class="cb-meter hp"><i></i></span><span class="cb-num hp-num"></span></span>
        <span class="cb-row"><span class="cb-label">Energia</span><span class="cb-meter energy"><i></i></span><span class="cb-num en-num"></span></span>
        <span class="cb-acts"></span>
      </div>
      <div class="wb-abilities"></div>
      <div class="wb-tools">
        <button type="button" class="wb-train" data-cmd="warrior.training" aria-pressed="false">Treino <kbd>Y</kbd></button>
        <button type="button" class="cb-end" data-cmd="turn.end">Encerrar turno <kbd>N</kbd></button>
      </div>`;
    const q = s => this.bar.querySelector(s);
    Object.assign(this, { bPhase: q('.cb-phase'), bRound: q('.cb-round'), bHp: q('.hp i'), bHpNum: q('.hp-num'), bEn: q('.energy i'), bEnNum: q('.en-num'), bActs: q('.cb-acts'), bTrain: q('.wb-train'), bEnd: q('.cb-end') });
    this.cards = abilities.map(a => {
      const b = el('button', 'wb-ab', q('.wb-abilities'));
      b.type = 'button';
      b.dataset.id = a.id;
      b.innerHTML = `${abilityIcon(a.icon)}<b>${a.name}</b><span class="g">${a.short || a.gesture}</span><span class="cost">${a.energy} energia</span><span class="cd"></span><kbd>${a.key}</kbd>`;
      return b;
    });
    this.bar.addEventListener('click', e => {
      const ab = e.target.closest('.wb-ab');
      if (ab && this.onAbility) this.onAbility(ab.dataset.id);
      const cmd = e.target.closest('[data-cmd]');
      if (cmd && this.onCommand) this.onCommand(cmd.dataset.cmd);
    });

    this.meter = el('section', 'gesture-meter', document.body);
    this.meter.hidden = true;
    this.meter.setAttribute('aria-live', 'polite');
    this.meter.innerHTML = `
      <div class="gm-head"><b>Guerreiro</b><span class="gm-state"></span></div>
      <div class="gm-row"><span class="gm-pose"></span><span class="gm-bar"><i></i></span><span class="gm-prog"></span></div>
      <p class="gm-msg"></p>
      <ul class="gm-list"></ul>
      <p class="gm-stats"></p>`;
    const m = s => this.meter.querySelector(s);
    Object.assign(this, { mState: m('.gm-state'), mPose: m('.gm-pose'), mBar: m('.gm-bar i'), mProg: m('.gm-prog'), mMsg: m('.gm-msg'), mStats: m('.gm-stats') });
    m('.gm-list').innerHTML = abilities.map(a => `<li class="${a.ready ? '' : 'soon'}" data-id="${a.id}">${abilityIcon(a.icon, 18)}<span><b>${a.name}</b>: ${a.gesture}${a.ready ? '' : ' <i>(em breve)</i>'}</span></li>`).join('');
    this.names = Object.fromEntries(abilities.map(a => [a.id, a.name]));
  }

  // O cartão (e a linha do gesto) acendem quando a habilidade é reconhecida.
  flash(id) {
    const els = [...this.bar.querySelectorAll(`.wb-ab[data-id="${id}"]`), ...this.meter.querySelectorAll(`.gm-list li[data-id="${id}"]`)];
    for (const e of els) { e.classList.remove('fired'); void e.offsetWidth; e.classList.add('fired'); }
    clearTimeout(this.flashT);
    this.flashT = setTimeout(() => { for (const e of els) e.classList.remove('fired'); }, 900);
  }

  setActive(who) {
    for (const b of this.party.querySelectorAll('[data-who]')) b.setAttribute('aria-selected', String(b.dataset.who === who));
    this.bar.hidden = who !== 'guerreiro';
    this.meter.hidden = who !== 'guerreiro';
  }

  // party: [{ id, unit }] para as barrinhas de vida da troca de personagem
  updateParty(units) {
    for (const b of this.party.querySelectorAll('[data-who]')) {
      const u = units[b.dataset.who];
      if (u) b.querySelector('.ps-hp i').style.width = `${(u.hp / u.maxHp) * 100}%`;
    }
  }

  updateBar(combat, unit, states, training) {
    const enemyTurn = combat.phase !== 'player';
    this.bar.classList.toggle('enemy-turn', enemyTurn);
    this.bPhase.textContent = enemyTurn ? 'Turno dos inimigos' : 'Seu turno';
    this.bRound.textContent = `Rodada ${combat.round}`;
    this.bHp.style.width = `${(unit.hp / unit.maxHp) * 100}%`;
    this.bHpNum.textContent = `${unit.hp}/${unit.maxHp}`;
    this.bEn.style.width = `${(unit.energy / unit.maxEnergy) * 100}%`;
    this.bEnNum.textContent = `${unit.energy}/${unit.maxEnergy}`;
    const st = [unit.statuses && unit.statuses.has('guardaDeFerro') ? 'guarda erguida' : '', unit.statuses && unit.statuses.has('aparar') ? 'contra-ataque armado' : ''].filter(Boolean).join(' · ');
    this.bActs.textContent = (training ? 'treino: nada é gasto' : `golpe ${unit.actionsLeft ? 'disponível' : 'usado'} · ${unit.movesLeft} ${unit.movesLeft === 1 ? 'casa' : 'casas'} de movimento`) + (st ? ` · ${st}` : '');
    this.bTrain.setAttribute('aria-pressed', String(training));
    this.bEnd.disabled = enemyTurn;
    this.cards.forEach((c, i) => {
      const a = this.abilities[i], st = states[i];
      c.classList.toggle('locked', !st.ok);
      c.classList.toggle('soon', !a.ready);
      c.querySelector('.cd').textContent = st.cooldown ? String(st.cooldown) : '';
      c.title = `${a.name} (${a.key}) · gesto: ${a.gesture} · ${a.ready ? (st.ok ? `${a.energy} de energia, recarga ${a.cooldown}` : st.reason) : 'em breve'}\n${a.description}`;
    });
  }

  // live: { pose, progress, id, prepared } do reconhecedor; feedback: { text, kind }; stats: texto da latência
  updateMeter({ state, live, feedback, stats, handOn }) {
    this.mState.textContent = state;
    this.mPose.textContent = handOn ? `mão: ${live.pose}` : 'câmera desligada: use as teclas 1 a 6';
    const p = Math.round((live.progress || 0) * 100);
    this.mBar.style.width = `${p}%`;
    // preparando: a pose de uma habilidade montada (e o quanto do gesto já foi feito)
    const id = live.id || live.prepared;
    this.mProg.textContent = handOn && id ? `${live.id ? '' : 'pronto: '}${this.names[id] || id}${live.id ? ` ${p}%` : ''}` : '';
    for (const li of this.meter.querySelectorAll('.gm-list li')) li.classList.toggle('prep', handOn && li.dataset.id === id);
    if (feedback) { this.mMsg.textContent = feedback.text; this.mMsg.className = `gm-msg ${feedback.kind}`; }
    this.mStats.textContent = stats || '';
  }
}
