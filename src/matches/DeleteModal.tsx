import { useRef } from 'react';
import { Button, Typography } from '@beachsports/components';
import { Modal } from '../components/Modal';
import { formatMatchNumber } from './matches';
import type { Match } from './types';
interface DeleteModalProps {
  match: Match;
  onConfirm: () => void;
  onCancel: () => void;
}
export function DeleteModal({ match, onConfirm, onCancel }: DeleteModalProps) {
  const cancelButton = useRef<HTMLButtonElement>(null);
  return (
    <Modal
      initialFocus={cancelButton}
      label={`Excluir partida ${formatMatchNumber(match.number)}`}
      testId="matches-delete-modal"
      onCancel={onCancel}
      alert
    >
      <Typography as="h2" variant="heading-l">
        Excluir a partida {formatMatchNumber(match.number)} de {match.date}?
      </Typography>
      <Typography tone="secondary">
        A partida será removida deste aparelho. Esta ação não pode ser desfeita.
      </Typography>
      <Button
        variant="destructive"
        className="full-width"
        data-testid="matches-delete-confirm-button"
        onClick={onConfirm}
      >
        Excluir
      </Button>
      <Button
        variant="secondary"
        className="full-width"
        ref={cancelButton}
        data-testid="matches-delete-cancel-button"
        onClick={onCancel}
      >
        Cancelar
      </Button>
    </Modal>
  );
}
