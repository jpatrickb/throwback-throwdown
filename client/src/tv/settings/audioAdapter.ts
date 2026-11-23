// The TV settings panel's only door into audio (docs/build-log/team/briefs/settings-audio-api.md).
// Audio's API has landed, so this is now a straight re-export. Keeping the adapter means the
// panel never imports audio internals, and a future change to the audio API touches one file.
export { useAudioSettings, getAudioSettings, setAudioSettings, type AudioSettings } from '../../audio/index.ts';
