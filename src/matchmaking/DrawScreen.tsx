import { DragDropProvider, useDraggable, useDroppable } from '@dnd-kit/react';
import type { DragEndEvent } from '@dnd-kit/react';
import { BackButton } from '../components/BackButton';
import { resolveDroppedSide } from './draw';
import type { Teams } from '../roster/types';
import './DrawScreen.css';

interface DrawScreenProps {
  teams: Teams;
  presentCount: number;
  onMove: (name: string, toSide: 'A' | 'B') => void;
  onRedraw: () => void;
  onConfirm: () => void;
  onBack: () => void;
}

interface TeamMemberChipProps {
  name: string;
}

function TeamMemberChip({ name }: TeamMemberChipProps) {
  const { ref, isDragging } = useDraggable({ id: name });

  return (
    <div
      ref={ref}
      className={`player-chip player-chip--team${isDragging ? ' player-chip--dragging' : ''}`}
      data-testid="draw-team-member"
      data-player-name={name}
    >
      <span className="player-chip__name">{name}</span>
    </div>
  );
}

interface TeamPanelProps {
  side: 'A' | 'B';
  members: string[];
}

function TeamPanel({ side, members }: TeamPanelProps) {
  const { ref, isDropTarget } = useDroppable({ id: side });

  return (
    <section
      ref={ref}
      className={`team-panel${isDropTarget ? ' team-panel--drop-target' : ''}`}
      aria-label={`Time ${side}`}
      data-testid={side === 'A' ? 'draw-team-a' : 'draw-team-b'}
      data-drop-target={isDropTarget ? 'true' : 'false'}
    >
      <h2 className="team-panel__title">Time {side}</h2>
      <div className="team-panel__list">
        {members.map((name) => (
          <TeamMemberChip key={name} name={name} />
        ))}
      </div>
    </section>
  );
}

export function DrawScreen({
  teams,
  presentCount,
  onMove,
  onRedraw,
  onConfirm,
  onBack,
}: DrawScreenProps) {
  function handleDragEnd(event: DragEndEvent): void {
    const { source, target } = event.operation;
    if (event.canceled || !source || !target) return;

    const toSide = resolveDroppedSide(teams, String(source.id), String(target.id));
    if (toSide === null) return;

    onMove(String(source.id), toSide);
  }

  return (
    <div className="draw-screen">
      <BackButton onClick={onBack} label="Voltar ao elenco" testId="draw-back-button" />

      <h1 className="draw-screen__title">Times sorteados</h1>
      <p className="draw-screen__count" data-testid="draw-present-count">
        {presentCount} presente{presentCount === 1 ? '' : 's'} em quadra
      </p>

      <DragDropProvider onDragEnd={handleDragEnd}>
        <div className="draw-screen__panels">
          <TeamPanel side="A" members={teams.A} />
          <TeamPanel side="B" members={teams.B} />
        </div>
      </DragDropProvider>

      <div className="draw-screen__actions">
        <button
          type="button"
          className="draw-screen__confirm"
          data-testid="draw-confirm-button"
          onClick={onConfirm}
        >
          Confirmar partida
        </button>
        <button
          type="button"
          className="draw-screen__redraw"
          data-testid="draw-redraw-button"
          onClick={onRedraw}
        >
          Sortear novamente
        </button>
      </div>
    </div>
  );
}
