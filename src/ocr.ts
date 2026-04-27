import { createHash, createHmac, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import {
  OcrProvider,
  OcrProviderName,
  OcrProviderSettingsRow,
  OcrRequest,
  OcrResult,
} from "./types";

function requireConfig(value: string | undefined, message: string): string {
  if (!value || value.trim() === "") {
    throw new Error(message);
  }
  return value.trim();
}

function imageBase64(path: string): string {
  return readFileSync(path).toString("base64");
}

function imageDataUrl(path: string): string {
  return `data:image/png;base64,${imageBase64(path)}`;
}

async function parseJsonResponse(
  response: Response,
  providerName: string,
): Promise<unknown> {
  const body = await response.text();
  if (!response.ok) {
    throw new Error(
      `${providerName} request failed with ${response.status}: ${body}`,
    );
  }
  try {
    return JSON.parse(body) as unknown;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${providerName} returned invalid JSON: ${message}`);
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
  return lines
    .map((line) => (line || "").trim())
    .filter(Boolean)
    .join("\n");
}

export class BaiduOcrProvider implements OcrProvider {
  name: OcrProviderName = "baidu";

  async recognize(request: OcrRequest): Promise<OcrResult> {
    const row = request.providerRow;
    const apiKey = requireConfig(row?.apiKey, "Baidu OCR API key is required.");
    const secretKey = requireConfig(
      row?.secretKey,
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
      "Baidu OCR did not return an access token.",
    );

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
      throw new Error(`Baidu OCR failed: ${json.error_msg}`);
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
      "Youdao OCR app key is required.",
    );
    const secretKey = requireConfig(
      row?.secretKey,
      "Youdao OCR secret key is required.",
    );
    const img = imageBase64(request.imagePath);
    const salt = randomUUID();
    const curtime = Math.floor(Date.now() / 1000).toString();
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
      throw new Error(`Youdao OCR failed with errorCode ${json.errorCode}.`);
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
      "Volcano OCR access key is required.",
    );
    const secretKey = requireConfig(
      row?.secretKey,
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
      throw new Error(
        `Volcano OCR failed: ${json.ResponseMetadata.Error.Message}`,
      );
    }
    if (json.code && json.code !== 10000) {
      throw new Error(`Volcano OCR failed: ${json.message || json.code}`);
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
      "Bing/Azure Vision API key is required.",
    );
    const baseUrl = requireConfig(
      row?.baseUrl,
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
    return { text: compactLines(lines), providerName: "Bing/Azure Vision" };
  }
}

export class GoogleVisionOcrProvider implements OcrProvider {
  name: OcrProviderName = "google_vision";

  async recognize(request: OcrRequest): Promise<OcrResult> {
    const row = request.providerRow;
    const apiKey = requireConfig(
      row?.apiKey,
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
      throw new Error(`Google Cloud Vision failed: ${first.error.message}`);
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
      "OpenAI-compatible vision API key is required.",
    );
    const baseUrl = requireConfig(
      row?.baseUrl || "https://api.openai.com/v1",
      "OpenAI-compatible base URL is required.",
    ).replace(/\/+$/, "");
    const model = requireConfig(
      row?.model || "gpt-4o-mini",
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
    throw new Error(
      "Offline OCR is not implemented yet. This slot is reserved for a future built-in OCR engine.",
    );
  }
}

export function createOcrProvider(provider: OcrProviderName): OcrProvider {
  if (provider === "baidu") return new BaiduOcrProvider();
  if (provider === "youdao") return new YoudaoOcrProvider();
  if (provider === "volcano") return new VolcanoOcrProvider();
  if (provider === "bing") return new BingOcrProvider();
  if (provider === "google_vision") return new GoogleVisionOcrProvider();
  if (provider === "llm") return new LlmVisionOcrProvider();
  return new OfflineOcrProvider();
}

export function providerDisplayName(
  provider: OcrProviderName,
  row?: OcrProviderSettingsRow,
): string {
  if (row?.name?.trim()) return row.name.trim();
  if (provider === "baidu") return "Baidu OCR";
  if (provider === "youdao") return "Youdao OCR";
  if (provider === "volcano") return "Volcano OCR";
  if (provider === "bing") return "Bing/Azure Vision";
  if (provider === "google_vision") return "Google Cloud Vision";
  if (provider === "llm") return "Vision LLM";
  return "Offline OCR";
}
