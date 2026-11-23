// Composes the game's soundtrack as MIDI + Soundcraft scripts. build.sh runs this, then renders
// every cue in Soundcraft and encodes the results into client/public/audio/.
//
//   npx tsx client/src/audio/soundtrack/compose.ts <outDir>
//
// Everything musical lives here: patches (Soundcraft instrument + insert settings), drum/bass/comp
// patterns, and each cue's chords and melody. Change a chord or a melody line, re-run build.sh.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { melody, melodyBeats, parseChord, pcAtOrAbove, voice, writeSmf, type Note, type Part } from './midi.ts';
import { SFX } from './sfx.ts';
import { checkBass, checkMelody, checkParts } from './harmony.ts';

// ---------- patches ----------

type Params = Record<string, number>;
interface Insert {
  plugin: string;
  params: Params;
}
interface Patch {
  instrument: 'subtractive_synth' | 'drum_synth';
  params: Params;
  inserts: Insert[];
  volumeDb: number;
}

const SAW = 0,
  SQUARE = 1,
  SINE = 2,
  TRI = 3;

const eq = (p: Params): Insert => ({ plugin: 'eq_7band', params: p });
const room = (mix: number, decay = 1.0): Insert => ({
  plugin: 'room_reverb',
  params: { mix, decay, size: 45, damping: 7000, pre_delay: 12, low_cut: 200 },
});
const plate = (mix: number, decay = 1.8): Insert => ({
  plugin: 'plate_reverb',
  params: { mix, decay, damping: 8000, pre_delay: 20, low_cut: 250 },
});
const chorus = (mix: number): Insert => ({ plugin: 'chorus', params: { mix, rate: 0.5, depth: 18 } });

