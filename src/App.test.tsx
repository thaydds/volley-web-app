import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import App from './App';

function setOnline(online: boolean): void {
  Object.defineProperty(window.navigator, 'onLine', { value: online, configurable: true });
}

describe('US1.1 — Navegação do app (cenários BDD)', () => {
  afterEach(() => {
    localStorage.clear();
    setOnline(true);
  });

  it('AC1.1.1: Given Home, When toco em Partidas, Then vejo "Quem veio hoje?"', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByTestId('home-matches-button'));
    expect(screen.getByText('Quem veio hoje?')).toBeInTheDocument();
  });

  it('AC1.1.2: Given Home, When toco em Ranking, Then vejo a tela de ranking', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByTestId('home-ranking-button'));
    // Check that ranking screen is rendered (has the title "Ranking")
    expect(screen.getByText('Ranking')).toBeInTheDocument();
    // Check that the empty state message is shown when no players
    expect(
      screen.getByText('Cadastre jogadores e finalize partidas para ver o ranking.')
    ).toBeInTheDocument();
  });

  it('fluxo F1: Home → Partidas → Sortear → times visíveis → volta ao início', async () => {
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
    expect(screen.getByTestId('draw-team-a')).toBeInTheDocument();
    expect(screen.getByTestId('draw-team-b')).toBeInTheDocument();
    await user.click(screen.getByTestId('draw-back-button'));
    await user.click(screen.getByTestId('roster-back-button'));
    expect(screen.getByTestId('home-matches-button')).toBeInTheDocument();
  });

  it('AC1.1.3/F2: sem rede, banner offline visível e fluxos intactos (BR3.3)', async () => {
    const user = userEvent.setup();
    setOnline(false);
    render(<App />);
    expect(screen.getByTestId('offline-banner')).toBeInTheDocument();
    await user.click(screen.getByTestId('home-matches-button'));
    expect(screen.getByText('Quem veio hoje?')).toBeInTheDocument();
  });

  it('BR3.4: guarda contra rolagem horizontal presente no CSS do shell', () => {
    const css = fs.readFileSync(path.join('src', 'App.css'), 'utf8');
    expect(css).toMatch(/overflow-x\s*:\s*(hidden|clip)/);
  });
});
