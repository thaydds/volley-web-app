import type { Match, WinnerSide } from './types';

export interface Standing {
  points: number;
  wins: number;
  losses: number;
}

export type Standings = Record<string, Standing>;

function emptyStanding(): Standing {
  return { points: 0, wins: 0, losses: 0 };
}

function ensure(standings: Standings, name: string): Standing {
  const current = standings[name];
  if (current !== undefined) return current;
  const fresh = emptyStanding();
  standings[name] = fresh;
  return fresh;
}

/**
 * BR5.2: vitória soma 1 ponto e 1V para cada vencedor; derrota soma 1D.
 * Partida sem vencedor (nulo) registra os nomes zerados sem pontuar (C3).
 */
export function computeStandings(matches: Match[]): Standings {
  const standings: Standings = {};
  for (const match of matches) {
    for (const name of [...match.teamA, ...match.teamB]) {
      ensure(standings, name);
    }
    if (match.winner === null) continue;
    const winners: WinnerSide = match.winner;
    const winningNames = winners === 'A' ? match.teamA : match.teamB;
    const losingNames = winners === 'A' ? match.teamB : match.teamA;
    for (const name of winningNames) {
      const entry = ensure(standings, name);
      entry.points += 1;
      entry.wins += 1;
    }
    for (const name of losingNames) {
      ensure(standings, name).losses += 1;
    }
  }
  return standings;
}