const PATCHES: Record<string, Patch> = {
  bass: {
    instrument: 'subtractive_synth',
    params: {
      osc1_wave: SQUARE, osc2_wave: SAW, osc2_semitones: 0, osc2_detune: 4, osc_mix: 35,
      cutoff: 420, resonance: 22, filter_env_amount: 45,
      amp_attack: 2, amp_decay: 260, amp_sustain: 60, amp_release: 60,
      filter_attack: 1, filter_decay: 180, filter_sustain: 20, filter_release: 80,
      velocity: 50, level: 0,
    },
    inserts: [eq({ hpf_on: 1, hpf_freq: 35, low_mid_freq: 300, low_mid_gain: -2 }), { plugin: 'compressor', params: { threshold: -18, ratio: 3, attack: 8, release: 90 } }],
    volumeDb: -2,
  },
  keys: {
    instrument: 'subtractive_synth',
    params: {
      osc1_wave: TRI, osc2_wave: SINE, osc2_semitones: 12, osc2_detune: 3, osc_mix: 30,
      cutoff: 3200, resonance: 5, filter_env_amount: 25,
      amp_attack: 2, amp_decay: 450, amp_sustain: 25, amp_release: 220,
      filter_attack: 1, filter_decay: 300, filter_sustain: 30, filter_release: 200,
      velocity: 60, level: -2,
    },
    inserts: [chorus(30), eq({ hpf_on: 1, hpf_freq: 160 }), room(18)],
    volumeDb: -4,
  },
  brass: {
    instrument: 'subtractive_synth',
    params: {
      osc1_wave: SAW, osc2_wave: SAW, osc2_semitones: 0, osc2_detune: 4, osc_mix: 50,
      cutoff: 850, resonance: 12, filter_env_amount: 60,
      amp_attack: 10, amp_decay: 300, amp_sustain: 75, amp_release: 140,
      filter_attack: 25, filter_decay: 260, filter_sustain: 45, filter_release: 150,
      velocity: 70, level: -3,
    },
    inserts: [eq({ hpf_on: 1, hpf_freq: 170, mid_freq: 1400, mid_gain: 2, high_shelf_gain: -2 }), plate(18)],
    volumeDb: -7,
  },
  lead: {
    instrument: 'subtractive_synth',
    params: {
      osc1_wave: SQUARE, osc2_wave: SAW, osc2_semitones: 0, osc2_detune: 4, osc_mix: 40,
      cutoff: 2400, resonance: 18, filter_env_amount: 35,
      amp_attack: 4, amp_decay: 220, amp_sustain: 65, amp_release: 110,
      filter_attack: 2, filter_decay: 200, filter_sustain: 40, filter_release: 120,
      glide: 12, velocity: 55, level: -4,
    },
    inserts: [eq({ hpf_on: 1, hpf_freq: 260, high_shelf_gain: -3 }), { plugin: 'mod_delay', params: { time: 375, feedback: 22, mix: 14, lpf: 4000 } }, plate(16)],
    volumeDb: -1.5,
  },
  bell: {
    instrument: 'subtractive_synth',
    params: {
      osc1_wave: SINE, osc2_wave: SINE, osc2_semitones: 24, osc2_detune: 2, osc_mix: 22,
      cutoff: 9000, resonance: 0, filter_env_amount: 0,
      amp_attack: 1, amp_decay: 650, amp_sustain: 0, amp_release: 450,
      velocity: 60, level: -2,
    },
    inserts: [eq({ hpf_on: 1, hpf_freq: 400 }), room(26, 1.4)],
    volumeDb: -4,
  },
  pluck: {
    instrument: 'subtractive_synth',
    params: {
      osc1_wave: TRI, osc2_wave: SINE, osc2_semitones: 12, osc2_detune: 0, osc_mix: 20,
      cutoff: 1800, resonance: 10, filter_env_amount: 50,
      amp_attack: 1, amp_decay: 230, amp_sustain: 0, amp_release: 120,
      filter_attack: 1, filter_decay: 120, filter_sustain: 0, filter_release: 100,
      velocity: 60, level: -1,
    },
    inserts: [eq({ hpf_on: 1, hpf_freq: 180 }), room(20)],
    volumeDb: -3,
  },
  pad: {
    instrument: 'subtractive_synth',
    params: {
      osc1_wave: SAW, osc2_wave: SAW, osc2_semitones: 0, osc2_detune: 4, osc_mix: 50,
      cutoff: 1300, resonance: 8, filter_env_amount: 10,
      amp_attack: 350, amp_decay: 800, amp_sustain: 80, amp_release: 900,
      velocity: 30, level: -6,
    },
    inserts: [chorus(40), eq({ hpf_on: 1, hpf_freq: 220, lpf_on: 1, lpf_freq: 6000 }), plate(32, 2.2)],
    volumeDb: -6,
  },
  sweep: {
    // gliding saw for whooshes and swoops
    instrument: 'subtractive_synth',
    params: {
      osc1_wave: SAW, osc2_wave: SAW, osc2_semitones: 7, osc2_detune: 4, osc_mix: 40,
      cutoff: 1800, resonance: 30, filter_env_amount: 20,
      amp_attack: 40, amp_decay: 300, amp_sustain: 70, amp_release: 220,
      filter_attack: 60, filter_decay: 300, filter_sustain: 50, filter_release: 200,
      glide: 260, velocity: 40, level: -6,
    },
    inserts: [eq({ hpf_on: 1, hpf_freq: 300 }), chorus(40), plate(30, 1.6)],
    volumeDb: -8,
  },
  trombone: {
    // sliding brass for the playful "aww"
    instrument: 'subtractive_synth',
    params: {
      osc1_wave: SAW, osc2_wave: SQUARE, osc2_semitones: 0, osc2_detune: 4, osc_mix: 35,
      cutoff: 700, resonance: 10, filter_env_amount: 40,
      amp_attack: 25, amp_decay: 400, amp_sustain: 80, amp_release: 160,
      filter_attack: 60, filter_decay: 400, filter_sustain: 50, filter_release: 160,
      glide: 140, velocity: 60, level: -4,
    },
    inserts: [eq({ hpf_on: 1, hpf_freq: 120 }), plate(20)],
    volumeDb: -4,
  },
  block: {
    // woodblock-ish tick
    instrument: 'subtractive_synth',
    params: {
      osc1_wave: SINE, osc2_wave: TRI, osc2_semitones: 19, osc2_detune: 0, osc_mix: 30,
      cutoff: 7000, resonance: 0, filter_env_amount: 0,
      amp_attack: 0.5, amp_decay: 45, amp_sustain: 0, amp_release: 35,
      velocity: 40, level: -4,
    },
    inserts: [eq({ hpf_on: 1, hpf_freq: 500 })],
    volumeDb: 0,
  },
  drums: {
    instrument: 'drum_synth',
    params: {
      level: 0, kick_tune: 0, kick_decay: 360, snare_tune: 1, snare_snappy: 65, snare_decay: 180,
      hat_decay: 45, open_hat_decay: 280, tom_decay: 380, cymbal_decay: 1800,
    },
    inserts: [eq({ hpf_on: 1, hpf_freq: 30, high_shelf_gain: -2 }), { plugin: 'compressor', params: { threshold: -16, ratio: 3, attack: 15, release: 120 } }, room(10, 0.8)],
    volumeDb: -1.5,
  },
};

const MASTER_INSERTS: Insert[] = [
  { plugin: 'compressor', params: { threshold: -14, ratio: 2, attack: 25, release: 160, knee: 8 } },
  { plugin: 'maximizer', params: { threshold: -9, ceiling: -1.2, release: 120 } },
];

