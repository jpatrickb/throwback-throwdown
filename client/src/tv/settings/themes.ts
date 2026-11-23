// Theme picker data. The theme is SERVER state (view.settings.theme) so phones follow the TV.
// Ids and labels come from THEMES in shared/types.ts; each id's colours/fonts are a
// [data-theme] block in client/src/theme/tokens.css. This file adds only the preview swatches.
// To add a theme: a THEMES entry (lead/contract), a tokens.css block, and a swatch here.
import { THEMES, type ThemeId } from '../../../../shared/types.ts';

/** Preview swatch colours for the picker: [background, card, accent, accent]. */
const SWATCHES: Record<ThemeId, [string, string, string, string]> = {
  berry: ['#5b1a6e', '#fff7e6', '#ffcc33', '#ff5fa2'],
  cork: ['#c99a62', '#fffdf6', '#e8507e', '#2bb59a'],
  arcade: ['#120634', '#160d33', '#00f0d0', '#ff2fb4'],
  picnic: ['#b8e6dc', '#fffaf0', '#ff7aa2', '#ffd166'],
};

export const THEME_OPTIONS = THEMES.map((t) => ({ value: t.id, label: t.label, swatch: SWATCHES[t.id] }));

/** Apply a theme to the page (<html data-theme>). Berry is the :root default. */
export function applyTheme(id: string | null | undefined): void {
  const known = THEMES.some((t) => t.id === id) ? (id as ThemeId) : 'berry';
  if (known === 'berry') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = known;
}
