import type { Teams } from '../roster/types';
import type { Match } from './types';

export function formatMatchDate(date: Date = new Date()): string {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = String(date.getFullYear());
  return `${day}/${month}/${year}`;
}

export function formatMatchNumber(number: number): string {
  return `#${String(number).padStart(3, '0')}`;
}

export function nextMatchNumber(numbers: Array<{ number: number }>): number {
  if (numbers.length === 0) return 1;
  return Math.max(...numbers.map((m) => m.number)) + 1;
}

/**
 * Cria a partida com foto dos nomes (sem vínculo vivo com o sorteio).
 * Bloqueia times vazios (C1/empty-teams).
 */
export function createMatch(teams: Teams, date: string, number: number): Match {
  if (teams.A.length === 0 || teams.B.length === 0) {
    throw new Error('Confirme com os dois times preenchidos.');
  }
  return {
    number,
    date,
    teamA: [...teams.A],
    teamB: [...teams.B],
    winner: null,
  };
}
