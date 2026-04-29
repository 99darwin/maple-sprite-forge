# Pipeline

Eleven steps from "I have an idea for an archetype" to "I have a manifest
and frame folders ready to drop into a game." Each step has a script or a
specific external tool. Skipping steps generally produces sprites that
"work" until you put them on a checker background and watch them break.

The directory layout this guide assumes:

```
seed/
  archetypes/
    mage/
      nano-banana-idle/
        prompt.txt
        raw/
          reference-green.png
          strip-green.png
          strip-alpha.png
        idle/
          idle_01.png ...
      nano-banana-walk/
        ...
    ranger/
    warrior/
manifest.json
```

You can use any layout you want — `qc.mjs` walks `--seed-dir` and matches
folder names against the animation contract. The structure above is just
what the contact sheet and GIF examples assume.

## Step 1 — Generate the approved still

This is the *seed reference* for every motion strip. Spend time here. If
the still is wrong, motion will not fix it.

Use whichever still generator you trust:

- **gpt-image-2** (OpenAI's just-released model) — best identity stability
- **imagegen skill** — same style of model, integrated into Codex/Claude
  workflows
- **fal flux**, **Midjourney**, etc. — also fine

Use the prompt template in `prompts/still.md`. Output a 1024×1024 image
with the character on a flat `#00ff00` background. Crop and resize to
`256×256` before continuing.

What to verify before approving:

- right-facing 2.5D camera (no hard side-profile)
- feet near `y = 240` on the 256×256 canvas
- pure green background, no green inside the character
- no weapon
- hinted far eye, not a one-eyed flat silhouette

If any of these are wrong, regenerate. Do not animate a bad still.

## Step 2 — Composite the still onto pure green

Nano Banana 2 needs a solid-color reference frame. Composite the
transparent still onto pure `#00ff00`. This snippet works:

```bash
node -e "const sharp=require('sharp'); const fs=require('fs/promises'); (async()=>{ const src='seed/archetypes/mage/nano-banana-idle/raw/reference-still.png'; const out='seed/archetypes/mage/nano-banana-idle/raw/reference-green.png'; await fs.mkdir(require('path').dirname(out),{recursive:true}); await sharp({create:{width:256,height:256,channels:4,background:'#00ff00'}}).composite([{input:src,left:0,top:0}]).png().toFile(out); })().catch(e=>{console.error(e);process.exit(1)})"
```

## Step 3 — Write the prompt

Pull the template from `prompts/nano-banana-<animation>.md`, fill in the
archetype, and save it to:

```
seed/archetypes/<archetype>/<variant>/prompt.txt
```

Keep prompts narrow:

- one animation at a time
- exact frame count
- exact direction
- exact background color
- no UI, no scenery, no extra characters
- preserve character identity from the reference
- forbid green from appearing inside character art

## Step 4 — Generate the raw strip with Nano Banana 2

```bash
node scripts/nano-banana-edit.mjs \
  --image seed/archetypes/mage/nano-banana-idle/raw/reference-green.png \
  --prompt-file seed/archetypes/mage/nano-banana-idle/prompt.txt \
  --out seed/archetypes/mage/nano-banana-idle/raw/strip-green.png \
  --aspect-ratio 4:1 \
  --resolution 1K
```

Aspect ratio by frame count:

| Frames | Aspect | Notes |
| --- | --- | --- |
| 1 | `1:1` | jump |
| 4 | `4:1` | idle, cast, hit |
| 8 | `8:1` | walk_side |
| 8 (4×2 grid) | `1:1` | attack_primary — use grid-to-strip.mjs after |

The script writes `strip-green.png` and `strip-green.png.json`. The JSON
contains the fal request id; keep it for reproducibility.

## Step 5 — Remove the chroma key

```bash
python3 scripts/python/remove_chroma_key.py \
  --auto-key border \
  --soft-matte \
  --despill \
  --input seed/archetypes/mage/nano-banana-idle/raw/strip-green.png \
  --out seed/archetypes/mage/nano-banana-idle/raw/strip-alpha.png
```

The flag is `--out`, not `--output`. Review `strip-alpha.png` on dark and
light backgrounds before continuing — green spill on dark hair is invisible
on dark gray and obvious on white.

## Step 6 — Normalize the strip

```bash
node scripts/normalize-strip.mjs \
  --input seed/archetypes/mage/nano-banana-idle/raw/strip-alpha.png \
  --out-dir seed/archetypes/mage/nano-banana-idle/idle \
  --animation idle \
  --frames 4 \
  --chroma-key none
```

`--chroma-key none` is important. The Python helper already produced a
clean alpha matte. Asking the normalizer to re-run spill cleanup at this
stage tends to damage hair and outlines (this happened to the ranger
class — brown hair came out nearly transparent).

The normalizer:

- slices equal-width slots
- removes tiny detached opaque components (model specks)
- computes one shared scale across all frames
- places each frame on a transparent 256×256 canvas
- aligns around `{ x: 128, y: 240 }`
- writes a `normalize-report.json` next to the frames

Output:

```
idle/
  idle_01.png
  idle_02.png
  idle_03.png
  idle_04.png
  normalize-report.json
```

For the 8-frame attack grid, run `grid-to-strip.mjs` first to unfold the
4×2 grid into a horizontal strip, then normalize:

```bash
node scripts/grid-to-strip.mjs \
  --input raw/strip-green.png \
  --out raw/strip-unfolded.png \
  --columns 4 --rows 2 --inset 0
# (chroma helper here)
node scripts/normalize-strip.mjs \
  --input raw/strip-alpha.png \
  --out-dir attack_primary \
  --animation attack_primary \
  --frames 8 \
  --chroma-key none
```

## Step 7 — Render contact sheet and GIF

Contact sheet across archetypes:

```bash
node scripts/contact-sheet.mjs \
  --out preview/idle-contact.png \
  --row seed/archetypes/mage/nano-banana-idle/idle \
  --row seed/archetypes/ranger/nano-banana-idle/idle \
  --row seed/archetypes/warrior/nano-banana-idle/idle \
  --background '#1a1a1a'
```

GIF for one archetype:

```bash
node scripts/render-gif.mjs \
  --frames-dir seed/archetypes/mage/nano-banana-idle/idle \
  --out preview/mage-idle.gif \
  --fps 8 \
  --background '#1a1a1a'
```

Inspect the GIF. A clean contact sheet does not prove a clean loop. The
GIF will catch frame-order issues, weapon ghosting, and mid-cycle scale
drift.

## Step 8 — Polish walk loops with Pixel Engine (optional)

If a walk cycle is *almost* good — the poses read but the loop has a hitch
— Pixel Engine can smooth it. Send 4 keyframes, get back 8 interpolated
frames:

```bash
node scripts/pixel-engine.mjs keyframes \
  --keyframe 0:seed/archetypes/warrior/nano-banana-walk/walk_side/walk_side_01.png:1 \
  --keyframe 2:seed/archetypes/warrior/nano-banana-walk/walk_side/walk_side_03.png:0.9 \
  --keyframe 4:seed/archetypes/warrior/nano-banana-walk/walk_side/walk_side_05.png:1 \
  --keyframe 6:seed/archetypes/warrior/nano-banana-walk/walk_side/walk_side_07.png:0.9 \
  --total-frames 8 \
  --prompt 'walk cycle, side view, looping' \
  --out seed/archetypes/warrior/pixel-walk/raw/strip.png \
  --wait
```

Pixel Engine outputs on a magenta `#ff00ff` matte, so chroma-clean and
normalize again:

```bash
python3 scripts/python/remove_chroma_key.py --auto-key border --soft-matte --despill \
  --input .../raw/strip.png --out .../raw/strip-alpha.png
node scripts/normalize-strip.mjs --input .../raw/strip-alpha.png \
  --out-dir .../walk_side --animation walk_side --frames 8 --chroma-key none
```

Pixel Engine is a polish step, not a rescue step. If the source has a
weapon ghost or the wrong perspective, regenerate before spending credits.

## Step 9 — Run QC

```bash
node scripts/qc.mjs --seed-dir seed --manifest manifest.json
```

Validates frame count by animation, dimensions match `manifest.frame.width`
and `manifest.frame.height`, alpha channel present, and no opaque magenta
pixels (indicating un-keyed Pixel Engine output). Writes
`qc-report.json` and exits non-zero on any failure.

QC catches mechanical failures only. It does not catch a moonwalking
cycle. Always inspect GIFs.

## Step 10 — Drop into your game

The `manifest.json` shape (see `manifest.example.json`) maps each
archetype's animations to frame directories. Pick whatever runtime you
use; the contract is `frame.width × frame.height` PNG with a feet-anchored
position at `frame.anchor.x, frame.anchor.y`. The runtime is responsible
for applying the anchor when drawing.

## Step 11 — Multi-background browser review

A sprite that looks fine on dark gray can have green/magenta edge
contamination invisible at that one background. Build a tiny HTML page
that draws each sprite over:

- dark (`#1a1a1a`)
- light (`#f4f4f4`)
- sky / blue (`#5588ff`)
- green (`#00ff00`)
- magenta (`#ff00ff`)
- checkerboard

If a sprite still reads cleanly across all six, it survives. This is the
last gate before the manifest goes to runtime. The browser is the truth.