// ---------- drums ----------

const K = 36, SN = 38, CLAP = 39, CH = 42, OH = 46, CRASH = 49, TOM_L = 45, TOM_M = 47, TOM_H = 50, FLOOR = 41;
type DrumStyle = 'pop' | 'disco' | 'light' | 'pulse';

function drumBar(style: DrumStyle, bar: number, fill: boolean, crash: boolean): Note[] {
  const o = bar * 4;
  const n: Note[] = [];
  const hit = (beat: number, p: number, v: number, d = 0.1) => n.push({ t: o + beat, d, p, v });
  if (crash) hit(0, CRASH, 96, 1);
  switch (style) {
    case 'pop':
      hit(0, K, 112); hit(2, K, 104); if (bar % 2 === 1) hit(2.5, K, 84);
      hit(1, SN, 104); hit(3, SN, 108); hit(1, CLAP, 70); hit(3, CLAP, 74);
      for (let i = 0; i < 8; i++) if (!(i === 7)) hit(i / 2, CH, i % 2 ? 58 : 82);
      hit(3.5, OH, 70, 0.4);
      break;
    case 'disco':
      for (let b = 0; b < 4; b++) hit(b, K, 110);
      hit(1, SN, 100); hit(3, SN, 104); hit(1, CLAP, 84); hit(3, CLAP, 88);
      for (let b = 0; b < 4; b++) { hit(b, CH, 64); hit(b + 0.5, OH, 72, 0.3); }
      break;
    case 'light': {
      // brushed, swung feel
      hit(0, K, 78); hit(2.66, K, 64);
      hit(1, CLAP, 46); hit(3, CLAP, 50);
      for (let b = 0; b < 4; b++) { hit(b, CH, 52); hit(b + 0.66, CH, 38); }
      break;
    }
    case 'pulse':
      hit(0, K, 92); hit(2, K, 80);
      hit(3, CLAP, 54);
      for (let i = 0; i < 16; i++) hit(i / 4, CH, [62, 34, 46, 34][i % 4]);
      break;
  }
  if (fill) {
    // replace beats 3-4 with a fill
    for (let i = n.length - 1; i >= 0; i--) if (n[i].t >= o + 2.5 && n[i].p !== K) n.splice(i, 1);
    if (style === 'light' || style === 'pulse') {
      [TOM_H, TOM_M, TOM_L, FLOOR].forEach((p, i) => hit(2.5 + i * 0.375, p, 60 + i * 6, 0.2));
    } else {
      for (let i = 0; i < 6; i++) hit(2.5 + i * 0.25, SN, 70 + i * 8);
    }
  }
  return n;
}

// ---------- bass & comping ----------

type BassStyle = 'pop' | 'disco' | 'walk' | 'pulse';
type CompStyle = 'skank' | 'pad' | 'stabs' | 'pluck' | 'arp' | 'hits';

interface Section {
  chords: string[]; // one entry per bar; "Dm7 G7" splits the bar in two
}

/** Chord events (start beat, length, chord) for a list of bars. */
function chordEvents(bars: string[]) {
  const ev: { t: number; d: number; sym: string; next: string }[] = [];
  bars.forEach((bar, i) => {
    const syms = bar.trim().split(/\s+/);
    const len = 4 / syms.length;
    syms.forEach((s, j) => ev.push({ t: i * 4 + j * len, d: len, sym: s, next: '' }));
  });
  ev.forEach((e, i) => (e.next = ev[(i + 1) % ev.length].sym));
  return ev;
}

/** `legacy`: the original (Nov 23, e4390a0) behaviour with chromatic approach notes, kept for the frozen lobby cue. */
function bassLine(style: BassStyle, bars: string[], lo = 33, legacy = false): Note[] {
  const out: Note[] = [];
  for (const e of chordEvents(bars)) {
    const ch = parseChord(e.sym);
    const nx = parseChord(e.next);
    const R = pcAtOrAbove(ch.bass, lo);
    const fifth = pcAtOrAbove((ch.root + 7) % 12, R);
    const nextR = pcAtOrAbove(nx.bass, lo);
    const approach = legacy ? (nextR > R ? nextR - 1 : nextR + 1) : fifth;
    const third = pcAtOrAbove((ch.root + ch.tones[1]) % 12, R);
    const add = (t: number, d: number, p: number, v = 100) => {
      if (t < e.d - 1e-6) out.push({ t: e.t + t, d: Math.min(d, e.d - t), p, v });
    };
    switch (style) {
      case 'pop':
        add(0, 0.8, R, 110); add(1.5, 0.4, R, 92); add(2, 0.8, fifth, 100); add(3, 0.4, R + 12, 90); add(3.5, 0.4, approach, legacy ? 88 : 86);
        if (e.d <= 2) { add(1, 0.4, fifth, 92); add(1.5, 0.4, legacy ? approach : R + 12, 86); }
        break;
      case 'disco':
        for (let i = 0; i < e.d * 2; i++) add(i / 2, 0.42, i % 2 ? R + 12 : R, i % 2 ? 88 : 108);
        break;
      case 'walk':
        if (e.d >= 4) { add(0, 0.6, R, 96); add(1, 0.6, third, 84); add(2, 0.6, fifth, 90); add(3, 0.6, third, 84); }
        else { add(0, 0.6, R, 96); add(1, 0.6, fifth, 84); }
        break;
      case 'pulse':
        for (let i = 0; i < e.d * 2; i++) add(i / 2, 0.4, R, i % 2 ? 70 : 92);
        break;
    }
  }
  return out;
}

