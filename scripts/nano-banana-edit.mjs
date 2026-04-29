#!/usr/bin/env node
/**
 * fal.ai Nano Banana 2 edit helper.
 *
 * Uploads one local reference image, calls fal-ai/nano-banana-2/edit, and
 * downloads the first returned PNG. It intentionally does not normalize
 * output; run the normalizer after reviewing the raw sheet dimensions.
 */

import { fal } from "@fal-ai/client";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

function parseArgs(argv) {
  const args = {
    image: null,
    out: null,
    prompt: "",
    promptFile: null,
    model: "fal-ai/nano-banana-2/edit",
    aspectRatio: "8:1",
    resolution: "1K",
    numImages: 1,
    seed: null,
    safetyTolerance: "4",
    limitGenerations: true,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--") continue;
    if (arg === "--image") args.image = argv[++i];
    else if (arg === "--out") args.out = argv[++i];
    else if (arg === "--prompt") args.prompt = argv[++i];
    else if (arg === "--prompt-file") args.promptFile = argv[++i];
    else if (arg === "--model") args.model = argv[++i];
    else if (arg === "--aspect-ratio") args.aspectRatio = argv[++i];
    else if (arg === "--resolution") args.resolution = argv[++i];
    else if (arg === "--num-images") args.numImages = Number(argv[++i]);
    else if (arg === "--seed") args.seed = Number(argv[++i]);
    else if (arg === "--safety-tolerance") args.safetyTolerance = argv[++i];
    else if (arg === "--limit-generations") args.limitGenerations = argv[++i] !== "false";
    else if (arg === "--help" || arg === "-h") {
      console.log(
        [
          "Usage:",
          "  node scripts/nano-banana-edit.mjs --image ref.png --prompt-file prompt.txt --out raw.png",
          "",
          "Defaults: --model fal-ai/nano-banana-2/edit --aspect-ratio 8:1 --resolution 1K",
        ].join("\n"),
      );
      process.exit(0);
    }
  }

  if (!args.image || !args.out) throw new Error("--image and --out are required");
  if (!args.prompt && !args.promptFile) throw new Error("--prompt or --prompt-file is required");
  return args;
}

async function loadDotEnv() {
  for (const path of [".env", ".env.local"]) {
    try {
      const raw = await readFile(path, "utf8");
      for (const line of raw.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eq = trimmed.indexOf("=");
        if (eq === -1) continue;
        const key = trimmed.slice(0, eq).trim();
        let value = trimmed.slice(eq + 1).trim();
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }
        if (!(key in process.env)) process.env[key] = value;
      }
    } catch {
      // Optional env file.
    }
  }
}

async function fileExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function uploadImage(path) {
  const resolved = resolve(path);
  const buf = await readFile(resolved);
  const blob = new Blob([buf], { type: "image/png" });
  const file = new File([blob], "reference.png", { type: "image/png" });
  return fal.storage.upload(file);
}

async function resolvePrompt(args) {
  if (args.promptFile) return readFile(resolve(args.promptFile), "utf8");
  return args.prompt;
}

const MAX_DOWNLOAD_BYTES = 50 * 1024 * 1024;

function assertSafeDownloadUrl(rawUrl) {
  const url = new URL(rawUrl);
  if (url.protocol !== "https:") {
    throw new Error(`refusing non-https download URL: ${url.protocol}`);
  }
  return url;
}

async function downloadTo(url, out) {
  assertSafeDownloadUrl(url);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`download failed ${response.status}: ${await response.text()}`);
  }
  const contentLength = Number(response.headers.get("content-length") ?? "0");
  if (contentLength > MAX_DOWNLOAD_BYTES) {
    throw new Error(`download too large: ${contentLength} bytes (limit ${MAX_DOWNLOAD_BYTES})`);
  }
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.startsWith("image/") && contentType !== "application/octet-stream") {
    throw new Error(`unexpected content-type for image download: ${contentType}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > MAX_DOWNLOAD_BYTES) {
    throw new Error(`download too large after buffering: ${buffer.length} bytes`);
  }
  const resolved = resolve(out);
  await mkdir(dirname(resolved), { recursive: true });
  await writeFile(resolved, buffer);
  return buffer.length;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  await loadDotEnv();
  const apiKey = process.env.FAL_API_KEY ?? process.env.FAL_KEY;
  if (!apiKey) throw new Error("FAL_API_KEY or FAL_KEY is required");
  fal.config({ credentials: apiKey });

  if ((await fileExists(args.out)) && process.env.FORCE !== "1") {
    throw new Error(`${args.out} already exists. Set FORCE=1 to overwrite.`);
  }

  const prompt = await resolvePrompt(args);
  console.log(`[upload] ${args.image}`);
  const refUrl = await uploadImage(args.image);

  console.log(`[fal] ${args.model} aspect=${args.aspectRatio} resolution=${args.resolution}`);
  const input = {
    prompt,
    image_urls: [refUrl],
    num_images: args.numImages,
    aspect_ratio: args.aspectRatio,
    output_format: "png",
    resolution: args.resolution,
    safety_tolerance: args.safetyTolerance,
    limit_generations: args.limitGenerations,
  };
  if (args.seed !== null) input.seed = args.seed;

  const result = await fal.subscribe(args.model, {
    input,
    logs: true,
    onQueueUpdate: (update) => {
      if (update.status !== "IN_PROGRESS") return;
      for (const log of update.logs ?? []) {
        if (log?.message) console.log(`[fal] ${log.message}`);
      }
    },
  });

  const images = result?.data?.images ?? [];
  const image = images[0];
  if (!image?.url) throw new Error("fal returned no image URL");

  const bytes = await downloadTo(image.url, args.out);
  await writeFile(
    `${resolve(args.out)}.json`,
    `${JSON.stringify(
      {
        source: "fal",
        model: args.model,
        requestId: result.requestId,
        input: {
          aspect_ratio: args.aspectRatio,
          resolution: args.resolution,
          num_images: args.numImages,
          seed: args.seed,
          limit_generations: args.limitGenerations,
        },
        output: {
          bytes,
          image,
          description: result.data?.description ?? "",
        },
      },
      null,
      2,
    )}\n`,
  );
  console.log(`[done] wrote ${args.out} (${Math.round(bytes / 1024)} KB)`);
}

main().catch((error) => {
  console.error("fatal:", error.message);
  process.exit(1);
});
