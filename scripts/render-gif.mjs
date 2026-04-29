#!/usr/bin/env node
/**
 * Render an animated GIF from one normalized frame directory.
 *
 * A clean contact sheet does not prove a clean loop. Always inspect the GIF
 * before approving an animation candidate.
 *
 * Requires ffmpeg in PATH.
 */

import sharp from "sharp";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

function parseArgs(argv) {
  const args = {
    framesDir: null,
    out: null,
    scale: 2,
    fps: 8,
    background: "#1a1a1a",
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--") continue;
    else if (a === "--frames-dir") args.framesDir = argv[++i];
    else if (a === "--out") args.out = argv[++i];
    else if (a === "--scale") args.scale = Number(argv[++i]);
    else if (a === "--fps") args.fps = Number(argv[++i]);
    else if (a === "--background") args.background = argv[++i];
    else if (a === "--help" || a === "-h") {
      console.log(
        "Usage: node scripts/render-gif.mjs --frames-dir seed/archetypes/mage/walk_side --out preview.gif --fps 8",
      );
      process.exit(0);
    }
  }
  if (!args.framesDir || !args.out) {
    throw new Error("--frames-dir and --out are required");
  }
  return args;
}

async function listFrames(framesDir) {
  const animation = basename(framesDir);
  const files = [];
  for (let n = 1; n <= 32; n++) {
    const file = resolve(framesDir, `${animation}_${String(n).padStart(2, "0")}.png`);
    try {
      await sharp(file).metadata();
      files.push(file);
    } catch {
      break;
    }
  }
  return files;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const framesDir = resolve(args.framesDir);
  const frames = await listFrames(framesDir);
  if (frames.length === 0) throw new Error(`No normalized frames found in ${framesDir}`);

  const meta = await sharp(frames[0]).metadata();
  const width = (meta.width ?? 256) * args.scale;
  const height = (meta.height ?? 256) * args.scale;
  const tempDir = await mkdtemp(join(tmpdir(), "sprite-gif-"));

  for (const [index, frame] of frames.entries()) {
    const sprite = await sharp(frame)
      .resize(width, height, { kernel: "nearest" })
      .png()
      .toBuffer();

    await sharp({
      create: {
        width,
        height,
        channels: 4,
        background: args.background,
      },
    })
      .composite([{ input: sprite, left: 0, top: 0 }])
      .png()
      .toFile(join(tempDir, `frame_${String(index + 1).padStart(3, "0")}.png`));
  }

  const out = resolve(args.out);
  await mkdir(dirname(out), { recursive: true });
  const palette = join(tempDir, "palette.png");
  try {
    await execFileAsync("ffmpeg", [
      "-y",
      "-framerate",
      String(args.fps),
      "-i",
      join(tempDir, "frame_%03d.png"),
      "-vf",
      "palettegen=reserve_transparent=0",
      palette,
    ]);
    await execFileAsync("ffmpeg", [
      "-y",
      "-framerate",
      String(args.fps),
      "-i",
      join(tempDir, "frame_%03d.png"),
      "-i",
      palette,
      "-lavfi",
      "paletteuse=dither=none",
      "-loop",
      "0",
      out,
    ]);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }

  console.log(`wrote ${out}`);
}

main().catch((error) => {
  console.error("fatal:", error);
  process.exit(1);
});
