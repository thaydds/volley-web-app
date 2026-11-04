import { useState, type FormEvent } from 'react';
import { Badge, Button, Chip, FormField, Typography } from '@beachsports/components';
import { Screen } from '../components/Screen';
import { addPlayer, presentPlayers, togglePresence } from './roster';
import type { Player } from './types';
interface PlayerChipProps {
  player: Player;
  onToggle: (name: string) => void;
}
export function PlayerChip({ player, onToggle }: PlayerChipProps) {
  return (
    <Chip
      label={player.name}
      size="md"
      selected={player.present}
      onSelectedChange={() => onToggle(player.name)}
      data-testid="roster-player-chip"
    />
  );
}
interface RosterScreenProps {
  players: Player[];
  notice: string | null;
  onPlayersChange: (players: Player[]) => void;
  onDraw: () => void;
  onBack: () => void;
}
export function RosterScreen({
  players,
  notice,
  onPlayersChange,
  onDraw,
  onBack,
}: RosterScreenProps) {
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const presentCount = presentPlayers(players).length;
  function handleBlur() {
    if (!draft.trim()) {
      setError(null);
      return;
    }
    const result = addPlayer(players, draft);
    setError(result.ok ? null : result.error);
  }
  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const result = addPlayer(players, draft);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onPlayersChange(result.players);
    setDraft('');
    setError(null);
  }
  return (
    <Screen
      title="Quem veio hoje?"
      description="Toque nos jogadores para marcar quem está presente."
      badge="Nova partida"
      onBack={onBack}
      backTestId="roster-back-button"
      footer={
        <>
          {presentCount < 2 && (
            <Typography variant="text-s" tone="secondary" data-testid="roster-draw-hint">
              Marque pelo menos 2 presentes para sortear.
            </Typography>
          )}
          <Button
            size="lg"
            className="full-width"
            disabled={presentCount < 2}
            data-testid="roster-draw-button"
            onClick={onDraw}
          >
            Sortear
          </Button>
        </>
      }
    >
      {notice && (
        <Typography role="status" data-testid="roster-notice">
          {notice}
        </Typography>
      )}
      <div role="status" data-testid="roster-present-count">
        <Badge
          tone="info"
          label={`${presentCount} presente${presentCount === 1 ? '' : 's'} · ${players.length - presentCount} não marcados`}
        />
      </div>
      {players.length ? (
        <ul className="chip-list" data-testid="roster-list">
          {players.map((player) => (
            <li key={player.name}>
              <PlayerChip
                player={player}
                onToggle={(name) => onPlayersChange(togglePresence(players, name))}
              />
            </li>
          ))}
        </ul>
      ) : (
        <Typography data-testid="roster-empty">
          Cadastre o primeiro jogador para começar.
        </Typography>
      )}
      <Typography variant="text-s" tone="secondary">
        Preenchido: presente · Contorno: não marcado. Toque para alternar.
      </Typography>
      <form className="stack" onSubmit={handleSubmit} noValidate>
        <FormField
          label="Nome do jogador"
          id="roster-name"
          type="text"
          value={draft}
          maxLength={30}
          placeholder="Ex.: Lana"
          data-testid="roster-name-input"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={handleBlur}
          {...(error
            ? { validation: 'error' as const, errorMessage: error }
            : { validation: 'none' as const })}
        />
        {error && (
          <Typography
            className="visually-hidden"
            variant="text-s"
            role="alert"
            data-testid="roster-error"
          >
            {error}
          </Typography>
        )}
        <Button variant="secondary" type="submit" data-testid="roster-add-button">
          Adicionar
        </Button>
      </form>
    </Screen>
  );
}
