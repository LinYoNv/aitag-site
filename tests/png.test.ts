import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_TEXT_VALUE_BYTES,
  extractArtistsFromPrompt,
  parseComfyUi,
  parsePngMetadata,
} from "../src/lib/png";

function names(prompt: string): string[] {
  return extractArtistsFromPrompt(prompt).map((artist) => artist.name);
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const chunk = new Uint8Array(12 + data.length);
  new DataView(chunk.buffer).setUint32(0, data.length);
  chunk.set(new TextEncoder().encode(type), 4);
  chunk.set(data, 8);
  return chunk;
}

function pngWithChunks(...chunks: Uint8Array[]): ArrayBuffer {
  const signature = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const size = signature.length + chunks.reduce((total, chunk) => total + chunk.length, 0);
  const bytes = new Uint8Array(size);
  bytes.set(signature);
  let offset = signature.length;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes.buffer;
}

test("extracts NAI v4/v5 weighted artists", () => {
  // 真实 NAI v4/v5：画师区在 \n 之前的段，& 联合画师作为单个名字保留
  assert.deepEqual(
    names("0.9::misaka_12003-gou & dino, rurudo ::\n1girl, solo, blue eyes, masterpiece"),
    ["misaka_12003-gou & dino", "rurudo"],
  );
});

test("extracts artist: prefixes", () => {
  assert.deepEqual(names("artist:foo, bar"), ["foo"]);
});

test("extracts braced artist: prefixes keeping brace raw", () => {
  assert.deepEqual(names("{artist:foo}，{artist:bar}"), ["foo", "bar"]);
});

test("does not guess artists from a plain tag prompt", () => {
  assert.deepEqual(names("1girl, solo, blue eyes, masterpiece"), []);
  // 也无画师区（无 \n 分隔）时不猜
  assert.deepEqual(names("0.9::misaka_12003-gou & dino, rurudo ::"), []);
});

test("parses a minimal ComfyUI SaveImage workflow", () => {
  const workflow = {
    nodes: [
      {
        id: 1,
        type: "CheckpointLoaderSimple",
        inputs: [{ name: "ckpt_name", widget: { name: "ckpt_name" } }],
        widgets_values: ["example.safetensors"],
      },
      {
        id: 2,
        type: "CLIPTextEncode",
        inputs: [{ name: "text", widget: { name: "text" } }],
        widgets_values: ["a detailed portrait"],
      },
      {
        id: 3,
        type: "CLIPTextEncode",
        inputs: [{ name: "text", widget: { name: "text" } }],
        widgets_values: ["bad anatomy"],
      },
      {
        id: 4,
        type: "KSampler",
        inputs: [
          { name: "model", link: 10 },
          { name: "positive", link: 11 },
          { name: "negative", link: 12 },
          { name: "seed", widget: { name: "seed" } },
          { name: "steps", widget: { name: "steps" } },
          { name: "cfg", widget: { name: "cfg" } },
          { name: "sampler_name", widget: { name: "sampler_name" } },
          { name: "scheduler", widget: { name: "scheduler" } },
        ],
        widgets_values: [123456, 28, 7, "euler", "normal"],
      },
      { id: 5, type: "SaveImage", inputs: [{ name: "images", link: 13 }] },
    ],
    links: [
      [10, 1, 0, 4, 0, "MODEL"],
      [11, 2, 0, 4, 1, "CONDITIONING"],
      [12, 3, 0, 4, 2, "CONDITIONING"],
      [13, 4, 0, 5, 0, "IMAGE"],
    ],
  };

  const metadata = parseComfyUi(JSON.stringify(workflow));
  assert.ok(metadata);
  assert.equal(metadata.prompt, "a detailed portrait");
  assert.equal(metadata.negativePrompt, "bad anatomy");
  assert.equal(metadata.sampler, "euler");
  assert.equal(metadata.steps, 28);
  assert.equal(metadata.cfg, 7);
  assert.equal(metadata.seed, 123456);
  assert.equal(metadata.model, "example.safetensors");
});

test("parses WeiLin/custom nodes with positive field via role propagation", () => {
  // 场景：WeiLinPromptUIWithoutLora 提示词编辑器，正向存在 inputs.positive，
  // 负向走标准 CLIPTextEncode.text。采样器 positive 口引用 WeiLin 节点。
  const workflow = JSON.stringify({
    "55": {
      class_type: "CLIPTextEncode",
      inputs: { text: "blurry,missing fingers,too many fingers,poorly drawn hands", clip: ["66", 1] },
    },
    "66": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: "ckpt.safetensors" } },
    "73": {
      class_type: "WeiLinPromptUIWithoutLora",
      inputs: {
        positive: "masterpiece, best quality, (1girl:1.5), solo, detailed eyes",
        negative: "low quality",
        seed: 123,
        steps: 32,
      },
    },
    "76": {
      class_type: "KSampler",
      inputs: {
        positive: ["73", 0],
        negative: ["55", 0],
        model: ["66", 0],
        seed: 1,
        steps: 32,
        cfg: 2.4,
        sampler_name: "dpmpp_2m",
        scheduler: "karras",
      },
    },
    "113": { class_type: "SaveImage", inputs: { images: ["76", 0] } },
  });

  const metadata = parseComfyUi(workflow);
  assert.ok(metadata);
  assert.equal(metadata.prompt, "masterpiece, best quality, (1girl:1.5), solo, detailed eyes");
  assert.equal(metadata.negativePrompt, "blurry,missing fingers,too many fingers,poorly drawn hands");
});

