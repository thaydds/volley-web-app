import { useEffect, useMemo, useState } from 'react';
import { Button, Typography } from '@beachsports/components';
import '../App.css';
import { Home } from '../home/Home';
import { OnboardingScreen } from '../home/OnboardingScreen';
import { RankingScreen } from '../home/RankingScreen';
import type { View } from '../home/navigation';
import { SettingsScreen } from '../settings/SettingsScreen';
import { loadPreferences, savePreferences, type Preferences } from '../settings/preferences';
import { RosterScreen } from '../roster/RosterScreen';
import type { Player, Teams } from '../roster/types';
import { drawTeams, movePlayer, type TeamSide } from '../matchmaking/draw';
import { DrawScreen } from '../matchmaking/DrawScreen';
import { HistoryScreen } from '../matches/HistoryScreen';
import { WinnerModal } from '../matches/WinnerModal';
import type { Match, WinnerSide } from '../matches/types';
import { formatMatchDate } from '../matches/matches';
import { Screen } from '../components/Screen';
import { ApiError, VolleyClient, isObject, type CloudMatch } from './client';
import { useSharedData } from './useSharedData';
import { importBatches, legacyDigest, readLegacy, sourceId, toIsoDate } from './legacy';
import { ImportDialog } from './ImportDialog';

