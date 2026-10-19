/** Shared types for the pi-watch pipeline. */

export type TranscriptSource = "embedded" | "sidecar" | "ytdlp" | "whisper" | "none";

export type WhisperKind = "mlx-whisper" | "whisper-cli" | null;

export interface DepStatus {
  name: string;
  found: boolean;
  command?: string;
  path?: string;
  version?: string;
  hint?: string;
}

export interface DoctorReport {
  ffmpeg: DepStatus;
  ffprobe: DepStatus;
  ytdlp: DepStatus;
  whisper: DepStatus;
}

export interface ExecResult {
  stdout: string;
  stderr: string;
  status: number;
}

export type ExecFileFn = (
  file: string,
  args: string[],
  options?: { timeout?: number; cwd?: string; maxBuffer?: number },
) => Promise<ExecResult>;

export type LookPathFn = (command: string) => Promise<string | null>;

export interface WatchDeps {
  execFile?: ExecFileFn;
  lookPath?: LookPathFn;
}

export interface FramePlan {
  fps: number;
  maxFrames: number;
  width: number;
  durationSec: number;
  windowStartSec: number;
  windowEndSec: number;
}

export interface Frame {
  path: string;
  tSec: number;
}

export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}

export interface TranscriptResult {
  source: TranscriptSource;
  segments: TranscriptSegment[];
  note?: string;
}

export interface WatchOptions {
  start?: number;
  end?: number;
  cwd?: string;
  workDir?: string;
  maxDurationSec?: number;
  maxFrames?: number;
  width?: number;
}

export interface ResolvedSource {
  videoPath: string;
  workDir: string;
  fromUrl: boolean;
  original: string;
}

export interface WatchResult {
  source: string;
  videoPath: string;
  workDir: string;
  fromUrl: boolean;
  durationSec: number;
  frames: Frame[];
  transcript: TranscriptResult;
  elapsedMs: number;
  window: { start: number; end: number };
  plan: FramePlan;
}

export interface ImageContent {
  type: "image";
  data: string;
  mimeType: string;
}

export interface TextContent {
  type: "text";
  text: string;
}

export type UserContent = TextContent | ImageContent;
