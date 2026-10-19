export type ParsedWatchArgs =
  | { kind: "help" }
  | { kind: "doctor" }
  | { kind: "status" }
  | { kind: "watch"; source: string; start?: number; end?: number };

export function parseTime(raw: string): number {
  const value = raw.trim();
  if (!value) throw new Error(`Invalid time: ${raw}`);
  if (/^\d+(\.\d+)?$/.test(value)) {
    const seconds = Number.parseFloat(value);
    if (!Number.isFinite(seconds) || seconds < 0) throw new Error(`Invalid time: ${raw}`);
    return seconds;
  }
  const parts = value.split(":");
  if (parts.length < 2 || parts.length > 3 || parts.some((p) => p === "" || !/^\d+(\.\d+)?$/.test(p))) {
    throw new Error(`Invalid time: ${raw} (use seconds or hh:mm:ss)`);
  }
  const nums = parts.map((p) => Number.parseFloat(p));
  const [h, m, s] = nums.length === 3 ? nums : [0, nums[0], nums[1]];
  if (m >= 60 || s >= 60) throw new Error(`Invalid time: ${raw}`);
  return h * 3600 + m * 60 + s;
}

function tokenize(args: string): string[] {
  const tokens: string[] = [];
  const pattern = /"([^"]*)"|'([^']*)'|\S+/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(args)) !== null) {
    tokens.push(match[1] ?? match[2] ?? match[0]);
  }
  return tokens;
}

export const USAGE = [
  "Usage:",
  "  /watch <local-path-or-url> [--start <sec>] [--end <sec>]",
  "  /watch doctor",
  "  /watch status",
].join("\n");

export function parseWatchArgs(args: string): ParsedWatchArgs {
  const tokens = tokenize(args);
  if (tokens.length === 0) return { kind: "help" };

  const first = tokens[0];
  if (first === "doctor" || first === "--doctor") return { kind: "doctor" };
  if (first === "status" || first === "--status") return { kind: "status" };
  if (first === "help" || first === "--help" || first === "-h") return { kind: "help" };

  let start: number | undefined;
  let end: number | undefined;
  const positional: string[] = [];

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    const eq = token.indexOf("=");
    let flag = token;
    let inline: string | undefined;
    if (token.startsWith("--") && eq !== -1) {
      flag = token.slice(0, eq);
      inline = token.slice(eq + 1);
    }
    const takeValue = (): string => {
      if (inline != null && inline !== "") return inline;
      const next = tokens[i + 1];
      if (!next || next.startsWith("--")) throw new Error(`${flag} needs a value`);
      i += 1;
      return next;
    };
    if (flag === "--start") {
      start = parseTime(takeValue());
      continue;
    }
    if (flag === "--end") {
      end = parseTime(takeValue());
      continue;
    }
    if (token.startsWith("--")) {
      throw new Error(`Unknown flag: ${token}`);
    }
    positional.push(token);
  }

  if (positional.length === 0) return { kind: "help" };
  if (positional.length > 1) {
    throw new Error(`Unexpected extra arguments: ${positional.slice(1).join(" ")}`);
  }
  return { kind: "watch", source: positional[0], start, end };
}
