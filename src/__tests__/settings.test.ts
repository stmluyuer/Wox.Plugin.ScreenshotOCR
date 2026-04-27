import { normalizeOcrProvider, parseProviderRows } from "../settings";

describe("settings helpers", () => {
  test("normalizes provider names", () => {
    expect(normalizeOcrProvider("baidu")).toBe("baidu");
    expect(normalizeOcrProvider("snipping_tool")).toBe("snipping_tool");
    expect(normalizeOcrProvider("wechat_qq")).toBe("wechat_qq");
    expect(normalizeOcrProvider("bad")).toBe("windows_app_sdk");
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
});
