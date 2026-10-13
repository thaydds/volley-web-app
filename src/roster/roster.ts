import type { Player } from './types';
import { validatePlayerName } from './validatePlayerName';

export type AddPlayerResult =
  { ok: true; players: Player[] } | { ok: false; error: string; players: Player[] };

export function addPlayer(players: Player[], rawName: string): AddPlayerResult {
  const validation = validatePlayerName(rawName, players);
  if (!validation.ok) {
    return { ok: false, error: validation.error, players };
  }
  return { ok: true, players: [...players, { name: validation.name, present: false }] };
}

export function togglePresence(players: Player[], name: string): Player[] {
  return players.map((p) => (p.name === name ? { ...p, present: !p.present } : p));
}

export function presentPlayers(players: Player[]): Player[] {
  return players.filter((p) => p.present);
}
