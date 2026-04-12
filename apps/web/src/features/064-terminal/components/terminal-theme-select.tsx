'use client';

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useSDKSetting } from '@/lib/sdk/use-sdk-setting';
import { Check, Palette } from 'lucide-react';
import { useState } from 'react';
import { TERMINAL_THEMES } from '../lib/terminal-themes';

/**
 * Compact theme picker for the terminal header.
 * Renders a Palette icon that opens a grouped popover of all 25 themes.
 * Reads/writes the `terminal.colorTheme` SDK setting directly.
 */
export function TerminalThemeSelect() {
  const [themeId, setThemeId] = useSDKSetting<string>('terminal.colorTheme');
  const [open, setOpen] = useState(false);

  const darkThemes = TERMINAL_THEMES.filter((t) => t.category === 'dark');
  const lightThemes = TERMINAL_THEMES.filter((t) => t.category === 'light');
  const current = themeId ?? 'auto';

  function selectTheme(id: string) {
    setThemeId(id);
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="rounded-sm p-1 text-muted-foreground hover:text-foreground hover:bg-accent"
          aria-label="Terminal color theme"
          title="Terminal color theme"
        >
          <Palette className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-56 p-1 max-h-80 overflow-y-auto">
        <ThemeOption
          id="auto"
          label="Auto (follow app)"
          bg="linear-gradient(90deg, #1e1e1e 50%, #ffffff 50%)"
          selected={current === 'auto'}
          onSelect={selectTheme}
        />

        <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">Dark Themes</div>
        {darkThemes.map((t) => (
          <ThemeOption
            key={t.id}
            id={t.id}
            label={t.name}
            bg={t.theme.background ?? '#000'}
            selected={current === t.id}
            onSelect={selectTheme}
          />
        ))}

        <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">Light Themes</div>
        {lightThemes.map((t) => (
          <ThemeOption
            key={t.id}
            id={t.id}
            label={t.name}
            bg={t.theme.background ?? '#fff'}
            selected={current === t.id}
            onSelect={selectTheme}
          />
        ))}
      </PopoverContent>
    </Popover>
  );
}

function ThemeOption({
  id,
  label,
  bg,
  selected,
  onSelect,
}: {
  id: string;
  label: string;
  bg: string;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(id)}
      className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm
                 hover:bg-accent hover:text-accent-foreground cursor-pointer"
    >
      <span
        className="inline-block w-3 h-3 rounded-sm border border-border shrink-0"
        style={{ background: bg }}
      />
      <span className="flex-1 text-left">{label}</span>
      {selected && <Check className="h-3 w-3 text-muted-foreground shrink-0" />}
    </button>
  );
}
