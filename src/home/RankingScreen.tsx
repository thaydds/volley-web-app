import { DragDropProvider } from '@dnd-kit/react';
import type { DragEndEvent } from '@dnd-kit/react';
import { useSortable } from '@dnd-kit/react/sortable';
import { BackButton } from '../components/BackButton';
import type { Player } from '../roster/types';
import './RankingScreen.css';

interface RankingScreenProps {
  players: Player[];
  onPlayersChange: (players: Player[]) => void;
  onBack: () => void;
}

function rankingOrder(items: Player[], from: number, to: number): Player[] {
  if (from < 0 || from >= items.length) {
    return items;
  }
  const next = [...items];
  const [moved] = next.splice(from, 1);
  if (moved === undefined) {
    return items;
  }
  next.splice(to, 0, moved);
  return next;
}

interface RankingItemProps {
  player: Player;
  index: number;
}

function RankingItem({ player, index }: RankingItemProps) {
  const { ref, isDragging } = useSortable({ id: player.name, index });

  return (
    <li
      ref={ref}
      className={`ranking-screen__item${isDragging ? ' ranking-screen__item--dragging' : ''}`}
      data-testid="ranking-item"
      data-player-name={player.name}
    >
      <span className="ranking-screen__rank">{index + 1}</span>
      <span className="ranking-screen__player-name">{player.name}</span>
      <span className="ranking-screen__present">{player.present ? '★' : ''}</span>
    </li>
  );
}

export function RankingScreen({ players, onPlayersChange, onBack }: RankingScreenProps) {
  function handleDragEnd(event: DragEndEvent): void {
    const { source, target } = event.operation;
    if (event.canceled || !source || !target || source.id === target.id) {
      return;
    }

    const from = players.findIndex((player) => player.name === source.id);
    const to = players.findIndex((player) => player.name === target.id);
    if (from === -1 || to === -1 || from === to) {
      return;
    }

    onPlayersChange(rankingOrder(players, from, to));
  }

  return (
    <div className="ranking-screen">
      <BackButton onClick={onBack} label="Voltar" testId="ranking-back-button" />

      <h1 className="ranking-screen__title">Ranking</h1>

      {players.length === 0 ? (
        <p className="ranking-screen__empty">
          Cadastre jogadores e finalize partidas para ver o ranking.
        </p>
      ) : (
        <DragDropProvider onDragEnd={handleDragEnd}>
          <ul className="ranking-screen__list">
            {players.map((player, index) => (
              <RankingItem key={player.name} player={player} index={index} />
            ))}
          </ul>
        </DragDropProvider>
      )}
    </div>
  );
}
