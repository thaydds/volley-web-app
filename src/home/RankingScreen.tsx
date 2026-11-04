import { Ranking, RankingItem, Typography } from '@beachsports/components';
import { Screen } from '../components/Screen';
import { computeStandings } from '../matches/scoring';
import type { Match } from '../matches/types';
import type { Player } from '../roster/types';
interface RankingScreenProps {
  players: Player[];
  matches?: Match[];
  onBack: () => void;
}
export function RankingScreen({ players, matches = [], onBack }: RankingScreenProps) {
  const standings = computeStandings(matches);
  const names = Array.from(new Set([...players.map((p) => p.name), ...Object.keys(standings)]));
  const sorted = names.sort(
    (a, b) =>
      (standings[b]?.points ?? 0) - (standings[a]?.points ?? 0) || a.localeCompare(b, 'pt-BR')
  );
  const positions = new Map<number, number>();
  const rows = sorted.map((name, index) => {
    const stats = standings[name] ?? { points: 0, wins: 0, losses: 0 };
    if (!positions.has(stats.points)) positions.set(stats.points, index + 1);
    return { name, ...stats, position: positions.get(stats.points) ?? index + 1 };
  });
  return (
    <Screen
      title="Ranking"
      description="Jogadores · vitórias · derrotas · pontos"
      badge="Ranking"
      onBack={onBack}
      backTestId="ranking-back-button"
    >
      {!sorted.length ? (
        <Typography>Cadastre jogadores e finalize partidas para ver o ranking.</Typography>
      ) : (
        <Ranking title="Ranking de jogadores" density="compact">
          {rows.map((row) => (
            <RankingItem
              key={row.name}
              position={row.position}
              playerName={row.name}
              points={row.points}
              secondaryInfo={`${row.wins} vitórias · ${row.losses} derrotas`}
            />
          ))}
        </Ranking>
      )}
    </Screen>
  );
}