/** `legacy`: original 4-note voicings (frozen lobby cue). */
function comp(style: CompStyle, bars: string[], lo: number, hi: number, vel = 90, legacy = false): Note[] {
  const out: Note[] = [];
  let prev: number[] | null = null;
  for (const e of chordEvents(bars)) {
    const v = voice(parseChord(e.sym), lo, hi, prev, legacy ? 4 : 3); // triads: no clustered 7ths/9ths
    prev = v;
    const stab = (t: number, d: number, vv = vel) => {
      if (t < e.d - 1e-6) for (const p of v) out.push({ t: e.t + t, d: Math.min(d, e.d - t), p, v: vv });
    };
    switch (style) {
      case 'skank':
        for (let b = 0; b < e.d; b++) stab(b + 0.5, 0.3, vel - (b % 2) * 8);
        break;
      case 'pad':
        stab(0, e.d - 0.05, vel);
        break;
      case 'stabs':
        stab(0, 0.45, vel); stab(1.5, 0.3, vel - 10); if (e.d >= 4) { stab(2.5, 0.3, vel - 6); stab(3.5, 0.4, vel - 4); }
        break;
      case 'hits':
        stab(0, 0.8, vel); if (e.d >= 4) stab(3.5, 0.4, vel - 8);
        break;
      case 'pluck':
        stab(0, 0.3, vel); stab(1.5, 0.25, vel - 14); if (e.d >= 4) stab(2.5, 0.25, vel - 10);
        break;
      case 'arp': {
        const tones = [...v, v[0] + 12];
        for (let i = 0; i < e.d * 2; i++) {
          const p = tones[[0, 1, 2, 3, 2, 1, 2, 3][i % 8] % tones.length];
          out.push({ t: e.t + i / 2, d: 0.4, p, v: vel - (i % 2) * 12 });
        }
        break;
      }
    }
  }
  return out;
}

// ---------- cues ----------

interface Cue {
  name: string; // output file name, e.g. music-lobby
  bpm: number;
  sections: { A: string[]; B: string[] };
  melody: { A: string[]; B: string[] }; // one token string per bar
  tonic: number; // MIDI pitch of melody degree 1
  build: (bars: string[], len: number) => Part[]; // arrangement for the full loop
  mix?: Record<string, number>; // per-cue fader offsets in dB, e.g. { Bell: 3 }
  retired?: boolean; // kept for reference, not rendered or checked
  /** Approved and locked: excluded from the harmony check and never re-rendered, so the committed
   *  files and session stay exactly as approved. The string says who approved which version. */
  frozen?: string;
  /** Per-track patch tweaks for this cue only (e.g. the frozen lobby's original detune/chorus). */
  patchOverrides?: Record<string, { params?: Record<string, number>; inserts?: Insert[] }>;
}

const sum = (a: Note[][]) => a.flat();
const shift = (notes: Note[], beats: number) => notes.map((n) => ({ ...n, t: n.t + beats }));
const drums = (style: DrumStyle, bars: number, crashEvery = 8) =>
  sum(Array.from({ length: bars }, (_, b) => drumBar(style, b, b % 8 === 7, b % crashEvery === 0)));

