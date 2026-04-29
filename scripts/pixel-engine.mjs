#!/usr/bin/env node
/**
 * Pixel Engine helper.
 *
 * Checks balance, submits keyframe/pixelate/animate jobs, polls for status,
 * downloads output, and writes compact metadata beside downloaded assets.
 * Avoids logging API keys or image payloads.
 *
 * Pixel Engine is a polish step. It smooths good source art into clean loops.
 * It will not rescue bad source. If your input has duplicated weapons,
 * occluded limbs, or wrong perspective, regenerate before spending credits.
 */

import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const API_BASE = "https://api.pixelengine.ai/functions/v1";
const TERMINAL_STATUSES = new Set(["success", "failure", "cancelled"]);
const MAX_DOWNLOAD_BYTES = 50 * 1024 * 1024;

function assertSafeDownloadUrl(rawUrl) {
  const url = new URL(rawUrl);
  if (url.protocol !== "https:") {
    throw new Error(`refusing non-https download URL: ${url.protocol}`);
  }
  return url;
}

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  const text = readFileSync(path, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(trimmed);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key]) continue;
    process.env[key] = rawValue.replace(/^["']|["']$/g, "");
  }
}

function loadEnv() {
  loadEnvFile(".env");
  loadEnvFile(".env.local");
}

function parseArgs(argv) {
  const args = {
    mode: "balance",
    out: null,
    prompt: "",
    promptFile: null,
    negativePrompt: "",
    image: null,
    model: "pixel-engine-v1.1",
    renderMode: "pixel",
    outputFrames: 8,
    totalFrames: 8,
    outputFormat: "spritesheet",
    matteColor: "#ff00ff",
    colors: 24,
    seed: null,
    keyframes: [],
    retakeImage: null,
    retakeStart: null,
    retakeEnd: null,
    jobId: null,
    poll: false,
    pollIntervalMs: 5000,
    timeoutMs: 180000,
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--") continue;
    else if (a === "balance" || a === "--balance") args.mode = "balance";
    else if (a === "pixelate" || a === "--pixelate") args.mode = "pixelate";
    else if (a === "animate" || a === "--animate") args.mode = "animate";
    else if (a === "keyframes" || a === "--keyframes") args.mode = "keyframes";
    else if (a === "retake" || a === "--retake") args.mode = "retake";
    else if (a === "poll" || a === "--poll-job") args.mode = "poll";
    else if (a === "--job-id") args.jobId = argv[++i];
    else if (a === "--image") args.image = argv[++i];
    else if (a === "--retake-image") args.retakeImage = argv[++i];
    else if (a === "--retake-start") args.retakeStart = Number(argv[++i]);
    else if (a === "--retake-end") args.retakeEnd = Number(argv[++i]);
    else if (a === "--out") args.out = argv[++i];
    else if (a === "--prompt") args.prompt = argv[++i];
    else if (a === "--prompt-file") args.promptFile = argv[++i];
    else if (a === "--negative-prompt") args.negativePrompt = argv[++i];
    else if (a === "--model") args.model = argv[++i];
    else if (a === "--render-mode") args.renderMode = argv[++i];
    else if (a === "--output-frames") args.outputFrames = Number(argv[++i]);
    else if (a === "--total-frames") args.totalFrames = Number(argv[++i]);
    else if (a === "--output-format") args.outputFormat = argv[++i];
    else if (a === "--matte-color") args.matteColor = argv[++i];
    else if (a === "--colors") args.colors = Number(argv[++i]);
    else if (a === "--seed") args.seed = Number(argv[++i]);
    else if (a === "--keyframe") args.keyframes.push(parseKeyframe(argv[++i]));
    else if (a === "--wait") args.poll = true;
    else if (a === "--poll-interval-ms") args.pollIntervalMs = Number(argv[++i]);
    else if (a === "--timeout-ms") args.timeoutMs = Number(argv[++i]);
    else if (a === "--help" || a === "-h") {
      console.log(
        [
          "Usage:",
          "  node scripts/pixel-engine.mjs balance",
          "  node scripts/pixel-engine.mjs pixelate --image frame.png --out pixelated.png --colors 24 --wait",
          "  node scripts/pixel-engine.mjs keyframes --keyframe 0:frame1.png:1 --prompt-file prompt.txt --out strip.png --wait",
          "  node scripts/pixel-engine.mjs keyframes --keyframe 0:frame1.png:1 --keyframe 4:frame5.png:.9 --keyframe 7:frame8.png:1 --prompt 'walk cycle' --out strip.png --wait",
          "  node scripts/pixel-engine.mjs animate --image frame.png --prompt 'walking right' --out strip.png --wait",
          "  node scripts/pixel-engine.mjs poll --job-id <id> --out strip.png",
        ].join("\n"),
      );
      process.exit(0);
    }
  }
  return args;
}

function parseKeyframe(value) {
  const [indexText, path, strengthText] = value.split(":");
  const index = Number(indexText);
  if (!Number.isInteger(index) || !path) {
    throw new Error(`Invalid --keyframe value: ${value}`);
  }
  return {
    index,
    path,
    strength: strengthText === undefined ? undefined : Number(strengthText),
  };
}

async function fileToBase64(path) {
  return (await readFile(resolve(path))).toString("base64");
}

async function resolvePrompt(args) {
  if (!args.promptFile) return args.prompt;
  return readFile(resolve(args.promptFile), "utf8");
}

async function request(path, apiKey, body = null) {
  const response = await fetch(`${API_BASE}${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Pixel Engine returned non-JSON ${response.status}: ${text.slice(0, 300)}`);
  }
  if (!response.ok) {
    throw new Error(`Pixel Engine ${response.status}: ${JSON.stringify(json)}`);
  }
  return json;
}

