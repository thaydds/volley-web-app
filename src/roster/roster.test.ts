import { beforeEach, describe, expect, it } from 'vitest';
import { addPlayer, presentPlayers, togglePresence } from './roster';
import { validatePlayerName } from './validatePlayerName';
import { loadRoster, saveRoster, STORAGE_KEY } from './rosterRepository';
import type { Player } from './types';

function player(name: string, present = true): Player {
  return { name, present };
}

describe('US1.2 — Gerenciar elenco (cenários BDD)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('AC1.2.1: Given elenco vazio, When cadastro "Lana", Then ela aparece na lista', () => {
    const result = addPlayer([], 'Lana');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.players).toEqual([player('Lana', false)]);
    }
  });

  it('AC1.2.1: elenco persiste após recarregar (BR1.5)', () => {
    const added = addPlayer([], 'Lana');
    expect(added.ok).toBe(true);
    if (!added.ok) return;
    saveRoster(added.players);
    const reloaded = loadRoster();
    expect(reloaded.notice).toBeNull();
    expect(reloaded.players).toEqual([player('Lana', false)]);
  });

  it('AC1.2.2: Given nome duplicado, When tento cadastrar, Then vejo aviso e nada duplica (BR1.1)', () => {
    const first = addPlayer([], 'Lana');
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = addPlayer(first.players, 'Lana');
    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(second.error).toMatch(/já está cadastrado/i);
      expect(second.players).toHaveLength(1);
    }
  });

  it('BR1.1: duplicata ignora caixa e espaços ao redor', () => {
    const first = addPlayer([], 'Lana');
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = addPlayer(first.players, '  lana  ');
    expect(second.ok).toBe(false);
  });

  it('BR1.3: nome vazio ou só-espaços é rejeitado com "informe um nome"', () => {
    for (const raw of ['', '   ']) {
      const result = validatePlayerName(raw, []);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toMatch(/informe um nome/i);
      }
    }
    expect(addPlayer([], '   ').ok).toBe(false);
  });

  it('BR1.2: nome tem 1–30 caracteres visíveis', () => {
    expect(validatePlayerName('A', []).ok).toBe(true);
    expect(validatePlayerName('x'.repeat(30), []).ok).toBe(true);
    const long = validatePlayerName('x'.repeat(31), []);
    expect(long.ok).toBe(false);
    if (!long.ok) {
      expect(long.error).toMatch(/30/);
    }
  });

  it('AC1.2.3: When marco/desmarco presentes, Then só marcados entram no sorteio (BR1.4)', () => {
    let players = [player('Lana', false), player('Bia', false)];
    players = togglePresence(players, 'Lana');
    expect(players.find((p) => p.name === 'Lana')?.present).toBe(true);
    expect(presentPlayers(players).map((p) => p.name)).toEqual(['Lana']);
    players = togglePresence(players, 'Lana');
    expect(presentPlayers(players)).toHaveLength(0);
  });

  it('Q1: leitura corrompida redefine a fatia com aviso e nunca trava', () => {
    localStorage.setItem(STORAGE_KEY, '{json-invalido');
    const reloaded = loadRoster();
    expect(reloaded.players).toEqual([]);
    expect(reloaded.notice).toMatch(/aviso|redefin|recuper/i);
  });
});
