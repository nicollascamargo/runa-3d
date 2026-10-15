// Dificuldade das runas: escolhe como o jogador traça e o quanto o jogo exige do desenho.
//   Fácil     runa guiada, sempre: a runa aparece grande, com o ponto de partida, e o cursor gruda no trilho
//             (faixa larga, aceita com ~72% aceso, perdoa interrupções curtas). Progresso aceso enquanto traça.
//   Normal    runa guiada com tolerância moderada (aceita com 80% aceso) OU desenho livre (tecla I troca),
//             com o reconhecimento livre normal (nota mínima 0,75 e folga entre as duas runas mais prováveis).
//   Avançado  desenho livre, sem trilho na tela (a runa fica só no cartão), com reconhecimento mais rigoroso.
// A escolha fica no navegador (localStorage) e aparece no painel, em Configurações.
import { GUIDE_LEVELS } from './RuneGuide.js';
import { RECOGNIZER_LEVELS } from './RuneRecognizer.js';

export const DIFFICULTIES = {
  facil: {
    id: 'facil', name: 'Fácil', guided: 'sempre', guide: GUIDE_LEVELS.facil, recognizer: RECOGNIZER_LEVELS.normal, guideSize: 0.5, showGuide: true,
    summary: 'runa guiada, trilho magnético largo, aceita com ~72% traçado',
  },
  normal: {
    id: 'normal', name: 'Normal', guided: 'opcional', guide: GUIDE_LEVELS.normal, recognizer: RECOGNIZER_LEVELS.normal, guideSize: 0.44, showGuide: true,
    summary: 'runa guiada com tolerância moderada (80%) ou desenho livre (tecla I)',
  },
  avancado: {
    id: 'avancado', name: 'Avançado', guided: 'nunca', guide: GUIDE_LEVELS.normal, recognizer: RECOGNIZER_LEVELS.avancado, guideSize: 0.34, showGuide: false,
    summary: 'desenho livre, sem trilho na tela, reconhecimento mais rigoroso',
  },
};
export const DIFFICULTY_IDS = Object.keys(DIFFICULTIES);
export const DEFAULT_DIFFICULTY = 'facil';

const KEY = 'runa3d.dificuldade';
// Preferência salva. Quem já tinha desligado o ímã (versões anteriores) começa no Normal com desenho livre.
export function loadDifficulty() {
  let id = null, guided = null;
  try { id = localStorage.getItem(KEY); guided = localStorage.getItem('runa3d.guided'); } catch { /* sem armazenamento */ }
  if (DIFFICULTIES[id]) return { id, freeInNormal: guided === '0' };
  if (guided === '0') return { id: 'normal', freeInNormal: true };
  return { id: DEFAULT_DIFFICULTY, freeInNormal: false };
}
export function saveDifficulty(id) { try { localStorage.setItem(KEY, id); } catch { /* só não lembra */ } }
