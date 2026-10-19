import { defaultExecFile, defaultLookPath, firstLine } from "./exec.ts";
import type { DepStatus, DoctorReport, ExecFileFn, LookPathFn, WatchDeps } from "./types.ts";

const FFMPEG_HINT = "brew install ffmpeg  or  apt install ffmpeg";
const YTDLP_HINT = "brew install yt-dlp  or  pip install yt-dlp";
const WHISPER_HINT = "pip install mlx-whisper  or  brew install whisper-cpp";

const WHISPER_CANDIDATES = ["mlx_whisper", "mlx-whisper", "whisper-cli", "whisper.cpp"] as const;

async function probeVersion(
  path: string,
  execFile: ExecFileFn,
  argSets: string[][],
): Promise<string | undefined> {
  for (const args of argSets) {
    try {
      const result = await execFile(path, args, { timeout: 8_000 });
      const line = firstLine(result.stdout) || firstLine(result.stderr);
      if (line) return line.slice(0, 160);
    } catch {
      // try the next flag set
    }
  }
  return undefined;
}

async function probeNamed(
  name: string,
  lookPath: LookPathFn,
  execFile: ExecFileFn,
  argSets: string[][],
  hint: string,
): Promise<DepStatus> {
  const path = await lookPath(name);
  if (!path) {
    return { name, found: false, hint };
  }
  const version = await probeVersion(path, execFile, argSets);
  return { name, found: true, command: name, path, version, hint };
}

async function probeWhisper(lookPath: LookPathFn, execFile: ExecFileFn): Promise<DepStatus> {
  for (const command of WHISPER_CANDIDATES) {
    const path = await lookPath(command);
    if (!path) continue;
    const version = await probeVersion(path, execFile, [["--version"], ["-version"], ["-h"], ["--help"]]);
    return {
      name: "whisper",
      found: true,
      command,
      path,
      version,
      hint: WHISPER_HINT,
    };
  }
  return { name: "whisper", found: false, hint: WHISPER_HINT };
}

export async function checkDeps(deps: WatchDeps = {}): Promise<DoctorReport> {
  const lookPath = deps.lookPath ?? defaultLookPath;
  const execFile = deps.execFile ?? defaultExecFile;

  const [ffmpeg, ffprobe, ytdlp, whisper] = await Promise.all([
    probeNamed("ffmpeg", lookPath, execFile, [["-version"], ["--version"]], FFMPEG_HINT),
    probeNamed("ffprobe", lookPath, execFile, [["-version"], ["--version"]], FFMPEG_HINT),
    probeNamed("yt-dlp", lookPath, execFile, [["--version"], ["-version"]], YTDLP_HINT),
    probeWhisper(lookPath, execFile),
  ]);

  return { ffmpeg, ffprobe, ytdlp, whisper };
}

function mark(found: boolean): string {
  return found ? "ok" : "missing";
}

function detail(dep: DepStatus): string {
  if (!dep.found) return dep.hint ? `— ${dep.hint}` : "";
  const bits = [dep.version, dep.path].filter(Boolean);
  return bits.length ? `— ${bits.join("  ")}` : "";
}

export function formatDoctorReport(report: DoctorReport): string {
  const rows: Array<[string, DepStatus]> = [
    ["ffmpeg", report.ffmpeg],
    ["ffprobe", report.ffprobe],
    ["yt-dlp", report.ytdlp],
    ["whisper", report.whisper],
  ];
  const lines = ["pi-watch doctor", ""];
  for (const [label, dep] of rows) {
    const extra = detail(dep);
    lines.push(`  ${label.padEnd(9)} ${mark(dep.found)}${extra ? `  ${extra}` : ""}`);
  }
  lines.push("");
  if (!report.ffmpeg.found || !report.ffprobe.found) {
    lines.push("ffmpeg/ffprobe are required for /watch. Install ffmpeg, then re-run /watch doctor.");
  }
  if (!report.ytdlp.found) {
    lines.push("yt-dlp is optional for local files; required for http(s) URLs.");
  }
  if (!report.whisper.found) {
    lines.push("Whisper is optional. Without it, /watch still samples frames and uses captions if present.");
  }
  return lines.join("\n");
}

export function doctorSeverity(report: DoctorReport): "info" | "warning" | "error" {
  if (!report.ffmpeg.found || !report.ffprobe.found) return "error";
  if (!report.whisper.found || !report.ytdlp.found) return "warning";
  return "info";
}
