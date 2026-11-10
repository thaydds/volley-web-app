import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Badge, Button, Input, ScoreMatch, Typography } from '@beachsports/components';
import { canFinish, parseScore, type Game } from './domain';
import styles from './LifecycleApp.module.css';
import { gameTitle, names } from './gameLabels';
export function MatchPanel({
  game,
  pending,
  onOpen,
  onSave,
  onFinish,
  disabled = false,
  detail = false,
  footer,
}: {
  game: Game;
  pending: boolean;
  onOpen?: () => void;
  onSave: (a: number, b: number) => Promise<boolean>;
  onFinish?: (a: number, b: number) => void;
  disabled?: boolean;
  detail?: boolean;
  footer?: HTMLElement | null;
}) {
  const [a, setA] = useState(game.score_a === null ? '' : String(game.score_a));
  const [b, setB] = useState(game.score_b === null ? '' : String(game.score_b));
  const [notice, setNotice] = useState('');
  const [dirty, setDirty] = useState(false);
  const [editingVersion, setEditingVersion] = useState(game.version);
  useEffect(() => {
    if (!dirty || game.status === 'finished') {
      setA(game.score_a === null ? '' : String(game.score_a));
      setB(game.score_b === null ? '' : String(game.score_b));
      setEditingVersion(game.version);
    }
  }, [game.id, game.version, game.score_a, game.score_b, game.status, dirty]);
  const obsolete = dirty && editingVersion !== game.version;
  const aa = parseScore(a),
    bb = parseScore(b);
  const valid = aa !== null && bb !== null;
  const finished = game.status === 'finished';
  const changed =
    a !== (game.score_a === null ? '' : String(game.score_a)) ||
    b !== (game.score_b === null ? '' : String(game.score_b));
  const title = gameTitle(game);
  const suffix = detail ? '' : ` · ${title}`;
  const common = {
    title,
    metadata: game.played_on.split('-').reverse().join('/'),
    teamA: { name: 'Time A', score: game.score_a ?? '—', players: names(game, 'A') },
    teamB: { name: 'Time B', score: game.score_b ?? '—', players: names(game, 'B') },
    description: 'Partida em andamento',
  };
  const inputs = {
    A: (
      <Input
        className={styles.scoreInput}
        aria-label={`Placar Time A${suffix}`}
        inputMode="numeric"
        maxLength={10}
        value={a}
        disabled={disabled}
        validation={a && !Number.isInteger(aa) ? 'error' : 'none'}
        onChange={(e) => {
          if (!dirty) setEditingVersion(game.version);
          setDirty(true);
          setA(e.target.value);
          setNotice('');
        }}
      />
    ),
    B: (
      <Input
        className={styles.scoreInput}
        aria-label={`Placar Time B${suffix}`}
        inputMode="numeric"
        maxLength={10}
        value={b}
        disabled={disabled}
        validation={b && !Number.isInteger(bb) ? 'error' : 'none'}
        onChange={(e) => {
          if (!dirty) setEditingVersion(game.version);
          setDirty(true);
          setB(e.target.value);
          setNotice('');
        }}
      />
    ),
  };
  async function save() {
    if (!valid || disabled || obsolete) return;
    const ok = await onSave(aa, bb);
    if (ok) {
      setDirty(false);
      setNotice('Placar salvo neste aparelho. Sincronize na Home para compartilhar.');
    }
  }
  const actions = (
    <div className={styles.stack}>
      <Button
        className={styles.full}
        variant="secondary"
        disabled={!valid || disabled || obsolete || !changed}
        onClick={() => void save()}
      >
        Salvar placar
      </Button>
      <Button
        className={styles.full}
        disabled={!canFinish(aa, bb) || disabled || obsolete}
        onClick={() => {
          if (aa !== null && bb !== null) onFinish?.(aa, bb);
        }}
      >
        Finalizar partida
      </Button>
    </div>
  );
  return (
    <div className={styles.detail}>
      <div
        className={onOpen ? styles.clickable : undefined}
        onClick={(event) => {
          if (
            onOpen &&
            event.target instanceof Element &&
            !event.target.closest('button,input,a,label,[data-input]')
          )
            onOpen();
        }}
      >
        {finished ? (
          <ScoreMatch
            {...common}
            state="finished"
            statusLabel={pending ? 'Finalizada · sincronização pendente' : 'Finalizada'}
            winnerLabel={`Time ${game.winner} · Vencedor`}
            description="Resultado confirmado · não é possível editar."
          >
            {game.legacy_result && game.score_a === null && (
              <Typography variant="text-s" tone="secondary">
                Resultado anterior preservado. O placar não foi registrado.
              </Typography>
            )}
          </ScoreMatch>
        ) : (
          <ScoreMatch {...common} scoreContent={inputs} statusLabel="Em andamento" />
        )}
        {onOpen && (
          <Button variant="ghost" className={styles.cardOpen} onClick={onOpen}>
            Abrir {title}
          </Button>
        )}
      </div>
      {!finished && (
        <>
          {obsolete && (
            <div className={styles.stack}>
              <Typography role="alert">
                O placar mudou em outra aba. Seu texto foi mantido; confira o resultado atual antes
                de salvar.
              </Typography>
              <Button variant="secondary" onClick={() => setDirty(false)}>
                Carregar placar atualizado
              </Button>
            </div>
          )}
          {(!!a || !!b) && !valid && (
            <Typography variant="text-s" role="alert" className={styles.error}>
              Preencha os dois placares com números inteiros de 0 a 2147483647.
            </Typography>
          )}
          {valid && (
            <Badge
              size="sm"
              tone={aa === bb ? 'neutral' : 'success'}
              label={
                aa === bb
                  ? 'Empate · ajuste antes de finalizar'
                  : `Time ${aa > bb ? 'A' : 'B'} está vencendo`
              }
            />
          )}
          {pending && (
            <Typography variant="text-s" tone="secondary">
              Alterações locais · sincronização pendente
            </Typography>
          )}
          {!detail && changed && (
            <Button
              variant="secondary"
              disabled={!valid || disabled || obsolete || !changed}
              onClick={() => void save()}
            >
              Salvar placar · {title}
            </Button>
          )}
          {detail && !game.deleted_at && (footer ? createPortal(actions, footer) : actions)}
        </>
      )}
      {notice && (
        <Typography role="status" variant="text-s">
          {notice}
        </Typography>
      )}
    </div>
  );
}
