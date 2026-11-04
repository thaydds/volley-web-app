import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadPreferences, savePreferences, PREFERENCES_KEY } from './preferences';
afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});
describe('preferências locais independentes do elenco e histórico', () => {
  it.each([
    null,
    '{',
    '[]',
    '{"theme":"sepia","fontSize":"large"}',
    '{"theme":"dark","fontSize":"tiny"}',
  ])('usa padrão seguro para %s', (raw) => {
    if (raw !== null) localStorage.setItem(PREFERENCES_KEY, raw);
    expect(loadPreferences()).toEqual({ theme: 'light', fontSize: 'standard' });
  });
  it('salva e restaura os ajustes sem mudar volley-v1', () => {
    localStorage.setItem('volley-v1', '{"players":[],"matches":[]}');
    expect(savePreferences({ theme: 'dark', fontSize: 'large' })).toBe(true);
    expect(loadPreferences()).toEqual({ theme: 'dark', fontSize: 'large' });
    expect(localStorage.getItem('volley-v1')).toBe('{"players":[],"matches":[]}');
  });
  it('tolera armazenamento indisponível e informa falha ao salvar', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('full');
    });
    expect(loadPreferences()).toEqual({ theme: 'light', fontSize: 'standard' });
    expect(savePreferences({ theme: 'dark', fontSize: 'large' })).toBe(false);
  });
});
