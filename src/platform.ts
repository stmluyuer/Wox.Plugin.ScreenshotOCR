import { execFile } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
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
  cacheDirectory?: string;
}

export interface WoxScreenshotOptions extends ScriptPlatformOptions {
  api: PublicAPI;
}

function cachePath(cacheDirectory: string, prefix: string): string {
  mkdirSync(cacheDirectory, { recursive: true });
  // Include a random suffix so repeated captures never overwrite each other.
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
  // Use Windows PowerShell in STA mode because clipboard and screen capture
  // APIs require a single-threaded apartment.
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
  // Scripts may log progress before printing the final JSON payload.
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

export class WindowsScreenshotProvider implements ScreenshotProvider {
  private readonly pluginDirectory: string;
  private readonly cacheDirectory: string;

  constructor(options: ScriptPlatformOptions) {
    this.pluginDirectory = options.pluginDirectory;
    this.cacheDirectory =
      options.cacheDirectory || join(tmpdir(), "wox-screenshot-ocr");
  }

  async captureRegion(
    _ctx: Context,
    _captureMethod: ScreenshotCaptureMethod,
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
  private readonly api: PublicAPI;
  private readonly fallbackProvider?: WindowsScreenshotProvider;

  constructor(options: WoxScreenshotOptions) {
    this.api = options.api;
    this.fallbackProvider =
      process.platform === "win32"
        ? new WindowsScreenshotProvider(options)
        : undefined;
  }

  async captureRegion(
    ctx: Context,
    captureMethod: ScreenshotCaptureMethod,
    skipConfirm = false,
  ): Promise<CapturedImage | null> {
    const canUseBuiltin = this.fallbackProvider !== undefined;
    if (captureMethod === "builtin" || skipConfirm) {
      if (!canUseBuiltin) {
        throw new PlatformUnsupportedError(
          "error_builtin_capture_platform_unsupported",
          {},
          "The built-in Screenshot OCR selector is only available on Windows. Use Wox Screenshot on this platform.",
        );
      }
      // The script-based overlay needs Wox hidden before it starts capturing.
      if (captureMethod === "wox" && skipConfirm) {
        await this.api.Log(
          ctx,
          "Info",
          "Wox Screenshot API does not expose skip-confirm yet; using the built-in selector for this capture.",
        );
      }
      await this.api.HideApp(ctx);
      return this.fallbackProvider.captureRegion(ctx, "builtin", skipConfirm);
    }

    try {
      if (typeof this.api.Screenshot !== "function") {
        if (!canUseBuiltin) {
          throw new PlatformUnsupportedError(
            "error_wox_screenshot_unavailable",
            {},
            "Wox Screenshot API is not available in this Wox version.",
          );
        }
        // Older Wox versions do not expose the native screenshot API yet.
        await this.api.HideApp(ctx);
        return this.fallbackProvider.captureRegion(ctx, "builtin", skipConfirm);
      }

      const result = await this.api.Screenshot(ctx, {});
      if (!result.Success) {
        if (result.ErrMsg === "cancelled") {
          return null;
        }
        throw new I18nError(
          "error_wox_screenshot_failed",
          { message: result.ErrMsg || "Wox screenshot failed." },
          result.ErrMsg || "Wox screenshot failed.",
        );
      }
      if (!result.ScreenshotPath || !existsSync(result.ScreenshotPath)) {
        throw new I18nError(
          "error_wox_screenshot_failed",
          { message: "Wox screenshot completed without an image path." },
          "Wox screenshot completed without an image path.",
        );
      }
      return { path: result.ScreenshotPath, source: "capture" };
    } catch (error) {
      if (error instanceof I18nError) {
        throw error;
      }
      if (error instanceof PlatformUnsupportedError) {
        throw error;
      }
      if (!canUseBuiltin) {
        throw error;
      }
      // Unexpected native API failures fall back to the bundled script path.
      await this.api.HideApp(ctx);
      return this.fallbackProvider.captureRegion(ctx, "builtin", skipConfirm);
    }
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
): ScreenshotProvider {
  return new WoxScreenshotProvider({ pluginDirectory, api });
}

export function createClipboardImageProvider(
  pluginDirectory: string,
): ClipboardImageProvider {
  if (process.platform === "win32") {
    return new WindowsClipboardImageProvider({ pluginDirectory });
  }
  return new UnsupportedClipboardImageProvider();
}
