# Still prompt template

Use this with gpt-image-2, the imagegen skill, fal flux, Midjourney — whichever
still generator you trust to produce a clean, identifiable archetype on a flat
background. The output of this step is the *seed reference* that every motion
strip is built from. Spend time here. If the still is wrong, no amount of
chained motion will fix it.

The prompt assumes a 1024×1024 square output. Crop and resize to 256×256
before passing to Nano Banana 2 (the included `node` snippet in
`docs/pipeline.md` step 2 handles the green background composite).

## Variables

- `{archetype}` — `mage`, `ranger`, or `warrior`
- `{archetype_details}` — class-specific palette / costume cues, see below

## Template

```
A single right-facing 2.5D Maple-like pixel-art {archetype}, full body, idle
stance, on a flat #00ff00 (pure green) background. Centered. Feet near the
bottom of the canvas. Hinted far eye (do not draw a hard side-profile
silhouette — keep a slight 3/4 face plane). Readable silhouette. Clean pixel
edges, no anti-aliased smear, no painterly blur. Game-ready proportions:
roughly 5-6 head heights tall.

{archetype_details}

No weapon in hand. No background props. No UI. No text. No frame, border, or
vignette. No shadow on the ground.
```

## Archetype details

**mage** — robe in cool tones (deep blue, violet, teal accents). Pointed
hood or simple hat. Pale skin or warm tan, neutral expression. Rune or
sigil pattern is optional and small.

**ranger** — hooded short cloak, leather tunic, breeches, soft boots.
Earth-tone palette (forest green, warm brown, ochre). Quiver strap is OK
across the chest, but no bow in hand. Neutral expression.

**warrior** — sleeveless tunic or simple armor over leggings. Warm palette
(rust, bronze, deep red). No weapon in hand and no shield. Sturdy build.
Determined neutral expression.

## What to verify before approving the still

- Right-facing 2.5D camera. Reject hard side-profile silhouettes.
- Feet near `y = 240` on the 256×256 canvas (bottom-anchored).
- Background is pure `#00ff00` with no green inside the character.
- No weapon. Weapons appear only in `attack_primary` strips.
- Readable face plane with hinted far eye, not a one-eyed flat silhouette.

If any of these are wrong, regenerate. Do not proceed to motion until the
still is right.
