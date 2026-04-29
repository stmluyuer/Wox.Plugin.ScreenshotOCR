import { createHash, createHmac, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { release } from "node:os";
import { basename, extname, join } from "node:path";
import { promisify } from "node:util";
import {
  I18nError,
  OcrProvider,
  OcrProviderName,
  OcrProviderSettingsRow,
  OcrRequest,
  OcrResult,
} from "./types";

const execFileAsync = promisify(execFile);

function requireConfig(
  value: string | undefined,
  key: string,
  fallbackMessage: string,
): string {
  if (!value || value.trim() === "") {
    throw new I18nError(key, {}, fallbackMessage);
  }
  return value.trim();
}

function imageBase64(path: string): string {
  return readFileSync(path).toString("base64");
}

const IMAGE_MIME_BY_EXTENSION: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".jfif": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".bmp": "image/bmp",
  ".tif": "image/tiff",
  ".tiff": "image/tiff",
  ".avif": "image/avif",
  ".heic": "image/heic",
  ".heif": "image/heif",
};

function imageMimeType(path: string, bytes: Buffer): string {
  // Prefer byte signatures over file extensions because clipboard captures may
  // use temporary names that do not reflect the real image type.
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes.subarray(1, 4).toString("ascii") === "PNG"
  ) {
    return "image/png";
  }
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 6 &&
    ["GIF87a", "GIF89a"].includes(bytes.subarray(0, 6).toString("ascii"))
  ) {
    return "image/gif";
  }
  if (
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
    bytes.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }
  if (bytes.length >= 2 && bytes[0] === 0x42 && bytes[1] === 0x4d) {
    return "image/bmp";
  }
  if (
    bytes.length >= 4 &&
    ((bytes[0] === 0x49 &&
      bytes[1] === 0x49 &&
      bytes[2] === 0x2a &&
      bytes[3] === 0x00) ||
      (bytes[0] === 0x4d &&
        bytes[1] === 0x4d &&
        bytes[2] === 0x00 &&
        bytes[3] === 0x2a))
  ) {
    return "image/tiff";
  }

  return IMAGE_MIME_BY_EXTENSION[extname(path).toLowerCase()] || "image/png";
}

export function imageDataUrl(path: string): string {
  const bytes = readFileSync(path);
  return `data:${imageMimeType(path, bytes)};base64,${bytes.toString("base64")}`;
}

async function parseJsonResponse(
  response: Response,
  providerName: string,
): Promise<unknown> {
  const body = await response.text();
  if (!response.ok) {
    throw new I18nError(
      "error_provider_request_failed",
      { provider: providerName, status: String(response.status), body },
      `${providerName} request failed with ${response.status}: ${body}`,
    );
  }
  try {
    return JSON.parse(body) as unknown;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new I18nError(
      "error_provider_invalid_json",
      { provider: providerName, message },
      `${providerName} returned invalid JSON: ${message}`,
    );
  }
}

export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function compactLines(lines: Array<string | undefined | null>): string {
  // OCR providers often return sparse line arrays; normalize them once here.
  return lines
    .map((line) => (line || "").trim())
    .filter(Boolean)
    .join("\n");
}

function ensureWin(key: string, fallbackMessage: string): void {
  if (process.platform !== "win32") {
    throw new I18nError(key, {}, fallbackMessage);
  }
}

function ensureWin10(key: string, fallbackMessage: string): void {
  ensureWin(key, fallbackMessage);
  const major = Number.parseInt(release().split(".")[0] || "0", 10);
  if (!Number.isFinite(major) || major < 10) {
    throw new I18nError(key, {}, fallbackMessage);
  }
}

