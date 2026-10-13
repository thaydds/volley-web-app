import { useEffect, useRef, useState } from 'react';
import type { WinnerSide } from './types';
import './WinnerModal.css';

interface WinnerModalProps {
  onPick: (winner: WinnerSide) => void;
  onCancel: () => void;
}

export function WinnerModal({ onPick, onCancel }: WinnerModalProps) {
  const [selected, setSelected] = useState<WinnerSide | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<Element | null>(null);

  useEffect(() => {
    triggerRef.current = document.activeElement;
    dialogRef.current?.focus();
    function handleKey(event: KeyboardEvent): void {
      if (event.key === 'Escape') onCancel();
    }
    window.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('keydown', handleKey);
      if (triggerRef.current instanceof HTMLElement) triggerRef.current.focus();
    };
  }, [onCancel]);

  return (
    <div className="winner-modal__backdrop">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Vencedor"
        tabIndex={-1}
        className="winner-modal"
        data-testid="matches-winner-modal"
      >
        <h2 className="winner-modal__title">Vencedor</h2>
        <p className="winner-modal__subtitle">selecione:</p>
        <div className="winner-modal__teams">
          <button
            type="button"
            className={
              selected === 'A'
                ? 'winner-modal__team winner-modal__team--selected'
                : 'winner-modal__team'
            }
            data-testid="matches-winner-a-button"
            aria-pressed={selected === 'A'}
            onClick={() => setSelected('A')}
          >
            Time A
          </button>
          <button
            type="button"
            className={
              selected === 'B'
                ? 'winner-modal__team winner-modal__team--selected'
                : 'winner-modal__team'
            }
            data-testid="matches-winner-b-button"
            aria-pressed={selected === 'B'}
            onClick={() => setSelected('B')}
          >
            Time B
          </button>
        </div>
        <div className="winner-modal__actions">
          <button
            type="button"
            className="winner-modal__confirm"
            data-testid="matches-winner-confirm-button"
            disabled={selected === null}
            onClick={() => {
              if (selected !== null) onPick(selected);
            }}
          >
            Confirmar
          </button>
          <button
            type="button"
            className="winner-modal__cancel"
            data-testid="matches-winner-cancel-button"
            onClick={onCancel}
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
