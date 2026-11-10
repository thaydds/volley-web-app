import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MatchPanel } from './MatchPanel';
import { initialScore } from './sessionScores';
import type { Game } from './domain';
const game: Game = {
  id: '11111111-1111-4111-8111-111111111111',
  number: 1,
  version: 1,
  status: 'in_progress',
  score_a: null,
  score_b: null,
  winner: null,
  serving_side: 'A',
  legacy_result: false,
  deleted_at: null,
  played_on: '2026-11-10',
  participants: [],
};
function Controlled({
  value = game,
  onFinish = () => {},
}: {
  value?: Game;
  onFinish?: (a: number, b: number) => void;
}) {
  const [draft, setDraft] = useState(() => initialScore(value));
  return (
    <MatchPanel
      game={value}
      pending={false}
      detail
      draft={draft}
      onDraftChange={(patch) => setDraft((previous) => ({ ...previous, ...patch }))}
      onFinish={onFinish}
    />
  );
}
describe('session score following', () => {
  it('only calls finalization explicitly; no save action, and tied/invalid values cannot finalize', () => {
    const finish = vi.fn();
    render(<Controlled onFinish={finish} />);
    expect(screen.queryByRole('button', { name: 'Salvar placar' })).toBeNull();
    const action = screen.getByRole('button', { name: 'Finalizar partida' });
    expect(action).toBeDisabled();
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Placar Time A' }), {
      target: { value: '21' },
    });
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Placar Time B' }), {
      target: { value: '18' },
    });
    expect(finish).not.toHaveBeenCalled();
    expect(action).toBeEnabled();
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Placar Time B' }), {
      target: { value: '100' },
    });
    expect(action).toBeDisabled();
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Placar Time B' }), {
      target: { value: '18' },
    });
    fireEvent.click(action);
    expect(finish).toHaveBeenCalledWith(21, 18);
  });
  it('preserves an old out-of-range provisional score until manually corrected', () => {
    render(<Controlled value={{ ...game, score_a: 123, score_b: 18 }} />);
    expect(screen.getByRole('spinbutton', { name: 'Placar Time A' })).toHaveValue('123');
    expect(screen.getByRole('spinbutton', { name: 'Placar Time A' })).toHaveAttribute(
      'aria-invalid',
      'true'
    );
    expect(screen.getByRole('button', { name: 'Finalizar partida' })).toBeDisabled();
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Placar Time A' }), {
      target: { value: '23' },
    });
    expect(screen.getByRole('button', { name: 'Finalizar partida' })).toBeEnabled();
  });
  it('finalized games contain only numbers and no editable counters', () => {
    render(
      <Controlled value={{ ...game, status: 'finished', winner: 'A', score_a: 21, score_b: 18 }} />
    );
    expect(screen.queryAllByRole('spinbutton')).toHaveLength(0);
    expect(screen.queryByRole('button', { name: 'Finalizar partida' })).toBeNull();
    expect(screen.getByText('21')).toBeVisible();
  });
});
