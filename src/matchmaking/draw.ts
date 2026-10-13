import type { Teams } from '../roster/types';

export type TeamSide = 'A' | 'B';

export function shuffle<T>(items: T[], random: () => number = Math.random): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    const current = copy[i];
    const other = copy[j];
    if (current !== undefined && other !== undefined) {
      copy[i] = other;
      copy[j] = current;
    }
  }
  return copy;
}

export function drawTeams(presentNames: string[], random: () => number = Math.random): Teams {
  if (presentNames.length < 2) {
    throw new Error('Marque pelo menos 2 presentes para sortear.');
  }
  const shuffled = shuffle(presentNames, random);
  const middle = Math.ceil(shuffled.length / 2);
  return { A: shuffled.slice(0, middle), B: shuffled.slice(middle) };
}

export function movePlayer(teams: Teams, name: string, toSide: TeamSide): Teams {
  let fromSide: TeamSide | null = null;
  if (teams.A.includes(name)) {
    fromSide = 'A';
  } else if (teams.B.includes(name)) {
    fromSide = 'B';
  }
  if (fromSide === null || fromSide === toSide) {
    return teams;
  }
  return {
    A: toSide === 'A' ? [...teams.A, name] : teams.A.filter((n) => n !== name),
    B: toSide === 'B' ? [...teams.B, name] : teams.B.filter((n) => n !== name),
  };
}

/**
 * Resolves a drag-and-drop result into the team whose panel received the drop.
 *
 * `sourceId` is the dragged player, `targetId` is the id of the drop target.
 * Returns `null` when the drop carries no team change (a correct drop back onto
 * the same team, or an unknown player) so callers can skip a pointless update.
 */
export function resolveDroppedSide(
  teams: Teams,
  sourceId: string,
  targetId: string
): TeamSide | null {
  const toSide: TeamSide = targetId === 'B' ? 'B' : 'A';
  const alreadyThere = toSide === 'A' ? teams.A.includes(sourceId) : teams.B.includes(sourceId);
  if (alreadyThere) {
    return null;
  }
  return toSide;
}
