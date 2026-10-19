import { mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";
import { CommandNotFoundError, defaultExecFile } from "./exec.ts";
import type { ExecFileFn, Frame, FramePlan, WatchDeps } from "./types.ts";

const FFMPEG_INSTALL = "Install ffmpeg with: brew install ffmpeg  or  apt install ffmpeg";

function missingTool(name: string): Error {
  return new Error(`${name} is required for /watch. ${FFMPEG_INSTALL}`);
}

function wrapExecError(name: string, err: unknown): never {
  if (err instanceof CommandNotFoundError || (err as NodeJS.ErrnoException).code === "ENOENT") {
    throw missingTool(name);
  }
  throw err;
}

export async function probeDuration(videoPath: string, deps: WatchDeps = {}): Promise<number> {
  const execFile: ExecFileFn = deps.execFile ?? defaultExecFile;
  let result;
  try {
    result = await execFile("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      videoPath,
    ]);
  } catch (err) {
    wrapExecError("ffprobe", err);
  }
  if (result.status !== 0) {
    throw new Error(`ffprobe failed: ${result.stderr || result.stdout || `exit ${result.status}`}`);
  }
  const duration = Number.parseFloat(result.stdout.trim());
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error(`Could not read video duration from ${videoPath}`);
  }
  return duration;
}

export async function extractFrames(
  videoPath: string,
  outDir: string,
  plan: FramePlan,
  deps: WatchDeps = {},
): Promise<{ frames: Frame[] }> {
  const execFile: ExecFileFn = deps.execFile ?? defaultExecFile;
  await mkdir(outDir, { recursive: true });
  const pattern = join(outDir, "frame_%04d.jpg");
  const window = Math.max(plan.windowEndSec - plan.windowStartSec, 0.01);
  const vf = `fps=${plan.fps},scale=${plan.width}:-2`;
  let result;
  try {
    result = await execFile("ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-ss",
      String(plan.windowStartSec),
      "-i",
      videoPath,
      "-t",
      String(window),
      "-vf",
      vf,
      "-frames:v",
      String(plan.maxFrames),
      "-q:v",
      "3",
      pattern,
    ]);
  } catch (err) {
    wrapExecError("ffmpeg", err);
  }
  if (result.status !== 0) {
    throw new Error(`ffmpeg failed: ${result.stderr || result.stdout || `exit ${result.status}`}`);
  }

  const names = (await readdir(outDir))
    .filter((name) => /^frame_\d+\.jpe?g$/i.test(name))
    .sort();
  const frames = names.map((name, index) => ({
    path: join(outDir, name),
    tSec: plan.windowStartSec + index / plan.fps,
  }));
  return { frames };
}
