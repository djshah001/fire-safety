import { atomWithStorage } from 'jotai/utils';

export type ThemePreference = 'light' | 'dark' | 'system';

export const themeAtom = atomWithStorage<ThemePreference>('fire-safety-theme', 'system');
