import { useAtomValue } from 'jotai';
import { useEffect, type PropsWithChildren } from 'react';
import { themeAtom } from '@/store/theme';

function applyTheme(preference: 'light' | 'dark' | 'system') {
  const shouldUseDark =
    preference === 'dark' ||
    (preference === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);

  document.documentElement.classList.toggle('dark', shouldUseDark);
  document.documentElement.style.colorScheme = shouldUseDark ? 'dark' : 'light';
}

export function ThemeProvider({ children }: PropsWithChildren) {
  const preference = useAtomValue(themeAtom);

  useEffect(() => {
    applyTheme(preference);
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => preference === 'system' && applyTheme(preference);
    media.addEventListener('change', handleChange);
    return () => media.removeEventListener('change', handleChange);
  }, [preference]);

  return children;
}
