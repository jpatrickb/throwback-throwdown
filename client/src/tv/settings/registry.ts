// SETTINGS REGISTRY: every TV setting is one entry in SETTINGS below.
// To add a setting, add an entry: the panel renders it automatically from its `kind`.
// Each entry's `use` is a React hook returning [value, setter] (or the value, for info rows);
// the panel calls it inside a per-row component, so hook order is always stable.
import { useEffect, useState } from 'react';
import type { TvView } from '../../../../shared/types.ts';
import type { ThemeId } from '../../../../shared/types.ts';
import { socket, IS_MOCK } from '../../socket.ts';
import { THEME_OPTIONS, applyTheme } from './themes.ts';
import { useTvPref } from './store.ts';
import { useAudioSettings } from './audioAdapter.ts';

export interface SettingCtx {
  view: TvView | null;
}

interface Base {
  id: string;
  section: 'Look' | 'Sound' | 'Screen' | 'Emergency';
  label: string;
  hint?: string;
}
export interface ToggleSetting extends Base {
  kind: 'toggle';
  use: (ctx: SettingCtx) => [boolean, (v: boolean) => void];
}
export interface SliderSetting extends Base {
  kind: 'slider';
  use: (ctx: SettingCtx) => [number, (v: number) => void];
}
export interface ChoiceSetting extends Base {
  kind: 'choice';
  options: { value: string; label: string; swatch?: string[] }[];
  use: (ctx: SettingCtx) => [string, (v: string) => void];
}
export interface InfoSetting extends Base {
  kind: 'info';
  /** Text to show, or null to hide the row. */
  use: (ctx: SettingCtx) => string | null;
}
export type SettingDef = ToggleSetting | SliderSetting | ChoiceSetting | InfoSetting;

/** Bind one field of the audio settings to a [value, setter] hook. */
function audioField<K extends 'musicOn' | 'sfxOn' | 'master' | 'music' | 'sfx'>(key: K) {
  return () => {
    const [s, set] = useAudioSettings();
    return [s[key], (v: (typeof s)[K]) => set({ [key]: v } as Partial<typeof s>)] as [(typeof s)[K], (v: (typeof s)[K]) => void];
  };
}

/** Theme is server state: read view.settings.theme, change it with tv:setTheme (the TV then
 *  applies the new view). Mock mode has no server, so a pick previews locally. */
function useTheme({ view }: SettingCtx): [string, (v: string) => void] {
  const [mockPick, setMockPick] = useState<string | null>(null);
  const current = (IS_MOCK && mockPick) || view?.settings.theme || 'berry';
  return [
    current,
    (theme) => {
      if (IS_MOCK) {
        setMockPick(theme);
        applyTheme(theme);
        return;
      }
      socket.emit('tv:setTheme', { theme: theme as ThemeId }, (res) => {
        if (!res.ok) console.warn('[tv] theme change rejected:', res.error);
      });
    },
  ];
}

function useFullscreen(): [boolean, (v: boolean) => void] {
  const [on, setOn] = useState(() => !!document.fullscreenElement);
  useEffect(() => {
    const f = () => setOn(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', f);
    return () => document.removeEventListener('fullscreenchange', f);
  }, []);
  return [
    on,
    (v) => {
      if (v) document.documentElement.requestFullscreen?.().catch(() => {});
      else if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    },
  ];
}

export const SETTINGS: SettingDef[] = [
  {
    id: 'theme',
    section: 'Look',
    label: 'Theme',
    kind: 'choice',
    hint: 'Phones switch too',
    options: THEME_OPTIONS,
    use: useTheme,
  },
  { id: 'musicOn', section: 'Sound', label: 'Music', kind: 'toggle', use: audioField('musicOn') },
  { id: 'sfxOn', section: 'Sound', label: 'Sound effects', kind: 'toggle', use: audioField('sfxOn') },
  { id: 'master', section: 'Sound', label: 'Master volume', kind: 'slider', use: audioField('master') },
  { id: 'music', section: 'Sound', label: 'Music volume', kind: 'slider', use: audioField('music') },
  { id: 'sfx', section: 'Sound', label: 'Effects volume', kind: 'slider', use: audioField('sfx') },
  {
    id: 'reactions',
    section: 'Screen',
    label: 'Emoji reactions on the TV',
    hint: 'Floating emoji that players send from their phones',
    kind: 'toggle',
    use: () => useTvPref('reactions'),
  },
  { id: 'fullscreen', section: 'Screen', label: 'Fullscreen', kind: 'toggle', use: useFullscreen },
  {
    id: 'lanUrl',
    section: 'Emergency',
    label: 'Wi-Fi join link (if the internet is down)',
    hint: 'Phones must be on the same Wi-Fi as this laptop',
    kind: 'info',
    use: ({ view }) => view?.lanJoinUrl ?? null,
  },
];
