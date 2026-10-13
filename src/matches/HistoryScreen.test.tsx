import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DeleteModal } from './DeleteModal';
import { HistoryScreen } from './HistoryScreen';
import type { Match } from './types';

function matches(): Match[] {
  return [
    { number: 1, date: '12/10/2026', teamA: ['Lana', 'Bia'], teamB: ['Ana', 'Duda'], winner: 'A' },
    { number: 2, date: '12/10/2026', teamA: ['Lana'], teamB: ['Bia'], winner: null },
  ];
}

describe('US1.7 — Histórico, exclusão e revanche (cenários BDD, M5)', () => {
  it('AC1.7.1: Given histórico com partidas, When abro um cartão, Then vejo data e os dois times', async () => {
    const user = userEvent.setup();
    render(
      <HistoryScreen
        matches={matches()}
        onDelete={() => {}}
        onRematch={() => {}}
        onBack={() => {}}
      />
    );
    await user.click(screen.getByTestId('matches-card-1'));
    expect(screen.getByTestId('matches-card-open-1')).toHaveTextContent('12/10/2026');
    expect(screen.getByTestId('matches-card-open-1')).toHaveTextContent('Lana');
    expect(screen.getByTestId('matches-card-open-1')).toHaveTextContent('Duda');
  });

  it('AC1.7.1: Given lista, Then cada cartão mostra número, data e selo do vencedor em verde', () => {
    render(
      <HistoryScreen
        matches={matches()}
        onDelete={() => {}}
        onRematch={() => {}}
        onBack={() => {}}
      />
    );
    expect(screen.getByTestId('matches-card-1')).toHaveTextContent('#001');
    expect(screen.getByTestId('matches-winner-badge-1')).toHaveTextContent('Time A');
    expect(screen.getByTestId('matches-card-2')).toHaveTextContent('Sem vencedor');
  });

  it('AC1.7.2: Given cartão aberto, When excluo com confirmação nomeada, Then a partida some da lista', async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    render(
      <HistoryScreen
        matches={matches()}
        onDelete={onDelete}
        onRematch={() => {}}
        onBack={() => {}}
      />
    );
    await user.click(screen.getByTestId('matches-card-1'));
    await user.click(screen.getByTestId('matches-delete-open-1'));
    expect(screen.getByTestId('matches-delete-modal')).toHaveTextContent('#001');
    expect(screen.getByTestId('matches-delete-modal')).toHaveTextContent('12/10/2026');
    await user.click(screen.getByTestId('matches-delete-confirm-button'));
    expect(onDelete).toHaveBeenCalledWith(1);
  });

  it('BR4.4: Given modal de exclusão, When cancelo, Then nada é removido', async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    render(
      <HistoryScreen
        matches={matches()}
        onDelete={onDelete}
        onRematch={() => {}}
        onBack={() => {}}
      />
    );
    await user.click(screen.getByTestId('matches-card-2'));
    await user.click(screen.getByTestId('matches-delete-open-2'));
    await user.click(screen.getByTestId('matches-delete-cancel-button'));
    expect(onDelete).not.toHaveBeenCalled();
  });

  it('AC1.7.3: Given cartão aberto, When peço revanche, Then a nova partida começa com os mesmos jogadores', async () => {
    const user = userEvent.setup();
    const onRematch = vi.fn();
    render(
      <HistoryScreen
        matches={matches()}
        onDelete={() => {}}
        onRematch={onRematch}
        onBack={() => {}}
      />
    );
    await user.click(screen.getByTestId('matches-card-1'));
    await user.click(screen.getByTestId('matches-rematch-1'));
    expect(onRematch).toHaveBeenCalledWith(matches()[0]);
  });

  it('BR4.3: Given histórico vazio, Then vejo estado vazio amigável', () => {
    render(
      <HistoryScreen matches={[]} onDelete={() => {}} onRematch={() => {}} onBack={() => {}} />
    );
    expect(screen.getByTestId('matches-history-empty')).toBeInTheDocument();
  });

  it('DeleteModal isolado nomeia número e data e exige confirmação explícita', () => {
    render(<DeleteModal match={matches()[0] as Match} onConfirm={() => {}} onCancel={() => {}} />);
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(screen.getByTestId('matches-delete-modal')).toHaveTextContent('#001');
    expect(screen.getByTestId('matches-delete-modal')).toHaveTextContent('12/10/2026');
  });
});
