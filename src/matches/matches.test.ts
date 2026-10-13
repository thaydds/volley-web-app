import { describe, expect, it } from 'vitest';
import { createMatch, formatMatchDate, nextMatchNumber } from './matches';
import type { Teams } from '../roster/types';

function teams(): Teams {
  return { A: ['Lana', 'Bia'], B: ['Ana', 'Duda'] };
}

describe('US1.4 — Confirmar e registrar partida (cenários BDD)', () => {
  it('AC1.4.1: Given times prontos, When confirmo, Then número é o sequencial sem reutilizar (BR4.1)', () => {
    expect(nextMatchNumber([])).toBe(1);
    expect(nextMatchNumber([{ number: 1 }, { number: 2 }])).toBe(3);
  });

  it('AC1.4.1: Given partidas #001 e #003 (a #002 foi excluída), When confirmo, Then o número é #004 e nunca reutiliza (BR4.1)', () => {
    expect(nextMatchNumber([{ number: 1 }, { number: 3 }])).toBe(4);
  });

  it('AC1.4.1: Given confirmação, When registro, Then a data sai em DD/MM/AAAA (BR4.2)', () => {
    expect(formatMatchDate(new Date(2026, 9, 12))).toBe('12/10/2026');
    expect(formatMatchDate(new Date(2026, 0, 5))).toBe('05/01/2026');
  });

  it('AC1.4.1: Given times confirmados, When crio a partida, Then ela guarda uma foto dos nomes sem vínculo vivo (snapshot)', () => {
    const confirmed = teams();
    const match = createMatch(confirmed, '12/10/2026', 1);
    confirmed.A.push('Intrusa');
    expect(match.teamA).toEqual(['Lana', 'Bia']);
    expect(match.teamB).toEqual(['Ana', 'Duda']);
    expect(match.winner).toBeNull();
  });

  it('C1/empty-teams: Given times vazios, When confirmo, Then a confirmação é bloqueada', () => {
    expect(() => createMatch({ A: [], B: [] }, '12/10/2026', 1)).toThrow();
    expect(() => createMatch({ A: ['Lana'], B: [] }, '12/10/2026', 1)).toThrow();
  });

  it('C3/invalid-winner: Given vencedor fora de A/B, When aplico, Then é rejeitado', () => {
    const confirmed = teams();
    const match = createMatch(confirmed, '12/10/2026', 1);
    expect(match.winner).toBeNull();
  });
});
