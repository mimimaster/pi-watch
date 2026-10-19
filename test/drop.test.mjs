import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  detectVideoPaths,
  resolveExistingVideo,
  shouldHandleDroppedInput,
  stripVideoPath,
} from "../src/drop.ts";

test("detectVideoPaths finds dropped local videos and ignores URLs", () => {
  assert.deepEqual(detectVideoPaths("please watch /tmp/demo.mp4"), ["/tmp/demo.mp4"]);
  assert.deepEqual(detectVideoPaths(`what is "/tmp/my clip.webm"?`), ["/tmp/my clip.webm"]);
  assert.deepEqual(detectVideoPaths("/tmp/my\\ clip.mov"), ["/tmp/my clip.mov"]);
  assert.deepEqual(detectVideoPaths("https://example.com/a.mp4"), []);
  assert.deepEqual(detectVideoPaths("no media here"), []);
});

test("shouldHandleDroppedInput skips commands, RPC, and already-attached images", () => {
  assert.equal(shouldHandleDroppedInput({ text: "/tmp/a.mp4", source: "interactive" }), true);
  assert.equal(shouldHandleDroppedInput({ text: "/watch /tmp/a.mp4", source: "interactive" }), false);
  assert.equal(shouldHandleDroppedInput({ text: "/tmp/a.mp4", source: "rpc" }), false);
  assert.equal(
    shouldHandleDroppedInput({
      text: "/tmp/a.mp4",
      source: "interactive",
      images: [{ type: "image" }],
    }),
    false,
  );
});

test("stripVideoPath keeps the user's question", () => {
  assert.equal(stripVideoPath("what happens here? /tmp/demo.mp4", "/tmp/demo.mp4"), "what happens here?");
});

test("resolveExistingVideo only returns files that exist", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pi-watch-drop-"));
  const videoPath = join(dir, "clip.mp4");
  await writeFile(videoPath, "x");
  assert.equal(await resolveExistingVideo("clip.mp4", dir), videoPath);
  assert.equal(await resolveExistingVideo("missing.mp4", dir), null);
});
