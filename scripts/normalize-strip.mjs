#!/usr/bin/env node
/**
 * Normalize a raw horizontal animation strip into fixed-size game frames.
 *
 * - Slices equal-width slots left-to-right.
 * - Removes tiny detached opaque components (model specks / chroma leftovers).
 * - Applies one shared scale across all frames.
 * - Places each frame on a transparent 256x256 canvas with bottom-center anchor.
 *
 * Pass --chroma-key none when the chroma cleanup step (remove_chroma_key.py)
 * has already produced a clean alpha matte. Passing a real key here when one
 * isn't present can damage hair and outlines.
 */

import sharp from "sharp";
import { mkdir } from "node:fs/promises";
import { basename, join, resolve } from "node:path";

const DEFAULT_FRAME_SIZE = 256;
const DEFAULT_ANCHOR_X = 128;
const DEFAULT_ANCHOR_Y = 240;
const DEFAULT_MAX_WIDTH = 220;
const DEFAULT_MAX_HEIGHT = 210;
const ALPHA_THRESHOLD = 10;
const MIN_COMPONENT_AREA = 100;
const DEFAULT_CHROMA_KEY = "#ff00ff";
const DEFAULT_CHROMA_THRESHOLD = 28;
const DEFAULT_CHROMA_SPILL_THRESHOLD = 72;

function parseArgs(argv) {
  const args = {
    input: null,
    outDir: null,
    animation: null,
    frames: null,
    frameSize: DEFAULT_FRAME_SIZE,
    anchorX: DEFAULT_ANCHOR_X,
    anchorY: DEFAULT_ANCHOR_Y,
    maxWidth: DEFAULT_MAX_WIDTH,
    maxHeight: DEFAULT_MAX_HEIGHT,
    chromaKey: DEFAULT_CHROMA_KEY,
    chromaThreshold: DEFAULT_CHROMA_THRESHOLD,
    chromaSpillThreshold: DEFAULT_CHROMA_SPILL_THRESHOLD,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--") continue;
    else if (a === "--input") args.input = argv[++i];
    else if (a === "--out-dir") args.outDir = argv[++i];
    else if (a === "--animation") args.animation = argv[++i];
    else if (a === "--frames") args.frames = Number(argv[++i]);
    else if (a === "--frame-size") args.frameSize = Number(argv[++i]);
    else if (a === "--anchor-x") args.anchorX = Number(argv[++i]);
    else if (a === "--anchor-y") args.anchorY = Number(argv[++i]);
    else if (a === "--max-width") args.maxWidth = Number(argv[++i]);
    else if (a === "--max-height") args.maxHeight = Number(argv[++i]);
    else if (a === "--chroma-key") args.chromaKey = argv[++i];
    else if (a === "--chroma-threshold") args.chromaThreshold = Number(argv[++i]);
    else if (a === "--chroma-spill-threshold") args.chromaSpillThreshold = Number(argv[++i]);
    else if (a === "--help" || a === "-h") {
      console.log(
        "Usage: node scripts/normalize-strip.mjs --input strip-alpha.png --out-dir <dir> --animation idle --frames 4 [--chroma-key none]",
      );
      process.exit(0);
    }
  }
  if (!args.input || !args.outDir || !args.animation || !args.frames) {
    throw new Error("--input, --out-dir, --animation, and --frames are required");
  }
  return args;
}

function index(x, y, width) {
  return y * width + x;
}

function parseHexColor(value) {
  if (value === "none") return null;
  const match = /^#?([0-9a-f]{6})$/i.exec(value);
  if (!match) throw new Error(`Invalid --chroma-key value: ${value}`);
  const hex = match[1];
  return {
    r: Number.parseInt(hex.slice(0, 2), 16),
    g: Number.parseInt(hex.slice(2, 4), 16),
    b: Number.parseInt(hex.slice(4, 6), 16),
  };
}

function chromaKeyRgba(data, width, height, key, threshold) {
  if (!key) return 0;
  let keyed = 0;
  for (let p = 0; p < width * height; p++) {
    const offset = p * 4;
    const dr = data[offset] - key.r;
    const dg = data[offset + 1] - key.g;
    const db = data[offset + 2] - key.b;
    const distance = Math.sqrt(dr * dr + dg * dg + db * db);
    if (distance <= threshold) {
      data[offset + 3] = 0;
      keyed++;
    }
  }
  return keyed;
}

function chromaSpillKeyRgba(data, width, height, threshold) {
  if (threshold <= 0) return 0;
  let keyed = 0;
  for (let p = 0; p < width * height; p++) {
    const offset = p * 4;
    if (data[offset + 3] <= ALPHA_THRESHOLD) continue;
    const r = data[offset];
    const g = data[offset + 1];
    const b = data[offset + 2];
    const magentaBiased =
      g <= threshold &&
      r + b >= 90 &&
      Math.abs(r - b) <= 70 &&
      Math.max(r, b) >= g + 25;
    if (magentaBiased) {
      data[offset + 3] = 0;
      keyed++;
    }
  }
  return keyed;
}

