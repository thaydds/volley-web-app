import { describe, expect, it } from 'vitest';
import {
  emptyState,
  canonicalName,
  displayName,
  validScore,
  parseScore,
  canFinish,
  scoreWinner,
  validPlayer,
  validGame,
  validCommand,
  validLocal,
  validSnapshot,
  project,
  standings,
  discardedDependents,
  today,
  type Command,
  type Game,
  type Snapshot,
} from './domain';
const a = '11111111-1111-4111-8111-111111111111';
const b = '22222222-2222-4222-8222-222222222222';
const c = '33333333-3333-4333-8333-333333333333';
const m = '44444444-4444-4444-8444-444444444444';
const players = [
  { id: a, name: 'Ana', version: 1, deleted_at: null },
  { id: b, name: 'Bia', version: 1, deleted_at: null },
];
const game: Game = {
  id: m,
  number: 1,
  version: 1,
  played_on: '2026-11-10',
  status: 'in_progress',
  score_a: null,
  score_b: null,
  winner: null,
  legacy_result: false,
  serving_side: 'A',
  deleted_at: null,
  participants: players.map((p, position) => ({
    player_id: p.id,
    name: p.name,
    position,
    side: position === 0 ? 'A' : 'B',
  })),
};
const base = (): Snapshot => ({
  players: structuredClone(players),
  matches: [],
  archived: [],
  syncedAt: '2026-11-10T10:00:00Z',
  revision: '0',
});
const command = (operation: Command['operation'], input: Command['input']): Command => ({
  request_id: crypto.randomUUID(),
  operation,
  input,
  createdAt: '2026-11-10T10:00:00Z',
});
const start = () =>
  command('start_match', {
    id: m,
    played_on: '2026-11-10',
    serving_side: 'B',
    participants: [
      { player_id: a, side: 'A' },
      { player_id: b, side: 'B' },
    ],
  });