const CUES: Cue[] = [
  {
    name: 'music-lobby',
    // HARMONY-CHECK ALLOWLIST: Patrick approved this exact version (rendered in e4390a0, Nov 23) and asked
    // for it back after the harmony pass. Do not re-compose, "fix" or re-render it. The data below is the
    // original source; client/public/audio/music-lobby.* and sessions/music-lobby.scraft are the e4390a0 files.
    frozen: 'Patrick approved the e4390a0 lobby track (Nov 23)',
    patchOverrides: {
      Brass: { params: { osc2_detune: 12 } },
      Lead: { params: { osc2_detune: 8 } },
      Keys: { inserts: [{ plugin: 'chorus', params: { mix: 30, rate: 0.6, depth: 35 } }, eq({ hpf_on: 1, hpf_freq: 160 }), room(18)] },
    },
    bpm: 120,
    tonic: 72, // C5
    sections: {
      A: ['C', 'Am', 'F', 'G', 'C', 'Am', 'Dm7 G7', 'C'],
      B: ['F', 'G', 'Em', 'Am', 'F', 'G', 'Dm7', 'G7'],
    },
    melody: {
      A: [
        '3:.5 5:.5 r:.5 5:.5 6:.5 5:.5 3:1',
        '1:.5 3:.5 r:.5 3:.5 2:1 1:1',
        "6:.5 1':.5 r:.5 1':.5 2':.5 1':.5 6:1",
        '5:1.5 4:.5 3:1 2:1',
        '3:.5 5:.5 r:.5 5:.5 6:.5 5:.5 3:1',
        '1:.5 3:.5 r:.5 3:.5 5:1 6:1',
        '4:.5 4:.5 6:1 5:.5 4:.5 2:1',
        '1:3 r:1',
      ],
      B: [
        "1':1 6:.5 1':.5 r:1 6:1",
        '7:1 5:.5 7:.5 r:1 5:1',
        '5:1 3:.5 5:.5 7:1 5:1',
        '6:3 r:1',
        "1':.5 1':.5 6:.5 1':.5 2':1 1':1",
        "2':.5 2':.5 7:.5 2':.5 3':1 2':1",
        "4':1 3':1 2':1 1':1",
        "7:1 2':1 5:2",
      ],
    },
    build: (bars, len) => [
      { name: 'Drums', drums: true, notes: drums('pop', len) },
      { name: 'Bass', notes: bassLine('pop', bars, 33, true) },
      { name: 'Keys', notes: comp('skank', bars, 55, 72, 84, true) },
      { name: 'Brass', notes: shift(comp('stabs', bars.slice(8), 60, 76, 92, true), 32) },
      { name: 'Lead', notes: [] }, // filled from melody below
      { name: 'Bell', notes: [] },
    ],
  },
  {
    name: 'music-captioning',
    retired: true, // CAPTIONING now plays the lobby track (Patrick's favorite); see docs/build-log/team/audio.md
    bpm: 96,
    mix: { Bell: 3, Drums: -2 },
    tonic: 65, // F4
    sections: {
      A: ['Fmaj7', 'Em7 A7', 'Dm7', 'Cm7 F7', 'Bbmaj7', 'Am7', 'Gm7', 'C7sus4 C7'],
      B: ['Fmaj7', 'Em7 A7', 'Dm7', 'Cm7 F7', 'Bbmaj7', 'Am7', 'Gm7', 'C7'],
    },
    melody: {
      A: [
        '3:.5 r:.5 5:.5 r:.5 7:1 r:1',
        '6:.5 5:.5 r:.5 3:.5 #5:1 r:1',
        "6:.5 r:.5 1':.5 r:.5 3':1 2':.5 1':.5",
        'b7:1 6:.5 5:.5 4:1 r:1',
        "4:.5 r:.5 6:.5 r:.5 1':1 r:1",
        "3:.5 5:.5 1':.5 7:.5 5:1 r:1",
        "2:.5 4:.5 6:.5 1':.5 2':.5 1':.5 6:1",
        '5:2 r:2',
      ],
      B: [
        '3:.5 r:.5 5:.5 r:.5 7:1 r:1',
        '6:.5 5:.5 r:.5 3:.5 #5:1 r:1',
        "6:.5 r:.5 1':.5 r:.5 3':1 2':.5 1':.5",
        'b7:1 6:.5 5:.5 4:1 r:1',
        "1':.5 r:.5 6:.5 r:.5 4:1 r:1",
        "5:.5 3:.5 5:.5 1':.5 7:1 r:1",
        '6:.5 r:.5 4:.5 r:.5 2:1 6,:.5 7,:.5',
        '1:2 r:2',
      ],
    },
    build: (bars, len) => [
      { name: 'Drums', drums: true, notes: drums('light', len, 16) },
      { name: 'Bass', notes: bassLine('walk', bars, 36) },
      { name: 'Pluck', notes: comp('pluck', bars, 57, 74, 80) },
      { name: 'Pad', notes: comp('pad', bars, 53, 70, 60) },
      { name: 'Bell', notes: [] }, // melody on marimba-ish bell
    ],
  },
  {
    name: 'music-voting',
    bpm: 128,
    mix: { Bass: -1 },
    tonic: 67, // G4
    sections: {
      A: ['G', 'D/F#', 'Em', 'C', 'G', 'D', 'C', 'D7'],
      B: ['C', 'D', 'Bm', 'Em', 'C', 'D', 'Am7', 'D7'],
    },
    melody: {
      A: [
        '5:.5 5:.5 r:.5 5:.5 5:.5 6:.5 5:.5 3:.5',
        '2:.5 2:.5 r:.5 2:.5 2:.5 3:.5 2:.5 7,:.5',
        '3:.5 3:.5 r:.5 3:.5 3:.5 2:.5 1:.5 6,:.5',
        '6,:1 1:1 4:1 r:1',
        '5:.5 5:.5 r:.5 5:.5 5:.5 6:.5 5:.5 3:.5',
        '2:.5 2:.5 r:.5 2:.5 5:.5 6:.5 5:1',
        "6:.5 5:.5 4:.5 5:.5 6:1 1':1",
        '5:1 3:1 2:1 r:1',
      ],
      B: [
        "4':1 1':.5 6:.5 r:1 1':1",
        "2':1 7:.5 5:.5 r:1 7:1",
        '7:.5 6:.5 5:.5 6:.5 7:1 3:1',
        '6:2 3:1 r:1',
        "1':.5 1':.5 r:.5 1':.5 1':.5 2':.5 1':1",
        "2':.5 2':.5 r:.5 2':.5 7:.5 6:.5 5:1",
        "6:.5 1':.5 2':.5 1':.5 6:1 4:1",
        '7:.5 6:.5 5:.5 3:.5 2:.5 3:.5 2:.5 7,:.5',
      ],
    },
    build: (bars, len) => [
      { name: 'Drums', drums: true, notes: drums('disco', len) },
      { name: 'Bass', notes: bassLine('disco', bars, 31) },
      { name: 'Brass', notes: comp('stabs', bars, 60, 76, 88) },
      { name: 'Keys', notes: comp('skank', bars, 55, 72, 76) },
      { name: 'Lead', notes: [] },
    ],
  },
  {
    name: 'music-results',
    bpm: 100,
    mix: { Bell: 2 },
    tonic: 72, // C5 (A minor / C major)
    sections: {
      A: ['Am', 'F', 'C', 'G', 'Am', 'F', 'Dm7', 'G7sus4 G'],
      B: ['F', 'G', 'Em', 'Am', 'F', 'G', 'Csus4 C', 'G'],
    },
    melody: {
      A: [
        '3:1 r:1 6:1 r:1',
        "r:2 1':1 6:1",
        '5:1 r:1 3:1 r:1',
        'r:2 2:1 5,:1',
        '3:1 r:1 6:1 r:1',
        "r:2 6:1 1':1",
        "4':1 r:1 2':1 1':1",
        "2':2 7:2",
      ],
      B: [
        "6:1 r:.5 1':.5 4':2",
        "2':1 r:.5 7:.5 5:2",
        "7:1 r:.5 5:.5 3':2",
        "1':3 r:1",
        "6:1 r:.5 1':.5 4':2",
        "5':1 r:.5 2':.5 7:2",
        "1':1 4':1 3':2",
        "2':2 7:1 5:1",
      ],
    },
    build: (bars, len) => [
      { name: 'Drums', drums: true, notes: drums('pulse', len, 16) },
      { name: 'Bass', notes: bassLine('pulse', bars, 33) },
      { name: 'Pad', notes: comp('pad', bars, 52, 69, 64) },
      { name: 'Pluck', notes: comp('arp', bars, 60, 76, 60) },
      { name: 'Bell', notes: [] },
    ],
  },
  {
    name: 'music-final',
    bpm: 125,
    tonic: 62, // D4
    sections: {
      A: ['D', 'G', 'Bm', 'A', 'D', 'G', 'Em7 A7', 'D'],
      B: ['G', 'A', 'F#m', 'Bm', 'G', 'A', 'Em7', 'A7'],
    },
    melody: {
      A: [
        "1':1.5 5:.5 1':.5 2':.5 3':1",
        "4':1.5 5':.5 4':1 2':1",
        "1':1.5 6:.5 3':1 1':1",
        "7:1 6:1 5:1 2':1",
        "1':1.5 5:.5 1':.5 2':.5 3':1",
        "4':1.5 5':.5 4':1 6':1",
        "2':1 1':1 7:1 5:1",
        "1':3 r:1",
      ],
      B: [
        "r:.5 6:.5 1':.5 2':.5 1':1 6:1",
        "r:.5 5:.5 7:.5 2':.5 7:1 5:1",
        "r:.5 7:.5 2':.5 3':.5 5':1 3':1",
        "3':3 r:1",
        "r:.5 6:.5 1':.5 2':.5 1':1 6:1",
        "r:.5 7:.5 2':.5 5':.5 7':1 5':1",
        "4':1 3':1 2':1 1':1",
        "7:1 2':1 5':2",
      ],
    },
    build: (bars, len) => [
      { name: 'Drums', drums: true, notes: drums('disco', len) },
      { name: 'Bass', notes: bassLine('pop', bars, 38) },
      { name: 'Brass', notes: comp('hits', bars, 62, 78, 96) },
      { name: 'Keys', notes: comp('skank', bars, 57, 74, 80) },
      { name: 'Lead', notes: [] },
      { name: 'Bell', notes: [] },
    ],
  },
];

