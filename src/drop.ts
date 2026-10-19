import { access } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { VIDEO_EXTENSIONS, isUrl, normalizePathInput } from "./resolve-source.ts";

const EXT_GROUP = VIDEO_EXTENSIONS.map((ext) => ext.slice(1)).join("|");
const VIDEO_TOKEN = new RegExp(
  String.raw`(?:"([^"\n]+\.(?:${EXT_GROUP}))"|'([^'\n]+\.(?:${EXT_GROUP}))'|((?:\\ |[^\s])+\.(?:${EXT_GROUP})))`,
  "gi",
);

export function detectVideoPaths(text: string): string[] {
  const found: string[] = [];
  const seen = new Set<string>();
  for (const match of text.matchAll(VIDEO_TOKEN)) {
    const raw = match[1] ?? match[2] ?? match[3] ?? "";
    const path = normalizePathInput(raw.replace(/\\ /g, " "));
    if (!path || isUrl(path) || seen.has(path)) continue;
    seen.add(path);
    found.push(path);
  }
  return found;
}

export function stripVideoPath(text: string, path: string): string {
  const escaped = path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const quoted = new RegExp(`["']${escaped}["']`, "g");
  const plain = new RegExp(escaped.replaceAll(" ", String.raw`(?:\\ | )`), "g");
  return text.replace(quoted, " ").replace(plain, " ").replace(/\s+/g, " ").trim();
}

export async function resolveExistingVideo(path: string, cwd: string): Promise<string | null> {
  const candidate = isAbsolute(path) ? path : resolve(cwd, path);
  try {
    await access(candidate);
    return candidate;
  } catch {
    return null;
  }
}

export function shouldHandleDroppedInput(event: { text: string; source?: string; images?: unknown[] }): boolean {
  if (event.source && event.source !== "interactive") return false;
  if (event.images && event.images.length > 0) return false;
  if (/^\s*\/watch\b/.test(event.text)) return false;
  return detectVideoPaths(event.text).length > 0;
}
