'use client';

/**
 * SettingControl — Generic renderer for SDK settings.
 *
 * Renders the appropriate UI control based on SDKSetting.ui hint:
 * - 'toggle' → Switch
 * - 'select' → Select dropdown
 * - 'text' → Input
 * - 'number' → Input type="number"
 *
 * DYK-P5-02: No color/emoji controls — pickers live in file-browser domain.
 * Per Plan 047 Phase 5, Task T003.
 */

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useSDK } from '@/lib/sdk/sdk-provider';
import { useSDKSetting } from '@/lib/sdk/use-sdk-setting';
import type { SDKSetting } from '@chainglass/shared/sdk';
import { RotateCcw } from 'lucide-react';

interface SettingControlProps {
  setting: SDKSetting;
}

export function SettingControl({ setting }: SettingControlProps) {
  const sdk = useSDK();
  const [value, setValue] = useSDKSetting(setting.key);

  const handleReset = () => {
    sdk.settings.reset(setting.key);
  };

  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <div className="flex-1 min-w-0">
        <Label className="text-sm font-medium">{setting.label}</Label>
        {setting.description && (
          <p className="text-xs text-muted-foreground mt-0.5">{setting.description}</p>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <ControlRenderer setting={setting} value={value} setValue={setValue} />
        <button
          type="button"
          onClick={handleReset}
          className="rounded p-1 text-muted-foreground hover:text-foreground"
          aria-label={`Reset ${setting.label} to default`}
          title="Reset to default"
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

function ControlRenderer({
  setting,
  value,
  setValue,
}: {
  setting: SDKSetting;
  value: unknown;
  setValue: (v: unknown) => Promise<void>;
}) {
  switch (setting.ui) {
    case 'toggle':
      return (
        <Switch
          checked={Boolean(value)}
          onCheckedChange={(checked) => setValue(checked)}
          aria-label={setting.label}
        />
      );

    case 'select':
      return (
        <Select value={String(value ?? '')} onValueChange={(v) => setValue(v)}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Select..." />
          </SelectTrigger>
          <SelectContent>
            {(setting.options ?? []).map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );

    case 'number':
      return (
        <Input
          type="number"
          value={String(value ?? '')}
          onChange={(e) => {
            const raw = e.target.value;
            if (raw === '') return;
            const num = Number(raw);
            if (!Number.isNaN(num)) {
              try {
                setValue(num);
              } catch {
                // validation — value out of range, ignore
              }
            }
          }}
          className="w-24"
          aria-label={setting.label}
        />
      );

    case 'text':
      return (
        <Input
          type="text"
          value={String(value ?? '')}
          onChange={(e) => setValue(e.target.value)}
          className="w-48"
          aria-label={setting.label}
        />
      );

    default:
      return (
        <span className="text-xs text-muted-foreground italic">
          Unsupported control: {setting.ui ?? 'none'}
        </span>
      );
  }
}
