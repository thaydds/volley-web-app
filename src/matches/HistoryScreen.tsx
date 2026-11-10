import { useState } from 'react';
import { Badge, Button, Card, Typography } from '@beachsports/components';
import { Screen } from '../components/Screen';
import { DeleteModal } from './DeleteModal';
import { MatchSummary } from './MatchSummary';
import { formatMatchNumber } from './matches';
import type { Match } from './types';
interface HistoryScreenProps {
  matches: Match[];
  onDelete: (number: number) => void;
  onRematch: (match: Match) => void;
  onBack: () => void;
  readOnly?: boolean;
  archivedMatches?: Match[];
  onRestore?: (match: Match) => void;
  onEditWinner?: (match: Match) => void;
}
export function HistoryScreen({
  matches,
  onDelete,
  onRematch,
  onBack,
  readOnly = false,
  archivedMatches = [],
  onRestore,
  onEditWinner,
}: HistoryScreenProps) {
  const [openNumber, setOpenNumber] = useState<number | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Match | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const selected = matches.find((m) => m.number === openNumber);
  if (selected)
    return (
      <Screen
        title="Detalhes da partida"
        badge={`Partida ${formatMatchNumber(selected.number)}`}
        onBack={() => setOpenNumber(null)}
        footer={
          <>
            <Button
              size="lg"
              className="full-width"
              data-testid={`matches-rematch-${selected.number}`}
              onClick={() => onRematch(selected)}
              disabled={readOnly}
            >
              Revanche
            </Button>
            {onEditWinner && (
              <Button
                variant="secondary"
                disabled={readOnly}
                onClick={() => onEditWinner(selected)}
              >
                Alterar resultado
              </Button>
            )}
            <Button
              variant="destructive"
              className="full-width"
              data-testid={`matches-delete-open-${selected.number}`}
              aria-label={`Excluir partida ${formatMatchNumber(selected.number)}`}
              onClick={() => setPendingDelete(selected)}
              disabled={readOnly}
            >
              Excluir partida
            </Button>
          </>
        }
      >
        <div data-testid={`matches-card-open-${selected.number}`}>
          <MatchSummary match={selected} />
        </div>
        {pendingDelete && (
          <DeleteModal
            match={pendingDelete}
            onCancel={() => setPendingDelete(null)}
            onConfirm={() => {
              onDelete(pendingDelete.number);
              setPendingDelete(null);
              setOpenNumber(null);
            }}
          />
        )}
      </Screen>
    );
  return (
    <Screen
      title="Histórico de partidas"
      description="Resultados e jogadores de cada encontro."
      badge="Partidas"
      onBack={onBack}
      backTestId="matches-history-back-button"
    >
      {!matches.length ? (
        <Typography data-testid="matches-history-empty">
          Nenhuma partida registrada ainda.
        </Typography>
      ) : (
        <ul className="stack plain-list" data-testid="matches-history-list">
          {[...matches].reverse().map((match) => (
            <li key={match.number}>
              <Card
                title={`Partida ${formatMatchNumber(match.number)}`}
                description={match.date || 'Data não informada'}
                footer={
                  <Button
                    className="full-width"
                    variant="ghost"
                    size="sm"
                    data-testid={`matches-card-${match.number}`}
                    onClick={() => setOpenNumber(match.number)}
                  >
                    Ver partida {formatMatchNumber(match.number)}
                  </Button>
                }
              >
                <Badge
                  data-testid={`matches-winner-badge-${match.number}`}
                  label={match.winner ? `Time ${match.winner} · Vencedor` : 'Sem vencedor'}
                  tone={match.winner ? 'success' : 'neutral'}
                />
                <Typography tone="secondary">
                  {(match.winner === 'B' ? match.teamB : match.teamA).join(', ')}
                </Typography>
              </Card>
            </li>
          ))}
        </ul>
      )}
      {onRestore && archivedMatches.length > 0 && (
        <>
          <Button
            variant="ghost"
            onClick={() => setShowArchived(!showArchived)}
            aria-expanded={showArchived}
          >
            Partidas removidas ({archivedMatches.length})
          </Button>
          {showArchived && (
            <ul className="stack plain-list">
              {archivedMatches.map((match) => (
                <li key={match.number}>
                  <Typography>
                    Partida {formatMatchNumber(match.number)} · {match.date}
                  </Typography>
                  <Button
                    variant="secondary"
                    disabled={readOnly}
                    onClick={() => onRestore(match)}
                    aria-label={`Restaurar partida ${formatMatchNumber(match.number)}`}
                  >
                    Restaurar
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Screen>
  );
}
