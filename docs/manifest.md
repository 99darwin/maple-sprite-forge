# Manifest

The manifest is a small JSON index that maps each archetype's animations
to frame directories. `qc.mjs` reads it for the frame contract; runtime
loaders read it to find the actual sprite files.

The schema is intentionally minimal. It is *not* a historical ledger —
no candidate IDs, no upstream request IDs, no source lineage. If you
need provenance, keep that information in the per-candidate
`normalize-report.json` files written by the normalizer and in the
`<output>.json` sidecar files written by `nano-banana-edit.mjs` and
`pixel-engine.mjs`.

## Schema

```json
{
  "version": "1.0.0",
  "frame": {
    "width": 256,
    "height": 256,
    "anchor": { "x": 128, "y": 240 }
  },
  "archetypes": {
    "<name>": {
      "<animation>": "<path-to-frame-directory>",
      ...
    }
  }
}
```

Where:

- `version` — manifest format version. Bump when the contract changes.
- `frame.width` / `frame.height` — every frame PNG must match these.
  `qc.mjs` will fail otherwise.
- `frame.anchor` — bottom-center feet pin. Runtime is responsible for
  drawing each frame so this point lands on the world position.
- `archetypes` — keyed by archetype name. Add as many as you want.
- `archetypes.<name>.<animation>` — relative path (from the manifest
  file) to a directory containing `<animation>_01.png ... _NN.png`.

## Required animations and frame counts

`qc.mjs` enforces:

| Animation | Frames | Runtime |
| --- | --- | --- |
| `idle` | 4 | loop |
| `walk_side` | 8 | loop |
| `cast` | 4 | one-shot |
| `jump` | 1 | held pose |
| `hit` | 4 | one-shot |
| `attack_primary` | 8 | one-shot |

`cast` is currently not enforced by `qc.mjs` (it isn't in
`REQUIRED_ANIMATIONS`); add it there if you want CI to fail on a missing
cast directory.

## Example

See `manifest.example.json` at the repo root.

## Adding archetypes

Add a new top-level key under `archetypes`. The QC and contact-sheet
scripts don't hardcode `mage`/`ranger`/`warrior` — they walk whatever
directories you point them at. The prompt templates are parameterized by
`{archetype}` so they accommodate new ones too; add the costume/palette
guidance to `prompts/still.md` so future stills stay consistent.

## What this manifest deliberately does not record

- candidate IDs or version numbers
- upstream tool / request IDs
- which candidate was preferred or superseded
- promotion timestamps
- runtime-specific metadata (texture atlases, sprite layers, etc.)

If you need any of those, layer them on top of this manifest in your
game's own asset pipeline. This manifest is the boundary between
"frames produced by this repo" and "frames consumed by your runtime."
