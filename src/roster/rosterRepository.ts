import type { Player } from './types';

export const STORAGE_KEY = 'volley-v1';

const CORRUPT_NOTICE = 'Aviso: os dados salvos estavam inválidos e o elenco foi redefinido.';

interface StoredShape {
  players: Player[];
}

function isPlayer(value: unknown): value is Player {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.name === 'string' && typeof candidate.present === 'boolean';
}

function isStoredShape(value: unknown): value is StoredShape {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return Array.isArray(candidate.players) && candidate.players.every(isPlayer);
}

export interface LoadedRoster {
  players: Player[];
  notice: string | null;
}

export function loadRoster(): LoadedRoster {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw === null) {
    return { players: [], notice: null };
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (isStoredShape(parsed)) {
      return { players: parsed.players, notice: null };
    }
    return { players: [], notice: CORRUPT_NOTICE };
  } catch {
    return { players: [], notice: CORRUPT_NOTICE };
  }
}

export function saveRoster(players: Player[]): void {
  const shape: StoredShape = { players };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(shape));
}
