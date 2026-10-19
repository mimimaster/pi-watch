import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  buildWatchText,
  formatWatchStatus,
  injectIntoSession,
  lastWatch,
  rememberWatch,
} from "../src/inject.ts";
import { runWatch } from "../src/pipeline.ts";

const VTT = `WEBVTT

00:00:00.000 --> 00:00:02.000
Hello there
`;

function mockExec({ duration = "8.0", framesDir }) {
  return async (file, args = []) => {
    if (file === "ffprobe") {
      if (args.includes("format=duration")) {
        return { stdout: `${duration}\n`, stderr: "", status: 0 };
      }
      return { stdout: "", stderr: "", status: 0 };
    }
    if (file === "ffmpeg") {
      const count = Number(args[args.indexOf("-frames:v") + 1] ?? 2);
      const n = Math.min(Math.max(count, 1), 4);
      for (let i = 1; i <= n; i += 1) {
        await writeFile(join(framesDir, `frame_${String(i).padStart(4, "0")}.jpg`), `jpeg-${i}`);
      }
      return { stdout: "", stderr: "", status: 0 };
    }
    throw Object.assign(new Error(`unexpected ${file}`), { code: "ENOENT" });
  };
}

test("runWatch resolve → frames → sidecar transcript with mocked subprocesses", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pi-watch-pipe-"));
  const videoPath = join(dir, "talk.mp4");
  const workDir = join(dir, "work");
  const framesDir = join(workDir, "frames");
  await writeFile(videoPath, "fake-mp4");
  await writeFile(join(dir, "talk.vtt"), VTT);

  const result = await runWatch(
    videoPath,
    { workDir, start: 0, end: 4 },
    {
      lookPath: async () => "/bin/mlx_whisper",
      execFile: mockExec({ framesDir }),
    },
  );

  assert.equal(result.videoPath, videoPath);
  assert.equal(result.fromUrl, false);
  assert.ok(result.frames.length >= 1);
  assert.equal(result.transcript.source, "sidecar");
  assert.equal(result.transcript.segments[0].text, "Hello there");
  assert.ok(result.elapsedMs >= 0);
});

test("runWatch does not call whisper when captions exist", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pi-watch-pipe-"));
  const videoPath = join(dir, "talk.mp4");
  const workDir = join(dir, "work");
  const framesDir = join(workDir, "frames");
  await writeFile(videoPath, "fake-mp4");
  await writeFile(join(dir, "talk.vtt"), VTT);

  const called = [];
  await runWatch(
    videoPath,
    { workDir },
    {
      lookPath: async (cmd) => (cmd === "mlx_whisper" ? "/bin/mlx_whisper" : null),
      execFile: async (file, args) => {
        called.push(file);
        return mockExec({ framesDir })(file, args);
      },
    },
  );
  assert.ok(!called.some((file) => String(file).includes("whisper")));
});

test("injectIntoSession sends text + image parts and records status", async () => {
  rememberWatch(null);
  const dir = await mkdtemp(join(tmpdir(), "pi-watch-inj-"));
  const framePath = join(dir, "frame_0001.jpg");
  await writeFile(framePath, Buffer.from([0xff, 0xd8, 0xff, 0xd9]));

  const result = {
    source: "/tmp/talk.mp4",
    videoPath: "/tmp/talk.mp4",
    workDir: dir,
    fromUrl: false,
    durationSec: 8,
    frames: [{ path: framePath, tSec: 1.5 }],
    transcript: {
      source: "sidecar",
      segments: [{ start: 0, end: 2, text: "Hello there" }],
    },
    elapsedMs: 1234,
    window: { start: 0, end: 8 },
    plan: {
      fps: 2,
      maxFrames: 1,
      width: 768,
      durationSec: 8,
      windowStartSec: 0,
      windowEndSec: 8,
    },
  };

  let sent = null;
  const notes = [];
  const injected = await injectIntoSession(result, {
    sendUserMessage: (content) => {
      sent = content;
    },
    notify: (message) => notes.push(message),
  });

  assert.equal(injected.usedImages, true);
  assert.ok(Array.isArray(sent));
  assert.equal(sent[0].type, "text");
  assert.match(sent[0].text, /Hello there/);
  assert.match(sent[0].text, /frame_0001\.jpg/);
  assert.equal(sent[1].type, "image");
  assert.equal(sent[1].mimeType, "image/jpeg");
  assert.ok(sent[1].data.length > 0);
  assert.match(notes[0], /1 frames/);
  assert.equal(lastWatch()?.source, "/tmp/talk.mp4");
  assert.match(formatWatchStatus(result), /sidecar/);
  assert.match(buildWatchText(result), /Transcript source: sidecar/);
});

test("injectIntoSession falls back to file paths when image parts throw", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pi-watch-inj-"));
  const framePath = join(dir, "frame_0001.jpg");
  await writeFile(framePath, "jpeg");
  const result = {
    source: "clip.mp4",
    videoPath: "clip.mp4",
    workDir: dir,
    fromUrl: false,
    durationSec: 3,
    frames: [{ path: framePath, tSec: 0 }],
    transcript: { source: "none", segments: [], note: "not transcribed" },
    elapsedMs: 10,
    window: { start: 0, end: 3 },
    plan: {
      fps: 1,
      maxFrames: 1,
      width: 768,
      durationSec: 3,
      windowStartSec: 0,
      windowEndSec: 3,
    },
  };

  let sent = null;
  const injected = await injectIntoSession(result, {
    sendUserMessage: (content) => {
      if (Array.isArray(content)) throw new Error("no image parts");
      sent = content;
    },
  });

  assert.equal(injected.usedImages, false);
  assert.equal(typeof sent, "string");
  assert.match(sent, /frame_0001\.jpg/);
  assert.match(sent, /not accepted|Read the frame/i);
});
