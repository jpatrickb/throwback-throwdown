// Tiny Standard MIDI File (format 1) writer plus music-theory helpers for compose.ts.
// No dependencies: Soundcraft imports the .mid files this produces.

export interface Note {
  t: number; // start, in beats (quarter notes) from the clip start
  d: number; // duration, in beats
  p: number; // MIDI pitch (60 = C4)
  v: number; // velocity 1..127
}

export interface Part {
  name: string; // becomes the Soundcraft track name
  drums?: boolean; // channel 10 -> Soundcraft picks its Drum Synth
  notes: Note[];
}

const PPQ = 480;

function vlq(n: number): number[] {
  const out = [n & 0x7f];
  n >>= 7;
  while (n > 0) {
    out.unshift((n & 0x7f) | 0x80);
    n >>= 7;
  }
  return out;
}

function chunk(type: string, data: number[]): number[] {
  const len = data.length;
  return [...Buffer.from(type, 'ascii'), (len >>> 24) & 255, (len >>> 16) & 255, (len >>> 8) & 255, len & 255, ...data];
}

function trackData(events: { tick: number; bytes: number[] }[]): number[] {
  events.sort((a, b) => a.tick - b.tick);
  const out: number[] = [];
  let last = 0;
  for (const e of events) {
    out.push(...vlq(e.tick - last), ...e.bytes);
    last = e.tick;
  }
  out.push(0, 0xff, 0x2f, 0); // end of track
  return out;
}

/** Encode parts as a format-1 SMF with a tempo track. */
export function writeSmf(parts: Part[], bpm: number, beatsPerBar = 4): Buffer {
  const usPerQ = Math.round(60_000_000 / bpm);
  const tempo = trackData([
    { tick: 0, bytes: [0xff, 0x51, 3, (usPerQ >> 16) & 255, (usPerQ >> 8) & 255, usPerQ & 255] },
    { tick: 0, bytes: [0xff, 0x58, 4, beatsPerBar, 2, 24, 8] },
  ]);
  const tracks = parts.map((part) => {
    const ch = part.drums ? 9 : 0;
    const name = [...Buffer.from(part.name, 'utf8')];
    const ev: { tick: number; bytes: number[] }[] = [{ tick: 0, bytes: [0xff, 0x03, ...vlq(name.length), ...name] }];
    for (const n of part.notes) {
      const on = Math.max(0, Math.round(n.t * PPQ));
      const off = Math.max(on + 1, Math.round((n.t + n.d) * PPQ));
      const p = Math.max(0, Math.min(127, Math.round(n.p)));
      const v = Math.max(1, Math.min(127, Math.round(n.v)));
      // Offs sort before ons at the same tick (stable sort keeps insertion order; push offs with -0.5 bias).
      ev.push({ tick: off - 0.5, bytes: [0x80 | ch, p, 0] });
      ev.push({ tick: on, bytes: [0x90 | ch, p, v] });
    }
    ev.sort((a, b) => a.tick - b.tick);
    for (const e of ev) e.tick = Math.ceil(e.tick);
    return chunk('MTrk', trackData(ev));
  });
  const header = chunk('MThd', [0, 1, 0, tracks.length + 1, (PPQ >> 8) & 255, PPQ & 255]);
  return Buffer.from([...header, ...chunk('MTrk', tempo), ...tracks.flat()]);
}

// ---------- theory ----------

const PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const QUALITIES: [string, number[]][] = [
  ['maj7', [0, 4, 7, 11]],
  ['m7b5', [0, 3, 6, 10]],
  ['m7', [0, 3, 7, 10]],
  ['7sus4', [0, 5, 7, 10]],
  ['sus4', [0, 5, 7]],
  ['sus2', [0, 2, 7]],
  ['dim', [0, 3, 6]],
  ['m6', [0, 3, 7, 9]],
  ['m', [0, 3, 7]],
  ['6', [0, 4, 7, 9]],
  ['9', [0, 4, 7, 10, 14]],
  ['7', [0, 4, 7, 10]],
  ['', [0, 4, 7]],
];