function parseOcrStdout(stdout: string, providerName: string): string {
  const text = stdout.trim();
  if (text === "") return "";

  let parsed:
    | {
        text?: string;
        lines?: Array<string | { text?: string }>;
        texts?: string[];
        result?: string;
        status?: string;
        message?: string;
      }
    | undefined;
  try {
    parsed = JSON.parse(text) as {
      text?: string;
      lines?: Array<string | { text?: string }>;
      texts?: string[];
      result?: string;
      status?: string;
      message?: string;
    };
  } catch {
    // Custom local commands may return plain text instead of structured JSON.
    return text;
  }

  if (parsed) {
    if (parsed.status && parsed.status !== "ok") {
      throw new I18nError(
        "error_provider_failed",
        {
          provider: providerName,
          message: parsed.message || `${providerName} failed.`,
        },
        parsed.message || `${providerName} failed.`,
      );
    }
    if (typeof parsed.text === "string") return parsed.text.trim();
    if (typeof parsed.result === "string") return parsed.result.trim();
    if (Array.isArray(parsed.texts)) return compactLines(parsed.texts);
    if (Array.isArray(parsed.lines)) {
      return compactLines(
        parsed.lines.map((line) =>
          typeof line === "string" ? line : line.text,
        ),
      );
    }
  }

  return text;
}

async function runLocalCommandOcr(
  command: string,
  imagePath: string,
  timeoutMs: number,
  providerName: string,
): Promise<OcrResult> {
  const result = await runExecutable(command, [imagePath], timeoutMs);
  return {
    text: parseOcrStdout(result.stdout, providerName),
    providerName,
  };
}

async function runExecutable(
  command: string,
  args: string[],
  timeoutMs: number,
): Promise<{ stdout: string; stderr: string }> {
  try {
    return await execFileAsync(command, args, {
      windowsHide: true,
      timeout: timeoutMs,
      maxBuffer: 16 * 1024 * 1024,
    });
  } catch (error) {
    const maybe = error as {
      stdout?: string;
      stderr?: string;
      message?: string;
    };
    if (maybe.stdout?.trim()) {
      // Some OCR helpers exit non-zero while still writing usable recognition.
      return { stdout: maybe.stdout, stderr: maybe.stderr || "" };
    }
    throw new I18nError(
      "error_command_failed",
      {
        provider: command,
        message: maybe.stderr?.trim() || maybe.message || String(error),
      },
      maybe.stderr?.trim() || maybe.message || String(error),
    );
  }
}

async function runBundledWindowsOcr(
  pluginDirectory: string | undefined,
  imagePath: string,
  timeoutMs: number,
  providerName: string,
): Promise<OcrResult> {
  // The packaged helper gives Windows-native OCR without requiring users to
  // configure a separate command-line tool.
  const exePath = join(
    requireConfig(
      pluginDirectory,
      "error_plugin_directory_required",
      "Plugin directory is required for Windows local OCR.",
    ),
    "bin",
    "WindowsOcr",
    "WindowsOcr.exe",
  );
  if (!existsSync(exePath)) {
    throw new I18nError(
      "error_windows_ocr_helper_missing",
      { path: exePath },
      `Windows local OCR helper was not found: ${exePath}`,
    );
  }
  const result = await runExecutable(exePath, [imagePath], timeoutMs);
  return {
    text: parseOcrStdout(result.stdout, providerName),
    providerName,
  };
}

export class WindowsAppSdkOcrProvider implements OcrProvider {
  name: OcrProviderName = "windows_app_sdk";

  async recognize(request: OcrRequest): Promise<OcrResult> {
    ensureWin10(
      "error_windows_app_sdk_requires_windows",
      "Windows App SDK local OCR requires Windows 10 or Windows 11.",
    );
    return runBundledWindowsOcr(
      request.pluginDirectory,
      request.imagePath,
      request.settings.requestTimeoutMs,
      "Windows App SDK local OCR",
    );
  }
}

export class SnippingToolOcrProvider implements OcrProvider {
  name: OcrProviderName = "snipping_tool";

