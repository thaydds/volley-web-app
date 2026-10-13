import { afterEach, describe, expect, it } from 'vitest';
import { loadMatches, saveMatches } from './matchRepository';
import { saveRoster } from '../roster/rosterRepository';
import type { Match } from './types';

function match(number: number): Match {
  return {
    number,
    date: '12/10/2026',
    teamA: ['Lana'],
    teamB: ['Bia'],
    winner: null,
  };
}

describe('US1.4 — Persistência do histórico (cenários BDD, BR4.3)', () => {
  afterEach(() => {
    localStorage.clear();
  });

  it('AC1.4.2: Given partida finalizada, When recarrego, Then ela está no histórico com data e times', () => {
    saveMatches([match(1)]);
    const loaded = loadMatches();
    expect(loaded.matches).toEqual([match(1)]);
    expect(loaded.notice).toBeNull();
  });

  it('BR4.3/Q1: Given fatia matches corrompida, When leio, Then redefine só a fatia com aviso e o elenco fica intacto', () => {
    saveRoster([{ name: 'Lana', present: true }]);
    localStorage.setItem(
      'volley-v1',
      '{"players":[{"name":"Lana","present":true}],"matches":"lixo"}'
    );
    const loaded = loadMatches();
    expect(loaded.matches).toEqual([]);
    expect(loaded.notice).not.toBeNull();
    expect(JSON.parse(localStorage.getItem('volley-v1') as string).players).toEqual([
      { name: 'Lana', present: true },
    ]);
  });

  it('BR4.3: Given storage vazio, When leio, Then volto lista vazia sem aviso', () => {
    expect(loadMatches()).toEqual({ matches: [], notice: null });
  });

  it('BR4.1: Given exclusão da #002, When salvo de novo, Then o próximo número nunca reutiliza', () => {
    saveMatches([match(1), match(3)]);
    const loaded = loadMatches();
    const max = Math.max(...loaded.matches.map((m) => m.number));
    expect(max + 1).toBe(4);
  });

  it('BR4.3: Given elenco salvo, When salvo partidas, Then o elenco é preservado na mesma chave volley-v1', () => {
    saveRoster([{ name: 'Lana', present: true }]);
    saveMatches([match(1)]);
    const raw = JSON.parse(localStorage.getItem('volley-v1') as string);
    expect(raw.players).toEqual([{ name: 'Lana', present: true }]);
    expect(raw.matches).toEqual([match(1)]);
  });
});