export interface Chord {
  root: number; // pitch class
  bass: number; // pitch class of the bass note (slash chords)
  tones: number[]; // intervals from root
}

/** "C", "Am", "Dm7", "G7", "D/F#", "Bbmaj7", "C7sus4"... */
export function parseChord(sym: string): Chord {
  const [main, slash] = sym.split('/');
  const m = /^([A-G])([#b]?)(.*)$/.exec(main);
  if (!m) throw new Error(`bad chord ${sym}`);
  const root = (PC[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + 12) % 12;
  const q = QUALITIES.find(([k]) => m[3] === k);
  if (!q) throw new Error(`unknown chord quality in ${sym}`);
  let bass = root;
  if (slash) {
    const s = /^([A-G])([#b]?)$/.exec(slash);
    if (!s) throw new Error(`bad slash bass in ${sym}`);
    bass = (PC[s[1]] + (s[2] === '#' ? 1 : s[2] === 'b' ? -1 : 0) + 12) % 12;
  }
  return { root, bass, tones: q[1] };
}

/** Pitches of the chord voiced closest to `prev` inside [lo, hi]. */
export function voice(ch: Chord, lo: number, hi: number, prev: number[] | null, maxNotes = 4): number[] {
  const pcs = ch.tones.slice(0, maxNotes).map((i) => (ch.root + i) % 12);
  const candidates: number[][] = [];
  // every inversion starting at each octave position in range
  for (let base = lo; base <= hi; base++) {
    if (!pcs.includes(base % 12)) continue;
    const start = pcs.indexOf(base % 12);
    const notes = [base];
    for (let k = 1; k < pcs.length; k++) {
      const pc = pcs[(start + k) % pcs.length];
      let n = notes[notes.length - 1] + 1;
      while (n % 12 !== pc) n++;
      notes.push(n);
    }
    if (notes[notes.length - 1] <= hi) candidates.push(notes);
  }
  if (!candidates.length) return pcs.map((pc) => lo + ((pc - lo) % 12 + 12) % 12).sort((a, b) => a - b);
  if (!prev) return candidates[Math.floor(candidates.length / 2)];
  const center = prev.reduce((a, b) => a + b, 0) / prev.length;
  const cost = (c: number[]) => Math.abs(c.reduce((a, b) => a + b, 0) / c.length - center);
  return candidates.reduce((best, c) => (cost(c) < cost(best) ? c : best));
}

/** Lowest pitch >= lo with this pitch class. */
export function pcAtOrAbove(pc: number, lo: number): number {
  let n = lo;
  while (((n % 12) + 12) % 12 !== pc) n++;
  return n;
}

const MAJOR = [0, 2, 4, 5, 7, 9, 11];

/** Melody tokens in scale degrees: "5:.5" = degree 5 for half a beat; "1'" octave up, "7," octave down,
 *  "#4"/"b7" accidentals, "r:1" rest. `tonic` is the MIDI pitch of degree 1. */
export function melody(tokens: string, tonic: number, startBeat: number, vel = 96): Note[] {
  const out: Note[] = [];
  let t = startBeat;
  for (const tok of tokens.trim().split(/\s+/)) {
    const [deg, durS] = tok.split(':');
    const d = Number(durS);
    if (deg !== 'r') {
      const m = /^([#b]?)([1-7])([',]*)$/.exec(deg);
      if (!m) throw new Error(`bad melody token ${tok}`);
      let p = tonic + MAJOR[Number(m[2]) - 1] + (m[1] === '#' ? 1 : m[1] === 'b' ? -1 : 0);
      for (const c of m[3]) p += c === "'" ? 12 : -12;
      out.push({ t, d: d * 0.92, p, v: vel + (Math.round(t * 2) % 2 === 0 ? 6 : -4) });
    }
    t += d;
  }
  return out;
}

/** Sum of a melody line's durations in beats (for sanity checks). */
export function melodyBeats(tokens: string): number {
  return tokens
    .trim()
    .split(/\s+/)
    .reduce((s, tok) => s + Number(tok.split(':')[1]), 0);
}