function summarizeJob(job) {
  return {
    api_job_id: job.api_job_id,
    status: job.status,
    progress: job.progress,
    billing: job.billing,
    output: job.output
      ? {
          content_type: job.output.content_type,
          metadata: job.output.metadata,
          expires_at: job.output.expires_at,
        }
      : null,
    error: job.error,
  };
}

async function submit(args, apiKey) {
  const prompt = await resolvePrompt(args);

  if (args.mode === "pixelate") {
    if (!args.image) throw new Error("--image is required for pixelate");
    return request("/pixelate", apiKey, {
      image: await fileToBase64(args.image),
      colors: args.colors,
    });
  }

  if (args.mode === "animate") {
    if (!args.image) throw new Error("--image is required for animate");
    const body = {
      image: await fileToBase64(args.image),
      prompt,
      model: args.model,
      negative_prompt: args.negativePrompt,
      pixel_config: { colors: args.colors },
      output_frames: args.outputFrames,
      output_format: args.outputFormat,
      matte_color: args.matteColor,
    };
    if (args.seed !== null) body.seed = args.seed;
    return request("/animate", apiKey, body);
  }

  if (args.mode === "keyframes") {
    if (args.keyframes.length === 0) throw new Error("--keyframe is required for keyframes");
    const frames = [];
    for (const frame of args.keyframes) {
      const entry = {
        index: frame.index,
        image: await fileToBase64(frame.path),
      };
      if (frame.strength !== undefined) entry.strength = frame.strength;
      frames.push(entry);
    }
    const body = {
      prompt,
      render_mode: args.renderMode,
      total_frames: args.totalFrames,
      frames,
      negative_prompt: args.negativePrompt,
      pixel_config: { colors: args.colors },
      output_format: args.outputFormat,
      matte_color: args.matteColor,
    };
    if (args.seed !== null) body.seed = args.seed;
    return request("/keyframes", apiKey, body);
  }

  if (args.mode === "retake") {
    if (!args.retakeImage) throw new Error("--retake-image is required for retake");
    if (args.retakeStart === null || args.retakeEnd === null) {
      throw new Error("--retake-start and --retake-end are required for retake");
    }
    const body = {
      prompt,
      render_mode: args.renderMode,
      image: await fileToBase64(args.retakeImage),
      retake_region: {
        start_frame: args.retakeStart,
        end_frame: args.retakeEnd,
      },
      negative_prompt: args.negativePrompt,
      pixel_config: { colors: args.colors },
      output_format: args.outputFormat,
      matte_color: args.matteColor,
    };
    if (args.seed !== null) body.seed = args.seed;
    return request("/retake", apiKey, body);
  }

  throw new Error(`Unsupported submit mode: ${args.mode}`);
}

async function pollJob(apiKey, jobId, intervalMs, timeoutMs) {
  const started = Date.now();
  while (true) {
    const job = await request(`/jobs?id=${encodeURIComponent(jobId)}`, apiKey);
    console.log(JSON.stringify(summarizeJob(job), null, 2));
    if (TERMINAL_STATUSES.has(job.status)) return job;
    if (Date.now() - started > timeoutMs) {
      throw new Error(`Timed out waiting for job ${jobId}`);
    }
    await new Promise((resolveTimer) => setTimeout(resolveTimer, intervalMs));
  }
}

async function downloadOutput(job, out) {
  if (job.status !== "success" || !job.output?.url) {
    throw new Error(`Job ${job.api_job_id} did not succeed`);
  }
  if (!out) throw new Error("--out is required to download successful output");
  assertSafeDownloadUrl(job.output.url);
  const response = await fetch(job.output.url);
  if (!response.ok) {
    throw new Error(`Download failed ${response.status}: ${await response.text()}`);
  }
  const contentLength = Number(response.headers.get("content-length") ?? "0");
  if (contentLength > MAX_DOWNLOAD_BYTES) {
    throw new Error(`Download too large: ${contentLength} bytes (limit ${MAX_DOWNLOAD_BYTES})`);
  }
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.startsWith("image/") && contentType !== "application/octet-stream") {
    throw new Error(`unexpected content-type for image download: ${contentType}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > MAX_DOWNLOAD_BYTES) {
    throw new Error(`Download too large after buffering: ${buffer.length} bytes`);
  }
  const resolved = resolve(out);
  await mkdir(dirname(resolved), { recursive: true });
  await writeFile(resolved, buffer);
  await writeFile(
    `${resolved}.json`,
    `${JSON.stringify(
      {
        source: "pixel-engine",
        job: summarizeJob(job),
      },
      null,
      2,
    )}\n`,
  );
  console.log(`wrote ${resolved}`);
  console.log(`wrote ${resolved}.json`);
}

async function main() {
  loadEnv();
  const args = parseArgs(process.argv.slice(2));
  const apiKey = process.env.PIXEL_ENGINE_API_KEY;
  if (!apiKey) throw new Error("PIXEL_ENGINE_API_KEY is not set");

  if (args.mode === "balance") {
    console.log(JSON.stringify(await request("/balance", apiKey), null, 2));
    return;
  }

  if (args.mode === "poll") {
    if (!args.jobId) throw new Error("--job-id is required for poll");
    const job = await pollJob(apiKey, args.jobId, args.pollIntervalMs, args.timeoutMs);
    if (job.status === "success" && args.out) await downloadOutput(job, args.out);
    return;
  }

  const submitResult = await submit(args, apiKey);
  console.log(JSON.stringify(submitResult, null, 2));

  if (args.poll) {
    const job = await pollJob(apiKey, submitResult.api_job_id, args.pollIntervalMs, args.timeoutMs);
    if (job.status === "success") await downloadOutput(job, args.out);
  }
}

main().catch((error) => {
  console.error("fatal:", error.message);
  process.exit(1);
});
