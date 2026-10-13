import { useState } from 'react';
import { BackButton } from '../components/BackButton';
import { DeleteModal } from './DeleteModal';
import { formatMatchNumber } from './matches';
import type { Match } from './types';
import './HistoryScreen.css';

interface HistoryScreenProps {
  matches: Match[];
  onDelete: (number: number) => void;
  onRematch: (match: Match) => void;
  onBack: () => void;
}

export function HistoryScreen({ matches, onDelete, onRematch, onBack }: HistoryScreenProps) {
  const [openNumber, setOpenNumber] = useState<number | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Match | null>(null);

  if (matches.length === 0) {
    return (
      <div className="history-screen">
        <BackButton onClick={onBack} label="Voltar" testId="matches-history-back-button" />
        <h1 className="history-screen__title">Histórico</h1>
        <p className="history-screen__empty" data-testid="matches-history-empty">
          Nenhuma partida registrada ainda.
        </p>
      </div>
    );
  }

  return (
    <div className="history-screen">
      <BackButton onClick={onBack} label="Voltar" testId="matches-history-back-button" />
      <h1 className="history-screen__title">Histórico</h1>
      <ul className="history-screen__list" data-testid="matches-history-list">
        {matches.map((match) => {
          const isOpen = openNumber === match.number;
          return (
            <li key={match.number} className="history-screen__item">
              <button
                type="button"
                className="match-card"
                data-testid={`matches-card-${match.number}`}
                aria-expanded={isOpen}
                onClick={() => setOpenNumber(isOpen ? null : match.number)}
              >
                <span className="match-card__number">{formatMatchNumber(match.number)}</span>
                <span className="match-card__date">{match.date}</span>
                {match.winner === null ? (
                  <span
                    className="match-card__badge"
                    data-testid={`matches-winner-badge-${match.number}`}
                  >
                    Sem vencedor
                  </span>
                ) : (
                  <span
                    className="match-card__badge match-card__badge--winner"
                    data-testid={`matches-winner-badge-${match.number}`}
                  >
                    Venceu Time {match.winner}
                  </span>
                )}
              </button>
              {isOpen && (
                <div className="match-card__open" data-testid={`matches-card-open-${match.number}`}>
                  <p className="match-card__open-date">{match.date}</p>
                  <div className="match-card__open-teams">
                    <div>
                      <h3>Time A</h3>
                      <ul>
                        {match.teamA.map((name) => (
                          <li key={name}>{name}</li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <h3>Time B</h3>
                      <ul>
                        {match.teamB.map((name) => (
                          <li key={name}>{name}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                  <div className="match-card__open-actions">
                    <button
                      type="button"
                      className="match-card__rematch"
                      data-testid={`matches-rematch-${match.number}`}
                      onClick={() => onRematch(match)}
                    >
                      Revanche
                    </button>
                    <button
                      type="button"
                      className="match-card__delete"
                      data-testid={`matches-delete-open-${match.number}`}
                      aria-label={`Excluir partida ${formatMatchNumber(match.number)}`}
                      onClick={() => setPendingDelete(match)}
                    >
                      Excluir
                    </button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {pendingDelete !== null && (
        <DeleteModal
          match={pendingDelete}
          onConfirm={() => {
            onDelete(pendingDelete.number);
            setPendingDelete(null);
            setOpenNumber(null);
          }}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}
