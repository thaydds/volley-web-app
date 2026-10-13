interface HomeProps {
  onMatches: () => void;
  onRanking: () => void;
  onHistory: () => void;
}

export function Home({ onMatches, onRanking, onHistory }: HomeProps) {
  return (
    <div className="home-screen" data-testid="home-screen">
      <main className="home-main">
        <section className="home-center-section">
          <button
            type="button"
            className="card card--montar-time"
            data-testid="home-montar-time"
            onClick={onMatches}
          >
            <span className="card__text card__text--large">Montar o time!</span>
          </button>
        </section>

        <section className="home-bottom-section">
          <div className="bottom-actions">
            <button
              type="button"
              className="action-btn action-btn--ranking"
              data-testid="home-ranking-button"
              onClick={onRanking}
            >
              <span>Ranking</span>
            </button>
            <button
              type="button"
              className="action-btn action-btn--partidas"
              data-testid="home-matches-button"
              onClick={onMatches}
            >
              <span>Partidas</span>
            </button>
            <button
              type="button"
              className="action-btn action-btn--historico"
              data-testid="home-history-button"
              onClick={onHistory}
            >
              <span>Histórico</span>
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}
