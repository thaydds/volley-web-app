import type { Game } from './domain';
export type SessionScore = {
  version: number;
  a: number;
  b: number;
  validA: boolean;
  validB: boolean;
};
export const initialScore = (game: Game): SessionScore => ({
  version: game.version,
  a: game.score_a ?? 0,
  b: game.score_b ?? 0,
  validA: game.score_a === null || (game.score_a >= 0 && game.score_a <= 99),
  validB: game.score_b === null || (game.score_b >= 0 && game.score_b <= 99),
});
