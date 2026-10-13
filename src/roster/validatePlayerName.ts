import type { Player } from './types';

export const MAX_NAME_LENGTH = 30;

export type NameValidation = { ok: true; name: string } | { ok: false; error: string };

function normalize(name: string): string {
  return name.trim().toLocaleLowerCase();
}

export function validatePlayerName(rawName: string, existing: Player[]): NameValidation {
  const name = rawName.trim();
  if (name.length === 0) {
    return { ok: false, error: 'Informe um nome para cadastrar.' };
  }
  if (name.length > MAX_NAME_LENGTH) {
    return { ok: false, error: `O nome deve ter no máximo ${MAX_NAME_LENGTH} caracteres.` };
  }
  const normalized = normalize(name);
  const duplicate = existing.some((p) => normalize(p.name) === normalized);
  if (duplicate) {
    return { ok: false, error: 'Esse nome já está cadastrado.' };
  }
  return { ok: true, name };
}
