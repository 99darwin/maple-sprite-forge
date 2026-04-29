# maple-sprite-forge

A chained-model pipeline for generating Maple-like 2.5D pixel-art sprite
sheets that survive runtime use.

The thesis: no single model produces a usable game sprite sheet end-to-end.
Imagegen-style models (gpt-image-2, fal flux, Midjourney) are good at
controlled stills and bad at multi-frame motion. Nano Banana 2 is good at
posed motion strips and bad at delivering clean transparency or correct
frame order. Pixel Engine smooths walks that are already close and ruins
walks that aren't. Each tool does one job, and chaining them — with
explicit cleanup, normalization, and QC steps in between — is the actual
work.

This repo is the chain. Three example archetypes (mage, ranger, warrior),
six animations (idle, walk_side, cast, jump, hit, attack_primary), the
exact prompts, every script, and a long list of the failure modes that
shaped the workflow.

> Article: TODO(article-url) — write-up of why this pipeline exists and
> what each model is doing.

## What you get

- Three reference archetypes (`mage`, `ranger`, `warrior`) at 256×256,
  feet-anchored, right-facing 2.5D
- Animations: `idle` (4), `walk_side` (8), `cast` (4), `jump` (1),
  `hit` (4), `attack_primary` (8 as 4×2 grid)
- Scripts: chroma-key cleanup, frame normalizer, grid-to-strip unfolder,
  contact sheet renderer, GIF renderer, QC validator, fal Nano Banana 2
  client, Pixel Engine client, plus four post-processing helpers
  (cyan-edge clean, flood-clear backplates, height stabilizer, frame
  reorderer)
- Prompt templates parameterized by archetype, one per animation
- A simplified manifest schema separating "frames this repo produces"
  from "runtime layers your game cares about"

The example archetypes ship as placeholder directories under `examples/`.
Reference outputs (PNGs and GIFs) will be added there once the public
pipeline runs end-to-end.

## Prerequisites

- Node 20.11+ and pnpm
- Python 3.10+ with Pillow (for the chroma-key step)
- ffmpeg in PATH (for GIF rendering)
- A fal.ai key with Nano Banana 2 access
- A Pixel Engine account (for loop polish)
- An image-generation tool of your choice for the seed still (gpt-image-2,
  the imagegen skill, fal flux, Midjourney — see `prompts/still.md`)

## Quick start

```bash
git clone https://github.com/99darwin/maple-sprite-forge.git
cd maple-sprite-forge
cp .env.example .env
# fill in FAL_API_KEY and PIXEL_ENGINE_API_KEY
pnpm install
pip install -r scripts/python/requirements.txt
```

Then follow `docs/pipeline.md` end-to-end. First archetype takes about an
hour, including review.

## Tool roles

- **gpt-image-2 / imagegen / fal flux** — stills only. The seed reference
  for everything that follows.
- **Nano Banana 2 (fal.ai)** — first-pass posed motion strips. Best for
  idle, cast, jump, hit. Acceptable for walk_side and attack_primary
  with the contracts in `prompts/`.
- **remove_chroma_key.py** — green/magenta to alpha, soft matte, despill.
- **normalize-strip.mjs** — slice strip, drop specks, place on
  transparent canvas, anchor at feet.
- **Pixel Engine** — polish step for walk loops. Not a rescue step.
- **qc.mjs** — mechanical contract check. Not a substitute for visual
  review.

## The contract

Every approved frame:

- 256×256 PNG with alpha
- transparent background
- bottom-center feet anchor at `{ x: 128, y: 240 }`
- right-facing 2.5D Maple-like camera with hinted far eye
- no weapon in standard locomotion (`idle`, `walk_side`)

## Frame counts

| Animation | Frames | Aspect | Runtime |
| --- | --- | --- | --- |
| idle | 4 | 4:1 | loop |
| walk_side | 8 | 8:1 | loop |
| cast | 4 | 4:1 | one-shot |
| jump | 1 | 1:1 | held pose |
| hit | 4 | 4:1 | one-shot |
| attack_primary | 8 | 1:1 (4×2 grid) | one-shot |

## Common gotchas

- The chroma helper takes `--out`, not `--output`. Easy to miss.
- Pass `--chroma-key none` to the normalizer when the chroma helper has
  already produced clean alpha. The normalizer's spill cleanup will
  damage hair and outlines otherwise.
- Do not request a 6-frame strip from Nano Banana 2 — it rejects the
  aspect ratio. Use a 4×2 grid + `grid-to-strip.mjs`.
- Weapons belong only in `attack_primary`. Don't carry weapons through
  `idle` or `walk_side`. Bows occluded by legs and floating-stick
  repaint hacks are a documented dead end.
- A clean contact sheet does not prove a clean loop. Always inspect the
  GIF, and review on at least dark / light / sky / green / magenta /
  checker backgrounds before promoting.

## Where to read next

- `docs/pipeline.md` — eleven-step workflow, with exact commands.
- `docs/failure-modes.md` — the long list of things that broke and what
  rule each produced. Most of the prompt and script choices in this
  repo come from this page.
- `docs/manifest.md` — manifest schema reference.
- `prompts/` — one prompt template per animation, parameterized by
  archetype.
- `scripts/` — every script the pipeline uses. Each is runnable
  standalone with `--help`.

## License

MIT. See `LICENSE`.
