import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import type { Context, PublicAPI } from "@wox-launcher/wox-plugin";
import {
  CapturedImage,
  ClipboardImageProvider,
  I18nError,
  ScreenshotCaptureMethod,
  ScreenshotProvider,
} from "./types";

const execFileAsync = promisify(execFile);

export class PlatformUnsupportedError extends Error {
  public readonly i18nKey: string;
  public readonly i18nParams: Record<string, string>;

  constructor(
    key: string,
    params: Record<string, string> = {},
    fallbackMessage?: string,
  ) {
    super(fallbackMessage || key);
    this.name = "PlatformUnsupportedError";
    this.i18nKey = key;
    this.i18nParams = params;
  }
}

export interface ScriptPlatformOptions {
  pluginDirectory: string;
  api?: PublicAPI;
  cacheDirectory?: string;
}

interface CaptureScreenshotResult {
  status?: "completed" | "cancelled" | "failed";
  screenshotPath?: string;
  errorMessage?: string;
}

interface WoxRestResponse<T> {
  Success?: boolean;
  Message?: string;
  Data?: T;
}

function cachePath(cacheDirectory: string, prefix: string): string {
  mkdirSync(cacheDirectory, { recursive: true });
  return join(
    cacheDirectory,
    `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}.png`,
  );
}

async function runPowerShellJson(
  scriptPath: string,
  outputPath: string,
  extraArgs: string[] = [],
): Promise<{
  status?: string;
  path?: string;
  message?: string;
  stdout: string;
  code: number | null;
}> {
  const powershell = process.env.SystemRoot
    ? join(
        process.env.SystemRoot,
        "System32",
        "WindowsPowerShell",
        "v1.0",
        "powershell.exe",
      )
    : "powershell.exe";
  try {
    const result = await execFileAsync(
      powershell,
      [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-STA",
        "-File",
        scriptPath,
        "-OutputPath",
        outputPath,
        ...extraArgs,
      ],
      {
        windowsHide: true,
        timeout: 10 * 60 * 1000,
      },
    );
    const parsed = parseScriptJson(result.stdout);
    return { ...parsed, stdout: result.stdout, code: 0 };
  } catch (error) {
    const maybe = error as {
      stdout?: string;
      code?: number | null;
      message?: string;
    };
    const parsed = parseScriptJson(maybe.stdout || "");
    return {
      ...parsed,
      stdout: maybe.stdout || "",
      code: maybe.code ?? 1,
      message: parsed.message || maybe.message,
    };
  }
}

function parseScriptJson(stdout: string): {
  status?: string;
  path?: string;
  message?: string;
} {
  const lines = stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const last = lines[lines.length - 1] || "";
  if (last === "") {
    return {};
  }
  try {
    return JSON.parse(last) as {
      status?: string;
      path?: string;
      message?: string;
    };
  } catch {
    return { message: stdout.trim() };
  }
}

function getWoxServerPort(): number {
  const lockPath = join(homedir(), ".wox", "wox.lock");
  const raw = readFileSync(lockPath, "utf8").trim();
  const port = Number.parseInt(raw, 10);
  if (!Number.isFinite(port) || port <= 0) {
    throw new Error(`Invalid Wox server port in ${lockPath}: ${raw}`);
  }
  return port;
}

export class WindowsScreenshotProvider implements ScreenshotProvider {
  private readonly pluginDirectory: string;
  private readonly cacheDirectory: string;
  private readonly api?: PublicAPI;

  constructor(options: ScriptPlatformOptions) {
    this.pluginDirectory = options.pluginDirectory;
    this.api = options.api;
    this.cacheDirectory =
      options.cacheDirectory || join(tmpdir(), "wox-screenshot-ocr");
  }

  async captureRegion(
    ctx: Context,
    skipConfirm = false,
  ): Promise<CapturedImage | null> {
    const outputPath = cachePath(this.cacheDirectory, "capture");
    const scriptPath = join(
      this.pluginDirectory,
      "scripts",
      "capture-windows.ps1",
    );
    const args: string[] = [];
    if (skipConfirm) {
      args.push("-SkipConfirm");
    }
    await this.api?.HideApp(ctx);
    const result = await runPowerShellJson(scriptPath, outputPath, args);
    if (result.status === "cancelled") {
      return null;
    }
    if (result.status !== "ok" || !result.path || !existsSync(result.path)) {
      throw new I18nError(
        "error_windows_capture_failed",
        { message: result.message || "Windows screenshot capture failed." },
        result.message || "Windows screenshot capture failed.",
      );
    }
    return { path: result.path, source: "capture" };
  }
}

