import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { DragDropProvider, useDraggable, useDroppable, type DragEndEvent } from '@dnd-kit/react';
import { Badge, Button, Card, Chip, Typography } from '@beachsports/components';
import { Screen } from '../components/Screen';
import {
  Accessibility,
  defaultPreset,
  PointerSensor,
  PointerActivationConstraints,
} from '@dnd-kit/dom';
import { resolveDroppedSide } from './draw';
import type { Teams } from '../roster/types';
// Keep the DS button's own selection semantics. Keyboard uses the explicit move action.
const dragPlugins = defaultPreset.plugins.filter((plugin) => plugin !== Accessibility);
const dragSensors = [
  PointerSensor.configure({
    activationConstraints: [new PointerActivationConstraints.Distance({ value: 8 })],
  }),
];

interface DrawScreenProps {
  teams: Teams;
  presentCount: number;
  onMove: (name: string, side: 'A' | 'B') => void;
  onRedraw: () => void;
  onConfirm: () => void;
  onBack: () => void;
}
function TeamMember({
  name,
  selected,
  onSelect,
}: {
  name: string;
  selected: boolean;
  onSelect: () => void;
}) {
  const { ref, handleRef, isDragging } = useDraggable({ id: name });
  const attach = useCallback(
    (node: HTMLDivElement | null) => {
      ref(node);
      handleRef(node?.querySelector('button') ?? null);
    },
    [ref, handleRef]
  );
  return (
    <div
      ref={attach}
      className="draggable-chip"
      data-dragging={isDragging}
      data-testid="draw-team-member"
      data-player-name={name}
    >
      <Chip label={name} size="md" selected onSelectedChange={onSelect} />
      {selected && <Badge label="Selecionado para mover" size="sm" tone="info" />}
    </div>
  );
}
function TeamPanel({
  side,
  members,
  selected,
  onSelect,
}: {
  side: 'A' | 'B';
  members: string[];
  selected: string | null;
  onSelect: (name: string) => void;
}) {
  const { ref, isDropTarget } = useDroppable({ id: side });
  return (
    <div
      ref={ref}
      data-drop-target={isDropTarget}
      className="team-drop"
      data-testid={`draw-team-${side.toLowerCase()}`}
    >
      <Card
        as="section"
        title={`Time ${side}`}
        description={`${members.length} jogador${members.length === 1 ? '' : 'es'}`}
      >
        <div className="chip-list">
          {members.map((name) => (
            <TeamMember
              key={name}
              name={name}
              selected={name === selected}
              onSelect={() => onSelect(name)}
            />
          ))}
        </div>
      </Card>
    </div>
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
  const [selected, setSelected] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const root = useRef<HTMLDivElement>(null);
  const moved = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (moved.current) {
      const name = moved.current;
      root.current?.querySelectorAll<HTMLElement>('[data-player-name]').forEach((el) => {
        if (el.dataset.playerName === name) el.querySelector('button')?.focus();
      });
      moved.current = null;
    }
  }, [teams]);
  function move(name: string, side: 'A' | 'B') {
    moved.current = name;
    onMove(name, side);
    setSelected(null);
    setAnnouncement(`${name} movido para Time ${side}.`);
  }
  function handleDragEnd(event: DragEndEvent) {
    const { source, target } = event.operation;
    if (event.canceled || !source || !target) return;
    const side = resolveDroppedSide(teams, String(source.id), String(target.id));
    if (side) move(String(source.id), side);
  }
  const target = selected ? (teams.A.includes(selected) ? 'B' : 'A') : null;
  return (
    <div ref={root}>
      <Screen
        title="Times definidos"
        description="Arraste os jogadores entre os times para ajustar a partida."
        badge="Nova partida"
        onBack={onBack}
        backLabel="Voltar ao elenco"
        backTestId="draw-back-button"
        footer={
          <>
            <Button
              variant="secondary"
              className="full-width"
              data-testid="draw-redraw-button"
              onClick={onRedraw}
            >
              Sortear novamente
            </Button>
            <Button
              size="lg"
              className="full-width"
              data-testid="draw-confirm-button"
              disabled={!teams.A.length || !teams.B.length}
              onClick={onConfirm}
            >
              Finalizar partida
            </Button>
          </>
        }
      >
        <Typography variant="text-s" tone="secondary" data-testid="draw-present-count">
          {presentCount} presentes em quadra
        </Typography>
        <DragDropProvider sensors={dragSensors} plugins={dragPlugins} onDragEnd={handleDragEnd}>
          <div className="stack">
            <TeamPanel
              side="A"
              members={teams.A}
              selected={selected}
              onSelect={(name) => setSelected(name === selected ? null : name)}
            />
            <TeamPanel
              side="B"
              members={teams.B}
              selected={selected}
              onSelect={(name) => setSelected(name === selected ? null : name)}
            />
          </div>
        </DragDropProvider>
        <Typography variant="text-s" tone="secondary">
          Ou toque em um jogador para movê-lo para o outro time.
        </Typography>
        {selected && target && (
          <Card
            title={selected}
            footer={
              <Button
                className="full-width"
                variant="secondary"
                onClick={() => move(selected, target)}
              >
                Mover para Time {target}
              </Button>
            }
          >
            <Button variant="ghost" onClick={() => setSelected(null)}>
              Cancelar movimento
            </Button>
          </Card>
        )}
        <Typography role="status" variant="text-s">
          {announcement}
        </Typography>
      </Screen>
    </div>
  );
}