  async recognize(request: OcrRequest): Promise<OcrResult> {
    ensureWin10(
      "error_snipping_tool_requires_windows",
      "Snipping Tool OCR requires Windows 10 or Windows 11.",
    );
    const command = request.providerRow?.command?.trim();
    if (command) {
      // Advanced users can override the bundled helper with their own adapter.
      return runLocalCommandOcr(
        command,
        request.imagePath,
        request.settings.requestTimeoutMs,
        "Snipping Tool OCR",
      );
    }

    return runBundledWindowsOcr(
      request.pluginDirectory,
      request.imagePath,
      request.settings.requestTimeoutMs,
      "Snipping Tool OCR",
    );
  }
}

export class WechatQqOcrProvider implements OcrProvider {
  name: OcrProviderName = "wechat_qq";

  async recognize(request: OcrRequest): Promise<OcrResult> {
    ensureWin(
      "error_wechat_qq_requires_windows",
      "WeChat/QQ OCR requires Windows with WeChat or QQ installed.",
    );
    const command = request.providerRow?.command?.trim();
    if (command) {
      return runLocalCommandOcr(
        command,
        request.imagePath,
        request.settings.requestTimeoutMs,
        "WeChat/QQ OCR",
      );
    }

    return runBundledWindowsOcr(
      request.pluginDirectory,
      request.imagePath,
      request.settings.requestTimeoutMs,
      "WeChat/QQ OCR",
    );
  }
}

export class BaiduOcrProvider implements OcrProvider {
  name: OcrProviderName = "baidu";

