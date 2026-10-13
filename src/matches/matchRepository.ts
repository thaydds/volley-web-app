import { STORAGE_KEY } from '../roster/rosterRepository';
import type { Match, WinnerSide } from './types';

const CORRUPT_MATCHES_NOTICE = 'Aviso: o histórico de partidas estava inválido e foi redefinido.';

export interface LoadedMatches {
  matches: Match[];
  notice: string | null;
}

function isWinner(value: unknown): value is WinnerSide | null {
  return value === null || value === 'A' || value === 'B';
}

function isMatch(value: unknown): value is Match {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.number === 'number' &&
    Number.isInteger(candidate.number) &&
    candidate.number > 0 &&
    typeof candidate.date === 'string' &&
    Array.isArray(candidate.teamA) &&
    (candidate.teamA as unknown[]).every((n) => typeof n === 'string') &&
    Array.isArray(candidate.teamB) &&
    (candidate.teamB as unknown[]).every((n) => typeof n === 'string') &&
    isWinner(candidate.winner)
  );
}

function readRoot(): Record<string, unknown> {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw === null) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed === 'object' && parsed !== null) return parsed as Record<string, unknown>;
    return {};
  } catch {
    return {};
  }
}

export function loadMatches(): LoadedMatches {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw === null) return { matches: [], notice: null };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { matches: [], notice: CORRUPT_MATCHES_NOTICE };
  }
  if (typeof parsed !== 'object' || parsed === null) {
    return { matches: [], notice: CORRUPT_MATCHES_NOTICE };
  }
  const slice = (parsed as Record<string, unknown>).matches;
  if (slice === undefined) return { matches: [], notice: null };
  if (Array.isArray(slice) && slice.every(isMatch)) {
    return { matches: slice, notice: null };
  }
  return { matches: [], notice: CORRUPT_MATCHES_NOTICE };
}

/** Salva só a fatia matches, preservando as demais (ex.: players). */
export function saveMatches(matches: Match[]): void {
  const root = readRoot();
  root.matches = matches;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(root));
}
