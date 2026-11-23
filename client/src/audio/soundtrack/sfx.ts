// Every stinger and its takes (variations). compose.ts renders each key into one Soundcraft
// session (takes laid out one after another) and build.sh bounces each take to
// client/public/audio/sfx-<key>-<n>.{ogg,mp3}. cues.ts lists how many takes each key has.
//
// Time is in beats at 120 BPM (1 beat = 0.5 s). Track names pick the patch in compose.ts.
import type { Note, Part } from './midi.ts';

export interface Take {
  key?: number; // pitch class of the take's major key (default 0 = C major); checked by harmony.ts
  tail: number; // seconds of release/reverb kept after the last note
  parts: Part[];
}

// General-MIDI-style drum notes understood by Soundcraft's Drum Synth.
const K = 36, SN = 38, CLAP = 39, CH = 42, OH = 46, CRASH = 49, TOM_L = 45, TOM_M = 47, TOM_H = 50, FLOOR = 41;

const n = (t: number, d: number, p: number, v = 100): Note => ({ t, d, p, v });
const chord = (t: number, d: number, ps: number[], v = 100) => ps.map((p) => n(t, d, p, v));
/** Notes one after another, `step` beats apart. */
const run = (t: number, step: number, ps: number[], d: number, v = 90, dv = 0) => ps.map((p, i) => n(t + i * step, d, p, v + i * dv));
const roll = (t: number, count: number, step: number, p: number, v0: number, dv: number) =>
  Array.from({ length: count }, (_, i) => n(t + i * step, 0.1, p, Math.min(127, v0 + i * dv)));
const drums = (...notes: Note[][]): Part => ({ name: 'Drums', drums: true, notes: notes.flat() });
const part = (name: string, ...notes: Note[][]): Part => ({ name, notes: notes.flat() });

// Chord shapes (MIDI) in the soundtrack's bright major keys.
const C = [60, 64, 67, 72], F = [60, 65, 69, 72], G = [59, 62, 67, 71], Am = [57, 60, 64, 69];

