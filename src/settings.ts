import { Context, PublicAPI } from "@wox-launcher/wox-plugin";
import {
  OcrProviderName,
  OcrProviderSettingsRow,
  PluginSettings,
  ScreenshotCaptureMethod,
} from "./types";

export const DEFAULT_SETTINGS: PluginSettings = {
  defaultOcrProvider: "windows_app_sdk",
  defaultCommand: "translate",
  screenshotCaptureMethod: "builtin",
  woxScreenshotHotkey: "",
  providerRows: [],
  requestTimeoutMs: 15000,
  autoTranslateAfterOcr: false,
  autoExecuteCommands: false,
  skipConfirmAfterSelection: false,
  translateQueryPrefix: "tr",
};

const VALID_PROVIDERS: OcrProviderName[] = [
  "windows_app_sdk",
  "snipping_tool",
  "wechat_qq",
  "baidu",
  "youdao",
  "volcano",
  "bing",
  "google_vision",
  "llm",
  "offline",
];

const FREE_OCR_PROVIDERS: OcrProviderName[] = [
  "windows_app_sdk",
  "snipping_tool",
  "wechat_qq",
];

const SCREENSHOT_CAPTURE_METHODS: ScreenshotCaptureMethod[] = [
  "builtin",
  "wox_screenshot",
];

export function normalizeOcrProvider(value: string): OcrProviderName {
  return VALID_PROVIDERS.includes(value as OcrProviderName)
    ? (value as OcrProviderName)
    : DEFAULT_SETTINGS.defaultOcrProvider;
}

export function normalizeFreeOcrProvider(value: string): OcrProviderName {
  return FREE_OCR_PROVIDERS.includes(value as OcrProviderName)
    ? (value as OcrProviderName)
    : DEFAULT_SETTINGS.defaultOcrProvider;
}

export function normalizeScreenshotCaptureMethod(
  value: string,
): ScreenshotCaptureMethod {
  return SCREENSHOT_CAPTURE_METHODS.includes(value as ScreenshotCaptureMethod)
    ? (value as ScreenshotCaptureMethod)
    : DEFAULT_SETTINGS.screenshotCaptureMethod;
}

export function parseProviderRows(value: string): OcrProviderSettingsRow[] {
  if (value.trim() === "") {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((item): item is OcrProviderSettingsRow => {
      if (typeof item !== "object" || item === null) {
        return false;
      }
      const row = item as OcrProviderSettingsRow;
      return (
        typeof row.provider === "string" &&
        VALID_PROVIDERS.includes(row.provider as OcrProviderName)
      );
    });
  } catch {
    return [];
  }
}

export async function getSetting(
  api: PublicAPI,
  ctx: Context,
  key: string,
  fallback: string,
): Promise<string> {
  try {
    const value = await api.GetSetting(ctx, key);
    return value.trim() === "" ? fallback : value.trim();
  } catch {
    return fallback;
  }
}

export async function loadSettings(
  api: PublicAPI,
  ctx: Context,
): Promise<PluginSettings> {
  const timeoutRaw = await getSetting(
    api,
    ctx,
    "request_timeout_ms",
    String(DEFAULT_SETTINGS.requestTimeoutMs),
  );
  const timeoutMs = Number.parseInt(timeoutRaw, 10);

  const defaultCommand = await getSetting(
    api,
    ctx,
    "default_command",
    "translate",
  );
  const validCommands = ["translate", "capture", "clipboard"];
  const safeDefaultCommand = validCommands.includes(defaultCommand)
    ? (defaultCommand as "translate" | "capture" | "clipboard")
    : DEFAULT_SETTINGS.defaultCommand;
  const legacyProvider = await getSetting(
    api,
    ctx,
    "default_ocr_provider",
    DEFAULT_SETTINGS.defaultOcrProvider,
  );
  const serviceTypeFallback = legacyProvider === "llm" ? "llm" : "free";
  const serviceType = await getSetting(
    api,
    ctx,
    "ocr_service_type",
    serviceTypeFallback,
  );
  const freeProvider = await getSetting(
    api,
    ctx,
    "default_free_ocr_provider",
    legacyProvider,
  );

  return {
    defaultOcrProvider:
      serviceType === "llm" ? "llm" : normalizeFreeOcrProvider(freeProvider),
    defaultCommand: safeDefaultCommand,
    screenshotCaptureMethod: normalizeScreenshotCaptureMethod(
      await getSetting(
        api,
        ctx,
        "screenshot_capture_method",
        DEFAULT_SETTINGS.screenshotCaptureMethod,
      ),
    ),
    woxScreenshotHotkey: await getSetting(
      api,
      ctx,
      "wox_screenshot_hotkey",
      DEFAULT_SETTINGS.woxScreenshotHotkey,
    ),
    providerRows: parseProviderRows(
      await getSetting(api, ctx, "ocr_provider_table", "[]"),
    ),
    requestTimeoutMs:
      Number.isFinite(timeoutMs) && timeoutMs > 0
        ? timeoutMs
        : DEFAULT_SETTINGS.requestTimeoutMs,
    autoTranslateAfterOcr:
      (await getSetting(
        api,
        ctx,
        "auto_translate_after_ocr",
        String(DEFAULT_SETTINGS.autoTranslateAfterOcr),
      )) === "true",
    autoExecuteCommands:
      (await getSetting(
        api,
        ctx,
        "auto_execute_commands",
        String(DEFAULT_SETTINGS.autoExecuteCommands),
      )) === "true",
    skipConfirmAfterSelection:
      (await getSetting(
        api,
        ctx,
        "skip_confirm_after_selection",
        String(DEFAULT_SETTINGS.skipConfirmAfterSelection),
      )) === "true",
    translateQueryPrefix:
      (
        await getSetting(
          api,
          ctx,
          "translate_query_prefix",
          DEFAULT_SETTINGS.translateQueryPrefix,
        )
      ).trim() || DEFAULT_SETTINGS.translateQueryPrefix,
  };
}

export function findProviderRow(
  settings: PluginSettings,
  provider: OcrProviderName,
): OcrProviderSettingsRow | undefined {
  return settings.providerRows.find((row) => row.provider === provider);
}
