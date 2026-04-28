import {
  loadSettings,
  normalizeFreeOcrProvider,
  normalizeOcrProvider,
  normalizeScreenshotCaptureMethod,
  parseProviderRows,
} from "../settings";

describe("settings helpers", () => {
  test("normalizes provider names", () => {
    expect(normalizeOcrProvider("baidu")).toBe("baidu");
    expect(normalizeOcrProvider("snipping_tool")).toBe("snipping_tool");
    expect(normalizeOcrProvider("wechat_qq")).toBe("wechat_qq");
    expect(normalizeOcrProvider("bad")).toBe("windows_app_sdk");
    expect(normalizeFreeOcrProvider("snipping_tool")).toBe("snipping_tool");
    expect(normalizeFreeOcrProvider("llm")).toBe("windows_app_sdk");
    expect(normalizeScreenshotCaptureMethod("wox_screenshot")).toBe(
      "wox_screenshot",
    );
    expect(normalizeScreenshotCaptureMethod("bad")).toBe("builtin");
  });

  test("parses provider table rows", () => {
    const rows = parseProviderRows(
      JSON.stringify([
        { name: "Baidu", provider: "baidu", apiKey: "a" },
        {
          name: "Snipping Tool",
          provider: "snipping_tool",
          command: "ocr.exe",
        },
        { name: "Broken", provider: "bad", apiKey: "b" },
        null,
      ]),
    );
    expect(rows).toHaveLength(2);
    expect(rows[0].provider).toBe("baidu");
    expect(rows[1].provider).toBe("snipping_tool");
  });

  test("returns empty rows for invalid json", () => {
    expect(parseProviderRows("not json")).toEqual([]);
  });

  test("loads no-configuration OCR service selection", async () => {
    const api = {
      GetSetting: jest.fn(async (_ctx, key: string) => {
        const values: Record<string, string> = {
          ocr_service_type: "free",
          default_free_ocr_provider: "wechat_qq",
          screenshot_capture_method: "wox_screenshot",
        };
        return values[key] || "";
      }),
    };

    const settings = await loadSettings(api as never, {} as never);

    expect(settings.defaultOcrProvider).toBe("wechat_qq");
    expect(settings.screenshotCaptureMethod).toBe("wox_screenshot");
  });

  test("loads large model OCR service selection", async () => {
    const api = {
      GetSetting: jest.fn(async (_ctx, key: string) => {
        const values: Record<string, string> = {
          ocr_service_type: "llm",
          default_free_ocr_provider: "wechat_qq",
        };
        return values[key] || "";
      }),
    };

    const settings = await loadSettings(api as never, {} as never);

    expect(settings.defaultOcrProvider).toBe("llm");
  });
});
