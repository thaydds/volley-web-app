import { createPortal } from 'react-dom';
import { Badge, Button, Counter, ScoreMatch, Typography } from '@beachsports/components';
import { canFinish, type Game } from './domain';
import type { SessionScore } from './sessionScores';
import { gameTitle, names } from './gameLabels';
import styles from './LifecycleApp.module.css';
export function MatchPanel({
  game,
  pending,
  onOpen,
  onFinish,
  disabled = false,
  detail = false,
  readOnly = false,
  footer,
  draft,
  onDraftChange,
}: {
  game: Game;
  pending: boolean;
  onOpen?: () => void;
  onFinish?: (a: number, b: number) => void;
  disabled?: boolean;
  detail?: boolean;
  readOnly?: boolean;
  footer?: HTMLElement | null;
  draft: SessionScore;
  onDraftChange: (patch: Partial<SessionScore>) => void;
}) {
  const finished = game.status === 'finished';
  const obsolete = draft.version !== game.version;
  const valid =
    draft.validA && draft.validB && draft.a >= 0 && draft.a <= 99 && draft.b >= 0 && draft.b <= 99;
  const title = gameTitle(game),
    suffix = detail ? '' : ` · ${title}`;
  const common = {
    title,
    metadata: game.played_on.split('-').reverse().join('/'),
    teamA: { name: 'Time A', score: game.score_a ?? '—', players: names(game, 'A') },
    teamB: { name: 'Time B', score: game.score_b ?? '—', players: names(game, 'B') },
  };
  const counters = {
    A: (
      <Counter
        label={`Placar Time A${suffix}`}
        digits={2}
        value={draft.a}
        disabled={disabled}
        onChange={(a) => onDraftChange({ a })}
        onValidityChange={(validA) => onDraftChange({ validA })}
      />
    ),
    B: (
      <Counter
        label={`Placar Time B${suffix}`}
        digits={2}
        value={draft.b}
        disabled={disabled}
        onChange={(b) => onDraftChange({ b })}
        onValidityChange={(validB) => onDraftChange({ validB })}
      />
    ),
  };
  const actions = (
    <Button
      className={styles.full}
      disabled={disabled || obsolete || !valid || !canFinish(draft.a, draft.b)}
      onClick={() => onFinish?.(draft.a, draft.b)}
    >
      Finalizar partida
    </Button>
  );
  return (
    <div className={styles.detail}>
      <div
        className={onOpen ? styles.clickable : undefined}
        onClick={(event) => {
          if (
            onOpen &&
            event.target instanceof Element &&
            !event.target.closest('button,input,a,label,[data-counter]')
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
          >
            {game.legacy_result && game.score_a === null && (
              <Typography variant="text-s" tone="secondary">
                Placar não registrado.
              </Typography>
            )}
          </ScoreMatch>
        ) : (
          <ScoreMatch
            {...common}
            scoreLayout={readOnly ? 'columns' : 'rows'}
            scoreContent={readOnly ? undefined : counters}
            statusLabel={readOnly ? 'Arquivada' : 'Em andamento'}
            description={readOnly ? 'Somente consulta' : 'Placar de acompanhamento'}
          />
        )}
        {onOpen && (
          <Button variant="ghost" className={styles.cardOpen} onClick={onOpen}>
            Abrir {title}
          </Button>
        )}
      </div>
      {!finished && !readOnly && (
        <>
          {obsolete && (
            <div className={styles.stack}>
              <Typography role="alert">
                Esta partida foi atualizada. Revise o placar antes de finalizar.
              </Typography>
              <Button
                variant="secondary"
                onClick={() =>
                  onDraftChange({
                    version: game.version,
                    a: game.score_a ?? 0,
                    b: game.score_b ?? 0,
                    validA: (game.score_a ?? 0) <= 99,
                    validB: (game.score_b ?? 0) <= 99,
                  })
                }
              >
                Usar placar atual
              </Button>
            </div>
          )}
          {valid && draft.a !== draft.b && (
            <Badge
              size="sm"
              tone="success"
              label={`Time ${draft.a > draft.b ? 'A' : 'B'} está vencendo`}
            />
          )}
          {detail && !game.deleted_at && (footer ? createPortal(actions, footer) : actions)}
        </>
      )}
    </div>
  );
}
