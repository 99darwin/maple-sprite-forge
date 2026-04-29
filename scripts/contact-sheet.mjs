#!/usr/bin/env node
/**
 * Render a contact sheet from one or more normalized frame directories.
 *
 * One row per --row argument. Useful for visually comparing the same
 * animation across archetypes side by side.
 */

import sharp from "sharp";
import { mkdir } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";

function parseArgs(argv) {
  const args = {
    out: null,
    rows: [],
    scale: 2,
    gap: 16,
    background: "#1a1a1a",
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--") continue;
    else if (a === "--out") args.out = argv[++i];
    else if (a === "--row") args.rows.push(argv[++i]);
    else if (a === "--scale") args.scale = Number(argv[++i]);
    else if (a === "--gap") args.gap = Number(argv[++i]);
    else if (a === "--background") args.background = argv[++i];
    else if (a === "--help" || a === "-h") {
      console.log(
        "Usage: node scripts/contact-sheet.mjs --out preview.png --row seed/archetypes/mage/idle --row seed/archetypes/ranger/idle",
      );
      process.exit(0);
    }
  }
  if (!args.out || args.rows.length === 0) {
    throw new Error("--out and at least one --row are required");
  }
  return args;
}

async function listFrames(rowDir) {
  const animation = basename(rowDir);
  const files = [];
  for (let n = 1; n <= 32; n++) {
    const file = resolve(rowDir, `${animation}_${String(n).padStart(2, "0")}.png`);
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
  const rows = [];
  for (const row of args.rows) {
    const dir = resolve(row);
    const frames = await listFrames(dir);
    if (frames.length === 0) throw new Error(`No normalized frames found in ${dir}`);
    rows.push({ dir, frames });
  }

  const frameMeta = await sharp(rows[0].frames[0]).metadata();
  const frameW = frameMeta.width ?? 256;
  const frameH = frameMeta.height ?? 256;
  const maxColumns = Math.max(...rows.map((row) => row.frames.length));
  const cellW = frameW * args.scale;
  const cellH = frameH * args.scale;
  const width = args.gap + maxColumns * (cellW + args.gap);
  const height = args.gap + rows.length * (cellH + args.gap);
  const composites = [];

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex];
    for (let col = 0; col < row.frames.length; col++) {
      const input = await sharp(row.frames[col])
        .resize(cellW, cellH, { kernel: "nearest" })
        .png()
        .toBuffer();
      composites.push({
        input,
        left: args.gap + col * (cellW + args.gap),
        top: args.gap + rowIndex * (cellH + args.gap),
      });
    }
  }

  const out = resolve(args.out);
  await mkdir(dirname(out), { recursive: true });
  await sharp({
    create: {
      width,
      height,
      channels: 4,
      background: args.background,
    },
  })
    .composite(composites)
    .png()
    .toFile(out);
  console.log(`wrote ${out}`);
}

main().catch((error) => {
  console.error("fatal:", error);
  process.exit(1);
});
