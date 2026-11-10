import { Button, Loading, Modal, Typography } from '@beachsports/components';
import { canonicalName, discardedDependents, type Command, type Snapshot } from './domain';
import { gameTitle } from './gameLabels';
import styles from './LifecycleApp.module.css';
const operationNames: Record<Command['operation'], string> = {
  create_player: 'Cadastrar jogador',
  reactivate_player: 'Reativar jogador',
  start_match: 'Iniciar partida',
  save_score: 'Salvar placar',
  finish_match: 'Finalizar partida',
};
export function ConflictDialog({
  queue,
  requestId,
  local,
  remote,
  error,
  busy,
  online,
  onBackup,
  onUseServer,
  onClose,
}: {
  queue: Command[];
  requestId: string;
  local: Snapshot;
  remote: Snapshot | null;
  error: string;
  busy: boolean;
  online: boolean;
  onBackup: () => void;
  onUseServer: () => void;
  onClose: () => void;
}) {
  const command = queue.find((c) => c.request_id === requestId);
  const game = remote?.matches.find((m) => m.id === command?.input.id);
  const localGame = local.matches.find((m) => m.id === command?.input.id);
  return (
    <Modal
      open
      title="Revisar conflito"
      description="A alteração local não foi aplicada por cima dos dados do outro dispositivo. Você pode guardar um backup e escolher usar a versão atual do servidor."
      busy={busy}
      onClose={onClose}
      actions={
        <>
          <Button variant="secondary" onClick={onBackup}>
            Exportar backup das pendências
          </Button>
          <Button variant="destructive" disabled={!online} onClick={onUseServer}>
            Usar servidor e descartar {discardedDependents(queue, requestId).length} alterações
            locais
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Manter pendências
          </Button>
        </>
      }
    >
      <Typography variant="text-s">
        A confirmação descarta somente a alteração escolhida e as posteriores que dependem dela. As
        demais continuam na fila.
      </Typography>
      {remote ? (
        <div className={styles.summary}>
          <Typography variant="label-m">Versão atual do servidor</Typography>
          {game ? (
            <Typography>
              {gameTitle(game)} · Time A {game.score_a ?? '—'} × {game.score_b ?? '—'} Time B ·{' '}
              {game.status === 'finished' ? 'Finalizada' : 'Em andamento'}
            </Typography>
          ) : (
            <Typography>
              {remote.players
                .filter(
                  (p) =>
                    canonicalName(p.name) ===
                    canonicalName(
                      String(
                        command?.input.name ??
                          local.players.find((player) => player.id === command?.input.id)?.name ??
                          ''
                      )
                    )
                )
                .map((p) => `${p.name} · ${p.deleted_at ? 'desativado' : 'ativo'}`)
                .join(', ') || 'A composição ou disponibilidade dos participantes mudou.'}
            </Typography>
          )}
        </div>
      ) : (
        !error && <Loading label="Buscando versão atual do servidor" />
      )}
      {command && (
        <div className={styles.summary}>
          <Typography variant="label-m">Alteração local preservada</Typography>
          <Typography>
            {operationNames[command.operation]}
            {localGame ? ` · ${gameTitle(localGame)}` : ''}
          </Typography>
          {command.operation === 'save_score' || command.operation === 'finish_match' ? (
            <Typography>
              Time A {String(command.input.score_a)} × {String(command.input.score_b)} Time B
            </Typography>
          ) : command.operation === 'start_match' ? (
            <Typography>{localGame?.participants.map((p) => p.name).join(', ')}</Typography>
          ) : (
            <Typography>
              {String(
                command.input.name ??
                  local.players.find((p) => p.id === command.input.id)?.name ??
                  'Jogador'
              )}
            </Typography>
          )}
        </div>
      )}
      {error && (
        <Typography role="alert" className={styles.error}>
          {error}
        </Typography>
      )}
    </Modal>
  );
}
