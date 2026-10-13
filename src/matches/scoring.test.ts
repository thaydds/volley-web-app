import { describe, expect, it } from 'vitest';
import { computeStandings } from './scoring';
import type { Match } from './types';

function match(overrides: Partial<Match> & { number: number }): Match {
  return {
    date: '12/10/2026',
    teamA: ['Lana', 'Bia'],
    teamB: ['Ana', 'Duda'],
    winner: null,
    ...overrides,
  };
}

describe('US1.5 — Pontuação do vencedor (cenários BDD, BR5.2, C3)', () => {
  it('AC1.5.1: Given vitória do A, When somo, Then cada jogador do A leva 1 ponto e 1V; do B, 1D', () => {
    const standings = computeStandings([match({ number: 1, winner: 'A' })]);
    expect(standings.Lana).toEqual({ points: 1, wins: 1, losses: 0 });
    expect(standings.Bia).toEqual({ points: 1, wins: 1, losses: 0 });
    expect(standings.Ana).toEqual({ points: 0, wins: 0, losses: 1 });
    expect(standings.Duda).toEqual({ points: 0, wins: 0, losses: 1 });
  });

  it('AC1.5.2: Given partida sem vencedor (cancelada), When somo, Then ninguém pontua', () => {
    const standings = computeStandings([match({ number: 1, winner: null })]);
    expect(standings.Lana).toEqual({ points: 0, wins: 0, losses: 0 });
    expect(standings.Ana).toEqual({ points: 0, wins: 0, losses: 0 });
  });

  it('BR5.2: Given duas partidas com vencedores alternados, When somo, Then acumula ponto, V e D', () => {
    const standings = computeStandings([
      match({ number: 1, winner: 'A' }),
      match({ number: 2, winner: 'B' }),
    ]);
    expect(standings.Lana).toEqual({ points: 1, wins: 1, losses: 1 });
    expect(standings.Ana).toEqual({ points: 1, wins: 1, losses: 1 });
  });

  it('A6: a pontuação deriva só das partidas; excluir partida não apaga pontos já somados do cálculo externo', () => {
    const withBoth = computeStandings([
      match({ number: 1, winner: 'A' }),
      match({ number: 2, winner: 'B' }),
    ]);
    expect(withBoth.Lana?.points).toBe(1);
    const afterDelete = computeStandings([match({ number: 2, winner: 'B' })]);
    expect(afterDelete.Duda?.points).toBe(1);
  });

  it('C3: nomes fora do elenco ainda aparecem na foto da partida e pontuam pelo nome', () => {
    const standings = computeStandings([
      match({ number: 1, teamA: ['Zé'], teamB: ['Bia'], winner: 'A' }),
    ]);
    expect(standings.Zé).toEqual({ points: 1, wins: 1, losses: 0 });
  });
});
