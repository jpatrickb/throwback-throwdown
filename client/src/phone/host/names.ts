/** Show the first `max` names, plus how many more are hidden. */
export function summarizeNames(names: string[], max: number): { shown: string[]; more: number } {
  if (names.length <= max) return { shown: names, more: 0 };
  return { shown: names.slice(0, max), more: names.length - max };
}
