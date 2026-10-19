import { access, mkdtemp, readdir, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, isAbsolute, join, resolve } from "node:path";
import { CommandNotFoundError, defaultExecFile, defaultLookPath } from "./exec.ts";
import type { ResolvedSource, WatchDeps } from "./types.ts";

export const VIDEO_EXTENSIONS = [
  ".mp4",
  ".webm",
  ".mov",
  ".mkv",
  ".m4v",
  ".avi",
  ".mpeg",
  ".mpg",
  ".ogv",
  ".3gp",
];

const VIDEO_EXT_SET = new Set(VIDEO_EXTENSIONS);

export function isUrl(input: string): boolean {
  return /^https?:\/\//i.test(input.trim());
}

export function looksLikeUrl(input: string): boolean {
  const value = input.trim();
  if (isUrl(value)) return true;
  return /^(www\.|youtube\.com|youtu\.be|vimeo\.com)/i.test(value);
}

/** Strip TUI drag-drop quoting / backslash-escaped spaces. */
export function normalizePathInput(input: string): string {
  let value = input.trim();
  if ((value.startsWith("'") && value.endsWith("'")) || (value.startsWith('"') && value.endsWith('"'))) {
    value = value.slice(1, -1);
  }
  return value.replace(/\\ /g, " ");
}

async function ensureWorkDir(workDir?: string): Promise<string> {
  if (workDir) return workDir;
  return mkdtemp(join(tmpdir(), "pi-watch-"));
}

async function findDownloadedVideo(workDir: string): Promise<string | null> {
  const names = await readdir(workDir);
  const videos = names
    .filter((name) => VIDEO_EXT_SET.has(extname(name).toLowerCase()))
    .sort((a, b) => a.localeCompare(b));
  const preferred = videos.find((name) => name.startsWith("video.")) ?? videos[0];
  return preferred ? join(workDir, preferred) : null;
}

export interface ResolveSourceOptions extends WatchDeps {
  cwd?: string;
  workDir?: string;
}

export async function resolveSource(input: string, opts: ResolveSourceOptions = {}): Promise<ResolvedSource> {
  const trimmed = normalizePathInput(input);
  if (!trimmed) {
    throw new Error("Usage: /watch <local-path-or-url>");
  }

  const lookPath = opts.lookPath ?? defaultLookPath;
  const execFile = opts.execFile ?? defaultExecFile;

  if (isUrl(trimmed)) {
    const ytdlp = await lookPath("yt-dlp");
    if (!ytdlp) {
      throw new Error(
        "yt-dlp is required to fetch video URLs. Install: brew install yt-dlp  or  pip install yt-dlp",
      );
    }
    const workDir = await ensureWorkDir(opts.workDir);
    let result;
    try {
      result = await execFile(
        ytdlp,
        [
          "--no-playlist",
          "--no-progress",
          "--newline",
          "--write-subs",
          "--write-auto-subs",
          "--sub-langs",
          "en.*,zh.*,en,zh,zh-Hans,zh-CN,*",
          "--convert-subs",
          "vtt",
          "-o",
          join(workDir, "video.%(ext)s"),
          trimmed,
        ],
        { timeout: 10 * 60 * 1000, cwd: workDir },
      );
    } catch (err) {
      if (err instanceof CommandNotFoundError || (err as NodeJS.ErrnoException).code === "ENOENT") {
        throw new Error(
          "yt-dlp is required to fetch video URLs. Install: brew install yt-dlp  or  pip install yt-dlp",
        );
      }
      throw err;
    }
    if (result.status !== 0) {
      throw new Error(`yt-dlp failed: ${result.stderr.trim() || result.stdout.trim() || `exit ${result.status}`}`);
    }
    const videoPath = await findDownloadedVideo(workDir);
    if (!videoPath) {
      throw new Error("yt-dlp finished but no video file was found in the work directory.");
    }
    return { videoPath, workDir, fromUrl: true, original: trimmed };
  }

  if (looksLikeUrl(trimmed)) {
    throw new Error(`That looks like a URL. Pass it with https:// so yt-dlp can fetch it: https://${trimmed}`);
  }

  const cwd = opts.cwd ?? process.cwd();
  const videoPath = isAbsolute(trimmed) ? trimmed : resolve(cwd, trimmed);
  try {
    await access(videoPath);
  } catch {
    throw new Error(`Video not found: ${videoPath}`);
  }
  const info = await stat(videoPath);
  if (!info.isFile()) {
    throw new Error(`Not a file: ${videoPath}`);
  }
  const ext = extname(videoPath).toLowerCase();
  if (!VIDEO_EXT_SET.has(ext)) {
    throw new Error(
      `Unsupported video type "${ext || "(none)"}". Supported: ${VIDEO_EXTENSIONS.join(", ")}`,
    );
  }
  const workDir = await ensureWorkDir(opts.workDir);
  return { videoPath, workDir, fromUrl: false, original: trimmed };
}
