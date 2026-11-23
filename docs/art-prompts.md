# Art prompts for Patrick

Every image the game uses has a working placeholder, so none of these are required.
To swap one in: save the file to `client/public/art/`, then change its path in
`client/src/theme/art.ts` (one line). If a file is missing, the game hides it and keeps going.

## Shared style (paste this at the start of every prompt)

> Playful hand-drawn sticker illustration, "family photo album meets game show" style. Bold dark
> plum outlines (#2b1630), flat saturated colours: sunshine yellow #ffcc33, bubblegum pink #ff5fa2,
> mint #3ddcb4, sky blue #4fb3ff, tangerine #ff8a3d, cream paper #fff7e6. Slightly wobbly marker
> linework, subtle paper texture, cheerful 90s scrapbook energy. No text unless asked.

Keep the same palette across every asset so they all look like one set. When a prompt says
**transparent PNG**, ask for a transparent background (or a flat green one, then remove it).

---

## 1. Logo: `logo.png` (manifest key `logo`, currently `null`, so the title renders as styled text)
- **Size:** 1600×600, transparent PNG
- **Prompt:** *[shared style]* A chunky, bouncy game-show logo that reads exactly "THROWBACK THROWDOWN"
  on two lines. Fat rounded display letters in sunshine yellow and mint, a thick plum outline and a
  pink drop shadow. A strip of washi tape and a tiny polaroid photo tucked behind the letters, plus
  sparkles. Centered, transparent background.
- Image models often misspell text. If yours does, skip the logo: the styled-text version updates
  automatically when `BRAND.name` changes in `client/src/brand.ts`.

## 2. Mascot "Snappy": `mascot.png` (key `mascot`, placeholder `mascot.svg`)
- **Size:** 800×800, transparent PNG
- **Prompt:** *[shared style]* A cute retro instant camera character named Snappy: a cream body,
  a pink top stripe, a big blue lens as its face with a shiny highlight, a happy wide grin, little
  stubby arms waving hello. Front view, full body, centered, transparent background.
- **Optional extra poses** (same prompt plus one of these): "cheering with arms up and confetti",
  "holding a gold trophy", "peeking over the edge nervously". Save as `mascot-cheer.png` and so on,
  then tell the tv teammate to wire them up.

## 3. Stage background: `background.jpg` (key `background`, currently `null`, so a CSS sunburst is used)
- **Size:** 1920×1080 JPG
- **Prompt:** *[shared style]* A game-show stage backdrop seen straight on: a deep berry-purple
  (#5b1a6e) background with a soft magenta spotlight in the centre, faint sunburst rays radiating
  outward, and scattered scrapbook doodles (stars, hearts, squiggles) around the edges. Keep the
  centre calm and dark so text and photos stay readable. No people, no text.
- The CSS sunburst still animates on top, so keep the image fairly plain.

## 4. Polaroid back: `photo-back.png` (key `photoBack`, placeholder `photo-back.svg`)
- **Size:** 800×960 PNG
- **Prompt:** *[shared style]* The back of an instant photo: cream-to-kraft paper with faint
  ruled lines, a little coffee-ring stain and a small camera doodle. **No text and no question
  marks** (Patrick: the game never writes on the photos). Flat, straight on, no perspective, fills the frame.

## 5. Doodle stickers (keys under `doodles`, placeholders `*.svg`)
Each one: **512×512 transparent PNG**, a single sticker centered, with a thin white sticker border.

| File | Prompt (after the shared style) |
|---|---|
| `star.png` | A chunky five-point star sticker in sunshine yellow with a plum outline |
| `heart.png` | A puffy heart sticker in bubblegum pink |
| `squiggle.png` | A loose mint marker squiggle line |
| `sparkle.png` | A four-point sparkle/twinkle in sky blue |
| `swirl.png` | A tangerine spiral doodle |
| `crown.png` | A goofy gold paper crown with three coloured gems (pink, mint, blue) |

The crown also appears on the winning caption and the champion podium, so make it the best one.

---

## Not images, but easy to change
- **Colours, fonts, corner radii, animation speed:** `client/src/theme/tokens.css`
- **Animation pacing** (how long each results reveal takes, etc.): `TIMING` in `client/src/tv/motion.ts`
- **Game name and tagline:** `client/src/brand.ts`