  async recognize(request: OcrRequest): Promise<OcrResult> {
    const row = request.providerRow;
    const apiKey = requireConfig(
      row?.apiKey,
      "error_baidu_api_key_required",
      "Baidu OCR API key is required.",
    );
    const secretKey = requireConfig(
      row?.secretKey,
      "error_baidu_secret_key_required",
      "Baidu OCR secret key is required.",
    );
    const tokenUrl = `https://aip.baidubce.com/oauth/2.0/token?grant_type=client_credentials&client_id=${encodeURIComponent(apiKey)}&client_secret=${encodeURIComponent(secretKey)}`;
    const tokenResponse = await fetchWithTimeout(
      tokenUrl,
      { method: "POST" },
      request.settings.requestTimeoutMs,
    );
    const tokenJson = (await parseJsonResponse(
      tokenResponse,
      "Baidu token",
    )) as { access_token?: string };
    const accessToken = requireConfig(
      tokenJson.access_token,
      "error_baidu_access_token_missing",
      "Baidu OCR did not return an access token.",
    );

    // Baidu requires a short-lived OAuth token before the OCR request.
    const body = new URLSearchParams();
    body.set("image", imageBase64(request.imagePath));
    const response = await fetchWithTimeout(
      `https://aip.baidubce.com/rest/2.0/ocr/v1/general_basic?access_token=${encodeURIComponent(accessToken)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      },
      request.settings.requestTimeoutMs,
    );
    const json = (await parseJsonResponse(response, "Baidu OCR")) as {
      words_result?: Array<{ words?: string }>;
      error_msg?: string;
    };
    if (json.error_msg) {
      throw new I18nError(
        "error_provider_failed",
        { provider: "Baidu OCR", message: json.error_msg },
        `Baidu OCR failed: ${json.error_msg}`,
      );
    }
    return {
      text: compactLines(json.words_result?.map((item) => item.words) || []),
      providerName: "Baidu OCR",
    };
  }
}

function truncateForYoudao(input: string): string {
  if (input.length <= 20) return input;
  return `${input.slice(0, 10)}${input.length}${input.slice(-10)}`;
}

export class YoudaoOcrProvider implements OcrProvider {
  name: OcrProviderName = "youdao";

  async recognize(request: OcrRequest): Promise<OcrResult> {
    const row = request.providerRow;
    const appKey = requireConfig(
      row?.apiKey || row?.appId,
      "error_youdao_app_key_required",
      "Youdao OCR app key is required.",
    );
    const secretKey = requireConfig(
      row?.secretKey,
      "error_youdao_secret_key_required",
      "Youdao OCR secret key is required.",
    );
    const img = imageBase64(request.imagePath);
    const salt = randomUUID();
    const curtime = Math.floor(Date.now() / 1000).toString();
    // Youdao v3 signing hashes a shortened image payload for large inputs.
    const sign = createHash("sha256")
      .update(`${appKey}${truncateForYoudao(img)}${salt}${curtime}${secretKey}`)
      .digest("hex");
    const body = new URLSearchParams({
      img,
      langType: "auto",
      detectType: "10012",
      imageType: "1",
      appKey,
      salt,
      sign,
      signType: "v3",
      curtime,
      docType: "json",
    });

    const response = await fetchWithTimeout(
      "https://openapi.youdao.com/ocrapi",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      },
      request.settings.requestTimeoutMs,
    );
    const json = (await parseJsonResponse(response, "Youdao OCR")) as {
      errorCode?: string;
      Result?: { regions?: Array<{ lines?: Array<{ text?: string }> }> };
      resRegions?: Array<{ lines?: Array<{ text?: string }> }>;
    };
    if (json.errorCode && json.errorCode !== "0") {
      throw new I18nError(
        "error_youdao_failed",
        { code: json.errorCode },
        `Youdao OCR failed with errorCode ${json.errorCode}.`,
      );
    }
    const regions = json.Result?.regions || json.resRegions || [];
    return {
      text: compactLines(
        regions.flatMap(
          (region) => region.lines?.map((line) => line.text) || [],
        ),
      ),
      providerName: "Youdao OCR",
    };
  }
}

function hmac(key: Buffer | string, value: string): Buffer {
  return createHmac("sha256", key).update(value).digest();
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export class VolcanoOcrProvider implements OcrProvider {
  name: OcrProviderName = "volcano";

  async recognize(request: OcrRequest): Promise<OcrResult> {
    const row = request.providerRow;
    const accessKey = requireConfig(
      row?.apiKey,
      "error_volcano_access_key_required",
      "Volcano OCR access key is required.",
    );
    const secretKey = requireConfig(
      row?.secretKey,
      "error_volcano_secret_key_required",
      "Volcano OCR secret key is required.",
    );
    const region = row?.region?.trim() || "cn-north-1";
    const host =
      row?.baseUrl?.replace(/^https?:\/\//, "").replace(/\/+$/, "") ||
      "visual.volcengineapi.com";
    const endpoint = `https://${host}/`;
    const payload = JSON.stringify({
      image_base64: imageBase64(request.imagePath),
    });
    const now = new Date();
    const date = now.toISOString().slice(0, 10).replace(/-/g, "");
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
    const credentialScope = `${date}/${region}/cv/request`;
    const query = "Action=OCRNormal&Version=2020-08-26";
    const signedHeaders = "content-type;host;x-content-sha256;x-date";
    const payloadHash = sha256Hex(payload);
    // Volcengine uses an AWS-style canonical request and derived signing key.
    const canonicalRequest = [
      "POST",
      "/",
      query,
      `content-type:application/json\nhost:${host}\nx-content-sha256:${payloadHash}\nx-date:${amzDate}\n`,
      signedHeaders,
      payloadHash,
    ].join("\n");
    const stringToSign = [
      "HMAC-SHA256",
      amzDate,
      credentialScope,
      sha256Hex(canonicalRequest),
    ].join("\n");
    const signingKey = hmac(
      hmac(hmac(hmac(secretKey, date), region), "cv"),
      "request",
    );
    const signature = createHmac("sha256", signingKey)
      .update(stringToSign)
      .digest("hex");
    const authorization = `HMAC-SHA256 Credential=${accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    const response = await fetchWithTimeout(
      `${endpoint}?${query}`,
      {
        method: "POST",
        headers: {
          Authorization: authorization,
          "Content-Type": "application/json",
          Host: host,
          "X-Content-Sha256": payloadHash,
          "X-Date": amzDate,
        },
        body: payload,
      },
      request.settings.requestTimeoutMs,
    );
    const json = (await parseJsonResponse(response, "Volcano OCR")) as {
      code?: number;
      message?: string;
      data?: {
        line_texts?: string[];
        lines?: Array<{ text?: string }>;
        text?: string;
      };
      ResponseMetadata?: { Error?: { Message?: string } };
    };
    if (json.ResponseMetadata?.Error?.Message) {
      throw new I18nError(
        "error_provider_failed",
        {
          provider: "Volcano OCR",
          message: json.ResponseMetadata.Error.Message,
        },
        `Volcano OCR failed: ${json.ResponseMetadata.Error.Message}`,
      );
    }
    if (json.code && json.code !== 10000) {
      throw new I18nError(
        "error_provider_failed",
        { provider: "Volcano OCR", message: String(json.message || json.code) },
        `Volcano OCR failed: ${json.message || json.code}`,
      );
    }
    return {
      text:
        json.data?.text ||
        compactLines(
          json.data?.line_texts ||
            json.data?.lines?.map((line) => line.text) ||
            [],
        ),
      providerName: "Volcano OCR",
    };
  }
}

export class BingOcrProvider implements OcrProvider {
  name: OcrProviderName = "bing";

  async recognize(request: OcrRequest): Promise<OcrResult> {
    const row = request.providerRow;
    const apiKey = requireConfig(
      row?.apiKey,
      "error_bing_api_key_required",
      "Bing/Azure Vision API key is required.",
    );
    const baseUrl = requireConfig(
      row?.baseUrl,
      "error_bing_base_url_required",
      "Bing/Azure Vision endpoint base URL is required. Example: https://<resource>.cognitiveservices.azure.com",
    ).replace(/\/+$/, "");
    const response = await fetchWithTimeout(
      `${baseUrl}/vision/v3.2/ocr?language=unk&detectOrientation=true`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/octet-stream",
          "Ocp-Apim-Subscription-Key": apiKey,
        },
        body: readFileSync(request.imagePath),
      },
      request.settings.requestTimeoutMs,
    );
    const json = (await parseJsonResponse(response, "Bing/Azure Vision")) as {
      regions?: Array<{ lines?: Array<{ words?: Array<{ text?: string }> }> }>;
    };
    const lines =
      json.regions?.flatMap(
        (region) =>
          region.lines?.map((line) =>
            compactLines([
              (line.words || [])
                .map((word) => word.text)
                .filter(Boolean)
                .join(" "),
            ]),
          ) || [],
      ) || [];
    // Azure groups words into regions and lines; return one readable line each.
    return { text: compactLines(lines), providerName: "Bing/Azure Vision" };
  }
}

export class GoogleVisionOcrProvider implements OcrProvider {
  name: OcrProviderName = "google_vision";

  async recognize(request: OcrRequest): Promise<OcrResult> {
    const row = request.providerRow;
    const apiKey = requireConfig(
      row?.apiKey,
      "error_google_api_key_required",
      "Google Cloud Vision API key is required.",
    );
    const baseUrl = (
      row?.baseUrl?.trim() || "https://vision.googleapis.com/v1"
    ).replace(/\/+$/, "");
    const response = await fetchWithTimeout(
      `${baseUrl}/images:annotate?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requests: [
            {
              image: { content: imageBase64(request.imagePath) },
              features: [{ type: "TEXT_DETECTION" }],
            },
          ],
        }),
      },
      request.settings.requestTimeoutMs,
    );
    const json = (await parseJsonResponse(response, "Google Cloud Vision")) as {
      responses?: Array<{
        textAnnotations?: Array<{ description?: string }>;
        error?: { message?: string };
      }>;
    };
    const first = json.responses?.[0];
    if (first?.error?.message) {
      throw new I18nError(
        "error_provider_failed",
        { provider: "Google Cloud Vision", message: first.error.message },
        `Google Cloud Vision failed: ${first.error.message}`,
      );
    }
    return {
      text: first?.textAnnotations?.[0]?.description?.trim() || "",
      providerName: "Google Cloud Vision",
    };
  }
}