export const SFX: Record<string, Take[]> = {
  // ---------- lobby ----------
  join: [[84, 91], [86, 93], [79, 84, 88], [88, 96]].map((ps) => ({
    tail: 0.5,
    parts: [part('Bell', run(0, 0.32, ps, 0.4, 92, 6))],
  })),
  teamJoin: [76, 79, 81, 84].map((p) => ({
    tail: 0.45,
    parts: [
      part('Block', [n(0, 0.08, p + 12, 90)]),
      part('Pluck', [n(0.15, 0.3, p, 96), n(0.15, 0.3, p + 7, 80)]),
      part('Bell', [n(0.15, 0.5, p + 12, 66)]),
      drums([n(0, 0.1, TOM_H, 54)]),
    ],
  })),
  teamRename: [
    { tail: 0.4, parts: [part('Lead', run(0, 0.125, [79, 84, 79, 88], 0.12, 84)), part('Block', [n(0, 0.06, 96, 70)])] },
    { tail: 0.5, parts: [part('Bell', run(0, 0.15, [88, 84, 91], 0.3, 86)), drums([n(0.3, 0.1, CLAP, 60)])] },
  ],

  // ---------- round flow ----------
  whoosh: [
    [48, 84],
    [43, 79],
    [84, 60],
    [52, 88],
  ].map(([a, b], i) => ({
    tail: 0.35,
    parts: [
      part('Sweep', [n(0, 0.35, a, 90), n(0.33, 0.55, b, 96)]),
      drums([n(0.25, 0.4, i % 2 ? OH : CRASH, 44)]),
    ],
  })),
  roundStart: [
    { ch: C, root: 36 },
    { ch: G, root: 31 },
    { ch: F, root: 41 },
  ].map(({ ch, root }, i) => ({
    tail: 0.9,
    parts: [
      drums(
        i === 2 ? run(0, 0.125, [TOM_H, TOM_M, TOM_L, FLOOR], 0.1, 80, 8) : roll(0, 4, 0.125, SN, 70, 10),
        [n(0.5, 0.2, K, 124), n(0.5, 1, CRASH, 118), n(0.5, 0.2, FLOOR, 110)],
      ),
      part('Brass', chord(0.5, 0.7, ch.map((p) => p + 12), 118)),
      part('Bass', [n(0.5, 0.8, root, 120)]),
      part('Bell', [n(0.5, 0.8, ch[3] + 12, 80)]),
    ],
  })),
  reveal: [
    { arp: [72, 76, 79, 84, 88, 91], pad: C },
    { arp: [72, 77, 81, 84, 89, 93], pad: F },
    { arp: [71, 74, 79, 83, 86, 91], pad: G },
  ].map(({ arp, pad }) => ({
    tail: 1.3,
    parts: [
      drums(roll(0, 12, 0.125, SN, 40, 6), [n(1.5, 1, CRASH, 110), n(1.5, 0.2, K, 115)]),
      part('Bell', run(1.5, 0.18, arp, 0.6, 90)),
      part('Pad', chord(0, 2.6, pad, 90)),
    ],
  })),

  // ---------- captioning & voting ----------
  submit: [[88, 93], [86, 91], [84, 88, 91], [91, 96]].map((ps) => ({
    tail: 0.25,
    parts: [part('Pluck', run(0, 0.2, ps, 0.25, 92, 6)), drums([n(0, 0.1, CH, 60)])],
  })),
  voteCast: [81, 84, 86, 88].map((p) => ({
    tail: 0.25,
    parts: [part('Pluck', [n(0, 0.2, p, 70)]), part('Block', [n(0, 0.05, p + 12, 30)])],
  })),
  allIn: [
    { arp: [72, 76, 79, 84, 88], a: F, b: C },
    { arp: [74, 77, 81, 86, 89], a: G, b: C },
    { arp: [67, 71, 74, 79, 83], a: C.map((p) => p - 5), b: G },
  ].map(({ arp, a, b }) => ({
    tail: 0.8,
    parts: [
      part('Bell', run(0, 0.12, arp, 0.4, 84, 5)),
      part('Brass', chord(0.75, 0.25, a.map((p) => p + 12), 104), chord(1.0, 0.7, b.map((p) => p + 12), 114)),
      drums([n(0.75, 0.1, CLAP, 90), n(1.0, 0.2, K, 110), n(1.0, 0.6, CRASH, 90)]),
    ],
  })),
  lastCall: [
    {
      tail: 0.5,
      parts: [
        part('Brass', chord(0, 0.25, [67, 71, 74, 79], 112), chord(0.4, 0.55, [67, 71, 74, 79], 122)),
        part('Block', [n(0, 0.06, 91, 100), n(0.2, 0.06, 91, 100)]),
        drums([n(0, 0.1, SN, 100), n(0.4, 0.1, SN, 116), n(0.4, 0.1, K, 116)]),
      ],
    },
    {
      tail: 0.5,
      parts: [
        part('Lead', run(0, 0.15, [79, 83, 86], 0.14, 100, 6)),
        part('Brass', chord(0.45, 0.55, [65, 69, 72, 77], 120)),
        drums([n(0.45, 0.1, K, 116), n(0.45, 0.1, CLAP, 100), n(0, 0.1, CH, 80), n(0.15, 0.1, CH, 84), n(0.3, 0.1, CH, 90)]),
      ],
    },
  ],
  tick: [84, 86].map((p) => ({ tail: 0.08, parts: [part('Block', [n(0, 0.08, p, 110)])] })),
  timesUp: [
    {
      tail: 0.9,
      parts: [
        part('Brass', [n(0, 0.4, 79, 100), n(0.5, 0.4, 76, 100)], chord(1, 1.2, [64, 67, 72], 105)),
        drums([n(0, 0.2, TOM_H, 90), n(0.5, 0.2, TOM_M, 90), n(1, 0.2, FLOOR, 100), n(1, 0.2, K, 100)]),
      ],
    },
    {
      tail: 0.9,
      parts: [
        part('Bell', [n(0, 0.4, 96, 90), n(0.5, 0.4, 91, 90), n(1, 1, 84, 96)]),
        part('Brass', chord(1, 1.1, [60, 65, 69, 72], 100)),
        drums([n(1, 0.2, K, 104), n(1, 0.8, CRASH, 80)]),
      ],
    },
    {
      tail: 0.8,
      parts: [
        part('Block', [n(0, 0.06, 96, 100), n(0.25, 0.06, 96, 100), n(0.5, 0.06, 96, 100)]),
        part('Brass', chord(0.75, 1.1, [62, 67, 71, 74], 112)),
        drums([n(0.75, 0.2, K, 112), n(0.75, 0.2, FLOOR, 100), n(0.75, 1, CRASH, 96)]),
      ],
    },
  ],
  cardDeal: [81, 79, 84].map((p, i) => ({
    tail: 0.2,
    parts: [drums([n(0, 0.1, i === 2 ? OH : CH, 90), n(0.06, 0.1, CLAP, 40)]), part('Pluck', [n(0.06, 0.15, p, 70)])],
  })),

  // ---------- results ----------
  drumroll: [
    { tail: 0.3, parts: [drums(roll(0, 12, 0.125, SN, 40, 4), roll(1.5, 12, 0.0833, SN, 88, 3), [n(0, 2.5, FLOOR, 50)])] },
    { tail: 0.3, parts: [drums(roll(0, 16, 0.125, FLOOR, 50, 3), roll(2, 8, 0.0625, SN, 96, 3)), part('Pad', chord(0, 2.5, [55, 60, 62, 67], 70))] },
  ],
  // Tally takes sit on C only: the manager pitches each count-up step up the C major scale.
  tally: [[84], [84, 96], [72, 84]].map((ps) => ({
    tail: 0.35,
    parts: [part('Bell', ps.map((p, i) => n(0, 0.3, p, 105 - i * 20)))],
  })),
  zeroVotes: [
    { tail: 0.4, parts: [part('Trombone', run(0, 0.5, [67, 65, 64], 0.45, 96), [n(1.5, 1.3, 62, 100)]), drums([n(1.5, 0.2, TOM_L, 50)])] },
    { tail: 0.4, parts: [part('Trombone', [n(0, 0.6, 67, 96), n(0.55, 1.2, 62, 100)])] },
    { tail: 0.4, parts: [part('Pluck', run(0, 0.33, [76, 72, 67], 0.3, 90)), part('Trombone', [n(1, 1, 60, 90)]), drums([n(1, 0.1, TOM_L, 60)])] },
  ],
  winner: [
    { fan: [72, 76, 79], ch: [64, 67, 72, 76, 84] },
    { fan: [67, 72, 76], ch: [64, 67, 72, 79, 84] },
    { fan: [67, 67, 67], ch: [64, 67, 72, 76, 84] },
    { fan: [72, 74, 76, 79], ch: [67, 72, 76, 79, 84] },
  ].map(({ fan, ch }) => {
    const step = fan.length === 4 ? 0.25 : 0.33;
    const hit = fan.length * step;
    return {
      tail: 1.2,
      parts: [
        part('Brass', run(0, step, fan, step * 0.9, 100, 2), chord(hit, 1.6, ch, 112)),
        part('Bell', [n(hit, 1, 84, 90), n(hit, 1, 88, 80)]),
        drums(fan.map((_, i) => n(i * step, 0.1, SN, 80 + i * 6)), [n(hit, 1, CRASH, 112), n(hit, 0.2, K, 118)]),
        part('Bass', [n(hit, 1.4, 36, 110)]),
      ],
    };
  }),
  tie: [
    {
      tail: 0.6,
      parts: [
        part('Brass', chord(0, 0.3, [67, 72, 76], 104), chord(0.5, 0.3, [67, 72, 76], 104), chord(1.1, 0.9, [65, 67, 72, 74], 100)),
        drums([n(0, 0.1, SN, 90), n(0.5, 0.1, SN, 90), n(1.1, 0.6, OH, 70)]),
      ],
    },
    { tail: 0.6, parts: [part('Bell', run(0, 0.3, [84, 79, 84, 79, 86], 0.35, 92)), drums(run(0, 0.3, [TOM_H, TOM_M, TOM_H, TOM_M], 0.1, 70))] },
  ],
  sweep: [
    {
      tail: 0.85,
      parts: [
        part('Bell', run(0, 0.0625, [72, 74, 76, 77, 79, 81, 83, 84, 86, 88, 89, 91, 93, 95, 96], 0.2, 70, 3)),
        part('Brass', chord(1, 1.1, C.map((p) => p + 12), 118)),
        drums([n(1, 1, CRASH, 116), n(1, 0.2, K, 120)]),
      ],
    },
    {
      tail: 0.85,
      parts: [
        part('Sweep', [n(0, 0.5, 55, 90), n(0.48, 0.5, 91, 100)]),
        part('Brass', chord(1, 1.1, C.map((p) => p + 12), 118)),
        part('Bell', run(1, 0.1, [84, 88, 91, 96], 0.5, 90)),
        drums([n(1, 1, CRASH, 116), n(1, 0.2, K, 120), n(0.5, 0.1, CLAP, 90), n(0.75, 0.1, CLAP, 100)]),
      ],
    },
  ],
  leaderboard: [
    {
      tail: 1.0,
      parts: [
        part('Bell', run(0, 0.12, [60, 64, 67, 72, 76, 79, 84], 0.3, 70, 4)),
        drums([n(0, 0.1, TOM_L, 70), n(0.25, 0.1, TOM_M, 80), n(0.5, 0.1, TOM_H, 90), n(0.86, 0.5, CRASH, 100), n(0.86, 0.2, K, 110)]),
        part('Brass', chord(0.86, 0.5, [64, 67, 72, 76], 96)),
      ],
    },
    {
      tail: 1.0,
      parts: [
        part('Pluck', run(0, 0.1, [74, 72, 69, 67, 69, 72, 74, 79], 0.2, 80)),
        drums(run(0, 0.2, [TOM_H, TOM_M, TOM_L, TOM_M], 0.1, 76), [n(0.86, 0.5, CRASH, 100), n(0.86, 0.2, K, 110)]),
        part('Brass', chord(0.86, 0.5, [62, 67, 71, 74], 96)),
      ],
    },
  ],
  leaderChange: [
    {
      tail: 0.9,
      parts: [
        part('Brass', run(0, 0.2, [67, 69, 71], 0.18, 100), chord(0.6, 0.9, [64, 67, 72, 76], 116)),
        drums([n(0, 0.1, SN, 80), n(0.2, 0.1, SN, 86), n(0.4, 0.1, SN, 92), n(0.6, 0.8, CRASH, 110), n(0.6, 0.2, K, 116)]),
        part('Bell', [n(0.6, 0.8, 88, 84)]),
      ],
    },
    {
      tail: 0.9,
      parts: [
        part('Bell', run(0, 0.1, [79, 83, 86, 91], 0.3, 86)),
        part('Brass', chord(0.5, 0.9, [62, 67, 71, 74, 79], 116)),
        drums([n(0.5, 0.8, CRASH, 106), n(0.5, 0.2, K, 116), n(0.5, 0.1, CLAP, 90)]),
      ],
    },
  ],

  // ---------- final ----------
  podium3: [
    {
      tail: 0.6,
      parts: [part('Brass', chord(0, 0.5, Am.map((p) => p + 12), 100)), drums([n(0, 0.2, K, 100), n(0, 0.1, SN, 96), n(0, 0.5, CRASH, 70)])],
    },
  ],
  podium2: [
    {
      tail: 0.8,
      parts: [
        part('Brass', chord(0, 0.3, F.map((p) => p + 12), 104), chord(0.5, 0.7, G.map((p) => p + 12), 112)),
        drums([n(0, 0.2, K, 104), n(0, 0.1, SN, 96), n(0.5, 0.2, K, 112), n(0.5, 0.7, CRASH, 100)]),
        part('Bass', [n(0, 0.3, 41, 100), n(0.5, 0.7, 43, 110)]),
      ],
    },
  ],
  podium1: [
    {
      tail: 1.1,
      parts: [
        part('Brass', run(0, 0.25, [67, 72, 76], 0.22, 104, 4), chord(0.75, 1.5, [64, 67, 72, 76, 84], 122)),
        part('Lead', [n(0.75, 1.4, 84, 100)]),
        part('Bell', run(0.75, 0.1, [72, 76, 79, 84, 88, 91], 0.8, 86)),
        drums(roll(0, 6, 0.125, SN, 80, 6), [n(0.75, 1.2, CRASH, 122), n(0.75, 0.2, K, 124), n(0.75, 0.2, FLOOR, 110)]),
        part('Bass', [n(0.75, 1.4, 36, 118)]),
      ],
    },
  ],
  champion: [
    { key: 0, low: 67 },
    { key: 2, low: 69 },
  ].map(({ key, low }) => ({
    key, // take 2 is in D major (the final music's key)
    tail: 1.6,
    parts: [
      part(
        'Brass',
        [n(0, 0.22, low, 96), n(0.25, 0.22, low, 96), n(0.5, 0.22, low, 96)],
        chord(0.75, 0.9, [64, 67, 72].map((p) => p + key), 108),
        [n(1.75, 0.22, 69 + key, 100), n(2, 0.22, 67 + key, 100), n(2.25, 0.22, 69 + key, 100)],
        chord(2.5, 2.6, [64, 67, 72, 76, 79].map((p) => p + key), 116),
      ),
      part('Lead', [n(2.5, 2.4, 84 + key, 100)]),
      part('Bell', run(2.5, 0.1, [72, 76, 79, 84, 88, 91, 96].map((p) => p + key), 1, 86)),
      drums([n(0.75, 0.2, K, 110), n(0.75, 0.6, CRASH, 96)], roll(1.5, 8, 0.125, SN, 60, 7), [n(2.5, 2, CRASH, 120), n(2.5, 0.2, K, 124), n(2.5, 0.2, FLOOR, 110)]),
      part('Bass', [n(0.75, 0.9, 36 + key, 110), n(2.5, 2.4, 36 + key, 118)]),
      part('Pad', chord(2.5, 2.6, [60, 64, 67, 72].map((p) => p + key), 90)),
    ],
  })),
};