const unavailableStorage: Storage = {
  get length() {
    return 0;
  },
  getItem: () => null,
  key: () => null,
  setItem: () => {
    throw new Error('storage_unavailable');
  },
  removeItem: () => {},
  clear: () => {},
};
function storage(): Storage {
  try {
    return window.localStorage;
  } catch {
    return unavailableStorage;
  }
}
function displayMatch(match: CloudMatch): Match {
  const side = (side: 'A' | 'B') =>
    match.participants
      .filter((p) => p.side === side)
      .sort((a, b) => a.position - b.position)
      .map((p) => p.name);
  return {
    number: match.number,
    date: match.played_on.split('-').reverse().join('/'),
    winner: match.winner,
    teamA: side('A'),
    teamB: side('B'),
  };
}
export function SharedApp({ apiUrl }: { apiUrl: string }) {
  const [client] = useState(() => new VolleyClient(apiUrl, storage()));
  const sync = useSharedData(client);
  const [view, setView] = useState<View>('home');
  const [preferences, setPreferences] = useState(loadPreferences);
  const [preferenceNotice, setPreferenceNotice] = useState('');
  const [teams, setTeams] = useState<Teams | null>(null);
  const [identities, setIdentities] = useState<Map<string, string>>(new Map());
  const [pendingWinner, setPendingWinner] = useState<CloudMatch | null>(null);
  const [legacy] = useState(() => readLegacy(client.storage));
  const [digest, setDigest] = useState('');
  const [importDone, setImportDone] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const presenceKey = `volley-presence-v1:${encodeURIComponent(client.url)}`;
  const [presence, setPresence] = useState<Record<string, boolean>>(() => {
    try {
      const value: unknown = JSON.parse(client.storage.getItem(presenceKey) ?? '{}');
      return isObject(value)
        ? Object.fromEntries(
            Object.entries(value).filter(
              (entry): entry is [string, boolean] => typeof entry[1] === 'boolean'
            )
          )
        : {};
    } catch {
      return {};
    }
  });
  const legacyPresence = useMemo(() => {
    const map = new Map<string, boolean>();
    try {
      const raw: unknown = JSON.parse(legacy?.raw ?? 'null');
      if (isObject(raw) && Array.isArray(raw.players))
        for (const p of raw.players)
          if (isObject(p) && typeof p.name === 'string' && typeof p.present === 'boolean')
            map.set(p.name, p.present);
    } catch {
      /* Keep legacy input untouched. */
    }
    return map;
  }, [legacy]);
  const players: Player[] = sync.data.players.map((p) => ({
    name: p.name,
    present: presence[p.id] ?? legacyPresence.get(p.name) ?? false,
  }));
  const matches = sync.data.matches.map(displayMatch).sort((a, b) => a.number - b.number);
  const archived = sync.data.archived.map(displayMatch).sort((a, b) => b.number - a.number);
  useEffect(() => {
    document.documentElement.dataset.theme = preferences.theme;
    document.documentElement.dataset.fontSize = preferences.fontSize;
    const color = getComputedStyle(document.documentElement)
      .getPropertyValue('--ds-color-bg-base')
      .trim();
    if (color) document.querySelector('meta[name="theme-color"]')?.setAttribute('content', color);
  }, [preferences]);
  useEffect(() => {
    let live = true;
    if (legacy)
      void legacyDigest(legacy)
        .then((digest) => {
          if (!live) return;
          setDigest(digest);
          try {
            setImportDone(
              client.storage.getItem(`volley-imported-v1:${encodeURIComponent(client.url)}`) ===
                digest
            );
          } catch {
            /* Offer preview without changing the original. */
          }
        })
        .catch(() => {});
    return () => {
      live = false;
    };
  }, [client, legacy]);
  function changePreferences(next: Preferences) {
    setPreferences(next);
    setPreferenceNotice(
      savePreferences(next) ? '' : 'Não foi possível salvar os ajustes neste aparelho.'
    );
  }
  async function changePlayers(next: Player[]) {
    if (sync.readOnly) return false;
    if (next.length > players.length) {
      const name = next[next.length - 1].name;
      return sync.run(async () => {
        await client.write('mutate', { name }, 'create_player');
      });
    }
    const nextPresence = Object.fromEntries(
      sync.data.players.map((p) => [p.id, next.find((n) => n.name === p.name)?.present ?? false])
    );
    setPresence(nextPresence);
    try {
      client.storage.setItem(presenceKey, JSON.stringify(nextPresence));
    } catch {
      setPreferenceNotice('Não foi possível guardar a presença neste aparelho.');
    }
    return true;
  }
  function startDraw() {
    setIdentities(new Map(sync.data.players.map((p) => [p.name, p.id])));
    setTeams(drawTeams(players.filter((p) => p.present).map((p) => p.name)));
    setView('draw');
  }
  function rematch(match: Match) {
    const game = sync.data.matches.find((m) => m.number === match.number);
    if (!game) return;
    const current = game.participants.map((p) =>
      sync.data.players.find((player) => player.id === p.player_id)
    );
    if (current.some((p) => !p)) {
      setPreferenceNotice(
        'Um participante saiu do elenco. Confira os presentes para montar outra partida.'
      );
      setView('roster');
      return;
    }
    setIdentities(new Map(current.map((p) => [p!.name, p!.id])));
    setTeams(drawTeams(current.map((p) => p!.name)));
    setView('draw');
  }
  async function finalize() {
    if (!teams) return;
    const participants = (['A', 'B'] as const).flatMap((side) =>
      teams[side].map((name, position) => ({
        player_id: identities.get(name) ?? '',
        name,
        side,
        position,
      }))
    );
    await sync.run(async () => {
      if (participants.some((p) => !p.player_id)) throw new ApiError(409, 'roster_changed');
      const played_on = toIsoDate(formatMatchDate())!;
      const result = await client.write(
        'mutate',
        {
          played_on,
          participants: participants.map(({ player_id, side }) => ({ player_id, side })),
        },
        'create_match'
      );
      setPendingWinner({
        id: String(result.id),
        number: Number(result.number),
        version: Number(result.version),
        played_on,
        winner: null,
        participants,
      });
    });
  }
  async function pickWinner(winner: WinnerSide) {
    if (!pendingWinner) return;
    const saved = await sync.run(async () => {
      await client.write(
        'mutate',
        { id: pendingWinner.id, version: pendingWinner.version, winner },
        'set_match_winner'
      );
      setPendingWinner(null);
      setTeams(null);
      setView('history');
    });
    if (!saved && !client.pending().length) setPendingWinner(null);
  }
  async function archive(number: number) {
    const game = sync.data.matches.find((m) => m.number === number);
    if (game)
      await sync.run(async () => {
        await client.write('mutate', { id: game.id, version: game.version }, 'archive_match');
      });
  }
  async function restore(match: Match) {
    const game = sync.data.archived.find((m) => m.number === match.number);
    if (game)
      await sync.run(async () => {
        await client.write('mutate', { id: game.id, version: game.version }, 'restore_match');
      });
  }
  async function importHistory(selected: Set<string>, approved: Set<string>) {
    if (!legacy) return;
    await sync.run(async () => {
      await client.resumePending();
      const batches = importBatches(legacy, selected, sourceId(client.storage), approved);
      for (const batch of batches) await client.write('import', batch);
      if (digest)
        client.storage.setItem(`volley-imported-v1:${encodeURIComponent(client.url)}`, digest);
      setImportDone(true);
      setImportOpen(false);
    }, true);
  }
  const canImport = legacy && !importDone;
  return (
    <div className="app shared-app">
      <aside className="sync-banner" aria-label="Sincronização">
        <Typography variant="text-s" role="status">
          {!sync.online
            ? 'Você está offline. Apenas consulta aos dados já carregados.'
            : sync.loading
              ? 'Carregando dados compartilhados…'
              : sync.data.syncedAt
                ? `Última atualização: ${new Date(sync.data.syncedAt).toLocaleString('pt-BR')}`
                : 'Dados ainda não carregados.'}
        </Typography>
        {!sync.online && sync.data.syncedAt && (
          <Typography variant="text-s">
            Última atualização: {new Date(sync.data.syncedAt).toLocaleString('pt-BR')}
          </Typography>
        )}
        <Button
          size="sm"
          variant="ghost"
          disabled={!sync.online || sync.busy || sync.loading}
          onClick={() => void sync.refresh()}
        >
          Atualizar dados
        </Button>
        {sync.pending && (
          <>
            <Typography role="status">
              Há um envio pendente de confirmação. Repita o envio antes de criar novos registros.
            </Typography>
            <Button
              size="sm"
              disabled={!sync.online || sync.busy}
              onClick={() =>
                void sync.resume().then((ok) => {
                  if (ok) {
                    setTeams(null);
                    setPendingWinner(null);
                    setView('home');
                  }
                })
              }
            >
              Repetir envio pendente
            </Button>
          </>
        )}
        {canImport && (
          <Button size="sm" variant="secondary" onClick={() => setImportOpen(true)}>
            Revisar histórico deste aparelho
          </Button>
        )}
        {!pendingWinner && !importOpen && sync.error && (
          <Typography role="alert">{sync.error}</Typography>
        )}
        {sync.notice && (
          <Typography variant="text-s" role="status">
            {sync.notice}
          </Typography>
        )}
        {preferenceNotice && (
          <Typography variant="text-s" role="status">
            {preferenceNotice}
          </Typography>
        )}
      </aside>
      <div className="shared-content">
        {view === 'home' && (
          <Home
            onMatches={() => setView('roster')}
            onRanking={() => setView('ranking')}
            onHistory={() => setView('history')}
            onSettings={() => setView('settings')}
          />
        )}
        {view === 'settings' && (
          <>
            <SettingsScreen
              preferences={preferences}
              onChange={changePreferences}
              onBack={() => setView('home')}
              onHelp={() => setView('onboarding')}
            />
            {legacy && (
              <Button variant="ghost" onClick={() => setImportOpen(true)}>
                Importar histórico deste aparelho
              </Button>
            )}
          </>
        )}
        {view === 'onboarding' && (
          <OnboardingScreen onStart={() => setView('roster')} onBack={() => setView('home')} />
        )}
        {!sync.loaded && ['roster', 'draw', 'ranking', 'history'].includes(view) && (
          <Screen title="Dados compartilhados" badge="Volley" onBack={() => setView('home')}>
            <Typography>
              {sync.loading
                ? 'Carregando jogadores e partidas…'
                : 'Não foi possível carregar os dados. Use Atualizar dados para tentar novamente.'}
            </Typography>
          </Screen>
        )}
        {sync.loaded && view === 'roster' && (
          <RosterScreen
            players={players}
            notice={null}
            onPlayersChange={changePlayers}
            onDraw={startDraw}
            onBack={() => setView('home')}
            readOnly={sync.readOnly || sync.loading}
          />
        )}
        {sync.loaded && view === 'draw' && teams && (
          <DrawScreen
            teams={teams}
            presentCount={teams.A.length + teams.B.length}
            onMove={(name: string, to: TeamSide) =>
              setTeams((t) => (t ? movePlayer(t, name, to) : null))
            }
            onRedraw={() => setTeams(drawTeams([...teams.A, ...teams.B]))}
            onConfirm={() => void finalize()}
            onBack={() => setView('roster')}
            readOnly={sync.readOnly || sync.loading}
          />
        )}
        {sync.loaded && view === 'ranking' && (
          <RankingScreen
            players={players}
            ranking={sync.data.ranking}
            onBack={() => setView('home')}
          />
        )}
        {sync.loaded && view === 'history' && (
          <HistoryScreen
            matches={matches}
            archivedMatches={archived}
            onDelete={(number) => void archive(number)}
            onRestore={(match) => void restore(match)}
            onRematch={rematch}
            onEditWinner={(match) =>
              setPendingWinner(sync.data.matches.find((m) => m.number === match.number) ?? null)
            }
            onBack={() => setView('home')}
            readOnly={sync.readOnly || sync.loading}
          />
        )}
      </div>
      {pendingWinner && (
        <WinnerModal
          onPick={(winner) => void pickWinner(winner)}
          onCancel={() => {
            setPendingWinner(null);
            setTeams(null);
            setView('history');
          }}
          busy={sync.busy}
          disabled={sync.busy || !sync.online || sync.pending}
          error={
            sync.pending
              ? 'O envio ficou pendente. Feche esta tela e use Repetir envio pendente.'
              : sync.error
          }
        />
      )}
      {importOpen && legacy && (
        <ImportDialog
          legacy={legacy}
          remote={[...sync.data.matches, ...sync.data.archived]}
          busy={sync.busy}
          disabled={
            !sync.online || !sync.loaded || client.pending().some((p) => p.action !== 'import')
          }
          error={sync.error}
          onConfirm={importHistory}
          onCancel={() => setImportOpen(false)}
        />
      )}
      {!sync.online && (
        <div className="offline-banner" role="status" data-testid="offline-banner">
          Offline · consulta à última atualização salva.
        </div>
      )}
    </div>
  );
}
