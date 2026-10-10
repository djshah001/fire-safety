import { useAtom } from 'jotai';
import { Laptop, Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { themeAtom, type ThemePreference } from '@/store/theme';

const choices: Array<{ value: ThemePreference; label: string; icon: typeof Sun }> = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Laptop },
];

export function ThemeToggle() {
  const [theme, setTheme] = useAtom(themeAtom);

  return (
    <div aria-label="Theme" className="inline-flex rounded-xl border border-border bg-card p-1" role="group">
      {choices.map(({ value, label, icon: Icon }) => (
        <Tooltip key={value}>
          <TooltipTrigger asChild>
            <Button
              aria-label={`${label} theme`}
              aria-pressed={theme === value}
              className="min-h-10 gap-2 rounded-lg text-muted-foreground aria-pressed:bg-primary aria-pressed:text-primary-foreground"
              onClick={() => setTheme(value)}
              size="sm"
              type="button"
              variant="ghost"
            >
              <Icon aria-hidden="true" size={16} />
              <span className="hidden sm:inline">{label}</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent className="sm:hidden">{label} theme</TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
}
