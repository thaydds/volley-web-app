import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Badge, Button, Card, Loading, Typography } from '@beachsports/components';
import { Page } from './Page';
import { DialogViews, type Dialog } from './DialogViews';
import { HomeScreen } from './HomeScreen';
import { ConflictDialog } from './ConflictDialog';
import { PresenceScreen } from './PresenceScreen';
import { PrepTeams } from './PrepTeams';
import { MatchPanel } from './MatchPanel';
import { gameTitle } from './gameLabels';
import { useLifecycle } from './useLifecycle';
import { usePresenceSelection } from './usePresenceSelection';
import {
  canonicalName,
  displayName,
  today,
  standings,
  type Game,
  type Side,
  type Snapshot,
} from './domain';
import { lifecycleError } from './engine';
import { drawTeams } from '../matchmaking/draw';
import { loadPreferences, savePreferences, type Preferences } from '../settings/preferences';
import { SettingsScreen } from '../settings/SettingsScreen';
import { RankingScreen } from '../home/RankingScreen';
import { ImportDialog } from '../shared/ImportDialog';
import { importBatches, readLegacy, sourceId } from '../shared/legacy';
import type { CloudMatch } from '../shared/client';
import styles from './LifecycleApp.module.css';
import '../App.css';
type View = 'home' | 'roster' | 'pregame' | 'matches' | 'game' | 'settings' | 'ranking' | 'help';
const servingSide = (): Side => (crypto.getRandomValues(new Uint8Array(1))[0] < 128 ? 'A' : 'B');
function download(data: unknown, name: string) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function LifecycleApp({ apiUrl }: { apiUrl: string }) {
  const sync = useLifecycle(apiUrl);
  const { engine, state, data } = sync;
  const selection = usePresenceSelection({
    presence: state.presence,
    locked: sync.locked,
    store: engine.store,
    reload: sync.reload,
    onError: sync.setError,
  });
  const [view, setView] = useState<View>(() =>
    /^#match=[a-f\d-]+$/.test(location.hash) ? 'game' : 'home'
  );
  const [gameId, setGameId] = useState(() =>
    location.hash.startsWith('#match=') ? location.hash.slice(7) : ''
  );
  const [tab, setTab] = useState<'in_progress' | 'finished'>('in_progress');
  const [archived, setArchived] = useState(false);
  const [preferences, setPreferences] = useState(loadPreferences);
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState('');
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [gameFooter, setGameFooter] = useState<HTMLDivElement | null>(null);
  const [word, setWord] = useState('');
  const [conflictRemote, setConflictRemote] = useState<Snapshot | null>(null);
  const [dialogError, setDialogError] = useState('');
  const [dialogBusy, setDialogBusy] = useState(false);
  const confirming = useRef(false);
  const wordRef = useRef<HTMLInputElement>(null);
  const [legacy] = useState(() => readLegacy(engine.transport.storage));
  const [importOpen, setImportOpen] = useState(false);
  useEffect(() => {
    document.documentElement.dataset.theme = preferences.theme;
    document.documentElement.dataset.fontSize = preferences.fontSize;
    const color = getComputedStyle(document.documentElement)
      .getPropertyValue('--ds-color-bg-base')
      .trim();
    if (color) document.querySelector('meta[name="theme-color"]')?.setAttribute('content', color);
  }, [preferences]);
  useEffect(() => {
    if (dialogError && dialog?.kind === 'deactivate') wordRef.current?.focus();
  }, [dialogError, dialog?.kind]);
  useEffect(() => {
    if (dialog?.kind !== 'conflict') return;
    let live = true;
    setConflictRemote(null);
    void engine.transport
      .readState()
      .then((remote) => {
        if (live) setConflictRemote(remote);
      })
      .catch((error) => {
        if (live) setDialogError(lifecycleError(error));
      });
    return () => {
      live = false;
    };
  }, [dialog, engine]);
  const active =
    data?.players
      .filter((p) => !p.deleted_at)
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')) ?? [];
  const selected = active.filter((p) => selection.presence.includes(p.id));
  const pendingFor = (id: string) => state.queue.some((c) => c.input.id === id);
  function go(next: View) {
    sync.setError('');
    setView(next);
    if (next !== 'game') history.replaceState(null, '', location.pathname + location.search);
  }
  function openGame(game: Game) {
    setGameId(game.id);
    history.replaceState(null, '', `#match=${game.id}`);
    go('game');
  }
  function modal(next: Dialog) {
    setDialog(next);
    setDialogError('');
    setWord('');
  }
  async function closeDialog() {
    if (dialogBusy) return;
    if (dialog?.kind === 'deactivate') await engine.cancelDeactivation().catch(() => {});
    setWord('');
    setDialogError('');
    setDialog(null);
  }
  async function local(change: (s: typeof state) => void) {
    return sync.run(() => engine.store.edit(change));
  }
  async function add(event: FormEvent) {
    event.preventDefault();
    if (!data || sync.locked) return;
    const trimmed = displayName(name);
    if (!trimmed || [...trimmed].length > 30) {
      setNameError('Informe um nome com até 30 caracteres.');
      return;
    }
    const candidates = data.players.filter((p) => canonicalName(p.name) === canonicalName(trimmed));
    if (candidates.some((p) => !p.deleted_at)) {
      setNameError(
        'Já existe um jogador ativo com esse nome. Use um nome que diferencie as pessoas.'
      );
      return;
    }
    if (candidates.length) {
      modal({
        kind: 'reactivate',
        candidates,
        selected: candidates.length === 1 ? candidates[0].id : '',
      });
      return;
    }
    const id = crypto.randomUUID();
    const result = await sync.run(() => engine.append('create_player', { id, name: trimmed }));
    if (result.ok) {
      setName('');
      setNameError('');
    }
  }
  async function prepare(ids: string[]) {
    if (!data || ids.length < 2) return;
    if (ids.some((id) => !active.some((p) => p.id === id))) {
      go('roster');
      sync.setError(
        'Um participante está desativado. Confira quem veio hoje antes de preparar outra partida.'
      );
      return;
    }
    const teams = drawTeams(ids);
    const result = await local((s) => {
      s.draft = { ...teams, servingSide: servingSide() };
    });
    if (result.ok) go('pregame');
  }
  async function move(id: string, to: Side) {
    await local((s) => {
      if (!s.draft) return;
      s.draft.A = s.draft.A.filter((p) => p !== id);
      s.draft.B = s.draft.B.filter((p) => p !== id);
      s.draft[to].push(id);
    });
  }
  async function start() {
    if (!state.draft || !data) return;
    const draft = state.draft;
    const id = crypto.randomUUID();
    const participants = (['A', 'B'] as const).flatMap((side) =>
      draft[side].map((player_id) => ({ player_id, side }))
    );
    const result = await sync.run(() =>
      engine.append('start_match', {
        id,
        played_on: today(),
        serving_side: draft.servingSide,
        participants,
      })
    );
    if (result.ok) {
      setGameId(id);
      history.replaceState(null, '', `#match=${id}`);
      go('game');
    }
  }
  async function save(game: Game, a: number, b: number) {
    const result = await sync.run(() =>
      engine.append('save_score', { id: game.id, version: game.version, score_a: a, score_b: b })
    );
    return result.ok;
  }
  async function confirm() {
    if (!dialog || confirming.current) return;
    confirming.current = true;
    setDialogBusy(true);
    setDialogError('');
    try {
      if (dialog.kind === 'deactivate') {
        await engine.deactivate(dialog.player.id, word);
        await sync.reload();
        setWord('');
        setDialog(null);
      }
      if (dialog.kind === 'reactivate') {
        const player = dialog.candidates.find((p) => p.id === dialog.selected);
        if (!player) return;
        await engine.append('reactivate_player', { id: player.id, version: player.version });
        await sync.reload();
        setName('');
        setNameError('');
        setDialog(null);
      }
      if (dialog.kind === 'finish') {
        await engine.append('finish_match', {
          id: dialog.game.id,
          version: dialog.game.version,
          score_a: dialog.a,
          score_b: dialog.b,
        });
        await sync.reload();
        setDialog(null);
        setTab('finished');
      }
      if (dialog.kind === 'conflict') {
        await engine.useServer(dialog.requestId);
        await sync.reload();
        setDialog(null);
      }
      if (dialog.kind === 'discardLegacy') {
        await engine.discardLegacy();
        await sync.reload();
        setDialog(null);
      }
    } catch (error) {
      setDialogError(lifecycleError(error));
      await sync.reload().catch(() => {});
    } finally {
      confirming.current = false;
      setDialogBusy(false);
    }
  }
  async function importHistory(chosen: Set<string>, approved: Set<string>) {
    const result = await sync.run(async () => {
      if (
        !legacy ||
        !navigator.onLine ||
        state.queue.length ||
        state.deactivation ||
        state.legacyPending.length
      )
        throw new Error('pending_request');
      engine.transport.assertLegacyJournalReadable();
      try {
        for (const batch of importBatches(
          legacy,
          chosen,
          sourceId(engine.transport.storage),
          approved
        ))
          await engine.transport.write('import', batch);
      } finally {
        const pending = engine.transport.pending();
        if (pending.length)
          await engine.store.edit((s) => {
            s.legacyPending = pending;
          });
      }
      await engine.refresh();
    });
    if (result.ok) setImportOpen(false);
  }
  async function backup() {
    try {
      download(await engine.backup(), 'volley-backup.json');
    } catch (error) {
      sync.setError(lifecycleError(error));
    }
  }
  function changePreferences(next: Preferences) {
    setPreferences(next);
    if (!savePreferences(next))
      sync.setError('Não foi possível guardar os ajustes neste aparelho.');
  }
  const queueProblem = state.queue.find((c) => c.error && c.error !== 'uncertain');
  const alert = sync.error ? (
    <Typography role="alert" className={styles.error}>
      {sync.error}
    </Typography>
  ) : null;
  if (!sync.ready)
    return (
      <div className={styles.shell}>
        <main className={styles.center} aria-label="Carregamento" aria-busy="true">
          <Loading size="lg" label="Carregando jogadores e partidas" />
        </main>
      </div>
    );
  if (!data)
    return (
      <div className={styles.shell}>
        <Page title="Não foi possível carregar" badge="VÔLEI">
          <Typography>
            Os dados não estão disponíveis neste aparelho. Conecte-se e tente novamente.
          </Typography>
          {alert}
          <Button onClick={() => void sync.retryInitial()}>Tentar novamente</Button>
          <Button variant="ghost" onClick={() => void backup()}>
            Exportar backup local
          </Button>
        </Page>
      </div>
    );
  const collection = archived ? data.archived : data.matches;
  const game = [...data.matches, ...data.archived].find((m) => m.id === gameId);
  const offlineFinal = game?.status === 'finished' && pendingFor(game.id);
  const status = sync.syncing
    ? 'Sincronizando…'
    : !sync.online
      ? sync.pending
        ? 'Offline · alterações pendentes'
        : 'Offline · dados salvos'
      : queueProblem
        ? 'Conflito · revisão necessária'
        : state.queue.some((c) => c.error === 'uncertain')
          ? 'Resposta incerta · alterações preservadas'
          : sync.pending
            ? `${sync.pending} ${sync.pending === 1 ? 'alteração pendente' : 'alterações pendentes'}`
            : sync.error
              ? 'Falha na sincronização'
              : 'Tudo sincronizado';
  return (
    <div className={styles.shell}>
      {view === 'home' && (
        <HomeScreen
          status={status}
          syncedAt={state.base?.syncedAt}
          online={sync.online}
          locked={sync.locked}
          syncing={sync.syncing}
          pending={sync.pending}
          error={sync.error}
          onSync={() => void sync.synchronize()}
          onRanking={() => go('ranking')}
          onMatches={() => {
            setArchived(false);
            go('matches');
          }}
          onSettings={() => go('settings')}
          onRoster={() => go('roster')}
        >
          {queueProblem && (
            <Button
              variant="secondary"
              onClick={() => modal({ kind: 'conflict', requestId: queueProblem.request_id })}
            >
              Revisar conflito
            </Button>
          )}
          {state.deactivation && (
            <Button
              variant="secondary"
              disabled={!sync.online}
              onClick={() => {
                const player = data.players.find((p) => p.id === state.deactivation?.input.id);
                if (player) modal({ kind: 'deactivate', player });
              }}
            >
              Revisar desativação pendente
            </Button>
          )}
          {!!state.legacyPending.length && (
            <Card
              title="Envios da versão anterior"
              description="O backup foi preservado. Verifique o que já foi confirmado antes de continuar."
            >
              <div className={styles.stack}>
                <Button
                  variant="secondary"
                  disabled={!sync.online || sync.locked}
                  onClick={() => void sync.run(() => engine.recoverLegacy())}
                >
                  Verificar envios antigos
                </Button>
                <Button variant="ghost" onClick={() => void backup()}>
                  Exportar backup
                </Button>
                <Button variant="ghost" onClick={() => modal({ kind: 'discardLegacy' })}>
                  Revisar descarte dos envios antigos
                </Button>
              </div>
            </Card>
          )}
        </HomeScreen>
      )}
      {view === 'roster' && (
        <PresenceScreen
          active={active}
          presence={selection.presence}
          saving={selection.pending}
          locked={sync.locked || selection.recovering}
          error={sync.error}
          name={name}
          nameError={nameError}
          onName={(value) => {
            setName(value);
            setNameError('');
          }}
          onBack={() => go('home')}
          onPresence={selection.toggle}
          onPrepare={() => void prepare(selected.map((p) => p.id))}
          onDeactivate={(player) => modal({ kind: 'deactivate', player })}
          onAdd={(event) => void add(event)}
        />
      )}
      {view === 'pregame' && state.draft && (
        <PrepTeams
          draft={state.draft}
          players={active}
          disabled={sync.locked}
          error={sync.error}
          onBack={() => go('roster')}
          onMove={move}
          onRedraw={() => void prepare([...state.draft!.A, ...state.draft!.B])}
          onStart={() => void start()}
        />
      )}
      {view === 'pregame' && !state.draft && (
        <Page title="Prepare os times" onBack={() => go('roster')}>
          <Button onClick={() => go('roster')}>Quem veio hoje?</Button>
        </Page>
      )}
      {view === 'matches' && (
        <Page
          title={
            archived
              ? 'Histórico arquivado'
              : tab === 'in_progress'
                ? 'Partidas em andamento'
                : 'Partidas finalizadas'
          }
          description={`${collection.filter((m) => m.status === tab).length} partidas · toque para acompanhar o placar.`}
          badge={tab === 'in_progress' ? 'Em andamento' : 'Finalizadas'}
          onBack={() => go('home')}
          footer={
            <Button variant="secondary" className={styles.full} onClick={() => go('roster')}>
              Preparar nova partida
            </Button>
          }
        >
          <div className={styles.tabs} role="group" aria-label="Filtrar partidas">
            <Button
              variant={tab === 'in_progress' ? 'primary' : 'secondary'}
              aria-pressed={tab === 'in_progress'}
              onClick={() => setTab('in_progress')}
            >
              Em andamento
            </Button>
            <Button
              variant={tab === 'finished' ? 'primary' : 'secondary'}
              aria-pressed={tab === 'finished'}
              onClick={() => setTab('finished')}
            >
              Finalizadas
            </Button>
          </div>
          {alert}
          <ul className={styles.list}>
            {collection
              .filter((m) => m.status === tab)
              .map((m) => (
                <li key={m.id}>
                  <MatchPanel
                    game={m}
                    readOnly={archived}
                    pending={pendingFor(m.id)}
                    disabled={sync.locked || !!m.deleted_at}
                    onOpen={() => openGame(m)}
                    onSave={(a, b) => save(m, a, b)}
                  />
                </li>
              ))}
          </ul>
          {!collection.some((m) => m.status === tab) && (
            <Typography>
              Nenhuma partida {tab === 'in_progress' ? 'em andamento' : 'finalizada'}.
            </Typography>
          )}
        </Page>
      )}
      {view === 'game' && game && (
        <Page
          title={game.status === 'finished' ? 'Partida finalizada' : gameTitle(game)}
          description={
            game.status === 'finished'
              ? 'Resultado confirmado · não é possível editar.'
              : data.archived.some((m) => m.id === game.id)
                ? 'Histórico arquivado anterior · somente consulta.'
                : 'Em andamento · participantes definidos no pré-jogo.'
          }
          badge={gameTitle(game)}
          onBack={() => go('matches')}
          footer={
            game.status === 'finished' ? (
              <>
                <Button
                  className={styles.full}
                  onClick={() => void prepare(game.participants.map((p) => p.player_id))}
                >
                  Revanche
                </Button>
                <Button className={styles.full} variant="secondary" onClick={() => go('roster')}>
                  Quem veio hoje?
                </Button>
              </>
            ) : data.archived.some((m) => m.id === game.id) ? null : (
              <div ref={setGameFooter} className={styles.stack} />
            )
          }
        >
          {offlineFinal && (
            <Badge size="sm" tone="info" label="Finalizada · sincronização pendente" />
          )}
          {alert}
          <MatchPanel
            key={game.id}
            game={game}
            readOnly={data.archived.some((m) => m.id === game.id)}
            pending={pendingFor(game.id)}
            detail
            footer={gameFooter}
            disabled={sync.locked || !!game.deleted_at}
            onSave={(a, b) => save(game, a, b)}
            onFinish={game.deleted_at ? undefined : (a, b) => modal({ kind: 'finish', game, a, b })}
          />
        </Page>
      )}
      {view === 'game' && !game && (
        <Page title="Partida indisponível" onBack={() => go('matches')}>
          <Typography>Atualize os dados na Home ou consulte a lista de partidas.</Typography>
        </Page>
      )}
      {view === 'ranking' && (
        <RankingScreen
          players={active.map((p) => ({ name: p.name, present: state.presence.includes(p.id) }))}
          ranking={standings(data)}
          onBack={() => go('home')}
        />
      )}
      {view === 'help' && (
        <Page title="Como funciona" badge="Ajuda" onBack={() => go('settings')}>
          <Typography>
            1. Marque quem veio hoje e cadastre novos jogadores na mesma tela.
          </Typography>
          <Typography>
            2. Sorteie os times, mova os jogadores e confira quem começa no saque e escolhe o lado.
          </Typography>
          <Typography>
            3. Inicie a partida, registre os dois placares e confirme a finalização. Depois de
            finalizar, o resultado fica somente para consulta.
          </Typography>
          <Typography>
            4. Na Home, use Sincronizar quando houver conexão para enviar suas alterações e buscar
            as de outros dispositivos.
          </Typography>
          <Typography variant="text-s">
            Você pode preparar, iniciar e finalizar offline com os dados já carregados. Desativar
            jogador exige conexão e autorização.
          </Typography>
        </Page>
      )}
      {view === 'settings' && (
        <SettingsScreen
          preferences={preferences}
          onChange={changePreferences}
          onBack={() => go('home')}
          onHelp={() => go('help')}
        >
          <div className={styles.stack}>
            {alert}
            <Button variant="secondary" onClick={() => void backup()}>
              Exportar backup local
            </Button>
            {legacy && (
              <Button
                variant="secondary"
                disabled={!sync.online || sync.locked || sync.pending > 0}
                onClick={() => setImportOpen(true)}
              >
                Importar histórico deste aparelho
              </Button>
            )}
            {!!data.archived.length && (
              <Button
                variant="ghost"
                onClick={() => {
                  setArchived(true);
                  setTab('finished');
                  go('matches');
                }}
              >
                Histórico arquivado anterior ({data.archived.length})
              </Button>
            )}
          </div>
        </SettingsScreen>
      )}
      {dialog?.kind === 'conflict' && (
        <ConflictDialog
          queue={state.queue}
          requestId={dialog.requestId}
          local={data}
          remote={conflictRemote}
          error={dialogError}
          busy={dialogBusy}
          online={sync.online}
          onBackup={() => void backup()}
          onUseServer={() => void confirm()}
          onClose={() => void closeDialog()}
        />
      )}
      <DialogViews
        dialog={dialog}
        busy={dialogBusy}
        error={dialogError}
        online={sync.online}
        pendingQueue={state.queue.length + state.legacyPending.length}
        legacyCount={state.legacyPending.length}
        word={word}
        wordRef={wordRef}
        onWord={(value) => {
          setWord(value);
          setDialogError('');
        }}
        onSelect={(id) => {
          if (dialog?.kind === 'reactivate') setDialog({ ...dialog, selected: id });
        }}
        onClose={() => void closeDialog()}
        onConfirm={() => void confirm()}
        onBackup={() => void backup()}
      />
      {importOpen && legacy && (
        <ImportDialog
          legacy={legacy}
          remote={
            [...state.base!.matches, ...state.base!.archived].map((m) => ({
              ...m,
              number: m.number ?? 0,
            })) as CloudMatch[]
          }
          busy={sync.busy}
          disabled={!sync.online || sync.locked || sync.pending > 0}
          error={sync.error}
          onCancel={() => setImportOpen(false)}
          onConfirm={importHistory}
        />
      )}
    </div>
  );
}
