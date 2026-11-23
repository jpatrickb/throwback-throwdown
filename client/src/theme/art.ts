// ART MANIFEST: the one place that maps art keys to files in client/public/art/.
// To swap in Patrick's real art: drop the file in client/public/art/ and change the path here.
// `null` means "no image yet": components fall back to CSS/text (e.g. the logo renders BRAND.name).
// Missing files never break the game: <ArtImg> hides itself if a file 404s.
// Prompts for generating each asset: docs/team/art-prompts.md
export const ART = {
  /** Game logo (transparent PNG, ~1600x600). null = styled text from BRAND.name. */
  logo: null as string | null,
  /** Mascot "Snappy" the instant camera (transparent PNG, ~800x800). */
  mascot: '/art/mascot.svg' as string | null,
  /** Optional full-screen background (JPG/PNG 1920x1080). null = CSS sunburst. */
  background: null as string | null,
  /** Back of the polaroid, shown before the photo flips over. */
  photoBack: '/art/photo-back.svg' as string | null,
  /** Small stickers/doodles floating on the background and decorating cards. */
  doodles: {
    star: '/art/star.svg',
    heart: '/art/heart.svg',
    squiggle: '/art/squiggle.svg',
    sparkle: '/art/sparkle.svg',
    swirl: '/art/swirl.svg',
    crown: '/art/crown.svg',
  },
} as const;

export type DoodleKey = keyof typeof ART.doodles;
export const DOODLE_KEYS = Object.keys(ART.doodles) as DoodleKey[];
