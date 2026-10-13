import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { RosterScreen } from './RosterScreen';
import type { Player } from './types';

function renderRoster(initial: Player[] = [], notice: string | null = null) {
  const onPlayersChange = vi.fn();
  const onDraw = vi.fn();
  const onBack = vi.fn();
  function Harness() {
    const [players, setPlayers] = useState(initial);
    return (
      <RosterScreen
        players={players}
        notice={notice}
        onPlayersChange={(next) => {
          setPlayers(next);
          onPlayersChange(next);
        }}
        onDraw={onDraw}
        onBack={onBack}
      />
    );
  }
  render(<Harness />);
  return { onPlayersChange, onDraw };
}

describe('RosterScreen — comportamento (US1.2)', () => {
  it('elenco vazio mostra orientação de primeiro cadastro', () => {
    renderRoster();
    expect(screen.getByTestId('roster-empty')).toHaveTextContent(/primeiro jogador/i);
    expect(screen.getByTestId('roster-name-input')).toHaveFocus();
  });

  it('cadastrar nome válido adiciona o chip na lista', async () => {
    const user = userEvent.setup();
    renderRoster();
    await user.type(screen.getByTestId('roster-name-input'), 'Lana');
    await user.click(screen.getByTestId('roster-add-button'));
    expect(screen.getByRole('button', { name: 'Lana' })).toBeInTheDocument();
  });

  it('duplicata mostra aviso e não duplica', async () => {
    const user = userEvent.setup();
    renderRoster([{ name: 'Lana', present: false }]);
    await user.type(screen.getByTestId('roster-name-input'), 'Lana');
    await user.click(screen.getByTestId('roster-add-button'));
    expect(screen.getByTestId('roster-error')).toHaveTextContent(/já está cadastrado/i);
    expect(screen.getAllByRole('button', { name: 'Lana' })).toHaveLength(1);
  });

  it('nome vazio mostra "informe um nome"', async () => {
    const user = userEvent.setup();
    renderRoster();
    await user.type(screen.getByTestId('roster-name-input'), '   ');
    await user.click(screen.getByTestId('roster-add-button'));
    expect(screen.getByTestId('roster-error')).toHaveTextContent(/informe um nome/i);
  });

  it('blur com nome inválido mostra erro inline abaixo do campo', async () => {
    const user = userEvent.setup();
    renderRoster([{ name: 'Lana', present: false }]);
    await user.type(screen.getByTestId('roster-name-input'), 'Lana');
    await user.tab();
    expect(screen.getByTestId('roster-error')).toBeInTheDocument();
  });

  it('toque no chip alterna presença com aria-pressed', async () => {
    const user = userEvent.setup();
    renderRoster([{ name: 'Lana', present: false }]);
    const chip = screen.getByRole('button', { name: 'Lana' });
    expect(chip).toHaveAttribute('aria-pressed', 'false');
    await user.click(chip);
    expect(screen.getByRole('button', { name: 'Lana' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('roster-present-count')).toHaveTextContent(/1 presente/);
  });

  it('sortear desabilitado com menos de 2 presentes e mensagem de orientação', () => {
    renderRoster([{ name: 'Lana', present: true }]);
    expect(screen.getByTestId('roster-draw-button')).toBeDisabled();
    expect(screen.getByTestId('roster-draw-hint')).toHaveTextContent(/pelo menos 2 presentes/i);
  });

  it('sortear habilitado com 2+ presentes e dispara onDraw', async () => {
    const user = userEvent.setup();
    const { onDraw } = renderRoster([
      { name: 'Lana', present: true },
      { name: 'Bia', present: true },
    ]);
    const button = screen.getByTestId('roster-draw-button');
    expect(button).toBeEnabled();
    await user.click(button);
    expect(onDraw).toHaveBeenCalledTimes(1);
  });
});
