import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { parseCaptions, transcribe } from "../src/transcribe.ts";

const SAMPLE_VTT = `WEBVTT

00:00:01.000 --> 00:00:03.500
Hello from the sidecar

00:00:04.000 --> 00:00:06.000
Second cue
`;

test("parseCaptions reads VTT and SRT timestamps", () => {
  const vtt = parseCaptions(SAMPLE_VTT);
  assert.equal(vtt.length, 2);
  assert.equal(vtt[0].start, 1);
  assert.equal(vtt[0].end, 3.5);
  assert.equal(vtt[0].text, "Hello from the sidecar");

  const srt = parseCaptions(`1
00:00:01,000 --> 00:00:02,500
Line one
Line two

2
00:00:03,000 --> 00:00:04,000
Next
`);
  assert.equal(srt.length, 2);
  assert.equal(srt[0].text, "Line one Line two");
  assert.equal(srt[0].end, 2.5);
});

test("sidecar .vtt wins over whisper", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pi-watch-tx-"));
  const videoPath = join(dir, "clip.mp4");
  await writeFile(videoPath, "fake-video");
  await writeFile(join(dir, "clip.vtt"), SAMPLE_VTT);

  let whisperCalls = 0;
  const result = await transcribe(videoPath, {
    lookPath: async (cmd) => (cmd === "mlx_whisper" ? "/bin/mlx_whisper" : null),
    execFile: async (file, args) => {
      if (file === "ffprobe") return { stdout: "", stderr: "", status: 0 };
      if (String(file).includes("whisper") || args.includes("mlx_whisper")) {
        whisperCalls += 1;
      }
      return { stdout: "", stderr: "", status: 0 };
    },
  });

  assert.equal(result.source, "sidecar");
  assert.equal(result.segments[0].text, "Hello from the sidecar");
  assert.equal(whisperCalls, 0);
});

test("no captions and no whisper binary yields source none with a note", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pi-watch-tx-"));
  const videoPath = join(dir, "silent.mp4");
  await writeFile(videoPath, "fake-video");

  const result = await transcribe(videoPath, {
    lookPath: async () => null,
    execFile: async (file) => {
      if (file === "ffprobe") return { stdout: "", stderr: "", status: 0 };
      if (file === "ffmpeg") return { stdout: "", stderr: "", status: 1 };
      return { stdout: "", stderr: "", status: 0 };
    },
  });

  assert.equal(result.source, "none");
  assert.equal(result.segments.length, 0);
  assert.match(result.note ?? "", /no captions|not transcribed|whisper/i);
});

test("whisper is invoked only when captions are missing", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pi-watch-tx-"));
  const videoPath = join(dir, "talk.mp4");
  await writeFile(videoPath, "fake-video");

  let whisperArgs = null;
  const result = await transcribe(videoPath, {
    workDir: dir,
    lookPath: async (cmd) => (cmd === "whisper-cli" ? "/opt/whisper-cli" : null),
    execFile: async (file, args) => {
      if (file === "ffprobe") return { stdout: "", stderr: "", status: 0 };
      if (file === "/opt/whisper-cli") {
        whisperArgs = args;
        await writeFile(join(dir, "whisper.vtt"), SAMPLE_VTT);
        return { stdout: "", stderr: "", status: 0 };
      }
      return { stdout: "", stderr: "", status: 1 };
    },
  });

  assert.ok(whisperArgs, "expected whisper-cli to run");
  assert.ok(whisperArgs.includes(videoPath));
  assert.equal(result.source, "whisper");
  assert.equal(result.segments[0].text, "Hello from the sidecar");
});

test("embedded subtitle dump beats whisper", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pi-watch-tx-"));
  const videoPath = join(dir, "subs.mp4");
  await writeFile(videoPath, "fake-video");

  let whisperCalls = 0;
  const result = await transcribe(videoPath, {
    workDir: dir,
    lookPath: async (cmd) => (cmd === "mlx_whisper" ? "/bin/mlx_whisper" : null),
    execFile: async (file, args) => {
      if (file === "ffprobe") {
        return { stdout: "0\n", stderr: "", status: 0 };
      }
      if (file === "ffmpeg" && args.includes("webvtt")) {
        return { stdout: SAMPLE_VTT, stderr: "", status: 0 };
      }
      if (String(file).includes("whisper")) {
        whisperCalls += 1;
      }
      return { stdout: "", stderr: "", status: 0 };
    },
  });

  assert.equal(result.source, "embedded");
  assert.equal(whisperCalls, 0);
  assert.equal(result.segments.length, 2);
});
