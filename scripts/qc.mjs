#!/usr/bin/env node
/**
 * QC sprite assets against the manifest contract.
 *
 * Walks --seed-dir for animation folders matching REQUIRED_ANIMATIONS, then
 * checks frame count, dimensions (read from the manifest), alpha-channel
 * presence, and opaque magenta spill. Writes a JSON report to --report-out.
 *
 * This catches mechanical failures only. It does not replace visual review:
 * a clean QC report does not mean the loop is good. Always inspect the GIF.
 */

import sharp from "sharp";
import { access, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";

const REQUIRED_ANIMATIONS = {
  idle: 4,
  walk_side: 8,
  jump: 1,
  attack_primary: 8,
  hit: 4,
};

function parseArgs(argv) {
  const args = {
    seedDir: "seed",
    manifest: "manifest.json",
    reportOut: "qc-report.json",
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--") continue;
    else if (a === "--seed-dir") args.seedDir = argv[++i];
    else if (a === "--manifest") args.manifest = argv[++i];
    else if (a === "--report-out") args.reportOut = argv[++i];
    else if (a === "--help" || a === "-h") {
      console.log(
        [
          "Usage: node scripts/qc.mjs [--seed-dir seed] [--manifest manifest.json] [--report-out qc-report.json]",
          "",
          "Validates each archetype's animation frames against the contract in the manifest.",
        ].join("\n"),
      );
      process.exit(0);
    }
  }
  return args;
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function listDirectories(path) {
  if (!(await exists(path))) return [];
  const entries = await readdir(path, { withFileTypes: true });
  return entries.filter((entry) => entry.isDirectory()).map((entry) => join(path, entry.name));
}

async function collectAnimationDirs(root) {
  const results = [];
  async function walk(path) {
    const dirs = await listDirectories(path);
    for (const dir of dirs) {
      const name = dir.split("/").at(-1);
      if (Object.hasOwn(REQUIRED_ANIMATIONS, name)) {
        results.push(dir);
      } else {
        await walk(dir);
      }
    }
  }
  await walk(root);
  return results;
}

async function alphaStats(path) {
  const image = sharp(path).ensureAlpha();
  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
  let transparent = 0;
  let opaque = 0;
  let magenta = 0;
  for (let i = 0; i < data.length; i += info.channels) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];
    if (a === 0) transparent++;
    if (a === 255) opaque++;
    if (r === 255 && g === 0 && b === 255 && a > 0) magenta++;
  }
  return { transparent, opaque, magenta };
}

async function inspectFrame(path, projectRoot) {
  const metadata = await sharp(path).metadata();
  return {
    path: relative(projectRoot, path),
    width: metadata.width,
    height: metadata.height,
    hasAlpha: Boolean(metadata.hasAlpha),
    ...(await alphaStats(path)),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const projectRoot = process.cwd();
  const seedDir = resolve(args.seedDir);
  const manifestPath = resolve(args.manifest);
  const reportPath = resolve(args.reportOut);

  if (!(await exists(manifestPath))) {
    throw new Error(`Manifest not found: ${manifestPath}`);
  }
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const expectedWidth = manifest.frame?.width;
  const expectedHeight = manifest.frame?.height;
  if (!expectedWidth || !expectedHeight) {
    throw new Error("Manifest is missing frame.width or frame.height");
  }

  const animationDirs = await collectAnimationDirs(seedDir);
  const checks = [];
  const failures = [];

  for (const dir of animationDirs) {
    const animation = dir.split("/").at(-1);
    const expectedFrames = REQUIRED_ANIMATIONS[animation];
    const entries = await readdir(dir, { withFileTypes: true });
    const frameFiles = entries
      .filter(
        (entry) =>
          entry.isFile() &&
          entry.name.endsWith(".png") &&
          entry.name.startsWith(`${animation}_`),
      )
      .map((entry) => join(dir, entry.name))
      .sort();

    const check = {
      animation,
      directory: relative(projectRoot, dir),
      expectedFrames,
      actualFrames: frameFiles.length,
      frames: [],
    };

    if (frameFiles.length !== expectedFrames) {
      failures.push(
        `${check.directory}: expected ${expectedFrames} frames, found ${frameFiles.length}`,
      );
    }

    for (const file of frameFiles) {
      const frame = await inspectFrame(file, projectRoot);
      check.frames.push(frame);
      if (frame.width !== expectedWidth || frame.height !== expectedHeight) {
        failures.push(
          `${frame.path}: expected ${expectedWidth}x${expectedHeight}, found ${frame.width}x${frame.height}`,
        );
      }
      if (!frame.hasAlpha) {
        failures.push(`${frame.path}: missing alpha channel`);
      }
      if (frame.magenta > 0) {
        failures.push(`${frame.path}: contains ${frame.magenta} opaque magenta pixels`);
      }
    }

    checks.push(check);
  }

  await mkdir(dirname(reportPath), { recursive: true });
  const report = {
    version: manifest.version,
    generatedAt: new Date().toISOString(),
    expected: {
      width: expectedWidth,
      height: expectedHeight,
      animations: REQUIRED_ANIMATIONS,
    },
    checkedAnimationDirectories: checks.length,
    checks,
    failures,
  };
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);

  console.log(`checked ${checks.length} animation directories`);
  console.log(`report: ${relative(projectRoot, reportPath)}`);
  if (failures.length > 0) {
    for (const failure of failures) console.error(`failure: ${failure}`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("fatal:", error);
  process.exit(1);
});
