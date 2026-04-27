import { createOcrProvider, providerDisplayName } from "../ocr";

describe("OCR provider factory", () => {
  test("creates configured providers", () => {
    expect(createOcrProvider("baidu").name).toBe("baidu");
    expect(createOcrProvider("youdao").name).toBe("youdao");
    expect(createOcrProvider("volcano").name).toBe("volcano");
    expect(createOcrProvider("bing").name).toBe("bing");
    expect(createOcrProvider("google_vision").name).toBe("google_vision");
    expect(createOcrProvider("llm").name).toBe("llm");
    expect(createOcrProvider("offline").name).toBe("offline");
  });

  test("uses provider row display name when present", () => {
    expect(providerDisplayName("baidu", { name: "My Baidu" })).toBe("My Baidu");
    expect(providerDisplayName("offline")).toBe("Offline OCR");
  });
});
