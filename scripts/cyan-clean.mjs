#!/usr/bin/env node
/**
 * Remove cyan-key anti-alias pixels left around normalized sprite frames.
 *
 * Edge-only: it preserves cyan color used inside the character (costume
 * accents) and only clears bright cyan-biased pixels touching alpha. Use
 * after the normalizer if Pixel Engine's cyan matte left visible halos.
 */

import sharp from "sharp";
import { mkdir, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";

const ALPHA_THRESHOLD = 10;

function parseArgs(argv) {
  const args = {
    inDir: null,
    outDir: null,
    animation: "walk_side",
    frames: 8,
    passes: 2,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--") continue;
    if (arg === "--in-dir") args.inDir = argv[++i];
    else if (arg === "--out-dir") args.outDir = argv[++i];
    else if (arg === "--animation") args.animation = argv[++i];
    else if (arg === "--frames") args.frames = Number(argv[++i]);
    else if (arg === "--passes") args.passes = Number(argv[++i]);
    else if (arg === "--help" || arg === "-h") {
      console.log(
        "Usage: node scripts/cyan-clean.mjs --in-dir <frames> --out-dir <frames> [--animation walk_side] [--frames 8]",
      );
      process.exit(0);
    }
  }
  if (!args.inDir || !args.outDir) throw new Error("--in-dir and --out-dir are required");
  return args;
}

function framePath(dir, animation, frame) {
  return resolve(dir, `${animation}_${String(frame).padStart(2, "0")}.png`);
}

function isBrightCyanSpill(r, g, b) {
  return (
    r <= 90 &&
    g >= 85 &&
    b >= 85 &&
    g - r >= 45 &&
    b - r >= 45 &&
    Math.abs(g - b) <= 45
  );
}

function touchesTransparent(data, width, height, x, y) {
  const neighbors = [
    [x - 1, y],
    [x + 1, y],
    [x, y - 1],
    [x, y + 1],
    [x - 1, y - 1],
    [x + 1, y - 1],
    [x - 1, y + 1],
    [x + 1, y + 1],
  ];
  return neighbors.some(([nx, ny]) => {
    if (nx < 0 || ny < 0 || nx >= width || ny >= height) return true;
    return data[(ny * width + nx) * 4 + 3] <= ALPHA_THRESHOLD;
  });
}

function cleanFrame(data, width, height, passes) {
  let cleared = 0;
  for (let pass = 0; pass < passes; pass++) {
    const clear = [];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const offset = (y * width + x) * 4;
        if (data[offset + 3] <= ALPHA_THRESHOLD) continue;
        if (
          isBrightCyanSpill(data[offset], data[offset + 1], data[offset + 2]) &&
          touchesTransparent(data, width, height, x, y)
        ) {
          clear.push(offset);
        }
      }
    }
    if (clear.length === 0) break;
    for (const offset of clear) {
      data[offset + 3] = 0;
      cleared++;
    }
  }
  return cleared;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const inDir = resolve(args.inDir);
  const outDir = resolve(args.outDir);
  await mkdir(outDir, { recursive: true });
  const report = [];

  for (let frame = 1; frame <= args.frames; frame++) {
    const input = framePath(inDir, args.animation, frame);
    const output = framePath(outDir, args.animation, frame);
    const { data, info } = await sharp(input)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const cleared = cleanFrame(data, info.width, info.height, args.passes);
    await sharp(data, {
      raw: { width: info.width, height: info.height, channels: 4 },
    })
      .png()
      .toFile(output);
    report.push({ frame, input: basename(input), output: basename(output), cleared });
  }

  await writeFile(
    resolve(outDir, "cyan-edge-clean-report.json"),
    `${JSON.stringify({ animation: args.animation, frames: args.frames, passes: args.passes, report }, null, 2)}\n`,
  );
  const total = report.reduce((sum, item) => sum + item.cleared, 0);
  console.log(`cleaned ${total} cyan edge pixels across ${args.frames} frames`);
}

main().catch((error) => {
  console.error("fatal:", error);
  process.exit(1);
});
