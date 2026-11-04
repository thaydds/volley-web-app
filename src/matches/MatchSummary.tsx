import { Badge, Card, ScoreMatch, Typography } from '@beachsports/components';
import type { Match } from './types';
import { formatMatchNumber } from './matches';
/** A recorded match without a winner is pending, not a live match. */
export function MatchSummary({ match }: { match: Match }) {
  const title = `Partida ${formatMatchNumber(match.number)}`;
  if (!match.winner)
    return (
      <Card title={title} description={match.date || 'Data não informada'}>
        <Badge label="Sem vencedor" tone="neutral" />
        <Typography variant="text-s" tone="secondary">
          Time A: {match.teamA.join(', ')} · Time B: {match.teamB.join(', ')}
        </Typography>
        <Typography variant="text-s" tone="secondary">
          Placar não informado.
        </Typography>
      </Card>
    );
  return (
    <ScoreMatch
      title={title}
      metadata={match.date || 'Data não informada'}
      density="compact"
      state="finished"
      winnerLabel={`Time ${match.winner} · Vencedor`}
      teamA={{ name: 'Time A', score: '—', players: match.teamA.join(', ') }}
      teamB={{ name: 'Time B', score: '—', players: match.teamB.join(', ') }}
    >
      <Typography variant="text-s" tone="secondary">
        Placar não informado no registro.
      </Typography>
    </ScoreMatch>
  );
}
