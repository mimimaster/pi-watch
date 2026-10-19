import { join } from "node:path";
import { extractFrames, probeDuration } from "./extract-frames.ts";
import { computeFramePlan } from "./limits.ts";
import { resolveSource } from "./resolve-source.ts";
import { transcribe } from "./transcribe.ts";
import type { WatchDeps, WatchOptions, WatchResult } from "./types.ts";

export async function runWatch(
  input: string,
  opts: WatchOptions = {},
  deps: WatchDeps = {},
): Promise<WatchResult> {
  const started = Date.now();
  const source = await resolveSource(input, {
    execFile: deps.execFile,
    lookPath: deps.lookPath,
    cwd: opts.cwd,
    workDir: opts.workDir,
  });
  const durationSec = await probeDuration(source.videoPath, deps);
  const plan = computeFramePlan(durationSec, opts);
  const framesDir = join(source.workDir, "frames");
  const { frames } = await extractFrames(source.videoPath, framesDir, plan, deps);
  const transcript = await transcribe(source.videoPath, {
    execFile: deps.execFile,
    lookPath: deps.lookPath,
    workDir: source.workDir,
    fromUrl: source.fromUrl,
  });
  return {
    source: source.original,
    videoPath: source.videoPath,
    workDir: source.workDir,
    fromUrl: source.fromUrl,
    durationSec,
    frames,
    transcript,
    elapsedMs: Date.now() - started,
    window: { start: plan.windowStartSec, end: plan.windowEndSec },
    plan,
  };
}
