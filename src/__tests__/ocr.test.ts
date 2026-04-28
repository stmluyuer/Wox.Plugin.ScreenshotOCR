import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createOcrProvider, imageDataUrl, providerDisplayName } from "../ocr";

describe("OCR provider factory", () => {
  test("creates configured providers", () => {
    expect(createOcrProvider("baidu").name).toBe("baidu");
    expect(createOcrProvider("youdao").name).toBe("youdao");
    expect(createOcrProvider("volcano").name).toBe("volcano");
    expect(createOcrProvider("bing").name).toBe("bing");
    expect(createOcrProvider("google_vision").name).toBe("google_vision");
    expect(createOcrProvider("llm").name).toBe("llm");
    expect(createOcrProvider("windows_app_sdk").name).toBe("windows_app_sdk");
    expect(createOcrProvider("snipping_tool").name).toBe("snipping_tool");
    expect(createOcrProvider("wechat_qq").name).toBe("wechat_qq");
    expect(createOcrProvider("offline").name).toBe("offline");
  });

  test("uses provider row display name when present", () => {
    expect(providerDisplayName("baidu", { name: "My Baidu" })).toBe("My Baidu");
    expect(providerDisplayName("snipping_tool")).toBe("Snipping Tool OCR");
    expect(providerDisplayName("wechat_qq")).toBe("WeChat/QQ OCR");
    expect(providerDisplayName("offline")).toBe("Offline OCR");
  });

  test("preserves image media type in LLM data URLs", () => {
    const dir = mkdtempSync(join(tmpdir(), "wox-ocr-test-"));
    try {
      const jpegPath = join(dir, "photo.unknown");
      writeFileSync(jpegPath, Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00]));
      expect(imageDataUrl(jpegPath)).toMatch(/^data:image\/jpeg;base64,/);

      const webpPath = join(dir, "image.webp");
      writeFileSync(
        webpPath,
        Buffer.from("RIFF\x00\x00\x00\x00WEBPVP8 ", "binary"),
      );
      expect(imageDataUrl(webpPath)).toMatch(/^data:image\/webp;base64,/);

      const fallbackPath = join(dir, "scan.jpg");
      writeFileSync(fallbackPath, Buffer.from([0x01, 0x02, 0x03]));
      expect(imageDataUrl(fallbackPath)).toMatch(/^data:image\/jpeg;base64,/);

      const unknownPath = join(dir, "raw.bin");
      writeFileSync(unknownPath, Buffer.from([0x01, 0x02, 0x03]));
      expect(imageDataUrl(unknownPath)).toMatch(/^data:image\/png;base64,/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
