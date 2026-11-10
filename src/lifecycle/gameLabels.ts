import type { Game } from './domain';
export const gameTitle = (game: Game) =>
  game.number === null ? 'Partida · local' : `Partida #${String(game.number).padStart(3, '0')}`;
export const names = (game: Game, side: 'A' | 'B') =>
  game.participants
    .filter((p) => p.side === side)
    .sort((a, b) => a.position - b.position)
    .map((p) => p.name)
    .join(', ');
