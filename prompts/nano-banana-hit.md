# Nano Banana 2 — hit prompt template

4-frame one-shot flinch / recover. Goes through `nano-banana-edit.mjs` with
`--aspect-ratio 4:1 --resolution 1K`.

## Variables

- `{archetype}` — `mage`, `ranger`, or `warrior`

## Template

```
Use the reference sprite as the exact character identity, costume, palette,
proportions, and right-facing Maple-like 2.5D pixel-art perspective.

Create a 4-frame horizontal hit-reaction strip on a pure green #00ff00
background. Keep the same {archetype} character with no weapon in hand.

This animation plays once when the character takes damage. The motion is a
brief flinch followed by a recovery to neutral.

Frame 1: impact. Body slightly hunched, head turned away from the hit, arms
inward.
Frame 2: peak flinch. Body more crouched, weight shifted backward.
Frame 3: starting to recover. Body straightening, arms loosening.
Frame 4: nearly back to neutral idle pose.

The character stays in the same screen position across all 4 frames. No
weapon, no blood, no impact-effect particles, no damage numbers. No UI,
text, scenery, or other characters. Do not let the green key color appear
inside the character art.
```
