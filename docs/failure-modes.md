# Failure modes

This is the most useful page in this repo. It's not theoretical — every
failure below cost a real generation cycle or got caught by browser review
right before promotion. Most of the rules in `docs/pipeline.md` exist
because of one of these.

## Why baked archetypes, not runtime paper-doll layers

The first plan was a true paper-doll character model: body, face, hair,
clothes, weapon, and cosmetics as separate runtime layers. That is still
the right long-term game architecture. The current generation tools were
not consistent enough to support it. The layer-composition tests failed
in predictable ways:

- hair layers did not reliably align to the head
- face layers drifted between frames
- bodies rotated differently between male/female variants
- hands and weapons could not keep stable sockets
- generated layers had incompatible occlusion assumptions
- even still-frame layer tests produced distorted mannequin heads and
  unusable hair/face boundaries

The pivot was to fully baked archetypes. Customization can still exist as
additional approved baked variants. The chained model pipeline in this
repo is the result of that pivot. The thesis is not "AI can't do this;"
the thesis is "no one model can do this; here's the chain that can."

## Mixed camera perspective

Reject any batch where one archetype is rendered as a hard side-profile
silhouette and another is rendered with a 2.5D face plane. Accessories,
costume variants, and animations cannot share style if the face plane
changes between archetypes.

Standardize on right-facing 2.5D Maple-like across the whole pack. Hint a
far eye; do not draw a one-eyed flat silhouette.

## Weaponed locomotion

Do not carry weapons in `idle` or `walk_side`. Weapons belong only in
`attack_primary`. This rule came from repeated and expensive failures:

- A bow held in walk_side disappeared behind the leg on certain frames.
  Hand-painted bow repairs created a worse problem: a detached "floating
  stick" that broke the silhouette.
- Mage staves duplicated in the off-hand on some frames.
- Warrior bats produced matte artifacts at the weapon edge that survived
  chroma cleanup and showed up as colored halos in browser review.

If you want a weapon-state walk, generate it as an explicit variant. Do
not try to add a weapon to a working weaponless walk after the fact.

## Chroma-key contamination

Always review on key-color backgrounds. A sprite can look fine on dark
gray and still have green or magenta edge contamination. The browser
debug page (six backgrounds: dark / light / sky / green / magenta /
checker) catches this; the contact sheet does not.

## Alpha damage on hair and outlines

The ranger idle once shipped through QC with brown hair that was almost
fully transparent. The contact sheet hid it. The dark-gray browser review
hid it. It only became obvious on a light background.

Root cause: the normalizer was running aggressive spill cleanup even when
the chroma helper had already produced a clean alpha matte. The fix was
to pass `--chroma-key none` to the normalizer when the chroma helper has
already run. This is now the default workflow in `docs/pipeline.md`. The
normalizer's spill logic only runs when a real chroma key is active.

## Frame-order failures (the moonwalk)

Do not trust the strip order returned by Nano Banana 2. The poses can be
correct but the order can be wrong. A walk cycle with the right contact
poses but the wrong order looks exactly like the character is moonwalking
in the GIF preview.

Fix: use `reorder-frames.mjs` to re-sequence by index. It writes copies
into a new directory and an `order-map.json`, leaving the source frames
untouched. Never overwrite source art to fix order.

## Walk cycles that aren't actually walking

Some early walk attempts had the character bobbing up and down in place
without legs alternating. The contact sheet read as eight slightly
different poses; the GIF revealed there was no actual stride.

If frames 1 and 5 look identical and the legs are not clearly alternating
between contact poses, the cycle is bobbing. Re-roll. Reordering will not
fix it — the frames don't contain the right poses.

## Contact-sheet blind spots

A contact sheet proves frame presence, dimensions, and rough identity. It
does not prove loop quality. It does not prove that the GIF will play
without a hitch, and it does not catch mid-cycle scale drift well. Always
inspect at least:

- the GIF
- the multi-background browser page
- the frames in the actual game runtime if available

## 6-frame strips and grid-vs-strip layout

Nano Banana 2 rejects `6:1` aspect ratios and degrades on 8-frame
horizontal strips by spreading poses across uneven slot boundaries — the
result looks correct in places and shears apart during normalization.

Fix: for any animation longer than 4 frames, generate as a 4×2 grid with
`--aspect-ratio 1:1`, then unfold with
`scripts/grid-to-strip.mjs --columns 4 --rows 2 --inset 0`. This is the
attack_primary contract.

## Cyan halos around Pixel Engine output

Pixel Engine outputs on a magenta `#ff00ff` matte that is generally
clean, but occasionally leaves cyan-biased anti-alias pixels around
character edges after chroma cleanup. They survive into the normalized
PNG and show up as colored halos on dark backgrounds.

Fix: run `scripts/cyan-clean.mjs` after the normalizer. It is edge-only
— it preserves cyan accents inside the character (costume detail) and
clears only bright cyan pixels touching alpha.

## Mid-cycle scale drift

Generated walks sometimes have one or two frames where the character
visibly grows or shrinks relative to the others — the model lost scale
mid-strip. The normalizer applies one shared scale across all frames, so
a single oversized frame compresses the rest of the cycle.

Fix: run `scripts/stabilize-height.mjs --target-height 210` after the
normalizer. It rescales each frame's bounding box to the target height
and re-anchors bottom-center, removing visible breathing-in-place.

## Pixel Engine as rescue (don't)

Pixel Engine smooths walks that are *already close*. It does not rescue
walks with the wrong perspective, duplicated weapons, occluded limbs, or
missing poses. If you give it bad source, you get smoother bad output.

Good Pixel Engine use: the warrior walk had readable poses but a rough
leg switch and loop closure; Pixel Engine smoothed those into the first
acceptable warrior walk.

Bad Pixel Engine use: an earlier hair-occluded pass got smoother but
preserved the hair damage. Source sheets with props in the wrong place
produced cleaner wrong props.

## Final rule

The browser debug page is the truth. A candidate is not good because the
prompt was good, the raw output looked good, the contact sheet looked
good, or the GIF looked good on dark gray. A candidate is good only after
it survives:

1. raw inspection
2. chroma cleanup
3. normalization
4. contact sheet
5. GIF
6. multi-background browser review
7. runtime scene verification
