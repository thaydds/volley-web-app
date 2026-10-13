interface PlayerNameChipProps {
  name: string;
  testId?: string;
  /**
   * Renders the selected look from the Figma "pressed" chip variant
   * (#A1E0FF fill + #4C85FF border), used for players already picked.
   */
  selected?: boolean;
}

/**
 * Renders a player name the same way the roster and draw screens do, so the
 * confirm step stays visually consistent with the previous one.
 * Presentation-only on purpose: drag-and-drop is wired by the parent.
 */
export function PlayerNameChip({ name, testId, selected = false }: PlayerNameChipProps) {
  return (
    <div
      className={`player-chip${selected ? ' player-chip--present' : ''}`}
      data-testid={testId}
      data-player-name={name}
      data-selected={selected ? 'true' : 'false'}
    >
      <span className="player-chip__name">{name}</span>
    </div>
  );
}
