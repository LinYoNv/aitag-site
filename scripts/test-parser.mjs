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

  // ── 回归：反向追溯只采活跃子图（从 SaveImage 输出根反推），孤立分支不被污染 ──
  const trace = {
    nodes: [
      { id: 1, type: "CheckpointLoaderSimple", inputs: [{ name: "ckpt_name", widget: { name: "ckpt_name" } }], widgets_values: ["main.safetensors"] },
      { id: 2, type: "CLIPTextEncode", inputs: [{ name: "text", widget: { name: "text" } }], widgets_values: ["活跃画师绘制"] },
      { id: 3, type: "KSampler", inputs: [
        { name: "positive", link: 11 }, { name: "negative", link: 12 },
        { name: "seed", widget: { name: "seed" } }, { name: "steps", widget: { name: "steps" } },
        { name: "cfg", widget: { name: "cfg" } }, { name: "sampler_name", widget: { name: "sampler_name" } },
      ], widgets_values: [0, 30, 6, "euler_ancestral"] },
      { id: 4, type: "SaveImage", inputs: [{ name: "images", link: 13 }] },
      // 孤立的无关采样分支：不连到 SaveImage，不应被采到
      { id: 5, type: "CLIPTextEncode", inputs: [{ name: "text", widget: { name: "text" } }], widgets_values: ["孤立垃圾分支 prompt"] },
      { id: 6, type: "KSampler", inputs: [
        { name: "positive", link: 14 }, { name: "seed", widget: { name: "seed" } },
        { name: "steps", widget: { name: "steps" } }, { name: "sampler_name", widget: { name: "sampler_name" } },
      ], widgets_values: [99, 1, "lcm"] },
    ],
    links: [
      [11, 2, 0, 3, 0, "CONDITIONING"],
      [12, 0, 0, 3, 1, "CONDITIONING"],
      [13, 3, 0, 4, 0, "IMAGE"],
      [14, 5, 0, 6, 0, "CONDITIONING"],
    ],
  };
  const traced = parseComfyUi(JSON.stringify(trace));
  assert.ok(traced);
  assert.equal(traced.prompt, "活跃画师绘制", "应取活跃子图内 CLIPTextEncode 的文本");
  assert.equal(traced.prompt.includes("孤立垃圾"), false, "孤立分支 prompt 不应混入");
  assert.equal(traced.sampler, "euler_ancestral", "应从活跃采样器取值");
  assert.equal(traced.steps, 30, "应从活跃采样器取 steps");
  assert.equal(traced.cfg, 6, "应从活跃采样器取 cfg");
  assert.equal(traced.seed, 0, "应从活跃采样器取 seed");

  // ── 回归：WeiLin 提示词编辑器（正向在 positive 字段，非 text）──
  const weilin = {
    "55": { class_type: "CLIPTextEncode", inputs: { text: "blurry, hands" } },
    "66": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: "ckpt.safetensors" } },
    "73": { class_type: "WeiLinPromptUIWithoutLora", inputs: { positive: "masterpiece, (1girl:1.5), solo", seed: 1, steps: 32 } },
    "76": { class_type: "KSampler", inputs: { positive: ["73", 0], negative: ["55", 0], model: ["66", 0], seed: 1, steps: 32, cfg: 2.4, sampler_name: "dpmpp_2m" } },
    "113": { class_type: "SaveImage", inputs: { images: ["76", 0] } },
  };
  const weilinParsed = parseComfyUi(JSON.stringify(weilin));
  assert.ok(weilinParsed);
  assert.equal(weilinParsed.prompt, "masterpiece, (1girl:1.5), solo", "应从 positive 字段提取正向");
  assert.equal(weilinParsed.negativePrompt, "blurry, hands", "负向仍来自 CLIPTextEncode.text");

  // ── 回归：Text Concatenate 拼接链（text_a/text_b/text_c 引用）──
  const concat = {
    "66": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: "ckpt.safetensors" } },
    "169": { class_type: "TextInput_", inputs: { text: "masterpiece," } },
    "170": { class_type: "TextInput_", inputs: { text: "1girl" } },
    "73": { class_type: "Text Concatenate", inputs: { delimiter: ", ", text_a: ["169", 0], text_b: ["170", 0] } },
    "67": { class_type: "CLIPTextEncode", inputs: { text: ["73", 0], clip: ["66", 1] } },
    "58": { class_type: "CLIPTextEncode", inputs: { text: "bad quality", clip: ["66", 1] } },
    "209": { class_type: "KSampler", inputs: { positive: ["67", 0], negative: ["58", 0], model: ["66", 0], seed: 1, steps: 35, cfg: 6, sampler_name: "euler" } },
    "211": { class_type: "SaveImage", inputs: { images: ["209", 0] } },
  };
  const concatParsed = parseComfyUi(JSON.stringify(concat));
  assert.ok(concatParsed);
  assert.ok(concatParsed.prompt.includes("masterpiece,"), `拼接链应含首段, got: ${concatParsed.prompt}`);
  assert.ok(concatParsed.prompt.includes("1girl"), "拼接链应含中段");

  // ── 回归：NaN 非法令牌容错（ComfyUI 会把 is_changed: NaN 写进 JSON）──
  const nanWorkflow = `{"66":{"class_type":"CheckpointLoaderSimple","inputs":{"ckpt_name":"ckpt.safetensors"}},"2":{"class_type":"CLIPTextEncode","inputs":{"text":"a girl"}},"3":{"class_type":"CLIPTextEncode","inputs":{"text":"bad anatomy"}},"4":{"class_type":"KSampler","inputs":{"positive":["2",0],"negative":["3",0],"model":["66",0],"seed":1,"steps":28,"cfg":7}},"is_changed":NaN}`;
  const nanParsed = parseComfyUi(nanWorkflow);
  assert.ok(nanParsed, "含 NaN 令牌不应崩溃");
  assert.equal(nanParsed.prompt, "a girl");
  console.log("parser tests passed");
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
