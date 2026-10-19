import { readdir, readFile } from "node:fs/promises";
import { basename, dirname, extname, join } from "node:path";
import { defaultExecFile, defaultLookPath, CommandNotFoundError } from "./exec.ts";
import type {
  ExecFileFn,
  LookPathFn,
  TranscriptResult,
  TranscriptSegment,
  WatchDeps,
} from "./types.ts";

const CAPTION_EXTS = new Set([".vtt", ".srt", ".ass", ".ssa"]);
const WHISPER_CANDIDATES = ["mlx_whisper", "mlx-whisper", "whisper-cli", "whisper.cpp"] as const;

export interface TranscribeOptions extends WatchDeps {
  workDir?: string;
  fromUrl?: boolean;
}

export function parseTimestamp(raw: string): number {
  const norm = raw.trim().replace(",", ".");
  const parts = norm.split(":").map((p) => Number.parseFloat(p));
  if (parts.length === 0 || parts.some((n) => !Number.isFinite(n))) return Number.NaN;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0];
}

export function parseCaptions(text: string): TranscriptSegment[] {
  const lines = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").split("\n");
  const segments: TranscriptSegment[] = [];
  let i = 0;
  const timing = /(\d{1,2}:)?\d{1,2}:\d{2}[.,]\d{1,3}\s*-->\s*(\d{1,2}:)?\d{1,2}:\d{2}[.,]\d{1,3}/;

  while (i < lines.length) {
    const line = lines[i].trim();
    i += 1;
    if (!line || line.startsWith("WEBVTT") || line.startsWith("NOTE") || line.startsWith("STYLE") || line.startsWith("REGION")) {
      continue;
    }
    let cue = line;
    if (!timing.test(cue) && i < lines.length && timing.test(lines[i])) {
      cue = lines[i].trim();
      i += 1;
    }
    const match = cue.match(/^(.*?)\s*-->\s*(\S+)/);
    if (!match) continue;
    const start = parseTimestamp(match[1].replace(/[^\d:.,]/g, ""));
    const end = parseTimestamp(match[2].replace(/[^\d:.,]/g, ""));
    const textLines: string[] = [];
    while (i < lines.length && lines[i].trim() !== "") {
      const body = lines[i].replace(/<[^>]+>/g, "").trim();
      if (body) textLines.push(body);
      i += 1;
    }
    if (Number.isFinite(start) && Number.isFinite(end) && textLines.length) {
      segments.push({ start, end, text: textLines.join(" ") });
    }
  }
  return segments;
}

async function readCaptionFile(path: string): Promise<TranscriptSegment[]> {
  const text = await readFile(path, "utf8");
  return parseCaptions(text);
}

async function findSidecar(videoPath: string): Promise<string | null> {
  const dir = dirname(videoPath);
  const stem = basename(videoPath, extname(videoPath));
  let names: string[] = [];
  try {
    names = await readdir(dir);
  } catch {
    return null;
  }
  const matches = names
    .filter((name) => {
      const ext = extname(name).toLowerCase();
      if (!CAPTION_EXTS.has(ext)) return false;
      return name === `${stem}${ext}` || name.startsWith(`${stem}.`);
    })
    .sort((a, b) => {
      const rank = (name: string) => (extname(name).toLowerCase() === ".vtt" ? 0 : 1);
      return rank(a) - rank(b) || a.length - b.length;
    });
  return matches[0] ? join(dir, matches[0]) : null;
}

async function findCaptionsInDir(dir: string | undefined, excludePath?: string | null): Promise<string | null> {
  if (!dir) return null;
  let names: string[] = [];
  try {
    names = await readdir(dir);
  } catch {
    return null;
  }
  const matches = names
    .filter((name) => CAPTION_EXTS.has(extname(name).toLowerCase()))
    .sort((a, b) => {
      const rank = (name: string) => (extname(name).toLowerCase() === ".vtt" ? 0 : 1);
      return rank(a) - rank(b) || a.localeCompare(b);
    });
  for (const name of matches) {
    const path = join(dir, name);
    if (excludePath && path === excludePath) continue;
    return path;
  }
  return null;
}

