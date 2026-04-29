#!/usr/bin/env node
/**
 * Copy a normalized animation directory into a new frame order.
 *
 * Keeps generated source art immutable. When a walk cycle has the right
 * poses but the model returned them in the wrong order (a frequent cause of
 * "moonwalking"), reorder here instead of repainting or destructively
 * renaming source frames.
 */

import sharp from "sharp";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";

function parseArgs(argv) {
  const args = {
    inputDir: null,
    outDir: null,
    animation: null,
    order: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--") continue;
    else if (a === "--input-dir") args.inputDir = argv[++i];
    else if (a === "--out-dir") args.outDir = argv[++i];
    else if (a === "--animation") args.animation = argv[++i];
    else if (a === "--order") args.order = argv[++i];
    else if (a === "--help" || a === "-h") {
      console.log(
        "Usage: node scripts/reorder-frames.mjs --input-dir <dir> --out-dir <dir> --animation walk_side --order 1,8,7,6,5,4,3,2",
      );
      process.exit(0);
    }
  }
  if (!args.inputDir || !args.outDir || !args.animation || !args.order) {
    throw new Error("--input-dir, --out-dir, --animation, and --order are required");
  }
  const order = args.order.split(",").map((value) => Number(value.trim()));
  if (order.some((value) => !Number.isInteger(value) || value < 1)) {
    throw new Error(`Invalid --order: ${args.order}`);
  }
  const unique = new Set(order);
  if (unique.size !== order.length) {
    throw new Error(`--order contains duplicates: ${args.order}`);
  }
  return { ...args, order };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const inputDir = resolve(args.inputDir);
  const outDir = resolve(args.outDir);
  await mkdir(outDir, { recursive: true });

  const outputs = [];
  for (let outIndex = 0; outIndex < args.order.length; outIndex++) {
    const sourceIndex = args.order[outIndex];
    const source = join(
      inputDir,
      `${args.animation}_${String(sourceIndex).padStart(2, "0")}.png`,
    );
    const out = join(
      outDir,
      `${args.animation}_${String(outIndex + 1).padStart(2, "0")}.png`,
    );
    await sharp(source).png().toFile(out);
    outputs.push({ output: basename(out), source: basename(source), sourceIndex });
  }

  let inheritedNormalizeReport = null;
  try {
    inheritedNormalizeReport = JSON.parse(
      await readFile(join(inputDir, "normalize-report.json"), "utf8"),
    );
  } catch {
    inheritedNormalizeReport = null;
  }

  await writeFile(
    join(outDir, "order-map.json"),
    `${JSON.stringify(
      {
        inputDirectory: inputDir,
        outputDirectory: outDir,
        animation: args.animation,
        order: args.order,
        outputs,
        inheritedNormalizeReport,
      },
      null,
      2,
    )}\n`,
  );

  console.log(`wrote ${outputs.length} reordered frames to ${outDir}`);
}

main().catch((error) => {
  console.error("fatal:", error);
  process.exit(1);
});
