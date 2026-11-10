import type { RefObject } from 'react';
import { Badge, Button, FormField, Modal, Typography } from '@beachsports/components';
import type { Game, Player } from './domain';
import styles from './LifecycleApp.module.css';
export type Dialog =
  | { kind: 'deactivate'; player: Player }
  | { kind: 'reactivate'; candidates: Player[]; selected: string }
  | { kind: 'finish'; game: Game; a: number; b: number }
  | { kind: 'conflict'; requestId: string }
  | { kind: 'discardLegacy' };
export function DialogViews({
  dialog,
  busy,
  error,
  online,
  pendingQueue,
  legacyCount,
  word,
  wordRef,
  onWord,
  onSelect,
  onClose,
  onConfirm,
  onBackup,
}: {
  dialog: Dialog | null;
  busy: boolean;
  error: string;
  online: boolean;
  pendingQueue: number;
  legacyCount: number;
  word: string;
  wordRef: RefObject<HTMLInputElement>;
  onWord: (value: string) => void;
  onSelect: (id: string) => void;
  onClose: () => void;
  onConfirm: () => void;
  onBackup: () => void;
}) {
  return (
    <>
      {dialog?.kind === 'deactivate' && (
        <Modal
          open
          title="Desativar jogador?"
          description={`${dialog.player.name} sairá da seleção. O histórico e as estatísticas serão preservados.`}
          busy={busy}
          onClose={onClose}
          initialFocusRef={wordRef}
          actions={
            <>
              <Button
                variant="destructive"
                disabled={!online || pendingQueue > 0 || !word || busy}
                loading={busy}
                onClick={onConfirm}
              >
                Desativar jogador
              </Button>
              <Button variant="secondary" onClick={onClose}>
                Cancelar
              </Button>
            </>
          }
        >
          <FormField
            ref={wordRef}
            type="password"
            label="Palavra-chave de autorização"
            autoComplete="off"
            value={word}
            maxLength={256}
            onChange={(e) => onWord(e.target.value)}
            {...(error
              ? { validation: 'error' as const, errorMessage: error }
              : { validation: 'none' as const })}
          />
          {!online && (
            <Typography role="status" variant="text-s">
              Desativar exige conexão. Nenhuma palavra-chave será guardada.
            </Typography>
          )}
          {!!pendingQueue && (
            <Typography variant="text-s">
              Sincronize as alterações pendentes na Home antes de desativar.
            </Typography>
          )}
        </Modal>
      )}
      {dialog?.kind === 'reactivate' && (
        <Modal
          open
          title={
            dialog.candidates.length === 1
              ? `Reativar ${dialog.candidates[0].name}?`
              : 'Qual jogador deseja reativar?'
          }
          description="Encontramos um jogador desativado com esse nome. Seu histórico e suas estatísticas serão recuperados. Se forem pessoas diferentes, use um nome que as diferencie."
          busy={busy}
          onClose={onClose}
          actions={
            <>
              <Button disabled={!dialog.selected} onClick={onConfirm}>
                Reativar jogador
              </Button>
              <Button variant="secondary" onClick={onClose}>
                Cancelar
              </Button>
            </>
          }
        >
          {dialog.candidates.length > 1 &&
            dialog.candidates.map((p) => (
              <Button
                key={p.id}
                variant={dialog.selected === p.id ? 'primary' : 'secondary'}
                onClick={() => onSelect(p.id)}
              >
                {p.name} · registro {p.id.slice(0, 8)}
              </Button>
            ))}
          {error && (
            <Typography role="alert" className={styles.error}>
              {error}
            </Typography>
          )}
        </Modal>
      )}
      {dialog?.kind === 'finish' && (
        <Modal
          open
          title="Finalizar partida?"
          description="O resultado final não poderá ser editado."
          busy={busy}
          onClose={onClose}
          actions={
            <>
              <Button onClick={onConfirm}>Confirmar e finalizar</Button>
              <Button variant="secondary" onClick={onClose}>
                Cancelar
              </Button>
            </>
          }
        >
          <div className={styles.finalScore}>
            <div>
              <Typography variant="label-m">Time A</Typography>
              <Typography variant="heading-l">{dialog.a}</Typography>
            </div>
            <div>
              <Typography variant="label-m">Time B</Typography>
              <Typography variant="heading-l">{dialog.b}</Typography>
            </div>
          </div>
          <Badge
            className={styles.finalWinner}
            size="sm"
            tone="success"
            label={`Time ${dialog.a > dialog.b ? 'A' : 'B'} · Vencedor`}
          />
          {!online && (
            <Typography variant="text-s">
              A finalização ficará salva neste aparelho e pendente de sincronização.
            </Typography>
          )}
          {error && (
            <Typography role="alert" className={styles.error}>
              {error}
            </Typography>
          )}
        </Modal>
      )}
      {dialog?.kind === 'discardLegacy' && (
        <Modal
          open
          title="Descartar envios antigos?"
          description="Os dados originais deste aparelho serão mantidos. Estes envios deixarão de ser tentados pelo novo app; revise o backup e recrie manualmente o que ainda for necessário."
          busy={busy}
          onClose={onClose}
          actions={
            <>
              <Button variant="secondary" onClick={onBackup}>
                Exportar backup
              </Button>
              <Button variant="destructive" onClick={onConfirm}>
                Confirmar descarte de {legacyCount} envios
              </Button>
              <Button variant="ghost" onClick={onClose}>
                Cancelar
              </Button>
            </>
          }
        >
          {error && <Typography role="alert">{error}</Typography>}
        </Modal>
      )}
    </>
  );
}
