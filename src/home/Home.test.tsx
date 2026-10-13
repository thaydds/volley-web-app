import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Home } from './Home';

function renderHome() {
  const onMatches = vi.fn();
  const onRanking = vi.fn();
  const onHistory = vi.fn();
  render(<Home onMatches={onMatches} onRanking={onRanking} onHistory={onHistory} />);
  return { onMatches, onRanking, onHistory };
}

describe('US1.1 — Home (cenários BDD)', () => {
  it('AC1.1.1: Partidas leva ao elenco', async () => {
    const user = userEvent.setup();
    const { onMatches } = renderHome();
    await user.click(screen.getByTestId('home-matches-button'));
    expect(onMatches).toHaveBeenCalledTimes(1);
  });

  it('AC1.1.2: Ranking leva à tabela', async () => {
    const user = userEvent.setup();
    const { onRanking } = renderHome();
    await user.click(screen.getByTestId('home-ranking-button'));
    expect(onRanking).toHaveBeenCalledTimes(1);
  });

  it('BR3.1: Home expõe só Partidas e Ranking — sem Cartas/Config', () => {
    renderHome();
    expect(screen.queryByText(/^cartas$/i)).toBeNull();
    expect(screen.queryByLabelText(/configura/i)).toBeNull();
    expect(screen.getByTestId('home-matches-button')).toBeInTheDocument();
    expect(screen.getByTestId('home-ranking-button')).toBeInTheDocument();
  });

  it('cartão Montar o time leva ao elenco', async () => {
    const user = userEvent.setup();
    const { onMatches } = renderHome();
    await user.click(screen.getByTestId('home-montar-time'));
    expect(onMatches).toHaveBeenCalledTimes(1);
  });

  it('BR3.5: todo interativo tem nome acessível', () => {
    const { container } = render(
      <Home onMatches={vi.fn()} onRanking={vi.fn()} onHistory={vi.fn()} />
    );
    const interactives = container.querySelectorAll('button');
    expect(interactives.length).toBeGreaterThan(0);
    interactives.forEach((el) => {
      const name = (el.getAttribute('aria-label') ?? el.textContent ?? '').trim();
      expect(name).not.toBe('');
    });
  });
});
