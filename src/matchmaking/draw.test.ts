import { describe, expect, it } from 'vitest';
import { drawTeams, movePlayer } from './draw';

describe('US1.3 — Sortear times (cenários BDD)', () => {
  it('AC1.3.1: Given 6 presentes, When sorteio, Then Time A e B com 3 cada, todos alocados', () => {
    const names = ['Lana', 'Bia', 'Ana', 'Mia', 'Lia', 'Nia'];
    const teams = drawTeams(names);
    expect(teams.A).toHaveLength(3);
    expect(teams.B).toHaveLength(3);
    expect([...teams.A, ...teams.B].sort()).toEqual([...names].sort());
  });

  it('AC1.3.2: Given número ímpar, When sorteio, Then Time A fica com um a mais', () => {
    const teams = drawTeams(['Lana', 'Bia', 'Ana', 'Mia', 'Lia']);
    expect(teams.A).toHaveLength(3);
    expect(teams.B).toHaveLength(2);
  });

  it('AC1.3.3: Given menos de 2 presentes, When tento sortear, Then bloqueia com orientação', () => {
    for (const names of [[], ['Lana']]) {
      expect(() => drawTeams(names)).toThrow(/pelo menos 2/i);
    }
  });

  it('AC1.3.4: Given times sorteados, When movo "Lana" de time, Then a troca reflete na hora', () => {
    const teams = { A: ['Lana', 'Bia'], B: ['Ana', 'Mia'] };
    const moved = movePlayer(teams, 'Lana', 'B');
    expect(moved.A).toEqual(['Bia']);
    expect(moved.B).toEqual(['Ana', 'Mia', 'Lana']);
  });

  it('BR2.4: mover jogador inexistente mantém os times intactos', () => {
    const teams = { A: ['Lana'], B: ['Bia'] };
    expect(movePlayer(teams, 'Zé', 'B')).toEqual(teams);
  });

  it('AC1.3.5: novo sorteio redistribui todos os presentes', () => {
    const names = ['Lana', 'Bia', 'Ana', 'Mia'];
    const again = drawTeams(names);
    expect([...again.A, ...again.B].sort()).toEqual([...names].sort());
    expect(again.A).toHaveLength(2);
    expect(again.B).toHaveLength(2);
  });
});
