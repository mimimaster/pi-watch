import assert from "node:assert/strict";
import { test } from "node:test";
import { checkDeps, formatDoctorReport } from "../src/doctor.ts";

function lookPathFrom(map) {
  return async (command) => map[command] ?? null;
}

function execFileFrom(handlers) {
  return async (file, args = []) => {
    const handler = handlers[file];
    if (!handler) {
      const err = new Error(`Command not found: ${file}`);
      err.code = "ENOENT";
      throw err;
    }
    if (typeof handler === "function") return handler(args);
    return handler;
  };
}

test("checkDeps reports every binary present with a version", async () => {
  const report = await checkDeps({
    lookPath: lookPathFrom({
      ffmpeg: "/usr/bin/ffmpeg",
      ffprobe: "/usr/bin/ffprobe",
      "yt-dlp": "/usr/local/bin/yt-dlp",
      mlx_whisper: "/opt/bin/mlx_whisper",
    }),
    execFile: execFileFrom({
      "/usr/bin/ffmpeg": { stdout: "ffmpeg version 7.1.1 Copyright\n", stderr: "", status: 0 },
      "/usr/bin/ffprobe": { stdout: "ffprobe version 7.1.1 Copyright\n", stderr: "", status: 0 },
      "/usr/local/bin/yt-dlp": { stdout: "2026.10.01\n", stderr: "", status: 0 },
      "/opt/bin/mlx_whisper": { stdout: "mlx-whisper 0.4.0\n", stderr: "", status: 0 },
    }),
  });

  assert.equal(report.ffmpeg.found, true);
  assert.equal(report.ffmpeg.path, "/usr/bin/ffmpeg");
  assert.match(report.ffmpeg.version ?? "", /7\.1\.1/);
  assert.equal(report.ffprobe.found, true);
  assert.equal(report.ytdlp.found, true);
  assert.equal(report.whisper.found, true);
  assert.equal(report.whisper.command, "mlx_whisper");
});

test("checkDeps does not throw when every binary is missing", async () => {
  const report = await checkDeps({
    lookPath: lookPathFrom({}),
    execFile: execFileFrom({}),
  });

  assert.equal(report.ffmpeg.found, false);
  assert.equal(report.ffprobe.found, false);
  assert.equal(report.ytdlp.found, false);
  assert.equal(report.whisper.found, false);
  assert.match(report.ffmpeg.hint ?? "", /brew install ffmpeg/);
  assert.match(report.ytdlp.hint ?? "", /yt-dlp/);
  assert.match(report.whisper.hint ?? "", /mlx-whisper|whisper-cli/);
});

test("checkDeps prefers mlx_whisper over whisper-cli", async () => {
  const report = await checkDeps({
    lookPath: lookPathFrom({
      ffmpeg: "/bin/ffmpeg",
      ffprobe: "/bin/ffprobe",
      "whisper-cli": "/bin/whisper-cli",
      mlx_whisper: "/bin/mlx_whisper",
    }),
    execFile: execFileFrom({
      "/bin/ffmpeg": { stdout: "ffmpeg version 6.0\n", stderr: "", status: 0 },
      "/bin/ffprobe": { stdout: "ffprobe version 6.0\n", stderr: "", status: 0 },
      "/bin/mlx_whisper": { stdout: "", stderr: "usage: mlx_whisper\n", status: 0 },
      "/bin/whisper-cli": { stdout: "", stderr: "whisper.cpp\n", status: 0 },
    }),
  });

  assert.equal(report.whisper.found, true);
  assert.equal(report.whisper.command, "mlx_whisper");
});

test("checkDeps falls back to whisper-cli when mlx-whisper is absent", async () => {
  const report = await checkDeps({
    lookPath: lookPathFrom({
      "whisper-cli": "/opt/homebrew/bin/whisper-cli",
    }),
    execFile: execFileFrom({
      "/opt/homebrew/bin/whisper-cli": { stdout: "whisper-cli version 1.7.0\n", stderr: "", status: 0 },
    }),
  });

  assert.equal(report.whisper.found, true);
  assert.equal(report.whisper.command, "whisper-cli");
});

test("formatDoctorReport prints a found/missing table with install hints", () => {
  const table = formatDoctorReport({
    ffmpeg: {
      name: "ffmpeg",
      found: false,
      hint: "brew install ffmpeg  or  apt install ffmpeg",
    },
    ffprobe: { name: "ffprobe", found: false, hint: "comes with ffmpeg" },
    ytdlp: {
      name: "yt-dlp",
      found: true,
      command: "yt-dlp",
      path: "/usr/bin/yt-dlp",
      version: "2026.10.01",
    },
    whisper: {
      name: "whisper",
      found: false,
      hint: "pip install mlx-whisper  or  brew install whisper-cpp",
    },
  });

  assert.match(table, /ffmpeg/);
  assert.match(table, /missing/);
  assert.match(table, /brew install ffmpeg/);
  assert.match(table, /yt-dlp/);
  assert.match(table, /2026\.10\.01/);
  assert.match(table, /whisper/);
});
