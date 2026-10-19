import { execFile as execFileCb } from "node:child_process";
import { constants } from "node:fs";
import { access } from "node:fs/promises";
import { delimiter, join } from "node:path";
import { promisify } from "node:util";
import type { ExecFileFn, ExecResult, LookPathFn } from "./types.ts";

const execFileP = promisify(execFileCb);

export class CommandNotFoundError extends Error {
  readonly code = "ENOENT";
  readonly command: string;

  constructor(command: string) {
    super(`Command not found: ${command}`);
    this.name = "CommandNotFoundError";
    this.command = command;
  }
}

export const defaultLookPath: LookPathFn = async (command) => {
  if (!command) return null;
  if (command.includes("/") || command.includes("\\")) {
    try {
      await access(command, constants.X_OK);
      return command;
    } catch {
      return null;
    }
  }
  const dirs = (process.env.PATH ?? "").split(delimiter);
  for (const dir of dirs) {
    if (!dir) continue;
    const candidate = join(dir, command);
    try {
      await access(candidate, constants.X_OK);
      return candidate;
    } catch {
      // keep searching
    }
  }
  return null;
};

export const defaultExecFile: ExecFileFn = async (file, args, options = {}) => {
  try {
    const { stdout, stderr } = await execFileP(file, args, {
      encoding: "utf8",
      timeout: options.timeout ?? 120_000,
      maxBuffer: options.maxBuffer ?? 20 * 1024 * 1024,
      cwd: options.cwd,
    });
    return { stdout: String(stdout ?? ""), stderr: String(stderr ?? ""), status: 0 };
  } catch (err) {
    const error = err as NodeJS.ErrnoException & {
      stdout?: string;
      stderr?: string;
      status?: number | null;
    };
    if (error.code === "ENOENT") {
      throw new CommandNotFoundError(file);
    }
    return {
      stdout: String(error.stdout ?? ""),
      stderr: String(error.stderr ?? error.message ?? ""),
      status: typeof error.status === "number" ? error.status : 1,
    };
  }
};

export async function runOrMissing(
  file: string,
  args: string[],
  execFile: ExecFileFn,
  options?: { timeout?: number },
): Promise<ExecResult | null> {
  try {
    return await execFile(file, args, options);
  } catch (err) {
    if (err instanceof CommandNotFoundError || (err as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw err;
  }
}

export function firstLine(text: string): string {
  return text.replace(/\r\n/g, "\n").split("\n").find((line) => line.trim())?.trim() ?? "";
}
