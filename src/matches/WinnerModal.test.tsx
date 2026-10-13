import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { WinnerModal } from './WinnerModal';

describe('US1.5 — Modal de vencedor (cenários BDD, M4, BR5.1)', () => {
  it('AC1.5.1: Given partida finalizada, When escolho o Time A e confirmo, Then o vencedor sai como A', async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    render(<WinnerModal onPick={onPick} onCancel={() => {}} />);
    await user.click(screen.getByTestId('matches-winner-a-button'));
    await user.click(screen.getByTestId('matches-winner-confirm-button'));
    expect(onPick).toHaveBeenCalledWith('A');
  });

  it('AC1.5.1: Given modal, When escolho o Time B e confirmo, Then o vencedor sai como B', async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    render(<WinnerModal onPick={onPick} onCancel={() => {}} />);
    await user.click(screen.getByTestId('matches-winner-b-button'));
    await user.click(screen.getByTestId('matches-winner-confirm-button'));
    expect(onPick).toHaveBeenCalledWith('B');
  });

  it('AC1.5.2: Given modal de vencedor, When cancelo, Then nada é pontuado e a partida segue sem vencedor', async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    const onCancel = vi.fn();
    render(<WinnerModal onPick={onPick} onCancel={onCancel} />);
    await user.click(screen.getByTestId('matches-winner-cancel-button'));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onPick).not.toHaveBeenCalled();
  });

  it('BR5.1: Given modal aberto, When nada foi escolhido, Then Confirmar fica bloqueado', () => {
    render(<WinnerModal onPick={() => {}} onCancel={() => {}} />);
    expect(screen.getByTestId('matches-winner-confirm-button')).toBeDisabled();
  });

  it('a11y/M4: o modal usa dialog com título "Vencedor" e botões Time A/B', () => {
    render(<WinnerModal onPick={() => {}} onCancel={() => {}} />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Vencedor')).toBeInTheDocument();
    expect(screen.getByTestId('matches-winner-a-button')).toBeInTheDocument();
    expect(screen.getByTestId('matches-winner-b-button')).toBeInTheDocument();
  });

  it('M4: Escape cancela sem pontuar', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(<WinnerModal onPick={() => {}} onCancel={onCancel} />);
    await user.keyboard('{Escape}');
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
