import type { FramePlan, WatchOptions } from "./types.ts";

export const DEFAULT_MAX_FRAMES = 100;
export const DEFAULT_WIDTH = 768;
export const DEFAULT_MAX_DURATION_SEC = 20 * 60;

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return `${seconds}`;
  const whole = Math.round(seconds);
  const h = Math.floor(whole / 3600);
  const m = Math.floor((whole % 3600) / 60);
  const s = whole % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`;
  if (m > 0) return `${m}m ${String(s).padStart(2, "0")}s`;
  return `${seconds.toFixed(seconds < 10 && seconds % 1 !== 0 ? 2 : 0)}s`;
}

export class DurationLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DurationLimitError";
  }
}

function targetFrameCount(windowSec: number, maxFrames: number): number {
  // Short clips: denser sampling (~2 fps). Medium: ~1 fps. Long: even spread to the cap.
  let target: number;
  if (windowSec <= 60) target = Math.round(windowSec * 2);
  else if (windowSec <= 180) target = Math.round(windowSec);
  else target = maxFrames;
  return Math.min(maxFrames, Math.max(1, target));
}

export function computeFramePlan(durationSec: number, opts: WatchOptions = {}): FramePlan {
  if (!Number.isFinite(durationSec) || durationSec <= 0) {
    throw new Error(`Invalid duration: ${durationSec}`);
  }

  const maxFrames = opts.maxFrames ?? DEFAULT_MAX_FRAMES;
  const width = opts.width ?? DEFAULT_WIDTH;
  const maxDuration = opts.maxDurationSec ?? DEFAULT_MAX_DURATION_SEC;
  const start = opts.start ?? 0;
  const requestedEnd = opts.end ?? durationSec;
  const windowExplicit = opts.start != null || opts.end != null;

  if (start < 0) {
    throw new Error("--start must be >= 0");
  }
  if (requestedEnd <= start) {
    throw new Error("--end must be greater than --start");
  }
  if (start >= durationSec) {
    throw new Error(`--start ${formatDuration(start)} is beyond the video duration (${formatDuration(durationSec)})`);
  }

  const end = Math.min(requestedEnd, durationSec);
  const windowSec = end - start;

  if (windowSec > maxDuration) {
    throw new DurationLimitError(
      `Selected window is ${formatDuration(windowSec)} (max 20 minutes). Use --start/--end to pick a shorter range.`,
    );
  }
  if (!windowExplicit && durationSec > maxDuration) {
    throw new DurationLimitError(
      `Video is ${formatDuration(durationSec)} (max 20 minutes). Pass --start/--end to analyze a window of at most 20 minutes.`,
    );
  }

  const count = targetFrameCount(windowSec, maxFrames);
  const fps = count / windowSec;

  return {
    fps,
    maxFrames: count,
    width,
    durationSec,
    windowStartSec: start,
    windowEndSec: end,
  };
}
