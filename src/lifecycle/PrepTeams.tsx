import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { DragDropProvider, useDraggable, useDroppable, type DragEndEvent } from '@dnd-kit/react';
import {
  Accessibility,
  defaultPreset,
  PointerSensor,
  PointerActivationConstraints,
} from '@dnd-kit/dom';
import { Badge, Button, Card, Chip, Typography } from '@beachsports/components';
import type { Draft, Player, Side } from './domain';
import { Page } from './Page';
import styles from './LifecycleApp.module.css';
const plugins = defaultPreset.plugins.filter((p) => p !== Accessibility);
const sensors = [
  PointerSensor.configure({
    activationConstraints: [new PointerActivationConstraints.Distance({ value: 8 })],
  }),
];
function Member({
  player,
  onSelect,
  disabled,
}: {
  player: Player;
  onSelect: () => void;
  disabled: boolean;
}) {
  const { ref, handleRef, isDragging } = useDraggable({ id: player.id });
  const attach = useCallback(
    (node: HTMLDivElement | null) => {
      ref(node);
      handleRef(node?.querySelector('button') ?? null);
    },
    [ref, handleRef]
  );
  return (
    <div
      className={styles.member}
      ref={attach}
      data-player-id={player.id}
      data-dragging={isDragging}
    >
      <Chip
        disabled={disabled}
        label={player.name}
        size="md"
        selected
        onSelectedChange={onSelect}
      />
    </div>
  );
}
function Team({
  side,
  draft,
  players,
  selected,
  onSelect,
  onMove,
  disabled,
}: {
  side: Side;
  disabled: boolean;
  draft: Draft;
  players: Player[];
  selected: string | null;
  onSelect: (id: string) => void;
  onMove: (id: string, side: Side) => void;
}) {
  const { ref, isDropTarget } = useDroppable({ id: side });
  const selectedPlayer = players.find((p) => p.id === selected);
  const ownsSelection = !!selected && draft[side].includes(selected);
  return (
    <div
      ref={ref}
      className={styles.drop}
      data-drop-target={isDropTarget}
      data-testid={`draw-team-${side.toLowerCase()}`}
    >
      <Card>
        <div className={styles.stack}>
          <div className={styles.teamHeading}>
            <Typography as="h2" variant="heading-m">
              Time {side}
            </Typography>
            <Badge
              size="sm"
              tone={draft.servingSide === side ? 'info' : 'neutral'}
              label={draft.servingSide === side ? 'Começa no saque' : 'Escolhe o lado'}
            />
          </div>
          <div className={styles.chips}>
            {draft[side].map((id) => {
              const player = players.find((p) => p.id === id);
              return player ? (
                <Member
                  key={id}
                  player={player}
                  disabled={disabled}
                  onSelect={() => onSelect(id)}
                />
              ) : null;
            })}
          </div>
          {ownsSelection && selectedPlayer && (
            <Button
              disabled={disabled}
              variant="ghost"
              onClick={() => onMove(selected!, side === 'A' ? 'B' : 'A')}
            >
              Mover {selectedPlayer.name} para Time {side === 'A' ? 'B' : 'A'}
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}
export function PrepTeams({
  draft,
  players,
  onMove,
  onRedraw,
  onStart,
  onBack,
  disabled,
  error,
}: {
  draft: Draft;
  players: Player[];
  onMove: (id: string, to: Side) => Promise<void>;
  onRedraw: () => void;
  onStart: () => void;
  onBack: () => void;
  disabled: boolean;
  error: string;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const [moved, setMoved] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (moved) {
      root.current?.querySelector<HTMLElement>(`[data-player-id="${moved}"] button`)?.focus();
      setMoved(null);
    }
  }, [draft, moved]);
  function move(id: string, to: Side) {
    void onMove(id, to).then(() => {
      setSelected(null);
      setMoved(id);
      setAnnouncement(
        `${players.find((p) => p.id === id)?.name ?? 'Jogador'} movido para Time ${to}.`
      );
    });
  }
  function end(event: DragEndEvent) {
    const { source, target } = event.operation;
    if (event.canceled || !source || !target || disabled) return;
    const to = String(target.id);
    if ((to === 'A' || to === 'B') && !draft[to].includes(String(source.id)))
      move(String(source.id), to);
  }
  return (
    <div ref={root}>
      <Page
        title="Times definidos"
        description="Pré-jogo · ajuste os times antes de iniciar."
        badge="Times definidos"
        onBack={onBack}
        testId="draw-screen"
        footer={
          <>
            <Button
              className={styles.full}
              disabled={disabled || !draft.A.length || !draft.B.length}
              onClick={onStart}
            >
              Iniciar partida
            </Button>
            <Button
              className={styles.full}
              variant="secondary"
              disabled={disabled}
              onClick={onRedraw}
            >
              Sortear novamente
            </Button>
          </>
        }
      >
        {error && (
          <Typography role="alert" className={styles.error}>
            {error}
          </Typography>
        )}
        <DragDropProvider sensors={sensors} plugins={plugins} onDragEnd={end}>
          <div className={styles.stack}>
            {(['A', 'B'] as const).map((side) => (
              <Team
                key={side}
                side={side}
                draft={draft}
                players={players}
                selected={selected}
                onSelect={(id) => {
                  if (!disabled) setSelected(id === selected ? null : id);
                }}
                onMove={move}
                disabled={disabled}
              />
            ))}
          </div>
        </DragDropProvider>
        <Typography variant="text-s" tone="secondary">
          Arraste para reorganizar ou use “Mover”. Saque e lado são sorteados juntos, sem repetir.
        </Typography>
        <span role="status" className={styles.sr}>
          {announcement}
        </span>
      </Page>
    </div>
  );
}
