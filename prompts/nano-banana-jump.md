# Nano Banana 2 — jump prompt template

Single-frame held pose. The runtime applies a temporary Y offset to render
the hop; this frame is just the airborne pose. Goes through
`nano-banana-edit.mjs` with `--aspect-ratio 1:1 --resolution 1K`.

## Variables

- `{archetype}` — `mage`, `ranger`, or `warrior`

## Template

```
Use the reference sprite as the exact character identity, costume, palette,
proportions, and right-facing Maple-like 2.5D pixel-art perspective.

Create a single jump pose on a pure green #00ff00 background. Keep the
same {archetype} character with no weapon in hand.

The character is mid-air with both feet off the ground. Knees slightly
bent, arms drawn slightly inward for balance. Body angled forward as if
having just leapt off the ground. Same right-facing camera as the idle.

No weapon. No motion lines, dust trails, or speed effects. No UI, text,
scenery, or other characters. Do not let the green key color appear
inside the character art.
```
