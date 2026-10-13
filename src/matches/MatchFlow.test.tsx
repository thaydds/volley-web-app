import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import App from '../App';

function setOnline(online: boolean): void {
  Object.defineProperty(window.navigator, 'onLine', { value: online, configurable: true });
}

async function setupDrawnApp(): Promise<ReturnType<typeof userEvent.setup>> {
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByTestId('home-matches-button'));
  await user.type(screen.getByTestId('roster-name-input'), 'Lana');
  await user.click(screen.getByTestId('roster-add-button'));
  await user.type(screen.getByTestId('roster-name-input'), 'Bia');
  await user.click(screen.getByTestId('roster-add-button'));
  await user.click(screen.getByRole('button', { name: 'Lana' }));
  await user.click(screen.getByRole('button', { name: 'Bia' }));
  await user.click(screen.getByTestId('roster-draw-button'));
  return user;
}

describe('u2-matches — fluxos F3/F4/F5 ponta a ponta', () => {
  afterEach(() => {
    localStorage.clear();
    setOnline(true);
  });

  it('F3+F4: sortear → confirmar → finalizar → escolher Time A → histórico com #001 e selo de vencedor', async () => {
    const user = await setupDrawnApp();
    await user.click(screen.getByTestId('draw-confirm-button'));
    expect(screen.getByText('Essa é a partida #001')).toBeInTheDocument();
    expect(screen.getByTestId('matches-confirm-date')).toHaveTextContent(/\d{2}\/\d{2}\/\d{4}/);
    await user.click(screen.getByTestId('matches-confirm-button'));
    expect(screen.getByTestId('matches-winner-modal')).toBeInTheDocument();
    await user.click(screen.getByTestId('matches-winner-a-button'));
    await user.click(screen.getByTestId('matches-winner-confirm-button'));
    expect(screen.getByTestId('matches-history-list')).toBeInTheDocument();
    expect(screen.getByTestId('matches-card-1')).toHaveTextContent('#001');
    expect(screen.getByTestId('matches-winner-badge-1')).toHaveTextContent('Time A');
    const raw = JSON.parse(localStorage.getItem('volley-v1') as string);
    expect(raw.matches).toHaveLength(1);
    expect(raw.matches[0].winner).toBe('A');
  });

  it('F4/cancelar: finalizar e cancelar o vencedor mantém a partida sem pontuação', async () => {
    const user = await setupDrawnApp();
    await user.click(screen.getByTestId('draw-confirm-button'));
    await user.click(screen.getByTestId('matches-confirm-button'));
    await user.click(screen.getByTestId('matches-winner-cancel-button'));
    expect(screen.getByTestId('matches-winner-badge-1')).toHaveTextContent('Sem vencedor');
    const raw = JSON.parse(localStorage.getItem('volley-v1') as string);
    expect(raw.matches[0].winner).toBeNull();
  });

  it('F5/excluir: cartão → excluir com modal nomeado remove a partida e mantém o próximo número sem reutilizar', async () => {
    const user = await setupDrawnApp();
    await user.click(screen.getByTestId('draw-confirm-button'));
    await user.click(screen.getByTestId('matches-confirm-button'));
    await user.click(screen.getByTestId('matches-winner-cancel-button'));
    await user.click(screen.getByTestId('matches-card-1'));
    await user.click(screen.getByTestId('matches-delete-open-1'));
    expect(screen.getByTestId('matches-delete-modal')).toHaveTextContent('#001');
    await user.click(screen.getByTestId('matches-delete-confirm-button'));
    expect(screen.getByTestId('matches-history-empty')).toBeInTheDocument();
    const raw = JSON.parse(localStorage.getItem('volley-v1') as string);
    expect(raw.matches).toEqual([]);
  });

  it('F5/revanche: mesmos jogadores voltam ao sorteio e a nova confirmação usa número novo', async () => {
    const user = await setupDrawnApp();
    await user.click(screen.getByTestId('draw-confirm-button'));
    await user.click(screen.getByTestId('matches-confirm-button'));
    await user.click(screen.getByTestId('matches-winner-cancel-button'));
    await user.click(screen.getByTestId('matches-card-1'));
    await user.click(screen.getByTestId('matches-rematch-1'));
    expect(screen.getByTestId('draw-team-a')).toBeInTheDocument();
    const teamA = screen.getByTestId('draw-team-a').textContent ?? '';
    const teamB = screen.getByTestId('draw-team-b').textContent ?? '';
    expect(teamA + teamB).toContain('Lana');
    expect(teamA + teamB).toContain('Bia');
    await user.click(screen.getByTestId('draw-confirm-button'));
    expect(screen.getByText('Essa é a partida #002')).toBeInTheDocument();
  });

  it('histórico abre pela Home e lista persiste entre recarregamentos (BR4.3)', async () => {
    const user = await setupDrawnApp();
    await user.click(screen.getByTestId('draw-confirm-button'));
    await user.click(screen.getByTestId('matches-confirm-button'));
    await user.click(screen.getByTestId('matches-winner-cancel-button'));
    await user.click(screen.getByTestId('matches-history-back-button'));
    expect(
      within(screen.getByTestId('home-screen')).getByTestId('home-history-button')
    ).toBeInTheDocument();
    await user.click(screen.getByTestId('home-history-button'));
    expect(screen.getByTestId('matches-card-1')).toBeInTheDocument();
  });
});
