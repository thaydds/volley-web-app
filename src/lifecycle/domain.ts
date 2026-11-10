import { isObject, type Pending } from '../shared/client';
export type Side = 'A' | 'B';
export type Player = {
  revision?: string;
  id: string;
  name: string;
  version: number;
  deleted_at: string | null;
};
export type Participant = { player_id: string; name: string; side: Side; position: number };
export type Game = {
  revision?: string;
  id: string;
  number: number | null;
  played_on: string;
  version: number;
  winner: Side | null;
  status: 'in_progress' | 'finished';
  score_a: number | null;
  score_b: number | null;
  serving_side: Side | null;
  legacy_result: boolean;
  deleted_at: string | null;
  participants: Participant[];
};
export type Snapshot = {
  players: Player[];
  matches: Game[];
  archived: Game[];
  syncedAt: string;
  revision: string;
};
export type Operation =
  'create_player' | 'reactivate_player' | 'start_match' | 'save_score' | 'finish_match';
export type Command = {
  request_id: string;
  operation: Operation;
  input: Record<string, unknown>;
  createdAt: string;
  error?: string;
};
export type Draft = { A: string[]; B: string[]; servingSide: Side };
export type Deactivation = {
  request_id: string;
  input: { id: string; version: number };
  uncertain: boolean;
};
export type LocalState = {
  schema: 2;
  base: Snapshot | null;
  queue: Command[];
  presence: string[];
  draft: Draft | null;
  deactivation: Deactivation | null;
  legacyPending: Pending[];
  lease: { owner: string; until: number } | null;
};
export const emptyState = (): LocalState => ({
  schema: 2,
  base: null,
  queue: [],
  presence: [],
  draft: null,
  deactivation: null,
  legacyPending: [],
  lease: null,
});
export const uuid = (v: unknown): v is string =>
  typeof v === 'string' && /^[a-f\d]{8}(-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(v);
export const canonicalName = (name: string) =>
  name.trim().replace(/\s+/g, ' ').toLocaleLowerCase('pt-BR');
export const displayName = (name: string) => name.trim().replace(/\s+/g, ' ');
export const validScore = (v: unknown): v is number =>
  Number.isInteger(v) && Number(v) >= 0 && Number(v) <= 2147483647;
export function parseScore(text: string): number | null {
  return /^\d+$/.test(text) && validScore(Number(text)) ? Number(text) : null;
}
export const canFinish = (a: number | null, b: number | null) =>
  validScore(a) && validScore(b) && a !== b;
export const scoreWinner = (a: number, b: number): Side => {
  if (!canFinish(a, b)) throw new Error('invalid_score');
  return a > b ? 'A' : 'B';
};
export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export function validPlayer(v: unknown): v is Player {
  return (
    isObject(v) &&
    uuid(v.id) &&
    typeof v.name === 'string' &&
    [...v.name].length > 0 &&
    [...v.name].length <= 30 &&
    Number.isInteger(v.version) &&
    Number(v.version) > 0 &&
    (v.deleted_at === null || typeof v.deleted_at === 'string')
  );
}
export function validGame(v: unknown): v is Game {
  if (
    !isObject(v) ||
    !uuid(v.id) ||
    !Number.isSafeInteger(v.number) ||
    Number(v.number) < 1 ||
    !Number.isInteger(v.version) ||
    Number(v.version) < 1 ||
    typeof v.played_on !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(v.played_on) ||
    !['in_progress', 'finished'].includes(String(v.status)) ||
    typeof v.legacy_result !== 'boolean' ||
    !(v.deleted_at === null || typeof v.deleted_at === 'string') ||
    ![null, 'A', 'B'].includes(v.serving_side as null | Side) ||
    !(v.score_a === null || validScore(v.score_a)) ||
    !(v.score_b === null || validScore(v.score_b)) ||
    !Array.isArray(v.participants) ||
    v.participants.length < 2 ||
    v.participants.length > 100
  )
    return false;
  if (
    !v.participants.every(
      (p) =>
        isObject(p) &&
        uuid(p.player_id) &&
        typeof p.name === 'string' &&
        p.name.length > 0 &&
        ['A', 'B'].includes(String(p.side)) &&
        Number.isInteger(p.position) &&
        Number(p.position) >= 0
    )
  )
    return false;
  if (
    new Set(v.participants.map((p) => p.player_id)).size !== v.participants.length ||
    !v.participants.some((p) => p.side === 'A') ||
    !v.participants.some((p) => p.side === 'B')
  )
    return false;
  return v.status === 'in_progress'
    ? v.winner === null
    : (v.legacy_result &&
        v.score_a === null &&
        v.score_b === null &&
        (v.winner === 'A' || v.winner === 'B')) ||
        (canFinish(v.score_a as number | null, v.score_b as number | null) &&
          v.winner === scoreWinner(Number(v.score_a), Number(v.score_b)));
}
export function validSnapshot(v: unknown): v is Snapshot {
  return (
    isObject(v) &&
    Array.isArray(v.players) &&
    v.players.every(validPlayer) &&
    Array.isArray(v.matches) &&
    v.matches.every(validGame) &&
    Array.isArray(v.archived) &&
    v.archived.every(validGame) &&
    typeof v.revision === 'string' &&
    /^\d+$/.test(v.revision) &&
    typeof v.syncedAt === 'string' &&
    Number.isFinite(Date.parse(v.syncedAt))
  );
}
export function validCommand(v: unknown): v is Command {
  if (
    !isObject(v) ||
    !uuid(v.request_id) ||
    !isObject(v.input) ||
    !uuid(v.input.id) ||
    typeof v.createdAt !== 'string' ||
    !Number.isFinite(Date.parse(v.createdAt)) ||
    !(
      v.error === undefined ||
      ['uncertain', 'conflict', 'invalid_command'].includes(String(v.error))
    ) ||
    !['create_player', 'reactivate_player', 'start_match', 'save_score', 'finish_match'].includes(
      String(v.operation)
    )
  )
    return false;
  const x = v.input;
  if (v.operation === 'create_player')
    return (
      typeof x.name === 'string' &&
      [...displayName(x.name)].length > 0 &&
      [...displayName(x.name)].length <= 30 &&
      Object.keys(x).length === 2
    );
  if (v.operation === 'start_match')
    return (
      typeof x.played_on === 'string' &&
      /^\d{4}-\d{2}-\d{2}$/.test(x.played_on) &&
      ['A', 'B'].includes(String(x.serving_side)) &&
      Array.isArray(x.participants) &&
      x.participants.length >= 2 &&
      x.participants.length <= 100 &&
      x.participants.every(
        (p) =>
          isObject(p) &&
          uuid(p.player_id) &&
          ['A', 'B'].includes(String(p.side)) &&
          Object.keys(p).length === 2
      ) &&
      x.participants.some((p) => p.side === 'A') &&
      x.participants.some((p) => p.side === 'B') &&
      new Set(x.participants.map((p) => (p as { player_id: string }).player_id)).size ===
        x.participants.length &&
      Object.keys(x).length === 4
    );
  if (!Number.isInteger(x.version) || Number(x.version) < 1) return false;
  return v.operation === 'reactivate_player'
    ? Object.keys(x).length === 2
    : Object.keys(x).length === 4 &&
        validScore(x.score_a) &&
        validScore(x.score_b) &&
        (v.operation !== 'finish_match' || canFinish(x.score_a, x.score_b));
}
export function validLocal(v: unknown): v is LocalState {
  if (
    !isObject(v) ||
    v.schema !== 2 ||
    !(v.base === null || validSnapshot(v.base)) ||
    !Array.isArray(v.queue) ||
    v.queue.length > 5000 ||
    !v.queue.every(validCommand) ||
    new Set(v.queue.map((c) => c.request_id)).size !== v.queue.length ||
    (v.base === null && v.queue.length > 0) ||
    !Array.isArray(v.presence) ||
    !v.presence.every(uuid)
  )
    return false;
  if (
    !Array.isArray(v.legacyPending) ||
    !v.legacyPending.every(
      (p) =>
        isObject(p) &&
        uuid(p.request_id) &&
        isObject(p.input) &&
        (p.action === 'import' || (p.action === 'mutate' && typeof p.operation === 'string'))
    )
  )
    return false;
  if (
    v.lease !== null &&
    (!isObject(v.lease) || typeof v.lease.owner !== 'string' || !Number.isFinite(v.lease.until))
  )
    return false;
  if (
    v.draft !== null &&
    (!isObject(v.draft) ||
      !Array.isArray(v.draft.A) ||
      !Array.isArray(v.draft.B) ||
      !v.draft.A.every(uuid) ||
      !v.draft.B.every(uuid) ||
      new Set([...v.draft.A, ...v.draft.B]).size !== v.draft.A.length + v.draft.B.length ||
      !['A', 'B'].includes(String(v.draft.servingSide)))
  )
    return false;
  return (
    v.deactivation === null ||
    (isObject(v.deactivation) &&
      uuid(v.deactivation.request_id) &&
      isObject(v.deactivation.input) &&
      uuid(v.deactivation.input.id) &&
      Number.isInteger(v.deactivation.input.version) &&
      Number(v.deactivation.input.version) > 0 &&
      Object.keys(v.deactivation.input).length === 2 &&
      Object.keys(v.deactivation).length === 3 &&
      typeof v.deactivation.uncertain === 'boolean')
  );
}
export function project(state: LocalState): Snapshot | null {
  if (!state.base) return null;
  const snapshot = structuredClone(state.base);
  for (const command of state.queue) {
    const x = command.input;
    const id = String(x.id);
    if (command.operation === 'create_player') {
      if (!snapshot.players.some((p) => p.id === id))
        snapshot.players.push({ id, name: String(x.name), version: 1, deleted_at: null });
    } else if (command.operation === 'reactivate_player') {
      const p = snapshot.players.find((p) => p.id === id);
      if (p) {
        p.deleted_at = null;
        p.version = Number(x.version) + 1;
      }
    } else if (command.operation === 'start_match') {
      if (!snapshot.matches.some((m) => m.id === id))
        snapshot.matches.unshift({
          id,
          number: null,
          version: 1,
          played_on: String(x.played_on),
          status: 'in_progress',
          score_a: null,
          score_b: null,
          winner: null,
          serving_side: x.serving_side as Side,
          legacy_result: false,
          deleted_at: null,
          participants: (x.participants as { player_id: string; side: Side }[]).map(
            (p, position) => ({
              ...p,
              position,
              name: snapshot.players.find((player) => player.id === p.player_id)?.name ?? 'Jogador',
            })
          ),
        });
    } else {
      const m = snapshot.matches.find((m) => m.id === id);
      // A remote finalized result is authoritative and can never become editable again.
      // The stale intent stays in the journal for explicit conflict recovery.
      if (m && m.status !== 'finished' && !m.deleted_at) {
        m.score_a = Number(x.score_a);
        m.score_b = Number(x.score_b);
        m.version = Number(x.version) + 1;
        m.legacy_result = false;
        if (command.operation === 'finish_match') {
          m.status = 'finished';
          m.winner = scoreWinner(m.score_a, m.score_b);
        }
      }
    }
  }
  return snapshot;
}
export function standings(snapshot: Snapshot) {
  const rows = new Map(
    snapshot.players.map((p) => [p.id, { id: p.id, name: p.name, points: 0, wins: 0, losses: 0 }])
  );
  for (const m of snapshot.matches) {
    if (m.status !== 'finished' || !m.winner || m.deleted_at) continue;
    for (const p of m.participants) {
      const row = rows.get(p.player_id) ?? {
        id: p.player_id,
        name: p.name,
        points: 0,
        wins: 0,
        losses: 0,
      };
      if (m.winner === p.side) {
        row.points++;
        row.wins++;
      } else row.losses++;
      rows.set(p.player_id, row);
    }
  }
  return [...rows.values()]
    .filter(
      (r) => snapshot.players.some((p) => p.id === r.id && !p.deleted_at) || r.wins + r.losses > 0
    )
    .sort(
      (a, b) =>
        b.points - a.points || a.name.localeCompare(b.name, 'pt-BR') || a.id.localeCompare(b.id)
    );
}
export function discardedDependents(queue: Command[], requestId: string): Command[] {
  const first = queue.findIndex((c) => c.request_id === requestId);
  if (first < 0) return [];
  const ids = new Set<string>();
  const discarded: Command[] = [];
  for (let i = first; i < queue.length; i++) {
    const c = queue[i];
    const dependencies =
      c.operation === 'start_match'
        ? (c.input.participants as { player_id: string }[]).map((p) => p.player_id)
        : [];
    if (i === first || ids.has(String(c.input.id)) || dependencies.some((id) => ids.has(id))) {
      discarded.push(c);
      ids.add(String(c.input.id));
    }
  }
  return discarded;
}