export class LlmVisionOcrProvider implements OcrProvider {
  name: OcrProviderName = "llm";

  async recognize(request: OcrRequest): Promise<OcrResult> {
    const row = request.providerRow;
    const apiKey = requireConfig(
      row?.apiKey,
      "error_llm_api_key_required",
      "OpenAI-compatible vision API key is required.",
    );
    const baseUrl = requireConfig(
      row?.baseUrl || "https://api.openai.com/v1",
      "error_llm_base_url_required",
      "OpenAI-compatible base URL is required.",
    ).replace(/\/+$/, "");
    const model = requireConfig(
      row?.model || "gpt-4o-mini",
      "error_llm_model_required",
      "Vision model name is required.",
    );
    const response = await fetchWithTimeout(
      `${baseUrl}/chat/completions`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          // Use the OpenAI-compatible vision message shape for custom providers.
          messages: [
            {
              role: "system",
              content:
                "You are an OCR engine. Extract all readable text from the image. Return only the text, preserving line breaks when useful.",
            },
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: `OCR this image file: ${basename(request.imagePath)}`,
                },
                {
                  type: "image_url",
                  image_url: { url: imageDataUrl(request.imagePath) },
                },
              ],
            },
          ],
          temperature: 0,
        }),
      },
      request.settings.requestTimeoutMs,
    );
    const json = (await parseJsonResponse(response, "Vision LLM")) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    return {
      text: json.choices?.[0]?.message?.content?.trim() || "",
      providerName: `Vision LLM (${model})`,
    };
  }
}

