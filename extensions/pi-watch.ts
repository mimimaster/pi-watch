/**
 * pi-watch — sample video frames + transcript into the current pi session.
 *
 * Pi loads this file via `pi.extensions`. Host packages are provided at runtime;
 * types are declared locally so the optional peer does not need to be installed.
 */

import { parseWatchArgs, USAGE } from "../src/cli.ts";
import { checkDeps, doctorSeverity, formatDoctorReport } from "../src/doctor.ts";
import {
  detectVideoPaths,
  resolveExistingVideo,
  shouldHandleDroppedInput,
  stripVideoPath,
} from "../src/drop.ts";
import { buildInjection, formatWatchStatus, injectIntoSession, lastWatch, rememberWatch } from "../src/inject.ts";
import { runWatch } from "../src/pipeline.ts";

type NotifyKind = "info" | "warning" | "error";

interface CommandContext {
  cwd: string;
  ui: {
    notify(message: string, kind?: NotifyKind): void;
    setStatus?(key: string, text: string | undefined): void;
  };
}

interface AutocompleteItem {
  value: string;
  label?: string;
  description?: string;
}

interface InputEvent {
  type?: string;
  text: string;
  images?: unknown[];
  source?: string;
}

type InputEventResult =
  | { action: "continue" }
  | { action: "transform"; text: string; images?: unknown[] }
  | { action: "handled" };

interface PiApi {
  registerCommand(
    name: string,
    options: {
      description?: string;
      getArgumentCompletions?: (argumentPrefix: string) => AutocompleteItem[] | null;
      handler(args: string, ctx: CommandContext): void | Promise<void>;
    },
  ): void;
  on?(
    event: "input",
    handler: (event: InputEvent, ctx: CommandContext) => InputEventResult | Promise<InputEventResult>,
  ): () => void;
  sendUserMessage?(
    content: string | Array<{ type: "text"; text: string } | { type: "image"; data: string; mimeType: string }>,
  ): void;
}

const COMPLETIONS: AutocompleteItem[] = [
  { value: "doctor", description: "Check ffmpeg, yt-dlp, and Whisper binaries" },
  { value: "status", description: "Show the last /watch summary" },
  { value: "--start", description: "Window start (seconds or hh:mm:ss)" },
  { value: "--end", description: "Window end (seconds or hh:mm:ss)" },
];

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function handleDroppedInput(event: InputEvent, ctx: CommandContext): Promise<InputEventResult> {
  if (!shouldHandleDroppedInput(event)) return { action: "continue" };
  const candidates = detectVideoPaths(event.text);
  let videoPath: string | null = null;
  for (const candidate of candidates) {
    videoPath = await resolveExistingVideo(candidate, ctx.cwd);
    if (videoPath) break;
  }
  if (!videoPath) return { action: "continue" };

  ctx.ui.notify("pi-watch: analyzing dropped video…", "info");
  try {
    const result = await runWatch(videoPath, { cwd: ctx.cwd });
    const injection = await buildInjection(result);
    rememberWatch(result);
    ctx.ui.notify(injection.statusText, "info");
    let remaining = event.text;
    for (const candidate of candidates) remaining = stripVideoPath(remaining, candidate);
    const text = [remaining, injection.text].filter(Boolean).join("\n\n");
    return { action: "transform", text, images: injection.images };
  } catch (err) {
    ctx.ui.notify(errorMessage(err), "error");
    return { action: "continue" };
  }
}

export default function piWatch(pi: PiApi): void {
  if (typeof pi.on === "function") {
    pi.on("input", handleDroppedInput);
  }

  pi.registerCommand("watch", {
    description: "Sample video frames and inject a timestamped transcript into this session",
    getArgumentCompletions(argumentPrefix) {
      const prefix = argumentPrefix.trim();
      if (!prefix) return COMPLETIONS;
      return COMPLETIONS.filter(
        (item) => item.value.startsWith(prefix) || (item.label ?? "").startsWith(prefix),
      );
    },
    async handler(args, ctx) {
      try {
        const parsed = parseWatchArgs(args);
        if (parsed.kind === "help") {
          ctx.ui.notify(USAGE, "info");
          return;
        }
        if (parsed.kind === "doctor") {
          const report = await checkDeps();
          ctx.ui.notify(formatDoctorReport(report), doctorSeverity(report));
          return;
        }
        if (parsed.kind === "status") {
          const last = lastWatch();
          ctx.ui.notify(
            last ? formatWatchStatus(last) : "No /watch result in this session yet. Run /watch <path-or-url> first.",
            "info",
          );
          return;
        }

        ctx.ui.notify("pi-watch: sampling frames and transcript…", "info");
        ctx.ui.setStatus?.("pi-watch", "watching…");
        const result = await runWatch(parsed.source, {
          start: parsed.start,
          end: parsed.end,
          cwd: ctx.cwd,
        });
        await injectIntoSession(result, {
          sendUserMessage: pi.sendUserMessage ? (content) => pi.sendUserMessage?.(content) : undefined,
          notify: (message, kind) => ctx.ui.notify(message, kind),
        });
      } catch (err) {
        ctx.ui.notify(errorMessage(err), "error");
      } finally {
        ctx.ui.setStatus?.("pi-watch", undefined);
      }
    },
  });
}
