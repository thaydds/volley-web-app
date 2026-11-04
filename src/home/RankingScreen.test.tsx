import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RankingScreen } from './RankingScreen';
describe('classificação por resultados reais', () => {
  it('ordena por pontos e mantém posições empatadas, sem números do mockup', () => {
    render(
      <RankingScreen
        players={['Lana', 'Bia', 'Ana'].map((name) => ({ name, present: false }))}
        matches={[
          { number: 1, date: '04/11/2026', teamA: ['Lana', 'Bia'], teamB: ['Ana'], winner: 'A' },
        ]}
        onBack={vi.fn()}
      />
    );
    const rows = within(screen.getByRole('table')).getAllByRole('row').slice(1);
    expect(rows[0]).toHaveTextContent('Bia');
    expect(rows[1]).toHaveTextContent('Lana');
    expect(rows[2]).toHaveTextContent('Ana');
    expect(within(rows[0]).getAllByRole('cell')[0]).toHaveTextContent('1');
    expect(within(rows[1]).getAllByRole('cell')[0]).toHaveTextContent('1');
    expect(within(rows[2]).getAllByRole('cell')[0]).toHaveTextContent('3');
  });
});