/** Which melody track(s) each cue uses, and octave offsets. */
const MELODY_TRACKS: Record<string, { track: string; octave: number; vel: number; sections?: ('A' | 'B')[] }[]> = {
  'music-lobby': [
    { track: 'Lead', octave: 0, vel: 92 },
    { track: 'Bell', octave: 1, vel: 70, sections: ['B'] },
  ],
  'music-captioning': [{ track: 'Bell', octave: 1, vel: 84 }],
  'music-voting': [{ track: 'Lead', octave: 0, vel: 94 }],
  'music-results': [{ track: 'Bell', octave: 0, vel: 80 }],
  'music-final': [
    { track: 'Lead', octave: 0, vel: 96 },
    { track: 'Bell', octave: 1, vel: 66 },
  ],
};

const TRACK_PATCH: Record<string, string> = {
  Drums: 'drums', Bass: 'bass', Keys: 'keys', Brass: 'brass', Lead: 'lead', Bell: 'bell', Pluck: 'pluck', Pad: 'pad',
  Block: 'block', Sweep: 'sweep', Trombone: 'trombone',
};

// ---------- output ----------

const out = resolve(process.argv[2] ?? 'soundtrack-build');
mkdirSync(out, { recursive: true });
// jobs.tsv: session, output name, kind, cut start (s), cut end (s) — the cut is relative to <output>.wav
const jobs: string[] = [];

