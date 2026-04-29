# Nano Banana 2 — walk_side prompt template

8-frame horizontal walk-cycle strip. Goes through `nano-banana-edit.mjs` with
`--aspect-ratio 8:1 --resolution 1K`.

Walk cycles are the hardest animation for Nano Banana 2. Expect to either
re-roll, reorder frames with `reorder-frames.mjs`, or hand the result to
Pixel Engine as keyframes (1, 3, 5, 7) for loop polish.

## Variables

- `{archetype}` — `mage`, `ranger`, or `warrior`

## Template

```
Use the reference sprite as the exact character identity, costume, palette,
proportions, and right-facing Maple-like 2.5D pixel-art perspective.

Create an 8-frame horizontal walk-cycle strip on a pure green #00ff00
background. The {archetype} walks to the right across the strip, but each
frame is centered in its slot — the character stays in roughly the same
screen position; only the legs, arms, and torso move.

The cycle should read clearly:
Frame 1: contact pose, right leg forward planted.
Frame 2: weight transfers to right leg, left foot lifts.
Frame 3: passing pose, left foot at highest lift.
Frame 4: left foot reaching forward.
Frame 5: contact pose, left leg forward planted (mirror of frame 1).
Frame 6: weight transfers to left leg, right foot lifts.
Frame 7: passing pose, right foot at highest lift.
Frame 8: right foot reaching forward (loops back to frame 1).

No weapon in hand. No bouncing in place. No turning. No UI, text, scenery,
or other characters. Do not let the green key color appear inside the
character art.
```

## Common failures

- Bobbing in place rather than walking. Symptom: frames 1 and 5 look
  identical, no leg movement. Re-roll.
- Frames in wrong order. Symptom: the character appears to moonwalk in the
  GIF preview. Use `reorder-frames.mjs --order 1,8,7,6,5,4,3,2` (or
  whatever order makes the GIF read forward).
- Weapon ghosting in idle hand. Re-roll with stronger "no weapon in hand"
  language, and verify the input still has no weapon visible.
