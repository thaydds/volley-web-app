import { useState, useSyncExternalStore } from 'react';
import { Button, Card, Modal, Typography } from '@beachsports/components';
import { appUpdates } from './appUpdates';

/** Kept on Home/Settings so background checks never interrupt a score or dialog. */
export function AppUpdateNotice({
  disabled = false,
  settings = false,
}: {
  disabled?: boolean;
  settings?: boolean;
}) {
  const state = useSyncExternalStore(appUpdates.subscribe, appUpdates.snapshot);
  const [confirm, setConfirm] = useState(false);
  if (!state.available && !settings) return null;
  if (!state.supported) return null;
  return (
    <>
      <Card title={state.available ? 'Nova versão disponível' : 'Atualizações do app'}>
        <Typography variant="text-s" tone="secondary" role="status">
          {state.available
            ? 'Atualize quando terminar o que está fazendo.'
            : 'As atualizações são verificadas automaticamente.'}
        </Typography>
        {state.error && <Typography role="alert">{state.error}</Typography>}
        {state.available ? (
          <Button
            variant="secondary"
            disabled={disabled || state.applying}
            onClick={() => setConfirm(true)}
          >
            Atualizar app
          </Button>
        ) : (
          <Button
            variant="secondary"
            disabled={disabled || state.checking}
            loading={state.checking}
            onClick={() => void appUpdates.check(true)}
          >
            Verificar atualização
          </Button>
        )}
      </Card>
      <Modal
        open={confirm}
        title="Atualizar o app?"
        busy={state.applying}
        onClose={() => {
          if (!state.applying) setConfirm(false);
        }}
        actions={
          <>
            <Button variant="secondary" disabled={state.applying} onClick={() => setConfirm(false)}>
              Continuar no app
            </Button>
            <Button
              disabled={disabled || state.applying}
              loading={state.applying}
              onClick={appUpdates.apply}
            >
              Atualizar agora
            </Button>
          </>
        }
      >
        <Typography>
          O app será recarregado. Placar provisório e textos não salvos serão descartados. Partidas
          finalizadas e alterações salvas neste aparelho serão preservadas.
        </Typography>
        {state.error && <Typography role="alert">{state.error}</Typography>}
      </Modal>
    </>
  );
}
