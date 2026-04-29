#!/usr/bin/env node
/**
 * Convert a generated sprite grid into a horizontal strip for normalize-strip.
 *
 * Nano Banana 2 obeys 4x2 grid prompts more reliably than long horizontal
 * strips, especially for 8-frame attack animations. Generate as a grid, then
 * unfold here.
 */

import sharp from "sharp";
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";

function parseArgs(argv) {
  const args = {
    input: null,
    out: null,
    columns: 4,
    rows: 2,
    inset: 0,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--") continue;
    if (arg === "--input") args.input = argv[++i];
    else if (arg === "--out") args.out = argv[++i];
    else if (arg === "--columns") args.columns = Number(argv[++i]);
    else if (arg === "--rows") args.rows = Number(argv[++i]);
    else if (arg === "--inset") args.inset = Number(argv[++i]);
    else if (arg === "--help" || arg === "-h") {
      console.log(
        "Usage: node scripts/grid-to-strip.mjs --input grid.png --out strip.png --columns 4 --rows 2 --inset 3",
      );
      process.exit(0);
    }
  }
  if (!args.input || !args.out) throw new Error("--input and --out are required");
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const input = resolve(args.input);
  const out = resolve(args.out);
  const meta = await sharp(input).metadata();
  if (!meta.width || !meta.height) throw new Error(`Could not read image size for ${input}`);

  const cellW = Math.floor(meta.width / args.columns);
  const cellH = Math.floor(meta.height / args.rows);
  const frameW = cellW - args.inset * 2;
  const frameH = cellH - args.inset * 2;
  const composites = [];

  for (let row = 0; row < args.rows; row++) {
    for (let column = 0; column < args.columns; column++) {
      const index = row * args.columns + column;
      const frame = await sharp(input)
        .extract({
          left: column * cellW + args.inset,
          top: row * cellH + args.inset,
          width: frameW,
          height: frameH,
        })
        .png()
        .toBuffer();
      composites.push({
        input: frame,
        left: index * frameW,
        top: 0,
      });
    }
  }

  await mkdir(dirname(out), { recursive: true });
  await sharp({
    create: {
      width: frameW * args.columns * args.rows,
      height: frameH,
      channels: 3,
      background: "#00ff00",
    },
  })
    .composite(composites)
    .png()
    .toFile(out);

  console.log(`wrote ${out}`);
  console.log(`frames=${args.columns * args.rows} frame=${frameW}x${frameH}`);
}

main().catch((error) => {
  console.error("fatal:", error.message);
  process.exit(1);
});
