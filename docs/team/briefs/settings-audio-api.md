# Seam: TV settings panel <-> audio (lead-defined, Nov 23)

audio adds these exports to `client/src/audio/index.ts` (existing exports unchanged):

```ts
export interface AudioSettings {
  musicOn: boolean;   // default true
  sfxOn: boolean;     // default true
  master: number;     // 0..1, default 0.8
  music: number;      // 0..1 music level relative to master, default 1
  sfx: number;        // 0..1 sfx level relative to master, default 1
}
export function getAudioSettings(): AudioSettings;
export function setAudioSettings(patch: Partial<AudioSettings>): void; // persists (localStorage, try/catch), applies live
export function useAudioSettings(): [AudioSettings, (patch: Partial<AudioSettings>) => void]; // React hook, re-renders on change
```
The `M` key and `-`/`=` keep working and go through the same settings (so the panel stays in sync).

tv builds the gear button + settings panel UI and calls only these functions for audio.
Until audio lands them, tv may stub its import behind a tiny local adapter
(`client/src/tv/settings/audioAdapter.ts`) and switch once they exist.
