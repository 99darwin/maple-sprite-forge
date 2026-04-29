# Nano Banana 2 — attack_primary prompt template

8-frame one-shot primary attack, generated as a **4×2 grid** (not a
horizontal strip). Goes through `nano-banana-edit.mjs` with
`--aspect-ratio 1:1 --resolution 1K`, then through
`grid-to-strip.mjs --columns 4 --rows 2 --inset 0` before the chroma
helper.

Why a grid: Nano Banana 2 rejects 6-frame strips outright, and on 8-frame
horizontal strips it spreads poses across uneven slot boundaries. The 4×2
grid layout obeys the requested frame count reliably.

## Variables

- `{archetype}` — `mage`, `ranger`, or `warrior`
- `{weapon_or_effect}` — class-specific, see below

## Template

```
Use the reference sprite as the exact character identity, costume, palette,
proportions, and right-facing Maple-like 2.5D pixel-art perspective.

Create an 8-frame 4 columns by 2 rows primary attack grid on a pure green
#00ff00 background. Keep the same {archetype} character. The
{weapon_or_effect} appears only for this attack animation.

Frame 1 (top-left): ready stance.
Frame 2 (top, second from left): wind-up.
Frame 3 (top, third from left): attack begins.
Frame 4 (top-right): strongest contact / release pose.
Frame 5 (bottom-left): follow-through.
Frame 6 (bottom, second from left): effect fades / recovery begins.
Frame 7 (bottom, third from left): recover toward neutral.
Frame 8 (bottom-right): almost neutral, ready to return to idle.

Frame the character consistently inside each cell. No UI, text, scenery,
or other characters. Do not let the green key color appear inside the
character art.
```

## Weapon / effect by archetype

**mage** — `a temporary wand or hand-cast that produces a short purple
spell flick or projectile. The effect is small and contained, not a giant
spell circle. The wand or hand-cast appears only for this attack.`

**ranger** — `a compact bow that the {archetype} draws and releases. The
arrow leaves a subtle trailing thread. The bow does not cover the
character's face or torso. The bow appears only for this attack.`

**warrior** — `a simple beginner melee weapon — a crude bat or short sword.
A single horizontal swing. No duplicate off-hand weapon. No oversized
anime-style blade. No shield. The weapon appears only for this attack.`

## Common failures

- Weapon visible across all 8 frames including ready stance and recovery.
  Symptom: weapon held the whole strip. Re-roll with stronger language
  about appearing only at peak.
- Duplicate off-hand weapon. Symptom: warrior holds a second weapon in
  the left hand. Re-roll.
- Effect huge enough to obscure the character. Re-roll with smaller
  effect language.
