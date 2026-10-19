import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { isUrl, resolveSource } from "../src/resolve-source.ts";

test("isUrl detects http(s) sources", () => {
  assert.equal(isUrl("https://www.youtube.com/watch?v=dQw4w9wgGcQ"), true);
  assert.equal(isUrl("http://example.com/a.mp4"), true);
  assert.equal(isUrl("/tmp/talk.mp4"), false);
  assert.equal(isUrl("talk.mp4"), false);
});

test("local missing path throws", async () => {
  await assert.rejects(
    () =>
      resolveSource("/definitely/missing/pi-watch-clip.mp4", {
        lookPath: async () => "/bin/yt-dlp",
        execFile: async () => ({ stdout: "", stderr: "", status: 0 }),
      }),
    /not found|does not exist/i,
  );
});

test("URL without yt-dlp throws a readable error", async () => {
  await assert.rejects(
    () =>
      resolveSource("https://www.youtube.com/watch?v=aaaaaaaaaaa", {
        lookPath: async () => null,
        execFile: async () => {
          throw new Error("should not download");
        },
      }),
    /yt-dlp/i,
  );
});

test("local existing path returns as-is", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pi-watch-src-"));
  const videoPath = join(dir, "demo.mp4");
  await writeFile(videoPath, "fake-mp4");

  const resolved = await resolveSource(videoPath, {
    lookPath: async () => null,
    execFile: async () => {
      throw new Error("yt-dlp should not run for local files");
    },
  });

  assert.equal(resolved.videoPath, videoPath);
  assert.equal(resolved.fromUrl, false);
  assert.ok(resolved.workDir);
});

test("yt-dlp downloads a URL into the work directory (mocked)", async () => {
  const workDir = await mkdtemp(join(tmpdir(), "pi-watch-dl-"));
  let ytdlpArgs = null;

  const resolved = await resolveSource("https://example.com/watch?v=abc", {
    workDir,
    lookPath: async (cmd) => (cmd === "yt-dlp" ? "/usr/bin/yt-dlp" : null),
    execFile: async (file, args) => {
      assert.equal(file, "/usr/bin/yt-dlp");
      ytdlpArgs = args;
      await writeFile(join(workDir, "video.mp4"), "downloaded");
      await writeFile(join(workDir, "video.en.vtt"), "WEBVTT\n");
      return { stdout: "", stderr: "", status: 0 };
    },
  });

  assert.equal(resolved.fromUrl, true);
  assert.equal(resolved.videoPath, join(workDir, "video.mp4"));
  assert.ok(ytdlpArgs.includes("https://example.com/watch?v=abc"));
  assert.ok(ytdlpArgs.includes("--write-subs") || ytdlpArgs.includes("--write-auto-subs"));
});

test("yt-dlp failure is readable and does not hit the network in tests", async () => {
  const workDir = await mkdtemp(join(tmpdir(), "pi-watch-dl-"));
  await assert.rejects(
    () =>
      resolveSource("https://youtube.com/watch?v=nope", {
        workDir,
        lookPath: async (cmd) => (cmd === "yt-dlp" ? "/usr/bin/yt-dlp" : null),
        execFile: async () => ({ stdout: "", stderr: "ERROR: Video unavailable", status: 1 }),
      }),
    /yt-dlp failed|Video unavailable/i,
  );
});
