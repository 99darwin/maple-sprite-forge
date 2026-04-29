#!/usr/bin/env node
/**
 * Stabilize normalized animation frames whose generated character scale drifts.
 *
 * Post-processes transparent frames by resizing each foreground bbox up to a
 * target height and re-anchoring it bottom-center. Use after the normalizer
 * if a walk cycle has frames where the character visibly grows or shrinks.
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
    targetHeight: null,
    tolerance: 1,
    anchorX: 128,
    anchorY: 240,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--") continue;
    if (arg === "--in-dir") args.inDir = argv[++i];
    else if (arg === "--out-dir") args.outDir = argv[++i];
    else if (arg === "--animation") args.animation = argv[++i];
    else if (arg === "--frames") args.frames = Number(argv[++i]);
    else if (arg === "--target-height") args.targetHeight = Number(argv[++i]);
    else if (arg === "--tolerance") args.tolerance = Number(argv[++i]);
    else if (arg === "--anchor-x") args.anchorX = Number(argv[++i]);
    else if (arg === "--anchor-y") args.anchorY = Number(argv[++i]);
    else if (arg === "--help" || arg === "-h") {
      console.log(
        "Usage: node scripts/stabilize-height.mjs --in-dir <frames> --out-dir <frames> --target-height 210 [--animation walk_side]",
      );
      process.exit(0);
    }
  }
  if (!args.inDir || !args.outDir || !args.targetHeight) {
    throw new Error("--in-dir, --out-dir, and --target-height are required");
  }
  return args;
}

function framePath(dir, animation, frame) {
  return resolve(dir, `${animation}_${String(frame).padStart(2, "0")}.png`);
}

function bboxFor(data, width, height) {
  let minX = width;
  let maxX = -1;
  let minY = height;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] <= ALPHA_THRESHOLD) continue;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  }
  if (maxX < minX) return null;
  return { minX, maxX, minY, maxY, width: maxX - minX + 1, height: maxY - minY + 1 };
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
    const bbox = bboxFor(data, info.width, info.height);
    if (!bbox) throw new Error(`No foreground found in ${input}`);

    const shouldScale = bbox.height < args.targetHeight - args.tolerance;
    const scale = shouldScale ? args.targetHeight / bbox.height : 1;
    const nextWidth = Math.round(bbox.width * scale);
    const nextHeight = Math.round(bbox.height * scale);
    const crop = await sharp(data, {
      raw: { width: info.width, height: info.height, channels: 4 },
    })
      .extract({ left: bbox.minX, top: bbox.minY, width: bbox.width, height: bbox.height })
      .resize(nextWidth, nextHeight, { kernel: "nearest" })
      .png()
      .toBuffer();

    const left = Math.round(args.anchorX - nextWidth / 2);
    const top = Math.round(args.anchorY - nextHeight);
    await sharp({
      create: {
        width: info.width,
        height: info.height,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .composite([{ input: crop, left, top }])
      .png()
      .toFile(output);
    report.push({
      frame,
      input: basename(input),
      output: basename(output),
      before: { width: bbox.width, height: bbox.height },
      after: { width: nextWidth, height: nextHeight },
      scale,
    });
  }

  await writeFile(
    resolve(outDir, "frame-height-stabilize-report.json"),
    `${JSON.stringify(
      {
        animation: args.animation,
        frames: args.frames,
        targetHeight: args.targetHeight,
        tolerance: args.tolerance,
        report,
      },
      null,
      2,
    )}\n`,
  );
  console.log(`stabilized ${args.frames} frames to target height ${args.targetHeight}`);
}

main().catch((error) => {
  console.error("fatal:", error);
  process.exit(1);
});