interface Bounce {
  out: string; // output name; Soundcraft writes <out>.wav
  start: number; // seconds, in the session timeline
  end: number;
}

function emit(
  session: string,
  parts: Part[],
  bpm: number,
  bounces: Bounce[],
  mix: Record<string, number> = {},
  overrides: Cue['patchOverrides'] = {},
) {
  const dir = join(out, session);
  mkdirSync(dir, { recursive: true });
  const used = parts.filter((p) => p.notes.length);
  writeFileSync(join(dir, `${session}.mid`), writeSmf(used, bpm));
  const lines: string[] = [];
  const cmd = (id: string, p: object) => lines.push(`${id} ${JSON.stringify(p)}`);
  cmd('file.import_midi', { path: join(dir, `${session}.mid`) });
  for (const part of used) {
    const base = PATCHES[TRACK_PATCH[part.name]];
    if (!base) throw new Error(`no patch for track ${part.name}`);
    const o = overrides?.[part.name];
    const patch: Patch = { ...base, params: { ...base.params, ...o?.params }, inserts: o?.inserts ?? base.inserts };
    const preset = join(dir, `${part.name}.preset.json`);
    writeFileSync(preset, JSON.stringify(trackPreset(part.name, { ...patch, volumeDb: patch.volumeDb + (mix[part.name] ?? 0) }), null, 2));
    cmd('track.load_preset', { path: preset, tracks: [part.name] });
  }
  cmd('track.new', { kind: 'master', name: 'Master' });
  MASTER_INSERTS.forEach((ins, slot) => cmd('mix.insert', { slot, plugin: ins.plugin, params: ins.params }));
  for (const b of bounces) {
    cmd('file.bounce_mix', { path: join(dir, `${b.out}.wav`), bit_depth: '24', start: { seconds: b.start }, end: { seconds: b.end } });
  }
  writeFileSync(join(dir, `${session}.script`), lines.join('\n') + '\n');
}

function trackPreset(name: string, patch: Patch) {
  const inserts: (object | null)[] = Array(10).fill(null);
  patch.inserts.forEach((ins, i) => (inserts[i] = { plugin: ins.plugin, params: ins.params, bypass: false, active: true, preset: '<custom>' }));
  return {
    format: 'soundcraft-track-preset',
    version: 1,
    name,
    kind: 'instrument',
    width: 'Stereo',
    color: [86, 132, 214],
    comments: '',
    elastic: null,
    instrument: { plugin: patch.instrument, params: patch.params, bypass: false, active: true, preset: '<custom>' },
    mixer: {
      automation_mode: 'Read', input: 'None', input_monitor: false, inserts, mute: false, output: 'Main',
      pan: [-1, 1], phase_invert: false, record_arm: false, sends: Array(10).fill(null), solo: false,
      solo_safe: false, surround: null, trim_db: 0, vca: null, volume_db: patch.volumeDb,
    },
  };
}

