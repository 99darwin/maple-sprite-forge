# Nano Banana 2 — cast prompt template

4-frame one-shot cast / emote strip. Goes through `nano-banana-edit.mjs`
with `--aspect-ratio 4:1 --resolution 1K`.

## Variables

- `{archetype}` — `mage`, `ranger`, or `warrior`

## Template

```
Use the reference sprite as the exact character identity, costume, palette,
proportions, and right-facing Maple-like 2.5D pixel-art perspective.

Create a 4-frame horizontal cast / emote strip on a pure green #00ff00
background. Keep the same {archetype} character with no weapon in hand.

This animation plays once when the character does a social cast or emote.
The motion is contained — the character does not move across the strip and
does not produce a projectile or large effect.

Frame 1: anticipation. Slight crouch or arm wind-up.
Frame 2: arms raised in a gesture (open palms or pointing forward).
Frame 3: held pose at peak gesture.
Frame 4: returning to neutral.

No weapon. No spell projectile. No environment effect. No UI, text,
scenery, or other characters. Do not let the green key color appear inside
the character art.
```