function componentCleanRgba(data, width, height) {
  const visited = new Uint8Array(width * height);
  const keep = new Uint8Array(width * height);
  const queue = [];
  const components = [];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const start = index(x, y, width);
      if (visited[start] || data[start * 4 + 3] <= ALPHA_THRESHOLD) continue;
      visited[start] = 1;
      queue.length = 0;
      queue.push(start);
      const pixels = [];
      let minX = x;
      let maxX = x;
      let minY = y;
      let maxY = y;

      for (let cursor = 0; cursor < queue.length; cursor++) {
        const p = queue[cursor];
        pixels.push(p);
        const px = p % width;
        const py = Math.floor(p / width);
        minX = Math.min(minX, px);
        maxX = Math.max(maxX, px);
        minY = Math.min(minY, py);
        maxY = Math.max(maxY, py);

        const neighbors = [
          px > 0 ? p - 1 : -1,
          px < width - 1 ? p + 1 : -1,
          py > 0 ? p - width : -1,
          py < height - 1 ? p + width : -1,
        ];
        for (const n of neighbors) {
          if (n < 0 || visited[n] || data[n * 4 + 3] <= ALPHA_THRESHOLD) continue;
          visited[n] = 1;
          queue.push(n);
        }
      }

      components.push({ pixels, minX, maxX, minY, maxY, area: pixels.length });
    }
  }

  components.sort((a, b) => b.area - a.area);
  for (const component of components) {
    if (component.area < MIN_COMPONENT_AREA) continue;
    for (const p of component.pixels) keep[p] = 1;
  }

  let minX = width;
  let maxX = -1;
  let minY = height;
  let maxY = -1;
  for (let p = 0; p < keep.length; p++) {
    if (!keep[p]) {
      data[p * 4 + 3] = 0;
      continue;
    }
    const x = p % width;
    const y = Math.floor(p / width);
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }

  return maxX >= minX
    ? { minX, minY, width: maxX - minX + 1, height: maxY - minY + 1 }
    : null;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const input = resolve(args.input);
  const outDir = resolve(args.outDir);
  await mkdir(outDir, { recursive: true });

  const metadata = await sharp(input).metadata();
  if (!metadata.width || !metadata.height) {
    throw new Error(`Cannot read image size for ${input}`);
  }
  const slotWidth = Math.floor(metadata.width / args.frames);
  const slots = [];
  const chromaKey = parseHexColor(args.chromaKey);
  let chromaKeyedPixels = 0;
  let chromaSpillKeyedPixels = 0;

  for (let n = 0; n < args.frames; n++) {
    const left = n * slotWidth;
    const width = n === args.frames - 1 ? metadata.width - left : slotWidth;
    const { data, info } = await sharp(input)
      .extract({ left, top: 0, width, height: metadata.height })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    chromaKeyedPixels += chromaKeyRgba(
      data,
      info.width,
      info.height,
      chromaKey,
      args.chromaThreshold,
    );
    if (chromaKey) {
      chromaSpillKeyedPixels += chromaSpillKeyRgba(
        data,
        info.width,
        info.height,
        args.chromaSpillThreshold,
      );
    }
    const bbox = componentCleanRgba(data, info.width, info.height);
    if (!bbox) throw new Error(`No foreground found in frame ${n + 1}`);
    slots.push({ data, info, bbox });
  }

  const maxSourceWidth = Math.max(...slots.map((slot) => slot.bbox.width));
  const maxSourceHeight = Math.max(...slots.map((slot) => slot.bbox.height));
  const scale = Math.min(
    args.maxWidth / maxSourceWidth,
    args.maxHeight / maxSourceHeight,
    1,
  );

  const outputs = [];
  for (let n = 0; n < slots.length; n++) {
    const slot = slots[n];
    const source = sharp(slot.data, {
      raw: {
        width: slot.info.width,
        height: slot.info.height,
        channels: 4,
      },
    }).extract({
      left: slot.bbox.minX,
      top: slot.bbox.minY,
      width: slot.bbox.width,
      height: slot.bbox.height,
    });
    const resizedWidth = Math.max(1, Math.round(slot.bbox.width * scale));
    const resizedHeight = Math.max(1, Math.round(slot.bbox.height * scale));
    const png = await source
      .resize(resizedWidth, resizedHeight, { kernel: "nearest" })
      .png()
      .toBuffer();
    const left = Math.round(args.anchorX - resizedWidth / 2);
    const top = Math.round(args.anchorY - resizedHeight);
    const outPath = join(
      outDir,
      `${args.animation}_${String(n + 1).padStart(2, "0")}.png`,
    );
    await sharp({
      create: {
        width: args.frameSize,
        height: args.frameSize,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .composite([{ input: png, left, top }])
      .png()
      .toFile(outPath);
    outputs.push(outPath);
  }

  const reportPath = join(outDir, "normalize-report.json");
  await import("node:fs/promises").then(({ writeFile }) =>
    writeFile(
      reportPath,
      `${JSON.stringify(
        {
          input: basename(input),
          outputDirectory: outDir,
          frames: args.frames,
          frameSize: args.frameSize,
          anchor: { x: args.anchorX, y: args.anchorY },
          chromaKey: chromaKey
            ? {
                color: args.chromaKey,
                threshold: args.chromaThreshold,
                keyedPixels: chromaKeyedPixels,
                spillThreshold: args.chromaSpillThreshold,
                spillKeyedPixels: chromaSpillKeyedPixels,
              }
            : null,
          sourceSlotSize: { width: slotWidth, height: metadata.height },
          sourceMax: { width: maxSourceWidth, height: maxSourceHeight },
          scale,
          outputs: outputs.map((path) => basename(path)),
        },
        null,
        2,
      )}\n`,
    ),
  );
  console.log(`wrote ${outputs.length} frames to ${outDir}`);
  console.log(`report: ${reportPath}`);
}

main().catch((error) => {
  console.error("fatal:", error);
  process.exit(1);
});