describe('score and identity contracts', () => {
  it('normalizes display/canonical names while preserving historical identity', () => {
    expect(displayName('  Ana \t Maria  ')).toBe('Ana Maria');
    expect(canonicalName(' ÁNA   MARIA ')).toBe('ána maria');
    expect(today()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(validPlayer(players[0])).toBe(true);
    expect(validPlayer({ ...players[0], name: '🏐'.repeat(30) })).toBe(true);
    for (const p of [
      null,
      {},
      { ...players[0], id: 'Ana' },
      { ...players[0], version: 0 },
      { ...players[0], name: 'a'.repeat(31) },
    ])
      expect(validPlayer(p)).toBe(false);
  });
  it.each(['', '-1', '2.5', 'NaN', ' 3', '3 ', '2147483648', '1e3'])(
    'rejects ambiguous/invalid score %j',
    (value) => {
      expect(parseScore(value)).toBeNull();
    }
  );
  it('accepts zero and bounded integers; never allows a tied winner', () => {
    expect(parseScore('0')).toBe(0);
    expect(parseScore('0003')).toBe(3);
    expect(validScore(2147483647)).toBe(true);
    expect(validScore('3')).toBe(false);
    expect(canFinish(0, 1)).toBe(true);
    expect(canFinish(null, 1)).toBe(false);
    expect(canFinish(3, 3)).toBe(false);
    expect(scoreWinner(0, 3)).toBe('B');
    expect(scoreWinner(21, 18)).toBe('A');
    expect(() => scoreWinner(2, 2)).toThrow('invalid_score');
  });
  it('validates finished scores but preserves legacy winners with unknown scores', () => {
    expect(validGame(game)).toBe(true);
    const finished = { ...game, status: 'finished', score_a: 21, score_b: 18, winner: 'A' };
    expect(validGame(finished)).toBe(true);
    expect(validGame({ ...finished, winner: 'B' })).toBe(false);
    expect(validGame({ ...finished, score_a: 18 })).toBe(false);
    expect(validGame({ ...finished, score_a: null, score_b: null, legacy_result: true })).toBe(
      true
    );
    for (const invalid of [
      { ...game, number: null },
      { ...game, participants: [] },
      { ...game, participants: [game.participants[0], game.participants[0]] },
      { ...game, participants: game.participants.map((p) => ({ ...p, side: 'A' })) },
    ])
      expect(validGame(invalid)).toBe(false);
  });
  it('rejects malformed intents before persistence or network delivery', () => {
    expect(validCommand(command('create_player', { id: c, name: 'Cris' }))).toBe(true);
    expect(validCommand(command('reactivate_player', { id: c, version: 2 }))).toBe(true);
    expect(validCommand(start())).toBe(true);
    expect(validCommand(command('save_score', { id: m, version: 1, score_a: 0, score_b: 0 }))).toBe(
      true
    );
    expect(
      validCommand(command('finish_match', { id: m, version: 1, score_a: 21, score_b: 18 }))
    ).toBe(true);
    for (const invalid of [
      null,
      command('create_player', { id: c, name: '', admin: true }),
      command('reactivate_player', { id: c, version: 0 }),
      command('finish_match', { id: m, version: 1, score_a: 2, score_b: 2 }),
      { ...start(), createdAt: 'invalid' },
      { ...start(), error: 'unknown' },
    ])
      expect(validCommand(invalid)).toBe(false);
    expect(
      validCommand({
        ...start(),
        input: {
          ...start().input,
          participants: [
            { player_id: a, side: 'A' },
            { player_id: b, side: 'A' },
          ],
        },
      })
    ).toBe(false);
  });
});
describe('durable journal projection', () => {
  it('projects ordered dependencies without mutating the server snapshot, then locks a local final', () => {
    const state = emptyState();
    expect(project(state)).toBeNull();
    state.base = base();
    state.queue = [
      command('create_player', { id: c, name: 'Cris' }),
      start(),
      command('save_score', { id: m, version: 1, score_a: 0, score_b: 0 }),
      command('finish_match', { id: m, version: 2, score_a: 21, score_b: 18 }),
    ];
    const projected = project(state)!;
    expect(projected.players).toHaveLength(3);
    expect(projected.matches[0]).toMatchObject({
      id: m,
      number: null,
      version: 3,
      status: 'finished',
      winner: 'A',
      serving_side: 'B',
      score_a: 21,
    });
    expect(state.base).toEqual(base());
    // A server acknowledgement can already be in the snapshot after a crash.
    state.base.matches = [
      { ...game, score_a: 21, score_b: 18, status: 'finished', winner: 'A', version: 3 },
    ];
    expect(project(state)!.matches).toHaveLength(1);
    expect(project(state)!.matches[0]).toMatchObject({
      version: 3,
      score_a: 21,
      status: 'finished',
    });
  });
  it('never makes a remotely finalized match editable through an older local save', () => {
    const state = emptyState();
    state.base = base();
    state.base.matches = [
      { ...game, status: 'finished', winner: 'B', score_a: 18, score_b: 21, version: 3 },
    ];
    state.queue = [command('save_score', { id: m, version: 1, score_a: 25, score_b: 19 })];
    expect(project(state)!.matches[0]).toMatchObject({
      status: 'finished',
      winner: 'B',
      score_a: 18,
      version: 3,
    });
    expect(state.queue).toHaveLength(1);
  });
  it('projects explicit reactivation with the captured version and historical UUID', () => {
    const state = emptyState();
    state.base = base();
    state.base.players[0].deleted_at = '2026-11-10';
    state.queue = [command('reactivate_player', { id: a, version: 2 })];
    expect(project(state)!.players[0]).toMatchObject({ id: a, deleted_at: null, version: 3 });
    state.queue.push(command('save_score', { id: m, version: 1, score_a: 21, score_b: 18 }));
    expect(project(state)!.matches).toEqual([]);
  });
  it('drops only transitive dependents after an explicitly selected conflict', () => {
    const create = command('create_player', { id: c, name: 'Cris' });
    const match = start();
    match.input.participants = [
      { player_id: c, side: 'A' },
      { player_id: b, side: 'B' },
    ];
    const save = command('save_score', { id: m, version: 1, score_a: 21, score_b: 18 });
    const unrelated = command('create_player', { id: crypto.randomUUID(), name: 'Dani' });
    const queue = [create, unrelated, match, save];
    expect(discardedDependents(queue, create.request_id)).toEqual([create, match, save]);
    expect(discardedDependents(queue, match.request_id)).toEqual([match, save]);
    expect(discardedDependents(queue, 'missing')).toEqual([]);
    expect(queue).toHaveLength(4);
  });
  it('counts UUID-based finished results, including deactivated players but excluding archives/live games', () => {
    const snapshot = base();
    snapshot.players[0].deleted_at = '2026-11-10';
    snapshot.players.push({ id: c, name: 'Ana', version: 1, deleted_at: '2026-11-10' });
    snapshot.matches = [
      game,
      { ...game, id: crypto.randomUUID(), status: 'finished', legacy_result: true, winner: 'A' },
      {
        ...game,
        id: crypto.randomUUID(),
        status: 'finished',
        winner: 'B',
        score_a: 18,
        score_b: 21,
        deleted_at: '2026-11-10',
      },
    ];
    expect(standings(snapshot)).toEqual([
      { id: a, name: 'Ana', points: 1, wins: 1, losses: 0 },
      { id: b, name: 'Bia', points: 0, wins: 0, losses: 1 },
    ]);
    snapshot.players = [];
    expect(standings(snapshot)).toHaveLength(2);
    snapshot.players = players;
    snapshot.matches = [];
    expect(standings(snapshot).map((p) => p.name)).toEqual(['Ana', 'Bia']);
  });
  it('rejects corrupt storage rather than replacing it with an empty dataset', () => {
    const state = emptyState();
    expect(validLocal(state)).toBe(true);
    state.base = base();
    expect(validSnapshot(state.base)).toBe(true);
    state.queue = [start()];
    expect(validLocal(state)).toBe(true);
    const bad = [
      { ...state, schema: 3 },
      { ...state, base: { ...base(), revision: 'NaN' } },
      { ...state, queue: [start(), start(), null] },
      { ...state, presence: ['Ana'] },
      { ...state, draft: { A: [a], B: [a], servingSide: 'A' } },
      {
        ...state,
        deactivation: {
          request_id: a,
          input: { id: a, version: 1 },
          uncertain: true,
          word: 'never-store',
        },
      },
      { ...state, legacyPending: [{}] },
      { ...state, lease: { owner: a, until: NaN } },
    ];
    for (const value of bad) expect(validLocal(value)).toBe(false);
    const head = start();
    expect(validLocal({ ...state, queue: [head, head] })).toBe(false);
    expect(
      validLocal({
        ...state,
        draft: { A: [a], B: [b], servingSide: 'B' },
        deactivation: { request_id: a, input: { id: a, version: 1 }, uncertain: true },
        lease: { owner: a, until: Date.now() },
      })
    ).toBe(true);
  });
});
