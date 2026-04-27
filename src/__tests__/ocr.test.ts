import { createOcrProvider, providerDisplayName } from "../ocr";

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
});