test("follows Text Concatenate chains with role propagation", () => {
  // 场景：正向是 Text Concatenate（text_a + text_b + text_c 引用），
  // 引用再指回 RandomPrompt 节点（text 字段内容），角色传播应完整拼接。
  const workflow = JSON.stringify({
    "66": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: "ckpt.safetensors" } },
    "69": { class_type: "Raffle", inputs: { seed: ["39", 0], text: "red hair, long hair" } },
    "73": {
      class_type: "Text Concatenate",
      inputs: {
        delimiter: ", ",
        clean_whitespace: "true",
        text_a: ["169", 0],
        text_b: ["170", 0],
        text_c: ["69", 0],
      },
    },
    "169": { class_type: "TextInput_", inputs: { text: "masterpiece," } },
    "170": { class_type: "TextInput_", inputs: { text: "1girl" } },
    "67": { class_type: "CLIPTextEncode", inputs: { text: ["73", 0], clip: ["66", 1] } },
    "58": { class_type: "CLIPTextEncode", inputs: { text: "bad quality", clip: ["66", 1] } },
    "209": {
      class_type: "KSampler",
      inputs: {
        positive: ["67", 0],
        negative: ["58", 0],
        model: ["66", 0],
        seed: 1,
        steps: 35,
        cfg: 6,
        sampler_name: "euler_ancestral",
        scheduler: "karras",
      },
    },
    "211": { class_type: "SaveImage", inputs: { images: ["209", 0] } },
  });

  const metadata = parseComfyUi(workflow);
  assert.ok(metadata);
  assert.ok(metadata.prompt.includes("masterpiece,"), `prompt should contain first part, got: ${metadata.prompt}`);
  assert.ok(metadata.prompt.includes("1girl"), "prompt should contain joined middle part");
  assert.ok(metadata.prompt.includes("red hair, long hair"), "prompt should contain referenced Raffle text");
  assert.equal(metadata.negativePrompt, "bad quality");
});

test("tolerates NaN/Infinity tokens in ComfyUI JSON", () => {
  // 真实 ComfyUI 会把 "is_changed": NaN 写进 PNG 内嵌 prompt，JSON.parse 会炸
  const workflow = `{
    "66": { "class_type": "CheckpointLoaderSimple", "inputs": { "ckpt_name": "ckpt.safetensors" } },
    "2": { "class_type": "CLIPTextEncode", "inputs": { "text": "a beautiful girl", "clip": ["66", 1] } },
    "3": { "class_type": "CLIPTextEncode", "inputs": { "text": "bad anatomy", "clip": ["66", 1] } },
    "4": {
      "class_type": "KSampler",
      "inputs": {
        "positive": ["2", 0],
        "negative": ["3", 0],
        "model": ["66", 0],
        "seed": 123,
        "steps": 28,
        "cfg": 7,
        "sampler_name": "euler",
        "scheduler": "normal"
      },
      "_meta": { "title": "KSampler" },
      "is_changed": NaN
    },
    "5": { "class_type": "SaveImage", "inputs": { "images": ["4", 0] } }
  }`;

  const metadata = parseComfyUi(workflow);
  assert.ok(metadata, "should not crash on NaN token");
  assert.equal(metadata.prompt, "a beautiful girl");
  assert.equal(metadata.negativePrompt, "bad anatomy");
  assert.equal(metadata.steps, 28);
});

test("returns ok:false for empty and truncated PNG input", () => {
  for (const input of [new ArrayBuffer(0), new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer]) {
    let result: ReturnType<typeof parsePngMetadata> | undefined;
    assert.doesNotThrow(() => {
      result = parsePngMetadata(input);
    });
    assert.equal(result?.ok, false);
  }
});

test("rejects a tEXt value larger than 4MB", () => {
  const keyword = new TextEncoder().encode("Comment\0");
  const text = new Uint8Array(keyword.length + MAX_TEXT_VALUE_BYTES + 1);
  text.set(keyword);
  text.fill(0x61, keyword.length);

  const result = parsePngMetadata(pngWithChunks(pngChunk("tEXt", text)));
  assert.equal(result.ok, false);
});
