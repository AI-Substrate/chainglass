'use client';

/**
 * SettingsSearch — Filter input for the settings page.
 *
 * Filters settings by label or description (case-insensitive substring).
 * Clears on Escape. Shows match count.
 *
 * Per Plan 047 Phase 5, Task T005. AC-24.
 */

import { Input } from '@/components/ui/input';
import { Search, X } from 'lucide-react';
import { useCallback, useRef } from 'react';

interface SettingsSearchProps {
  value: string;
  onChange: (value: string) => void;
  matchCount: number;
  totalCount: number;
}

export function SettingsSearch({ value, onChange, matchCount, totalCount }: SettingsSearchProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        onChange('');
        inputRef.current?.blur();
      }
    },
    [onChange]
  );

  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
      <Input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Search settings..."
        className="pl-9 pr-20"
        aria-label="Search settings"
      />
      <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
        {value && (
          <>
            <span className="text-xs text-muted-foreground">
              {matchCount}/{totalCount}
            </span>
            <button
              type="button"
              onClick={() => onChange('')}
              className="rounded p-0.5 text-muted-foreground hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
