import { useEffect, useMemo, useState } from 'react';
import { Button, Typography } from '@beachsports/components';
import { Modal } from '../components/Modal';
import { Screen } from '../components/Screen';
import { possibleDuplicate, type LegacyData } from './legacy';
import type { CloudMatch } from './client';
interface Props {
  legacy: LegacyData;
  remote: CloudMatch[];
  busy: boolean;
  disabled: boolean;
  error: string;
  onConfirm: (selected: Set<string>, approved: Set<string>) => Promise<void>;
  onCancel: () => void;
}
export function ImportDialog({
  legacy,
  remote,
  busy,
  disabled,
  error,
  onConfirm,
  onCancel,
}: Props) {
  const [selected, setSelected] = useState(
    () => new Set(legacy.games.filter((g) => !possibleDuplicate(g, remote)).map((g) => g.key))
  );
  const [approved, setApproved] = useState(new Set<string>());
  useEffect(() => {
    setSelected((current) => {
      const next = new Set(
        [...current].filter(
          (key) =>
            approved.has(key) ||
            !legacy.games.some((game) => game.key === key && possibleDuplicate(game, remote))
        )
      );
      return next.size === current.size ? current : next;
    });
  }, [remote, approved, legacy.games]);
  const backup = useMemo(
    () => URL.createObjectURL(new Blob([legacy.raw], { type: 'application/json' })),
    [legacy.raw]
  );
  useEffect(() => () => URL.revokeObjectURL(backup), [backup]);
  return (
    <Modal
      label="Importar histórico deste aparelho"
      testId="import-dialog"
      fullscreen
      onCancel={() => {
        if (!busy) onCancel();
      }}
    >
      <Screen
        title="Importar deste aparelho"
        badge="Histórico local"
        onBack={() => {
          if (!busy) onCancel();
        }}
        footer={
          <>
            <Button
              disabled={disabled || busy || (!legacy.players.length && !selected.size)}
              onClick={() => void onConfirm(selected, approved)}
              data-testid="import-confirm"
            >
              {busy ? 'Importando…' : 'Confirmar importação'}
            </Button>
            <Button variant="secondary" disabled={busy} onClick={onCancel}>
              Agora não
            </Button>
          </>
        }
      >
        <Typography>
          {legacy.players.length} jogadores e {legacy.games.length} partidas válidas encontrados
          neste aparelho.
        </Typography>
        <Typography>
          Jogadores com o mesmo nome serão reaproveitados. Os números das partidas serão definidos
          pela base compartilhada. A cópia original deste aparelho será preservada.
        </Typography>
        <a href={backup} download="volley-historico-local.json">
          Baixar cópia original
        </a>
        {legacy.problems.map((problem, index) => (
          <Typography role="status" key={index}>
            {problem}
          </Typography>
        ))}
        {legacy.games.length > 0 && (
          <Typography>
            Confira cada partida. Possíveis duplicatas começam desmarcadas; marque apenas se for
            outro jogo.
          </Typography>
        )}
        <ul className="stack plain-list">
          {legacy.games.map((game) => (
            <li key={game.key}>
              <label className="import-choice">
                <input
                  type="checkbox"
                  checked={selected.has(game.key)}
                  disabled={busy}
                  onChange={(event) => {
                    const checked = event.target.checked;
                    setApproved((current) => {
                      const next = new Set(current);
                      if (checked && possibleDuplicate(game, remote)) next.add(game.key);
                      else next.delete(game.key);
                      return next;
                    });
                    setSelected((current) => {
                      const next = new Set(current);
                      if (checked) next.add(game.key);
                      else next.delete(game.key);
                      return next;
                    });
                  }}
                />
                <span>
                  Partida local #{game.number} · {game.played_on.split('-').reverse().join('/')}
                  <br />
                  {game.team_a.join(', ')} × {game.team_b.join(', ')}
                  <br />
                  {game.winner ? `Time ${game.winner} venceu` : 'Sem vencedor'}
                  {possibleDuplicate(game, remote)
                    ? ' · Pode já existir na base (incluindo removidas)'
                    : ''}
                </span>
              </label>
            </li>
          ))}
        </ul>
        {error && <Typography role="alert">{error}</Typography>}
      </Screen>
    </Modal>
  );
}
