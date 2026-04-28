export class I18nError extends Error {
  constructor(
    public readonly key: string,
    public readonly params: Record<string, string> = {},
    fallbackMessage?: string,
  ) {
    super(fallbackMessage || key);
    this.name = "I18nError";
  }
}

export type ImageSource = "capture" | "clipboard" | "file";

export interface CapturedImage {
  path: string;
  source: ImageSource;
}

export type OcrProviderName =
  | "windows_app_sdk"
  | "snipping_tool"
  | "wechat_qq"
  | "baidu"
  | "youdao"
  | "volcano"
  | "bing"
  | "google_vision"
  | "llm"
  | "offline";

export interface OcrProviderSettingsRow {
  name?: string;
  provider?: string;
  apiKey?: string;
  secretKey?: string;
  appId?: string;
  baseUrl?: string;
  command?: string;
  model?: string;
  region?: string;
}

export interface PluginSettings {
  defaultOcrProvider: OcrProviderName;
  defaultCommand: "translate" | "capture" | "clipboard";
  providerRows: OcrProviderSettingsRow[];
  requestTimeoutMs: number;
  autoTranslateAfterOcr: boolean;
  autoExecuteCommands: boolean;
  skipConfirmAfterSelection: boolean;
  translateQueryPrefix: string;
}

export interface OcrRequest {
  imagePath: string;
  settings: PluginSettings;
  providerRow?: OcrProviderSettingsRow;
  pluginDirectory?: string;
}

export interface OcrResult {
  text: string;
  providerName: string;
  providerKey?: string;
}

export interface OcrProvider {
  name: OcrProviderName;
  recognize(request: OcrRequest): Promise<OcrResult>;
}

export interface ScreenshotProvider {
  captureRegion(skipConfirm?: boolean): Promise<CapturedImage | null>;
}

export interface ClipboardImageProvider {
  readImage(): Promise<CapturedImage | null>;
}
