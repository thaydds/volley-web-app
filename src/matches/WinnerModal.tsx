import { useState } from 'react';
import { Button, Card, Typography } from '@beachsports/components';
import { Modal } from '../components/Modal';
import { Screen } from '../components/Screen';
import type { WinnerSide } from './types';
interface WinnerModalProps {
  onPick: (winner: WinnerSide) => void;
  onCancel: () => void;
  disabled?: boolean;
  error?: string;
  busy?: boolean;
}
export function WinnerModal({
  onPick,
  onCancel,
  disabled = false,
  busy = false,
  error,
}: WinnerModalProps) {
  const [selected, setSelected] = useState<WinnerSide | null>(null);
  return (
    <Modal
      label="Vencedor"
      testId="matches-winner-modal"
      onCancel={() => {
        if (!busy) onCancel();
      }}
      fullscreen
    >
      <Screen
        title="Vencedor"
        description="Selecione o time vencedor antes de confirmar."
        badge="Resultado"
        onBack={() => {
          if (!busy) onCancel();
        }}
        footer={
          <>
            <Button
              size="lg"
              className="full-width"
              data-testid="matches-winner-confirm-button"
              disabled={disabled || selected === null}
              onClick={() => {
                if (selected) onPick(selected);
              }}
            >
              Confirmar
            </Button>
            <Button
              variant="secondary"
              className="full-width"
              data-testid="matches-winner-cancel-button"
              onClick={onCancel}
              disabled={busy}
            >
              Cancelar
            </Button>
          </>
        }
      >
        <Card title="Quem venceu?" description="Selecione antes de confirmar.">
          <div className="stack" role="group" aria-label="Time vencedor">
            {(['A', 'B'] as const).map((side) => (
              <Button
                key={side}
                className="full-width"
                variant={selected === side ? 'primary' : 'secondary'}
                aria-pressed={selected === side}
                onClick={() => setSelected(side)}
                data-testid={`matches-winner-${side.toLowerCase()}-button`}
              >
                Time {side}
                {selected === side ? ' · Selecionado' : ''}
              </Button>
            ))}
          </div>
        </Card>
        {error && <Typography role="alert">{error}</Typography>}
      </Screen>
    </Modal>
  );
}
