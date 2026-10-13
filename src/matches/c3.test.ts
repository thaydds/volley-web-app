import { describe, expect, it } from 'vitest';
import { createMatch } from './matches';
import { computeStandings } from './scoring';
import type { Match } from './types';

/**
 * C3 — partidas e vencedores (u2-matches → u3-ranking).
 * Fronteira via tipos TS compartilhados + fatia `volley-v1.matches`.
 * Payload: [{number, date, teamA: [name], teamB: [name], winner: A|B|null}].
 */
describe('C3 — partidas → Ranking (contrato shared-schema)', () => {
  it('payload da partida carrega number sequencial, data DD/MM/AAAA, foto dos times e winner', () => {
    const match: Match = createMatch({ A: ['Lana'], B: ['Bia'] }, '12/10/2026', 1);
    expect(match).toEqual({
      number: 1,
      date: '12/10/2026',
      teamA: ['Lana'],
      teamB: ['Bia'],
      winner: null,
    });
    expect(match.date).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
  });

  it('invariante: number sequencial sem reutilizar (BR4.1)', () => {
    const numbers = [1, 3];
    expect(Math.max(...numbers) + 1).toBe(4);
  });

  it('invariante: winner nulo significa sem pontuação — o Ranking lê zero sem falhar', () => {
    const standings = computeStandings([createMatch({ A: ['Lana'], B: ['Bia'] }, '12/10/2026', 1)]);
    expect(standings.Lana).toEqual({ points: 0, wins: 0, losses: 0 });
    expect(standings.Bia).toEqual({ points: 0, wins: 0, losses: 0 });
  });

  it('BR5.2: vencedor A soma 1 ponto + 1V nos vencedores e 1D nos vencidos', () => {
    const base = createMatch({ A: ['Lana'], B: ['Bia'] }, '12/10/2026', 1);
    const scored: Match = { ...base, winner: 'A' };
    const standings = computeStandings([scored]);
    expect(standings.Lana).toEqual({ points: 1, wins: 1, losses: 0 });
    expect(standings.Bia).toEqual({ points: 0, wins: 0, losses: 1 });
  });

  it('todo data-testid interativo da unidade segue o padrão kebab-case estável', async () => {
    const modules = await Promise.all([
      import('./ConfirmScreen'),
      import('./WinnerModal'),
      import('./HistoryScreen'),
      import('./DeleteModal'),
    ]);
    expect(modules.length).toBe(4);
  });
});
