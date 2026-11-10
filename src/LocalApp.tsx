import { useState, useEffect } from 'react';
import './App.css';
import { SettingsScreen } from './settings/SettingsScreen';
import { loadPreferences, savePreferences, type Preferences } from './settings/preferences';
import { OnboardingScreen } from './home/OnboardingScreen';
import { Home } from './home/Home';
import { RankingScreen } from './home/RankingScreen';
import type { View } from './home/navigation';
import { drawTeams, movePlayer } from './matchmaking/draw';
import type { TeamSide } from './matchmaking/draw';
import { DrawScreen } from './matchmaking/DrawScreen';
import { WinnerModal } from './matches/WinnerModal';
import { HistoryScreen } from './matches/HistoryScreen';
import type { Match, WinnerSide } from './matches/types';
import { createMatch, formatMatchDate, nextMatchNumber } from './matches/matches';
import { loadMatches, saveMatches } from './matches/matchRepository';
import type { LoadedMatches } from './matches/matchRepository';
import { presentPlayers } from './roster/roster';
import { loadRoster, saveRoster } from './roster/rosterRepository';
import type { LoadedRoster } from './roster/rosterRepository';
import { RosterScreen } from './roster/RosterScreen';
import type { Player, Teams } from './roster/types';

function App() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [view, setView] = useState<View>('home');
  const [preferences, setPreferences] = useState(loadPreferences);
  const [preferencesNotice, setPreferencesNotice] = useState('');
  useEffect(() => {
    document.documentElement.dataset.theme = preferences.theme;
    document.documentElement.dataset.fontSize = preferences.fontSize;
    const color = getComputedStyle(document.documentElement)
      .getPropertyValue('--ds-color-bg-base')
      .trim();
    if (color) document.querySelector('meta[name="theme-color"]')?.setAttribute('content', color);
  }, [preferences]);
  function handlePreferences(next: Preferences) {
    setPreferences(next);
    setPreferencesNotice(
      savePreferences(next) ? '' : 'Não foi possível salvar os ajustes neste aparelho.'
    );
  }
  const [initial] = useState<LoadedRoster>(loadRoster);
  const [players, setPlayers] = useState<Player[]>(initial.players);
  const [notice] = useState<string | null>(initial.notice);
  const [teams, setTeams] = useState<Teams | null>(null);
  const [matchesInitial] = useState<LoadedMatches>(loadMatches);
  const [matches, setMatches] = useState<Match[]>(matchesInitial.matches);
  const [matchesNotice] = useState<string | null>(matchesInitial.notice);
  const [pendingWinner, setPendingWinner] = useState<Match | null>(null);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  function handlePlayersChange(next: Player[]): void {
    setPlayers(next);
    saveRoster(next);
  }

  function handleDraw(): void {
    const names = presentPlayers(players).map((p) => p.name);
    setTeams(drawTeams(names));
    setView('draw');
  }

  function handleMove(name: string, toSide: TeamSide): void {
    setTeams((current) => (current === null ? current : movePlayer(current, name, toSide)));
  }

  function handleFinalize(): void {
    if (teams === null) return;
    const created = createMatch(teams, formatMatchDate(new Date()), nextMatchNumber(matches));
    const next = [...matches, created];
    setMatches(next);
    saveMatches(next);
    setPendingWinner(created);
  }

  function handleWinnerPick(winner: WinnerSide): void {
    if (pendingWinner === null) return;
    const next = matches.map((m) => (m.number === pendingWinner.number ? { ...m, winner } : m));
    setMatches(next);
    saveMatches(next);
    setPendingWinner(null);
    setView('history');
  }

  function handleWinnerCancel(): void {
    setPendingWinner(null);
    setView('history');
  }

  function handleDelete(number: number): void {
    const next = matches.filter((m) => m.number !== number);
    setMatches(next);
    saveMatches(next);
  }

  function handleRematch(match: Match): void {
    setTeams(drawTeams([...match.teamA, ...match.teamB]));
    setView('draw');
  }

  return (
    <div className="app">
      {view === 'home' && (
        <Home
          onMatches={() => setView('roster')}
          onRanking={() => setView('ranking')}
          onHistory={() => setView('history')}
          onSettings={() => setView('settings')}
        />
      )}

      {view === 'settings' && (
        <SettingsScreen
          onHelp={() => setView('onboarding')}
          preferences={preferences}
          onChange={handlePreferences}
          onBack={() => setView('home')}
        />
      )}
      {view === 'onboarding' && (
        <OnboardingScreen onStart={() => setView('roster')} onBack={() => setView('home')} />
      )}
      {preferencesNotice && <p role="status">{preferencesNotice}</p>}
      {view === 'roster' && (
        <RosterScreen
          players={players}
          notice={notice}
          onPlayersChange={handlePlayersChange}
          onDraw={handleDraw}
          onBack={() => setView('home')}
        />
      )}

      {view === 'draw' && teams !== null && (
        <DrawScreen
          teams={teams}
          presentCount={teams.A.length + teams.B.length}
          onMove={handleMove}
          onRedraw={() => {
            if (teams) setTeams(drawTeams([...teams.A, ...teams.B]));
          }}
          onConfirm={handleFinalize}
          onBack={() => setView('roster')}
        />
      )}

      {pendingWinner !== null && (
        <WinnerModal onPick={handleWinnerPick} onCancel={handleWinnerCancel} />
      )}

      {view === 'history' && (
        <HistoryScreen
          matches={matches}
          onDelete={handleDelete}
          onRematch={handleRematch}
          onBack={() => setView('home')}
        />
      )}

      {view === 'ranking' && (
        <RankingScreen matches={matches} players={players} onBack={() => setView('home')} />
      )}

      {matchesNotice !== null && (
        <div className="offline-banner" role="status" data-testid="matches-notice">
          {matchesNotice}
        </div>
      )}

      {!isOnline && (
        <div className="offline-banner" role="status" data-testid="offline-banner">
          📴 Você está offline. O app continua funcionando com dados em cache.
        </div>
      )}
    </div>
  );
}

export default App;