async function hasEmbeddedSubtitles(videoPath: string, execFile: ExecFileFn): Promise<boolean> {
  try {
    const result = await execFile("ffprobe", [
      "-v",
      "error",
      "-select_streams",
      "s",
      "-show_entries",
      "stream=index",
      "-of",
      "csv=p=0",
      videoPath,
    ]);
    return result.status === 0 && result.stdout.trim().length > 0;
  } catch {
    return false;
  }
}

async function dumpEmbedded(videoPath: string, execFile: ExecFileFn): Promise<string | null> {
  if (!(await hasEmbeddedSubtitles(videoPath, execFile))) return null;
  try {
    const result = await execFile("ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      videoPath,
      "-map",
      "0:s:0",
      "-f",
      "webvtt",
      "pipe:1",
    ]);
    if (result.status !== 0) return null;
    const text = result.stdout.trim();
    return text ? text : null;
  } catch (err) {
    if (err instanceof CommandNotFoundError) return null;
    return null;
  }
}

interface WhisperBin {
  command: string;
  path: string;
  kind: "mlx" | "cli";
}

async function findWhisper(lookPath: LookPathFn): Promise<WhisperBin | null> {
  for (const command of WHISPER_CANDIDATES) {
    const path = await lookPath(command);
    if (!path) continue;
    const kind = command.startsWith("mlx") ? "mlx" : "cli";
    return { command, path, kind };
  }
  return null;
}

async function runWhisper(
  bin: WhisperBin,
  videoPath: string,
  workDir: string | undefined,
  execFile: ExecFileFn,
): Promise<string | null> {
  const outDir = workDir ?? dirname(videoPath);
  try {
    if (bin.kind === "mlx") {
      const result = await execFile(
        bin.path,
        [videoPath, "--output-format", "vtt", "--output-dir", outDir],
        { timeout: 20 * 60 * 1000 },
      );
      if (result.status !== 0) return null;
      const stem = basename(videoPath, extname(videoPath));
      const generated = join(outDir, `${stem}.vtt`);
      try {
        return await readFile(generated, "utf8");
      } catch {
        return result.stdout || null;
      }
    }

    const prefix = join(outDir, "whisper");
    const result = await execFile(
      bin.path,
      ["-f", videoPath, "-ovtt", "-of", prefix],
      { timeout: 20 * 60 * 1000 },
    );
    if (result.status !== 0) return null;
    try {
      return await readFile(`${prefix}.vtt`, "utf8");
    } catch {
      return result.stdout || null;
    }
  } catch {
    return null;
  }
}

const NONE_NOTE =
  "No captions found and no local Whisper binary (mlx-whisper / whisper-cli). Frames only — not transcribed.";

export async function transcribe(videoPath: string, opts: TranscribeOptions = {}): Promise<TranscriptResult> {
  const execFile = opts.execFile ?? defaultExecFile;
  const lookPath = opts.lookPath ?? defaultLookPath;

  const embedded = await dumpEmbedded(videoPath, execFile);
  if (embedded) {
    const segments = parseCaptions(embedded);
    if (segments.length) return { source: "embedded", segments };
  }

  const sidecar = await findSidecar(videoPath);
  if (sidecar) {
    const segments = await readCaptionFile(sidecar);
    if (segments.length) {
      return {
        source: opts.fromUrl ? "ytdlp" : "sidecar",
        segments,
      };
    }
  }

  const extra = await findCaptionsInDir(opts.workDir, sidecar);
  if (extra) {
    const segments = await readCaptionFile(extra);
    if (segments.length) return { source: "ytdlp", segments };
  }

  const whisper = await findWhisper(lookPath);
  if (whisper) {
    const text = await runWhisper(whisper, videoPath, opts.workDir, execFile);
    if (text) {
      const segments = parseCaptions(text);
      if (segments.length) return { source: "whisper", segments };
    }
    return {
      source: "none",
      segments: [],
      note: `Whisper (${whisper.command}) ran but produced no captions. Frames only.`,
    };
  }

  return { source: "none", segments: [], note: NONE_NOTE };
}
