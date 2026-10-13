import { useState } from 'react';
import type { FormEvent } from 'react';
import { BackButton } from '../components/BackButton';
import { addPlayer, presentPlayers, togglePresence } from './roster';
import type { Player } from './types';
import './RosterScreen.css';

interface PlayerChipProps {
  player: Player;
  onToggle: (name: string) => void;
}

export function PlayerChip({ player, onToggle }: PlayerChipProps) {
  return (
    <button
      type="button"
      className={player.present ? 'player-chip player-chip--present' : 'player-chip'}
      aria-pressed={player.present}
      data-testid="roster-player-chip"
      onClick={() => onToggle(player.name)}
    >
      <span className="player-chip__name">{player.name}</span>
    </button>
  );
}

interface RosterScreenProps {
  players: Player[];
  notice: string | null;
  onPlayersChange: (players: Player[]) => void;
  onDraw: () => void;
  onBack: () => void;
}

export function RosterScreen({ players, notice, onPlayersChange, onDraw, onBack }: RosterScreenProps) {
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const presentCount = presentPlayers(players).length;
  const canDraw = presentCount >= 2;

  function handleBlur(): void {
    if (draft.trim().length === 0) {
      setError(null);
      return;
    }
    const result = addPlayer(players, draft);
    if (!result.ok) {
      setError(result.error);
    } else {
      setError(null);
    }
  }

  function handleSubmit(event: FormEvent): void {
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

  function handleToggle(name: string): void {
    onPlayersChange(togglePresence(players, name));
  }

  return (
    <div className="roster-screen">
      <BackButton onClick={onBack} label="Voltar" testId="roster-back-button" />
      <h1 className="roster-screen__title">Quem veio hoje?</h1>

      {notice && (
        <p className="roster-screen__notice" role="status" data-testid="roster-notice">
          {notice}
        </p>
      )}

      <form className="roster-form" onSubmit={handleSubmit} noValidate>
        <label className="roster-form__label" htmlFor="roster-name">
          Nome do jogador
        </label>
        <div className="roster-form__row">
          <input
            id="roster-name"
            className="roster-form__input"
            type="text"
            value={draft}
            maxLength={30}
            autoFocus
            placeholder="Ex.: Lana"
            data-testid="roster-name-input"
            onChange={(event) => setDraft(event.target.value)}
            onBlur={handleBlur}
          />
          <button type="submit" className="roster-form__add" data-testid="roster-add-button">
            Adicionar
          </button>
        </div>
        {error && (
          <p className="roster-form__error" role="alert" data-testid="roster-error">
            {error}
          </p>
        )}
      </form>

      {players.length === 0 ? (
        <p className="roster-screen__empty" data-testid="roster-empty">
          Cadastre o primeiro jogador para começar.
        </p>
      ) : (
        <ul className="roster-list" data-testid="roster-list">
          {players.map((p) => (
            <li key={p.name}>
              <PlayerChip player={p} onToggle={handleToggle} />
            </li>
          ))}
        </ul>
      )}

      <p className="roster-screen__count" data-testid="roster-present-count">
        {presentCount} presente{presentCount === 1 ? '' : 's'}
      </p>
      {!canDraw && (
        <p className="roster-screen__hint" data-testid="roster-draw-hint">
          Marque pelo menos 2 presentes para sortear.
        </p>
      )}
      <button
        type="button"
        className="roster-screen__draw"
        disabled={!canDraw}
        data-testid="roster-draw-button"
        onClick={onDraw}
      >
        Sortear
      </button>
    </div>
  );
}
