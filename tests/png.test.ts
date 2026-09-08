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
