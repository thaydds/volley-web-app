import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DrawScreen } from './DrawScreen';

const teams = { A: ['Lana', 'Bia'], B: ['Ana', 'Mia'] };

function renderDraw() {
  const onMove = vi.fn();
  const onRedraw = vi.fn();
  const onConfirm = vi.fn();
  const onBack = vi.fn();
  render(
    <DrawScreen
      teams={teams}
      presentCount={4}
      onMove={onMove}
      onRedraw={onRedraw}
      onConfirm={onConfirm}
      onBack={onBack}
    />
  );
  return { onMove, onRedraw, onConfirm, onBack };
}

describe('DrawScreen — comportamento (US1.3)', () => {
  it('renderiza Time A e Time B com todos os membros', () => {
    renderDraw();
    expect(screen.getByTestId('draw-team-a')).toHaveTextContent('Lana');
    expect(screen.getByTestId('draw-team-a')).toHaveTextContent('Bia');
    expect(screen.getByTestId('draw-team-b')).toHaveTextContent('Ana');
    expect(screen.getByTestId('draw-team-b')).toHaveTextContent('Mia');
  });

  it('contador de presentes visível', () => {
    renderDraw();
    expect(screen.getByTestId('draw-present-count')).toHaveTextContent(/4 presentes/i);
  });

  it('membros são apenas o nome, sem botão de mover', () => {
    renderDraw();
    const members = screen.getAllByTestId('draw-team-member');
    expect(members).toHaveLength(4);
    members.forEach((member) => {
      expect(member.textContent).toBe(member.getAttribute('data-player-name'));
    });
    expect(screen.queryByRole('button', { name: /^Mover / })).toBeNull();
  });

  it('cada time é uma área de soltura para arrastar jogadores', () => {
    renderDraw();
    expect(screen.getByTestId('draw-team-a')).toHaveAttribute('data-drop-target', 'false');
    expect(screen.getByTestId('draw-team-b')).toHaveAttribute('data-drop-target', 'false');
  });

  it('sortear novamente dispara onRedraw', async () => {
    const user = userEvent.setup();
    const { onRedraw } = renderDraw();
    await user.click(screen.getByTestId('draw-redraw-button'));
    expect(onRedraw).toHaveBeenCalledTimes(1);
  });

  it('voltar dispara onBack', async () => {
    const user = userEvent.setup();
    const { onBack } = renderDraw();
    expect(screen.getByTestId('draw-back-button')).toHaveAccessibleName('Voltar ao elenco');
    await user.click(screen.getByTestId('draw-back-button'));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
