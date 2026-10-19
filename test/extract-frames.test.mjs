import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { extractFrames, probeDuration } from "../src/extract-frames.ts";
import { computeFramePlan } from "../src/limits.ts";

test("probeDuration parses ffprobe stdout", async () => {
  const duration = await probeDuration("/tmp/clip.mp4", {
    execFile: async (file, args) => {
      assert.equal(file, "ffprobe");
      assert.ok(args.includes("/tmp/clip.mp4"));
      return { stdout: "12.5\n", stderr: "", status: 0 };
    },
  });
  assert.equal(duration, 12.5);
});

test("probeDuration throws a readable error when ffprobe is missing", async () => {
  await assert.rejects(
    () =>
      probeDuration("/tmp/clip.mp4", {
        execFile: async () => {
          const err = new Error("Command not found: ffprobe");
          err.code = "ENOENT";
          throw err;
        },
      }),
    /ffprobe|ffmpeg|brew install ffmpeg/i,
  );
});

test("extractFrames calls ffmpeg with fps, scale, and time window", async () => {
  const outDir = await mkdtemp(join(tmpdir(), "pi-watch-frames-"));
  let ffmpegArgs = [];

  const plan = computeFramePlan(30, { start: 2, end: 8 });
  const result = await extractFrames("/data/talk.mp4", outDir, plan, {
    execFile: async (file, args) => {
      assert.equal(file, "ffmpeg");
      ffmpegArgs = args;
      await writeFile(join(outDir, "frame_0001.jpg"), "fake");
      await writeFile(join(outDir, "frame_0002.jpg"), "fake");
      return { stdout: "", stderr: "", status: 0 };
    },
  });

  const vf = ffmpegArgs[ffmpegArgs.indexOf("-vf") + 1];
  assert.match(vf, /fps=/);
  assert.match(vf, /scale=768:-2/);
  assert.equal(ffmpegArgs[ffmpegArgs.indexOf("-ss") + 1], "2");
  assert.ok(Number(ffmpegArgs[ffmpegArgs.indexOf("-t") + 1]) > 0);
  assert.equal(ffmpegArgs[ffmpegArgs.indexOf("-i") + 1], "/data/talk.mp4");
  assert.equal(result.frames.length, 2);
  assert.equal(result.frames[0].tSec, plan.windowStartSec);
  assert.ok(result.frames[1].tSec > result.frames[0].tSec);
  assert.ok(result.frames[0].path.endsWith("frame_0001.jpg"));
});

test("extractFrames surfaces ffmpeg failures", async () => {
  const outDir = await mkdtemp(join(tmpdir(), "pi-watch-frames-"));
  await assert.rejects(
    () =>
      extractFrames("/data/talk.mp4", outDir, computeFramePlan(5), {
        execFile: async () => ({ stdout: "", stderr: "No such filter", status: 1 }),
      }),
    /ffmpeg failed|No such filter/i,
  );
});
