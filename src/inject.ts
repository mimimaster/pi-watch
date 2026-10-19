import { readFile } from "node:fs/promises";
import type { ImageContent, UserContent, WatchResult } from "./types.ts";

let lastResult: WatchResult | null = null;

export function rememberWatch(result: WatchResult | null): void {
  lastResult = result;
}

export function lastWatch(): WatchResult | null {
  return lastResult;
}

export function formatTimestamp(seconds: number): string {
  const abs = Math.max(0, seconds);
  const h = Math.floor(abs / 3600);
  const m = Math.floor((abs % 3600) / 60);
  const s = abs % 60;
  const whole = Math.floor(s);
  const frac = Math.round((s - whole) * 100);
  const ss = `${String(whole).padStart(2, "0")}.${String(frac).padStart(2, "0")}`;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${ss}`;
  return `${m}:${ss}`;
}

export function formatTranscript(result: WatchResult): string {
  if (result.transcript.segments.length === 0) {
    return result.transcript.note ?? "(no transcript)";
  }
  return result.transcript.segments
    .map((seg) => `[${formatTimestamp(seg.start)}–${formatTimestamp(seg.end)}] ${seg.text}`)
    .join("\n");
}

export function formatFrameIndex(result: WatchResult): string {
  if (result.frames.length === 0) return "(no frames)";
  return result.frames
    .map((frame, i) => `- frame ${i + 1}: t=${formatTimestamp(frame.tSec)}  ${frame.path}`)
    .join("\n");
}

export function formatWatchStatus(result: WatchResult): string {
  const elapsed = (result.elapsedMs / 1000).toFixed(1);
  const cues = result.transcript.segments.length;
  const lines = [
    `Last /watch: ${result.source}`,
    `  ${result.frames.length} frames (~${result.plan.width}px), window ${formatTimestamp(result.window.start)}–${formatTimestamp(result.window.end)}, ${elapsed}s`,
    `  transcript: ${result.transcript.source}${cues ? ` (${cues} cues)` : ""}`,
  ];
  if (result.transcript.note) lines.push(`  ${result.transcript.note}`);
  return lines.join("\n");
}

export function buildWatchText(result: WatchResult): string {
  const transcript = formatTranscript(result);
  return [
    "Analyze this video using the timestamped transcript and sampled frames.",
    "Each attached image (or file path below) is a JPEG frame labeled by timestamp. If images are not visible, Read the listed files.",
    "",
    `Video source: ${result.source}`,
    `Local file: ${result.videoPath}`,
    `Duration: ${formatTimestamp(result.durationSec)}; window ${formatTimestamp(result.window.start)}–${formatTimestamp(result.window.end)}`,
    `Frames: ${result.frames.length} JPEG @ ~${result.plan.width}px`,
    `Transcript source: ${result.transcript.source}`,
    result.transcript.note ? `Note: ${result.transcript.note}` : "",
    "",
    "## Transcript",
    transcript,
    "",
    "## Sampled frames",
    formatFrameIndex(result),
  ]
    .filter((line) => line !== "")
    .join("\n");
}

export async function loadFrameImages(result: WatchResult): Promise<ImageContent[]> {
  const images: ImageContent[] = [];
  for (const frame of result.frames) {
    const buf = await readFile(frame.path);
    images.push({
      type: "image",
      data: buf.toString("base64"),
      mimeType: "image/jpeg",
    });
  }
  return images;
}

export interface InjectionPayload {
  text: string;
  images: ImageContent[];
  parts: UserContent[];
  statusText: string;
}

export async function buildInjection(result: WatchResult): Promise<InjectionPayload> {
  const text = buildWatchText(result);
  let images: ImageContent[] = [];
  try {
    images = await loadFrameImages(result);
  } catch {
    images = [];
  }
  const parts: UserContent[] = [{ type: "text", text }, ...images];
  return { text, images, parts, statusText: formatWatchStatus(result) };
}

export interface InjectApi {
  sendUserMessage?: (content: string | UserContent[]) => void;
  notify?: (message: string, kind?: "info" | "warning" | "error") => void;
}

export async function injectIntoSession(
  result: WatchResult,
  api: InjectApi,
): Promise<{ usedImages: boolean; text: string; statusText: string }> {
  rememberWatch(result);
  const payload = await buildInjection(result);
  api.notify?.(payload.statusText, "info");

  const send = api.sendUserMessage;
  if (!send) {
    return { usedImages: false, text: payload.text, statusText: payload.statusText };
  }

  if (payload.images.length > 0) {
    try {
      send(payload.parts);
      return { usedImages: true, text: payload.text, statusText: payload.statusText };
    } catch {
      const fallback = `${payload.text}\n\n(Image parts were not accepted by this pi build. Read the frame file paths above.)`;
      send(fallback);
      return { usedImages: false, text: fallback, statusText: payload.statusText };
    }
  }

  send(payload.text);
  return { usedImages: false, text: payload.text, statusText: payload.statusText };
}
