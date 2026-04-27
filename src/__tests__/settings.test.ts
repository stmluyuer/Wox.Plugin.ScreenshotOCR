import { normalizeOcrProvider, parseProviderRows } from "../settings";

describe("settings helpers", () => {
  test("normalizes provider names", () => {
    expect(normalizeOcrProvider("baidu")).toBe("baidu");
    expect(normalizeOcrProvider("bad")).toBe("baidu");
  });

  test("parses provider table rows", () => {
    const rows = parseProviderRows(
      JSON.stringify([
        { name: "Baidu", provider: "baidu", apiKey: "a" },
        { name: "Broken", provider: "bad", apiKey: "b" },
        null,
      ]),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].provider).toBe("baidu");
  });

  test("returns empty rows for invalid json", () => {
    expect(parseProviderRows("not json")).toEqual([]);
  });
});