const problems: string[] = [];

for (const cue of CUES) {
  if (cue.retired) continue;
  if (cue.frozen) {
    console.log(`  ${cue.name}: frozen (${cue.frozen}); keeping the committed files`);
    continue;
  }
  const bars = [...cue.sections.A, ...cue.sections.B];
  const loopBars = bars.length;
  const keyPc = cue.tonic % 12;
  const parts = cue.build(bars, loopBars);
  // Melody (one pass), then the harmony checks, then the second pass.
  const melodyNotes: Note[] = [];
  for (const m of MELODY_TRACKS[cue.name]) {
    const part = parts.find((p) => p.name === m.track);
    if (!part) throw new Error(`${cue.name}: no ${m.track} track`);
    (['A', 'B'] as const).forEach((sec, si) => {
      if (m.sections && !m.sections.includes(sec)) return;
      cue.melody[sec].forEach((tok, bi) => {
        if (Math.abs(melodyBeats(tok) - 4) > 1e-6) throw new Error(`${cue.name} ${sec}${bi + 1}: ${melodyBeats(tok)} beats`);
        const notes = melody(tok, cue.tonic + 12 * m.octave, (si * 8 + bi) * 4, m.vel);
        part.notes.push(...notes);
        if (m === MELODY_TRACKS[cue.name][0]) melodyNotes.push(...notes);
      });
    });
  }
  const spans = chordEvents(bars);
  checkParts(cue.name, keyPc, parts, problems);
  checkMelody(cue.name, melodyNotes, spans, problems);
  checkBass(cue.name, parts.find((p) => p.name === 'Bass')?.notes ?? [], spans, problems);
  // Render the loop twice; build.sh keeps the second pass, whose start already contains the
  // first pass's reverb and release tails, so the file loops seamlessly.
  for (const p of parts) p.notes = [...p.notes, ...shift(p.notes, loopBars * 4)];
  const barSec = 240 / cue.bpm;
  emit(cue.name, parts, cue.bpm, [{ out: cue.name, start: 0, end: barSec * loopBars * 2 }], cue.mix, cue.patchOverrides);
  jobs.push([cue.name, cue.name, 'music', (barSec * loopBars).toFixed(6), (barSec * loopBars * 2).toFixed(6)].join('\t'));
}

// Each SFX key is one session with its takes laid out back to back (2 s apart after each tail),
// so opening sfx-winner.scraft shows every winner take side by side.
const SFX_BPM = 120;
let takeCount = 0;
for (const [key, takes] of Object.entries(SFX)) {
  const session = `sfx-${key}`;
  const merged = new Map<string, Part>();
  const bounces: Bounce[] = [];
  let cursorBeats = 0;
  takes.forEach((take, i) => {
    checkParts(`sfx ${key} take ${i + 1}`, take.key ?? 0, take.parts, problems);
    // Tally is pitched up a major scale per step at runtime, so its takes must sit on the tonic (C).
    if (key === 'tally') {
      for (const p of take.parts) for (const nn of p.notes) if (!p.drums && nn.p % 12 !== 0) problems.push(`sfx tally take ${i + 1}: notes must be C (rising steps are relative to C)`);
    }
    const endBeat = Math.max(...take.parts.flatMap((p) => p.notes.map((nn) => nn.t + nn.d)));
    for (const p of take.parts) {
      const m = merged.get(p.name) ?? { name: p.name, drums: p.drums, notes: [] };
      m.notes.push(...shift(p.notes, cursorBeats));
      merged.set(p.name, m);
    }
    const start = (cursorBeats * 60) / SFX_BPM;
    const len = (endBeat * 60) / SFX_BPM + take.tail;
    const name = `${session}-${i + 1}`;
    bounces.push({ out: name, start, end: start + len });
    jobs.push([session, name, 'sfx', '0', len.toFixed(6)].join('\t'));
    cursorBeats += Math.ceil(((len + 2) * SFX_BPM) / 60);
    takeCount++;
  });
  emit(session, [...merged.values()], SFX_BPM, bounces);
}

if (problems.length) {
  console.error(`Harmony check failed (${problems.length}):\n  ` + problems.join('\n  '));
  process.exit(1);
}
writeFileSync(join(out, 'jobs.tsv'), jobs.join('\n') + '\n');
console.log(`composed ${CUES.filter((c) => !c.retired && !c.frozen).length} cues and ${takeCount} sfx takes (${Object.keys(SFX).length} keys) into ${out}`);
