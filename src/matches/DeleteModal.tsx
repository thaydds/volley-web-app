import type { Match } from './types';
import './DeleteModal.css';

interface DeleteModalProps {
  match: Match;
  onConfirm: () => void;
  onCancel: () => void;
}

function pad(number: number): string {
  return `#${String(number).padStart(3, '0')}`;
}

export function DeleteModal({ match, onConfirm, onCancel }: DeleteModalProps) {
  return (
    <div className="delete-modal__backdrop">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label={`Excluir partida ${pad(match.number)}`}
        className="delete-modal"
        data-testid="matches-delete-modal"
      >
        <h2 className="delete-modal__title">
          Excluir a partida {pad(match.number)} de {match.date}?
        </h2>
        <p className="delete-modal__hint">Os pontos já somados permanecem no ranking.</p>
        <div className="delete-modal__actions">
          <button
            type="button"
            className="delete-modal__confirm"
            data-testid="matches-delete-confirm-button"
            onClick={onConfirm}
          >
            Excluir
          </button>
          <button
            type="button"
            className="delete-modal__cancel"
            data-testid="matches-delete-cancel-button"
            autoFocus
            onClick={onCancel}
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