export class WoxScreenshotProvider implements ScreenshotProvider {
  async captureRegion(): Promise<CapturedImage | null> {
    // Use Wox's existing local screenshot trigger endpoint so OCR keeps its current query and
    // never rewrites the input to "screenshot new" or synthesizes Enter into the launcher.
    const port = getWoxServerPort();
    const response = await fetch(
      `http://127.0.0.1:${port}/test/trigger/screenshot`,
      { method: "POST" },
    );
    const payload =
      (await response.json()) as WoxRestResponse<CaptureScreenshotResult>;
    if (!payload.Success) {
      throw new I18nError(
        "error_wox_screenshot_trigger_unavailable",
        { message: payload.Message || response.statusText },
        payload.Message || response.statusText,
      );
    }

    const result = payload.Data || {};
    if (result.status === "cancelled") {
      return null;
    }
    if (
      result.status !== "completed" ||
      !result.screenshotPath ||
      !existsSync(result.screenshotPath)
    ) {
      throw new I18nError(
        "error_windows_capture_failed",
        { message: result.errorMessage || "Wox Screenshot failed." },
        result.errorMessage || "Wox Screenshot failed.",
      );
    }

    return { path: result.screenshotPath, source: "capture" };
  }
}

export class WindowsClipboardImageProvider implements ClipboardImageProvider {
  private readonly pluginDirectory: string;
  private readonly cacheDirectory: string;

  constructor(options: ScriptPlatformOptions) {
    this.pluginDirectory = options.pluginDirectory;
    this.cacheDirectory =
      options.cacheDirectory || join(tmpdir(), "wox-screenshot-ocr");
  }

  async readImage(): Promise<CapturedImage | null> {
    const outputPath = cachePath(this.cacheDirectory, "clipboard");
    mkdirSync(dirname(outputPath), { recursive: true });
    const scriptPath = join(
      this.pluginDirectory,
      "scripts",
      "read-clipboard-image-windows.ps1",
    );
    const result = await runPowerShellJson(scriptPath, outputPath);
    if (result.status === "empty") {
      return null;
    }
    if (result.status !== "ok" || !result.path || !existsSync(result.path)) {
      throw new I18nError(
        "error_clipboard_read_failed",
        { message: result.message || "Failed to read image from clipboard." },
        result.message || "Failed to read image from clipboard.",
      );
    }
    return { path: result.path, source: "clipboard" };
  }
}

export class UnsupportedScreenshotProvider implements ScreenshotProvider {
  async captureRegion(): Promise<CapturedImage | null> {
    throw new PlatformUnsupportedError(
      "error_capture_platform_unsupported",
      {},
      "Screenshot capture is implemented for Windows first. macOS/Linux adapters are reserved.",
    );
  }
}

export class UnsupportedClipboardImageProvider
  implements ClipboardImageProvider
{
  async readImage(): Promise<CapturedImage | null> {
    throw new PlatformUnsupportedError(
      "error_clipboard_platform_unsupported",
      {},
      "Clipboard image reading is implemented for Windows first. macOS/Linux adapters are reserved.",
    );
  }
}

export function createScreenshotProvider(
  pluginDirectory: string,
  api: PublicAPI,
  captureMethod: ScreenshotCaptureMethod = "builtin",
): ScreenshotProvider {
  if (process.platform === "win32") {
    if (captureMethod === "wox_screenshot") {
      return new WoxScreenshotProvider();
    }
    return new WindowsScreenshotProvider({ pluginDirectory, api });
  }
  return new UnsupportedScreenshotProvider();
}

export function createClipboardImageProvider(
  pluginDirectory: string,
): ClipboardImageProvider {
  if (process.platform === "win32") {
    return new WindowsClipboardImageProvider({ pluginDirectory });
  }
  return new UnsupportedClipboardImageProvider();
}
