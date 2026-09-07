#!/usr/bin/env node

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = path.resolve(import.meta.dirname, "..");
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "aitag-parser-"));

try {
  execFileSync(
    path.join(root, "node_modules", ".bin", "tsc"),
    [
      "src/lib/png.ts",
      "--outDir", temp,
      "--module", "nodenext",
      "--moduleResolution", "nodenext",
      "--target", "es2022",
      "--skipLibCheck",
    ],
    { cwd: root, stdio: "inherit" },
  );

  const { parseComfyUi } = await import(pathToFileURL(path.join(temp, "png.js")));
  const workflow = {
    nodes: [
      {
        id: 1,
        type: "CheckpointLoaderSimple",
        inputs: [{ name: "ckpt_name", widget: { name: "ckpt_name" } }],
        widgets_values: ["model.safetensors"],
      },
      {
        id: 2,
        type: "CLIPTextEncode",
        inputs: [{ name: "text", widget: { name: "text" } }],
        widgets_values: ["positive prompt"],
      },
      {
        id: 3,
        type: "CLIPTextEncode",
        inputs: [{ name: "text", widget: { name: "text" } }],
        widgets_values: ["bad anatomy"],
      },
      {
        id: 4,
        type: "EmptyLatentImage",
        inputs: [
          { name: "width", widget: { name: "width" } },
          { name: "height", widget: { name: "height" } },
        ],
        widgets_values: [832, 1216],
      },
      {
        id: 5,
        type: "KSampler",
        inputs: [
          { name: "positive", link: 3 },
          { name: "negative", link: 4 },
          { name: "seed", widget: { name: "seed" } },
          { name: "steps", widget: { name: "steps" } },
          { name: "cfg", widget: { name: "cfg" } },
          { name: "sampler_name", widget: { name: "sampler_name" } },
          { name: "scheduler", widget: { name: "scheduler" } },
        ],
        widgets_values: [0, 28, 7, "euler", "normal"],
      },
      {
        id: 6,
        type: "LoraLoader",
        inputs: [{ name: "lora_name", widget: { name: "lora_name" } }],
        widgets_values: ["style.safetensors"],
      },
    ],
    links: [
      [3, 2, 0, 5, 0, "CONDITIONING"],
      [4, 3, 0, 5, 1, "CONDITIONING"],
    ],
  };

  const actual = parseComfyUi(JSON.stringify(workflow));
  assert.ok(actual);
  assert.deepEqual(
    {
      prompt: actual.prompt,
      negativePrompt: actual.negativePrompt,
      model: actual.model,
      loras: actual.loras,
      sampler: actual.sampler,
      scheduler: actual.scheduler,
      steps: actual.steps,
      cfg: actual.cfg,
      seed: actual.seed,
      width: actual.width,
      height: actual.height,
    },
    {
      prompt: "positive prompt",
      negativePrompt: "bad anatomy",
      model: "model.safetensors",
      loras: ["style.safetensors"],
      sampler: "euler",
      scheduler: "normal",
      steps: 28,
      cfg: 7,
      seed: 0,
      width: 832,
      height: 1216,
    },
  );
  assert.equal(parseComfyUi(JSON.stringify({ nodes: [] })), null);
  console.log("parser tests passed");
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
