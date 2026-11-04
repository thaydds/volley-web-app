export type Theme = 'light' | 'dark';
export type FontSize = 'standard' | 'large' | 'extra-large';
export interface Preferences {
  theme: Theme;
  fontSize: FontSize;
}
export const PREFERENCES_KEY = 'volley-preferences-v1';
export function loadPreferences(): Preferences {
  try {
    const p: unknown = JSON.parse(localStorage.getItem(PREFERENCES_KEY) ?? 'null');
    if (
      p &&
      typeof p === 'object' &&
      'theme' in p &&
      'fontSize' in p &&
      (p.theme === 'light' || p.theme === 'dark') &&
      (p.fontSize === 'standard' || p.fontSize === 'large' || p.fontSize === 'extra-large')
    )
      return p as Preferences;
  } catch {
    /* Unavailable/corrupt preferences fall back without touching match data. */
  }
  return { theme: 'light', fontSize: 'standard' };
}
export function savePreferences(preferences: Preferences) {
  try {
    localStorage.setItem(PREFERENCES_KEY, JSON.stringify(preferences));
    return true;
  } catch {
    return false;
  }
}
