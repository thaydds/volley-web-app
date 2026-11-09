import { isObject, type CloudMatch } from './client';
export interface LegacyGame {
  key: string;
  number: number;
  played_on: string;
  winner: 'A' | 'B' | null;
  team_a: string[];
  team_b: string[];
}
export interface LegacyData {
  raw: string;
  players: string[];
  games: LegacyGame[];
  problems: string[];
}
const validName = (v: unknown): v is string =>
  typeof v === 'string' && [...v.trim()].length > 0 && [...v.trim()].length <= 30;
export function toIsoDate(value: string): string | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  if (!match) return null;
  const [, day, month, year] = match;
  const iso = `${year}-${month}-${day}`;
  const parsed = new Date(`${iso}T12:00:00Z`);
  return Number(year) >= 1900 &&
    Number(year) <= 2200 &&
    Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === iso
    ? iso
    : null;
}
export function readLegacy(storage: Storage): LegacyData | null {
  let raw: string | null;
  try {
    raw = storage.getItem('volley-v1');
  } catch {
    return null;
  }
  if (!raw) return null;
  const result: LegacyData = { raw, players: [], games: [], problems: [] };
  let root: unknown;
  try {
    root = JSON.parse(raw);
  } catch {
    result.problems.push(
      'O arquivo local não contém dados válidos. A cópia original foi preservada.'
    );
    return result;
  }
  if (!isObject(root)) {
    result.problems.push('O formato dos dados locais não foi reconhecido.');
    return result;
  }
  if (root.players !== undefined && !Array.isArray(root.players))
    result.problems.push('O elenco local tem um formato inválido.');
  if (Array.isArray(root.players))
    for (const player of root.players) {
      if (isObject(player) && validName(player.name)) result.players.push(player.name.trim());
      else result.problems.push('Um jogador local tem nome inválido e não será enviado.');
    }
  result.players = Array.from(
    new Map(result.players.map((n) => [n.toLocaleLowerCase('pt-BR'), n])).values()
  );
  if (root.matches !== undefined && !Array.isArray(root.matches))
    result.problems.push('O histórico local tem um formato inválido.');
  const keys = new Set<number>();
  if (Array.isArray(root.matches))
    for (const [index, game] of root.matches.entries()) {
      if (
        !isObject(game) ||
        !Number.isSafeInteger(game.number) ||
        Number(game.number) < 1 ||
        typeof game.date !== 'string' ||
        !toIsoDate(game.date) ||
        !Array.isArray(game.teamA) ||
        !Array.isArray(game.teamB) ||
        !game.teamA.length ||
        !game.teamB.length ||
        game.teamA.length + game.teamB.length > 100 ||
        ![...game.teamA, ...game.teamB].every(validName) ||
        (game.winner !== null && game.winner !== 'A' && game.winner !== 'B') ||
        keys.has(Number(game.number))
      ) {
        result.problems.push(
          `A partida local ${index + 1} está inválida ou com numeração repetida e não será enviada.`
        );
        continue;
      }
      const all = [...game.teamA, ...game.teamB].map((n) =>
        (n as string).trim().toLocaleLowerCase('pt-BR')
      );
      if (new Set(all).size !== all.length) {
        result.problems.push(`A partida #${game.number} repete um jogador e não será enviada.`);
        continue;
      }
      keys.add(Number(game.number));
      result.games.push({
        key: `match-${game.number}`,
        number: Number(game.number),
        played_on: toIsoDate(game.date)!,
        winner: game.winner,
        team_a: game.teamA.map((n) => (n as string).trim()),
        team_b: game.teamB.map((n) => (n as string).trim()),
      });
    }
  return result.players.length || result.games.length || result.problems.length ? result : null;
}
function signature(date: string, a: string[], b: string[]) {
  const normalize = (names: string[]) =>
    names.map((n) => n.trim().toLocaleLowerCase('pt-BR')).sort();
  const teams = [JSON.stringify(normalize(a)), JSON.stringify(normalize(b))].sort();
  return JSON.stringify([date, ...teams]);
}
export function possibleDuplicate(game: LegacyGame, remote: CloudMatch[]): boolean {
  const key = signature(game.played_on, game.team_a, game.team_b);
  return remote.some(
    (m) =>
      signature(
        m.played_on,
        m.participants.filter((p) => p.side === 'A').map((p) => p.name),
        m.participants.filter((p) => p.side === 'B').map((p) => p.name)
      ) === key
  );
}
export function sourceId(storage: Storage): string {
  const key = 'volley-import-source-v1';
  const saved = storage.getItem(key);
  if (saved && /^[a-f\d]{8}(-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(saved)) return saved;
  const id = crypto.randomUUID();
  storage.setItem(key, id);
  return id;
}
export async function legacyDigest(data: LegacyData): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(JSON.stringify([data.players, data.games]))
  );
  return Array.from(new Uint8Array(digest), (n) => n.toString(16).padStart(2, '0')).join('');
}
export function importBatches(
  data: LegacyData,
  selected: Set<string>,
  source_id: string,
  allowDuplicates = new Set<string>()
): Record<string, unknown>[] {
  const batches: Record<string, unknown>[] = [];
  let players: string[] = [];
  let matches: Omit<LegacyGame, 'number'>[] = [];
  const body = () => ({ source_id, players, matches });
  const flush = () => {
    if (players.length || matches.length) batches.push(body());
    players = [];
    matches = [];
  };
  const tooLarge = () => new TextEncoder().encode(JSON.stringify(body())).byteLength > 24000;
  for (const name of data.players) {
    players.push(name);
    if (tooLarge() || players.length > 1000) {
      players.pop();
      flush();
      players.push(name);
    }
  }
  for (const entry of data.games.filter((g) => selected.has(g.key))) {
    const game = {
      allow_duplicate: allowDuplicates.has(entry.key),
      key: entry.key,
      played_on: entry.played_on,
      winner: entry.winner,
      team_a: entry.team_a,
      team_b: entry.team_b,
    };
    matches.push(game);
    if (tooLarge() || matches.length > 500) {
      matches.pop();
      flush();
      matches.push(game);
    }
  }
  flush();
  return batches;
}
