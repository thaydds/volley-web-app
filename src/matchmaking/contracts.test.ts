import { beforeEach, describe, expect, it } from 'vitest';
import { drawTeams } from './draw';
import { addPlayer, presentPlayers } from '../roster/roster';
import { loadRoster, saveRoster } from '../roster/rosterRepository';
import type { Player } from '../roster/types';

function buildRoster(names: string[]): Player[] {
  let players: Player[] = [];
  for (const name of names) {
    const result = addPlayer(players, name);
    if (!result.ok) throw new Error(`Falha ao cadastrar ${name}: ${result.error}`);
    players = result.players.map((p) => ({ ...p, present: true }));
  }
  return players;
}

describe('Fronteiras C1/C2 — contratos internos (u1-skeleton → u2/u3)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('C2: nomes do elenco persistem únicos via schema compartilhado volley-v1', () => {
    const players = buildRoster(['Lana', 'Bia', 'Ana']);
    saveRoster(players);
    const reloaded = loadRoster();
    const names = reloaded.players.map((p) => p.name);
    expect(new Set(names).size).toBe(names.length);
    expect(reloaded.players).toEqual(players);
  });

  it('C2: nome fora do elenco é desconhecido pelo repositório (unknown-player)', () => {
    saveRoster(buildRoster(['Lana']));
    const reloaded = loadRoster();
    const known = new Set(reloaded.players.map((p) => p.name));
    expect(known.has('Zé')).toBe(false);
  });

  it('C1: times sorteados só contêm nomes do elenco', () => {
    const players = buildRoster(['Lana', 'Bia', 'Ana', 'Mia']);
    const names = presentPlayers(players).map((p) => p.name);
    const teams = drawTeams(names);
    const known = new Set(names);
    for (const member of [...teams.A, ...teams.B]) {
      expect(known.has(member)).toBe(true);
    }
  });

  it('C1: Time A com igual ou um a mais que B', () => {
    for (const count of [2, 3, 4, 5, 6]) {
      const names = Array.from({ length: count }, (_, i) => `Jog${i}`);
      const teams = drawTeams(names);
      expect(teams.A.length === teams.B.length || teams.A.length === teams.B.length + 1).toBe(true);
    }
  });

  it('C1: confirmação bloqueada sem times (empty-teams)', () => {
    expect(() => drawTeams([])).toThrow();
    expect(() => drawTeams(['Lana'])).toThrow();
  });
});