export class OfflineOcrProvider implements OcrProvider {
  name: OcrProviderName = "offline";

  async recognize(): Promise<OcrResult> {
    throw new I18nError(
      "error_offline_reserved",
      {},
      "Offline OCR is not implemented yet. This slot is reserved for a future built-in OCR engine.",
    );
  }
}

export function createOcrProvider(provider: OcrProviderName): OcrProvider {
  if (provider === "windows_app_sdk") return new WindowsAppSdkOcrProvider();
  if (provider === "snipping_tool") return new SnippingToolOcrProvider();
  if (provider === "wechat_qq") return new WechatQqOcrProvider();
  if (provider === "baidu") return new BaiduOcrProvider();
  if (provider === "youdao") return new YoudaoOcrProvider();
  if (provider === "volcano") return new VolcanoOcrProvider();
  if (provider === "bing") return new BingOcrProvider();
  if (provider === "google_vision") return new GoogleVisionOcrProvider();
  if (provider === "llm") return new LlmVisionOcrProvider();
  return new OfflineOcrProvider();
}

export function providerI18nKey(provider: OcrProviderName): string {
  if (provider === "windows_app_sdk") return "provider_windows_app_sdk";
  if (provider === "snipping_tool") return "provider_snipping_tool";
  if (provider === "wechat_qq") return "provider_wechat_qq";
  if (provider === "baidu") return "provider_baidu";
  if (provider === "youdao") return "provider_youdao";
  if (provider === "volcano") return "provider_volcano";
  if (provider === "bing") return "provider_bing";
  if (provider === "google_vision") return "provider_google_vision";
  if (provider === "llm") return "provider_llm";
  return "provider_offline";
}

export function providerDisplayName(
  provider: OcrProviderName,
  row?: OcrProviderSettingsRow,
): string {
  if (row?.name?.trim()) return row.name.trim();
  if (provider === "windows_app_sdk") return "Windows App SDK local OCR";
  if (provider === "snipping_tool") return "Snipping Tool OCR";
  if (provider === "wechat_qq") return "WeChat/QQ OCR";
  if (provider === "baidu") return "Baidu OCR";
  if (provider === "youdao") return "Youdao OCR";
  if (provider === "volcano") return "Volcano OCR";
  if (provider === "bing") return "Bing/Azure Vision";
  if (provider === "google_vision") return "Google Cloud Vision";
  if (provider === "llm") return "Vision LLM";
  return "Offline OCR";
}
