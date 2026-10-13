import type { Teams } from '../roster/types';
import { BackButton } from '../components/BackButton';
import { PlayerNameChip } from '../roster/PlayerNameChip';
import { formatMatchNumber } from './matches';
import './ConfirmScreen.css';

interface ConfirmScreenProps {
  number: number;
  date: string;
  teams: Teams;
  onConfirm: () => void;
  onBack: () => void;
}

interface ConfirmTeamPanelProps {
  side: 'A' | 'B';
  members: string[];
}

function ConfirmTeamPanel({ side, members }: ConfirmTeamPanelProps) {
  return (
    <section
      className="team-panel"
      aria-label={`Time ${side}`}
      data-testid={side === 'A' ? 'confirm-team-a' : 'confirm-team-b'}
    >
      <h2 className="team-panel__title">Time {side}</h2>
      <div className="team-panel__list">
        {members.map((name) => (
          <PlayerNameChip key={name} name={name} testId="confirm-team-member" selected />
        ))}
      </div>
    </section>
  );
}

export function ConfirmScreen({ number, date, teams, onConfirm, onBack }: ConfirmScreenProps) {
  const canConfirm = teams.A.length > 0 && teams.B.length > 0;
  return (
    <div className="confirm-screen">
      <BackButton onClick={onBack} label="Voltar ao sorteio" testId="matches-confirm-back-button" />

      <h1 className="confirm-screen__title">Essa é a partida {formatMatchNumber(number)}</h1>
      <p className="confirm-screen__date" data-testid="matches-confirm-date">
        {date}
      </p>
      <div className="draw-screen__panels">
        <ConfirmTeamPanel side="A" members={teams.A} />
        <ConfirmTeamPanel side="B" members={teams.B} />
      </div>
      <div className="confirm-screen__actions">
        <button
          type="button"
          className="confirm-screen__confirm"
          data-testid="matches-confirm-button"
          disabled={!canConfirm}
          onClick={onConfirm}
        >
          Finalizar Partida
        </button>
      </div>
    </div>
  );
}
