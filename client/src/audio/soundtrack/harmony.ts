// Harmony checks run by compose.ts on every cue and SFX take. Any problem fails the build, so a
// discordant note can't sneak into a render. Rules (from Patrick's listening notes):
//   1. Every pitched note is in the key's major scale (no accidentals).
//   2. Melody notes on strong beats (beats 1 and 3, and every chord change) are chord tones.
//      Other melody notes may be passing/neighbour tones but must move by step to the next note.
//   3. Bass notes are chord tones of the chord sounding at that moment.
//   4. Notes that start together (any layers) never form a minor 2nd / major 7th or a tritone.
import { parseChord, type Note, type Part } from './midi.ts';

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const pc = (p: number) => ((Math.round(p) % 12) + 12) % 12;
const name = (p: number) => `${NAMES[pc(p)]}${Math.floor(Math.round(p) / 12) - 1}`;

export const inKey = (keyPc: number, p: number) => MAJOR.includes((pc(p) - keyPc + 12) % 12);

export interface ChordSpan {
  t: number; // beats
  d: number;
  sym: string;
}

/** Interval class between two pitches: 0..6. */
const ic = (a: number, b: number) => {
  const d = Math.abs(pc(a) - pc(b));
  return Math.min(d, 12 - d);
};

function chordAt(spans: ChordSpan[], t: number): ChordSpan | undefined {
  return spans.find((s) => t >= s.t - 1e-6 && t < s.t + s.d - 1e-6);
}
function chordPcs(sym: string): number[] {
  const c = parseChord(sym);
  return [...c.tones.map((i) => (c.root + i) % 12), c.bass];
}

/** Rule 1 + 4 for any set of parts. */
export function checkParts(label: string, keyPc: number, parts: Part[], errors: string[]) {
  const pitched = parts.filter((p) => !p.drums);
  for (const part of pitched) {
    for (const n of part.notes) {
      if (!inKey(keyPc, n.p)) errors.push(`${label}: ${part.name} plays ${name(n.p)} at beat ${n.t.toFixed(2)}, outside ${NAMES[keyPc]} major`);
    }
  }
  const byOnset = new Map<string, { part: string; p: number }[]>();
  for (const part of pitched) {
    for (const n of part.notes) {
      const k = n.t.toFixed(3);
      const list = byOnset.get(k) ?? [];
      list.push({ part: part.name, p: n.p });
      byOnset.set(k, list);
    }
  }
  for (const [t, list] of byOnset) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const c = ic(list[i].p, list[j].p);
        if (c === 1 || c === 6) {
          errors.push(
            `${label}: ${list[i].part} ${name(list[i].p)} and ${list[j].part} ${name(list[j].p)} start together at beat ${Number(t).toFixed(2)} (${c === 1 ? 'minor 2nd' : 'tritone'})`,
          );
        }
      }
    }
  }
}

/** Rule 2: the melody against the chord chart. */
export function checkMelody(label: string, notes: Note[], spans: ChordSpan[], errors: string[]) {
  const sorted = [...notes].sort((a, b) => a.t - b.t);
  sorted.forEach((n, i) => {
    const span = chordAt(spans, n.t);
    if (!span) return;
    const tones = chordPcs(span.sym);
    if (tones.includes(pc(n.p))) return;
    const beatInBar = ((n.t % 4) + 4) % 4;
    const strong = Math.abs(beatInBar - Math.round(beatInBar)) < 1e-6 && Math.round(beatInBar) % 2 === 0;
    const onChange = Math.abs(n.t - span.t) < 1e-6;
    const where = `bar ${Math.floor(n.t / 4) + 1} beat ${(beatInBar + 1).toFixed(1)}`;
    if (strong || onChange) {
      errors.push(`${label}: melody ${name(n.p)} on a strong beat (${where}) is not in ${span.sym}`);
      return;
    }
    const next = sorted[i + 1];
    const gapOk = next && next.t - (n.t + n.d) < 0.6; // a rest right after = left hanging
    if (!next || !gapOk || Math.abs(next.p - n.p) > 2) {
      errors.push(`${label}: passing note ${name(n.p)} (${where}) over ${span.sym} doesn't resolve by step`);
    }
  });
}

/** Rule 3: bass notes against the chord chart. */
export function checkBass(label: string, notes: Note[], spans: ChordSpan[], errors: string[]) {
  for (const n of notes) {
    const span = chordAt(spans, n.t);
    if (span && !chordPcs(span.sym).includes(pc(n.p))) {
      errors.push(`${label}: bass ${name(n.p)} at beat ${n.t.toFixed(2)} is not in ${span.sym}`);
    }
  }
}
