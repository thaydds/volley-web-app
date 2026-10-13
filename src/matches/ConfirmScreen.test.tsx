import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmScreen } from './ConfirmScreen';

const teams = { A: ['Lana', 'Bia'], B: ['Ana', 'Duda'] };

describe('US1.4 — Tela de confirmação (cenários BDD, M4)', () => {
  it('AC1.4.1: Given times prontos, When abro a confirmação, Then vejo número, data e os dois times', () => {
    render(
      <ConfirmScreen
        number={1}
        date="12/10/2026"
        teams={teams}
        onConfirm={() => {}}
        onBack={() => {}}
      />
    );
    expect(screen.getByText('Essa é a partida #001')).toBeInTheDocument();
    expect(screen.getByText('12/10/2026')).toBeInTheDocument();
    expect(screen.getByTestId('confirm-team-a')).toHaveTextContent('Lana');
    expect(screen.getByTestId('confirm-team-b')).toHaveTextContent('Duda');
  });

  it('nomes dos times usam o chip azul selecionado, igual ao passo anterior', () => {
    render(
      <ConfirmScreen
        number={1}
        date="12/10/2026"
        teams={teams}
        onConfirm={() => {}}
        onBack={() => {}}
      />
    );
    const members = screen.getAllByTestId('confirm-team-member');
    expect(members).toHaveLength(4);
    members.forEach((member) => {
      expect(member).toHaveClass('player-chip');
      expect(member).toHaveClass('player-chip--present');
      expect(member).toHaveAttribute('data-selected', 'true');
      // The name lives in the same span the roster and draw screens use.
      expect(member.querySelector('.player-chip__name')).not.toBeNull();
    });
  });

  it('F3: Given confirmação, When toco em Finalizar Partida, Then o registro acontece', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(
      <ConfirmScreen
        number={2}
        date="12/10/2026"
        teams={teams}
        onConfirm={onConfirm}
        onBack={() => {}}
      />
    );
    await user.click(screen.getByTestId('matches-confirm-button'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('C1/empty-teams: Given times vazios, When vejo a confirmação, Then Finalizar fica bloqueado', () => {
    render(
      <ConfirmScreen
        number={1}
        date="12/10/2026"
        teams={{ A: [], B: [] }}
        onConfirm={() => {}}
        onBack={() => {}}
      />
    );
    expect(screen.getByTestId('matches-confirm-button')).toBeDisabled();
  });

  it('F3: Given confirmação, When volto, Then o gatilho de voltar existe e é testável', async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();
    render(
      <ConfirmScreen
        number={1}
        date="12/10/2026"
        teams={teams}
        onConfirm={() => {}}
        onBack={onBack}
      />
    );
    await user.click(screen.getByTestId('matches-confirm-back-button'));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('a11y: a tela anuncia o cabeçalho como título', () => {
    render(
      <ConfirmScreen
        number={1}
        date="12/10/2026"
        teams={teams}
        onConfirm={() => {}}
        onBack={() => {}}
      />
    );
    expect(screen.getByRole('heading', { name: /partida #001/i })).toBeInTheDocument();
  });
});
