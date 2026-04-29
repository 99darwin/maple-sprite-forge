#!/usr/bin/env node
/**
 * Remove generated per-frame backplates by flood-filling similar colors from
 * each slot edge.
 *
 * Useful when the model ignores a chroma-only prompt and draws gray panels
 * behind the character. Run on the raw strip before the chroma key step.
 */

import sharp from "sharp";
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";

function parseArgs(argv) {
  const args = {
    input: null,
    out: null,
    frames: 8,
    threshold: 54,
    minAlpha: 0,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--") continue;
    if (arg === "--input") args.input = argv[++i];
    else if (arg === "--out") args.out = argv[++i];
    else if (arg === "--frames") args.frames = Number(argv[++i]);
    else if (arg === "--threshold") args.threshold = Number(argv[++i]);
    else if (arg === "--help" || arg === "-h") {
      console.log(
        "Usage: node scripts/flood-clear.mjs --input raw.png --out alpha-strip.png --frames 8 --threshold 54",
      );
      process.exit(0);
    }
  }
  if (!args.input || !args.out) throw new Error("--input and --out are required");
  return args;
}

function offset(x, y, width) {
  return (y * width + x) * 4;
}

function distanceSq(data, pixelOffset, seed) {
  const dr = data[pixelOffset] - seed.r;
  const dg = data[pixelOffset + 1] - seed.g;
  const db = data[pixelOffset + 2] - seed.b;
  return dr * dr + dg * dg + db * db;
}

function floodSlot(data, width, height, left, top, slotW, slotH, threshold) {
  const visited = new Uint8Array(slotW * slotH);
  const thresholdSq = threshold * threshold;
  const queue = [];
  let cleared = 0;

  function localIndex(x, y) {
    return y * slotW + x;
  }

  function enqueue(seedX, seedY) {
    const start = localIndex(seedX, seedY);
    if (visited[start]) return;
    const globalOffset = offset(left + seedX, top + seedY, width);
    const seed = {
      r: data[globalOffset],
      g: data[globalOffset + 1],
      b: data[globalOffset + 2],
    };
    visited[start] = 1;
    queue.length = 0;
    queue.push({ x: seedX, y: seedY });

    for (let cursor = 0; cursor < queue.length; cursor++) {
      const { x, y } = queue[cursor];
      const p = offset(left + x, top + y, width);
      data[p + 3] = 0;
      cleared++;

      const neighbors = [
        x > 0 ? [x - 1, y] : null,
        x < slotW - 1 ? [x + 1, y] : null,
        y > 0 ? [x, y - 1] : null,
        y < slotH - 1 ? [x, y + 1] : null,
      ];

      for (const neighbor of neighbors) {
        if (!neighbor) continue;
        const [nx, ny] = neighbor;
        const n = localIndex(nx, ny);
        if (visited[n]) continue;
        const nOffset = offset(left + nx, top + ny, width);
        if (data[nOffset + 3] === 0) {
          visited[n] = 1;
          continue;
        }
        if (distanceSq(data, nOffset, seed) > thresholdSq) continue;
        visited[n] = 1;
        queue.push({ x: nx, y: ny });
      }
    }
  }

  for (let x = 0; x < slotW; x++) {
    enqueue(x, 0);
    enqueue(x, slotH - 1);
  }
  for (let y = 0; y < slotH; y++) {
    enqueue(0, y);
    enqueue(slotW - 1, y);
  }

  return cleared;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const input = resolve(args.input);
  const out = resolve(args.out);
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const slotW = Math.floor(info.width / args.frames);
  let cleared = 0;

  for (let frame = 0; frame < args.frames; frame++) {
    const left = frame * slotW;
    const width = frame === args.frames - 1 ? info.width - left : slotW;
    cleared += floodSlot(data, info.width, info.height, left, 0, width, info.height, args.threshold);
  }

  await mkdir(dirname(out), { recursive: true });
  await sharp(data, {
    raw: {
      width: info.width,
      height: info.height,
      channels: 4,
    },
  })
    .png()
    .toFile(out);
  console.log(`wrote ${out}`);
  console.log(`cleared=${cleared}`);
}

main().catch((error) => {
  console.error("fatal:", error.message);
  process.exit(1);
});
